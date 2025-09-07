// Core data interfaces
export interface TextChunk {
  id: string;
  text: string;
  audioUrl?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
  filename?: string;
  audioData?: string; // Base64 encoded audio data for persistence
  generatedWith?: {
    parameters: TTSParameters;
    voiceReferenceId?: string;
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
  voiceReferenceData?: string;
  voice_file?: File;
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
  userId?: string;
}

export interface BatchItem {
  id: string;
  text: string;
  filename?: string;
}

// Main application state interface
export interface AppState {
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

// Store with persistence capabilities
export interface PersistedAppState extends AppState {
  // Persistence state
  _hasHydrated: boolean;
  _persist?: {
    getOptions: () => any;
    setOptions: (options: any) => void;
    clearStorage: () => void;
    rehydrate: () => void;
    hasHydrated: () => boolean;
  };
}