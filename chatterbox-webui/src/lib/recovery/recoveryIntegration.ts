/**
 * Recovery Integration
 * 
 * Integrates recovery detection and restore flow with UI components and Zustand store
 */

import { recoveryDetection, initializeRecoverySystem, autoRestoreIfEnabled } from './restoreFlow';
import type { RecoveryDetectionResult, RestoreResult } from './restoreFlow';
import type { RecoverySession } from '../storage/types';

export interface RecoveryState {
  isInitialized: boolean;
  hasRecovery: boolean;
  availableSessions: RecoverySession[];
  restoreInProgress: boolean;
  restoreProgress: number;
  restoreError: string | null;
  showRecoveryBanner: boolean;
  showRecoveryModal: boolean;
  autoRestoreEnabled: boolean;
  lastDetection: RecoveryDetectionResult | null;
}

export interface RecoveryActions {
  initializeRecovery: () => Promise<void>;
  showRecoveryUI: () => void;
  hideRecoveryUI: () => void;
  selectSessionForRestore: (sessionId: string) => Promise<void>;
  dismissRecovery: () => void;
  enableAutoRestore: () => void;
  disableAutoRestore: () => void;
  refreshRecoverySessions: () => Promise<void>;
  setRestoreError: (error: string | null) => void;
}

export type RecoveryIntegrationState = RecoveryState & RecoveryActions;

/**
 * Recovery slice for Zustand store
 */
export const createRecoveryIntegrationSlice = (
  set: any,
  get: any
): RecoveryIntegrationState => {
  // Set up event listeners for recovery events
  const setupEventListeners = () => {
    // Recovery detected event
    window.addEventListener('recovery:detected', (event: CustomEvent) => {
      const { sessions, source } = event.detail;
      set({
        hasRecovery: true,
        availableSessions: sessions,
        showRecoveryBanner: true,
      });
    });

    // Recovery failure event
    window.addEventListener('recovery:failure', (event: CustomEvent) => {
      const { error, sessionId } = event.detail;
      set({
        restoreError: error,
        restoreInProgress: false,
      });
    });

    // Auto-restore completion event
    window.addEventListener('recovery:auto-restore', (event: CustomEvent) => {
      const { success, session, errors } = event.detail;
      if (success) {
        set({
          restoreInProgress: false,
          showRecoveryBanner: false,
        });
      } else {
        set({
          restoreError: errors.join(', '),
          restoreInProgress: false,
        });
      }
    });
  };

  // Initialize event listeners
  setupEventListeners();

  return {
    // State
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

    // Actions
    initializeRecovery: async () => {
      try {
        set({ restoreInProgress: true, restoreProgress: 10 });

        // Initialize recovery detection system
        const detection = await initializeRecoverySystem();
        
        set({ 
          lastDetection: detection,
          restoreProgress: 50,
        });

        // Try auto-restore if enabled
        const state = get();
        if (state.autoRestoreEnabled) {
          set({ restoreProgress: 75 });
          
          const autoRestoreResult = await autoRestoreIfEnabled();
          if (autoRestoreResult) {
            // Emit auto-restore completion event
            const event = new CustomEvent('recovery:auto-restore', {
              detail: autoRestoreResult
            });
            window.dispatchEvent(event);
          }
        }

        set({
          isInitialized: true,
          hasRecovery: detection.hasRecovery,
          availableSessions: detection.sessions,
          restoreInProgress: false,
          restoreProgress: 100,
        });

      } catch (error) {
        console.error('[RecoveryIntegration] Initialization failed:', error);
        set({
          isInitialized: true,
          restoreInProgress: false,
          restoreError: error instanceof Error ? error.message : 'Initialization failed',
        });
      }
    },

    showRecoveryUI: () => {
      set({ showRecoveryBanner: true });
    },

    hideRecoveryUI: () => {
      set({
        showRecoveryBanner: false,
        showRecoveryModal: false,
      });
    },

    selectSessionForRestore: async (sessionId: string) => {
      const state = get();
      const session = state.availableSessions.find((s: RecoverySession) => s.id === sessionId);
      
      if (!session) {
        set({ restoreError: 'Session not found' });
        return;
      }

      try {
        set({
          restoreInProgress: true,
          restoreProgress: 0,
          restoreError: null,
          showRecoveryModal: false,
        });

        // Execute restore flow with progress tracking
        const progressInterval = setInterval(() => {
          const currentProgress = get().restoreProgress;
          if (currentProgress < 90) {
            set({ restoreProgress: currentProgress + 10 });
          }
        }, 200);

        const result = await recoveryDetection.executeRestoreFlow(sessionId);

        clearInterval(progressInterval);

        if (result.success && result.session) {
          // Restore was successful, update app state
          set({
            restoreInProgress: false,
            restoreProgress: 100,
            showRecoveryBanner: false,
            showRecoveryModal: false,
          });

          // Apply restored session to the main app store
          await applyRestoredSession(result.session);

          // Emit restore success event
          const event = new CustomEvent('recovery:restore-success', {
            detail: { session: result.session, metrics: result.metrics }
          });
          window.dispatchEvent(event);

        } else {
          // Restore failed
          set({
            restoreInProgress: false,
            restoreError: result.errors.join(', ') || 'Unknown restore error',
          });
        }

      } catch (error) {
        set({
          restoreInProgress: false,
          restoreError: error instanceof Error ? error.message : 'Restore failed',
        });
      }
    },

    dismissRecovery: () => {
      set({
        showRecoveryBanner: false,
        showRecoveryModal: false,
        restoreError: null,
      });
    },

    enableAutoRestore: () => {
      recoveryDetection.updateConfig({ autoRestore: true });
      set({ autoRestoreEnabled: true });
    },

    disableAutoRestore: () => {
      recoveryDetection.updateConfig({ autoRestore: false });
      set({ autoRestoreEnabled: false });
    },

    refreshRecoverySessions: async () => {
      try {
        const detection = await recoveryDetection.detectRecoverySessions();
        set({
          hasRecovery: detection.hasRecovery,
          availableSessions: detection.sessions,
          lastDetection: detection,
        });
      } catch (error) {
        console.error('[RecoveryIntegration] Failed to refresh sessions:', error);
        set({
          restoreError: error instanceof Error ? error.message : 'Failed to refresh sessions',
        });
      }
    },

    setRestoreError: (error: string | null) => {
      set({ restoreError: error });
    },
  };
};

/**
 * Apply restored session data to the main app store
 */
async function applyRestoredSession(session: RecoverySession): Promise<void> {
  try {
    // This would typically be implemented by the main store
    // For now, we'll emit an event that the main store can listen to
    const event = new CustomEvent('recovery:apply-session', {
      detail: { session }
    });
    window.dispatchEvent(event);

    console.log(`[RecoveryIntegration] Applied restored session: ${session.name || session.id}`);
  } catch (error) {
    console.error('[RecoveryIntegration] Failed to apply restored session:', error);
    throw error;
  }
}

/**
 * Hook for app initialization that sets up recovery
 */
export async function initializeAppRecovery(): Promise<void> {
  console.log('[RecoveryIntegration] Starting app recovery initialization...');
  
  try {
    // This would be called from the main app initialization
    const event = new CustomEvent('recovery:initialize');
    window.dispatchEvent(event);
  } catch (error) {
    console.error('[RecoveryIntegration] App recovery initialization failed:', error);
  }
}

/**
 * Utility functions for recovery UI components
 */
export const recoveryUtils = {
  /**
   * Format session for display in UI components
   */
  formatSessionForDisplay: (session: RecoverySession) => ({
    id: session.id,
    name: session.name || `Session ${session.id.slice(0, 8)}`,
    timestamp: new Date(session.timestamp).toLocaleString(),
    hasBackendData: !!session.backendToken,
    chunks: session.appState?.chunks?.length || 0,
    parameters: session.appState?.parameters || {},
  }),

  /**
   * Calculate session age in human readable format
   */
  getSessionAge: (timestamp: number): string => {
    const ageMs = Date.now() - timestamp;
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);

    if (ageDays > 0) {
      return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
    } else if (ageHours > 0) {
      return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
    } else if (ageMinutes > 0) {
      return `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  },

  /**
   * Validate session before restore
   */
  validateSession: (session: RecoverySession): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!session.id) {
      errors.push('Session missing ID');
    }

    if (!session.timestamp || session.timestamp > Date.now()) {
      errors.push('Invalid session timestamp');
    }

    if (!session.appState) {
      errors.push('Session missing app state');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};