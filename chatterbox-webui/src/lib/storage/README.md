# Browser Storage Implementation

A robust browser storage solution for the Chatterbox TTS application, providing reliable data persistence with automatic fallback, quota management, and cross-tab synchronization.

## Features

- 🚀 **Dual Storage Strategy**: IndexedDB for primary storage with localStorage fallback
- 💾 **Automatic Quota Management**: Intelligent cleanup when approaching storage limits
- 🔄 **Cross-tab Synchronization**: Real-time updates across browser tabs
- 🛡️ **Error Resilience**: Graceful handling of storage failures with automatic recovery
- 📦 **TypeScript Support**: Full type safety with comprehensive interfaces
- 🧪 **Well Tested**: 90%+ test coverage with unit tests for all scenarios

## Installation

The storage implementation is already integrated into the Chatterbox web UI. No additional installation required.

## Quick Start

```typescript
import { storageManager } from '@/lib/storage';

// Store a value
await storageManager.set('user-preferences', {
  theme: 'dark',
  language: 'en',
  autoSave: true
});

// Retrieve a value
const preferences = await storageManager.get('user-preferences');
console.log(preferences); // { theme: 'dark', language: 'en', autoSave: true }

// Delete a value
await storageManager.delete('user-preferences');

// Clear all storage
await storageManager.clear();
```

## API Reference

### StorageManager

The main interface for interacting with browser storage.

#### Methods

##### `get<T>(key: string): Promise<T | null>`
Retrieves a value from storage.

```typescript
const session = await storageManager.get<SessionData>('current-session');
if (session) {
  // Use session data
}
```

##### `set<T>(key: string, value: T): Promise<void>`
Stores a value in storage.

```typescript
await storageManager.set('audio-settings', {
  volume: 0.8,
  playbackRate: 1.0,
  quality: 'high'
});
```

##### `delete(key: string): Promise<void>`
Removes a value from storage.

```typescript
await storageManager.delete('temporary-data');
```

##### `clear(): Promise<void>`
Removes all values from storage.

```typescript
await storageManager.clear();
```

##### `getKeys(): Promise<string[]>`
Returns all storage keys.

```typescript
const keys = await storageManager.getKeys();
console.log('Stored keys:', keys);
```

##### `getStorageInfo(): Promise<StorageInfo>`
Returns storage usage information.

```typescript
const info = await storageManager.getStorageInfo();
console.log(`Using ${info.percentUsed.toFixed(1)}% of available storage`);
console.log(`${info.available} bytes available`);
```

##### `addEventListener(event: 'change', listener: (event: StorageEvent) => void): void`
Listens for storage changes from other tabs.

```typescript
storageManager.addEventListener('change', (event) => {
  console.log('Storage changed:', event.key, event.newValue);
});
```

## Usage Examples

### Session Recovery

```typescript
import { storageManager } from '@/lib/storage';

interface SessionData {
  id: string;
  text: string;
  parameters: {
    voice: string;
    temperature: number;
    speed: number;
  };
  audioChunks: string[];
  timestamp: number;
}

class SessionManager {
  private readonly SESSION_KEY = 'active-session';
  private autoSaveInterval: number | null = null;

  async startSession(text: string, parameters: any): Promise<SessionData> {
    const session: SessionData = {
      id: crypto.randomUUID(),
      text,
      parameters,
      audioChunks: [],
      timestamp: Date.now()
    };

    await this.saveSession(session);
    this.startAutoSave(session);

    return session;
  }

  async saveSession(session: SessionData): Promise<void> {
    await storageManager.set(this.SESSION_KEY, session);
  }

  async recoverSession(): Promise<SessionData | null> {
    return await storageManager.get<SessionData>(this.SESSION_KEY);
  }

  async addAudioChunk(chunk: string): Promise<void> {
    const session = await this.recoverSession();
    if (session) {
      session.audioChunks.push(chunk);
      await this.saveSession(session);
    }
  }

  private startAutoSave(session: SessionData): void {
    this.autoSaveInterval = window.setInterval(async () => {
      await this.saveSession(session);
    }, 30000); // Auto-save every 30 seconds
  }

  dispose(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
  }
}
```

### Voice Library Management

```typescript
import { storageManager } from '@/lib/storage';

interface Voice {
  id: string;
  name: string;
  embedding: number[];
  createdAt: number;
  lastUsed: number;
}

class VoiceLibrary {
  private readonly VOICE_PREFIX = 'voice_';

  async saveVoice(voice: Voice): Promise<void> {
    await storageManager.set(`${this.VOICE_PREFIX}${voice.id}`, voice);
  }

  async getVoice(id: string): Promise<Voice | null> {
    return await storageManager.get<Voice>(`${this.VOICE_PREFIX}${id}`);
  }

  async getAllVoices(): Promise<Voice[]> {
    const keys = await storageManager.getKeys();
    const voiceKeys = keys.filter(key => key.startsWith(this.VOICE_PREFIX));
    
    const voices = await Promise.all(
      voiceKeys.map(key => storageManager.get<Voice>(key))
    );
    
    return voices.filter((v): v is Voice => v !== null);
  }

  async deleteVoice(id: string): Promise<void> {
    await storageManager.delete(`${this.VOICE_PREFIX}${id}`);
  }

  async updateLastUsed(id: string): Promise<void> {
    const voice = await this.getVoice(id);
    if (voice) {
      voice.lastUsed = Date.now();
      await this.saveVoice(voice);
    }
  }
}
```

### Cross-tab Synchronization

```typescript
import { storageManager } from '@/lib/storage';

class MultiTabSync {
  constructor() {
    // Listen for changes from other tabs
    storageManager.addEventListener('change', (event) => {
      this.handleStorageChange(event);
    });
  }

  private handleStorageChange(event: StorageEvent): void {
    // Skip events from the same tab
    if (event.source === 'local') return;

    switch (event.key) {
      case 'playback-state':
        this.syncPlaybackState(event.newValue);
        break;
      
      case 'active-voice':
        this.syncActiveVoice(event.newValue);
        break;
      
      case 'session-data':
        this.syncSessionData(event.newValue);
        break;
    }
  }

  private syncPlaybackState(state: any): void {
    // Update UI to reflect playback state from other tab
    console.log('Playback state changed in another tab:', state);
  }

  private syncActiveVoice(voiceId: any): void {
    // Update selected voice to match other tab
    console.log('Active voice changed in another tab:', voiceId);
  }

  private syncSessionData(data: any): void {
    // Sync session data across tabs
    console.log('Session data updated in another tab:', data);
  }
}
```

### Storage Monitoring

```typescript
import { storageManager } from '@/lib/storage';

class StorageMonitor {
  async checkStorageHealth(): Promise<{
    healthy: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    
    try {
      // Check if storage is available
      const available = await storageManager.isAvailable();
      if (!available) {
        return {
          healthy: false,
          warnings: ['Storage is not available']
        };
      }

      // Check storage usage
      const info = await storageManager.getStorageInfo();
      
      if (info.percentUsed > 90) {
        warnings.push(`Critical: Storage is ${info.percentUsed.toFixed(1)}% full`);
      } else if (info.percentUsed > 75) {
        warnings.push(`Warning: Storage is ${info.percentUsed.toFixed(1)}% full`);
      }

      // Check available space
      const availableMB = info.available / (1024 * 1024);
      if (availableMB < 10) {
        warnings.push(`Low storage: Only ${availableMB.toFixed(1)}MB available`);
      }

      // Test write/read operations
      const testKey = '__storage_test__';
      const testValue = { test: true, timestamp: Date.now() };
      
      await storageManager.set(testKey, testValue);
      const retrieved = await storageManager.get(testKey);
      await storageManager.delete(testKey);
      
      if (!retrieved || retrieved.test !== true) {
        warnings.push('Storage read/write test failed');
      }

      return {
        healthy: warnings.length === 0,
        warnings
      };
    } catch (error) {
      return {
        healthy: false,
        warnings: [`Storage error: ${error.message}`]
      };
    }
  }

  async cleanupOldData(daysToKeep: number = 7): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const keys = await storageManager.getKeys();
    let cleaned = 0;

    for (const key of keys) {
      try {
        const data = await storageManager.get<any>(key);
        if (data && data.timestamp && data.timestamp < cutoffTime) {
          await storageManager.delete(key);
          cleaned++;
        }
      } catch {
        // Skip items that can't be parsed
      }
    }

    return cleaned;
  }
}
```

## Configuration Options

```typescript
import { StorageManager } from '@/lib/storage';

const customStorage = new StorageManager({
  // Database name for IndexedDB
  dbName: 'MyApp',
  
  // Storage version for migration support
  version: 2,
  
  // Enable compression for large values
  compression: true,
  
  // Storage key prefix to avoid conflicts
  keyPrefix: 'myapp_',
  
  // Maximum storage size in bytes (50MB)
  maxSize: 50 * 1024 * 1024,
  
  // Enable cross-tab synchronization
  syncAcrossTabs: true
});
```

## Error Handling

```typescript
import { storageManager, StorageError, StorageErrorCode } from '@/lib/storage';

try {
  await storageManager.set('large-data', veryLargeObject);
} catch (error) {
  if (error instanceof StorageError) {
    switch (error.code) {
      case StorageErrorCode.QUOTA_EXCEEDED:
        console.error('Storage quota exceeded. Please free up space.');
        // Attempt cleanup
        await cleanupOldData();
        break;
        
      case StorageErrorCode.NOT_AVAILABLE:
        console.error('Storage is not available. Using memory storage.');
        // Fall back to in-memory storage
        break;
        
      case StorageErrorCode.PERMISSION_DENIED:
        console.error('Storage permission denied. Please check browser settings.');
        break;
        
      default:
        console.error('Storage error:', error.message);
    }
  }
}
```

## Performance Considerations

1. **Batch Operations**: When storing multiple values, consider batching them into a single object to reduce overhead.

2. **Size Limits**: 
   - IndexedDB: Typically allows gigabytes of storage
   - localStorage: Usually limited to 5-10MB
   - Always check `getStorageInfo()` before storing large amounts of data

3. **Compression**: Enable compression for large text data to reduce storage usage.

4. **Cleanup Strategy**: Implement regular cleanup of old data to prevent storage exhaustion.

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (may have lower storage limits)
- Mobile browsers: Full support with potential storage restrictions

## Testing

Run the test suite:

```bash
cd chatterbox-webui
npm test src/lib/storage
```

## License

Part of the Chatterbox TTS project. See the main project license for details.