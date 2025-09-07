/**
 * Auto-Save Logic Implementation for Chatterbox TTS Recovery System
 * 
 * Provides debounced auto-save functionality with browser event handling,
 * heartbeat mechanism, and performance monitoring to ensure data recovery
 * in case of browser crashes or unexpected shutdowns.
 */

import { recoveryStorage } from '../storage';
import type { RecoverySession } from '../storage';

export interface AutoSaveConfig {
  /** Debounce time in milliseconds (default: 2000ms) */
  debounceMs: number;
  /** Heartbeat interval in milliseconds (default: 30000ms - 30 seconds) */
  heartbeatIntervalMs: number;
  /** Maximum session age before cleanup in milliseconds (default: 24 hours) */
  maxSessionAge: number;
  /** Enable performance monitoring (default: true) */
  enablePerformanceMonitoring: boolean;
  /** Performance target in milliseconds (default: 50ms) */
  performanceTarget: number;
}

export interface AutoSaveMetrics {
  /** Total save operations performed */
  totalSaves: number;
  /** Failed save operations */
  failedSaves: number;
  /** Average save time in milliseconds */
  averageSaveTime: number;
  /** Last save timestamp */
  lastSaveTime: number;
  /** Session ID being tracked */
  sessionId: string;
  /** Heartbeat failures count */
  heartbeatFailures: number;
}

export interface SaveOperation {
  /** Unique operation ID */
  id: string;
  /** Start timestamp */
  startTime: number;
  /** Data being saved */
  data: any;
  /** Operation promise */
  promise: Promise<void>;
}

/**
 * Auto-save manager with debouncing, browser event handling, and performance monitoring
 */
export class AutoSaveManager {
  private config: AutoSaveConfig;
  private metrics: AutoSaveMetrics;
  private debounceTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private pendingSaveOp: SaveOperation | null = null;
  private sessionId: string;
  private isActive = true;
  private visibilityHidden = false;
  
  // Performance tracking
  private saveTimes: number[] = [];
  private performanceMarks = new Map<string, number>();
  
  // Event handlers for cleanup
  private boundEventHandlers: { [key: string]: EventListener } = {};
  
  constructor(sessionId: string, config: Partial<AutoSaveConfig> = {}) {
    this.sessionId = sessionId;
    this.config = {
      debounceMs: 2000,
      heartbeatIntervalMs: 30000,
      maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
      enablePerformanceMonitoring: true,
      performanceTarget: 50,
      ...config,
    };
    
    this.metrics = {
      totalSaves: 0,
      failedSaves: 0,
      averageSaveTime: 0,
      lastSaveTime: 0,
      sessionId,
      heartbeatFailures: 0,
    };
    
    this.setupBrowserEventListeners();
    this.startHeartbeat();
    
    console.log(`[AutoSave] Initialized for session ${sessionId}`);
  }
  
  /**
   * Schedule a debounced save operation
   */
  scheduleSave(data: any): Promise<void> {
    // Cancel pending save if exists
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    
    return new Promise((resolve, reject) => {
      this.debounceTimer = window.setTimeout(async () => {
        try {
          await this.performSave(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, this.config.debounceMs);
    });
  }
  
  /**
   * Perform immediate save (bypass debouncing)
   */
  async immediateSave(data: any): Promise<void> {
    // Cancel pending debounced save
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    return await this.performSave(data);
  }
  
  /**
   * Execute the actual save operation with performance monitoring
   */
  private async performSave(data: any): Promise<void> {
    if (!this.isActive) {
      throw new Error('[AutoSave] Manager is not active');
    }
    
    const operationId = `save-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    // Mark performance start
    if (this.config.enablePerformanceMonitoring) {
      performance.mark(`autosave-start-${operationId}`);
    }
    
    try {
      // Create recovery session
      const session: RecoverySession = {
        id: this.sessionId,
        metadata: {
          lastUpdated: Date.now(),
          version: '1.0',
          userAgent: navigator.userAgent,
          url: window.location.href,
          title: document.title,
        },
        stateData: this.sanitizeForStorage(data),
      };
      
      // Cancel any pending save operation
      if (this.pendingSaveOp) {
        console.log(`[AutoSave] Cancelling pending operation ${this.pendingSaveOp.id}`);
      }
      
      // Create new save operation
      const savePromise = recoveryStorage.saveSession(session);
      this.pendingSaveOp = {
        id: operationId,
        startTime,
        data,
        promise: savePromise,
      };
      
      // Wait for completion
      await savePromise;
      
      // Performance tracking
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (this.config.enablePerformanceMonitoring) {
        performance.mark(`autosave-end-${operationId}`);
        performance.measure(`autosave-duration-${operationId}`, 
          `autosave-start-${operationId}`, 
          `autosave-end-${operationId}`);
        
        this.trackSaveTime(duration);
        
        // Log performance warning if exceeding target
        if (duration > this.config.performanceTarget) {
          console.warn(`[AutoSave] Save operation ${operationId} took ${duration.toFixed(2)}ms (target: ${this.config.performanceTarget}ms)`);
        }
      }
      
      // Update metrics
      this.metrics.totalSaves++;
      this.metrics.lastSaveTime = Date.now();
      this.pendingSaveOp = null;
      
      console.log(`[AutoSave] Successfully saved session ${this.sessionId} in ${duration.toFixed(2)}ms`);
      
    } catch (error) {
      this.metrics.failedSaves++;
      this.pendingSaveOp = null;
      
      console.error(`[AutoSave] Failed to save session ${this.sessionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Sanitize data for storage (remove non-serializable objects)
   */
  private sanitizeForStorage(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    // Handle different data types
    if (data instanceof File || data instanceof Blob) {
      return null; // Remove File/Blob objects
    }
    
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      return null; // Remove binary data
    }
    
    if (typeof data === 'function') {
      return null; // Remove functions
    }
    
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.map(item => this.sanitizeForStorage(item)).filter(item => item !== null);
      }
      
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        const sanitizedValue = this.sanitizeForStorage(value);
        if (sanitizedValue !== null) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }
    
    return data; // Primitive values
  }
  
  /**
   * Track save operation performance
   */
  private trackSaveTime(duration: number): void {
    this.saveTimes.push(duration);
    
    // Keep only last 100 measurements for rolling average
    if (this.saveTimes.length > 100) {
      this.saveTimes.shift();
    }
    
    // Calculate rolling average
    const sum = this.saveTimes.reduce((acc, time) => acc + time, 0);
    this.metrics.averageSaveTime = sum / this.saveTimes.length;
  }
  
  /**
   * Set up browser event listeners for critical save scenarios
   */
  private setupBrowserEventListeners(): void {
    // Page unload - last chance to save
    this.boundEventHandlers.beforeunload = (event: BeforeUnloadEvent) => {
      console.log('[AutoSave] Page unloading - attempting final save');
      
      if (this.pendingSaveOp) {
        // Try to complete pending save synchronously
        // Note: Modern browsers limit what we can do here
        event.preventDefault();
        return (event.returnValue = 'Auto-save in progress...');
      }
    };
    
    // Visibility change - save when tab becomes hidden
    this.boundEventHandlers.visibilitychange = async () => {
      const wasHidden = this.visibilityHidden;
      this.visibilityHidden = document.hidden;
      
      if (document.hidden && !wasHidden) {
        console.log('[AutoSave] Tab hidden - triggering save');
        // Don't await to avoid blocking
        this.triggerVisibilitySave();
      } else if (!document.hidden && wasHidden) {
        console.log('[AutoSave] Tab visible - resuming heartbeat');
        this.restartHeartbeat();
      }
    };
    
    // Page focus/blur
    this.boundEventHandlers.blur = () => {
      console.log('[AutoSave] Window blur - triggering save');
      this.triggerVisibilitySave();
    };
    
    // Network status changes
    this.boundEventHandlers.online = () => {
      console.log('[AutoSave] Network online - resuming saves');
      this.isActive = true;
    };
    
    this.boundEventHandlers.offline = () => {
      console.log('[AutoSave] Network offline - pausing saves');
      this.isActive = false;
    };
    
    // Error handling
    this.boundEventHandlers.error = (event: ErrorEvent) => {
      console.error('[AutoSave] Global error detected:', event.error);
      // Try to save current state before potential crash
      this.triggerEmergencySave();
    };
    
    this.boundEventHandlers.unhandledrejection = (event: PromiseRejectionEvent) => {
      console.error('[AutoSave] Unhandled promise rejection:', event.reason);
      this.triggerEmergencySave();
    };
    
    // Attach all event listeners
    window.addEventListener('beforeunload', this.boundEventHandlers.beforeunload);
    document.addEventListener('visibilitychange', this.boundEventHandlers.visibilitychange);
    window.addEventListener('blur', this.boundEventHandlers.blur);
    window.addEventListener('online', this.boundEventHandlers.online);
    window.addEventListener('offline', this.boundEventHandlers.offline);
    window.addEventListener('error', this.boundEventHandlers.error);
    window.addEventListener('unhandledrejection', this.boundEventHandlers.unhandledrejection);
  }
  
  /**
   * Trigger save when tab becomes hidden/blurred
   */
  private triggerVisibilitySave(): void {
    // Get current state from store if available
    // This will be called by the store integration
    const event = new CustomEvent('autosave:visibility-save', {
      detail: { sessionId: this.sessionId }
    });
    window.dispatchEvent(event);
  }
  
  /**
   * Trigger emergency save on errors
   */
  private triggerEmergencySave(): void {
    const event = new CustomEvent('autosave:emergency-save', {
      detail: { sessionId: this.sessionId }
    });
    window.dispatchEvent(event);
  }
  
  /**
   * Start heartbeat mechanism to detect abandoned sessions
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(async () => {
      if (!this.isActive || this.visibilityHidden) {
        return; // Skip heartbeat when inactive or hidden
      }
      
      try {
        await this.updateHeartbeat();
        
        // Reset failure count on success
        if (this.metrics.heartbeatFailures > 0) {
          console.log(`[AutoSave] Heartbeat recovered after ${this.metrics.heartbeatFailures} failures`);
          this.metrics.heartbeatFailures = 0;
        }
        
      } catch (error) {
        this.metrics.heartbeatFailures++;
        console.warn(`[AutoSave] Heartbeat failure ${this.metrics.heartbeatFailures}:`, error);
        
        // After 3 failures, consider session potentially abandoned
        if (this.metrics.heartbeatFailures >= 3) {
          console.error('[AutoSave] Multiple heartbeat failures - session may be abandoned');
          // Trigger emergency save
          this.triggerEmergencySave();
        }
      }
    }, this.config.heartbeatIntervalMs);
  }
  
  /**
   * Update heartbeat timestamp for session
   */
  private async updateHeartbeat(): Promise<void> {
    const heartbeatData = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    
    // Store heartbeat (separate from main session data)
    await recoveryStorage.updateHeartbeat?.(this.sessionId, heartbeatData);
  }
  
  /**
   * Restart heartbeat after visibility change
   */
  private restartHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
    }
    this.startHeartbeat();
  }
  
  /**
   * Get current auto-save metrics
   */
  getMetrics(): AutoSaveMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get performance information
   */
  getPerformanceInfo() {
    const recentMeasures = performance.getEntriesByType('measure')
      .filter(entry => entry.name.startsWith('autosave-duration'))
      .slice(-10); // Last 10 operations
    
    return {
      metrics: this.getMetrics(),
      recentSaveTimes: [...this.saveTimes].slice(-10),
      performanceEntries: recentMeasures,
      config: { ...this.config },
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AutoSaveConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart heartbeat if interval changed
    if (newConfig.heartbeatIntervalMs) {
      this.restartHeartbeat();
    }
    
    console.log('[AutoSave] Configuration updated:', newConfig);
  }
  
  /**
   * Pause auto-save operations
   */
  pause(): void {
    this.isActive = false;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('[AutoSave] Paused');
  }
  
  /**
   * Resume auto-save operations
   */
  resume(): void {
    this.isActive = true;
    console.log('[AutoSave] Resumed');
  }
  
  /**
   * Cleanup resources and stop auto-save
   */
  dispose(): void {
    this.isActive = false;
    
    // Clear timers
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Remove event listeners
    Object.entries(this.boundEventHandlers).forEach(([event, handler]) => {
      if (event === 'visibilitychange') {
        document.removeEventListener(event, handler);
      } else {
        window.removeEventListener(event, handler);
      }
    });
    
    // Wait for pending operation to complete
    if (this.pendingSaveOp) {
      console.log(`[AutoSave] Waiting for pending operation ${this.pendingSaveOp.id} to complete...`);
      this.pendingSaveOp.promise.catch(() => {
        // Ignore errors during cleanup
      });
    }
    
    console.log(`[AutoSave] Disposed session ${this.sessionId}`);
  }
}

/**
 * Auto-save service for managing multiple sessions and conflict resolution
 */
export class AutoSaveService {
  private managers = new Map<string, AutoSaveManager>();
  private globalConfig: AutoSaveConfig;
  
  constructor(config: Partial<AutoSaveConfig> = {}) {
    this.globalConfig = {
      debounceMs: 2000,
      heartbeatIntervalMs: 30000,
      maxSessionAge: 24 * 60 * 60 * 1000,
      enablePerformanceMonitoring: true,
      performanceTarget: 50,
      ...config,
    };
    
    // Setup global conflict resolution
    this.setupConflictResolution();
    
    console.log('[AutoSaveService] Initialized');
  }
  
  /**
   * Create or get auto-save manager for a session
   */
  getManager(sessionId: string): AutoSaveManager {
    if (!this.managers.has(sessionId)) {
      const manager = new AutoSaveManager(sessionId, this.globalConfig);
      this.managers.set(sessionId, manager);
      console.log(`[AutoSaveService] Created manager for session ${sessionId}`);
    }
    
    return this.managers.get(sessionId)!;
  }
  
  /**
   * Remove session manager
   */
  removeManager(sessionId: string): void {
    const manager = this.managers.get(sessionId);
    if (manager) {
      manager.dispose();
      this.managers.delete(sessionId);
      console.log(`[AutoSaveService] Removed manager for session ${sessionId}`);
    }
  }
  
  /**
   * Setup conflict resolution for multiple tabs
   */
  private setupConflictResolution(): void {
    // Use BroadcastChannel for cross-tab coordination
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel('chatterbox-autosave');
      
      channel.onmessage = (event) => {
        const { type, sessionId, timestamp } = event.data;
        
        switch (type) {
          case 'session-active':
            this.handleSessionActiveNotification(sessionId, timestamp);
            break;
          case 'session-conflict':
            this.handleSessionConflict(sessionId);
            break;
        }
      };
      
      // Announce active sessions periodically
      setInterval(() => {
        this.managers.forEach((manager, sessionId) => {
          channel.postMessage({
            type: 'session-active',
            sessionId,
            timestamp: Date.now(),
            tabId: this.getTabId(),
          });
        });
      }, 10000); // Every 10 seconds
    }
  }
  
  /**
   * Handle notification of active session from another tab
   */
  private handleSessionActiveNotification(sessionId: string, timestamp: number): void {
    const manager = this.managers.get(sessionId);
    if (manager) {
      console.log(`[AutoSaveService] Detected concurrent session ${sessionId} in another tab`);
      // Implement conflict resolution strategy here
      // For now, we'll let both tabs continue but add warnings
    }
  }
  
  /**
   * Handle session conflict
   */
  private handleSessionConflict(sessionId: string): void {
    console.warn(`[AutoSaveService] Session conflict detected for ${sessionId}`);
    // Implement conflict resolution UI notification
    const event = new CustomEvent('autosave:conflict', {
      detail: { sessionId }
    });
    window.dispatchEvent(event);
  }
  
  /**
   * Get unique tab identifier
   */
  private getTabId(): string {
    if (!window.name) {
      window.name = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    return window.name;
  }
  
  /**
   * Get metrics for all active sessions
   */
  getAllMetrics(): { [sessionId: string]: AutoSaveMetrics } {
    const metrics: { [sessionId: string]: AutoSaveMetrics } = {};
    
    this.managers.forEach((manager, sessionId) => {
      metrics[sessionId] = manager.getMetrics();
    });
    
    return metrics;
  }
  
  /**
   * Update global configuration
   */
  updateGlobalConfig(config: Partial<AutoSaveConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };
    
    // Update all existing managers
    this.managers.forEach((manager) => {
      manager.updateConfig(config);
    });
    
    console.log('[AutoSaveService] Global configuration updated');
  }
  
  /**
   * Cleanup all managers
   */
  dispose(): void {
    this.managers.forEach((manager) => {
      manager.dispose();
    });
    this.managers.clear();
    
    console.log('[AutoSaveService] Disposed all managers');
  }
}

// Global service instance
export const autoSaveService = new AutoSaveService();