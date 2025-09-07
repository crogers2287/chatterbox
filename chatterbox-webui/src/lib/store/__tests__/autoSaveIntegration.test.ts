import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { create } from 'zustand';
import { createAutoSaveSlice, createAutoSaveMiddleware } from '../autoSaveIntegration';
import { autoSaveService } from '../../recovery/autoSave';
import { recoveryStorage } from '../../storage';
import type { AutoSaveState, AutoSaveConfig } from '../../recovery/autoSave';

// Mock dependencies
vi.mock('../../recovery/autoSave', () => ({
  autoSaveService: {
    getManager: vi.fn(),
    updateGlobalConfig: vi.fn(),
    removeManager: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  recoveryStorage: {
    saveSession: vi.fn(),
  },
}));

const mockAutoSaveService = autoSaveService as {
  getManager: Mock;
  updateGlobalConfig: Mock;
  removeManager: Mock;
};

const mockRecoveryStorage = recoveryStorage as {
  saveSession: Mock;
};

// Mock AutoSaveManager
const mockManager = {
  scheduleSave: vi.fn(),
  immediateSave: vi.fn(),
  getMetrics: vi.fn(),
  updateConfig: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  dispose: vi.fn(),
};

describe('AutoSave Slice', () => {
  let store: any;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockAutoSaveService.getManager.mockReturnValue(mockManager);
    mockManager.getMetrics.mockReturnValue({
      totalSaves: 5,
      failedSaves: 0,
      averageSaveTime: 25,
      lastSaveTime: Date.now(),
      sessionId: 'test-session',
      heartbeatFailures: 0,
    });
    
    // Create test store with auto-save slice
    store = create<AutoSaveState>((set, get) => ({
      ...createAutoSaveSlice(set, get),
    }));
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('Initial State', () => {
    it('should have correct default configuration', () => {
      const state = store.getState();
      
      expect(state.autoSaveConfig).toEqual({
        debounceMs: 2000,
        heartbeatIntervalMs: 30000,
        maxSessionAge: 24 * 60 * 60 * 1000,
        enablePerformanceMonitoring: true,
        performanceTarget: 50,
      });
      
      expect(state.autoSaveEnabled).toBe(true);
      expect(state.autoSaveStatus).toBe('idle');
      expect(state.lastAutoSave).toBeNull();
      expect(state.autoSaveMetrics).toBeNull();
    });
  });
  
  describe('Enable/Disable Auto-Save', () => {
    it('should enable auto-save', () => {
      store.getState().disableAutoSave();
      expect(store.getState().autoSaveEnabled).toBe(false);
      expect(store.getState().autoSaveStatus).toBe('paused');
      
      store.getState().enableAutoSave();
      expect(store.getState().autoSaveEnabled).toBe(true);
      expect(store.getState().autoSaveStatus).toBe('idle');
    });
    
    it('should disable auto-save', () => {
      store.getState().disableAutoSave();
      expect(store.getState().autoSaveEnabled).toBe(false);
      expect(store.getState().autoSaveStatus).toBe('paused');
    });
  });
  
  describe('Pause/Resume Auto-Save', () => {
    it('should pause auto-save when enabled', () => {
      store.getState().pauseAutoSave();
      expect(store.getState().autoSaveStatus).toBe('paused');
    });
    
    it('should resume auto-save when enabled', () => {
      store.getState().pauseAutoSave();
      store.getState().resumeAutoSave();
      expect(store.getState().autoSaveStatus).toBe('idle');
    });
    
    it('should not change status when disabled', () => {
      store.getState().disableAutoSave();
      store.getState().pauseAutoSave();
      expect(store.getState().autoSaveStatus).toBe('paused'); // Still paused from disable
      
      store.getState().resumeAutoSave();
      expect(store.getState().autoSaveStatus).toBe('paused'); // Still disabled
    });
  });
  
  describe('Configuration Updates', () => {
    it('should update auto-save configuration', () => {
      const newConfig: Partial<AutoSaveConfig> = {
        debounceMs: 5000,
        performanceTarget: 25,
      };
      
      store.getState().updateAutoSaveConfig(newConfig);
      
      const updatedState = store.getState();
      expect(updatedState.autoSaveConfig.debounceMs).toBe(5000);
      expect(updatedState.autoSaveConfig.performanceTarget).toBe(25);
      expect(mockAutoSaveService.updateGlobalConfig).toHaveBeenCalledWith(newConfig);
    });
  });
  
  describe('Manual Save', () => {
    beforeEach(() => {
      mockManager.immediateSave.mockResolvedValue(undefined);
    });
    
    it('should trigger manual save when enabled', async () => {
      const testState = {
        chunks: [{ id: '1', text: 'test' }],
        parameters: { temperature: 0.8 },
        ttsEngine: 'chatterbox',
        useStreaming: false,
        sessions: [],
        currentSessionId: null,
        batchItems: [],
      };
      
      // Mock the get function to return test state
      store.getState = vi.fn().mockReturnValue({
        ...store.getState(),
        ...testState,
      });
      
      await store.getState().triggerManualSave();
      
      expect(mockManager.immediateSave).toHaveBeenCalledWith(testState);
      expect(store.getState().autoSaveStatus).toBe('idle');
      expect(store.getState().lastAutoSave).toBeGreaterThan(0);
    });
    
    it('should fail when auto-save is disabled', async () => {
      store.getState().disableAutoSave();
      
      await expect(store.getState().triggerManualSave()).rejects.toThrow('Auto-save is disabled');
    });
    
    it('should handle save errors gracefully', async () => {
      mockManager.immediateSave.mockRejectedValue(new Error('Save failed'));
      
      await expect(store.getState().triggerManualSave()).rejects.toThrow('Save failed');
      expect(store.getState().autoSaveStatus).toBe('error');
    });
  });
  
  describe('Metrics Retrieval', () => {
    it('should return auto-save metrics', () => {
      const metrics = {
        totalSaves: 10,
        failedSaves: 1,
        averageSaveTime: 35,
        lastSaveTime: Date.now(),
        sessionId: 'test-metrics',
        heartbeatFailures: 0,
      };
      
      // Set metrics in state
      store.setState({ autoSaveMetrics: metrics });
      
      const retrievedMetrics = store.getState().getAutoSaveMetrics();
      expect(retrievedMetrics).toEqual(metrics);
    });
    
    it('should return null when no metrics available', () => {
      const metrics = store.getState().getAutoSaveMetrics();
      expect(metrics).toBeNull();
    });
  });
});

describe('AutoSave Middleware Integration', () => {
  let store: any;
  let cleanup: (() => void) | undefined;
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    mockAutoSaveService.getManager.mockReturnValue(mockManager);
    mockManager.scheduleSave.mockResolvedValue(undefined);
    mockManager.immediateSave.mockResolvedValue(undefined);
    mockManager.getMetrics.mockReturnValue({
      totalSaves: 0,
      failedSaves: 0,
      averageSaveTime: 0,
      lastSaveTime: 0,
      sessionId: 'middleware-test',
      heartbeatFailures: 0,
    });
    
    // Create store with both auto-save slice and middleware
    store = create((set: any, get: any) => ({
      // Test state
      chunks: [],
      parameters: { temperature: 0.8 },
      addChunk: (text: string) => set((state: any) => ({
        chunks: [...state.chunks, { id: Date.now().toString(), text }]
      })),
      
      // Auto-save slice
      ...createAutoSaveSlice(set, get),
    }));
    
    // Initialize middleware
    cleanup = createAutoSaveMiddleware(store);
  });
  
  afterEach(() => {
    cleanup?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  
  describe('Automatic Save Triggering', () => {
    it('should trigger auto-save when relevant state changes', () => {
      // Change state that should trigger auto-save
      store.getState().addChunk('Test chunk');
      
      expect(store.getState().autoSaveStatus).toBe('saving');
      expect(mockManager.scheduleSave).toHaveBeenCalled();
    });
    
    it('should not trigger save when auto-save is disabled', () => {
      store.getState().disableAutoSave();
      store.getState().addChunk('Test chunk');
      
      expect(mockManager.scheduleSave).not.toHaveBeenCalled();
    });
    
    it('should not trigger save when paused', () => {
      store.getState().pauseAutoSave();
      store.getState().addChunk('Test chunk');
      
      expect(mockManager.scheduleSave).not.toHaveBeenCalled();
    });
  });
  
  describe('Event Handling', () => {
    it('should handle visibility save events', async () => {
      const testState = {
        chunks: [{ id: '1', text: 'test' }],
        parameters: { temperature: 0.8 },
      };
      
      // Mock store state
      store.getState = vi.fn().mockReturnValue({
        ...store.getState(),
        ...testState,
        autoSaveEnabled: true,
        autoSaveStatus: 'idle',
      });
      
      // Trigger visibility save event
      const event = new CustomEvent('autosave:visibility-save', {
        detail: { sessionId: expect.any(String) }
      });
      
      window.dispatchEvent(event);
      
      // Should trigger immediate save
      expect(mockManager.immediateSave).toHaveBeenCalled();
    });
    
    it('should handle emergency save events', async () => {
      // Trigger emergency save event
      const event = new CustomEvent('autosave:emergency-save', {
        detail: { sessionId: expect.any(String) }
      });
      
      window.dispatchEvent(event);
      
      expect(mockManager.immediateSave).toHaveBeenCalled();
    });
    
    it('should handle conflict events', () => {
      const setRestoreErrorMock = vi.fn();
      
      // Mock store with setRestoreError
      store.getState = vi.fn().mockReturnValue({
        ...store.getState(),
        setRestoreError: setRestoreErrorMock,
      });
      
      // Trigger conflict event
      const event = new CustomEvent('autosave:conflict', {
        detail: { sessionId: expect.any(String) }
      });
      
      window.dispatchEvent(event);
      
      expect(store.getState().autoSaveStatus).toBe('error');
      expect(setRestoreErrorMock).toHaveBeenCalledWith(
        'Multiple tabs detected - please close other tabs to avoid conflicts'
      );
    });
  });
  
  describe('State Serialization', () => {
    it('should serialize only relevant state for auto-save', () => {
      const state = {
        chunks: [{ id: '1', text: 'test', audioUrl: 'blob:http://example.com/audio' }],
        parameters: { temperature: 0.8 },
        ttsEngine: 'chatterbox',
        useStreaming: false,
        sessions: [{ id: 'session-1', name: 'Test Session' }],
        currentSessionId: 'session-1',
        batchItems: [{ id: 'batch-1', text: 'batch text' }],
        autoSaveConfig: { debounceMs: 2000 },
        
        // Should not be serialized
        voiceReference: new File([''], 'test.wav'),
        isGenerating: true,
        systemStatus: { healthy: true },
      };
      
      store.getState = vi.fn().mockReturnValue({
        ...store.getState(),
        ...state,
        autoSaveEnabled: true,
        autoSaveStatus: 'idle',
      });
      
      store.getState().addChunk('Trigger save');
      
      const saveCall = mockManager.scheduleSave.mock.calls[0][0];
      
      expect(saveCall).toEqual({
        chunks: [{ id: '1', text: 'test' }], // audioUrl removed
        parameters: { temperature: 0.8 },
        ttsEngine: 'chatterbox',
        useStreaming: false,
        sessions: [{ id: 'session-1', name: 'Test Session' }],
        currentSessionId: 'session-1',
        batchItems: [{ id: 'batch-1', text: 'batch text' }],
        autoSaveConfig: { debounceMs: 2000 },
      });
      
      // Should not include non-serializable data
      expect(saveCall.voiceReference).toBeUndefined();
      expect(saveCall.isGenerating).toBeUndefined();
      expect(saveCall.systemStatus).toBeUndefined();
    });
  });
  
  describe('Change Detection', () => {
    it('should detect relevant state changes', () => {
      const initialState = {
        chunks: [],
        parameters: { temperature: 0.8 },
        ttsEngine: 'chatterbox',
        sessions: [],
      };
      
      const changedState = {
        ...initialState,
        chunks: [{ id: '1', text: 'new chunk' }],
      };
      
      store.setState(changedState);
      
      expect(mockManager.scheduleSave).toHaveBeenCalled();
    });
    
    it('should ignore irrelevant state changes', () => {
      const initialState = {
        chunks: [],
        parameters: { temperature: 0.8 },
        isGenerating: false,
        systemStatus: { healthy: true },
      };
      
      const changedState = {
        ...initialState,
        isGenerating: true, // This shouldn't trigger save
        systemStatus: { healthy: false }, // This shouldn't trigger save
      };
      
      store.setState(changedState);
      
      expect(mockManager.scheduleSave).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    it('should handle save failures gracefully', async () => {
      mockManager.scheduleSave.mockRejectedValue(new Error('Save failed'));
      
      // Trigger state change
      store.getState().addChunk('Test chunk');
      
      // Wait for promise resolution
      await vi.runAllTimersAsync();
      
      expect(store.getState().autoSaveStatus).toBe('error');
    });
    
    it('should handle visibility save failures', async () => {
      mockManager.immediateSave.mockRejectedValue(new Error('Visibility save failed'));
      
      // Mock console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Trigger visibility save event
      const event = new CustomEvent('autosave:visibility-save', {
        detail: { sessionId: expect.any(String) }
      });
      
      window.dispatchEvent(event);
      
      await vi.runAllTimersAsync();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AutoSave] Visibility save failed:',
        expect.any(Error)
      );
      expect(store.getState().autoSaveStatus).toBe('error');
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Cleanup', () => {
    it('should clean up event listeners and managers on dispose', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      
      cleanup?.();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('autosave:visibility-save', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('autosave:emergency-save', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('autosave:conflict', expect.any(Function));
      expect(mockAutoSaveService.removeManager).toHaveBeenCalled();
      
      removeEventListenerSpy.mockRestore();
    });
  });
});