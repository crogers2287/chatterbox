import {
  StorageAdapter,
  StorageConfig,
  StorageError,
  StorageErrorCode,
  StorageEvent,
  StorageInfo,
  StorageManager as IStorageManager,
} from './types';
import { IndexedDBAdapter } from './indexeddb-adapter';
import { LocalStorageAdapter } from './localstorage-adapter';

/**
 * Storage manager that handles multiple adapters with automatic fallback
 */
export class StorageManager implements IStorageManager {
  private primaryAdapter: StorageAdapter | null = null;
  private fallbackAdapter: StorageAdapter | null = null;
  private activeAdapter: StorageAdapter | null = null;
  private config: StorageConfig;
  private eventListeners: Map<string, Set<(event: StorageEvent) => void>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private cleanupInterval: number | null = null;

  constructor(config: StorageConfig = {}) {
    this.config = {
      dbName: 'ChatterboxStorage',
      version: 1,
      compression: false,
      keyPrefix: 'cbx_',
      maxSize: 50 * 1024 * 1024, // 50MB default
      syncAcrossTabs: true,
      ...config,
    };

    this.initialize();
  }

  /**
   * Initialize storage adapters
   */
  private async initialize(): Promise<void> {
    // Set up broadcast channel for cross-tab sync
    if (this.config.syncAcrossTabs && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('chatterbox-storage');
      this.broadcastChannel.onmessage = (event) => {
        this.handleStorageEvent(event.data as StorageEvent);
      };
    }

    // Try IndexedDB first
    this.primaryAdapter = new IndexedDBAdapter(this.config);
    const indexedDBAvailable = await this.primaryAdapter.isAvailable();

    if (indexedDBAvailable) {
      this.activeAdapter = this.primaryAdapter;
    } else {
      // Fall back to localStorage
      console.warn('IndexedDB not available, falling back to localStorage');
      this.fallbackAdapter = new LocalStorageAdapter(this.config);
      const localStorageAvailable = await this.fallbackAdapter.isAvailable();

      if (localStorageAvailable) {
        this.activeAdapter = this.fallbackAdapter;
      } else {
        throw new StorageError(
          'No storage adapter available',
          StorageErrorCode.NOT_AVAILABLE
        );
      }
    }

    // Set up automatic cleanup
    if (this.config.maxSize) {
      this.setupAutoCleanup();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    try {
      return await this.activeAdapter.get<T>(key);
    } catch (error) {
      // If primary fails, try fallback
      if (this.activeAdapter === this.primaryAdapter && this.fallbackAdapter) {
        console.warn('Primary storage failed, trying fallback', error);
        this.activeAdapter = this.fallbackAdapter;
        return await this.fallbackAdapter.get<T>(key);
      }
      throw error;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    // Check storage quota before setting
    const size = this.estimateSize(value);
    const info = await this.getStorageInfo();

    if (this.config.maxSize && info.used + size > this.config.maxSize) {
      await this.performCleanup(size);
    }

    try {
      await this.activeAdapter.set(key, value);
    } catch (error) {
      // If primary fails, try fallback
      if (this.activeAdapter === this.primaryAdapter && this.fallbackAdapter) {
        console.warn('Primary storage failed, trying fallback', error);
        this.activeAdapter = this.fallbackAdapter;
        await this.fallbackAdapter.set(key, value);
      } else if (error instanceof StorageError && error.code === StorageErrorCode.QUOTA_EXCEEDED) {
        // Try to clean up and retry
        await this.performCleanup(size);
        await this.activeAdapter.set(key, value);
      } else {
        throw error;
      }
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    try {
      await this.activeAdapter.delete(key);
    } catch (error) {
      // If primary fails, try fallback
      if (this.activeAdapter === this.primaryAdapter && this.fallbackAdapter) {
        console.warn('Primary storage failed, trying fallback', error);
        this.activeAdapter = this.fallbackAdapter;
        await this.fallbackAdapter.delete(key);
      } else {
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    await this.activeAdapter.clear();
    
    // Clear both adapters if both exist
    if (this.primaryAdapter && this.fallbackAdapter) {
      try {
        await this.primaryAdapter.clear();
      } catch (error) {
        console.warn('Failed to clear primary adapter', error);
      }
      try {
        await this.fallbackAdapter.clear();
      } catch (error) {
        console.warn('Failed to clear fallback adapter', error);
      }
    }
  }

  async getKeys(): Promise<string[]> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    return await this.activeAdapter.getKeys();
  }

  async getStorageInfo(): Promise<StorageInfo> {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }

    const info = await this.activeAdapter.getStorageInfo();
    
    // Override quota with our configured max size if set
    if (this.config.maxSize) {
      info.quota = this.config.maxSize;
      info.available = Math.max(0, this.config.maxSize - info.used);
      info.percentUsed = (info.used / this.config.maxSize) * 100;
    }

    return info;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.activeAdapter) {
      return false;
    }
    return await this.activeAdapter.isAvailable();
  }

  getActiveAdapter(): StorageAdapter {
    if (!this.activeAdapter) {
      throw new StorageError(
        'Storage not initialized',
        StorageErrorCode.NOT_AVAILABLE
      );
    }
    return this.activeAdapter;
  }

  useAdapter(adapter: 'indexeddb' | 'localstorage'): void {
    if (adapter === 'indexeddb' && this.primaryAdapter) {
      this.activeAdapter = this.primaryAdapter;
    } else if (adapter === 'localstorage') {
      if (!this.fallbackAdapter) {
        this.fallbackAdapter = new LocalStorageAdapter(this.config);
      }
      this.activeAdapter = this.fallbackAdapter;
    } else {
      throw new StorageError(
        `Adapter ${adapter} not available`,
        StorageErrorCode.NOT_AVAILABLE
      );
    }
  }

  addEventListener(event: 'change', listener: (event: StorageEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  removeEventListener(event: 'change', listener: (event: StorageEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Estimate the size of a value
   */
  private estimateSize(value: unknown): number {
    const str = JSON.stringify(value);
    return new Blob([str]).size;
  }

  /**
   * Perform cleanup to free up space
   */
  private async performCleanup(requiredSpace: number): Promise<void> {
    const keys = await this.getKeys();
    const itemsWithMetadata: Array<{
      key: string;
      size: number;
      timestamp: number;
    }> = [];

    // Get metadata for all items
    for (const key of keys) {
      try {
        const value = await this.get(key);
        if (value) {
          itemsWithMetadata.push({
            key,
            size: this.estimateSize(value),
            timestamp: Date.now(), // Would be better to store this with the value
          });
        }
      } catch {
        // Skip items that can't be read
      }
    }

    // Sort by timestamp (oldest first)
    itemsWithMetadata.sort((a, b) => a.timestamp - b.timestamp);

    // Remove items until we have enough space
    let freedSpace = 0;
    for (const item of itemsWithMetadata) {
      if (freedSpace >= requiredSpace) {
        break;
      }
      await this.delete(item.key);
      freedSpace += item.size;
    }

    if (freedSpace < requiredSpace) {
      throw new StorageError(
        'Unable to free enough space',
        StorageErrorCode.QUOTA_EXCEEDED
      );
    }
  }

  /**
   * Set up automatic cleanup interval
   */
  private setupAutoCleanup(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = window.setInterval(async () => {
      try {
        const info = await this.getStorageInfo();
        if (info.percentUsed > 80) {
          // Clean up 20% of storage
          const targetSize = info.used * 0.2;
          await this.performCleanup(targetSize);
        }
      } catch (error) {
        console.error('Auto cleanup failed', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Handle storage events from broadcast channel
   */
  private handleStorageEvent(event: StorageEvent): void {
    const listeners = this.eventListeners.get('change');
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Storage event listener error', error);
        }
      });
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }

    if (this.primaryAdapter && 'dispose' in this.primaryAdapter) {
      (this.primaryAdapter as any).dispose();
    }

    if (this.fallbackAdapter && 'dispose' in this.fallbackAdapter) {
      (this.fallbackAdapter as any).dispose();
    }

    this.eventListeners.clear();
  }
}

// Export a singleton instance
export const storageManager = new StorageManager();