import {
  StorageAdapter,
  StorageConfig,
  StorageError,
  StorageErrorCode,
  StorageInfo,
} from './types';

/**
 * IndexedDB adapter for browser storage
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private version: number;
  private storeName = 'keyValueStore';
  private db: IDBDatabase | null = null;
  private config: StorageConfig;

  constructor(config: StorageConfig = {}) {
    this.config = config;
    this.dbName = config.dbName || 'ChatterboxStorage';
    this.version = config.version || 1;
  }

  /**
   * Initialize the IndexedDB connection
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(
          new StorageError(
            'Failed to open IndexedDB',
            StorageErrorCode.NOT_AVAILABLE,
            request.error || undefined
          )
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, { keyPath: 'key' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('size', 'size', { unique: false });
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const fullKey = this.getFullKey(key);

      return new Promise((resolve, reject) => {
        const request = store.get(fullKey);

        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }

          try {
            const value = this.config.compression
              ? this.decompress(result.value)
              : result.value;
            resolve(value as T);
          } catch (error) {
            reject(
              new StorageError(
                'Failed to parse stored value',
                StorageErrorCode.INVALID_DATA,
                error as Error
              )
            );
          }
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'Failed to get value from IndexedDB',
              StorageErrorCode.UNKNOWN,
              request.error || undefined
            )
          );
        };
      });
    } catch (error) {
      throw new StorageError(
        'Failed to get value',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const fullKey = this.getFullKey(key);

      const storedValue = this.config.compression
        ? this.compress(value)
        : value;

      const data = {
        key: fullKey,
        value: storedValue,
        timestamp: Date.now(),
        size: this.getSize(storedValue),
      };

      return new Promise((resolve, reject) => {
        const request = store.put(data);

        request.onsuccess = () => {
          resolve();
          
          // Trigger storage event for cross-tab sync if enabled
          if (this.config.syncAcrossTabs) {
            this.broadcastStorageEvent(key, null, value);
          }
        };

        request.onerror = () => {
          const error = request.error;
          let errorCode = StorageErrorCode.UNKNOWN;

          if (error?.name === 'QuotaExceededError') {
            errorCode = StorageErrorCode.QUOTA_EXCEEDED;
          }

          reject(
            new StorageError(
              'Failed to set value in IndexedDB',
              errorCode,
              error || undefined
            )
          );
        };
      });
    } catch (error) {
      throw new StorageError(
        'Failed to set value',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const fullKey = this.getFullKey(key);

      const oldValue = await this.get(key);

      return new Promise((resolve, reject) => {
        const request = store.delete(fullKey);

        request.onsuccess = () => {
          resolve();
          
          if (this.config.syncAcrossTabs && oldValue !== null) {
            this.broadcastStorageEvent(key, oldValue, null);
          }
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'Failed to delete value from IndexedDB',
              StorageErrorCode.UNKNOWN,
              request.error || undefined
            )
          );
        };
      });
    } catch (error) {
      throw new StorageError(
        'Failed to delete value',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
          
          if (this.config.syncAcrossTabs) {
            this.broadcastStorageEvent('*', null, null);
          }
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'Failed to clear IndexedDB',
              StorageErrorCode.UNKNOWN,
              request.error || undefined
            )
          );
        };
      });
    } catch (error) {
      throw new StorageError(
        'Failed to clear storage',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async getKeys(): Promise<string[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result as string[];
          const prefix = this.config.keyPrefix || '';
          
          // Filter and strip prefix
          const filteredKeys = keys
            .filter(key => key.startsWith(prefix))
            .map(key => key.substring(prefix.length));
          
          resolve(filteredKeys);
        };

        request.onerror = () => {
          reject(
            new StorageError(
              'Failed to get keys from IndexedDB',
              StorageErrorCode.UNKNOWN,
              request.error || undefined
            )
          );
        };
      });
    } catch (error) {
      throw new StorageError(
        'Failed to get keys',
        StorageErrorCode.UNKNOWN,
        error as Error
      );
    }
  }

  async getStorageInfo(): Promise<StorageInfo> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 0;

        return {
          used: usage,
          quota: quota,
          available: quota - usage,
          percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
        };
      }

      // Fallback: calculate size from stored data
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        let totalSize = 0;
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            totalSize += cursor.value.size || 0;
            cursor.continue();
          } else {
            resolve({
              used: totalSize,
              quota: 0, // Unknown
              available: 0, // Unknown
              percentUsed: 0,
            });
          }
        };
      });
    } catch (error) {
      return {
        used: 0,
        quota: 0,
        available: 0,
        percentUsed: 0,
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!('indexedDB' in window)) {
      return false;
    }

    try {
      // Test if we can open a database
      const testDb = await new Promise<boolean>((resolve) => {
        const request = indexedDB.open('__test__', 1);
        request.onsuccess = () => {
          request.result.close();
          indexedDB.deleteDatabase('__test__');
          resolve(true);
        };
        request.onerror = () => resolve(false);
      });

      return testDb;
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
   * Calculate the size of a value
   */
  private getSize(value: unknown): number {
    const str = JSON.stringify(value);
    return new Blob([str]).size;
  }

  /**
   * Simple compression placeholder
   */
  private compress(value: unknown): string {
    // In a real implementation, you could use a library like lz-string
    return JSON.stringify(value);
  }

  /**
   * Simple decompression placeholder
   */
  private decompress(value: string): unknown {
    // In a real implementation, you could use a library like lz-string
    return JSON.parse(value);
  }

  /**
   * Broadcast storage event for cross-tab synchronization
   */
  private broadcastStorageEvent(key: string, oldValue: unknown, newValue: unknown): void {
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('chatterbox-storage');
      channel.postMessage({
        key,
        oldValue,
        newValue,
        timestamp: Date.now(),
        source: 'local',
      });
      channel.close();
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}