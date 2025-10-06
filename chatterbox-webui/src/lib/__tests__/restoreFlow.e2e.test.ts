import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RecoveryDetectionSystem, initializeRecoverySystem } from '../recovery/restoreFlow';
import { createRecoveryIntegrationSlice } from '../recovery/recoveryIntegration';
import { AppInitializationManager } from '../recovery/appInitialization';
import { recoveryStorage } from '../storage';
import type { RecoverySession } from '../storage/types';

// Mock all dependencies
vi.mock('../storage', () => ({
  recoveryStorage: {
    getRecoverySessions: vi.fn(),
    getRecoverySession: vi.fn(),
    saveSession: vi.fn(),
    removeRecoverySession: vi.fn(),
  },
}));

// Mock fetch for backend integration
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock performance API
const mockPerformance = {
  now: vi.fn().mockReturnValue(1000),
  mark: vi.fn(),
  measure: vi.fn(),
};
vi.stubGlobal('performance', mockPerformance);

// Mock AbortSignal
vi.stubGlobal('AbortSignal', {
  timeout: vi.fn().mockReturnValue(new AbortController().signal),
});

describe('Complete Recovery Flow End-to-End', () => {
  const mockSessions: RecoverySession[] = [
    {
      id: 'session-recent',
      name: 'Recent Session',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      appState: {
        chunks: [
          { id: '1', text: 'Hello world', status: 'completed' },
          { id: '2', text: 'Second chunk', status: 'pending' },
        ],
        parameters: { temperature: 0.8, top_p: 0.9 },
        ttsEngine: 'chatterbox',
        useStreaming: false,
        sessions: [],
        currentSessionId: null,
        batchItems: [],
      },
    },
    {
      id: 'session-with-backend',
      name: 'Backend Session',
      timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
      backendToken: 'valid-token-123',
      appState: {
        chunks: [{ id: '3', text: 'Backend chunk', status: 'completed' }],
        parameters: { temperature: 0.7 },
        ttsEngine: 'chatterbox',
        useStreaming: true,
        sessions: [],
        currentSessionId: null,
        batchItems: [],
      },
    },
    {
      id: 'session-expired',
      name: 'Expired Session',
      timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      appState: {
        chunks: [{ id: '4', text: 'Old chunk', status: 'completed' }],
        parameters: { temperature: 0.6 },
        ttsEngine: 'chatterbox',
        useStreaming: false,
        sessions: [],
        currentSessionId: null,
        batchItems: [],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset performance mock
    let callCount = 0;
    mockPerformance.now.mockImplementation(() => {
      callCount++;
      return 1000 + callCount * 10; // Increment by 10ms for each call
    });

    // Mock successful storage operations
    (recoveryStorage.getRecoverySessions as vi.Mock).mockResolvedValue(mockSessions);
    (recoveryStorage.getRecoverySession as vi.Mock).mockImplementation(
      (id: string) => Promise.resolve(mockSessions.find(s => s.id === id))
    );

    // Mock successful backend validation
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/recovery/validate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valid: true }),
        });
      }
      if (url.includes('/recovery/restore')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            session: {
              name: 'Updated from Backend',
              appState: {
                chunks: [
                  { id: '3', text: 'Updated backend chunk', status: 'completed' },
                  { id: '5', text: 'New backend chunk', status: 'pending' },
                ],
                parameters: { temperature: 0.75, cfg_weight: 0.6 },
              },
            },
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('App Initialization Flow', () => {
    it('should complete full app initialization with recovery detection', async () => {
      const initManager = new AppInitializationManager({
        enableRecovery: true,
        maxInitTime: 3000,
        blockStartupForRecovery: false,
      });

      const result = await initManager.initializeApp();

      expect(result.success).toBe(true);
      expect(result.canProceed).toBe(true);
      expect(result.recovery).toBeDefined();
      expect(result.recovery?.hasRecovery).toBe(true);
      expect(result.recovery?.sessions).toHaveLength(2); // Expired session filtered out
      expect(result.initTime).toBeGreaterThan(0);
      expect(result.initTime).toBeLessThan(200); // Should be fast
    });

    it('should handle recovery detection timeout gracefully', async () => {
      // Make storage operation take longer than timeout
      (recoveryStorage.getRecoverySessions as vi.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 200))
      );

      const initManager = new AppInitializationManager({
        enableRecovery: true,
        maxInitTime: 100, // Short timeout
      });

      const result = await initManager.initializeApp();

      expect(result.success).toBe(true);
      expect(result.canProceed).toBe(true);
      expect(result.errors.some(e => e.includes('timeout'))).toBe(true);
    });

    it('should work without recovery when disabled', async () => {
      const initManager = new AppInitializationManager({
        enableRecovery: false,
      });

      const result = await initManager.initializeApp();

      expect(result.success).toBe(true);
      expect(result.canProceed).toBe(true);
      expect(result.recovery).toBeUndefined();
      expect(recoveryStorage.getRecoverySessions).not.toHaveBeenCalled();
    });
  });

  describe('Recovery Detection Performance', () => {
    it('should meet < 100ms performance target for detection', async () => {
      const detectionSystem = new RecoveryDetectionSystem({
        detectionTimeout: 100,
        validateWithBackend: false, // Disable backend validation for speed
      });

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.detectionTime).toBeLessThan(100);
      expect(result.hasRecovery).toBe(true);
      expect(result.sessions).toHaveLength(2); // Recent sessions only
    });

    it('should warn when detection exceeds target', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock slow performance
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1150); // 150ms

      const detectionSystem = new RecoveryDetectionSystem({
        detectionTimeout: 100,
        validateWithBackend: false,
      });

      await detectionSystem.detectRecoverySessions();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detection took 150.00ms'),
        expect.stringContaining('target: 100ms')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Complete Restore Flow', () => {
    it('should execute complete restore flow with local session', async () => {
      const detectionSystem = new RecoveryDetectionSystem();
      
      // First detect sessions
      const detection = await detectionSystem.detectRecoverySessions();
      expect(detection.hasRecovery).toBe(true);

      // Then restore the recent session (local only)
      const restoreResult = await detectionSystem.executeRestoreFlow('session-recent');

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.session).toBeDefined();
      expect(restoreResult.session?.id).toBe('session-recent');
      expect(restoreResult.session?.name).toBe('Recent Session');
      expect(restoreResult.errors).toHaveLength(0);
      expect(restoreResult.metrics.totalTime).toBeGreaterThan(0);
      expect(restoreResult.metrics.backendTime).toBe(0); // No backend call
    });

    it('should execute complete restore flow with backend session', async () => {
      const detectionSystem = new RecoveryDetectionSystem({
        validateWithBackend: true,
        backendTimeout: 2000,
      });
      
      // Restore session with backend token
      const restoreResult = await detectionSystem.executeRestoreFlow('session-with-backend');

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.session).toBeDefined();
      expect(restoreResult.session?.id).toBe('session-with-backend');
      expect(restoreResult.session?.name).toBe('Updated from Backend');
      expect(restoreResult.session?.appState?.chunks).toHaveLength(2);
      expect(restoreResult.errors).toHaveLength(0);
      expect(restoreResult.metrics.backendTime).toBeGreaterThan(0);
      
      // Verify backend API was called
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recovery/restore',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'valid-token-123' }),
        })
      );
    });

    it('should handle backend failure gracefully', async () => {
      // Make backend fail
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/recovery/restore')) {
          return Promise.reject(new Error('Backend unavailable'));
        }
        return mockFetch.getMockImplementation()?.(url);
      });

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const detectionSystem = new RecoveryDetectionSystem();
      
      const restoreResult = await detectionSystem.executeRestoreFlow('session-with-backend');

      expect(restoreResult.success).toBe(true); // Should still succeed with local data
      expect(restoreResult.session?.id).toBe('session-with-backend');
      expect(restoreResult.errors).toContain('Backend restore failed: Error: Backend unavailable');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Backend restore failed'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Integration with Store', () => {
    it('should integrate recovery system with store slice', async () => {
      const set = vi.fn();
      const get = vi.fn().mockReturnValue({
        isInitialized: false,
        availableSessions: [],
        autoRestoreEnabled: false,
      });

      const slice = createRecoveryIntegrationSlice(set, get);

      // Initialize recovery
      await slice.initializeRecovery();

      // Should have called initialize
      expect(set).toHaveBeenCalledWith({ restoreInProgress: true, restoreProgress: 10 });
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          isInitialized: true,
          hasRecovery: true,
          restoreInProgress: false,
          restoreProgress: 100,
        })
      );
    });

    it('should handle session restoration through store', async () => {
      const set = vi.fn();
      const get = vi.fn().mockReturnValue({
        availableSessions: [mockSessions[0]],
      });

      const slice = createRecoveryIntegrationSlice(set, get);
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      // Select session for restore
      await slice.selectSessionForRestore('session-recent');

      // Should show progress
      expect(set).toHaveBeenCalledWith({
        restoreInProgress: true,
        restoreProgress: 0,
        restoreError: null,
        showRecoveryModal: false,
      });

      // Should complete successfully
      expect(set).toHaveBeenCalledWith({
        restoreInProgress: false,
        restoreProgress: 100,
        showRecoveryBanner: false,
        showRecoveryModal: false,
      });

      // Should emit success event
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:restore-success',
        })
      );

      dispatchEventSpy.mockRestore();
    });
  });

  describe('Event System Integration', () => {
    it('should emit and handle recovery events correctly', async () => {
      const detectedEvents: CustomEvent[] = [];
      const successEvents: CustomEvent[] = [];

      // Listen for events
      window.addEventListener('recovery:detected', (e) => detectedEvents.push(e as CustomEvent));
      window.addEventListener('recovery:restore-success', (e) => successEvents.push(e as CustomEvent));

      // Initialize recovery system
      const detection = await initializeRecoverySystem();

      expect(detectedEvents).toHaveLength(1);
      expect(detectedEvents[0].detail.sessions).toHaveLength(2);
      expect(detectedEvents[0].detail.source).toBe('hybrid');

      // Simulate store integration
      const set = vi.fn();
      const get = vi.fn().mockReturnValue({
        availableSessions: detection.sessions,
      });

      const slice = createRecoveryIntegrationSlice(set, get);
      await slice.selectSessionForRestore('session-recent');

      expect(successEvents).toHaveLength(1);
      expect(successEvents[0].detail.session.id).toBe('session-recent');
    });
  });

  describe('Error Recovery and Fallbacks', () => {
    it('should handle storage errors gracefully', async () => {
      (recoveryStorage.getRecoverySessions as vi.Mock).mockRejectedValue(
        new Error('Storage unavailable')
      );

      const detection = await initializeRecoverySystem();

      expect(detection.hasRecovery).toBe(false);
      expect(detection.errors).toContain('Storage unavailable');
    });

    it('should clean up corrupted sessions', async () => {
      const detectionSystem = new RecoveryDetectionSystem();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      await detectionSystem.handleRecoveryFailure(
        new Error('Corrupted session'),
        'session-recent'
      );

      expect(recoveryStorage.removeRecoverySession).toHaveBeenCalledWith('session-recent');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[RestoreFlow] Cleaned up corrupted session: session-recent'
      );
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:failure',
          detail: { error: 'Corrupted session', sessionId: 'session-recent' },
        })
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      dispatchEventSpy.mockRestore();
    });

    it('should handle cleanup failures', async () => {
      (recoveryStorage.removeRecoverySession as vi.Mock).mockRejectedValue(
        new Error('Cleanup failed')
      );

      const detectionSystem = new RecoveryDetectionSystem();
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await detectionSystem.handleRecoveryFailure(
        new Error('Recovery failed'),
        'session-recent'
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to cleanup session session-recent:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should meet performance targets for complete flow', async () => {
      const startTime = performance.now();

      // Full initialization flow
      const initManager = new AppInitializationManager({
        enableRecovery: true,
        showLoadingUI: false, // Skip UI for testing
      });

      const initResult = await initManager.initializeApp();

      // Recovery detection should be fast
      expect(initResult.recovery?.detectionTime).toBeLessThan(100);

      // Total initialization should be reasonable
      expect(initResult.initTime).toBeLessThan(500);

      // Restore flow should also be fast
      if (initResult.recovery?.hasRecovery) {
        const detectionSystem = new RecoveryDetectionSystem();
        const restoreStart = performance.now();
        
        const restoreResult = await detectionSystem.executeRestoreFlow(
          initResult.recovery.sessions[0].id
        );
        
        const restoreTime = performance.now() - restoreStart;
        
        expect(restoreResult.success).toBe(true);
        expect(restoreTime).toBeLessThan(200); // Restore should be under 200ms
      }
    });
  });
});