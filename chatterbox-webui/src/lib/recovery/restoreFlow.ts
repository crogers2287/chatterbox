/**
 * Recovery Detection and Restore Flow
 * 
 * Implements app initialization checks, recovery detection logic, and complete restore flow
 * that integrates UI components with backend token system.
 */

import { recoveryStorage } from '../storage';
import type { RecoverySession } from '../storage/types';

// Recovery detection performance target
const RECOVERY_DETECTION_TIMEOUT = 100; // 100ms target

export interface RestoreFlowConfig {
  /** Maximum time to wait for recovery detection in ms */
  detectionTimeout: number;
  /** Whether to auto-restore the most recent session */
  autoRestore: boolean;
  /** Maximum age of sessions to consider for recovery (ms) */
  maxSessionAge: number;
  /** Whether to validate sessions with backend tokens */
  validateWithBackend: boolean;
  /** Backend validation timeout in ms */
  backendTimeout: number;
}

export interface RecoveryDetectionResult {
  /** Whether recovery sessions were found */
  hasRecovery: boolean;
  /** Available recovery sessions */
  sessions: RecoverySession[];
  /** Time taken for detection in ms */
  detectionTime: number;
  /** Any errors encountered during detection */
  errors: string[];
  /** Source of recovery data */
  source: 'local' | 'server' | 'hybrid';
}

export interface RestoreResult {
  /** Whether restore was successful */
  success: boolean;
  /** Restored session data */
  session: RecoverySession | null;
  /** Any errors encountered during restore */
  errors: string[];
  /** Performance metrics */
  metrics: {
    totalTime: number;
    storageTime: number;
    backendTime: number;
  };
}

export class RecoveryDetectionSystem {
  private config: RestoreFlowConfig;
  private backendBaseUrl: string;

  constructor(config: Partial<RestoreFlowConfig> = {}, backendBaseUrl = '/api') {
    this.config = {
      detectionTimeout: RECOVERY_DETECTION_TIMEOUT,
      autoRestore: false,
      maxSessionAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      validateWithBackend: true,
      backendTimeout: 5000,
      ...config
    };
    this.backendBaseUrl = backendBaseUrl;
  }

  /**
   * Detect available recovery sessions on app startup
   * Performance target: < 100ms
   */
  async detectRecoverySessions(): Promise<RecoveryDetectionResult> {
    const startTime = performance.now();
    const result: RecoveryDetectionResult = {
      hasRecovery: false,
      sessions: [],
      detectionTime: 0,
      errors: [],
      source: 'local'
    };

    try {
      // Set up timeout for detection
      const detectionPromise = this.performDetection();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Detection timeout')), this.config.detectionTimeout);
      });

      // Race detection against timeout
      const sessions = await Promise.race([detectionPromise, timeoutPromise]);
      
      result.sessions = sessions;
      result.hasRecovery = sessions.length > 0;
      
      // Determine source based on session data
      if (sessions.some(s => s.backendToken)) {
        result.source = sessions.every(s => s.backendToken) ? 'server' : 'hybrid';
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown detection error';
      result.errors.push(errorMessage);
      
      console.warn('[RecoveryDetection] Detection failed:', errorMessage);
    } finally {
      result.detectionTime = performance.now() - startTime;
      
      // Warn if detection exceeds target
      if (result.detectionTime > this.config.detectionTimeout) {
        console.warn(
          `[RecoveryDetection] Detection took ${result.detectionTime.toFixed(2)}ms ` +
          `(target: ${this.config.detectionTimeout}ms)`
        );
      }
    }

    return result;
  }

  /**
   * Perform the actual detection logic
   */
  private async performDetection(): Promise<RecoverySession[]> {
    // Get sessions from local storage
    const localSessions = await recoveryStorage.getRecoverySessions();
    
    // Filter by age
    const maxAge = Date.now() - this.config.maxSessionAge;
    const validSessions = localSessions.filter(session => session.timestamp > maxAge);

    if (!this.config.validateWithBackend || validSessions.length === 0) {
      return validSessions;
    }

    // Validate sessions with backend if enabled
    try {
      const validatedSessions = await this.validateSessionsWithBackend(validSessions);
      return validatedSessions;
    } catch (error) {
      console.warn('[RecoveryDetection] Backend validation failed, using local sessions:', error);
      return validSessions;
    }
  }

  /**
   * Validate recovery sessions with backend token system
   */
  private async validateSessionsWithBackend(sessions: RecoverySession[]): Promise<RecoverySession[]> {
    const validatedSessions: RecoverySession[] = [];

    // Create validation promises for all sessions
    const validationPromises = sessions.map(async (session) => {
      if (!session.backendToken) {
        // Local-only session, keep as-is
        return session;
      }

      try {
        // Validate token with backend
        const response = await fetch(`${this.backendBaseUrl}/recovery/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.backendToken }),
          signal: AbortSignal.timeout(this.config.backendTimeout)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            return session;
          }
        }
        
        // Token invalid, remove backend reference but keep local data
        return {
          ...session,
          backendToken: undefined
        };
      } catch (error) {
        console.warn(`[RecoveryDetection] Failed to validate session ${session.id}:`, error);
        // On validation failure, keep local data
        return {
          ...session,
          backendToken: undefined
        };
      }
    });

    // Wait for all validations with overall timeout
    try {
      const results = await Promise.allSettled(validationPromises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          validatedSessions.push(result.value);
        }
      });
    } catch (error) {
      console.warn('[RecoveryDetection] Validation timeout, using original sessions');
      return sessions;
    }

    return validatedSessions;
  }

  /**
   * Execute complete restore flow for a recovery session
   */
  async executeRestoreFlow(sessionId: string): Promise<RestoreResult> {
    const startTime = performance.now();
    const result: RestoreResult = {
      success: false,
      session: null,
      errors: [],
      metrics: {
        totalTime: 0,
        storageTime: 0,
        backendTime: 0
      }
    };

    try {
      // Get session from storage
      const storageStartTime = performance.now();
      const session = await recoveryStorage.getRecoverySession(sessionId);
      result.metrics.storageTime = performance.now() - storageStartTime;

      if (!session) {
        throw new Error('Session not found');
      }

      // Restore from backend if token is available
      let restoredSession = session;
      if (session.backendToken) {
        const backendStartTime = performance.now();
        try {
          const backendSession = await this.restoreFromBackend(session.backendToken);
          restoredSession = this.mergeSessionData(session, backendSession);
        } catch (error) {
          result.errors.push(`Backend restore failed: ${error}`);
          console.warn('[RestoreFlow] Backend restore failed, using local data:', error);
        }
        result.metrics.backendTime = performance.now() - backendStartTime;
      }

      result.session = restoredSession;
      result.success = true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown restore error';
      result.errors.push(errorMessage);
      console.error('[RestoreFlow] Restore failed:', errorMessage);
    } finally {
      result.metrics.totalTime = performance.now() - startTime;
    }

    return result;
  }

  /**
   * Restore session data from backend using token
   */
  private async restoreFromBackend(token: string): Promise<Partial<RecoverySession>> {
    const response = await fetch(`${this.backendBaseUrl}/recovery/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(this.config.backendTimeout)
    });

    if (!response.ok) {
      throw new Error(`Backend restore failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.session;
  }

  /**
   * Merge local and backend session data
   */
  private mergeSessionData(local: RecoverySession, backend: Partial<RecoverySession>): RecoverySession {
    // Prefer backend data for state, local data for metadata
    return {
      ...local,
      ...backend,
      id: local.id, // Always use local ID
      timestamp: local.timestamp, // Keep local timestamp
      name: backend.name || local.name, // Prefer backend name if available
    };
  }

  /**
   * Get the most recent recovery session for auto-restore
   */
  async getMostRecentSession(): Promise<RecoverySession | null> {
    const detection = await this.detectRecoverySessions();
    
    if (!detection.hasRecovery) {
      return null;
    }

    // Sort by timestamp descending and return the most recent
    return detection.sessions.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  /**
   * Graceful degradation when recovery fails
   */
  async handleRecoveryFailure(error: Error, sessionId?: string): Promise<void> {
    console.error('[RestoreFlow] Recovery failed:', error);

    // Try to clean up corrupted session
    if (sessionId) {
      try {
        await recoveryStorage.removeRecoverySession(sessionId);
        console.log(`[RestoreFlow] Cleaned up corrupted session: ${sessionId}`);
      } catch (cleanupError) {
        console.warn(`[RestoreFlow] Failed to cleanup session ${sessionId}:`, cleanupError);
      }
    }

    // Emit recovery failure event for UI components to handle
    const event = new CustomEvent('recovery:failure', {
      detail: { error: error.message, sessionId }
    });
    window.dispatchEvent(event);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RestoreFlowConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): RestoreFlowConfig {
    return { ...this.config };
  }
}

// Global recovery detection system instance
export const recoveryDetection = new RecoveryDetectionSystem();

/**
 * App initialization hook for recovery detection
 */
export async function initializeRecoverySystem(): Promise<RecoveryDetectionResult> {
  console.log('[RestoreFlow] Initializing recovery system...');
  
  const detection = await recoveryDetection.detectRecoverySessions();
  
  if (detection.hasRecovery) {
    console.log(
      `[RestoreFlow] Found ${detection.sessions.length} recovery session(s) ` +
      `in ${detection.detectionTime.toFixed(2)}ms`
    );
    
    // Emit recovery detected event for UI components
    const event = new CustomEvent('recovery:detected', {
      detail: { sessions: detection.sessions, source: detection.source }
    });
    window.dispatchEvent(event);
  } else {
    console.log(`[RestoreFlow] No recovery sessions found (${detection.detectionTime.toFixed(2)}ms)`);
  }

  return detection;
}

/**
 * Auto-restore the most recent session if configured
 */
export async function autoRestoreIfEnabled(): Promise<RestoreResult | null> {
  if (!recoveryDetection.getConfig().autoRestore) {
    return null;
  }

  const session = await recoveryDetection.getMostRecentSession();
  if (!session) {
    return null;
  }

  console.log(`[RestoreFlow] Auto-restoring session: ${session.name || session.id}`);
  return recoveryDetection.executeRestoreFlow(session.id);
}