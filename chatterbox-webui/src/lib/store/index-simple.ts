import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';
import { voiceAPI } from '../voiceApi';
import { 
  AppState, 
  TextChunk, 
  TTSParameters, 
  SavedVoice, 
  Session, 
  BatchItem 
} from './types';
import { RecoverySlice, createRecoverySlice } from './slices/recoverySlice';
import { storageManager } from '../storage';

// Extended state that includes recovery slice
type ExtendedAppState = AppState & RecoverySlice;

// Storage adapter for Zustand
const storage = createJSONStorage(() => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await storageManager.get<string>(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await storageManager.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await storageManager.delete(name);
  },
}));

// Migrate old saved voices to new key (legacy compatibility)
const migrateSavedVoices = () => {
  try {
    const oldVoices = localStorage.getItem('savedVoices');
    const newVoices = localStorage.getItem('chatterbox_saved_voices');
    
    if (oldVoices && !newVoices) {
      localStorage.setItem('chatterbox_saved_voices', oldVoices);
      localStorage.removeItem('savedVoices');
      console.log('[Store] Migrated saved voices to new key');
    }
  } catch (e) {
    console.error('Failed to migrate saved voices:', e);
  }
};

// Run migration on store initialization
migrateSavedVoices();

// Create the store with persistence and recovery
export const useStore = create<ExtendedAppState>()(
  subscribeWithSelector(
    persist(
      (set, get, api) => ({
        // Text management
        chunks: [],
        addChunk: (text) =>
          set((state) => ({
            chunks: [
              ...state.chunks,
              {
                id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
                text,
                status: 'pending',
              } as TextChunk,
            ],
          })),
        updateChunk: (id, updates) =>
          set((state) => ({
            chunks: state.chunks.map((chunk) =>
              chunk.id === id ? { ...chunk, ...updates } : chunk
            ),
          })),
        removeChunk: (id) =>
          set((state) => ({
            chunks: state.chunks.filter((chunk) => chunk.id !== id),
          })),
        clearChunks: () => set({ chunks: [] }),
        
        // Voice reference
        voiceReference: null,
        setVoiceReference: (file) => set({ voiceReference: file }),
        
        // TTS Parameters
        parameters: {
          exaggeration: 0.5,
          temperature: 0.8,
          cfg_weight: 0.5,
          min_p: 0.05,
          top_p: 1.0,
          repetition_penalty: 1.2,
          seed: null,
          speech_rate: 1.0,
        },
        updateParameters: (params) =>
          set((state) => ({
            parameters: { ...state.parameters, ...params },
          })),
        
        // TTS Engine
        ttsEngine: 'chatterbox',
        setTTSEngine: (engine) => set({ ttsEngine: engine }),
        
        // Generation state (not persisted)
        isGenerating: false,
        setIsGenerating: (generating) => set({ isGenerating: generating }),
        currentGeneratingId: null,
        setCurrentGeneratingId: (id) => set({ currentGeneratingId: id }),
        
        // Streaming
        useStreaming: false,
        setUseStreaming: (streaming) => set({ useStreaming: streaming }),
        
        // System status (not persisted)
        systemStatus: {
          healthy: false,
          gpuAvailable: false,
          modelLoaded: false,
        },
        updateSystemStatus: (status) =>
          set((state) => ({
            systemStatus: { ...state.systemStatus, ...status },
          })),
        
        // Saved voices (metadata only persisted)
        savedVoices: [],
        saveVoice: async (name) => {
          const state = get();
          if (!state.voiceReference) {
            throw new Error('No voice reference file selected');
          }
          
          const result = await voiceAPI.saveVoice(name, state.voiceReference, state.parameters);
          if (result.success) {
            const voices = await voiceAPI.listVoices();
            set({ savedVoices: voices });
          }
        },
        loadVoice: async (voiceId) => {
          const state = get();
          const voice = state.savedVoices.find(v => v.id === voiceId);
          if (!voice) {
            throw new Error(`Voice ${voiceId} not found`);
          }
          
          let voiceReference: File | null = null;
          
          if (voice.voiceReferenceUrl) {
            const response = await fetch(voice.voiceReferenceUrl);
            const blob = await response.blob();
            voiceReference = new File([blob], `${voice.name}.wav`, { type: blob.type });
          } else if (voice.voiceReferenceData) {
            const response = await fetch(voice.voiceReferenceData);
            const blob = await response.blob();
            voiceReference = new File([blob], `${voice.name}.wav`, { type: blob.type });
          }
          
          const parameters = voice.parameters || {
            exaggeration: 0.5,
            temperature: 0.8,
            cfg_weight: 0.5,
            min_p: 0.05,
            top_p: 1.0,
            repetition_penalty: 1.2,
            seed: Math.floor(Math.random() * 999999) + 1,
            speech_rate: 1.0,
          };
          
          set({
            parameters: { ...parameters },
            voiceReference,
          });
        },
        deleteVoice: async (voiceId) => {
          const deleted = await voiceAPI.deleteVoice(voiceId);
          if (deleted) {
            const voices = await voiceAPI.listVoices();
            set({ savedVoices: voices });
          }
        },
        loadVoicesFromServer: async () => {
          try {
            const voices = await voiceAPI.listVoices();
            set({ savedVoices: voices });
          } catch (error) {
            console.error('[Store] Failed to load voices from server:', error);
          }
        },
        
        // Cancellation
        cancelGeneration: () => set((state) => {
          const updatedChunks = state.chunks.map(chunk => 
            chunk.status === 'generating' 
              ? { ...chunk, status: 'error' as const, error: 'Cancelled by user' }
              : chunk
          );
          return {
            chunks: updatedChunks,
            isGenerating: false,
            currentGeneratingId: null,
          };
        }),
        
        // Sessions (with improved persistence)
        sessions: [],
        currentSessionId: null,
        
        saveSession: async (name) => {
          const state = get();
          const sessionName = name || `Session ${new Date().toLocaleString()}`;
          
          // Convert voice reference to base64 if it exists
          let voiceReferenceData: string | undefined;
          if (state.voiceReference) {
            const reader = new FileReader();
            voiceReferenceData = await new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(state.voiceReference!);
            });
          }
          
          // Convert audio URLs to base64 for persistence
          const chunksWithAudio = await Promise.all(
            state.chunks.map(async (chunk) => {
              if (chunk.audioData) return chunk;
              
              if (chunk.audioUrl && chunk.status === 'completed') {
                try {
                  const response = await fetch(chunk.audioUrl);
                  const blob = await response.blob();
                  const reader = new FileReader();
                  const audioData = await new Promise<string>((resolve) => {
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  return { ...chunk, audioData };
                } catch (e) {
                  console.error('Failed to convert audio to base64:', e);
                  return chunk;
                }
              }
              return chunk;
            })
          );
          
          let session: Session;
          let updatedSessions: Session[];
          
          if (state.currentSessionId) {
            const existingSession = state.sessions.find(s => s.id === state.currentSessionId);
            session = {
              id: state.currentSessionId,
              name: sessionName,
              chunks: chunksWithAudio,
              parameters: { ...state.parameters },
              voiceReferenceData,
              createdAt: existingSession?.createdAt || new Date(),
              updatedAt: new Date(),
            };
            updatedSessions = state.sessions.map(s => 
              s.id === state.currentSessionId ? session : s
            );
          } else {
            session = {
              id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
              name: sessionName,
              chunks: chunksWithAudio,
              parameters: { ...state.parameters },
              voiceReferenceData,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            updatedSessions = [...state.sessions, session];
          }
          
          set({ 
            sessions: updatedSessions,
            currentSessionId: session.id 
          });
        },
        
        loadSession: async (sessionId) => {
          const state = get();
          const session = state.sessions.find(s => s.id === sessionId);
          
          if (session) {
            let voiceReference: File | null = null;
            
            if (session.voiceReferenceData) {
              try {
                const response = await fetch(session.voiceReferenceData);
                const blob = await response.blob();
                voiceReference = new File([blob], `session-voice-${session.id}.wav`, { type: blob.type });
              } catch (e) {
                console.error('Failed to restore voice reference:', e);
              }
            }
            
            const restoredChunks = session.chunks.map(chunk => {
              if (chunk.audioData && chunk.status === 'completed') {
                const audioUrl = chunk.audioData;
                return { ...chunk, audioUrl };
              }
              return chunk;
            });
            
            set({
              chunks: restoredChunks,
              parameters: session.parameters,
              voiceReference,
              currentSessionId: sessionId,
            });
          }
        },
        
        deleteSession: (sessionId) => {
          const state = get();
          const updatedSessions = state.sessions.filter(s => s.id !== sessionId);
          
          set({ 
            sessions: updatedSessions,
            currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
          });
        },
        
        newSession: () => set({
          chunks: [],
          voiceReference: null,
          currentSessionId: null,
        }),
        
        // Batch processing
        batchItems: [],
        addBatchItem: (text, filename) =>
          set((state) => ({
            batchItems: [
              ...state.batchItems,
              {
                id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
                text,
                filename,
              },
            ],
          })),
        removeBatchItem: (id) =>
          set((state) => ({
            batchItems: state.batchItems.filter((item) => item.id !== id),
          })),
        clearBatchItems: () => set({ batchItems: [] }),
        updateBatchItem: (id, updates) =>
          set((state) => ({
            batchItems: state.batchItems.map((item) =>
              item.id === id ? { ...item, ...updates } : item
            ),
          })),
        processBatch: () => {
          const state = get();
          state.batchItems.forEach(item => {
            state.addChunk(item.text);
          });
          state.clearBatchItems();
        },
        
        // Recovery slice
        ...createRecoverySlice(set, get),
      }),
      {
        name: 'chatterbox-store',
        storage,
        partialize: (state) => ({
          // Only persist specific parts of the state
          chunks: state.chunks,
          parameters: state.parameters,
          ttsEngine: state.ttsEngine,
          useStreaming: state.useStreaming,
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
          batchItems: state.batchItems,
          autoSaveEnabled: state.autoSaveEnabled,
          autoSaveInterval: state.autoSaveInterval,
        }),
        version: 1,
      }
    )
  )
);

// Export types
export type { 
  AppState, 
  ExtendedAppState,
  TextChunk, 
  TTSParameters, 
  SavedVoice, 
  Session, 
  BatchItem 
};

// Export cleanup function
export const disposePersistenceMiddleware = () => {
  // No cleanup needed in simplified version
};