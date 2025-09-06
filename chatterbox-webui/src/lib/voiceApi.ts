import axios from 'axios';
import type { SavedVoice } from './store';

// Import the API configuration from the main API module
// This ensures we use the same base URL and configuration
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
      return '/api';  // This assumes nginx proxy at /api -> http://localhost:6095
    }
    // For HTTP access, use the same domain with load balancer port
    return `http://${hostname}:6095`;
  }
  
  // For local network access
  if (isLocalNetwork) {
    return 'http://192.168.1.195:6095';
  }
  
  // For any other domain (like fred.taile5e8a3.ts.net), use the same hostname
  return `${protocol}//${hostname}:6095`;
})();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface VoiceApiResponse<T> {
  success: boolean;
  voice?: T;
  voices?: T[];
  message?: string;
}

export const voiceAPI = {
  /**
   * Get all saved voices from the server
   */
  async listVoices(): Promise<SavedVoice[]> {
    try {
      const response = await api.get<VoiceApiResponse<SavedVoice>>('/voices');
      return response.data.voices || [];
    } catch (error) {
      console.error('Failed to list voices:', error);
      return [];
    }
  },

  /**
   * Save a voice profile to the server
   */
  async saveVoice(voice: SavedVoice): Promise<SavedVoice | null> {
    try {
      const response = await api.post<VoiceApiResponse<SavedVoice>>('/voices', voice);
      if (response.data.success && response.data.voice) {
        return response.data.voice;
      }
      return null;
    } catch (error) {
      console.error('Failed to save voice:', error);
      return null;
    }
  },

  /**
   * Delete a voice profile from the server
   */
  async deleteVoice(voiceId: string): Promise<boolean> {
    try {
      const response = await api.delete<VoiceApiResponse<any>>(`/voices/${voiceId}`);
      return response.data.success;
    } catch (error) {
      console.error('Failed to delete voice:', error);
      return false;
    }
  },

  /**
   * Get a specific voice profile
   */
  async getVoice(voiceId: string): Promise<SavedVoice | null> {
    try {
      const response = await api.get<VoiceApiResponse<SavedVoice>>(`/voices/${voiceId}`);
      if (response.data.success && response.data.voice) {
        return response.data.voice;
      }
      return null;
    } catch (error) {
      console.error('Failed to get voice:', error);
      return null;
    }
  },

  /**
   * Get voice audio file URL
   */
  getVoiceAudioUrl(voiceId: string): string {
    return `${API_BASE_URL}/voices/${voiceId}/audio`;
  },

  /**
   * Load voice audio file
   */
  async loadVoiceAudioFile(voiceId: string): Promise<File | null> {
    try {
      const response = await api.get(`/voices/${voiceId}/audio`, {
        responseType: 'blob'
      });
      
      const blob = response.data;
      return new File([blob], `voice-${voiceId}.wav`, { type: 'audio/wav' });
    } catch (error) {
      console.error('Failed to load voice audio:', error);
      return null;
    }
  }
};