/**
 * Recovery System Integration
 * 
 * Provides a unified interface for recovery functionality including
 * auto-save, session management, and store integration.
 */

export * from './autoSave';

// Re-export storage types for convenience
export type { 
  RecoverySession, 
  RecoveryMetadata 
} from '../storage';

export { 
  recoveryStorage,
  RecoveryUtils 
} from '../storage';