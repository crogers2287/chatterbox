import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalStorageAdapter } from '../localstorage-adapter';
import { StorageError, StorageErrorCode } from '../types';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  let originalLocalStorage: Storage;

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear();
    
    // Store original localStorage
    originalLocalStorage = global.localStorage;
    
    adapter = new LocalStorageAdapter({
      keyPrefix: 'test_',
      maxSize: 1024 * 1024, // 1MB for testing
    });
  });

  afterEach(() => {
    if (adapter && 'dispose' in adapter) {
      adapter.dispose();
    }
    localStorage.clear();
    global.localStorage = originalLocalStorage;
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = { data: 'test-value', number: 42 };

      await adapter.set(key, value);
      const retrieved = await adapter.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const result = await adapter.get('non-existent');
      expect(result).toBeNull();
    });

    it('should handle string values without JSON parsing', async () => {
      // Manually set a string value
      localStorage.setItem('test_string-key', 'plain string');
      
      const retrieved = await adapter.get('string-key');
      expect(retrieved).toBe('plain string');
    });

    it('should delete values', async () => {
      await adapter.set('delete-test', 'value');
      
      let value = await adapter.get('delete-test');
      expect(value).toBe('value');

      await adapter.delete('delete-test');
      value = await adapter.get('delete-test');
      expect(value).toBeNull();
    });

    it('should clear values with prefix', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      
      // Set a key with different prefix
      localStorage.setItem('other_key', 'other_value');

      await adapter.clear();

      const keys = await adapter.getKeys();
      expect(keys).toHaveLength(0);
      
      // Other key should still exist
      expect(localStorage.getItem('other_key')).toBe('other_value');
    });

    it('should clear all values when no prefix', async () => {
      const noPrefixAdapter = new LocalStorageAdapter();
      
      await noPrefixAdapter.set('key1', 'value1');
      await noPrefixAdapter.set('key2', 'value2');
      localStorage.setItem('other_key', 'other_value');

      await noPrefixAdapter.clear();

      expect(localStorage.length).toBe(0);
    });

    it('should list all keys with prefix', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.set('key3', 'value3');
      
      // Add key with different prefix
      localStorage.setItem('other_key', 'other_value');

      const keys = await adapter.getKeys();
      
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      expect(keys).toHaveLength(3);
      expect(keys).not.toContain('other_key');
    });
  });

  describe('Storage Metadata', () => {
    it('should store values with metadata', async () => {
      const key = 'metadata-test';
      const value = { data: 'test' };

      await adapter.set(key, value);

      const stored = localStorage.getItem('test_metadata-test');
      expect(stored).toBeDefined();
      
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveProperty('value');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('size');
      expect(parsed.value).toEqual(value);
      expect(parsed.timestamp).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('Storage Info', () => {
    it('should calculate storage info', async () => {
      const info = await adapter.getStorageInfo();

      expect(info).toHaveProperty('used');
      expect(info).toHaveProperty('quota');
      expect(info).toHaveProperty('available');
      expect(info).toHaveProperty('percentUsed');
      
      expect(info.quota).toBe(5 * 1024 * 1024); // 5MB estimate
      expect(info.used).toBeGreaterThanOrEqual(0);
      expect(info.available).toBeLessThanOrEqual(info.quota);
    });

    it('should track storage usage', async () => {
      const infoBefore = await adapter.getStorageInfo();
      
      const largeData = 'x'.repeat(1000); // 1KB
      await adapter.set('large-data', largeData);
      
      const infoAfter = await adapter.getStorageInfo();
      
      expect(infoAfter.used).toBeGreaterThan(infoBefore.used);
      expect(infoAfter.available).toBeLessThan(infoBefore.available);
    });
  });

  describe('Error Handling', () => {
    it('should handle permission denied errors', async () => {
      // Mock localStorage to throw SecurityError
      const mockLocalStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new DOMException('Permission denied', 'SecurityError');
        }),
        setItem: vi.fn().mockImplementation(() => {
          throw new DOMException('Permission denied', 'SecurityError');
        }),
        removeItem: vi.fn().mockImplementation(() => {
          throw new DOMException('Permission denied', 'SecurityError');
        }),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };

      global.localStorage = mockLocalStorage as any;

      try {
        await adapter.get('test');
        expect.fail('Should have thrown permission error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.PERMISSION_DENIED);
      }

      try {
        await adapter.set('test', 'value');
        expect.fail('Should have thrown permission error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.PERMISSION_DENIED);
      }
    });

    it('should handle quota exceeded errors', async () => {
      const mockLocalStorage = {
        setItem: vi.fn().mockImplementation(() => {
          const error = new DOMException('QuotaExceededError');
          (error as any).name = 'QuotaExceededError';
          throw error;
        }),
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };

      global.localStorage = mockLocalStorage as any;

      try {
        await adapter.set('test', 'x'.repeat(1000000));
        expect.fail('Should have thrown quota exceeded error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.QUOTA_EXCEEDED);
      }
    });
  });

  describe('Availability Check', () => {
    it('should detect when localStorage is available', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should detect when localStorage is not available', async () => {
      const mockLocalStorage = {
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('Not available');
        }),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0,
      };

      global.localStorage = mockLocalStorage as any;

      const testAdapter = new LocalStorageAdapter();
      const available = await testAdapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('Quota Management', () => {
    it('should free space when quota is exceeded', async () => {
      // Add some old items
      const oldTimestamp = Date.now() - 10000;
      localStorage.setItem('test_old1', JSON.stringify({
        value: 'old1',
        timestamp: oldTimestamp,
        size: 100,
      }));
      localStorage.setItem('test_old2', JSON.stringify({
        value: 'old2',
        timestamp: oldTimestamp + 1000,
        size: 100,
      }));

      // Mock quota exceeded on first try, then success
      let callCount = 0;
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation((...args) => {
        callCount++;
        if (callCount === 1) {
          const error = new DOMException('QuotaExceededError');
          (error as any).name = 'QuotaExceededError';
          (error as any).code = 22;
          throw error;
        }
        return originalSetItem.apply(localStorage, args);
      });

      await adapter.set('new-item', 'new-value');

      // Should have removed old items
      expect(localStorage.getItem('test_old1')).toBeNull();
      
      // New item should be stored
      const newItem = await adapter.get('new-item');
      expect(newItem).toBe('new-value');

      localStorage.setItem = originalSetItem;
    });

    it('should respect maxSize configuration', async () => {
      const smallAdapter = new LocalStorageAdapter({
        keyPrefix: 'small_',
        maxSize: 100, // Very small size
      });

      // This should trigger space management
      await smallAdapter.set('item1', 'x'.repeat(50));
      await smallAdapter.set('item2', 'x'.repeat(50));
      
      // This should cause cleanup of item1
      await smallAdapter.set('item3', 'x'.repeat(50));

      // Item1 should be removed, item2 and item3 should exist
      const item1 = await smallAdapter.get('item1');
      const item2 = await smallAdapter.get('item2');
      const item3 = await smallAdapter.get('item3');

      expect(item1).toBeNull();
      expect(item2).toBe('x'.repeat(50));
      expect(item3).toBe('x'.repeat(50));
    });
  });

  describe('Cross-tab Synchronization', () => {
    it('should handle storage events', async () => {
      const syncAdapter = new LocalStorageAdapter({
        syncAcrossTabs: true,
      });

      // Mock BroadcastChannel
      const mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
      };
      global.BroadcastChannel = vi.fn().mockImplementation(() => mockChannel) as any;

      // Simulate storage event from another tab
      const event = new StorageEvent('storage', {
        key: 'test_sync-key',
        oldValue: null,
        newValue: JSON.stringify({ value: 'sync-value', timestamp: Date.now() }),
        storageArea: localStorage,
      });

      window.dispatchEvent(event);

      // Give time for event to be processed
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChannel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'sync-key',
          newValue: 'sync-value',
          source: 'remote',
        })
      );

      (syncAdapter as any).dispose();
      delete global.BroadcastChannel;
    });

    it('should ignore events without proper prefix', async () => {
      const syncAdapter = new LocalStorageAdapter({
        keyPrefix: 'myapp_',
        syncAcrossTabs: true,
      });

      const mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
      };
      global.BroadcastChannel = vi.fn().mockImplementation(() => mockChannel) as any;

      // Event with different prefix
      const event = new StorageEvent('storage', {
        key: 'other_key',
        newValue: JSON.stringify({ value: 'value' }),
        storageArea: localStorage,
      });

      window.dispatchEvent(event);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockChannel.postMessage).not.toHaveBeenCalled();

      (syncAdapter as any).dispose();
      delete global.BroadcastChannel;
    });
  });
});