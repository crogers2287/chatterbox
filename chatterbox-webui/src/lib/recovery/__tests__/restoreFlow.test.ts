import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { RecoveryDetectionSystem, initializeRecoverySystem, autoRestoreIfEnabled } from '../restoreFlow';
import { recoveryStorage } from '../../storage';
import type { RecoverySession } from '../../storage/types';

// Mock dependencies
vi.mock('../../storage', () => ({
  recoveryStorage: {
    getRecoverySessions: vi.fn(),
    getRecoverySession: vi.fn(),
    removeRecoverySession: vi.fn(),
  },
}));

const mockRecoveryStorage = recoveryStorage as {
  getRecoverySessions: Mock;
  getRecoverySession: Mock;
  removeRecoverySession: Mock;
};

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock performance API
const mockPerformance = {
  now: vi.fn().mockReturnValue(1000),
};
vi.stubGlobal('performance', mockPerformance);

// Mock AbortSignal.timeout
vi.stubGlobal('AbortSignal', {
  timeout: vi.fn().mockReturnValue(new AbortController().signal),
});

describe('RecoveryDetectionSystem', () => {
  let detectionSystem: RecoveryDetectionSystem;
  
  const mockSessions: RecoverySession[] = [
    {
      id: 'session-1',
      name: 'Test Session 1',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
      appState: {
        chunks: [{ id: '1', text: 'test', status: 'completed' }],
        parameters: { temperature: 0.8 },
      },
    },
    {
      id: 'session-2',
      name: 'Test Session 2',
      timestamp: Date.now() - 1000 * 60 * 10, // 10 minutes ago
      backendToken: 'token-123',
      appState: {
        chunks: [{ id: '2', text: 'test 2', status: 'pending' }],
        parameters: { temperature: 0.7 },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPerformance.now.mockReturnValue(1000);
    
    detectionSystem = new RecoveryDetectionSystem({
      detectionTimeout: 100,
      maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
      validateWithBackend: true,
      backendTimeout: 2000,
    });

    // Mock successful storage operations
    mockRecoveryStorage.getRecoverySessions.mockResolvedValue(mockSessions);
    mockRecoveryStorage.getRecoverySession.mockImplementation(
      (id: string) => Promise.resolve(mockSessions.find(s => s.id === id))
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Recovery Detection', () => {
    it('should detect recovery sessions successfully', async () => {
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1025); // 25ms

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.hasRecovery).toBe(true);
      expect(result.sessions).toHaveLength(2);
      expect(result.detectionTime).toBe(25);
      expect(result.errors).toHaveLength(0);
      expect(result.source).toBe('hybrid'); // Has both local and server sessions
    });

    it('should handle no recovery sessions', async () => {
      mockRecoveryStorage.getRecoverySessions.mockResolvedValue([]);
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1015); // 15ms

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.hasRecovery).toBe(false);
      expect(result.sessions).toHaveLength(0);
      expect(result.detectionTime).toBe(15);
      expect(result.errors).toHaveLength(0);
    });

    it('should filter out expired sessions', async () => {
      const expiredSessions = [
        {
          ...mockSessions[0],
          timestamp: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago (expired)
        },
        mockSessions[1], // Not expired
      ];

      mockRecoveryStorage.getRecoverySessions.mockResolvedValue(expiredSessions);

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.hasRecovery).toBe(true);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('session-2');
    });

    it('should handle detection timeout', async () => {
      mockRecoveryStorage.getRecoverySessions.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 200)) // Longer than timeout
      );

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.hasRecovery).toBe(false);
      expect(result.errors).toContain('Detection timeout');
    });

    it('should warn when detection exceeds target time', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockPerformance.now.mockReturnValueOnce(1000).mockReturnValueOnce(1150); // 150ms > 100ms target

      await detectionSystem.detectRecoverySessions();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detection took 150.00ms'),
        expect.stringContaining('target: 100ms')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Backend Validation', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      });
    });

    it('should validate sessions with backend tokens', async () => {
      const result = await detectionSystem.detectRecoverySessions();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/recovery/validate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'token-123' }),
        })
      );

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions.find(s => s.id === 'session-2')?.backendToken).toBe('token-123');
    });

    it('should handle invalid backend tokens', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: false }),
      });

      const result = await detectionSystem.detectRecoverySessions();

      const session2 = result.sessions.find(s => s.id === 'session-2');
      expect(session2?.backendToken).toBeUndefined();
    });

    it('should handle backend validation errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await detectionSystem.detectRecoverySessions();

      expect(result.sessions).toHaveLength(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to validate session session-2'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should skip backend validation when disabled', async () => {
      detectionSystem.updateConfig({ validateWithBackend: false });

      await detectionSystem.detectRecoverySessions();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Restore Flow', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          session: {
            name: 'Updated Session Name',
            appState: { chunks: [{ id: '2', text: 'updated text' }] },
          },
        }),
      });
    });

    it('should execute restore flow successfully', async () => {
      mockPerformance.now
        .mockReturnValueOnce(1000) // Start time
        .mockReturnValueOnce(1010) // After storage
        .mockReturnValueOnce(1050) // After backend
        .mockReturnValueOnce(1080); // End time

      const result = await detectionSystem.executeRestoreFlow('session-2');

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.name).toBe('Updated Session Name');
      expect(result.metrics.totalTime).toBe(80);
      expect(result.metrics.storageTime).toBe(10);
      expect(result.metrics.backendTime).toBe(30);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle session not found', async () => {
      mockRecoveryStorage.getRecoverySession.mockResolvedValue(null);

      const result = await detectionSystem.executeRestoreFlow('nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Session not found');
    });

    it('should handle backend restore failure gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Backend unavailable'));
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await detectionSystem.executeRestoreFlow('session-2');

      expect(result.success).toBe(true); // Should still succeed with local data
      expect(result.session?.id).toBe('session-2');
      expect(result.errors).toContain('Backend restore failed: Error: Backend unavailable');
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should restore local-only sessions', async () => {
      const result = await detectionSystem.executeRestoreFlow('session-1');

      expect(result.success).toBe(true);
      expect(result.session?.id).toBe('session-1');
      expect(result.metrics.backendTime).toBe(0); // No backend call
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Auto Restore', () => {
    it('should get most recent session for auto restore', async () => {
      const session = await detectionSystem.getMostRecentSession();

      expect(session?.id).toBe('session-1'); // More recent timestamp
    });

    it('should return null when no sessions available', async () => {
      mockRecoveryStorage.getRecoverySessions.mockResolvedValue([]);

      const session = await detectionSystem.getMostRecentSession();

      expect(session).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle recovery failure gracefully', async () => {
      const mockRemoveSession = mockRecoveryStorage.removeRecoverySession.mockResolvedValue(undefined);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock event dispatching
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      const error = new Error('Recovery failed');
      await detectionSystem.handleRecoveryFailure(error, 'session-1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[RestoreFlow] Recovery failed:', error);
      expect(mockRemoveSession).toHaveBeenCalledWith('session-1');
      expect(consoleLogSpy).toHaveBeenCalledWith('[RestoreFlow] Cleaned up corrupted session: session-1');
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:failure',
          detail: { error: 'Recovery failed', sessionId: 'session-1' },
        })
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      dispatchEventSpy.mockRestore();
    });

    it('should handle cleanup failures', async () => {
      mockRecoveryStorage.removeRecoverySession.mockRejectedValue(new Error('Cleanup failed'));
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const error = new Error('Recovery failed');
      await detectionSystem.handleRecoveryFailure(error, 'session-1');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to cleanup session session-1:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      const newConfig = { detectionTimeout: 200, autoRestore: true };
      detectionSystem.updateConfig(newConfig);

      const config = detectionSystem.getConfig();
      expect(config.detectionTimeout).toBe(200);
      expect(config.autoRestore).toBe(true);
    });

    it('should preserve existing config values when updating', () => {
      const originalConfig = detectionSystem.getConfig();
      detectionSystem.updateConfig({ detectionTimeout: 200 });

      const updatedConfig = detectionSystem.getConfig();
      expect(updatedConfig.detectionTimeout).toBe(200);
      expect(updatedConfig.maxSessionAge).toBe(originalConfig.maxSessionAge);
    });
  });
});

describe('Global Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecoveryStorage.getRecoverySessions.mockResolvedValue([]);
  });

  describe('initializeRecoverySystem', () => {
    it('should initialize recovery system and log results', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      mockRecoveryStorage.getRecoverySessions.mockResolvedValue([mockSessions[0]]);

      const result = await initializeRecoverySystem();

      expect(consoleLogSpy).toHaveBeenCalledWith('[RestoreFlow] Initializing recovery system...');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found 1 recovery session(s)'),
      );
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:detected',
        })
      );

      consoleLogSpy.mockRestore();
      dispatchEventSpy.mockRestore();
    });

    it('should log when no sessions found', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await initializeRecoverySystem();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/No recovery sessions found/)
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('autoRestoreIfEnabled', () => {
    it('should return null when auto-restore is disabled', async () => {
      const result = await autoRestoreIfEnabled();
      expect(result).toBeNull();
    });

    it('should auto-restore when enabled and session available', async () => {
      // Enable auto-restore
      const detectionSystem = new RecoveryDetectionSystem({ autoRestore: true });
      // Override global instance
      vi.doMock('../restoreFlow', () => ({
        ...vi.importActual('../restoreFlow'),
        recoveryDetection: detectionSystem,
      }));

      mockRecoveryStorage.getRecoverySessions.mockResolvedValue([mockSessions[0]]);
      mockRecoveryStorage.getRecoverySession.mockResolvedValue(mockSessions[0]);

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Re-import to get updated module
      const { autoRestoreIfEnabled: autoRestoreUpdated } = await import('../restoreFlow');
      const result = await autoRestoreUpdated();

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auto-restoring session'),
      );

      consoleLogSpy.mockRestore();
    });
  });
});