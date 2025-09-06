/**
 * Archive Manager for Chatterbox
 * Handles saving and organizing generated audio across sessions
 */

export interface AudioItem {
  id: string;
  text: string;
  audioUrl?: string;
  audioData?: string;
  duration: number;
  timestamp: string;
  parameters: {
    temperature?: number;
    cfg_weight?: number;
    exaggeration?: number;
    min_p?: number;
    top_p?: number;
    repetition_penalty?: number;
    seed?: number | null;
  };
  voiceId?: string;
  voiceName?: string;
}

export interface Session {
  id: string;
  name: string;
  date: string;
  items: AudioItem[];
}

export interface ArchiveData {
  sessions: Record<string, Session>;
  lastUpdated: string;
}

class ArchiveManager {
  private static instance: ArchiveManager;
  private currentSessionId: string;
  private archiveKey = 'chatterbox_archive';

  private constructor() {
    // Create or get current session
    const today = new Date().toISOString().split('T')[0];
    this.currentSessionId = `session_${today}`;
    this.ensureCurrentSession();
  }

  static getInstance(): ArchiveManager {
    if (!ArchiveManager.instance) {
      ArchiveManager.instance = new ArchiveManager();
    }
    return ArchiveManager.instance;
  }

  private ensureCurrentSession() {
    const archive = this.loadArchive();
    if (!archive.sessions[this.currentSessionId]) {
      archive.sessions[this.currentSessionId] = {
        id: this.currentSessionId,
        name: `Session ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString(),
        items: []
      };
      this.saveArchive(archive);
    }
  }

  private loadArchive(): ArchiveData {
    try {
      const data = localStorage.getItem(this.archiveKey);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading archive:', error);
    }
    
    return {
      sessions: {},
      lastUpdated: new Date().toISOString()
    };
  }

  private saveArchive(archive: ArchiveData) {
    try {
      archive.lastUpdated = new Date().toISOString();
      localStorage.setItem(this.archiveKey, JSON.stringify(archive));
    } catch (error) {
      console.error('Error saving archive:', error);
      // Handle storage quota exceeded
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.cleanupOldSessions();
      }
    }
  }

  /**
   * Add a generated audio to the archive
   */
  addAudioItem(item: Omit<AudioItem, 'id' | 'timestamp'>) {
    const archive = this.loadArchive();
    
    // Ensure current session exists
    this.ensureCurrentSession();
    
    const audioItem: AudioItem = {
      ...item,
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
    
    archive.sessions[this.currentSessionId].items.push(audioItem);
    this.saveArchive(archive);
    
    // Also update chunks for backward compatibility
    this.updateChunksStorage(audioItem);
    
    return audioItem.id;
  }

  /**
   * Update chunks storage for backward compatibility
   */
  private updateChunksStorage(audioItem: AudioItem) {
    try {
      const chunksData = localStorage.getItem('chunks');
      const chunks = chunksData ? JSON.parse(chunksData) : [];
      
      // Add as a chunk
      chunks.push({
        id: audioItem.id,
        text: audioItem.text,
        status: 'completed',
        audioUrl: audioItem.audioUrl,
        audioData: audioItem.audioData,
        duration: audioItem.duration,
        timestamp: audioItem.timestamp,
        parameters: audioItem.parameters
      });
      
      // Keep only last 100 chunks to prevent storage bloat
      if (chunks.length > 100) {
        chunks.splice(0, chunks.length - 100);
      }
      
      localStorage.setItem('chunks', JSON.stringify(chunks));
    } catch (error) {
      console.error('Error updating chunks storage:', error);
    }
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    const archive = this.loadArchive();
    return Object.values(archive.sessions).sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    const archive = this.loadArchive();
    return archive.sessions[this.currentSessionId] || null;
  }

  /**
   * Get audio item by ID
   */
  getAudioItem(audioId: string): AudioItem | null {
    const archive = this.loadArchive();
    for (const session of Object.values(archive.sessions)) {
      const item = session.items.find(i => i.id === audioId);
      if (item) return item;
    }
    return null;
  }

  /**
   * Delete audio items
   */
  deleteAudioItems(audioIds: string[]) {
    const archive = this.loadArchive();
    const idsSet = new Set(audioIds);
    
    Object.values(archive.sessions).forEach(session => {
      session.items = session.items.filter(item => !idsSet.has(item.id));
    });
    
    // Remove empty sessions
    Object.keys(archive.sessions).forEach(sessionId => {
      if (archive.sessions[sessionId].items.length === 0) {
        delete archive.sessions[sessionId];
      }
    });
    
    this.saveArchive(archive);
  }

  /**
   * Cleanup old sessions to free up storage
   */
  private cleanupOldSessions() {
    const archive = this.loadArchive();
    const sessions = Object.values(archive.sessions).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Keep only last 30 days of sessions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    sessions.forEach(session => {
      if (new Date(session.date) < thirtyDaysAgo) {
        delete archive.sessions[session.id];
      }
    });
    
    this.saveArchive(archive);
  }

  /**
   * Export sessions as JSON
   */
  exportAsJSON(sessionIds?: string[]): string {
    const archive = this.loadArchive();
    const exportData: ArchiveData = {
      sessions: {},
      lastUpdated: new Date().toISOString()
    };
    
    if (sessionIds) {
      sessionIds.forEach(id => {
        if (archive.sessions[id]) {
          exportData.sessions[id] = archive.sessions[id];
        }
      });
    } else {
      exportData.sessions = archive.sessions;
    }
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import sessions from JSON
   */
  importFromJSON(jsonData: string) {
    try {
      const importData = JSON.parse(jsonData) as ArchiveData;
      const archive = this.loadArchive();
      
      // Merge imported sessions
      Object.entries(importData.sessions).forEach(([sessionId, session]) => {
        if (!archive.sessions[sessionId]) {
          archive.sessions[sessionId] = session;
        } else {
          // Merge items, avoiding duplicates
          const existingIds = new Set(archive.sessions[sessionId].items.map(i => i.id));
          session.items.forEach(item => {
            if (!existingIds.has(item.id)) {
              archive.sessions[sessionId].items.push(item);
            }
          });
        }
      });
      
      this.saveArchive(archive);
      return true;
    } catch (error) {
      console.error('Error importing archive:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStats() {
    const archive = this.loadArchive();
    const sessions = Object.values(archive.sessions);
    
    const totalSessions = sessions.length;
    const totalAudio = sessions.reduce((sum, s) => sum + s.items.length, 0);
    const totalDuration = sessions.reduce((sum, s) => 
      sum + s.items.reduce((itemSum, item) => itemSum + (item.duration || 0), 0), 0
    );
    
    // Estimate storage usage
    const storageUsed = new Blob([JSON.stringify(archive)]).size;
    
    return {
      totalSessions,
      totalAudio,
      totalDuration,
      storageUsed
    };
  }
}

export default ArchiveManager;