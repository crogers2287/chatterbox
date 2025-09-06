/**
 * Comprehensive tests for the Zustand persistence middleware
 */

import { create } from 'zustand';
import { persist, PersistConfig } from '../persistence';
import { StorageAdapter, StorageError, StorageErrorCode } from '../../storage/types';

// Mock storage adapter for testing
class MockStorageAdapter implements StorageAdapter {
  private storage = new Map<string, unknown>();
  private throwError: StorageError | null = null;

  async get<T>(key: string): Promise<T | null> {
    if (this.throwError) throw this.throwError;
    return (this.storage.get(key) as T) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.throwError) throw this.throwError;
    this.storage.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this.throwError) throw this.throwError;
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    if (this.throwError) throw this.throwError;
    this.storage.clear();
  }

  async getKeys(): Promise<string[]> {
    if (this.throwError) throw this.throwError;
    return Array.from(this.storage.keys());
  }

  async getStorageInfo() {
    return { used: 0, quota: 1000, available: 1000, percentUsed: 0 };
  }

  async isAvailable(): Promise<boolean> {
    return !this.throwError;
  }

  // Test helpers
  setError(error: StorageError | null) {
    this.throwError = error;
  }

  getStorageContent() {
    return new Map(this.storage);
  }

  clearStorage() {
    this.storage.clear();
  }
}

interface TestState {
  count: number;
  name: string;
  nested: { value: number };
  increment: () => void;
  setName: (name: string) => void;
  setNestedValue: (value: number) => void;
}

describe('Zustand Persistence Middleware', () => {
  let mockStorage: MockStorageAdapter;

  beforeEach(() => {
    mockStorage = new MockStorageAdapter();
    jest.clearAllMocks();
  });

  describe('Basic Persistence', () => {
    it('should persist and restore state', async () => {
      const config: PersistConfig<TestState> = {
        name: 'test-store',
        storage: mockStorage,
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      const store = useStore.getState();

      // Make changes
      store.increment();
      store.setName('test');
      store.setNestedValue(42);

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check storage
      const persistedData = await mockStorage.get('persist:test-store');
      expect(persistedData).toBeTruthy();
      expect(persistedData).toEqual({
        state: {
          count: 1,
          name: 'test',
          nested: { value: 42 },
        },
        version: 0,
        timestamp: expect.any(Number),
      });
    });

    it('should restore state on hydration', async () => {
      // Pre-populate storage
      const persistedState = {
        state: { count: 5, name: 'restored', nested: { value: 99 } },
        version: 0,
        timestamp: Date.now(),
      };
      await mockStorage.set('persist:test-restore', persistedState);

      const config: PersistConfig<TestState> = {
        name: 'test-restore',
        storage: mockStorage,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Wait for hydration
      await new Promise(resolve => setTimeout(resolve, 50));

      const state = useStore.getState();
      expect(state.count).toBe(5);
      expect(state.name).toBe('restored');
      expect(state.nested.value).toBe(99);
    });
  });

  describe('State Partializing', () => {
    it('should only persist selected state parts', async () => {
      const config: PersistConfig<TestState> = {
        name: 'test-partialize',
        storage: mockStorage,
        partialize: (state) => ({ count: state.count, name: state.name }),
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      const store = useStore.getState();
      store.increment();
      store.setName('partial');
      store.setNestedValue(123);

      // Wait for write
      await new Promise(resolve => setTimeout(resolve, 200));

      const persistedData = await mockStorage.get('persist:test-partialize');
      expect(persistedData).toEqual({
        state: {
          count: 1,
          name: 'partial',
          // nested should NOT be persisted
        },
        version: 0,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('State Migration', () => {
    it('should migrate state from older version', async () => {
      // Simulate old version data
      const oldData = {
        state: { count: 10, oldField: 'legacy' },
        version: 0,
        timestamp: Date.now() - 1000,
      };
      await mockStorage.set('persist:test-migrate', oldData);

      const config: PersistConfig<TestState> = {
        name: 'test-migrate',
        storage: mockStorage,
        version: 2,
        migrate: async (persistedState: any, version: number) => {
          if (version < 1) {
            // Add name field
            return { ...persistedState, name: 'migrated' };
          }
          if (version < 2) {
            // Add nested field
            return { ...persistedState, nested: { value: 0 } };
          }
          return persistedState;
        },
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Wait for hydration and migration
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = useStore.getState();
      expect(state.count).toBe(10);
      expect(state.name).toBe('migrated');
      expect(state.nested).toEqual({ value: 0 });
    });

    it('should handle migration errors gracefully', async () => {
      const oldData = {
        state: { count: 5 },
        version: 0,
        timestamp: Date.now(),
      };
      await mockStorage.set('persist:test-migrate-error', oldData);

      const onError = jest.fn();
      const config: PersistConfig<TestState> = {
        name: 'test-migrate-error',
        storage: mockStorage,
        version: 1,
        migrate: async () => {
          throw new Error('Migration failed');
        },
        onError,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Wait for hydration attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: StorageErrorCode.MIGRATION_FAILED,
        })
      );

      // Should fall back to initial state
      const state = useStore.getState();
      expect(state.count).toBe(0);
      expect(state.name).toBe('initial');
    });
  });

  describe('Custom Merge Function', () => {
    it('should use custom merge function', async () => {
      const persistedData = {
        state: { count: 10, name: 'persisted' },
        version: 0,
        timestamp: Date.now(),
      };
      await mockStorage.set('persist:test-merge', persistedData);

      const config: PersistConfig<TestState> = {
        name: 'test-merge',
        storage: mockStorage,
        merge: async (persistedState: any, currentState) => ({
          ...currentState,
          // Only restore count from persisted state
          count: persistedState.count,
          // Keep current name
          name: currentState.name,
          // Custom logic for nested
          nested: { value: persistedState.count * 2 },
        }),
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'current',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Wait for hydration
      await new Promise(resolve => setTimeout(resolve, 100));

      const state = useStore.getState();
      expect(state.count).toBe(10); // From persisted
      expect(state.name).toBe('current'); // From current
      expect(state.nested.value).toBe(20); // Custom logic
    });
  });

  describe('Error Handling', () => {
    it('should handle storage write errors', async () => {
      const onError = jest.fn();
      const config: PersistConfig<TestState> = {
        name: 'test-write-error',
        storage: mockStorage,
        onError,
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Simulate quota exceeded error
      mockStorage.setError(new StorageError('Quota exceeded', StorageErrorCode.QUOTA_EXCEEDED));

      const store = useStore.getState();
      store.increment();

      // Wait for write attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: StorageErrorCode.QUOTA_EXCEEDED,
        })
      );
    });

    it('should handle storage read errors', async () => {
      const onError = jest.fn();
      mockStorage.setError(new StorageError('Permission denied', StorageErrorCode.PERMISSION_DENIED));

      const config: PersistConfig<TestState> = {
        name: 'test-read-error',
        storage: mockStorage,
        onError,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      // Wait for hydration attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should fall back to initial state on read error
      const state = useStore.getState();
      expect(state.count).toBe(0);
      expect(state.name).toBe('initial');
    });
  });

  describe('Debounced Writes', () => {
    it('should debounce rapid state changes', async () => {
      const setSpy = jest.spyOn(mockStorage, 'set');

      const config: PersistConfig<TestState> = {
        name: 'test-debounce',
        storage: mockStorage,
        writeDelay: 100,
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      const store = useStore.getState();

      // Make rapid changes
      store.increment();
      store.increment();
      store.increment();
      store.setName('rapid');

      // Should not have written yet
      expect(setSpy).not.toHaveBeenCalled();

      // Wait for debounce delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should have written only once with final state
      expect(setSpy).toHaveBeenCalledTimes(1);
      const persistedData = await mockStorage.get('persist:test-debounce');
      expect(persistedData).toEqual({
        state: {
          count: 3,
          name: 'rapid',
          nested: { value: 0 },
        },
        version: 0,
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Version Management', () => {
    it('should track and return persisted version', async () => {
      const persistedData = {
        state: { count: 5 },
        version: 3,
        timestamp: Date.now(),
      };
      await mockStorage.set('persist:test-version', persistedData);

      const config: PersistConfig<TestState> = {
        name: 'test-version',
        storage: mockStorage,
        version: 3,
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      const store = useStore.getState();
      const version = await store.getPersistedVersion();
      expect(version).toBe(3);
    });
  });

  describe('State Clearing', () => {
    it('should clear persisted state', async () => {
      await mockStorage.set('persist:test-clear', { some: 'data' });

      const config: PersistConfig<TestState> = {
        name: 'test-clear',
        storage: mockStorage,
        skipHydration: true,
      };

      const useStore = create<TestState>()(
        persist(
          config,
          (set) => ({
            count: 0,
            name: 'initial',
            nested: { value: 0 },
            increment: () => set((state) => ({ count: state.count + 1 })),
            setName: (name) => set({ name }),
            setNestedValue: (value) => set((state) => ({ nested: { value } })),
            hasHydrated: false,
            rehydrate: async () => {},
            getPersistedVersion: async () => undefined,
            clearPersistedState: async () => {},
          })
        )
      );

      const store = useStore.getState();

      // Verify data exists
      expect(await mockStorage.get('persist:test-clear')).toBeTruthy();

      // Clear state
      await store.clearPersistedState();

      // Verify data is gone
      expect(await mockStorage.get('persist:test-clear')).toBeNull();
    });
  });
});

describe('Legacy Data Format Support', () => {
  let mockStorage: MockStorageAdapter;

  beforeEach(() => {
    mockStorage = new MockStorageAdapter();
  });

  it('should handle old string format', async () => {
    // Simulate old serialized format
    const oldStringData = JSON.stringify({
      state: { count: 8, name: 'legacy' },
      timestamp: Date.now() - 1000,
    });
    await mockStorage.set('persist:test-legacy-string', oldStringData);

    const config: PersistConfig<TestState> = {
      name: 'test-legacy-string',
      storage: mockStorage,
    };

    const useStore = create<TestState>()(
      persist(
        config,
        (set) => ({
          count: 0,
          name: 'initial',
          nested: { value: 0 },
          increment: () => set((state) => ({ count: state.count + 1 })),
          setName: (name) => set({ name }),
          setNestedValue: (value) => set((state) => ({ nested: { value } })),
          hasHydrated: false,
          rehydrate: async () => {},
          getPersistedVersion: async () => undefined,
          clearPersistedState: async () => {},
        })
      )
    );

    // Wait for hydration
    await new Promise(resolve => setTimeout(resolve, 100));

    const state = useStore.getState();
    expect(state.count).toBe(8);
    expect(state.name).toBe('legacy');
  });

  it('should handle very old direct state format', async () => {
    // Simulate very old format where state was stored directly
    const veryOldData = { count: 12, name: 'ancient' };
    await mockStorage.set('persist:test-ancient', veryOldData);

    const config: PersistConfig<TestState> = {
      name: 'test-ancient',
      storage: mockStorage,
    };

    const useStore = create<TestState>()(
      persist(
        config,
        (set) => ({
          count: 0,
          name: 'initial',
          nested: { value: 0 },
          increment: () => set((state) => ({ count: state.count + 1 })),
          setName: (name) => set({ name }),
          setNestedValue: (value) => set((state) => ({ nested: { value } })),
          hasHydrated: false,
          rehydrate: async () => {},
          getPersistedVersion: async () => undefined,
          clearPersistedState: async () => {},
        })
      )
    );

    // Wait for hydration
    await new Promise(resolve => setTimeout(resolve, 100));

    const state = useStore.getState();
    expect(state.count).toBe(12);
    expect(state.name).toBe('ancient');
  });
});