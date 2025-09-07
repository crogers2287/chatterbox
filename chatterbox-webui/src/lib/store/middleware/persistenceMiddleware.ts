import type { StateCreator } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { storageManager } from '../../storage';
import type { AppState } from '../types';

// Custom storage adapter that uses our StorageManager
const createStorageAdapter = (): StateStorage => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await storageManager.get<string>(name);
      return value;
    } catch (error) {
      console.error(`[Persistence] Failed to get item ${name}:`, error);
      return null;
    }
  },
  
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await storageManager.set(name, value);
    } catch (error) {
      console.error(`[Persistence] Failed to set item ${name}:`, error);
      throw error;
    }
  },
  
  removeItem: async (name: string): Promise<void> => {
    try {
      await storageManager.delete(name);
    } catch (error) {
      console.error(`[Persistence] Failed to remove item ${name}:`, error);
      throw error;
    }
  },
});

// Debounced auto-save implementation
class DebouncedAutoSave {
  private timeoutId: number | null = null;
  private lastSaveTime = 0;
  private readonly minInterval: number; // minimum time between saves in ms
  
  constructor(minIntervalSeconds: number = 2) {
    this.minInterval = minIntervalSeconds * 1000;
  }
  
  schedule(saveFunction: () => void, debounceMs: number = 500): void {
    // Clear existing timeout
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }
    
    // Check if we need to respect minimum interval
    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;
    
    if (timeSinceLastSave >= this.minInterval) {
      // Immediate save if enough time has passed
      this.executeSave(saveFunction);
    } else {
      // Schedule save with debounce
      this.timeoutId = window.setTimeout(() => {
        this.executeSave(saveFunction);
      }, debounceMs);
    }
  }
  
  private executeSave(saveFunction: () => void): void {
    try {
      saveFunction();
      this.lastSaveTime = Date.now();
    } catch (error) {
      console.error('[Persistence] Auto-save failed:', error);
    } finally {
      this.timeoutId = null;
    }
  }
  
  dispose(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

// Global auto-save instance
const autoSave = new DebouncedAutoSave();

// State serialization utilities
export const serializeState = (state: Partial<AppState>): Partial<AppState> => {
  // Remove non-serializable data and large binary data
  const serialized = { ...state };
  
  // Remove File objects and convert to references
  if (serialized.voiceReference) {
    // We'll handle voice reference separately in recovery system
    delete serialized.voiceReference;
  }
  
  // Remove blob URLs from chunks as they're not persistent
  if (serialized.chunks) {
    serialized.chunks = serialized.chunks.map(chunk => ({
      ...chunk,
      audioUrl: undefined, // Remove blob URLs, keep audioData if present
    }));
  }
  
  // Remove real-time generation state
  delete serialized.isGenerating;
  delete serialized.currentGeneratingId;
  delete serialized.systemStatus;
  
  // Remove large saved voices data (these are managed separately)
  if (serialized.savedVoices) {
    serialized.savedVoices = serialized.savedVoices.map(voice => ({
      ...voice,
      voice_file: undefined,
      voiceReferenceData: undefined, // Keep only metadata
    }));
  }
  
  return serialized;
};

export const deserializeState = (state: Partial<AppState>): Partial<AppState> => {
  const deserialized = { ...state };
  
  // Restore default values for non-persistent state
  if (!deserialized.systemStatus) {
    deserialized.systemStatus = {
      healthy: false,
      gpuAvailable: false,
      modelLoaded: false,
    };
  }
  
  deserialized.isGenerating = false;
  deserialized.currentGeneratingId = null;
  deserialized.voiceReference = null;
  
  return deserialized;
};

// Persistence configuration
export const persistenceConfig = {
  name: 'chatterbox-store',
  storage: createJSONStorage(() => createStorageAdapter()),
  
  // Only persist specific parts of the state
  partialize: (state: AppState) => ({
    // Core app state
    chunks: state.chunks,
    parameters: state.parameters,
    ttsEngine: state.ttsEngine,
    useStreaming: state.useStreaming,
    
    // Sessions (without heavy data)
    sessions: state.sessions,
    currentSessionId: state.currentSessionId,
    
    // Batch items
    batchItems: state.batchItems,
    
    // Recovery settings
    ...('autoSaveEnabled' in state ? { 
      autoSaveEnabled: state.autoSaveEnabled,
      autoSaveInterval: state.autoSaveInterval 
    } : {}),
  }),
  
  // Version for migration support
  version: 1,
  
  // Migration function for future versions
  migrate: (persistedState: any, version: number) => {
    console.log(`[Persistence] Migrating state from version ${version}`);
    
    if (version === 0) {
      // Migration from version 0 to 1
      // Handle any breaking changes here
      return persistedState;
    }
    
    return persistedState;
  },
  
  // Custom serialization/deserialization
  serialize: (state: { state: AppState; version: number }) => {
    const serializedState = serializeState(state.state);
    return JSON.stringify({
      state: serializedState,
      version: state.version,
    });
  },
  
  deserialize: (str: string) => {
    const parsed = JSON.parse(str);
    const deserializedState = deserializeState(parsed.state);
    return {
      state: deserializedState,
      version: parsed.version,
    };
  },
  
  // Skip hydration for certain conditions
  skipHydration: false,
  
  // Called after hydration is complete
  onRehydrateStorage: () => {
    console.log('[Persistence] Starting state rehydration...');
    
    return (state, error) => {
      if (error) {
        console.error('[Persistence] Rehydration failed:', error);
      } else {
        console.log('[Persistence] State rehydrated successfully');
        
        // Trigger recovery session discovery after rehydration
        if (state && 'discoverRecoverySessions' in state) {
          (state as any).discoverRecoverySessions();
        }
      }
    };
  },
};

// Create the persistence middleware
export const createPersistenceMiddleware = <T extends AppState>(
  stateCreator: StateCreator<T, [], [], T>
) => {
  return persist(stateCreator, persistenceConfig as any);
};

// Auto-save middleware
export const createAutoSaveMiddleware = <T extends AppState>(
  stateCreator: StateCreator<T, [], [], T>
) => {
  return (set: any, get: any, api: any) => {
    const originalSet = set;
    
    const enhancedSet = (
      partial: T | Partial<T> | ((state: T) => T | Partial<T>),
      replace?: boolean | undefined
    ) => {
      // Call the original set function
      originalSet(partial, replace);
      
      // Schedule auto-save
      const state = get();
      if ('autoSaveEnabled' in state && state.autoSaveEnabled) {
        const interval = 'autoSaveInterval' in state ? state.autoSaveInterval as number : 2;
        
        autoSave.schedule(() => {
          // Trigger persistence save
          if ('persist' in api && api.persist && 'flush' in api.persist) {
            (api.persist as any).flush();
            
            // Update last save time in recovery slice
            if ('lastAutoSaveTime' in state) {
              originalSet({ lastAutoSaveTime: Date.now() } as any);
            }
          }
        }, interval * 1000 * 0.25); // Use 25% of interval as debounce time
      }
    };
    
    return stateCreator(enhancedSet, get, api);
  };
};

// Cleanup function
export const disposePersistenceMiddleware = () => {
  autoSave.dispose();
};