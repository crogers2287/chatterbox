import {
  StorageAdapter,
  StorageConfig,
  StorageError,
  StorageErrorCode,
  StorageInfo,
} from './types';

/**
 * LocalStorage adapter for browser storage
 * Provides a fallback when IndexedDB is not available
 */
export class LocalStorageAdapter implements StorageAdapter {
  private config: StorageConfig;
  private storageEventHandler: ((event: StorageEvent) => void) | null = null;

  constructor(config: StorageConfig = {}) {
    this.config = config;
    
    // Set up cross-tab synchronization if enabled
    if (this.config.syncAcrossTabs && typeof window !== 'undefined') {
      this.setupStorageListener();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key);
      const item = localStorage.getItem(fullKey);

      if (!item) {
        return null;
      }

      try {
        const parsed = JSON.parse(item);
        
        // Handle wrapped values with metadata
        if (parsed && typeof parsed === 'object' && 'value' in parsed) {
          return parsed.value as T;
        }
        
        return parsed as T;
      } catch {
        // If parsing fails, return as string
        return item as unknown as T;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new StorageError(
          'Permission denied to access localStorage',
          StorageErrorCode.PERMISSION_DENIED,
          error
        );
      }
      throw new StorageError(
        'Failed to get value from localStorage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      
      // Wrap value with metadata
      const wrappedValue = {
        value,
        timestamp: Date.now(),
        size: 0, // Will be calculated after stringification
      };

      const serialized = JSON.stringify(wrappedValue);
      wrappedValue.size = new Blob([serialized]).size;
      
      // Check if we need to make room
      if (this.config.maxSize) {
        await this.ensureSpace(wrappedValue.size);
      }

      try {
        localStorage.setItem(fullKey, JSON.stringify(wrappedValue));
      } catch (error) {
        if (error instanceof DOMException) {
          if (error.name === 'QuotaExceededError' || error.code === 22) {
            // Try to free up space and retry once
            await this.freeSpace(wrappedValue.size);
            localStorage.setItem(fullKey, JSON.stringify(wrappedValue));
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'QuotaExceededError' || error.code === 22) {
          throw new StorageError(
            'Storage quota exceeded',
            StorageErrorCode.QUOTA_EXCEEDED,
            error
          );
        } else if (error.name === 'SecurityError') {
          throw new StorageError(
            'Permission denied to access localStorage',
            StorageErrorCode.PERMISSION_DENIED,
            error
          );
        }
      }
      throw new StorageError(
        'Failed to set value in localStorage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      localStorage.removeItem(fullKey);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new StorageError(
          'Permission denied to access localStorage',
          StorageErrorCode.PERMISSION_DENIED,
          error
        );
      }
      throw new StorageError(
        'Failed to delete value from localStorage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async clear(): Promise<void> {
    try {
      const prefix = this.config.keyPrefix || '';
      
      if (prefix) {
        // Clear only items with our prefix
        const keys = await this.getKeys();
        for (const key of keys) {
          await this.delete(key);
        }
      } else {
        // Clear all localStorage
        localStorage.clear();
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new StorageError(
          'Permission denied to access localStorage',
          StorageErrorCode.PERMISSION_DENIED,
          error
        );
      }
      throw new StorageError(
        'Failed to clear localStorage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async getKeys(): Promise<string[]> {
    try {
      const prefix = this.config.keyPrefix || '';
      const keys: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key.substring(prefix.length));
        }
      }

      return keys;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        throw new StorageError(
          'Permission denied to access localStorage',
          StorageErrorCode.PERMISSION_DENIED,
          error
        );
      }
      throw new StorageError(
        'Failed to get keys from localStorage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    try {
      let used = 0;
      const prefix = this.config.keyPrefix || '';

      // Calculate size of our items
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (!prefix || key.startsWith(prefix))) {
          const value = localStorage.getItem(key);
          if (value) {
            used += new Blob([key, value]).size;
          }
        }
      }

      // Estimate quota (localStorage typically has 5-10MB limit)
      // This is a rough estimate as there's no standard API for localStorage quota
      const estimatedQuota = 5 * 1024 * 1024; // 5MB
      
      return {
        used,
        quota: estimatedQuota,
        available: Math.max(0, estimatedQuota - used),
        percentUsed: (used / estimatedQuota) * 100,
      };
    } catch {
      return {
        used: 0,
        quota: 0,
        available: 0,
        percentUsed: 0,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const testKey = '__localStorage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full key with prefix
   */
  private getFullKey(key: string): string {
    const prefix = this.config.keyPrefix || '';
    return `${prefix}${key}`;
  }

  /**
   * Ensure there's enough space for new data
   */
  private async ensureSpace(requiredSize: number): Promise<void> {
    const info = await this.getStorageInfo();
    
    if (info.available < requiredSize) {
      await this.freeSpace(requiredSize - info.available);
    }
  }

  /**
   * Free up space by removing old items
   */
  private async freeSpace(targetSize: number): Promise<void> {
    const prefix = this.config.keyPrefix || '';
    const items: Array<{ key: string; timestamp: number; size: number }> = [];

    // Collect all items with metadata
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && 'timestamp' in parsed) {
              items.push({
                key,
                timestamp: parsed.timestamp || 0,
                size: new Blob([value]).size,
              });
            }
          }
        } catch {
          // Skip invalid items
        }
      }
    }

    // Sort by timestamp (oldest first)
    items.sort((a, b) => a.timestamp - b.timestamp);

    // Remove items until we have enough space
    let freedSpace = 0;
    for (const item of items) {
      if (freedSpace >= targetSize) {
        break;
      }
      localStorage.removeItem(item.key);
      freedSpace += item.size;
    }

    if (freedSpace < targetSize) {
      throw new StorageError(
        'Unable to free enough space',
        StorageErrorCode.QUOTA_EXCEEDED
      );
    }
  }

  /**
   * Set up listener for cross-tab synchronization
   */
  private setupStorageListener(): void {
    this.storageEventHandler = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith(this.config.keyPrefix || '')) {
        return;
      }

      // Broadcast to any listeners via BroadcastChannel if available
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('chatterbox-storage');
        channel.postMessage({
          key: event.key.substring((this.config.keyPrefix || '').length),
          oldValue: event.oldValue ? JSON.parse(event.oldValue).value : null,
          newValue: event.newValue ? JSON.parse(event.newValue).value : null,
          timestamp: Date.now(),
          source: 'remote',
        });
        channel.close();
      }
    };

    window.addEventListener('storage', this.storageEventHandler);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.storageEventHandler) {
      window.removeEventListener('storage', this.storageEventHandler);
      this.storageEventHandler = null;
    }
  }
}