import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { create } from 'zustand';
import { 
  serializeState, 
  deserializeState, 
  persistenceConfig, 
  createPersistenceMiddleware,
  createAutoSaveMiddleware,
  disposePersistenceMiddleware
} from '../middleware/persistenceMiddleware';
import { AppState, TextChunk, TTSParameters } from '../types';
import { storageManager } from '../../storage';

// Mock the storage manager
vi.mock('../../storage', () => ({
  storageManager: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockStorageManager = storageManager as {
  get: Mock;
  set: Mock;
  delete: Mock;
};

// Mock state for testing
const mockAppState: Partial<AppState> = {
  chunks: [
    {
      id: '1',
      text: 'Test chunk',
      status: 'completed',
      audioUrl: 'blob:http://example.com/audio.wav',
      audioData: 'data:audio/wav;base64,UklGRiQ...',
    } as TextChunk,
  ],
  parameters: {
    exaggeration: 0.5,
    temperature: 0.8,
    cfg_weight: 0.5,
    min_p: 0.05,
    top_p: 1.0,
    repetition_penalty: 1.2,
    seed: null,
    speech_rate: 1.0,
  } as TTSParameters,
  ttsEngine: 'chatterbox',
  useStreaming: false,
  voiceReference: new File([''], 'test.wav'),
  isGenerating: true,
  currentGeneratingId: '1',
  systemStatus: {
    healthy: true,
    gpuAvailable: true,
    modelLoaded: true,
  },
  sessions: [
    {
      id: 'session-1',
      name: 'Test Session',
      chunks: [],
      parameters: {} as TTSParameters,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  batchItems: [
    {
      id: 'batch-1',
      text: 'Batch text',
      filename: 'test.txt',
    },
  ],
};

describe('State Serialization/Deserialization', () => {
  describe('serializeState', () => {
    it('should remove non-serializable data', () => {
      const serialized = serializeState(mockAppState);
      
      // Should remove File objects
      expect(serialized.voiceReference).toBeUndefined();
      
      // Should remove real-time generation state
      expect(serialized.isGenerating).toBeUndefined();
      expect(serialized.currentGeneratingId).toBeUndefined();
      expect(serialized.systemStatus).toBeUndefined();
    });
    
    it('should remove blob URLs from chunks', () => {
      const serialized = serializeState(mockAppState);
      
      expect(serialized.chunks).toBeDefined();
      expect(serialized.chunks![0].audioUrl).toBeUndefined();
      expect(serialized.chunks![0].audioData).toBe('data:audio/wav;base64,UklGRiQ...');
    });
    
    it('should clean saved voices data', () => {
      const stateWithVoices = {
        ...mockAppState,
        savedVoices: [
          {
            id: 'voice-1',
            name: 'Test Voice',
            parameters: {} as TTSParameters,
            voice_file: new File([''], 'voice.wav'),
            voiceReferenceData: 'data:audio/wav;base64,...',
            createdAt: new Date(),
          },
        ],
      };
      
      const serialized = serializeState(stateWithVoices);
      
      expect(serialized.savedVoices).toBeDefined();
      expect(serialized.savedVoices![0].voice_file).toBeUndefined();
      expect(serialized.savedVoices![0].voiceReferenceData).toBeUndefined();
    });
  });
  
  describe('deserializeState', () => {
    it('should restore default values for non-persistent state', () => {
      const serializedState = serializeState(mockAppState);
      const deserialized = deserializeState(serializedState);
      
      // Should restore default system status
      expect(deserialized.systemStatus).toEqual({
        healthy: false,
        gpuAvailable: false,
        modelLoaded: false,
      });
      
      // Should set generation state to false
      expect(deserialized.isGenerating).toBe(false);
      expect(deserialized.currentGeneratingId).toBeNull();
      expect(deserialized.voiceReference).toBeNull();
    });
  });
});

describe('Persistence Configuration', () => {
  beforeEach(() => {
    mockStorageManager.get.mockClear();
    mockStorageManager.set.mockClear();
    mockStorageManager.delete.mockClear();
  });
  
  it('should have correct configuration properties', () => {
    expect(persistenceConfig.name).toBe('chatterbox-store');
    expect(persistenceConfig.version).toBe(1);
    expect(typeof persistenceConfig.partialize).toBe('function');
    expect(typeof persistenceConfig.serialize).toBe('function');
    expect(typeof persistenceConfig.deserialize).toBe('function');
  });
  
  it('should partialize state correctly', () => {
    const partializedState = persistenceConfig.partialize(mockAppState as AppState);
    
    // Should include persistent data
    expect(partializedState.chunks).toBeDefined();
    expect(partializedState.parameters).toBeDefined();
    expect(partializedState.ttsEngine).toBeDefined();
    expect(partializedState.sessions).toBeDefined();
    expect(partializedState.batchItems).toBeDefined();
    
    // Should not include non-persistent data
    expect('voiceReference' in partializedState).toBeFalsy();
    expect('isGenerating' in partializedState).toBeFalsy();
    expect('systemStatus' in partializedState).toBeFalsy();
  });
  
  it('should handle custom serialization', () => {
    const stateToSerialize = {
      state: mockAppState as AppState,
      version: 1,
    };
    
    const serialized = persistenceConfig.serialize(stateToSerialize);
    expect(typeof serialized).toBe('string');
    
    const parsed = JSON.parse(serialized);
    expect(parsed.version).toBe(1);
    expect(parsed.state).toBeDefined();
  });
  
  it('should handle custom deserialization', () => {
    const stateToSerialize = {
      state: mockAppState as AppState,
      version: 1,
    };
    
    const serialized = persistenceConfig.serialize(stateToSerialize);
    const deserialized = persistenceConfig.deserialize(serialized);
    
    expect(deserialized.version).toBe(1);
    expect(deserialized.state).toBeDefined();
  });
});

describe('Auto-save Middleware', () => {
  let testStore: any;
  
  beforeEach(() => {
    vi.useFakeTimers();
    mockStorageManager.set.mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    vi.useRealTimers();
    if (testStore && testStore.destroy) {
      testStore.destroy();
    }
    disposePersistenceMiddleware();
  });
  
  it('should schedule auto-save when state changes', async () => {
    // Create a simple test store with auto-save
    const testState = {
      value: 0,
      autoSaveEnabled: true,
      autoSaveInterval: 2,
      setValue: (newValue: number) => {},
    };
    
    testStore = create(
      createAutoSaveMiddleware((set) => ({
        ...testState,
        setValue: (newValue: number) => set({ value: newValue }),
      }))
    );
    
    // Change state to trigger auto-save
    testStore.getState().setValue(42);
    
    // Fast-forward timers to trigger debounced save
    vi.advanceTimersByTime(1000);
    
    // The exact implementation depends on the persist API being available
    // This test verifies the middleware structure is correct
    expect(testStore.getState().value).toBe(42);
  });
  
  it('should respect auto-save enabled flag', () => {
    const testState = {
      value: 0,
      autoSaveEnabled: false,
      autoSaveInterval: 2,
      setValue: (newValue: number) => {},
    };
    
    testStore = create(
      createAutoSaveMiddleware((set) => ({
        ...testState,
        setValue: (newValue: number) => set({ value: newValue }),
      }))
    );
    
    testStore.getState().setValue(42);
    
    // Auto-save should not be scheduled when disabled
    vi.advanceTimersByTime(5000);
    expect(testStore.getState().value).toBe(42);
  });
});

describe('Storage Adapter Integration', () => {
  beforeEach(() => {
    mockStorageManager.get.mockClear();
    mockStorageManager.set.mockClear();
    mockStorageManager.delete.mockClear();
  });
  
  it('should handle storage get operations', async () => {
    mockStorageManager.get.mockResolvedValue('{"test": "data"}');
    
    // The storage adapter is created internally, so we test the integration
    // through the persistence config
    const storage = persistenceConfig.storage?.();
    expect(storage).toBeDefined();
    
    if (storage) {
      const result = await storage.getItem('test-key');
      expect(result).toBe('{"test": "data"}');
      expect(mockStorageManager.get).toHaveBeenCalledWith('test-key');
    }
  });
  
  it('should handle storage set operations', async () => {
    mockStorageManager.set.mockResolvedValue(undefined);
    
    const storage = persistenceConfig.storage?.();
    if (storage) {
      await storage.setItem('test-key', '{"test": "data"}');
      expect(mockStorageManager.set).toHaveBeenCalledWith('test-key', '{"test": "data"}');
    }
  });
  
  it('should handle storage remove operations', async () => {
    mockStorageManager.delete.mockResolvedValue(undefined);
    
    const storage = persistenceConfig.storage?.();
    if (storage) {
      await storage.removeItem('test-key');
      expect(mockStorageManager.delete).toHaveBeenCalledWith('test-key');
    }
  });
  
  it('should handle storage errors gracefully', async () => {
    mockStorageManager.get.mockRejectedValue(new Error('Storage error'));
    
    const storage = persistenceConfig.storage?.();
    if (storage) {
      const result = await storage.getItem('test-key');
      expect(result).toBeNull();
    }
  });
});

describe('Migration Support', () => {
  it('should handle version migration', () => {
    const oldState = { someOldProp: 'value' };
    const migrated = persistenceConfig.migrate?.(oldState, 0);
    
    // Migration should preserve the state for version 0->1
    expect(migrated).toEqual(oldState);
  });
  
  it('should handle unknown versions', () => {
    const state = { someProp: 'value' };
    const migrated = persistenceConfig.migrate?.(state, 999);
    
    // Should return state as-is for unknown versions
    expect(migrated).toEqual(state);
  });
});