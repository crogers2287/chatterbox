/**
 * App Initialization with Recovery
 * 
 * Integrates recovery detection into the app startup process
 * Performance target: < 100ms for recovery detection
 */

import { recoveryDetection, initializeRecoverySystem } from './restoreFlow';
import type { RecoveryDetectionResult } from './restoreFlow';

export interface AppInitializationConfig {
  /** Whether recovery detection is enabled */
  enableRecovery: boolean;
  /** Whether to show loading indicators during recovery */
  showLoadingUI: boolean;
  /** Maximum time to wait for recovery initialization */
  maxInitTime: number;
  /** Whether to block app startup until recovery is complete */
  blockStartupForRecovery: boolean;
}

export interface AppInitializationResult {
  /** Whether initialization completed successfully */
  success: boolean;
  /** Time taken for initialization in ms */
  initTime: number;
  /** Recovery detection result if enabled */
  recovery?: RecoveryDetectionResult;
  /** Any errors encountered */
  errors: string[];
  /** Whether app can proceed with normal startup */
  canProceed: boolean;
}

/**
 * App Initialization Manager
 */
export class AppInitializationManager {
  private config: AppInitializationConfig;
  private isInitialized = false;

  constructor(config: Partial<AppInitializationConfig> = {}) {
    this.config = {
      enableRecovery: true,
      showLoadingUI: true,
      maxInitTime: 3000, // 3 seconds max
      blockStartupForRecovery: false,
      ...config
    };
  }

  /**
   * Initialize the application with recovery detection
   */
  async initializeApp(): Promise<AppInitializationResult> {
    if (this.isInitialized) {
      return {
        success: true,
        initTime: 0,
        errors: [],
        canProceed: true
      };
    }

    const startTime = performance.now();
    const result: AppInitializationResult = {
      success: false,
      initTime: 0,
      errors: [],
      canProceed: false
    };

    try {
      // Show loading UI if enabled
      if (this.config.showLoadingUI) {
        this.showLoadingIndicator();
      }

      // Initialize recovery system if enabled
      if (this.config.enableRecovery) {
        try {
          result.recovery = await this.initializeRecoveryWithTimeout();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Recovery initialization failed';
          result.errors.push(errorMsg);
          console.warn('[AppInit] Recovery failed, continuing without recovery:', errorMsg);
        }
      }

      // Mark as initialized
      this.isInitialized = true;
      result.success = true;
      result.canProceed = true;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';
      result.errors.push(errorMsg);
      console.error('[AppInit] App initialization failed:', errorMsg);
      
      // Decide if app can proceed despite errors
      result.canProceed = !this.config.blockStartupForRecovery;
    } finally {
      result.initTime = performance.now() - startTime;
      
      // Hide loading UI
      if (this.config.showLoadingUI) {
        this.hideLoadingIndicator();
      }

      // Log initialization results
      this.logInitializationResults(result);
    }

    return result;
  }

  /**
   * Initialize recovery with timeout
   */
  private async initializeRecoveryWithTimeout(): Promise<RecoveryDetectionResult> {
    const recoveryPromise = initializeRecoverySystem();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Recovery initialization timeout')), this.config.maxInitTime);
    });

    return Promise.race([recoveryPromise, timeoutPromise]);
  }

  /**
   * Show loading indicator
   */
  private showLoadingIndicator(): void {
    // Create and show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'app-init-loading';
    loadingDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    loadingDiv.innerHTML = `
      <div style="text-align: center;">
        <div style="
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        "></div>
        <div style="color: #666; font-size: 16px;">Initializing Chatterbox...</div>
        <div id="init-progress" style="color: #999; font-size: 14px; margin-top: 8px;">Checking for recovery sessions...</div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(loadingDiv);
  }

  /**
   * Hide loading indicator
   */
  private hideLoadingIndicator(): void {
    const loadingDiv = document.getElementById('app-init-loading');
    if (loadingDiv) {
      loadingDiv.remove();
    }
  }

  /**
   * Update loading progress
   */
  private updateLoadingProgress(message: string): void {
    const progressDiv = document.getElementById('init-progress');
    if (progressDiv) {
      progressDiv.textContent = message;
    }
  }

  /**
   * Log initialization results
   */
  private logInitializationResults(result: AppInitializationResult): void {
    const { success, initTime, recovery, errors } = result;
    
    if (success) {
      console.log(`[AppInit] ✅ App initialized successfully in ${initTime.toFixed(2)}ms`);
      
      if (recovery) {
        if (recovery.hasRecovery) {
          console.log(
            `[AppInit] 🔄 Recovery: Found ${recovery.sessions.length} session(s) ` +
            `in ${recovery.detectionTime.toFixed(2)}ms`
          );
        } else {
          console.log(`[AppInit] ℹ️ Recovery: No sessions found (${recovery.detectionTime.toFixed(2)}ms)`);
        }
      }
    } else {
      console.error(`[AppInit] ❌ App initialization failed in ${initTime.toFixed(2)}ms:`, errors);
    }
  }

  /**
   * Check if app is initialized
   */
  isAppInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AppInitializationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): AppInitializationConfig {
    return { ...this.config };
  }
}

// Global app initialization manager
export const appInitManager = new AppInitializationManager();

/**
 * App startup hook for React applications
 */
export async function startupWithRecovery(config?: Partial<AppInitializationConfig>): Promise<AppInitializationResult> {
  if (config) {
    appInitManager.updateConfig(config);
  }

  return appInitManager.initializeApp();
}

/**
 * React Hook for app initialization
 */
export function useAppInitialization(config?: Partial<AppInitializationConfig>) {
  const [initResult, setInitResult] = React.useState<AppInitializationResult | null>(null);
  const [isInitializing, setIsInitializing] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      if (isInitializing || initResult) return;

      setIsInitializing(true);
      try {
        const result = await startupWithRecovery(config);
        if (mounted) {
          setInitResult(result);
        }
      } catch (error) {
        console.error('[AppInit] Hook initialization failed:', error);
        if (mounted) {
          setInitResult({
            success: false,
            initTime: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            canProceed: false
          });
        }
      } finally {
        if (mounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeApp();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    initResult,
    isInitializing,
    isReady: initResult?.canProceed || false,
    hasRecovery: initResult?.recovery?.hasRecovery || false,
    errors: initResult?.errors || []
  };
}

/**
 * Utility function to wait for app initialization
 */
export async function waitForAppInitialization(timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (appInitManager.isAppInitialized()) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (appInitManager.isAppInitialized()) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

// Add React import for the hook
declare global {
  const React: {
    useState: <T>(initialState: T) => [T, (value: T) => void];
    useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  };
}