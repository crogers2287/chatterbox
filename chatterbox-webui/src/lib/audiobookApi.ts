import axios from 'axios';

// Audiobook-specific API for the psdwizzard version
const AUDIOBOOK_API_URL = import.meta.env.VITE_AUDIOBOOK_API_URL || 'http://fred.taile5e8a3.ts.net:7860';

const audiobookApi = axios.create({
  baseURL: AUDIOBOOK_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 600000, // 10 minutes for long audiobook generation
});

export interface AudiobookVoiceProfile {
  voice_id: string;
  name: string;
  character?: string;
  exaggeration: number;
  temperature: number;
  cfg_weight: number;
  min_p: number;
  top_p: number;
  repetition_penalty: number;
  speed_rate: number;
  seed?: number | undefined;
  voice_file?: File | string;
}

export interface AudiobookChunk {
  id: string;
  text: string;
  voice_id: string;
  character?: string;
  audio_url?: string;
  duration?: number;
  status: 'pending' | 'generating' | 'completed' | 'error';
  error?: string;
}

export interface AudiobookProject {
  id: string;
  name: string;
  chunks: AudiobookChunk[];
  voices: AudiobookVoiceProfile[];
  metadata: {
    total_duration: number;
    total_pause_duration: number;
    created_at: Date;
    updated_at: Date;
  };
  settings: {
    volume_normalization: boolean;
    target_db: number;
    pause_duration_per_break: number;
    output_format: 'wav' | 'mp3';
  };
}

export interface GenerateAudiobookRequest {
  text: string;
  mode: 'single' | 'multi';
  voices: AudiobookVoiceProfile[];
  settings: {
    volume_normalization?: boolean;
    target_db?: number;
    pause_duration?: number;
    chunk_size?: number;
    chapter_title?: string;
  };
}

export const audiobookAPI = {
  // Generate audiobook with single or multiple voices
  async generateAudiobook(request: GenerateAudiobookRequest): Promise<{
    project_id: string;
    chunks: AudiobookChunk[];
    total_chunks: number;
  }> {
    const response = await audiobookApi.post('/generate_audiobook', request);
    return response.data;
  },

  // Generate single chunk
  async generateChunk(
    text: string,
    voice_profile: AudiobookVoiceProfile,
    voice_file?: File
  ): Promise<{
    audio_url: string;
    duration: number;
  }> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('voice_profile', JSON.stringify(voice_profile));
    
    if (voice_file) {
      formData.append('voice_file', voice_file);
    }

    const response = await audiobookApi.post('/generate_chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Regenerate specific chunk
  async regenerateChunk(
    project_id: string,
    chunk_id: string,
    voice_profile?: AudiobookVoiceProfile
  ): Promise<AudiobookChunk> {
    const response = await audiobookApi.post(`/projects/${project_id}/chunks/${chunk_id}/regenerate`, {
      voice_profile,
    });
    return response.data;
  },

  // Project management
  async saveProject(project: AudiobookProject): Promise<{ project_id: string }> {
    const response = await audiobookApi.post('/projects/save', project);
    return response.data;
  },

  async loadProject(project_id: string): Promise<AudiobookProject> {
    const response = await audiobookApi.get(`/projects/${project_id}`);
    return response.data;
  },

  async listProjects(): Promise<AudiobookProject[]> {
    const response = await audiobookApi.get('/projects');
    return response.data;
  },

  // Voice management
  async saveVoiceProfile(profile: AudiobookVoiceProfile): Promise<{ voice_id: string }> {
    const response = await audiobookApi.post('/voices/save', profile);
    return response.data;
  },

  async listVoiceProfiles(): Promise<AudiobookVoiceProfile[]> {
    const response = await audiobookApi.get('/voices');
    return response.data;
  },

  // Export audiobook
  async exportAudiobook(
    project_id: string,
    format: 'wav' | 'mp3' = 'mp3'
  ): Promise<{
    download_url: string;
    filename: string;
    size: number;
  }> {
    const response = await audiobookApi.post(`/projects/${project_id}/export`, {
      format,
    });
    return response.data;
  },

  // Get audio URL
  getAudioUrl(filename: string): string {
    return `${AUDIOBOOK_API_URL}/audio/${filename}`;
  },
};