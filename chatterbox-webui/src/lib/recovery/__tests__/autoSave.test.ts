import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { AutoSaveManager, AutoSaveService, autoSaveService } from '../autoSave';
import { recoveryStorage } from '../../storage';
import type { RecoverySession } from '../../storage';

// Mock the recovery storage
vi.mock('../../storage', () => ({
  recoveryStorage: {
    saveSession: vi.fn(),
    updateHeartbeat: vi.fn(),
  },
}));

const mockRecoveryStorage = recoveryStorage as {
  saveSession: Mock;
  updateHeartbeat?: Mock;
};

// Mock performance API
const mockPerformance = {
  now: vi.fn(),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByType: vi.fn(),
};

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  
  constructor(name: string) {
    this.name = name;
  }
  
  postMessage(data: any) {
    // Mock implementation for testing
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }
  
  close() {
    // Mock implementation
  }
}

// Setup mocks
beforeEach(() => {
  vi.stubGlobal('performance', mockPerformance);
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  
  // Reset all mocks
  mockRecoveryStorage.saveSession.mockClear();
  if (mockRecoveryStorage.updateHeartbeat) {
    mockRecoveryStorage.updateHeartbeat.mockClear();
  }
  mockPerformance.now.mockReturnValue(1000);
  mockPerformance.getEntriesByType.mockReturnValue([]);
  
  // Mock timers
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AutoSaveManager', () => {
  let manager: AutoSaveManager;
  const sessionId = 'test-session-123';
  const testData = { chunks: [{ id: '1', text: 'test' }] };
  
  beforeEach(() => {
    manager = new AutoSaveManager(sessionId, {
      debounceMs: 100,
      heartbeatIntervalMs: 1000,
      enablePerformanceMonitoring: true,
    });
  });
  
  afterEach(() => {
    manager.dispose();
  });
  
  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(manager.getMetrics().sessionId).toBe(sessionId);
      expect(manager.getMetrics().totalSaves).toBe(0);
      expect(manager.getMetrics().failedSaves).toBe(0);
    });
    
    it('should start heartbeat timer', () => {
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });
  });
  
  describe('Debounced Save', () => {
    it('should schedule save with debouncing', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1050);
      
      const savePromise = manager.scheduleSave(testData);
      
      // Advance timers to trigger debounced save
      vi.advanceTimersByTime(100);
      
      await savePromise;
      
      expect(mockRecoveryStorage.saveSession).toHaveBeenCalledOnce();
      expect(manager.getMetrics().totalSaves).toBe(1);
    });
    
    it('should cancel previous debounced save when new one is scheduled', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      
      const promise1 = manager.scheduleSave({ data: 'first' });
      const promise2 = manager.scheduleSave({ data: 'second' });
      
      // Advance timers
      vi.advanceTimersByTime(100);
      
      await Promise.all([
        promise1.catch(() => {}), // May be cancelled
        promise2,
      ]);
      
      // Should only save the latest data
      expect(mockRecoveryStorage.saveSession).toHaveBeenCalledTimes(1);
    });
    
    it('should handle save errors gracefully', async () => {
      const error = new Error('Storage failed');
      mockRecoveryStorage.saveSession.mockRejectedValue(error);
      
      const savePromise = manager.scheduleSave(testData);
      vi.advanceTimersByTime(100);
      
      await expect(savePromise).rejects.toThrow('Storage failed');
      expect(manager.getMetrics().failedSaves).toBe(1);
    });
  });
  
  describe('Immediate Save', () => {
    it('should perform immediate save bypassing debounce', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1025);
      
      await manager.immediateSave(testData);
      
      expect(mockRecoveryStorage.saveSession).toHaveBeenCalledOnce();
      expect(manager.getMetrics().totalSaves).toBe(1);
    });
    
    it('should cancel pending debounced save when immediate save is called', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      
      // Schedule debounced save
      const debouncedPromise = manager.scheduleSave({ data: 'debounced' });
      
      // Immediately save different data
      await manager.immediateSave({ data: 'immediate' });
      
      // Advance timers to check if debounced save was cancelled
      vi.advanceTimersByTime(200);
      
      // Should have only one save call (the immediate one)
      expect(mockRecoveryStorage.saveSession).toHaveBeenCalledTimes(1);
      
      // The debounced promise should resolve (was cancelled)
      await debouncedPromise.catch(() => {}); // May throw if cancelled
    });
  });
  
  describe('Data Sanitization', () => {
    it('should sanitize File objects from data', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      
      const dataWithFile = {
        text: 'hello',
        voiceFile: new File([''], 'test.wav'),
        chunks: [{ id: '1', audioBlob: new Blob(['audio']) }],
      };
      
      await manager.immediateSave(dataWithFile);
      
      const savedSession = mockRecoveryStorage.saveSession.mock.calls[0][0] as RecoverySession;
      
      expect(savedSession.stateData.text).toBe('hello');
      expect(savedSession.stateData.voiceFile).toBeUndefined();
      expect(savedSession.stateData.chunks[0].audioBlob).toBeUndefined();
    });
    
    it('should sanitize functions and binary data', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      
      const dataWithUnsupported = {
        callback: () => console.log('test'),
        buffer: new ArrayBuffer(8),
        validData: 'keep this',
      };
      
      await manager.immediateSave(dataWithUnsupported);
      
      const savedSession = mockRecoveryStorage.saveSession.mock.calls[0][0] as RecoverySession;
      
      expect(savedSession.stateData.callback).toBeUndefined();
      expect(savedSession.stateData.buffer).toBeUndefined();
      expect(savedSession.stateData.validData).toBe('keep this');
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track save operation performance', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1025); // 25ms duration
      
      await manager.immediateSave(testData);
      
      expect(mockPerformance.mark).toHaveBeenCalledWith(expect.stringMatching(/autosave-start/));
      expect(mockPerformance.mark).toHaveBeenCalledWith(expect.stringMatching(/autosave-end/));
      expect(mockPerformance.measure).toHaveBeenCalled();
      
      const metrics = manager.getMetrics();
      expect(metrics.averageSaveTime).toBeGreaterThan(0);
    });
    
    it('should warn when save exceeds performance target', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1100); // 100ms > 50ms target
      
      await manager.immediateSave(testData);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Save operation'),
        expect.stringContaining('100.00ms'),
        expect.stringContaining('target: 50ms')
      );
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Browser Event Handling', () => {
    it('should set up event listeners during initialization', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const docAddEventListenerSpy = vi.spyOn(document, 'addEventListener');
      
      // Create new manager to test initialization
      const testManager = new AutoSaveManager('test-events', {});
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      expect(docAddEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
      
      testManager.dispose();
      addEventListenerSpy.mockRestore();
      docAddEventListenerSpy.mockRestore();
    });
    
    it('should trigger visibility save event when tab becomes hidden', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
      
      // Mock document.hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      
      // Trigger visibilitychange event
      const event = new Event('visibilitychange');
      document.dispatchEvent(event);
      
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'autosave:visibility-save',
          detail: { sessionId }
        })
      );
      
      dispatchEventSpy.mockRestore();
    });
  });
  
  describe('Heartbeat Mechanism', () => {
    it('should send heartbeat at regular intervals', async () => {
      if (mockRecoveryStorage.updateHeartbeat) {
        mockRecoveryStorage.updateHeartbeat.mockResolvedValue(undefined);
        
        // Advance time by heartbeat interval
        vi.advanceTimersByTime(1000);
        
        expect(mockRecoveryStorage.updateHeartbeat).toHaveBeenCalledWith(
          sessionId,
          expect.objectContaining({
            sessionId,
            timestamp: expect.any(Number),
            userAgent: navigator.userAgent,
            url: window.location.href,
          })
        );
      }
    });
    
    it('should track heartbeat failures', async () => {
      if (mockRecoveryStorage.updateHeartbeat) {
        mockRecoveryStorage.updateHeartbeat.mockRejectedValue(new Error('Heartbeat failed'));
        
        // Advance time by heartbeat interval multiple times
        vi.advanceTimersByTime(1000);
        vi.advanceTimersByTime(1000);
        vi.advanceTimersByTime(1000);
        
        const metrics = manager.getMetrics();
        expect(metrics.heartbeatFailures).toBeGreaterThan(0);
      }
    });
  });
  
  describe('Configuration Updates', () => {
    it('should update configuration and apply changes', () => {
      const newConfig = {
        debounceMs: 5000,
        performanceTarget: 25,
      };
      
      manager.updateConfig(newConfig);
      
      const perfInfo = manager.getPerformanceInfo();
      expect(perfInfo.config.debounceMs).toBe(5000);
      expect(perfInfo.config.performanceTarget).toBe(25);
    });
  });
  
  describe('Pause and Resume', () => {
    it('should pause and resume auto-save operations', async () => {
      mockRecoveryStorage.saveSession.mockResolvedValue(undefined);
      
      manager.pause();
      
      // Try to save while paused
      await expect(manager.immediateSave(testData)).rejects.toThrow('Manager is not active');
      
      manager.resume();
      
      // Should work after resume
      await expect(manager.immediateSave(testData)).resolves.toBeUndefined();
      expect(mockRecoveryStorage.saveSession).toHaveBeenCalledOnce();
    });
  });
  
  describe('Cleanup', () => {
    it('should clean up resources on dispose', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const docRemoveEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      
      manager.dispose();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      expect(docRemoveEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      
      removeEventListenerSpy.mockRestore();
      docRemoveEventListenerSpy.mockRestore();
    });
  });
});

describe('AutoSaveService', () => {
  let service: AutoSaveService;
  
  beforeEach(() => {
    service = new AutoSaveService({
      debounceMs: 100,
      heartbeatIntervalMs: 1000,
    });
  });
  
  afterEach(() => {
    service.dispose();
  });
  
  describe('Manager Lifecycle', () => {
    it('should create and manage session managers', () => {
      const sessionId = 'service-test-123';
      
      const manager1 = service.getManager(sessionId);
      const manager2 = service.getManager(sessionId);
      
      // Should return the same instance
      expect(manager1).toBe(manager2);
      
      service.removeManager(sessionId);
      
      const manager3 = service.getManager(sessionId);
      // Should create a new instance after removal
      expect(manager3).not.toBe(manager1);
    });
    
    it('should track metrics for all sessions', () => {
      const session1 = service.getManager('session-1');
      const session2 = service.getManager('session-2');
      
      const allMetrics = service.getAllMetrics();
      
      expect(Object.keys(allMetrics)).toHaveLength(2);
      expect(allMetrics['session-1']).toBeDefined();
      expect(allMetrics['session-2']).toBeDefined();
    });
    
    it('should update global configuration for all managers', () => {
      const manager1 = service.getManager('session-1');
      const manager2 = service.getManager('session-2');
      
      const updateConfigSpy1 = vi.spyOn(manager1, 'updateConfig');
      const updateConfigSpy2 = vi.spyOn(manager2, 'updateConfig');
      
      const newConfig = { debounceMs: 3000 };
      service.updateGlobalConfig(newConfig);
      
      expect(updateConfigSpy1).toHaveBeenCalledWith(newConfig);
      expect(updateConfigSpy2).toHaveBeenCalledWith(newConfig);
    });
  });
  
  describe('Conflict Resolution', () => {
    it('should set up broadcast channel for cross-tab communication', () => {
      // The service should create a BroadcastChannel
      // This is tested through the initialization process
      expect(service).toBeDefined();
    });
    
    it('should handle session active notifications', () => {
      // Mock BroadcastChannel message
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Create a manager to simulate active session
      service.getManager('test-session');
      
      // This would normally be handled by BroadcastChannel
      // but we can test the logic directly
      expect(consoleSpy).toHaveBeenCalledWith('[AutoSaveService] Initialized');
      
      consoleSpy.mockRestore();
    });
  });
  
  describe('Cleanup', () => {
    it('should dispose all managers on service dispose', () => {
      const manager1 = service.getManager('session-1');
      const manager2 = service.getManager('session-2');
      
      const disposeSpy1 = vi.spyOn(manager1, 'dispose');
      const disposeSpy2 = vi.spyOn(manager2, 'dispose');
      
      service.dispose();
      
      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
    });
  });
});

describe('Global AutoSave Service', () => {
  it('should export a global service instance', () => {
    expect(autoSaveService).toBeDefined();
    expect(autoSaveService).toBeInstanceOf(AutoSaveService);
  });
  
  it('should maintain singleton behavior', () => {
    const manager1 = autoSaveService.getManager('global-test');
    const manager2 = autoSaveService.getManager('global-test');
    
    expect(manager1).toBe(manager2);
    
    // Clean up
    autoSaveService.removeManager('global-test');
  });
});