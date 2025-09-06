/**
 * Browser Storage Implementation for Chatterbox
 * 
 * Provides a robust storage solution with:
 * - IndexedDB primary storage
 * - localStorage fallback
 * - Automatic quota management
 * - Cross-tab synchronization
 * - Error resilience
 */

export * from './types';
export { IndexedDBAdapter } from './indexeddb-adapter';
export { LocalStorageAdapter } from './localstorage-adapter';
export { StorageManager, storageManager } from './storage-manager';
export { RecoveryStorage, recoveryStorage, RecoveryUtils } from './recovery-utils';
export type { RecoverySession, RecoveryMetadata } from './recovery-utils';

// Re-export commonly used items for convenience
export type {
  StorageAdapter,
  StorageConfig,
  StorageEvent,
  StorageInfo,
  StorageManager as IStorageManager,
} from './types';

export { StorageError, StorageErrorCode } from './types';