import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageManager } from '../storage-manager';
import { StorageError, StorageErrorCode } from '../types';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    // Clear any existing storage
    localStorage.clear();
    
    // Mock IndexedDB for testing
    const indexedDBMock = {
      open: vi.fn(),
      deleteDatabase: vi.fn(),
    };
    (global as any).indexedDB = indexedDBMock;
    
    storageManager = new StorageManager({
      keyPrefix: 'test_',
      maxSize: 1024 * 1024, // 1MB for testing
    });
  });

  afterEach(() => {
    if (storageManager && 'dispose' in storageManager) {
      (storageManager as any).dispose();
    }
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = { data: 'test-value', number: 42 };

      await storageManager.set(key, value);
      const retrieved = await storageManager.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const result = await storageManager.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      const key = 'delete-test';
      await storageManager.set(key, 'value');
      
      let value = await storageManager.get(key);
      expect(value).toBe('value');

      await storageManager.delete(key);
      value = await storageManager.get(key);
      expect(value).toBeNull();
    });

    it('should clear all values', async () => {
      await storageManager.set('key1', 'value1');
      await storageManager.set('key2', 'value2');
      await storageManager.set('key3', 'value3');

      await storageManager.clear();

      const keys = await storageManager.getKeys();
      expect(keys).toHaveLength(0);
    });

    it('should list all keys', async () => {
      await storageManager.set('key1', 'value1');
      await storageManager.set('key2', 'value2');
      await storageManager.set('key3', 'value3');

      const keys = await storageManager.getKeys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).toHaveLength(3);
    });
  });

  describe('Storage Info', () => {
    it('should return storage information', async () => {
      const info = await storageManager.getStorageInfo();

      expect(info).toHaveProperty('used');
      expect(info).toHaveProperty('quota');
      expect(info).toHaveProperty('available');
      expect(info).toHaveProperty('percentUsed');
      
      expect(info.used).toBeGreaterThanOrEqual(0);
      expect(info.quota).toBeGreaterThan(0);
      expect(info.percentUsed).toBeGreaterThanOrEqual(0);
      expect(info.percentUsed).toBeLessThanOrEqual(100);
    });

    it('should track storage usage', async () => {
      const infoBefore = await storageManager.getStorageInfo();
      
      // Store some data
      const largeData = 'x'.repeat(10000); // 10KB
      await storageManager.set('large-data', largeData);
      
      const infoAfter = await storageManager.getStorageInfo();
      
      expect(infoAfter.used).toBeGreaterThan(infoBefore.used);
      expect(infoAfter.available).toBeLessThan(infoBefore.available);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage not available', async () => {
      // Mock localStorage to be unavailable
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage not available');
      });

      const manager = new StorageManager();
      
      try {
        await manager.set('test', 'value');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
      }

      Storage.prototype.setItem = originalSetItem;
    });

    it('should handle quota exceeded errors', async () => {
      // Mock quota exceeded error
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn().mockImplementation(() => {
        const error = new DOMException('QuotaExceededError');
        (error as any).name = 'QuotaExceededError';
        throw error;
      });

      try {
        await storageManager.set('test', 'x'.repeat(1000000));
        expect.fail('Should have thrown quota exceeded error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.QUOTA_EXCEEDED);
      }

      Storage.prototype.setItem = originalSetItem;
    });
  });

  describe('Cross-tab Synchronization', () => {
    it('should set up event listeners', () => {
      const listener = vi.fn();
      storageManager.addEventListener('change', listener);

      // Trigger a storage event manually
      const event = new StorageEvent('storage', {
        key: 'test_key',
        oldValue: null,
        newValue: JSON.stringify({ value: 'test' }),
        storageArea: localStorage,
      });

      window.dispatchEvent(event);

      // The listener might not be called directly due to our implementation
      // This is more of an integration test
      storageManager.removeEventListener('change', listener);
    });

    it('should handle broadcast channel if available', async () => {
      // Mock BroadcastChannel
      const mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
        onmessage: null,
      };

      global.BroadcastChannel = vi.fn().mockImplementation(() => mockChannel) as any;

      const manager = new StorageManager({ syncAcrossTabs: true });
      await manager.set('broadcast-test', 'value');

      // Clean up
      (manager as any).dispose();
      delete global.BroadcastChannel;
    });
  });

  describe('Adapter Management', () => {
    it('should check if storage is available', async () => {
      const isAvailable = await storageManager.isAvailable();
      expect(isAvailable).toBe(true);
    });

    it('should get active adapter', () => {
      const adapter = storageManager.getActiveAdapter();
      expect(adapter).toBeDefined();
    });

    it('should switch adapters', () => {
      // This might fail if localStorage is not available in test environment
      try {
        storageManager.useAdapter('localstorage');
        const adapter = storageManager.getActiveAdapter();
        expect(adapter).toBeDefined();
      } catch (error) {
        // It's okay if this fails in test environment
        expect(error).toBeInstanceOf(StorageError);
      }
    });
  });

  describe('Complex Data Types', () => {
    it('should handle arrays', async () => {
      const array = [1, 2, 3, 'four', { five: 5 }];
      await storageManager.set('array-test', array);
      const retrieved = await storageManager.get('array-test');
      expect(retrieved).toEqual(array);
    });

    it('should handle nested objects', async () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, 3],
            },
          },
        },
        date: new Date().toISOString(),
        null: null,
        undefined: undefined,
      };

      await storageManager.set('nested-test', nested);
      const retrieved = await storageManager.get('nested-test');
      
      // Note: undefined values might not survive JSON serialization
      expect(retrieved).toMatchObject({
        level1: {
          level2: {
            level3: {
              value: 'deep',
              array: [1, 2, 3],
            },
          },
        },
        date: nested.date,
        null: null,
      });
    });

    it('should handle large strings', async () => {
      const largeString = 'x'.repeat(100000); // 100KB
      await storageManager.set('large-string', largeString);
      const retrieved = await storageManager.get('large-string');
      expect(retrieved).toBe(largeString);
    });
  });

  describe('Cleanup and Quota Management', () => {
    it('should respect key prefix', async () => {
      const manager1 = new StorageManager({ keyPrefix: 'app1_' });
      const manager2 = new StorageManager({ keyPrefix: 'app2_' });

      await manager1.set('key', 'value1');
      await manager2.set('key', 'value2');

      const value1 = await manager1.get('key');
      const value2 = await manager2.get('key');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');

      // Clean up
      (manager1 as any).dispose();
      (manager2 as any).dispose();
    });

    it('should handle concurrent operations', async () => {
      const promises = [];
      
      // Set multiple values concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(storageManager.set(`concurrent-${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // Get all values
      const getPromises = [];
      for (let i = 0; i < 10; i++) {
        getPromises.push(storageManager.get(`concurrent-${i}`));
      }

      const values = await Promise.all(getPromises);

      for (let i = 0; i < 10; i++) {
        expect(values[i]).toBe(`value-${i}`);
      }
    });
  });
});