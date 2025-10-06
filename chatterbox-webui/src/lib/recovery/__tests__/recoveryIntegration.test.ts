import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { createRecoveryIntegrationSlice, recoveryUtils } from '../recoveryIntegration';
import { recoveryDetection } from '../restoreFlow';
import type { RecoverySession } from '../../storage/types';

// Mock dependencies
vi.mock('../restoreFlow', () => ({
  recoveryDetection: {
    detectRecoverySessions: vi.fn(),
    executeRestoreFlow: vi.fn(),
    updateConfig: vi.fn(),
  },
  initializeRecoverySystem: vi.fn(),
  autoRestoreIfEnabled: vi.fn(),
}));

const mockRecoveryDetection = recoveryDetection as {
  detectRecoverySessions: Mock;
  executeRestoreFlow: Mock;
  updateConfig: Mock;
};

const mockInitializeRecoverySystem = vi.mocked(
  await import('../restoreFlow')
).initializeRecoverySystem;

const mockAutoRestoreIfEnabled = vi.mocked(
  await import('../restoreFlow')
).autoRestoreIfEnabled;

describe('Recovery Integration Slice', () => {
  let set: Mock;
  let get: Mock;
  let slice: any;

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
    set = vi.fn();
    get = vi.fn();

    // Mock default state
    get.mockReturnValue({
      isInitialized: false,
      hasRecovery: false,
      availableSessions: [],
      restoreInProgress: false,
      restoreProgress: 0,
      restoreError: null,
      showRecoveryBanner: false,
      showRecoveryModal: false,
      autoRestoreEnabled: false,
      lastDetection: null,
    });

    slice = createRecoveryIntegrationSlice(set, get);

    // Mock successful recovery detection
    mockRecoveryDetection.detectRecoverySessions.mockResolvedValue({
      hasRecovery: true,
      sessions: mockSessions,
      detectionTime: 25,
      errors: [],
      source: 'hybrid' as const,
    });

    // Mock successful initialize
    mockInitializeRecoverySystem.mockResolvedValue({
      hasRecovery: true,
      sessions: mockSessions,
      detectionTime: 25,
      errors: [],
      source: 'hybrid' as const,
    });

    // Mock successful restore
    mockRecoveryDetection.executeRestoreFlow.mockResolvedValue({
      success: true,
      session: mockSessions[0],
      errors: [],
      metrics: { totalTime: 100, storageTime: 20, backendTime: 80 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      expect(slice.isInitialized).toBe(false);
      expect(slice.hasRecovery).toBe(false);
      expect(slice.availableSessions).toEqual([]);
      expect(slice.restoreInProgress).toBe(false);
      expect(slice.restoreProgress).toBe(0);
      expect(slice.restoreError).toBeNull();
      expect(slice.showRecoveryBanner).toBe(false);
      expect(slice.showRecoveryModal).toBe(false);
      expect(slice.autoRestoreEnabled).toBe(false);
    });
  });

  describe('Recovery Initialization', () => {
    it('should initialize recovery successfully', async () => {
      await slice.initializeRecovery();

      expect(mockInitializeRecoverySystem).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith({ restoreInProgress: true, restoreProgress: 10 });
      expect(set).toHaveBeenCalledWith({
        isInitialized: true,
        hasRecovery: true,
        availableSessions: mockSessions,
        restoreInProgress: false,
        restoreProgress: 100,
      });
    });

    it('should handle initialization failure', async () => {
      const error = new Error('Initialization failed');
      mockInitializeRecoverySystem.mockRejectedValue(error);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await slice.initializeRecovery();

      expect(set).toHaveBeenCalledWith({
        isInitialized: true,
        restoreInProgress: false,
        restoreError: 'Initialization failed',
      });

      consoleErrorSpy.mockRestore();
    });

    it('should perform auto-restore when enabled', async () => {
      get.mockReturnValue({ ...get(), autoRestoreEnabled: true });
      mockAutoRestoreIfEnabled.mockResolvedValue({
        success: true,
        session: mockSessions[0],
        errors: [],
        metrics: { totalTime: 50, storageTime: 10, backendTime: 40 },
      });

      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      await slice.initializeRecovery();

      expect(mockAutoRestoreIfEnabled).toHaveBeenCalled();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:auto-restore',
        })
      );

      dispatchEventSpy.mockRestore();
    });
  });

  describe('UI Actions', () => {
    it('should show recovery UI', () => {
      slice.showRecoveryUI();
      expect(set).toHaveBeenCalledWith({ showRecoveryBanner: true });
    });

    it('should hide recovery UI', () => {
      slice.hideRecoveryUI();
      expect(set).toHaveBeenCalledWith({
        showRecoveryBanner: false,
        showRecoveryModal: false,
      });
    });

    it('should dismiss recovery', () => {
      slice.dismissRecovery();
      expect(set).toHaveBeenCalledWith({
        showRecoveryBanner: false,
        showRecoveryModal: false,
        restoreError: null,
      });
    });
  });

  describe('Session Restore', () => {
    beforeEach(() => {
      get.mockReturnValue({
        ...get(),
        availableSessions: mockSessions,
      });
    });

    it('should restore session successfully', async () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      await slice.selectSessionForRestore('session-1');

      expect(mockRecoveryDetection.executeRestoreFlow).toHaveBeenCalledWith('session-1');
      expect(set).toHaveBeenCalledWith({
        restoreInProgress: true,
        restoreProgress: 0,
        restoreError: null,
        showRecoveryModal: false,
      });
      expect(set).toHaveBeenCalledWith({
        restoreInProgress: false,
        restoreProgress: 100,
        showRecoveryBanner: false,
        showRecoveryModal: false,
      });
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery:restore-success',
        })
      );

      dispatchEventSpy.mockRestore();
    });

    it('should handle session not found', async () => {
      await slice.selectSessionForRestore('nonexistent');

      expect(set).toHaveBeenCalledWith({ restoreError: 'Session not found' });
      expect(mockRecoveryDetection.executeRestoreFlow).not.toHaveBeenCalled();
    });

    it('should handle restore failure', async () => {
      mockRecoveryDetection.executeRestoreFlow.mockResolvedValue({
        success: false,
        session: null,
        errors: ['Restore failed', 'Network error'],
        metrics: { totalTime: 50, storageTime: 10, backendTime: 0 },
      });

      await slice.selectSessionForRestore('session-1');

      expect(set).toHaveBeenCalledWith({
        restoreInProgress: false,
        restoreError: 'Restore failed, Network error',
      });
    });

    it('should handle restore exception', async () => {
      mockRecoveryDetection.executeRestoreFlow.mockRejectedValue(new Error('Network error'));

      await slice.selectSessionForRestore('session-1');

      expect(set).toHaveBeenCalledWith({
        restoreInProgress: false,
        restoreError: 'Network error',
      });
    });
  });

  describe('Auto-Restore Configuration', () => {
    it('should enable auto-restore', () => {
      slice.enableAutoRestore();

      expect(mockRecoveryDetection.updateConfig).toHaveBeenCalledWith({ autoRestore: true });
      expect(set).toHaveBeenCalledWith({ autoRestoreEnabled: true });
    });

    it('should disable auto-restore', () => {
      slice.disableAutoRestore();

      expect(mockRecoveryDetection.updateConfig).toHaveBeenCalledWith({ autoRestore: false });
      expect(set).toHaveBeenCalledWith({ autoRestoreEnabled: false });
    });
  });

  describe('Session Refresh', () => {
    it('should refresh recovery sessions', async () => {
      await slice.refreshRecoverySessions();

      expect(mockRecoveryDetection.detectRecoverySessions).toHaveBeenCalled();
      expect(set).toHaveBeenCalledWith({
        hasRecovery: true,
        availableSessions: mockSessions,
        lastDetection: expect.objectContaining({
          hasRecovery: true,
          sessions: mockSessions,
        }),
      });
    });

    it('should handle refresh failure', async () => {
      const error = new Error('Refresh failed');
      mockRecoveryDetection.detectRecoverySessions.mockRejectedValue(error);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await slice.refreshRecoverySessions();

      expect(set).toHaveBeenCalledWith({
        restoreError: 'Refresh failed',
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should set restore error', () => {
      slice.setRestoreError('Test error');
      expect(set).toHaveBeenCalledWith({ restoreError: 'Test error' });
    });

    it('should clear restore error', () => {
      slice.setRestoreError(null);
      expect(set).toHaveBeenCalledWith({ restoreError: null });
    });
  });

  describe('Event Handling', () => {
    let addEventListener: Mock;

    beforeEach(() => {
      addEventListener = vi.spyOn(window, 'addEventListener');
    });

    afterEach(() => {
      addEventListener.mockRestore();
    });

    it('should set up event listeners', () => {
      createRecoveryIntegrationSlice(set, get);

      expect(addEventListener).toHaveBeenCalledWith('recovery:detected', expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith('recovery:failure', expect.any(Function));
      expect(addEventListener).toHaveBeenCalledWith('recovery:auto-restore', expect.any(Function));
    });

    it('should handle recovery detected event', () => {
      const slice = createRecoveryIntegrationSlice(set, get);
      
      // Simulate event
      const event = new CustomEvent('recovery:detected', {
        detail: { sessions: mockSessions, source: 'local' }
      });

      // Get the event handler and call it
      const handler = addEventListener.mock.calls.find(call => 
        call[0] === 'recovery:detected'
      )?.[1];
      
      handler?.(event);

      expect(set).toHaveBeenCalledWith({
        hasRecovery: true,
        availableSessions: mockSessions,
        showRecoveryBanner: true,
      });
    });
  });
});

describe('Recovery Utils', () => {
  const mockSession: RecoverySession = {
    id: 'test-session-12345',
    name: 'Test Session',
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    backendToken: 'token-123',
    appState: {
      chunks: [
        { id: '1', text: 'chunk 1', status: 'completed' },
        { id: '2', text: 'chunk 2', status: 'pending' },
      ],
      parameters: { temperature: 0.8, top_p: 0.9 },
    },
  };

  describe('formatSessionForDisplay', () => {
    it('should format session for display', () => {
      const formatted = recoveryUtils.formatSessionForDisplay(mockSession);

      expect(formatted).toEqual({
        id: 'test-session-12345',
        name: 'Test Session',
        timestamp: new Date(mockSession.timestamp).toLocaleString(),
        hasBackendData: true,
        chunks: 2,
        parameters: { temperature: 0.8, top_p: 0.9 },
      });
    });

    it('should generate name from ID when no name provided', () => {
      const sessionWithoutName = { ...mockSession, name: undefined };
      const formatted = recoveryUtils.formatSessionForDisplay(sessionWithoutName);

      expect(formatted.name).toBe('Session test-ses');
    });

    it('should handle session without chunks', () => {
      const sessionWithoutChunks = {
        ...mockSession,
        appState: { parameters: { temperature: 0.8 } },
      };
      const formatted = recoveryUtils.formatSessionForDisplay(sessionWithoutChunks);

      expect(formatted.chunks).toBe(0);
    });
  });

  describe('getSessionAge', () => {
    it('should return "Just now" for recent timestamps', () => {
      const recentTimestamp = Date.now() - 30000; // 30 seconds ago
      expect(recoveryUtils.getSessionAge(recentTimestamp)).toBe('Just now');
    });

    it('should return minutes for timestamps within an hour', () => {
      const timestamp = Date.now() - 1000 * 60 * 15; // 15 minutes ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('15 minutes ago');
    });

    it('should return singular minute for 1 minute ago', () => {
      const timestamp = Date.now() - 1000 * 60 * 1; // 1 minute ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('1 minute ago');
    });

    it('should return hours for timestamps within a day', () => {
      const timestamp = Date.now() - 1000 * 60 * 60 * 3; // 3 hours ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('3 hours ago');
    });

    it('should return singular hour for 1 hour ago', () => {
      const timestamp = Date.now() - 1000 * 60 * 60 * 1; // 1 hour ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('1 hour ago');
    });

    it('should return days for older timestamps', () => {
      const timestamp = Date.now() - 1000 * 60 * 60 * 24 * 2; // 2 days ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('2 days ago');
    });

    it('should return singular day for 1 day ago', () => {
      const timestamp = Date.now() - 1000 * 60 * 60 * 24 * 1; // 1 day ago
      expect(recoveryUtils.getSessionAge(timestamp)).toBe('1 day ago');
    });
  });

  describe('validateSession', () => {
    it('should validate valid session', () => {
      const result = recoveryUtils.validateSession(mockSession);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing ID', () => {
      const invalidSession = { ...mockSession, id: '' };
      const result = recoveryUtils.validateSession(invalidSession);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Session missing ID');
    });

    it('should detect invalid timestamp', () => {
      const futureTimestamp = Date.now() + 1000 * 60 * 60; // 1 hour in future
      const invalidSession = { ...mockSession, timestamp: futureTimestamp };
      const result = recoveryUtils.validateSession(invalidSession);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid session timestamp');
    });

    it('should detect missing app state', () => {
      const invalidSession = { ...mockSession, appState: undefined };
      const result = recoveryUtils.validateSession(invalidSession);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Session missing app state');
    });

    it('should collect multiple errors', () => {
      const invalidSession = {
        ...mockSession,
        id: '',
        timestamp: 0,
        appState: undefined,
      };
      const result = recoveryUtils.validateSession(invalidSession);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Session missing ID');
      expect(result.errors).toContain('Invalid session timestamp');
      expect(result.errors).toContain('Session missing app state');
    });
  });
});