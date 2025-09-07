import type { StateCreator } from 'zustand';
import type { RecoverySession, RecoveryMetadata } from '../../storage';
import { recoveryStorage } from '../../storage';

export interface RecoveryState {
  // Recovery sessions
  availableSessions: RecoverySession[];
  
  // Restore process
  restoreInProgress: boolean;
  restoreProgress: number;
  restoreError: string | null;
  
  // UI state
  showRecoveryBanner: boolean;
  showRecoveryModal: boolean;
  
  // Session management
  lastAutoSaveTime: number | null;
  autoSaveEnabled: boolean;
  autoSaveInterval: number; // in seconds
}

export interface RecoveryActions {
  // Session discovery
  discoverRecoverySessions: () => Promise<void>;
  
  // Restore operations
  restoreSession: (sessionId: string) => Promise<void>;
  dismissRecovery: (sessionId?: string) => Promise<void>;
  dismissAllRecovery: () => Promise<void>;
  
  // UI management
  setShowRecoveryBanner: (show: boolean) => void;
  setShowRecoveryModal: (show: boolean) => void;
  
  // Auto-save configuration
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveInterval: (interval: number) => void;
  
  // Internal state updates
  setRestoreInProgress: (inProgress: boolean) => void;
  setRestoreProgress: (progress: number) => void;
  setRestoreError: (error: string | null) => void;
}

export type RecoverySlice = RecoveryState & RecoveryActions;

export const createRecoverySlice: StateCreator<
  RecoverySlice,
  [],
  [],
  RecoverySlice
> = (set, get) => ({
  // Initial state
  availableSessions: [],
  restoreInProgress: false,
  restoreProgress: 0,
  restoreError: null,
  showRecoveryBanner: false,
  showRecoveryModal: false,
  lastAutoSaveTime: null,
  autoSaveEnabled: true,
  autoSaveInterval: 2, // 2 seconds default
  
  // Actions
  discoverRecoverySessions: async () => {
    try {
      const sessions = await recoveryStorage.getAvailableSessions();
      
      // Filter out sessions that are too old or invalid
      const validSessions = sessions.filter(session => {
        // Only show sessions from the last 24 hours
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
        const sessionAge = Date.now() - session.metadata.lastUpdated;
        return sessionAge < maxAge;
      });
      
      set({ 
        availableSessions: validSessions,
        showRecoveryBanner: validSessions.length > 0
      });
    } catch (error) {
      console.error('[Recovery] Failed to discover sessions:', error);
      set({ 
        availableSessions: [],
        restoreError: 'Failed to discover recovery sessions'
      });
    }
  },
  
  restoreSession: async (sessionId: string) => {
    const { availableSessions } = get();
    const session = availableSessions.find(s => s.id === sessionId);
    
    if (!session) {
      set({ restoreError: 'Session not found' });
      return;
    }
    
    set({ 
      restoreInProgress: true, 
      restoreProgress: 0, 
      restoreError: null 
    });
    
    try {
      // Simulate progress updates during restore
      set({ restoreProgress: 25 });
      
      // Restore state data
      if (session.stateData) {
        // The actual state restoration will be handled by the main store
        // This slice just manages the UI state
        set({ restoreProgress: 75 });
      }
      
      set({ restoreProgress: 100 });
      
      // Mark session as consumed
      await recoveryStorage.markSessionAsUsed(sessionId);
      
      // Update available sessions
      const updatedSessions = availableSessions.filter(s => s.id !== sessionId);
      set({ 
        availableSessions: updatedSessions,
        showRecoveryBanner: updatedSessions.length > 0,
        showRecoveryModal: false,
        restoreInProgress: false,
        restoreProgress: 0
      });
      
    } catch (error) {
      console.error('[Recovery] Failed to restore session:', error);
      set({ 
        restoreError: error instanceof Error ? error.message : 'Unknown error',
        restoreInProgress: false,
        restoreProgress: 0
      });
    }
  },
  
  dismissRecovery: async (sessionId?: string) => {
    const { availableSessions } = get();
    
    if (sessionId) {
      // Dismiss specific session
      try {
        await recoveryStorage.markSessionAsUsed(sessionId);
        const updatedSessions = availableSessions.filter(s => s.id !== sessionId);
        set({ 
          availableSessions: updatedSessions,
          showRecoveryBanner: updatedSessions.length > 0
        });
      } catch (error) {
        console.error('[Recovery] Failed to dismiss session:', error);
      }
    } else {
      // Just hide the UI
      set({ showRecoveryBanner: false, showRecoveryModal: false });
    }
  },
  
  dismissAllRecovery: async () => {
    const { availableSessions } = get();
    
    try {
      // Mark all sessions as used
      await Promise.all(
        availableSessions.map(session => 
          recoveryStorage.markSessionAsUsed(session.id)
        )
      );
      
      set({ 
        availableSessions: [],
        showRecoveryBanner: false,
        showRecoveryModal: false
      });
    } catch (error) {
      console.error('[Recovery] Failed to dismiss all sessions:', error);
    }
  },
  
  // UI management
  setShowRecoveryBanner: (show) => set({ showRecoveryBanner: show }),
  setShowRecoveryModal: (show) => set({ showRecoveryModal: show }),
  
  // Auto-save configuration
  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
  setAutoSaveInterval: (interval) => set({ autoSaveInterval: interval }),
  
  // Internal state updates
  setRestoreInProgress: (inProgress) => set({ restoreInProgress: inProgress }),
  setRestoreProgress: (progress) => set({ restoreProgress: progress }),
  setRestoreError: (error) => set({ restoreError: error }),
});