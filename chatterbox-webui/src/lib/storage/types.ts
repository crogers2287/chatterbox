/**
 * Core storage adapter interface for browser storage implementations
 */
export interface StorageAdapter {
  /**
   * Retrieve a value from storage
   * @param key The storage key
   * @returns The stored value or null if not found
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Store a value in storage
   * @param key The storage key
   * @param value The value to store
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * Delete a value from storage
   * @param key The storage key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all stored values
   */
  clear(): Promise<void>;

  /**
   * Get all storage keys
   * @returns Array of storage keys
   */
  getKeys(): Promise<string[]>;

  /**
   * Get storage size information
   * @returns Storage usage statistics
   */
  getStorageInfo(): Promise<StorageInfo>;

  /**
   * Check if storage is available and functional
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Storage usage information
 */
export interface StorageInfo {
  used: number;
  quota: number;
  available: number;
  percentUsed: number;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /**
   * Database name for IndexedDB
   */
  dbName?: string;

  /**
   * Storage version for migration support
   */
  version?: number;

  /**
   * Enable compression for large values
   */
  compression?: boolean;

  /**
   * Storage key prefix to avoid conflicts
   */
  keyPrefix?: string;

  /**
   * Maximum storage size in bytes before cleanup
   */
  maxSize?: number;

  /**
   * Enable cross-tab synchronization
   */
  syncAcrossTabs?: boolean;
}

/**
 * Storage event for cross-tab synchronization
 */
export interface StorageEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
  source: 'local' | 'remote';
}

/**
 * Storage error with additional context
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: StorageErrorCode,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Storage error codes
 */
export enum StorageErrorCode {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_DATA = 'INVALID_DATA',
  MIGRATION_FAILED = 'MIGRATION_FAILED',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Storage manager for handling multiple adapters with fallback
 */
export interface StorageManager extends StorageAdapter {
  /**
   * Get the currently active adapter
   */
  getActiveAdapter(): StorageAdapter;

  /**
   * Force a specific adapter
   */
  useAdapter(adapter: 'indexeddb' | 'localstorage'): void;

  /**
   * Add storage event listener
   */
  addEventListener(event: 'change', listener: (event: StorageEvent) => void): void;

  /**
   * Remove storage event listener
   */
  removeEventListener(event: 'change', listener: (event: StorageEvent) => void): void;
}