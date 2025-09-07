/**
 * Auto-Save Integration for Zustand Store
 * 
 * Integrates the AutoSaveManager with the Zustand store to provide
 * automatic state persistence with performance monitoring and
 * browser event handling.
 */

import { subscribeWithSelector } from 'zustand/middleware';
import { autoSaveService } from '../recovery/autoSave';
import type { AutoSaveConfig, AutoSaveMetrics } from '../recovery/autoSave';
import type { AppState } from './types';

export interface AutoSaveState {
  // Configuration
  autoSaveConfig: AutoSaveConfig;
  
  // Status
  autoSaveEnabled: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'error' | 'paused';
  lastAutoSave: number | null;
  
  // Metrics
  autoSaveMetrics: AutoSaveMetrics | null;
  
  // Actions
  enableAutoSave: () => void;
  disableAutoSave: () => void;
  pauseAutoSave: () => void;
  resumeAutoSave: () => void;
  updateAutoSaveConfig: (config: Partial<AutoSaveConfig>) => void;
  triggerManualSave: () => Promise<void>;
  getAutoSaveMetrics: () => AutoSaveMetrics | null;
}

/**
 * Create auto-save slice for the store
 */
export const createAutoSaveSlice = (
  set: any,
  get: any
) => ({
  // Initial state
  autoSaveConfig: {
    debounceMs: 2000,
    heartbeatIntervalMs: 30000,
    maxSessionAge: 24 * 60 * 60 * 1000, // 24 hours
    enablePerformanceMonitoring: true,
    performanceTarget: 50,
  } as AutoSaveConfig,
  
  autoSaveEnabled: true,
  autoSaveStatus: 'idle' as const,
  lastAutoSave: null,
  autoSaveMetrics: null,
  
  // Actions
  enableAutoSave: () => {
    set({ autoSaveEnabled: true, autoSaveStatus: 'idle' });
    console.log('[AutoSave] Enabled');
  },
  
  disableAutoSave: () => {
    set({ autoSaveEnabled: false, autoSaveStatus: 'paused' });
    console.log('[AutoSave] Disabled');
  },
  
  pauseAutoSave: () => {
    const state = get();
    if (state.autoSaveEnabled) {
      set({ autoSaveStatus: 'paused' });
      // Note: The actual pausing is handled by the AutoSaveManager
      console.log('[AutoSave] Paused');
    }
  },
  
  resumeAutoSave: () => {
    const state = get();
    if (state.autoSaveEnabled) {
      set({ autoSaveStatus: 'idle' });
      console.log('[AutoSave] Resumed');
    }
  },
  
  updateAutoSaveConfig: (config: Partial<AutoSaveConfig>) => {
    const state = get();
    const newConfig = { ...state.autoSaveConfig, ...config };
    set({ autoSaveConfig: newConfig });
    
    // Update the service configuration
    autoSaveService.updateGlobalConfig(config);
    console.log('[AutoSave] Configuration updated:', config);
  },
  
  triggerManualSave: async () => {
    const state = get();
    if (!state.autoSaveEnabled) {
      throw new Error('Auto-save is disabled');
    }
    
    set({ autoSaveStatus: 'saving' });
    
    try {
      const sessionId = `session-${Date.now()}`;
      const manager = autoSaveService.getManager(sessionId);
      
      // Get serializable state
      const stateToSave = {
        chunks: state.chunks,
        parameters: state.parameters,
        ttsEngine: state.ttsEngine,
        useStreaming: state.useStreaming,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        batchItems: state.batchItems,
      };
      
      await manager.immediateSave(stateToSave);
      
      set({ 
        autoSaveStatus: 'idle',
        lastAutoSave: Date.now(),
        autoSaveMetrics: manager.getMetrics()
      });
      
      console.log('[AutoSave] Manual save completed');
      
    } catch (error) {
      set({ autoSaveStatus: 'error' });
      console.error('[AutoSave] Manual save failed:', error);
      throw error;
    }
  },
  
  getAutoSaveMetrics: () => {
    return get().autoSaveMetrics;
  },
});

/**
 * Auto-save middleware for Zustand store
 */
export const createAutoSaveMiddleware = <T extends AppState & AutoSaveState>(
  storeApi: any
) => {
  let sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let manager = autoSaveService.getManager(sessionId);
  
  // Set up event handlers
  const handleVisibilitySave = async (event: CustomEvent) => {
    if (event.detail.sessionId === sessionId) {
      const state = storeApi.getState();
      if (state.autoSaveEnabled && state.autoSaveStatus !== 'paused') {
        try {
          const stateToSave = getSerializableState(state);
          await manager.immediateSave(stateToSave);
          
          storeApi.setState({ 
            lastAutoSave: Date.now(),
            autoSaveMetrics: manager.getMetrics()
          });
          
        } catch (error) {
          console.error('[AutoSave] Visibility save failed:', error);
          storeApi.setState({ autoSaveStatus: 'error' });
        }
      }
    }
  };
  
  const handleEmergencySave = async (event: CustomEvent) => {
    if (event.detail.sessionId === sessionId) {
      const state = storeApi.getState();
      try {
        const stateToSave = getSerializableState(state);
        await manager.immediateSave(stateToSave);
        console.log('[AutoSave] Emergency save completed');
        
      } catch (error) {
        console.error('[AutoSave] Emergency save failed:', error);
      }
    }
  };
  
  const handleConflict = (event: CustomEvent) => {
    if (event.detail.sessionId === sessionId) {
      console.warn('[AutoSave] Session conflict detected');
      storeApi.setState({ autoSaveStatus: 'error' });
      
      // Notify user through recovery slice if available
      const state = storeApi.getState();
      if ('setRestoreError' in state) {
        state.setRestoreError('Multiple tabs detected - please close other tabs to avoid conflicts');
      }
    }
  };
  
  // Register event listeners
  window.addEventListener('autosave:visibility-save', handleVisibilitySave as EventListener);
  window.addEventListener('autosave:emergency-save', handleEmergencySave as EventListener);
  window.addEventListener('autosave:conflict', handleConflict as EventListener);
  
  // Store subscription for automatic saves
  const unsubscribe = storeApi.subscribe((state: T, prevState: T) => {
    if (!state.autoSaveEnabled || state.autoSaveStatus === 'paused') {
      return;
    }
    
    // Check if relevant state has changed
    if (hasRelevantStateChanged(state, prevState)) {
      // Schedule debounced save
      const stateToSave = getSerializableState(state);
      
      storeApi.setState({ autoSaveStatus: 'saving' });
      
      manager.scheduleSave(stateToSave)
        .then(() => {
          storeApi.setState({ 
            autoSaveStatus: 'idle',
            lastAutoSave: Date.now(),
            autoSaveMetrics: manager.getMetrics()
          });
        })
        .catch((error) => {
          console.error('[AutoSave] Scheduled save failed:', error);
          storeApi.setState({ autoSaveStatus: 'error' });
        });
    }
  });
  
  // Cleanup function
  const cleanup = () => {
    unsubscribe();
    window.removeEventListener('autosave:visibility-save', handleVisibilitySave as EventListener);
    window.removeEventListener('autosave:emergency-save', handleEmergencySave as EventListener);
    window.removeEventListener('autosave:conflict', handleConflict as EventListener);
    autoSaveService.removeManager(sessionId);
  };
  
  // Store cleanup function for later use
  (storeApi as any)._autoSaveCleanup = cleanup;
  
  return cleanup;
};

/**
 * Extract serializable state for auto-save
 */
function getSerializableState(state: any) {
  return {
    chunks: state.chunks?.map((chunk: any) => ({
      ...chunk,
      audioUrl: undefined, // Remove blob URLs
    })) || [],
    parameters: state.parameters,
    ttsEngine: state.ttsEngine,
    useStreaming: state.useStreaming,
    sessions: state.sessions || [],
    currentSessionId: state.currentSessionId,
    batchItems: state.batchItems || [],
    // Include auto-save config for recovery
    autoSaveConfig: state.autoSaveConfig,
  };
}

/**
 * Check if relevant state has changed (avoid saving on every render)
 */
function hasRelevantStateChanged(current: any, previous: any): boolean {
  // Define what state changes should trigger auto-save
  const relevantFields = [
    'chunks',
    'parameters', 
    'ttsEngine',
    'useStreaming',
    'sessions',
    'currentSessionId',
    'batchItems',
  ];
  
  return relevantFields.some(field => {
    const currentValue = JSON.stringify(current[field]);
    const previousValue = JSON.stringify(previous[field]);
    return currentValue !== previousValue;
  });
}

/**
 * Cleanup function for auto-save integration
 */
export const disposeAutoSave = (storeApi: any) => {
  if (storeApi._autoSaveCleanup) {
    storeApi._autoSaveCleanup();
    delete storeApi._autoSaveCleanup;
  }
};