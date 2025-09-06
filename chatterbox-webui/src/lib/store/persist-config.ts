/**
 * Persistence configuration for the Chatterbox TTS application
 * Defines what state should be persisted and how migrations are handled
 */

import { PersistConfig } from './persistence';
import { AppState } from '../store';

/**
 * Configuration for state persistence
 * Only essential user data and preferences are persisted
 */
export const persistConfig: PersistConfig<AppState> = {
  name: 'chatterbox-app-state',
  version: 1,
  
  // Select which parts of state to persist
  partialize: (state) => ({
    // User preferences and settings
    parameters: state.parameters,
    ttsEngine: state.ttsEngine,
    useStreaming: state.useStreaming,
    
    // Session data (limit to prevent storage bloat)
    sessions: state.sessions?.slice(-10) || [], // Keep last 10 sessions
    currentSessionId: state.currentSessionId,
    
    // Saved voices (essential for user workflow)
    savedVoices: state.savedVoices,
    
    // Current work state
    chunks: state.chunks?.filter(chunk => 
      // Only persist completed chunks with audio data
      chunk.status === 'completed' && (chunk.audioData || chunk.audioUrl)
    ) || [],
    
    // Batch processing state
    batchItems: state.batchItems,
    
    // Note: We don't persist temporary state like:
    // - isGenerating, currentGeneratingId (runtime state)
    // - voiceReference (File objects can't be serialized)
    // - systemStatus (should be refreshed on app start)
  }),
  
  // Migration function for handling version changes
  migrate: async (persistedState: unknown, version: number) => {
    console.log(`Migrating app state from version ${version}`);
    
    // Type guard for old state
    const oldState = persistedState as any;
    
    if (version < 1) {
      // Migration from version 0 (pre-versioned state) to version 1
      return {
        ...oldState,
        
        // Ensure all required fields have defaults
        parameters: oldState.parameters || {
          exaggeration: 0.5,
          temperature: 0.8,
          cfg_weight: 0.5,
          min_p: 0.05,
          top_p: 1.0,
          repetition_penalty: 1.2,
          seed: null,
          speech_rate: 1.0,
        },
        
        ttsEngine: oldState.ttsEngine || 'chatterbox',
        useStreaming: oldState.useStreaming ?? false,
        
        sessions: Array.isArray(oldState.sessions) ? oldState.sessions : [],
        savedVoices: Array.isArray(oldState.savedVoices) ? oldState.savedVoices : [],
        chunks: Array.isArray(oldState.chunks) ? oldState.chunks : [],
        batchItems: Array.isArray(oldState.batchItems) ? oldState.batchItems : [],
        
        currentSessionId: oldState.currentSessionId || null,
      };
    }
    
    // For future migrations, add more version checks here
    return oldState;
  },
  
  // Custom merge function to handle complex state merging
  merge: async (persistedState: unknown, currentState: AppState) => {
    const persisted = persistedState as Partial<AppState>;
    
    // Deep merge with special handling for arrays and objects
    const merged: AppState = {
      ...currentState,
      ...persisted,
      
      // Merge parameters object
      parameters: {
        ...currentState.parameters,
        ...persisted.parameters,
      },
      
      // Merge system status (prefer current state)
      systemStatus: {
        ...currentState.systemStatus,
        // Don't restore system status from persistence
      },
      
      // Handle arrays with deduplication
      sessions: persisted.sessions || currentState.sessions,
      savedVoices: persisted.savedVoices || currentState.savedVoices,
      chunks: persisted.chunks || currentState.chunks,
      batchItems: persisted.batchItems || currentState.batchItems,
    };
    
    // Restore blob URLs for persisted chunks with audioData
    if (merged.chunks) {
      merged.chunks = await Promise.all(
        merged.chunks.map(async (chunk) => {
          if (chunk.audioData && !chunk.audioUrl) {
            try {
              // Convert base64 audio data back to blob URL
              const response = await fetch(chunk.audioData);
              const blob = await response.blob();
              const audioUrl = URL.createObjectURL(blob);
              return { ...chunk, audioUrl };
            } catch (error) {
              console.error('Failed to restore audio URL for chunk:', chunk.id, error);
              return chunk;
            }
          }
          return chunk;
        })
      );
    }
    
    return merged;
  },
  
  // Write debouncing to prevent excessive saves during rapid state changes
  writeDelay: 300,
  
  // Enable compression for large state objects (sessions with audio data)
  compress: true,
  
  // Error handling
  onError: (error) => {
    console.error('State persistence error:', error);
    
    // Could emit to error tracking service here
    // analytics.track('state_persistence_error', { error: error.message });
    
    // For quota exceeded errors, try to free up space
    if (error.code === 'QUOTA_EXCEEDED') {
      console.log('Storage quota exceeded, attempting cleanup...');
      // The storage manager should handle this automatically
    }
  },
  
  // Successful rehydration callback
  onRehydrateStorage: (state, error) => {
    if (error) {
      console.error('State rehydration failed:', error);
    } else if (state) {
      console.log('State rehydrated successfully');
      
      // Validate restored state
      if (state.chunks && state.chunks.length > 0) {
        console.log(`Restored ${state.chunks.length} chunks from previous session`);
      }
      
      if (state.sessions && state.sessions.length > 0) {
        console.log(`Restored ${state.sessions.length} saved sessions`);
      }
      
      if (state.savedVoices && state.savedVoices.length > 0) {
        console.log(`Restored ${state.savedVoices.length} saved voices`);
      }
    }
  },
};

/**
 * Selective persistence configurations for different use cases
 */

// Minimal config - only essential preferences
export const minimalPersistConfig: PersistConfig<AppState> = {
  name: 'chatterbox-minimal',
  version: 1,
  
  partialize: (state) => ({
    parameters: state.parameters,
    ttsEngine: state.ttsEngine,
    useStreaming: state.useStreaming,
  }),
  
  writeDelay: 100,
  compress: false,
};

// Session-only config - for temporary work preservation
export const sessionPersistConfig: PersistConfig<AppState> = {
  name: 'chatterbox-session',
  version: 1,
  
  partialize: (state) => ({
    chunks: state.chunks,
    parameters: state.parameters,
    currentSessionId: state.currentSessionId,
  }),
  
  writeDelay: 500,
  compress: true,
};

// Recovery config - for crash recovery scenarios
export const recoveryPersistConfig: PersistConfig<AppState> = {
  name: 'chatterbox-recovery',
  version: 1,
  
  partialize: (state) => ({
    chunks: state.chunks?.filter(chunk => 
      chunk.status === 'generating' || 
      (chunk.status === 'completed' && chunk.audioData)
    ),
    parameters: state.parameters,
    voiceReference: null, // Can't persist File objects
    isGenerating: state.isGenerating,
    currentGeneratingId: state.currentGeneratingId,
  }),
  
  writeDelay: 1000, // Less frequent writes for recovery data
  compress: true,
  
  // Override storage key to separate from main persistence
  name: 'chatterbox-recovery-state',
};

/**
 * Utility to create custom persistence config
 */
export const createCustomPersistConfig = (
  overrides: Partial<PersistConfig<AppState>>
): PersistConfig<AppState> => ({
  ...persistConfig,
  ...overrides,
});

/**
 * Performance considerations for persistence
 */
export const PERSISTENCE_NOTES = {
  // State size limits (approximate)
  MAX_CHUNKS_TO_PERSIST: 50, // ~50MB if each has 1MB audio
  MAX_SESSIONS_TO_PERSIST: 10, // Keep storage reasonable
  
  // Write frequency limits
  MIN_WRITE_DELAY: 100, // Don't write more than 10x per second
  MAX_WRITE_DELAY: 5000, // Ensure changes are saved within 5 seconds
  
  // Storage thresholds
  STORAGE_WARNING_THRESHOLD: 0.8, // Warn at 80% quota usage
  STORAGE_CLEANUP_THRESHOLD: 0.9, // Auto-cleanup at 90% usage
} as const;