/**
 * Zustand persistence middleware with browser storage integration
 * Provides automatic state persistence, hydration, and migration support
 */

import { StateCreator, StoreMutatorIdentifier, Mutate, StoreApi } from 'zustand';
import { StorageAdapter, StorageError, StorageErrorCode } from '../storage/types';
import { createStorageManager } from '../storage';

export interface PersistConfig<T> {
  /** Storage key name */
  name: string;
  
  /** Storage adapter (optional, defaults to storage manager) */
  storage?: StorageAdapter;
  
  /** Function to select which parts of state to persist */
  partialize?: (state: T) => Partial<T>;
  
  /** State version for migration support */
  version?: number;
  
  /** Migration function for handling version changes */
  migrate?: (persistedState: unknown, version: number) => T | Promise<T>;
  
  /** Custom merge function for combining persisted and current state */
  merge?: (persistedState: unknown, currentState: T) => T | Promise<T>;
  
  /** Skip hydration on store initialization */
  skipHydration?: boolean;
  
  /** Debounce time for state writes in milliseconds */
  writeDelay?: number;
  
  /** Enable compression for large state objects */
  compress?: boolean;
  
  /** Custom serialization */
  serialize?: (state: Partial<T>) => string;
  
  /** Custom deserialization */
  deserialize?: (str: string) => Partial<T>;
  
  /** Error handling callback */
  onError?: (error: StorageError) => void;
  
  /** Successful rehydration callback */
  onRehydrateStorage?: (state: T | undefined, error: Error | undefined) => void;
}

export interface PersistState {
  /** Whether hydration has completed */
  hasHydrated: boolean;
  
  /** Force rehydrate state from storage */
  rehydrate: () => Promise<void>;
  
  /** Get persisted state version */
  getPersistedVersion: () => Promise<number | undefined>;
  
  /** Clear persisted state */
  clearPersistedState: () => Promise<void>;
}

type PersistListener<T> = (state: T) => void;

type Write<T extends Record<string, unknown>, U extends Record<string, unknown>> = Omit<T, keyof U> & U;

type PersistImpl = <
  T extends Record<string, unknown>,
  A,
  B = T
>(
  config: PersistConfig<T>,
  storeApi: StateCreator<T & PersistState, [], [], A>,
) => StateCreator<T & PersistState, [], [], A & PersistState>;

// Global storage manager instance
let globalStorage: StorageAdapter | null = null;

const getStorage = (): StorageAdapter => {
  if (!globalStorage) {
    globalStorage = createStorageManager({
      dbName: 'chatterbox-state',
      version: 1,
      keyPrefix: 'persist:',
      syncAcrossTabs: true,
    });
  }
  return globalStorage;
};

// Serialization helpers
const defaultSerialize = <T>(state: Partial<T>): string => {
  return JSON.stringify({
    state,
    timestamp: Date.now(),
  });
};

const defaultDeserialize = <T>(str: string): { state: Partial<T>; timestamp: number } => {
  try {
    const parsed = JSON.parse(str);
    return {
      state: parsed.state || parsed, // Handle old format
      timestamp: parsed.timestamp || Date.now(),
    };
  } catch {
    throw new StorageError('Invalid persisted data format', StorageErrorCode.INVALID_DATA);
  }
};

// Default merge function
const defaultMerge = <T>(persistedState: unknown, currentState: T): T => {
  if (typeof persistedState !== 'object' || persistedState === null) {
    return currentState;
  }
  
  // Deep merge with current state taking precedence for functions
  return {
    ...currentState,
    ...persistedState,
  } as T;
};

// Debounced write helper
const createDebouncedWrite = (fn: () => Promise<void>, delay: number) => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(async () => {
      try {
        await fn();
      } catch (error) {
        console.error('Debounced write failed:', error);
      }
    }, delay);
  };
};

// Migration helper
const migrateState = async <T>(
  persistedData: { state: Partial<T>; timestamp: number; version?: number },
  currentVersion: number,
  migrate?: (persistedState: unknown, version: number) => T | Promise<T>
): Promise<Partial<T>> => {
  const persistedVersion = persistedData.version || 0;
  
  if (persistedVersion === currentVersion) {
    return persistedData.state;
  }
  
  if (!migrate) {
    console.warn(
      `State version mismatch (persisted: ${persistedVersion}, current: ${currentVersion}) but no migrate function provided. Using persisted state as-is.`
    );
    return persistedData.state;
  }
  
  try {
    console.log(`Migrating state from version ${persistedVersion} to ${currentVersion}`);
    const migratedState = await migrate(persistedData.state, persistedVersion);
    
    // Ensure migrated state is partial
    if (typeof migratedState === 'object' && migratedState !== null) {
      return migratedState as Partial<T>;
    }
    
    throw new Error('Migration returned invalid state');
  } catch (error) {
    throw new StorageError(
      `State migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      StorageErrorCode.MIGRATION_FAILED,
      error instanceof Error ? error : undefined
    );
  }
};

const persistImpl: PersistImpl = (config, storeApi) => (set, get, store) => {
  const {
    name,
    storage = getStorage(),
    partialize = (state) => state,
    version = 0,
    migrate,
    merge = defaultMerge,
    skipHydration = false,
    writeDelay = 100,
    compress = false,
    serialize = defaultSerialize,
    deserialize = defaultDeserialize,
    onError,
    onRehydrateStorage,
  } = config;
  
  let hasHydrated = false;
  const listeners = new Set<PersistListener<ReturnType<typeof get>>>();
  
  // Storage key
  const storageKey = `persist:${name}`;
  
  // Write state to storage
  const writeToStorage = async () => {
    try {
      const state = get();
      const stateToStore = partialize(state);
      const serializedState = serialize(stateToStore);
      
      // Store with version and timestamp
      const dataToStore = {
        state: stateToStore,
        version,
        timestamp: Date.now(),
      };
      
      await storage.set(storageKey, compress ? JSON.stringify(dataToStore) : dataToStore);
    } catch (error) {
      const storageError = error instanceof StorageError 
        ? error 
        : new StorageError(
            `Failed to write state: ${error instanceof Error ? error.message : 'Unknown error'}`,
            StorageErrorCode.UNKNOWN,
            error instanceof Error ? error : undefined
          );
      
      if (onError) {
        onError(storageError);
      } else {
        console.error('Persist write error:', storageError);
      }
    }
  };
  
  // Debounced write
  const debouncedWrite = createDebouncedWrite(writeToStorage, writeDelay);
  
  // Read state from storage
  const readFromStorage = async (): Promise<Partial<ReturnType<typeof get>> | null> => {
    try {
      const persistedData = await storage.get<{
        state: Partial<ReturnType<typeof get>>;
        version?: number;
        timestamp: number;
      }>(storageKey);
      
      if (!persistedData) {
        return null;
      }
      
      // Handle different data formats
      let normalizedData: { state: Partial<ReturnType<typeof get>>; version?: number; timestamp: number };
      
      if (typeof persistedData === 'string') {
        // Compressed or old string format
        const parsed = deserialize(persistedData);
        normalizedData = {
          state: parsed.state,
          timestamp: parsed.timestamp,
          version: 0, // Assume version 0 for old format
        };
      } else if (persistedData.state) {
        // New object format
        normalizedData = persistedData;
      } else {
        // Legacy format - the data is the state itself
        normalizedData = {
          state: persistedData as Partial<ReturnType<typeof get>>,
          timestamp: Date.now(),
          version: 0,
        };
      }
      
      // Apply migration if needed
      const migratedState = await migrateState(normalizedData, version, migrate);
      
      return migratedState;
    } catch (error) {
      const storageError = error instanceof StorageError 
        ? error 
        : new StorageError(
            `Failed to read state: ${error instanceof Error ? error.message : 'Unknown error'}`,
            StorageErrorCode.UNKNOWN,
            error instanceof Error ? error : undefined
          );
      
      if (onError) {
        onError(storageError);
      } else {
        console.error('Persist read error:', storageError);
      }
      
      return null;
    }
  };
  
  // Rehydrate state
  const rehydrate = async () => {
    try {
      const persistedState = await readFromStorage();
      
      if (persistedState) {
        const currentState = get();
        const mergedState = await merge(persistedState, currentState);
        
        set(mergedState, false); // Don't trigger persistence on hydration
        
        if (onRehydrateStorage) {
          onRehydrateStorage(mergedState, undefined);
        }
      }
      
      hasHydrated = true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown hydration error');
      
      if (onRehydrateStorage) {
        onRehydrateStorage(undefined, err);
      } else {
        console.error('Rehydration failed:', err);
      }
      
      hasHydrated = true; // Mark as hydrated even if failed
    }
  };
  
  // Get persisted version
  const getPersistedVersion = async (): Promise<number | undefined> => {
    try {
      const persistedData = await storage.get<{ version?: number }>(storageKey);
      return persistedData?.version;
    } catch {
      return undefined;
    }
  };
  
  // Clear persisted state
  const clearPersistedState = async () => {
    try {
      await storage.delete(storageKey);
    } catch (error) {
      const storageError = error instanceof StorageError 
        ? error 
        : new StorageError(
            `Failed to clear state: ${error instanceof Error ? error.message : 'Unknown error'}`,
            StorageErrorCode.UNKNOWN,
            error instanceof Error ? error : undefined
          );
      
      if (onError) {
        onError(storageError);
      } else {
        console.error('Clear state error:', storageError);
      }
    }
  };
  
  // Initialize store with persistence
  const api = storeApi(
    (...args) => {
      set(...args);
      
      // Trigger persistence after state changes (but not during hydration)
      if (hasHydrated) {
        debouncedWrite();
      }
    },
    get,
    {
      ...store,
      persist: {
        hasHydrated: () => hasHydrated,
        rehydrate,
        getPersistedVersion,
        clearPersistedState,
      },
    } as any
  );
  
  // Add persist state methods
  const persistApi = {
    ...api,
    hasHydrated: () => hasHydrated,
    rehydrate,
    getPersistedVersion,
    clearPersistedState,
  };
  
  // Auto-hydrate unless skipped
  if (!skipHydration) {
    // Defer hydration to next tick to ensure store is fully initialized
    Promise.resolve().then(() => {
      rehydrate().catch(console.error);
    });
  }
  
  return persistApi;
};

type Persist = <
  T extends Record<string, unknown>,
  U extends Record<string, unknown>
>(
  config: PersistConfig<T>,
  storeApi: StateCreator<T, [], [], U>
) => StateCreator<T & PersistState, [], [], U & PersistState>;

// Export the persist middleware
export const persist = persistImpl as unknown as Persist;

// Utility to create a persisted store
export const createPersistedStore = <T extends Record<string, unknown>>(
  storeCreator: StateCreator<T & PersistState>,
  persistConfig: PersistConfig<T>
) => {
  return persist(persistConfig, storeCreator);
};

// Export commonly used types
export type { StorageAdapter };

// Re-export storage manager for convenience
export { createStorageManager } from '../storage';