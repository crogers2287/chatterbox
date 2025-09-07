/**
 * Recovery System Integration
 * 
 * Provides a unified interface for recovery functionality including
 * auto-save, session management, restore flow, and store integration.
 */

// Core auto-save functionality
export * from './autoSave';

// Recovery detection and restore flow
export * from './restoreFlow';

// Store integration and UI event handling
export * from './recoveryIntegration';

// App initialization with recovery
export * from './appInitialization';

// Cleanup functionality (if exists)
export * from './cleanup';

// Re-export storage types for convenience
export type { 
  RecoverySession, 
  RecoveryMetadata 
} from '../storage';

export { 
  recoveryStorage,
  RecoveryUtils 
} from '../storage';