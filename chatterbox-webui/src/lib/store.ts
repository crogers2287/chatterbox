import { create } from 'zustand';
import { voiceAPI } from './voiceApi';

export interface TextChunk {
  id: string;
  text: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
  filename?: string; // Optional filename for batch processing
  audioData?: string; // Base64 encoded audio data for persistence
  generatedWith?: { // Store parameters used to generate this chunk
    parameters: TTSParameters;
    voiceReferenceId?: string; // Reference to saved voice if used
  };
}

export interface TTSParameters {
  exaggeration: number;
  temperature: number;
  cfg_weight: number;
  min_p: number;
  top_p: number;
  repetition_penalty: number;
  seed: number | null;
  speech_rate: number;
}

export interface SavedVoice {
  id: string;
  name: string;
  parameters: TTSParameters;
  voiceReferenceUrl?: string;
  voiceReferenceData?: string; // Base64 encoded audio data
  voice_file?: File; // The actual File object when loaded
  createdAt: Date;
}

export interface Session {
  id: string;
  name: string;
  chunks: TextChunk[];
  parameters: TTSParameters;
  voiceReferenceData?: string;
  createdAt: Date;
  updatedAt: Date;
  userId?: string; // Associate with user
}

export interface BatchItem {
  id: string;
  text: string;
  filename?: string;
}

interface AppState {
  // Text management
  chunks: TextChunk[];
  addChunk: (text: string) => void;
  updateChunk: (id: string, updates: Partial<TextChunk>) => void;
  removeChunk: (id: string) => void;
  clearChunks: () => void;
  
  // Voice reference
  voiceReference: File | null;
  setVoiceReference: (file: File | null) => void;
  
  // TTS Parameters
  parameters: TTSParameters;
  updateParameters: (params: Partial<TTSParameters>) => void;
  
  // TTS Engine
  ttsEngine: 'chatterbox' | 'vibevoice';
  setTTSEngine: (engine: 'chatterbox' | 'vibevoice') => void;
  
  // Generation state
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
  currentGeneratingId: string | null;
  setCurrentGeneratingId: (id: string | null) => void;
  
  // Streaming
  useStreaming: boolean;
  setUseStreaming: (streaming: boolean) => void;
  
  // System status
  systemStatus: {
    healthy: boolean;
    gpuAvailable: boolean;
    modelLoaded: boolean;
  };
  updateSystemStatus: (status: Partial<AppState['systemStatus']>) => void;
  
  // Saved voices
  savedVoices: SavedVoice[];
  saveVoice: (name: string) => Promise<void>;
  loadVoice: (voiceId: string) => Promise<void>;
  deleteVoice: (voiceId: string) => Promise<void>;
  loadVoicesFromServer: () => Promise<void>;
  
  // Cancellation
  cancelGeneration: () => void;
  
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  saveSession: (name?: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => void;
  newSession: () => void;
  
  // Batch processing
  batchItems: BatchItem[];
  addBatchItem: (text: string, filename?: string) => void;
  removeBatchItem: (id: string) => void;
  clearBatchItems: () => void;
  updateBatchItem: (id: string, updates: Partial<BatchItem>) => void;
  processBatch: () => void;
}

// Migrate old saved voices to new key
const migrateSavedVoices = () => {
  try {
    const oldVoices = localStorage.getItem('savedVoices');
    const newVoices = localStorage.getItem('chatterbox_saved_voices');
    
    // If we have old voices but no new ones, migrate them
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

export const useStore = create<AppState>((set) => ({
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
        },
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
  
  // Generation state
  isGenerating: false,
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  currentGeneratingId: null,
  setCurrentGeneratingId: (id) => set({ currentGeneratingId: id }),
  
  // Streaming
  useStreaming: false,
  setUseStreaming: (streaming) => set({ useStreaming: streaming }),
  
  // System status
  systemStatus: {
    healthy: false,
    gpuAvailable: false,
    modelLoaded: false,
  },
  updateSystemStatus: (status) =>
    set((state) => ({
      systemStatus: { ...state.systemStatus, ...status },
    })),
  
  // Saved voices - initially empty, will be loaded from server
  savedVoices: [],
  saveVoice: async (name) => {
    const state = useStore.getState();
    
    // Convert file to base64 if voice reference exists
    let voiceReferenceData: string | undefined;
    if (state.voiceReference) {
      const reader = new FileReader();
      voiceReferenceData = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.readAsDataURL(state.voiceReference!);
      });
    }
    
    // Ensure we have a seed for voice consistency
    const voiceParameters = { ...state.parameters };
    if (voiceParameters.seed === null || voiceParameters.seed === undefined) {
      // Generate a random seed if none is set (ensure it's not 0)
      voiceParameters.seed = Math.floor(Math.random() * 999999) + 1;
      // Update the current parameters with the generated seed
      set({ parameters: voiceParameters });
    }
    
    const newVoice: SavedVoice = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name,
      parameters: voiceParameters,
      voiceReferenceData,
      createdAt: new Date(),
    };
    
    // Save to server
    const savedVoice = await voiceAPI.saveVoice(newVoice);
    if (savedVoice) {
      console.log('[Store] Saved voice to server:', savedVoice);
      // Reload voices from server to ensure consistency
      const voices = await voiceAPI.listVoices();
      set({ savedVoices: voices });
    } else {
      console.error('[Store] Failed to save voice to server');
    }
  },
  loadVoice: async (voiceId) => {
    const state = useStore.getState();
    let voice = state.savedVoices.find(v => v.id === voiceId);
    
    // If voice not in local cache, try to fetch from server
    if (!voice) {
      const serverVoice = await voiceAPI.getVoice(voiceId);
      if (!serverVoice) {
        console.error('[Store] Voice not found:', voiceId);
        return;
      }
      voice = serverVoice;
    }
    
    console.log('[Store] Loading voice:', voiceId, voice);
    
    let voiceReference: File | null = null;
    
    // Try to load voice file from server
    if (voice.voice_file || voice.voiceReferenceData || voice.voiceReferenceFile || voice.voiceReferenceUrl) {
      try {
        console.log('[Store] Loading voice audio from server');
        voiceReference = await voiceAPI.loadVoiceAudioFile(voiceId);
        if (voiceReference) {
          console.log('[Store] Voice audio loaded from server:', voiceReference.name, voiceReference.size);
        }
      } catch (e) {
        console.error('Failed to load voice audio from server:', e);
        
        // Fallback to base64 data if available
        if (voice.voiceReferenceData) {
          try {
            console.log('[Store] Restoring voice reference from base64');
            const response = await fetch(voice.voiceReferenceData);
            const blob = await response.blob();
            voiceReference = new File([blob], `voice-${voice.id}.wav`, { type: blob.type });
            console.log('[Store] Voice reference restored from base64:', voiceReference.name, voiceReference.size);
          } catch (e2) {
            console.error('Failed to restore voice reference from base64:', e2);
          }
        }
      }
    }
    
    // Ensure parameters exist with defaults if corrupted
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
    
    // Create a new parameters object to ensure React detects the change
    const newParameters: TTSParameters = {
      exaggeration: parameters.exaggeration ?? 0.5,
      temperature: parameters.temperature ?? 0.8,
      cfg_weight: parameters.cfg_weight ?? 0.5,
      min_p: parameters.min_p ?? 0.05,
      top_p: parameters.top_p ?? 1.0,
      repetition_penalty: parameters.repetition_penalty ?? 1.2,
      seed: parameters.seed ?? Math.floor(Math.random() * 999999) + 1,
      speech_rate: parameters.speech_rate ?? 1.0,
    };
    
    console.log('[Store] Setting parameters:', newParameters);
    console.log('[Store] Setting voiceReference:', voiceReference);
    
    set({
      parameters: newParameters,
      voiceReference,
    });
  },
  deleteVoice: async (voiceId) => {
    // Delete from server
    const deleted = await voiceAPI.deleteVoice(voiceId);
    if (deleted) {
      console.log('[Store] Deleted voice from server:', voiceId);
      // Reload voices from server to ensure consistency
      const voices = await voiceAPI.listVoices();
      set({ savedVoices: voices });
    } else {
      console.error('[Store] Failed to delete voice from server');
    }
  },
  loadVoicesFromServer: async () => {
    console.log('[Store] Loading voices from server...');
    try {
      const voices = await voiceAPI.listVoices();
      console.log('[Store] Loaded voices from server:', voices.length);
      set({ savedVoices: voices });
    } catch (error) {
      console.error('[Store] Failed to load voices from server:', error);
    }
  },
  
  // Cancellation
  cancelGeneration: () => set((state) => {
    // Update all generating chunks to error state
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
  
  // Sessions
  sessions: (() => {
    const userId = localStorage.getItem('currentUserId');
    if (!userId) return [];
    return JSON.parse(localStorage.getItem(`sessions_${userId}`) || '[]');
  })(),
  currentSessionId: null,
  
  saveSession: async (name) => {
    const state = useStore.getState();
    const sessionName = name || `Session ${new Date().toLocaleString()}`;
    
    // Convert voice reference to base64 if it exists
    let voiceReferenceData: string | undefined;
    if (state.voiceReference) {
      const reader = new FileReader();
      voiceReferenceData = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64);
        };
        reader.readAsDataURL(state.voiceReference!);
      });
    }
    
    // Convert audio URLs to base64 for persistence
    const chunksWithAudio = await Promise.all(
      state.chunks.map(async (chunk) => {
        // Skip if audioData is already populated
        if (chunk.audioData) {
          return chunk;
        }
        
        if (chunk.audioUrl && chunk.status === 'completed') {
          try {
            const response = await fetch(chunk.audioUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            const audioData = await new Promise<string>((resolve) => {
              reader.onloadend = () => {
                const base64 = reader.result as string;
                resolve(base64);
              };
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
    
    // Update existing session or create new
    let session: Session;
    let updatedSessions: Session[];
    
    if (state.currentSessionId) {
      // Update existing session
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
      // Create new session
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
    
    try {
      const userId = localStorage.getItem('currentUserId');
      if (userId) {
        localStorage.setItem(`sessions_${userId}`, JSON.stringify(updatedSessions));
      }
    } catch (e) {
      console.error('Failed to save session:', e);
      // If localStorage is full, try saving without audio data
      session.chunks = state.chunks.map(c => ({ ...c, audioData: undefined }));
      try {
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
          localStorage.setItem(`sessions_${userId}`, JSON.stringify(updatedSessions));
        }
      } catch (e2) {
        console.error('Failed to save session even without audio:', e2);
      }
    }
    
    set({ 
      sessions: updatedSessions,
      currentSessionId: session.id 
    });
  },
  
  loadSession: async (sessionId) => {
    const state = useStore.getState();
    const session = state.sessions.find(s => s.id === sessionId);
    
    if (session) {
      let voiceReference: File | null = null;
      
      // Convert base64 back to File if voice data exists
      if (session.voiceReferenceData) {
        try {
          const response = await fetch(session.voiceReferenceData);
          const blob = await response.blob();
          voiceReference = new File([blob], `session-voice-${session.id}.wav`, { type: blob.type });
        } catch (e) {
          console.error('Failed to restore voice reference:', e);
        }
      }
      
      // Restore audio URLs from base64 data
      const restoredChunks = await Promise.all(
        session.chunks.map(async (chunk) => {
          if (chunk.audioData) {
            try {
              const response = await fetch(chunk.audioData);
              const blob = await response.blob();
              const audioUrl = URL.createObjectURL(blob);
              return { ...chunk, audioUrl };
            } catch (e) {
              console.error('Failed to restore audio URL:', e);
              return chunk;
            }
          }
          return chunk;
        })
      );
      
      set({
        chunks: restoredChunks,
        parameters: { ...session.parameters },
        voiceReference,
        currentSessionId: sessionId,
      });
    }
  },
  
  deleteSession: (sessionId) => set((state) => {
    const updatedSessions = state.sessions.filter(s => s.id !== sessionId);
    const userId = localStorage.getItem('currentUserId');
    if (userId) {
      localStorage.setItem(`sessions_${userId}`, JSON.stringify(updatedSessions));
    }
    
    return { 
      sessions: updatedSessions,
      currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
    };
  }),
  
  newSession: () => set({
    chunks: [],
    currentSessionId: null,
    isGenerating: false,
    currentGeneratingId: null,
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
    const state = useStore.getState();
    // Add all batch items as chunks with filenames in the text for reference
    const newChunks = state.batchItems.map(item => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      text: item.text,
      status: 'pending' as const,
      // Store filename in chunk for export naming
      filename: item.filename,
    }));
    set((state) => ({
      chunks: [...state.chunks, ...newChunks],
      batchItems: [],
    }));
  },
}));