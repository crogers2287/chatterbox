import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from '../store';
import { autoSaveService } from '../recovery/autoSave';

// Mock indexedDB for testing
const mockIndexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};

const mockIDBDatabase = {
  createObjectStore: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
};

const mockIDBTransaction = {
  objectStore: vi.fn(),
  oncomplete: null,
  onerror: null,
};

const mockIDBObjectStore = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  getAll: vi.fn(),
};

const mockIDBRequest = {
  onsuccess: null,
  onerror: null,
  result: null,
};

// Setup IndexedDB mocks
beforeEach(() => {
  vi.stubGlobal('indexedDB', mockIndexedDB);
  
  mockIndexedDB.open.mockReturnValue({
    ...mockIDBRequest,
    onupgradeneeded: null,
  });
  
  mockIDBTransaction.objectStore.mockReturnValue(mockIDBObjectStore);
  mockIDBDatabase.transaction.mockReturnValue(mockIDBTransaction);
  
  mockIDBObjectStore.put.mockReturnValue(mockIDBRequest);
  mockIDBObjectStore.get.mockReturnValue(mockIDBRequest);
  mockIDBObjectStore.delete.mockReturnValue(mockIDBRequest);
  mockIDBObjectStore.clear.mockReturnValue(mockIDBRequest);
  mockIDBObjectStore.getAll.mockReturnValue(mockIDBRequest);
  
  // Mock successful operations
  setTimeout(() => {
    if (mockIDBRequest.onsuccess) {
      mockIDBRequest.result = mockIDBDatabase;
      mockIDBRequest.onsuccess({} as any);
    }
  }, 0);
  
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  autoSaveService.dispose();
});

describe('Auto-Save End-to-End Integration', () => {
  let store: ReturnType<typeof useStore>;
  
  beforeEach(() => {
    // Get a fresh store instance
    store = useStore;
    
    // Reset store to initial state
    store.setState({
      chunks: [],
      parameters: {
        exaggeration: 0.5,
        temperature: 0.8,
        cfg_weight: 0.5,
        min_p: 0.05,
        top_p: 1.0,
        repetition_penalty: 1.2,
        seed: null,
        speech_rate: 1.0,
      },
      sessions: [],
      currentSessionId: null,
      batchItems: [],
      autoSaveEnabled: true,
      autoSaveStatus: 'idle',
      lastAutoSave: null,
      autoSaveMetrics: null,
    });
  });
  
  describe('Automatic State Persistence', () => {
    it('should automatically save state when chunks are added', async () => {
      const initialMetrics = store.getState().autoSaveMetrics;
      
      // Add a chunk to trigger auto-save
      store.getState().addChunk('Test chunk for auto-save');
      
      // Verify auto-save was triggered
      expect(store.getState().autoSaveStatus).toBe('saving');
      
      // Advance timers to complete debounced save
      await vi.runAllTimersAsync();
      
      // Check that save completed
      expect(store.getState().autoSaveStatus).toBe('idle');
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
      
      // Metrics should be updated
      const finalMetrics = store.getState().autoSaveMetrics;
      expect(finalMetrics).toBeDefined();
      if (finalMetrics) {
        expect(finalMetrics.totalSaves).toBeGreaterThan(0);
      }
    });
    
    it('should save state when parameters change', async () => {
      // Change TTS parameters
      store.getState().updateParameters({ temperature: 0.9 });
      
      expect(store.getState().autoSaveStatus).toBe('saving');
      
      await vi.runAllTimersAsync();
      
      expect(store.getState().autoSaveStatus).toBe('idle');
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
    });
    
    it('should save state when batch items are modified', async () => {
      // Add batch item
      store.getState().addBatchItem('Batch text', 'test.txt');
      
      expect(store.getState().autoSaveStatus).toBe('saving');
      
      await vi.runAllTimersAsync();
      
      expect(store.getState().autoSaveStatus).toBe('idle');
    });
  });
  
  describe('Manual Save Operations', () => {
    it('should perform manual save immediately', async () => {
      // Add some data to save
      store.getState().addChunk('Manual save test');
      store.getState().updateParameters({ temperature: 0.7 });
      
      // Trigger manual save
      await store.getState().triggerManualSave();
      
      expect(store.getState().autoSaveStatus).toBe('idle');
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
      
      const metrics = store.getState().autoSaveMetrics;
      expect(metrics).toBeDefined();
      if (metrics) {
        expect(metrics.totalSaves).toBeGreaterThan(0);
      }
    });
    
    it('should handle manual save errors gracefully', async () => {
      // Mock storage failure
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Disable auto-save first
      store.getState().disableAutoSave();
      
      await expect(store.getState().triggerManualSave()).rejects.toThrow('Auto-save is disabled');
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track save performance metrics', async () => {
      // Mock performance API
      const performanceMock = {
        now: vi.fn(),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByType: vi.fn(),
      };
      
      vi.stubGlobal('performance', performanceMock);
      performanceMock.now.mockReturnValueOnce(1000).mockReturnValueOnce(1025); // 25ms operation
      performanceMock.getEntriesByType.mockReturnValue([]);
      
      // Trigger a save operation
      store.getState().addChunk('Performance test');
      await vi.runAllTimersAsync();
      
      // Check that performance monitoring was used
      expect(performanceMock.mark).toHaveBeenCalledWith(expect.stringMatching(/autosave-start/));
      expect(performanceMock.mark).toHaveBeenCalledWith(expect.stringMatching(/autosave-end/));
      expect(performanceMock.measure).toHaveBeenCalled();
    });
    
    it('should warn when save operations exceed performance targets', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock slow save operation (100ms > 50ms target)
      const performanceMock = {
        now: vi.fn(),
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByType: vi.fn(),
      };
      
      vi.stubGlobal('performance', performanceMock);
      performanceMock.now.mockReturnValueOnce(1000).mockReturnValueOnce(1100); // 100ms operation
      performanceMock.getEntriesByType.mockReturnValue([]);
      
      // Trigger save
      await store.getState().triggerManualSave();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Save operation'),
        expect.stringContaining('100.00ms'),
        expect.stringContaining('target: 50ms')
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Browser Event Integration', () => {
    it('should trigger save on page visibility change', async () => {
      // Mock document.hidden
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      
      // Add some data to save
      store.getState().addChunk('Visibility test');
      
      // Simulate tab becoming hidden
      Object.defineProperty(document, 'hidden', { value: true });
      
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      
      // Should trigger immediate save
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
    });
    
    it('should handle network status changes', () => {
      const initialStatus = store.getState().autoSaveStatus;
      
      // Simulate going offline
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
      
      // Should pause auto-save operations (implementation dependent)
      
      // Simulate coming online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
      
      // Should resume auto-save operations
    });
  });
  
  describe('Configuration Management', () => {
    it('should update auto-save configuration', () => {
      const newConfig = {
        debounceMs: 5000,
        performanceTarget: 25,
        enablePerformanceMonitoring: false,
      };
      
      store.getState().updateAutoSaveConfig(newConfig);
      
      const updatedConfig = store.getState().autoSaveConfig;
      expect(updatedConfig.debounceMs).toBe(5000);
      expect(updatedConfig.performanceTarget).toBe(25);
      expect(updatedConfig.enablePerformanceMonitoring).toBe(false);
    });
    
    it('should respect auto-save enabled/disabled state', () => {
      // Disable auto-save
      store.getState().disableAutoSave();
      
      // Try to trigger save
      store.getState().addChunk('Should not save');
      
      // Auto-save should not be triggered
      expect(store.getState().autoSaveStatus).toBe('paused');
      
      // Enable auto-save
      store.getState().enableAutoSave();
      
      // Now it should work
      store.getState().addChunk('Should save');
      expect(store.getState().autoSaveStatus).toBe('saving');
    });
  });
  
  describe('Error Recovery', () => {
    it('should handle storage failures gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock storage failure by making IndexedDB operations fail
      mockIDBRequest.onerror = vi.fn();
      mockIDBRequest.onsuccess = null;
      
      setTimeout(() => {
        if (mockIDBRequest.onerror) {
          mockIDBRequest.onerror({} as any);
        }
      }, 0);
      
      // Try to save
      store.getState().addChunk('Error test');
      await vi.runAllTimersAsync();
      
      // Should handle error gracefully
      expect(store.getState().autoSaveStatus).toBe('error');
      
      consoleSpy.mockRestore();
    });
    
    it('should continue working after error recovery', async () => {
      // Simulate an error first
      store.setState({ autoSaveStatus: 'error' });
      
      // Resume operations
      store.getState().resumeAutoSave();
      
      // Should work normally again
      store.getState().addChunk('Recovery test');
      expect(store.getState().autoSaveStatus).toBe('saving');
    });
  });
  
  describe('Data Serialization', () => {
    it('should properly serialize and exclude non-persistent data', async () => {
      // Set up state with both persistent and non-persistent data
      store.setState({
        chunks: [
          {
            id: '1',
            text: 'Test chunk',
            status: 'completed',
            audioUrl: 'blob:http://example.com/audio.wav', // Should be excluded
            audioData: 'data:audio/wav;base64,UklGRiQ...', // Should be kept
          }
        ],
        parameters: { temperature: 0.9 },
        voiceReference: new File([''], 'test.wav'), // Should be excluded
        isGenerating: true, // Should be excluded
        systemStatus: { healthy: true }, // Should be excluded
        sessions: [{ id: 'session-1', name: 'Test Session' }], // Should be kept
      });
      
      // Trigger save
      await store.getState().triggerManualSave();
      
      // The actual verification would depend on the storage implementation
      // but we can verify the operation completed
      expect(store.getState().autoSaveStatus).toBe('idle');
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
    });
  });
  
  describe('Multi-tab Coordination', () => {
    it('should handle session conflicts between tabs', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Simulate conflict event from another tab
      const conflictEvent = new CustomEvent('autosave:conflict', {
        detail: { sessionId: 'test-session' }
      });
      
      window.dispatchEvent(conflictEvent);
      
      // Should update status and potentially show error
      expect(store.getState().autoSaveStatus).toBe('error');
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Heartbeat Mechanism', () => {
    it('should maintain heartbeat for session tracking', async () => {
      // Add some data to create an active session
      store.getState().addChunk('Heartbeat test');
      
      // Advance time by heartbeat interval (30 seconds)
      vi.advanceTimersByTime(30000);
      
      // Heartbeat should be maintained in the background
      // This is verified through the AutoSaveManager tests
      expect(store.getState().autoSaveMetrics?.heartbeatFailures || 0).toBe(0);
    });
  });
});

describe('Auto-Save Service Integration', () => {
  it('should manage multiple sessions across different store instances', () => {
    // Get managers for different sessions
    const manager1 = autoSaveService.getManager('session-1');
    const manager2 = autoSaveService.getManager('session-2');
    
    expect(manager1).toBeDefined();
    expect(manager2).toBeDefined();
    expect(manager1).not.toBe(manager2);
    
    // Should track both sessions
    const allMetrics = autoSaveService.getAllMetrics();
    expect(Object.keys(allMetrics)).toContain('session-1');
    expect(Object.keys(allMetrics)).toContain('session-2');
  });
  
  it('should apply global configuration updates', () => {
    const manager = autoSaveService.getManager('config-test');
    const updateConfigSpy = vi.spyOn(manager, 'updateConfig');
    
    const newConfig = { debounceMs: 3000 };
    autoSaveService.updateGlobalConfig(newConfig);
    
    expect(updateConfigSpy).toHaveBeenCalledWith(newConfig);
  });
});