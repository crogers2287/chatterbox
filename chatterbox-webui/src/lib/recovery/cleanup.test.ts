/**
 * Tests for client-side cleanup service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RecoveryCleanupService,
  ScheduledCleanupService,
  createCleanupService,
  createScheduledCleanup
} from './cleanup';

// Mock IndexedDB
const mockIDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn()
};

// Mock navigator.storage
const mockStorage = {
  estimate: vi.fn(),
  persist: vi.fn(),
  persisted: vi.fn()
};

// Setup global mocks
global.indexedDB = mockIDB as any;
global.navigator = {
  ...global.navigator,
  storage: mockStorage as any
};

describe('RecoveryCleanupService', () => {
  let service: RecoveryCleanupService;
  let mockDB: any;
  let mockStore: any;
  let mockTransaction: any;

  beforeEach(() => {
    service = createCleanupService({
      retentionHours: 1,
      maxStorageMB: 10,
      emergencyThresholdPercent: 90
    });

    // Setup mock DB
    mockStore = {
      getAll: vi.fn(),
      delete: vi.fn(),
      index: vi.fn()
    };

    mockTransaction = {
      objectStore: vi.fn(() => mockStore),
      complete: Promise.resolve()
    };

    mockDB = {
      transaction: vi.fn(() => mockTransaction),
      objectStoreNames: {
        contains: vi.fn(() => true)
      },
      close: vi.fn()
    };

    mockIDB.open.mockResolvedValue(mockDB);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getStorageInfo', () => {
    it('should return storage information', async () => {
      mockStorage.estimate.mockResolvedValue({
        usage: 50 * 1024 * 1024, // 50MB
        quota: 100 * 1024 * 1024  // 100MB
      });

      const info = await (service as any).getStorageInfo();

      expect(info).toEqual({
        used: 50 * 1024 * 1024,
        quota: 100 * 1024 * 1024,
        percent: 50
      });
    });

    it('should handle missing storage API', async () => {
      // Remove storage API
      const originalStorage = navigator.storage;
      (navigator as any).storage = undefined;

      const info = await (service as any).getStorageInfo();

      expect(info).toBeNull();

      // Restore
      (navigator as any).storage = originalStorage;
    });

    it('should handle storage API errors', async () => {
      mockStorage.estimate.mockRejectedValue(new Error('Storage error'));

      const info = await (service as any).getStorageInfo();

      expect(info).toBeNull();
      expect(service.getMetrics().errors).toBe(1);
    });
  });

  describe('isExpired', () => {
    it('should identify expired sessions', () => {
      const now = Date.now();
      const oldSession = {
        id: 'test1',
        lastAccessed: now - (2 * 60 * 60 * 1000) // 2 hours ago
      };

      expect((service as any).isExpired(oldSession)).toBe(true);
    });

    it('should identify valid sessions', () => {
      const now = Date.now();
      const recentSession = {
        id: 'test2',
        lastAccessed: now - (30 * 60 * 1000) // 30 minutes ago
      };

      expect((service as any).isExpired(recentSession)).toBe(false);
    });

    it('should use timestamp if lastAccessed not available', () => {
      const now = Date.now();
      const session = {
        id: 'test3',
        timestamp: now - (30 * 60 * 1000) // 30 minutes ago
      };

      expect((service as any).isExpired(session)).toBe(false);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should delete expired sessions', async () => {
      const now = Date.now();
      const sessions = [
        { id: 'old1', lastAccessed: now - (2 * 60 * 60 * 1000) },
        { id: 'old2', lastAccessed: now - (3 * 60 * 60 * 1000) },
        { id: 'recent', lastAccessed: now - (30 * 60 * 1000) }
      ];

      mockStore.getAll.mockImplementation(() => ({
        onsuccess: function() { this.result = sessions; this.onsuccess(); },
        onerror: vi.fn(),
        result: sessions
      }));

      mockStore.delete.mockImplementation(() => ({
        onsuccess: function() { this.onsuccess(); },
        onerror: vi.fn()
      }));

      const result = await service.cleanupExpiredSessions();

      expect(result.cleared).toBe(2);
      expect(result.bytesFreed).toBeGreaterThan(0);
      expect(mockStore.delete).toHaveBeenCalledTimes(2);
      expect(mockStore.delete).toHaveBeenCalledWith('old1');
      expect(mockStore.delete).toHaveBeenCalledWith('old2');
    });

    it('should handle database errors', async () => {
      mockIDB.open.mockRejectedValue(new Error('DB error'));

      await expect(service.cleanupExpiredSessions()).rejects.toThrow('DB error');
      expect(service.getMetrics().errors).toBe(1);
    });
  });

  describe('emergencyCleanup', () => {
    it('should delete oldest sessions when quota exceeded', async () => {
      mockStorage.estimate.mockResolvedValue({
        usage: 90 * 1024 * 1024,  // 90MB used
        quota: 100 * 1024 * 1024  // 100MB quota
      });

      const now = Date.now();
      const sessions = [
        { id: 'oldest', lastAccessed: now - (5 * 60 * 60 * 1000) },
        { id: 'middle', lastAccessed: now - (3 * 60 * 60 * 1000) },
        { id: 'newest', lastAccessed: now - (1 * 60 * 60 * 1000) }
      ];

      const mockIndex = {
        getAll: vi.fn().mockImplementation(() => ({
          onsuccess: function() { this.result = sessions; this.onsuccess(); },
          onerror: vi.fn(),
          result: sessions
        }))
      };

      mockStore.index.mockReturnValue(mockIndex);
      mockStore.delete.mockImplementation(() => ({
        onsuccess: function() { this.onsuccess(); },
        onerror: vi.fn()
      }));

      const result = await service.emergencyCleanup();

      expect(result.cleared).toBeGreaterThan(0);
      expect(mockStore.delete).toHaveBeenCalled();
      // Should delete oldest first
      expect(mockStore.delete.mock.calls[0][0]).toBe('oldest');
    });
  });

  describe('checkStorageQuota', () => {
    it('should detect when quota is exceeded', async () => {
      mockStorage.estimate.mockResolvedValue({
        usage: 95 * 1024 * 1024,  // 95MB used
        quota: 100 * 1024 * 1024  // 100MB quota
      });

      const needsCleanup = await service.checkStorageQuota();

      expect(needsCleanup).toBe(true);
    });

    it('should return false when quota is fine', async () => {
      mockStorage.estimate.mockResolvedValue({
        usage: 50 * 1024 * 1024,  // 50MB used
        quota: 100 * 1024 * 1024  // 100MB quota
      });

      const needsCleanup = await service.checkStorageQuota();

      expect(needsCleanup).toBe(false);
    });
  });

  describe('runCleanup', () => {
    it('should run full cleanup process', async () => {
      // Mock expired cleanup
      vi.spyOn(service, 'cleanupExpiredSessions').mockResolvedValue({
        cleared: 2,
        bytesFreed: 2048
      });

      // Mock quota check
      vi.spyOn(service, 'checkStorageQuota').mockResolvedValue(false);

      const result = await service.runCleanup();

      expect(result.success).toBe(true);
      expect(result.sessionsCleared).toBe(2);
      expect(result.bytesFreed).toBe(2048);
      expect(result.emergencyRun).toBe(false);
    });

    it('should run emergency cleanup when needed', async () => {
      // Mock expired cleanup
      vi.spyOn(service, 'cleanupExpiredSessions').mockResolvedValue({
        cleared: 1,
        bytesFreed: 1024
      });

      // Mock quota check to trigger emergency
      vi.spyOn(service, 'checkStorageQuota').mockResolvedValue(true);

      // Mock emergency cleanup
      vi.spyOn(service, 'emergencyCleanup').mockResolvedValue({
        cleared: 3,
        bytesFreed: 3072
      });

      const result = await service.runCleanup();

      expect(result.success).toBe(true);
      expect(result.sessionsCleared).toBe(4); // 1 + 3
      expect(result.bytesFreed).toBe(4096); // 1024 + 3072
      expect(result.emergencyRun).toBe(true);
    });
  });

  describe('getMetrics', () => {
    it('should return cleanup metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('sessionsCleared');
      expect(metrics).toHaveProperty('bytesFreed');
      expect(metrics).toHaveProperty('lastCleanup');
      expect(metrics).toHaveProperty('errors');
      expect(metrics).toHaveProperty('lastError');
    });
  });

  describe('getStorageStatus', () => {
    it('should return complete storage status', async () => {
      mockStorage.estimate.mockResolvedValue({
        usage: 50 * 1024 * 1024,
        quota: 100 * 1024 * 1024
      });

      const status = await service.getStorageStatus();

      expect(status.storageInfo).toBeTruthy();
      expect(status.metrics).toBeTruthy();
      expect(status.config).toEqual({
        retentionHours: 1,
        maxStorageMB: 10,
        emergencyThresholdPercent: 90
      });
    });
  });
});

describe('ScheduledCleanupService', () => {
  let cleanupService: RecoveryCleanupService;
  let scheduledService: ScheduledCleanupService;

  beforeEach(() => {
    vi.useFakeTimers();
    cleanupService = createCleanupService();
    scheduledService = createScheduledCleanup(cleanupService, 0.001); // Very short interval
  });

  afterEach(() => {
    scheduledService.stop();
    vi.useRealTimers();
  });

  it('should start and stop scheduled cleanup', () => {
    const runCleanupSpy = vi.spyOn(cleanupService, 'runCleanup').mockResolvedValue({
      sessionsCleared: 0,
      bytesFreed: 0,
      emergencyRun: false,
      success: true
    });

    scheduledService.start();

    // Fast-forward time
    vi.advanceTimersByTime(5);

    expect(runCleanupSpy).toHaveBeenCalled();

    scheduledService.stop();

    // Verify no more calls after stop
    runCleanupSpy.mockClear();
    vi.advanceTimersByTime(5);
    expect(runCleanupSpy).not.toHaveBeenCalled();
  });

  it('should handle cleanup errors gracefully', () => {
    const runCleanupSpy = vi.spyOn(cleanupService, 'runCleanup').mockRejectedValue(
      new Error('Cleanup failed')
    );

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation();

    scheduledService.start();

    // Fast-forward time
    vi.advanceTimersByTime(5);

    expect(runCleanupSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Scheduled cleanup failed:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should not start multiple times', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation();

    scheduledService.start();
    scheduledService.start(); // Second start

    expect(consoleWarnSpy).toHaveBeenCalledWith('Scheduled cleanup already running');

    consoleWarnSpy.mockRestore();
  });
});

describe('Factory functions', () => {
  it('should create cleanup service with default config', () => {
    const service = createCleanupService();
    expect(service).toBeInstanceOf(RecoveryCleanupService);
  });

  it('should create cleanup service with custom config', () => {
    const service = createCleanupService({
      retentionHours: 48,
      maxStorageMB: 500
    });
    
    const status = service.getStorageStatus();
    expect(status).toBeTruthy();
  });

  it('should create scheduled cleanup service', () => {
    const cleanupService = createCleanupService();
    const scheduled = createScheduledCleanup(cleanupService, 2);
    
    expect(scheduled).toBeInstanceOf(ScheduledCleanupService);
  });
});