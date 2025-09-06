/**
 * Recovery-specific storage utilities for Chatterbox TTS
 * Implements the session recovery patterns required by the app-recovery epic
 */

import { storageManager } from './storage-manager';
import type { StorageError, StorageErrorCode } from './types';

export interface RecoverySession {
  id: string;
  timestamp: number;
  text: string;
  parameters: {
    voice?: string;
    temperature: number;
    speed: number;
    [key: string]: unknown;
  };
  voiceId?: string;
  audioChunks: Array<{
    id: string;
    text: string;
    audioUrl?: string;
    audioData?: string;
    status: 'pending' | 'generating' | 'completed' | 'error';
    duration?: number;
  }>;
  metadata?: {
    userAgent?: string;
    createdAt: number;
    lastUpdated: number;
    version: string;
  };
}

export interface RecoveryMetadata {
  sessionId: string;
  timestamp: number;
  isActive: boolean;
  chunkCount: number;
  completedChunks: number;
  totalDuration?: number;
}

/**
 * Recovery storage manager for session persistence
 */
export class RecoveryStorage {
  private readonly SESSION_KEY_PREFIX = 'recovery_session_';
  private readonly METADATA_KEY = 'recovery_metadata';
  private readonly ACTIVE_SESSION_KEY = 'active_session';
  private readonly MAX_SESSIONS = 10; // Keep last 10 sessions

  /**
   * Save a recovery session to storage
   */
  async saveSession(session: RecoverySession): Promise<void> {
    try {
      const key = `${this.SESSION_KEY_PREFIX}${session.id}`;
      
      // Update metadata
      session.metadata = {
        ...session.metadata,
        lastUpdated: Date.now(),
        version: '1.0',
        userAgent: navigator.userAgent
      };

      await storageManager.set(key, session);
      await this.updateMetadata(session.id, true);
    } catch (error) {
      console.error('Failed to save recovery session:', error);
      throw error;
    }
  }

  /**
   * Retrieve a recovery session by ID
   */
  async getSession(sessionId: string): Promise<RecoverySession | null> {
    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      return await storageManager.get<RecoverySession>(key);
    } catch (error) {
      console.error('Failed to retrieve recovery session:', error);
      return null;
    }
  }

  /**
   * Get the currently active session
   */
  async getActiveSession(): Promise<RecoverySession | null> {
    try {
      const activeSessionId = await storageManager.get<string>(this.ACTIVE_SESSION_KEY);
      if (!activeSessionId) return null;
      
      return await this.getSession(activeSessionId);
    } catch (error) {
      console.error('Failed to get active session:', error);
      return null;
    }
  }

  /**
   * Set the active session
   */
  async setActiveSession(sessionId: string): Promise<void> {
    try {
      await storageManager.set(this.ACTIVE_SESSION_KEY, sessionId);
      await this.updateMetadata(sessionId, true);
    } catch (error) {
      console.error('Failed to set active session:', error);
      throw error;
    }
  }

  /**
   * Clear the active session
   */
  async clearActiveSession(): Promise<void> {
    try {
      await storageManager.delete(this.ACTIVE_SESSION_KEY);
    } catch (error) {
      console.error('Failed to clear active session:', error);
    }
  }

  /**
   * Get all recovery sessions
   */
  async getAllSessions(): Promise<RecoverySession[]> {
    try {
      const keys = await storageManager.getKeys();
      const sessionKeys = keys.filter(key => key.startsWith(this.SESSION_KEY_PREFIX));
      
      const sessions = await Promise.all(
        sessionKeys.map(key => storageManager.get<RecoverySession>(key))
      );
      
      return sessions
        .filter((session): session is RecoverySession => session !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Failed to get all sessions:', error);
      return [];
    }
  }

  /**
   * Delete a recovery session
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const key = `${this.SESSION_KEY_PREFIX}${sessionId}`;
      await storageManager.delete(key);
      
      // If this was the active session, clear it
      const activeSessionId = await storageManager.get<string>(this.ACTIVE_SESSION_KEY);
      if (activeSessionId === sessionId) {
        await this.clearActiveSession();
      }
      
      await this.updateMetadata(sessionId, false);
    } catch (error) {
      console.error('Failed to delete recovery session:', error);
      throw error;
    }
  }

  /**
   * Clean up old sessions (keep only the most recent ones)
   */
  async cleanupOldSessions(): Promise<number> {
    try {
      const sessions = await this.getAllSessions();
      
      if (sessions.length <= this.MAX_SESSIONS) {
        return 0;
      }

      const sessionsToDelete = sessions.slice(this.MAX_SESSIONS);
      let deletedCount = 0;

      for (const session of sessionsToDelete) {
        try {
          await this.deleteSession(session.id);
          deletedCount++;
        } catch (error) {
          console.warn(`Failed to delete old session ${session.id}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old sessions:', error);
      return 0;
    }
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    totalSessions: number;
    activeSession: string | null;
    oldestSession: number | null;
    newestSession: number | null;
    storageUsed: number;
  }> {
    try {
      const sessions = await this.getAllSessions();
      const activeSessionId = await storageManager.get<string>(this.ACTIVE_SESSION_KEY);
      const storageInfo = await storageManager.getStorageInfo();
      
      return {
        totalSessions: sessions.length,
        activeSession: activeSessionId,
        oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.timestamp)) : null,
        newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.timestamp)) : null,
        storageUsed: storageInfo.used
      };
    } catch (error) {
      console.error('Failed to get recovery stats:', error);
      return {
        totalSessions: 0,
        activeSession: null,
        oldestSession: null,
        newestSession: null,
        storageUsed: 0
      };
    }
  }

  /**
   * Update session metadata
   */
  private async updateMetadata(sessionId: string, isActive: boolean): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return;

      const metadata: RecoveryMetadata = {
        sessionId,
        timestamp: session.timestamp,
        isActive,
        chunkCount: session.audioChunks.length,
        completedChunks: session.audioChunks.filter(chunk => chunk.status === 'completed').length,
        totalDuration: session.audioChunks.reduce((total, chunk) => 
          total + (chunk.duration || 0), 0
        )
      };

      const allMetadata = await storageManager.get<RecoveryMetadata[]>(this.METADATA_KEY) || [];
      const existingIndex = allMetadata.findIndex(m => m.sessionId === sessionId);
      
      if (existingIndex >= 0) {
        allMetadata[existingIndex] = metadata;
      } else {
        allMetadata.push(metadata);
      }

      await storageManager.set(this.METADATA_KEY, allMetadata);
    } catch (error) {
      console.warn('Failed to update session metadata:', error);
    }
  }

  /**
   * Check if recovery is available
   */
  async isRecoveryAvailable(): Promise<boolean> {
    try {
      const isAvailable = await storageManager.isAvailable();
      if (!isAvailable) return false;

      const sessions = await this.getAllSessions();
      return sessions.length > 0;
    } catch (error) {
      console.error('Failed to check recovery availability:', error);
      return false;
    }
  }

  /**
   * Export sessions for backup
   */
  async exportSessions(): Promise<string> {
    try {
      const sessions = await this.getAllSessions();
      const stats = await this.getRecoveryStats();
      
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        stats,
        sessions
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export sessions:', error);
      throw error;
    }
  }

  /**
   * Import sessions from backup
   */
  async importSessions(exportData: string): Promise<number> {
    try {
      const data = JSON.parse(exportData);
      
      if (!data.sessions || !Array.isArray(data.sessions)) {
        throw new Error('Invalid export data format');
      }

      let importedCount = 0;
      for (const session of data.sessions) {
        try {
          await this.saveSession(session);
          importedCount++;
        } catch (error) {
          console.warn(`Failed to import session ${session.id}:`, error);
        }
      }

      return importedCount;
    } catch (error) {
      console.error('Failed to import sessions:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const recoveryStorage = new RecoveryStorage();

// Export utility functions
export const RecoveryUtils = {
  /**
   * Create a new recovery session from current state
   */
  createSession: (
    id: string,
    text: string,
    parameters: RecoverySession['parameters'],
    audioChunks: RecoverySession['audioChunks'] = [],
    voiceId?: string
  ): RecoverySession => ({
    id,
    timestamp: Date.now(),
    text,
    parameters,
    voiceId,
    audioChunks,
    metadata: {
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      version: '1.0',
      userAgent: navigator.userAgent
    }
  }),

  /**
   * Check if a session is recoverable (has content worth recovering)
   */
  isSessionRecoverable: (session: RecoverySession): boolean => {
    return (
      session.text.trim().length > 0 ||
      session.audioChunks.some(chunk => chunk.status === 'completed')
    );
  },

  /**
   * Calculate session progress
   */
  calculateProgress: (session: RecoverySession): number => {
    if (session.audioChunks.length === 0) return 0;
    
    const completed = session.audioChunks.filter(chunk => chunk.status === 'completed').length;
    return Math.round((completed / session.audioChunks.length) * 100);
  },

  /**
   * Get session duration
   */
  getSessionDuration: (session: RecoverySession): number => {
    return session.audioChunks.reduce((total, chunk) => total + (chunk.duration || 0), 0);
  },

  /**
   * Format session for display
   */
  formatSessionSummary: (session: RecoverySession): string => {
    const progress = RecoveryUtils.calculateProgress(session);
    const duration = RecoveryUtils.getSessionDuration(session);
    const date = new Date(session.timestamp).toLocaleString();
    
    return `${session.text.substring(0, 50)}... (${progress}% complete, ${duration}s, ${date})`;
  }
};