import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexedDBAdapter } from '../indexeddb-adapter';
import { StorageError, StorageErrorCode } from '../types';

// Mock IndexedDB for testing
class MockIDBDatabase {
  objectStoreNames = {
    contains: vi.fn().mockReturnValue(false),
  };
  transaction = vi.fn();
  close = vi.fn();
}

class MockIDBTransaction {
  objectStore = vi.fn();
  onerror = null;
  oncomplete = null;
}

class MockIDBObjectStore {
  put = vi.fn();
  get = vi.fn();
  delete = vi.fn();
  clear = vi.fn();
  getAllKeys = vi.fn();
  openCursor = vi.fn();
  createIndex = vi.fn();
}

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;
  let mockDB: MockIDBDatabase;
  let mockTransaction: MockIDBTransaction;
  let mockObjectStore: MockIDBObjectStore;

  beforeEach(() => {
    // Set up mocks
    mockDB = new MockIDBDatabase();
    mockTransaction = new MockIDBTransaction();
    mockObjectStore = new MockIDBObjectStore();

    mockTransaction.objectStore.mockReturnValue(mockObjectStore);
    mockDB.transaction.mockReturnValue(mockTransaction);

    // Mock IndexedDB.open
    const mockRequest = {
      onsuccess: null as any,
      onerror: null as any,
      onupgradeneeded: null as any,
      result: mockDB,
    };

    global.indexedDB = {
      open: vi.fn().mockImplementation(() => {
        setTimeout(() => mockRequest.onsuccess?.(), 0);
        return mockRequest;
      }),
      deleteDatabase: vi.fn(),
    } as any;

    adapter = new IndexedDBAdapter({
      dbName: 'test-db',
      keyPrefix: 'test_',
    });
  });

  afterEach(() => {
    if (adapter && 'dispose' in adapter) {
      adapter.dispose();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should check availability', async () => {
      const available = await adapter.isAvailable();
      expect(available).toBe(true);
    });

    it('should handle IndexedDB not available', async () => {
      delete (global as any).indexedDB;
      const adapter = new IndexedDBAdapter();
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
      global.indexedDB = {} as any;
    });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      // Mock put operation
      mockObjectStore.put.mockImplementation((data) => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      // Mock get operation
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: {
            key: 'test_test-key',
            value: value,
            timestamp: Date.now(),
          },
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      await adapter.set(key, value);
      const retrieved = await adapter.get(key);

      expect(retrieved).toEqual(value);
      expect(mockObjectStore.put).toHaveBeenCalled();
      expect(mockObjectStore.get).toHaveBeenCalledWith('test_test-key');
    });

    it('should return null for non-existent keys', async () => {
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: null,
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      const result = await adapter.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: { value: 'test' },
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      mockObjectStore.delete.mockImplementation(() => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      await adapter.delete('test-key');
      expect(mockObjectStore.delete).toHaveBeenCalledWith('test_test-key');
    });

    it('should clear all values', async () => {
      mockObjectStore.clear.mockImplementation(() => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      await adapter.clear();
      expect(mockObjectStore.clear).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database open errors', async () => {
      const errorAdapter = new IndexedDBAdapter();
      
      global.indexedDB.open = vi.fn().mockImplementation(() => {
        const request = {
          onerror: null as any,
          error: new Error('Failed to open'),
        };
        setTimeout(() => request.onerror?.(), 0);
        return request;
      });

      try {
        await errorAdapter.get('test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.NOT_AVAILABLE);
      }
    });

    it('should handle quota exceeded errors', async () => {
      mockObjectStore.put.mockImplementation(() => {
        const request = {
          onerror: null as any,
          error: { name: 'QuotaExceededError' },
        };
        setTimeout(() => request.onerror?.(), 0);
        return request;
      });

      try {
        await adapter.set('test', 'large-value');
        expect.fail('Should have thrown quota exceeded error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.QUOTA_EXCEEDED);
      }
    });

    it('should handle invalid data errors', async () => {
      mockObjectStore.get.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: {
            value: '{"invalid json',
          },
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      const adapterWithCompression = new IndexedDBAdapter({ compression: true });
      
      try {
        await adapterWithCompression.get('test');
        expect.fail('Should have thrown invalid data error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe(StorageErrorCode.INVALID_DATA);
      }
    });
  });

  describe('Storage Info', () => {
    it('should get storage info using navigator.storage', async () => {
      (navigator as any).storage = {
        estimate: vi.fn().mockResolvedValue({
          usage: 1024 * 1024, // 1MB
          quota: 100 * 1024 * 1024, // 100MB
        }),
      };

      const info = await adapter.getStorageInfo();

      expect(info.used).toBe(1024 * 1024);
      expect(info.quota).toBe(100 * 1024 * 1024);
      expect(info.available).toBe(99 * 1024 * 1024);
      expect(info.percentUsed).toBeCloseTo(1);
    });

    it('should calculate storage info from cursor when estimate not available', async () => {
      delete (navigator as any).storage;

      let cursorContinueCalled = false;
      const mockCursor = {
        value: { size: 1024 },
        continue: vi.fn(() => { cursorContinueCalled = true; }),
      };

      mockObjectStore.openCursor.mockImplementation(() => {
        const request = {
          onsuccess: null as any,
        };
        
        setTimeout(() => {
          // First call returns cursor
          (request as any).onsuccess({ target: { result: cursorContinueCalled ? null : mockCursor } });
        }, 0);
        
        return request;
      });

      const info = await adapter.getStorageInfo();

      expect(info.used).toBe(1024);
      expect(mockObjectStore.openCursor).toHaveBeenCalled();
    });
  });

  describe('Key Management', () => {
    it('should get all keys with prefix filtering', async () => {
      mockObjectStore.getAllKeys.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: ['test_key1', 'test_key2', 'other_key3', 'test_key3'],
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      const keys = await adapter.getKeys();
      
      expect(keys).toEqual(['key1', 'key2', 'key3']);
      expect(keys).not.toContain('other_key3');
    });
  });

  describe('Cross-tab Sync', () => {
    it('should broadcast storage events when enabled', async () => {
      const mockChannel = {
        postMessage: vi.fn(),
        close: vi.fn(),
      };

      global.BroadcastChannel = vi.fn().mockImplementation(() => mockChannel) as any;

      const syncAdapter = new IndexedDBAdapter({
        syncAcrossTabs: true,
      });

      mockObjectStore.put.mockImplementation(() => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      await syncAdapter.set('sync-key', 'sync-value');

      expect(global.BroadcastChannel).toHaveBeenCalledWith('chatterbox-storage');
      expect(mockChannel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'sync-key',
          oldValue: null,
          newValue: 'sync-value',
          source: 'local',
        })
      );

      delete global.BroadcastChannel;
    });
  });

  describe('Compression', () => {
    it('should handle compression when enabled', async () => {
      const compressAdapter = new IndexedDBAdapter({
        compression: true,
      });

      const testData = { data: 'test'.repeat(100) };

      mockObjectStore.put.mockImplementation(() => {
        const request = { onsuccess: null, onerror: null };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      mockObjectStore.get.mockImplementation(() => {
        const request = {
          onsuccess: null,
          onerror: null,
          result: {
            value: JSON.stringify(testData), // Simulated compressed data
          },
        };
        setTimeout(() => (request as any).onsuccess?.(), 0);
        return request;
      });

      await compressAdapter.set('compressed', testData);
      const retrieved = await compressAdapter.get('compressed');

      expect(retrieved).toEqual(testData);
    });
  });
});