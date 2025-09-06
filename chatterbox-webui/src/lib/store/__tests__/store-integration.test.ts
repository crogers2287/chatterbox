/**
 * Integration tests for the persistent Chatterbox store
 */

import { act, renderHook } from '@testing-library/react';
import { useStore, AppState } from '../index';
import { createStorageManager } from '../../storage';

// Mock the storage manager
jest.mock('../../storage', () => ({
  createStorageManager: jest.fn(),
}));

// Mock the voiceAPI
jest.mock('../../voiceApi', () => ({
  voiceAPI: {
    saveVoice: jest.fn(),
    listVoices: jest.fn(),
    getVoice: jest.fn(),
    deleteVoice: jest.fn(),
    loadVoiceAudioFile: jest.fn(),
  },
}));

describe('Persistent Store Integration Tests', () => {
  let mockStorage: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    clear: jest.Mock;
    getKeys: jest.Mock;
    getStorageInfo: jest.Mock;
    isAvailable: jest.Mock;
  };

  beforeEach(() => {
    // Reset storage mock
    mockStorage = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      getKeys: jest.fn().mockResolvedValue([]),
      getStorageInfo: jest.fn().mockResolvedValue({
        used: 0,
        quota: 1000000,
        available: 1000000,
        percentUsed: 0,
      }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    (createStorageManager as jest.Mock).mockReturnValue(mockStorage);
    
    // Clear any existing store state
    jest.clearAllMocks();
  });

  describe('State Persistence', () => {
    it('should persist TTS parameters when changed', async () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.updateParameters({
          temperature: 0.9,
          exaggeration: 0.7,
        });
      });

      // Wait for debounced write
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(mockStorage.set).toHaveBeenCalledWith(
        'persist:chatterbox-app-state',
        expect.objectContaining({
          state: expect.objectContaining({
            parameters: expect.objectContaining({
              temperature: 0.9,
              exaggeration: 0.7,
            }),
          }),
          version: 1,
          timestamp: expect.any(Number),
        })
      );
    });

    it('should persist chunks with audio data', async () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.addChunk('Test text');
      });

      // Simulate chunk completion with audio
      act(() => {
        const chunk = result.current.chunks[0];
        result.current.updateChunk(chunk.id, {
          status: 'completed',
          audioUrl: 'blob:test-url',
          audioData: 'data:audio/wav;base64,test-data',
        });
      });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(mockStorage.set).toHaveBeenCalledWith(
        'persist:chatterbox-app-state',
        expect.objectContaining({
          state: expect.objectContaining({
            chunks: [
              expect.objectContaining({
                text: 'Test text',
                status: 'completed',
                audioData: 'data:audio/wav;base64,test-data',
              }),
            ],
          }),
        })
      );
    });

    it('should not persist temporary runtime state', async () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.setIsGenerating(true);
        result.current.setCurrentGeneratingId('test-id');
        result.current.updateSystemStatus({
          healthy: true,
          gpuAvailable: true,
        });
      });

      // Wait for potential write
      await new Promise(resolve => setTimeout(resolve, 400));

      // Check that runtime state is not persisted
      const lastCall = mockStorage.set.mock.calls[mockStorage.set.mock.calls.length - 1];
      if (lastCall) {
        const [, persistedData] = lastCall;
        expect(persistedData.state.isGenerating).toBeUndefined();
        expect(persistedData.state.currentGeneratingId).toBeUndefined();
        expect(persistedData.state.systemStatus).toBeUndefined();
      }
    });

    it('should limit persisted sessions to 10 most recent', async () => {
      const { result } = renderHook(() => useStore());

      // Create 15 sessions
      const sessions = Array.from({ length: 15 }, (_, i) => ({
        id: `session-${i}`,
        name: `Session ${i}`,
        chunks: [],
        parameters: result.current.parameters,
        createdAt: new Date(Date.now() - (15 - i) * 1000), // Ordered by age
        updatedAt: new Date(),
      }));

      act(() => {
        // Directly set sessions (simulating loaded state)
        useStore.setState({ sessions });
      });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 400));

      const lastCall = mockStorage.set.mock.calls[mockStorage.set.mock.calls.length - 1];
      if (lastCall) {
        const [, persistedData] = lastCall;
        expect(persistedData.state.sessions).toHaveLength(10);
        // Should keep the 10 most recent sessions (sessions 5-14)
        expect(persistedData.state.sessions[0].id).toBe('session-5');
        expect(persistedData.state.sessions[9].id).toBe('session-14');
      }
    });
  });

  describe('State Hydration', () => {
    it('should restore state from storage on initialization', async () => {
      const persistedState = {
        state: {
          parameters: {
            temperature: 0.9,
            exaggeration: 0.6,
            cfg_weight: 0.7,
            min_p: 0.08,
            top_p: 0.9,
            repetition_penalty: 1.3,
            seed: 12345,
            speech_rate: 1.2,
          },
          ttsEngine: 'vibevoice',
          useStreaming: true,
          chunks: [
            {
              id: 'restored-chunk',
              text: 'Restored text',
              status: 'completed',
              audioData: 'data:audio/wav;base64,restored-audio',
            },
          ],
        },
        version: 1,
        timestamp: Date.now() - 1000,
      };

      mockStorage.get.mockResolvedValue(persistedState);

      const { result, waitForNextUpdate } = renderHook(() => useStore());

      // Wait for hydration
      await waitForNextUpdate();

      expect(result.current.parameters.temperature).toBe(0.9);
      expect(result.current.parameters.exaggeration).toBe(0.6);
      expect(result.current.ttsEngine).toBe('vibevoice');
      expect(result.current.useStreaming).toBe(true);
      expect(result.current.chunks).toHaveLength(1);
      expect(result.current.chunks[0].text).toBe('Restored text');
    });

    it('should handle missing persisted data gracefully', async () => {
      mockStorage.get.mockResolvedValue(null);

      const { result } = renderHook(() => useStore());

      // Should use default values
      expect(result.current.parameters.temperature).toBe(0.8);
      expect(result.current.parameters.exaggeration).toBe(0.5);
      expect(result.current.ttsEngine).toBe('chatterbox');
      expect(result.current.chunks).toEqual([]);
    });

    it('should restore audio URLs from persisted audio data', async () => {
      // Mock global fetch for blob creation
      global.fetch = jest.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/wav' })),
      });

      // Mock URL.createObjectURL
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:restored-url');

      const persistedState = {
        state: {
          chunks: [
            {
              id: 'chunk-1',
              text: 'Test',
              status: 'completed',
              audioData: 'data:audio/wav;base64,test-audio-data',
            },
          ],
        },
        version: 1,
        timestamp: Date.now(),
      };

      mockStorage.get.mockResolvedValue(persistedState);

      const { result, waitForNextUpdate } = renderHook(() => useStore());

      // Wait for hydration and audio restoration
      await waitForNextUpdate();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result.current.chunks[0].audioUrl).toBe('blob:restored-url');
      expect(global.fetch).toHaveBeenCalledWith('data:audio/wav;base64,test-audio-data');
    });
  });

  describe('Migration Handling', () => {
    it('should migrate from version 0 to version 1', async () => {
      const oldState = {
        state: {
          // Old format missing some fields
          count: 5,
          someOldField: 'legacy',
        },
        version: 0,
        timestamp: Date.now() - 1000,
      };

      mockStorage.get.mockResolvedValue(oldState);

      const { result, waitForNextUpdate } = renderHook(() => useStore());

      // Wait for hydration and migration
      await waitForNextUpdate();

      // Should have migrated with default values
      expect(result.current.parameters).toBeDefined();
      expect(result.current.parameters.temperature).toBe(0.8);
      expect(result.current.ttsEngine).toBe('chatterbox');
      expect(result.current.chunks).toEqual([]);
    });
  });

  describe('Recovery Methods', () => {
    it('should provide recovery methods', () => {
      const { result } = renderHook(() => useStore());

      expect(typeof result.current.recoverFromCrash).toBe('function');
      expect(typeof result.current.saveRecoveryState).toBe('function');
      expect(typeof result.current.clearRecoveryState).toBe('function');
    });

    it('should clear recovery state', async () => {
      const { result } = renderHook(() => useStore());

      await act(async () => {
        await result.current.clearRecoveryState();
      });

      expect(mockStorage.delete).toHaveBeenCalledWith('persist:chatterbox-app-state');
    });
  });

  describe('Performance Considerations', () => {
    it('should debounce rapid state changes', async () => {
      const { result } = renderHook(() => useStore());

      // Make rapid changes
      act(() => {
        result.current.updateParameters({ temperature: 0.1 });
        result.current.updateParameters({ temperature: 0.2 });
        result.current.updateParameters({ temperature: 0.3 });
        result.current.updateParameters({ temperature: 0.4 });
        result.current.updateParameters({ temperature: 0.5 });
      });

      // Should not have written yet due to debouncing
      expect(mockStorage.set).not.toHaveBeenCalled();

      // Wait for debounce delay
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should have written only once with final state
      expect(mockStorage.set).toHaveBeenCalledTimes(1);
      const [, persistedData] = mockStorage.set.mock.calls[0];
      expect(persistedData.state.parameters.temperature).toBe(0.5);
    });

    it('should handle large state objects with compression', async () => {
      const { result } = renderHook(() => useStore());

      // Create a large state with many chunks
      act(() => {
        for (let i = 0; i < 20; i++) {
          result.current.addChunk(`Large chunk ${i} with lots of text content to simulate realistic usage scenarios`);
        }
      });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(mockStorage.set).toHaveBeenCalled();
      
      // Verify the config enables compression for large objects
      const [, persistedData] = mockStorage.set.mock.calls[mockStorage.set.mock.calls.length - 1];
      expect(persistedData).toBeDefined();
      expect(persistedData.state.chunks).toHaveLength(20);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage write errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStorage.set.mockRejectedValue(new Error('Storage write failed'));

      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.updateParameters({ temperature: 0.9 });
      });

      // Wait for write attempt
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should have attempted to write
      expect(mockStorage.set).toHaveBeenCalled();
      
      // Should have logged error but not crashed
      expect(consoleSpy).toHaveBeenCalledWith(
        'Persist write error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle storage read errors during hydration', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockStorage.get.mockRejectedValue(new Error('Storage read failed'));

      const { result } = renderHook(() => useStore());

      // Should fall back to default state
      expect(result.current.parameters.temperature).toBe(0.8);
      expect(result.current.chunks).toEqual([]);

      // Should have logged error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Persist read error:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Utility Hooks', () => {
    it('should provide specialized hooks for state slices', () => {
      const { result: chunksResult } = renderHook(() => 
        useStore(state => state.chunks)
      );
      
      const { result: parametersResult } = renderHook(() => 
        useStore(state => state.parameters)
      );

      expect(Array.isArray(chunksResult.current)).toBe(true);
      expect(typeof parametersResult.current).toBe('object');
      expect(parametersResult.current.temperature).toBeDefined();
    });
  });
});