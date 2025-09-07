/**
 * Client-side cleanup service for recovery data
 * Manages IndexedDB session cleanup and storage quota
 */

export interface CleanupConfig {
  retentionHours: number;
  maxStorageMB: number;
  emergencyThresholdPercent: number;
}

export interface CleanupMetrics {
  sessionsCleared: number;
  bytesFreed: number;
  lastCleanup: Date | null;
  errors: number;
  lastError: string | null;
}

export interface StorageInfo {
  used: number;
  quota: number;
  percent: number;
}

export class RecoveryCleanupService {
  private config: CleanupConfig;
  private metrics: CleanupMetrics;
  private dbName = 'chatterbox-recovery';
  private storeName = 'sessions';
  private metadataStore = 'metadata';

  constructor(config: Partial<CleanupConfig> = {}) {
    this.config = {
      retentionHours: config.retentionHours || 24,
      maxStorageMB: config.maxStorageMB || 100,
      emergencyThresholdPercent: config.emergencyThresholdPercent || 90
    };

    this.metrics = {
      sessionsCleared: 0,
      bytesFreed: 0,
      lastCleanup: null,
      errors: 0,
      lastError: null
    };
  }

  /**
   * Get storage quota information
   */
  private async getStorageInfo(): Promise<StorageInfo | null> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const quota = estimate.quota || 0;
        const percent = quota > 0 ? (used / quota) * 100 : 0;
        
        return { used, quota, percent };
      }
      return null;
    } catch (error) {
      console.error('Failed to get storage info:', error);
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : 'Unknown error';
      return null;
    }
  }

  /**
   * Open IndexedDB connection
   */
  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(this.metadataStore)) {
          db.createObjectStore(this.metadataStore);
        }
      };
    });
  }

  /**
   * Check if a session has expired
   */
  private isExpired(session: any): boolean {
    const now = Date.now();
    const lastAccessed = session.lastAccessed || session.timestamp || 0;
    const expiryTime = lastAccessed + (this.config.retentionHours * 60 * 60 * 1000);
    
    return now > expiryTime;
  }

  /**
   * Estimate session size in bytes
   */
  private estimateSessionSize(session: any): number {
    // Rough estimation based on JSON string length
    try {
      return JSON.stringify(session).length * 2; // UTF-16 encoding
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<{ cleared: number; bytesFreed: number }> {
    let sessionsCleared = 0;
    let bytesFreed = 0;

    try {
      console.log('Starting expired session cleanup');
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Get all sessions
      const sessions = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Delete expired sessions
      for (const session of sessions) {
        if (this.isExpired(session)) {
          const size = this.estimateSessionSize(session);
          
          await new Promise<void>((resolve, reject) => {
            const deleteRequest = store.delete(session.id);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
          });
          
          sessionsCleared++;
          bytesFreed += size;
          console.log(`Deleted expired session: ${session.id}`);
        }
      }

      await transaction.complete;
      db.close();

      // Update metrics
      this.metrics.sessionsCleared += sessionsCleared;
      this.metrics.bytesFreed += bytesFreed;
      this.metrics.lastCleanup = new Date();

      console.log(`Cleanup complete: ${sessionsCleared} sessions, ${bytesFreed} bytes freed`);
      
      return { cleared: sessionsCleared, bytesFreed };
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Emergency cleanup when storage quota is near limit
   */
  async emergencyCleanup(): Promise<{ cleared: number; bytesFreed: number }> {
    let sessionsCleared = 0;
    let bytesFreed = 0;

    try {
      console.log('Starting emergency cleanup');
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('lastAccessed');
      
      // Get all sessions sorted by last accessed (oldest first)
      const sessions = await new Promise<any[]>((resolve, reject) => {
        const request = index.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Calculate target bytes to free (20% of used storage)
      const storageInfo = await this.getStorageInfo();
      if (!storageInfo) {
        throw new Error('Cannot get storage info for emergency cleanup');
      }
      
      const targetBytes = storageInfo.used * 0.2;
      let freedBytes = 0;

      // Delete oldest sessions until target is reached
      for (const session of sessions) {
        if (freedBytes >= targetBytes) break;
        
        const size = this.estimateSessionSize(session);
        
        await new Promise<void>((resolve, reject) => {
          const deleteRequest = store.delete(session.id);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
        
        sessionsCleared++;
        freedBytes += size;
        bytesFreed += size;
        console.log(`Emergency deleted session: ${session.id}`);
      }

      await transaction.complete;
      db.close();

      // Update metrics
      this.metrics.sessionsCleared += sessionsCleared;
      this.metrics.bytesFreed += bytesFreed;

      console.log(`Emergency cleanup complete: ${sessionsCleared} sessions, ${bytesFreed} bytes freed`);
      
      return { cleared: sessionsCleared, bytesFreed };
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
      this.metrics.errors++;
      this.metrics.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Check if emergency cleanup is needed
   */
  async checkStorageQuota(): Promise<boolean> {
    const storageInfo = await this.getStorageInfo();
    
    if (!storageInfo) {
      console.warn('Cannot check storage quota');
      return false;
    }

    const needsCleanup = storageInfo.percent > this.config.emergencyThresholdPercent;
    
    if (needsCleanup) {
      console.warn(
        `Storage quota warning: ${storageInfo.percent.toFixed(1)}% used ` +
        `(${storageInfo.used}/${storageInfo.quota} bytes)`
      );
    }

    return needsCleanup;
  }

  /**
   * Run full cleanup process
   */
  async runCleanup(): Promise<{
    sessionsCleared: number;
    bytesFreed: number;
    emergencyRun: boolean;
    success: boolean;
  }> {
    let totalCleared = 0;
    let totalFreed = 0;
    let emergencyRun = false;

    try {
      console.log('Starting cleanup process');

      // First, clean expired sessions
      const expiredResult = await this.cleanupExpiredSessions();
      totalCleared += expiredResult.cleared;
      totalFreed += expiredResult.bytesFreed;

      // Check if emergency cleanup is needed
      if (await this.checkStorageQuota()) {
        emergencyRun = true;
        const emergencyResult = await this.emergencyCleanup();
        totalCleared += emergencyResult.cleared;
        totalFreed += emergencyResult.bytesFreed;
      }

      console.log(
        `Total cleanup: ${totalCleared} sessions, ${totalFreed} bytes freed` +
        (emergencyRun ? ' (including emergency cleanup)' : '')
      );

      return {
        sessionsCleared: totalCleared,
        bytesFreed: totalFreed,
        emergencyRun,
        success: true
      };
    } catch (error) {
      console.error('Cleanup process failed:', error);
      return {
        sessionsCleared: totalCleared,
        bytesFreed: totalFreed,
        emergencyRun,
        success: false
      };
    }
  }

  /**
   * Get cleanup service metrics
   */
  getMetrics(): CleanupMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current storage status
   */
  async getStorageStatus(): Promise<{
    storageInfo: StorageInfo | null;
    metrics: CleanupMetrics;
    config: CleanupConfig;
  }> {
    const storageInfo = await this.getStorageInfo();
    
    return {
      storageInfo,
      metrics: this.getMetrics(),
      config: { ...this.config }
    };
  }
}

/**
 * Scheduled cleanup service that runs periodically
 */
export class ScheduledCleanupService {
  private cleanupService: RecoveryCleanupService;
  private intervalMs: number;
  private timeoutId: number | null = null;
  private running = false;

  constructor(
    cleanupService: RecoveryCleanupService,
    intervalHours: number = 1
  ) {
    this.cleanupService = cleanupService;
    this.intervalMs = intervalHours * 60 * 60 * 1000;
  }

  /**
   * Start scheduled cleanup
   */
  start(): void {
    if (this.running) {
      console.warn('Scheduled cleanup already running');
      return;
    }

    this.running = true;
    this.scheduleNext();
    console.log(`Scheduled cleanup started (interval: ${this.intervalMs}ms)`);
  }

  /**
   * Stop scheduled cleanup
   */
  stop(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.running = false;
    console.log('Scheduled cleanup stopped');
  }

  /**
   * Schedule next cleanup run
   */
  private scheduleNext(): void {
    if (!this.running) return;

    this.timeoutId = window.setTimeout(async () => {
      try {
        await this.cleanupService.runCleanup();
      } catch (error) {
        console.error('Scheduled cleanup failed:', error);
      }

      // Schedule next run
      this.scheduleNext();
    }, this.intervalMs);
  }
}

// Export convenience functions
export function createCleanupService(config?: Partial<CleanupConfig>): RecoveryCleanupService {
  return new RecoveryCleanupService(config);
}

export function createScheduledCleanup(
  cleanupService: RecoveryCleanupService,
  intervalHours?: number
): ScheduledCleanupService {
  return new ScheduledCleanupService(cleanupService, intervalHours);
}