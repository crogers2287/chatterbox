import axios from 'axios';

// Use the unified TTS server that supports both Chatterbox and VibeVoice
// Port 8000 is the unified server with dynamic GPU switching
// Use environment variable or construct URL based on current hostname and protocol
const API_BASE_URL = (() => {
  // If environment variable is set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Otherwise, construct URL based on current location
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Check if we're on the local network
  const isLocalNetwork = hostname.startsWith('192.168.') || 
                        hostname === 'localhost' || 
                        hostname === '127.0.0.1';
  
  // For chatter.skinnyc.pro accessed from internet
  if (hostname === 'chatter.skinnyc.pro') {
    // If HTTPS, we need a proxy or the domain must be accessible
    if (protocol === 'https:') {
      console.warn('HTTPS detected - backend must also use HTTPS or be proxied');
      // Try using a reverse proxy path if available
      return '/api';  // This assumes nginx proxy at /api -> http://localhost:8000
    }
    // For HTTP access, use the same domain with unified server port
    return `http://${hostname}:8000`;
  }
  
  // For local network access
  if (isLocalNetwork) {
    return 'http://192.168.1.195:8000';
  }
  
  // For any other domain (like fred.taile5e8a3.ts.net), use the same hostname
  return `${protocol}//${hostname}:8000`;
})();
console.log('Chatterbox API Base URL:', API_BASE_URL);
console.log('API Version: 2.0.0-UNIFIED-' + Date.now()); // Force cache refresh with timestamp
console.log('Using Unified TTS Server on port 8000');
console.warn('Supports both Chatterbox and VibeVoice engines with GPU switching');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000, // 5 minute timeout for longer texts
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    console.log('Request data:', config.data);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.data);
    return response;
  },
  (error) => {
    console.error('API Error:', error.message);
    if (error.code === 'ERR_NETWORK') {
      console.error('Network error - API server may not be running on', API_BASE_URL);
      console.error('Full error:', error);
    }
    if (error.response) {
      console.error('Error response:', error.response.status, error.response.data);
    }
    return Promise.reject(error);
  }
);

export interface TTSRequest {
  text: string;
  engine?: 'chatterbox' | 'vibevoice';
  exaggeration?: number;
  temperature?: number;
  cfg_weight?: number;
  min_p?: number;
  top_p?: number;
  repetition_penalty?: number;
  seed?: number | null;
  speech_rate?: number;
  voice_preset?: string; // For VibeVoice
}

export interface TTSStreamRequest extends TTSRequest {
  chunk_size?: number;
}

export interface TTSResponse {
  success: boolean;
  message: string;
  audio_url?: string;
  duration?: number;
  sample_rate: number;
  parameters: Record<string, any>;
}

export interface StreamingMetrics {
  first_chunk_latency: number;
  total_latency: number;
  rtf: number;
  total_audio_duration: number;
  chunks_generated: number;
}

export interface StreamingOptions {
  onChunk?: (chunk: any) => void;
  onMetrics?: (metrics: StreamingMetrics) => void;
  onError?: (error: any) => void;
  onComplete?: () => void;
}

export interface HealthResponse {
  status: string;
  gpu_available: boolean;
  gpu_name?: string;
  gpu_memory_total?: number;
  gpu_memory_allocated?: number;
  model_loaded: boolean;
  streaming_enabled?: boolean;
}

export interface ModelInfo {
  model_type: string;
  device: string;
  sample_rate: number;
  loaded: boolean;
  gpu_memory_allocated?: number;
  gpu_memory_cached?: number;
  chunk_size?: number;
  streaming_enabled?: boolean;
}

export const chatterboxAPI = {
  async health(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },

  async modelInfo(): Promise<ModelInfo> {
    const response = await api.get<ModelInfo>('/models/info');
    return response.data;
  },

  async synthesize(
    request: TTSRequest,
    audioPrompt?: File
  ): Promise<TTSResponse> {
    console.log('[API] synthesize called with:', {
      hasAudioPrompt: !!audioPrompt,
      audioPromptName: audioPrompt?.name,
      audioPromptSize: audioPrompt?.size,
      audioPromptType: audioPrompt?.type
    });
    
    try {
      if (audioPrompt) {
        console.log('[API] Using multipart endpoint with voice file');
        // If audio prompt is provided, use multipart form data
        const formData = new FormData();
        
        // Add all request parameters individually
        Object.entries(request).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        });
        
        formData.append('audio_prompt', audioPrompt);

        const response = await api.post<TTSResponse>('/synthesize', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        return response.data;
      } else {
        console.log('[API] Using JSON endpoint (no voice file)');
        // If no audio prompt, use JSON endpoint
        console.log('Synthesize request to:', `${API_BASE_URL}/synthesize-json`);
        const response = await api.post<TTSResponse>('/synthesize-json', request);
        return response.data;
      }
    } catch (error) {
      console.error('Synthesize error details:', {
        url: `${API_BASE_URL}/synthesize-json`,
        request,
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : error
      });
      throw error;
    }
  },

  getAudioUrl(filename: string): string {
    // If the filename already starts with /audio/, just prepend the base URL
    if (filename.startsWith('/audio/')) {
      return `${API_BASE_URL}${filename}`;
    }
    // Otherwise, extract just the filename from the path
    const cleanFilename = filename.split('/').pop() || filename;
    return `${API_BASE_URL}/audio/${cleanFilename}`;
  },

  async downloadAudio(filename: string): Promise<Blob> {
    const response = await api.get(`/audio/${filename}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async concatenateAudio(audioUrls: string[], outputFormat: 'mp3' | 'wav' = 'mp3'): Promise<{
    success: boolean;
    audio_url: string;
    format: string;
    total_files: number;
  }> {
    const response = await api.post('/concatenate-audio', {
      audio_urls: audioUrls,
      output_format: outputFormat,
    });
    return response.data;
  },

  // Streaming synthesis
  synthesizeStream(
    request: TTSStreamRequest,
    audioPrompt: File | undefined,
    options: StreamingOptions
  ): EventSource {
    console.log('[API] Starting streaming synthesis with request:', request);
    console.log('[API] Streaming enabled, using EventSource');
    
    // For simple requests without files, we can use query parameters
    const params = new URLSearchParams();
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });
    
    const streamUrl = `${API_BASE_URL}/synthesize-stream?${params.toString()}`;
    console.log('[API] Stream URL:', streamUrl);
    
    const eventSource = new EventSource(streamUrl);
    
    // Setup event handlers
    eventSource.addEventListener('audio_chunk', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[API] Received audio chunk:', data.chunk_id);
        if (options.onChunk) {
          options.onChunk(data);
        }
        if (options.onMetrics && data.metrics) {
          options.onMetrics(data.metrics);
        }
      } catch (error) {
        console.error('[API] Error parsing chunk data:', error);
        if (options.onError) {
          options.onError(error);
        }
      }
    });
    
    eventSource.addEventListener('done', (event) => {
      console.log('[API] Streaming complete:', event.data);
      if (options.onComplete) {
        options.onComplete();
      }
      eventSource.close();
    });
    
    eventSource.addEventListener('error', (event) => {
      console.error('[API] EventSource error:', event);
      if (options.onError) {
        options.onError(event);
      }
      eventSource.close();
    });
    
    eventSource.onerror = (error) => {
      console.error('[API] EventSource connection error:', error);
      if (options.onError) {
        options.onError(error);
      }
    };
    
    // Handle audio prompt file upload if provided
    if (audioPrompt) {
      console.warn('[API] Audio prompt file upload not yet supported for streaming');
      // TODO: Implement file upload for streaming
    }
    
    return eventSource;
  },
};