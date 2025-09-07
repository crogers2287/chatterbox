# Zustand Store Persistence Middleware

This implementation provides a robust persistence layer for the Chatterbox TTS application's Zustand store, enabling automatic state persistence and recovery functionality.

## Features

### 1. **Zustand Persistence Integration**
- Native Zustand persistence middleware integration
- Custom storage adapter using the browser storage layer from Issue #15
- Configurable persistence with state partitioning (only relevant data is persisted)
- Version migration support

### 2. **Recovery Slice**
- Complete recovery state management
- Session discovery and restoration
- Auto-save configuration (enabled by default with 2-second interval)
- UI state management for recovery banners and modals
- Error handling and graceful fallbacks

### 3. **State Serialization/Deserialization**
- Automatic removal of non-serializable data (File objects, blob URLs)
- Preservation of base64 audio data while removing temporary URLs
- System state restoration with appropriate defaults
- Safe handling of corrupted or invalid persisted data

### 4. **Auto-save Functionality**
- Debounced auto-save with configurable intervals
- Automatic persistence of relevant state changes
- Respects auto-save enabled/disabled preference
- Minimal performance impact with intelligent scheduling

## Implementation Details

### Store Structure
```typescript
type ExtendedAppState = AppState & RecoverySlice;
```

The store combines the original application state with recovery-specific functionality:

#### Core App State (Persisted)
- `chunks`: Text chunks and their generation status
- `parameters`: TTS parameters and voice settings
- `ttsEngine`: Selected TTS engine
- `useStreaming`: Streaming preference
- `sessions`: Saved sessions with audio data
- `batchItems`: Batch processing items

#### Recovery State (Persisted)
- `autoSaveEnabled`: Auto-save preference
- `autoSaveInterval`: Auto-save timing configuration

#### Runtime State (Not Persisted)
- `voiceReference`: Current voice file (File object)
- `isGenerating`: Real-time generation status
- `systemStatus`: System health information
- `savedVoices`: Voice metadata (heavy data excluded)

### Storage Integration

The persistence layer uses the browser storage system from Issue #15:

```typescript
const storage = createJSONStorage(() => ({
  getItem: async (name: string) => await storageManager.get<string>(name),
  setItem: async (name: string, value: string) => await storageManager.set(name, value),
  removeItem: async (name: string) => await storageManager.delete(name),
}));
```

This provides:
- **IndexedDB** as primary storage (better for large data)
- **localStorage** as fallback
- **Automatic quota management**
- **Cross-tab synchronization**
- **Error resilience**

### Persistence Configuration

```typescript
{
  name: 'chatterbox-store',
  storage,
  partialize: (state) => ({
    // Only essential data is persisted
    chunks: state.chunks,
    parameters: state.parameters,
    // ... other essential state
  }),
  version: 1, // For future migrations
}
```

### Recovery Functionality

The recovery slice provides comprehensive session management:

#### Session Discovery
- Automatically discovers available recovery sessions on app startup
- Filters sessions by age (only last 24 hours)
- Validates session integrity and metadata

#### Session Restoration
- Progress tracking during restore operations
- State validation and sanitization
- Error handling with user feedback
- Automatic cleanup of consumed sessions

#### UI Integration
- Recovery banner for non-intrusive notifications
- Recovery modal for detailed session selection
- Auto-save status indicators
- Error state management

## Usage

### Basic Store Usage
```typescript
import { useStore } from '@/lib/store';

function MyComponent() {
  const { chunks, addChunk, parameters, updateParameters } = useStore();
  
  // State changes are automatically persisted
  const handleAddText = () => {
    addChunk("New text to synthesize");
  };
  
  return (
    <div>
      <button onClick={handleAddText}>Add Text</button>
    </div>
  );
}
```

### Recovery Integration
```typescript
function RecoveryComponent() {
  const { 
    availableSessions,
    showRecoveryBanner,
    restoreSession,
    dismissRecovery,
    discoverRecoverySessions 
  } = useStore();
  
  useEffect(() => {
    // Discover recovery sessions on component mount
    discoverRecoverySessions();
  }, []);
  
  if (!showRecoveryBanner) return null;
  
  return (
    <div className="recovery-banner">
      <p>Found {availableSessions.length} recovery sessions</p>
      <button onClick={() => restoreSession(availableSessions[0].id)}>
        Restore Latest Session
      </button>
      <button onClick={() => dismissRecovery()}>
        Dismiss
      </button>
    </div>
  );
}
```

### Auto-save Configuration
```typescript
function SettingsComponent() {
  const { 
    autoSaveEnabled, 
    setAutoSaveEnabled,
    autoSaveInterval,
    setAutoSaveInterval 
  } = useStore();
  
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={autoSaveEnabled}
          onChange={(e) => setAutoSaveEnabled(e.target.checked)}
        />
        Enable Auto-save
      </label>
      
      <label>
        Auto-save Interval (seconds):
        <input
          type="number"
          value={autoSaveInterval}
          onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
          min={1}
          max={60}
        />
      </label>
    </div>
  );
}
```

## Testing

Comprehensive test coverage includes:

### Persistence Middleware Tests
- State serialization/deserialization
- Storage adapter integration
- Error handling
- Migration support

### Recovery Slice Tests
- Session discovery and filtering
- Restoration with progress tracking
- Error scenarios and fallbacks
- UI state management

### Integration Tests
- Complete store functionality
- Cross-slice interactions
- Persistence behavior
- Performance characteristics

Run tests with:
```bash
npm run test:unit:run
```

## Performance Considerations

### Optimizations
- **State Partitioning**: Only essential data is persisted
- **Debounced Auto-save**: Prevents excessive storage operations
- **Lazy Loading**: Heavy data (voice files, audio) are excluded from persistence
- **Efficient Serialization**: Removes non-serializable objects before storage

### Memory Management
- File objects are not persisted (prevents memory leaks)
- Blob URLs are cleaned up automatically
- Large audio data is stored as base64 only when necessary
- Automatic cleanup of expired recovery sessions

## Migration and Versioning

The persistence system supports version migration:

```typescript
{
  version: 1,
  migrate: (persistedState: any, version: number) => {
    if (version === 0) {
      // Handle migration from version 0 to 1
      return migrateFromV0(persistedState);
    }
    return persistedState;
  },
}
```

## Error Handling

Robust error handling throughout:
- Storage failures gracefully fall back to memory-only mode
- Corrupted data is detected and cleaned
- Network errors during session restore are reported to users
- Recovery operations can be cancelled or retried

## Security Considerations

- No sensitive data is persisted (API keys, tokens are excluded)
- State sanitization prevents XSS through stored data
- Storage quotas are respected and managed
- Cross-tab synchronization is secure and isolated per domain