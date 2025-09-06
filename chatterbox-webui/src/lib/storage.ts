/**
 * Persistent storage utilities for saved voices and narrator settings
 */

const STORAGE_KEYS = {
  SAVED_VOICES: 'chatterbox_saved_voices',
  NARRATOR_SETTINGS: 'chatterbox_narrator_settings',
  DEFAULT_SETTINGS: 'chatterbox_default_settings',
} as const;

export interface SavedVoice {
  id: string;
  name: string;
  file: File | null;
  url: string | null;
  createdAt: string;
  isDefault?: boolean;
}

export interface NarratorSettings {
  selectedVoiceId: string | null;
  temperature: number;
  exaggeration: number;
  cfgWeight: number;
  minP: number;
  topP: number;
  repetitionPenalty: number;
  seed?: number;
}

const DEFAULT_NARRATOR_SETTINGS: NarratorSettings = {
  selectedVoiceId: null,
  temperature: 0.8,
  exaggeration: 0.5,
  cfgWeight: 0.5,
  minP: 0.05,
  topP: 1.0,
  repetitionPenalty: 1.2,
};

export class VoiceStorage {
  private static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private static base64ToFile(base64: string, fileName: string): File {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'audio/wav';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], fileName, { type: mime });
  }

  static async saveVoices(voices: SavedVoice[]): Promise<void> {
    try {
      const serializedVoices = await Promise.all(
        voices.map(async (voice) => ({
          ...voice,
          fileData: voice.file ? await this.fileToBase64(voice.file) : null,
          file: null, // Don't store the File object directly
        }))
      );
      localStorage.setItem(STORAGE_KEYS.SAVED_VOICES, JSON.stringify(serializedVoices));
    } catch (error) {
      console.error('Error saving voices:', error);
    }
  }

  static async loadVoices(): Promise<SavedVoice[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SAVED_VOICES);
      if (!stored) return [];
      
      const serializedVoices = JSON.parse(stored);
      return serializedVoices.map((voice: any) => ({
        ...voice,
        file: voice.fileData ? this.base64ToFile(voice.fileData, voice.name + '.wav') : null,
        url: voice.fileData || voice.url,
      }));
    } catch (error) {
      console.error('Error loading voices:', error);
      return [];
    }
  }

  static async addVoice(voice: Omit<SavedVoice, 'id' | 'createdAt'>): Promise<SavedVoice> {
    const voices = await this.loadVoices();
    const newVoice: SavedVoice = {
      ...voice,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    voices.push(newVoice);
    await this.saveVoices(voices);
    return newVoice;
  }

  static async removeVoice(id: string): Promise<void> {
    const voices = await this.loadVoices();
    const filtered = voices.filter(v => v.id !== id);
    await this.saveVoices(filtered);
  }

  static async updateVoice(id: string, updates: Partial<SavedVoice>): Promise<void> {
    const voices = await this.loadVoices();
    const index = voices.findIndex(v => v.id === id);
    if (index !== -1) {
      voices[index] = { ...voices[index], ...updates };
      await this.saveVoices(voices);
    }
  }
}

export class NarratorStorage {
  static saveSettings(settings: NarratorSettings): void {
    localStorage.setItem(STORAGE_KEYS.NARRATOR_SETTINGS, JSON.stringify(settings));
  }

  static loadSettings(): NarratorSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.NARRATOR_SETTINGS);
      if (!stored) return DEFAULT_NARRATOR_SETTINGS;
      return { ...DEFAULT_NARRATOR_SETTINGS, ...JSON.parse(stored) };
    } catch (error) {
      console.error('Error loading narrator settings:', error);
      return DEFAULT_NARRATOR_SETTINGS;
    }
  }

  static saveDefaultSettings(settings: Partial<NarratorSettings>): void {
    const current = this.loadDefaultSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.DEFAULT_SETTINGS, JSON.stringify(updated));
  }

  static loadDefaultSettings(): NarratorSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DEFAULT_SETTINGS);
      if (!stored) return DEFAULT_NARRATOR_SETTINGS;
      return { ...DEFAULT_NARRATOR_SETTINGS, ...JSON.parse(stored) };
    } catch (error) {
      console.error('Error loading default settings:', error);
      return DEFAULT_NARRATOR_SETTINGS;
    }
  }
}

// Hook for React components
export function usePersistentVoices() {
  const [voices, setVoices] = React.useState<SavedVoice[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    setLoading(true);
    const loaded = await VoiceStorage.loadVoices();
    setVoices(loaded);
    setLoading(false);
  };

  const addVoice = async (voice: Omit<SavedVoice, 'id' | 'createdAt'>) => {
    const newVoice = await VoiceStorage.addVoice(voice);
    setVoices(prev => [...prev, newVoice]);
    return newVoice;
  };

  const removeVoice = async (id: string) => {
    await VoiceStorage.removeVoice(id);
    setVoices(prev => prev.filter(v => v.id !== id));
  };

  const updateVoice = async (id: string, updates: Partial<SavedVoice>) => {
    await VoiceStorage.updateVoice(id, updates);
    setVoices(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  return {
    voices,
    loading,
    addVoice,
    removeVoice,
    updateVoice,
    reload: loadVoices,
  };
}

export function usePersistentNarratorSettings() {
  const [settings, setSettings] = React.useState<NarratorSettings>(
    NarratorStorage.loadSettings()
  );

  const updateSettings = (updates: Partial<NarratorSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    NarratorStorage.saveSettings(newSettings);
  };

  const resetToDefaults = () => {
    const defaults = NarratorStorage.loadDefaultSettings();
    setSettings(defaults);
    NarratorStorage.saveSettings(defaults);
  };

  const saveAsDefaults = () => {
    NarratorStorage.saveDefaultSettings(settings);
  };

  return {
    settings,
    updateSettings,
    resetToDefaults,
    saveAsDefaults,
  };
}

import * as React from 'react';