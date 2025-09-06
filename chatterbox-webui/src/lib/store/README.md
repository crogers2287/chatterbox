# Chatterbox State Persistence Layer

## Overview

The State Persistence Layer extends the Chatterbox TTS Zustand store with automatic persistence capabilities. This enables seamless recovery from browser crashes, accidental closures, and provides a foundation for advanced recovery features.

## Features

- ✅ **Automatic State Persistence**: Selected state slices are automatically saved to browser storage
- ✅ **Intelligent Partializing**: Only essential user data is persisted, not temporary runtime state  
- ✅ **State Migration**: Handles version changes with automatic migration
- ✅ **Storage Fallback**: Uses IndexedDB with localStorage fallback
- ✅ **Performance Optimized**: Debounced writes and compression for large state objects
- ✅ **Error Resilient**: Graceful handling of storage errors and quota issues
- ✅ **Cross-tab Sync**: State changes synchronized across browser tabs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chatterbox Store                         │
├─────────────────────────────────────────────────────────────┤
│  AppState (TTS Parameters, Chunks, Sessions, etc.)         │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                Persistence Middleware                       │
├─────────────────────────────────────────────────────────────┤
│  • State Partializing  • Migration  • Debouncing          │
│  • Error Handling      • Version Control                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│              Storage Manager                                │
├─────────────────────────────────────────────────────────────┤
│  • IndexedDB (Primary)  • localStorage (Fallback)         │
│  • Cross-tab Sync       • Quota Management                 │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Usage

The persistence layer is automatically integrated into the main store:

```typescript
import { useStore } from '@/lib/store';

function MyComponent() {
  const { parameters, updateParameters, hasHydrated } = useStore();
  
  // Check if state has been restored from storage
  if (!hasHydrated) {
    return <div>Loading...</div>;
  }
  
  // State changes are automatically persisted
  const handleParameterChange = (newParams) => {
    updateParameters(newParams); // Will be persisted automatically
  };
  
  return (
    <div>
      <p>Temperature: {parameters.temperature}</p>
      <button onClick={() => handleParameterChange({ temperature: 0.9 })}>
        Update Temperature
      </button>
    </div>
  );
}
```

### Recovery Operations

```typescript
import { useStore, useRecovery } from '@/lib/store';

function RecoveryComponent() {
  const { recoverFromCrash, clearRecoveryState } = useRecovery();
  
  const handleCrashRecovery = async () => {
    try {
      await recoverFromCrash();
      console.log('Recovered from crash successfully');
    } catch (error) {
      console.error('Recovery failed:', error);
    }
  };
  
  const handleClearRecovery = async () => {
    await clearRecoveryState();
    console.log('Recovery data cleared');
  };
  
  return (
    <div>
      <button onClick={handleCrashRecovery}>Recover from Crash</button>
      <button onClick={handleClearRecovery}>Clear Recovery Data</button>
    </div>
  );
}
```

### Persistence Status

```typescript
import { usePersistence } from '@/lib/store';

function PersistenceStatus() {
  const { hasHydrated, rehydrate, getPersistedVersion } = usePersistence();
  
  useEffect(() => {
    if (hasHydrated) {
      getPersistedVersion().then(version => {
        console.log('Persisted state version:', version);
      });
    }
  }, [hasHydrated]);
  
  const handleForceRehydrate = async () => {
    await rehydrate();
  };
  
  return (
    <div>
      <p>State hydrated: {hasHydrated ? 'Yes' : 'No'}</p>
      <button onClick={handleForceRehydrate}>Force Reload</button>
    </div>
  );
}
```

## What Gets Persisted

The persistence layer selectively stores essential user data while excluding temporary state:

### ✅ Persisted Data

- **User Preferences**: TTS parameters, engine selection, streaming settings
- **Work Sessions**: Recent sessions (last 10), current session ID
- **Saved Voices**: Voice presets and configurations  
- **Completed Work**: Chunks with audio data, batch processing items
- **User Context**: Current parameters and settings

### ❌ Not Persisted

- **Runtime State**: `isGenerating`, `currentGeneratingId`
- **System Status**: `systemStatus` (refreshed on app start)
- **File Objects**: `voiceReference` (File objects cannot be serialized)
- **Temporary URLs**: Blob URLs (regenerated from audio data)
- **Error States**: Temporary error messages

## Configuration

### Default Configuration

```typescript
// Located in src/lib/store/persist-config.ts
export const persistConfig: PersistConfig<AppState> = {
  name: 'chatterbox-app-state',
  version: 1,
  
  // Only persist essential data
  partialize: (state) => ({
    parameters: state.parameters,
    ttsEngine: state.ttsEngine,
    useStreaming: state.useStreaming,
    sessions: state.sessions?.slice(-10) || [], // Keep last 10
    savedVoices: state.savedVoices,
    // ... other essential fields
  }),
  
  writeDelay: 300,    // Debounce writes by 300ms
  compress: true,     // Compress large objects
  version: 1,         // Current schema version
};
```

### Alternative Configurations

```typescript
// Minimal persistence (preferences only)
import { minimalPersistConfig } from '@/lib/store/persist-config';

// Session-only persistence (temporary work)  
import { sessionPersistConfig } from '@/lib/store/persist-config';

// Recovery-specific persistence
import { recoveryPersistConfig } from '@/lib/store/persist-config';

// Custom configuration
import { createCustomPersistConfig } from '@/lib/store/persist-config';

const customConfig = createCustomPersistConfig({
  writeDelay: 1000,  // Slower writes
  partialize: (state) => ({ 
    parameters: state.parameters 
  }), // Only parameters
});
```

## State Migration

The system handles version changes automatically with migration functions:

```typescript
// Migration example (from persist-config.ts)
migrate: async (persistedState: unknown, version: number) => {
  if (version < 1) {
    // Migration from version 0 to 1
    return {
      ...persistedState,
      parameters: persistedState.parameters || DEFAULT_PARAMETERS,
      ttsEngine: persistedState.ttsEngine || 'chatterbox',
      // Add new required fields
    };
  }
  return persistedState;
}
```

### Adding New Migrations

When adding new features that require state changes:

1. **Increment version number** in `persist-config.ts`
2. **Add migration logic** for the new version
3. **Test migration** with existing user data
4. **Document breaking changes**

```typescript
// Example: Adding a new field in version 2
if (version < 2) {
  return {
    ...persistedState,
    newFeatureSettings: DEFAULT_NEW_FEATURE_SETTINGS,
  };
}
```

## Performance Considerations

### Debounced Writes

State changes are debounced to prevent excessive storage operations:

```typescript
// Multiple rapid changes...
updateParameters({ temperature: 0.1 });
updateParameters({ temperature: 0.2 });
updateParameters({ temperature: 0.3 });

// ...result in a single write after 300ms delay
// containing the final state: { temperature: 0.3 }
```

### Storage Limits

The system automatically manages storage usage:

- **Session Limit**: Only last 10 sessions are persisted
- **Chunk Filtering**: Only completed chunks with audio data
- **Compression**: Large objects are compressed before storage
- **Quota Monitoring**: Storage usage is monitored and cleaned up when needed

### Memory Management

- **Blob URL Cleanup**: Temporary URLs are properly cleaned up
- **Event Listeners**: Storage event listeners are managed properly
- **Hydration Control**: Hydration can be controlled to prevent unnecessary operations

## Error Handling

The persistence layer handles various error scenarios gracefully:

### Storage Quota Exceeded

```typescript
// Automatic cleanup when quota is exceeded
onError: (error) => {
  if (error.code === 'QUOTA_EXCEEDED') {
    console.log('Storage quota exceeded, attempting cleanup...');
    // Storage manager handles cleanup automatically
  }
}
```

### Storage Unavailable

```typescript
// Falls back to in-memory state if storage is unavailable
const storage = await createStorageManager({
  fallback: true, // Enable localStorage fallback
});
```

### Corrupted Data

```typescript
// Graceful handling of corrupted persistence data
migrate: async (persistedState, version) => {
  try {
    return migrateState(persistedState, version);
  } catch (error) {
    console.warn('Migration failed, using defaults');
    return getDefaultState();
  }
}
```

## Testing

### Unit Tests

Test the persistence middleware in isolation:

```typescript
// Test persistence behavior
it('should persist state changes', async () => {
  const store = createTestStore();
  store.getState().updateParameters({ temperature: 0.9 });
  
  await waitForPersistence();
  
  expect(mockStorage.set).toHaveBeenCalledWith(
    'persist:test-store',
    expect.objectContaining({
      state: expect.objectContaining({
        parameters: expect.objectContaining({
          temperature: 0.9,
        }),
      }),
    })
  );
});
```

### Integration Tests

Test the complete store with persistence:

```typescript
// Test state hydration
it('should restore state from storage', async () => {
  mockStorage.get.mockResolvedValue(persistedData);
  
  const { result } = renderHook(() => useStore());
  await waitForHydration();
  
  expect(result.current.parameters.temperature).toBe(0.9);
});
```

### Migration Tests

Test version migrations:

```typescript
// Test migration from old version
it('should migrate from version 0', async () => {
  const oldData = { state: { count: 5 }, version: 0 };
  mockStorage.get.mockResolvedValue(oldData);
  
  const { result } = renderHook(() => useStore());
  await waitForMigration();
  
  expect(result.current.parameters).toBeDefined();
});
```

## Troubleshooting

### Common Issues

#### State Not Persisting

1. **Check hydration status**: Ensure `hasHydrated` is true
2. **Verify partialize function**: Make sure required fields are included
3. **Check storage availability**: Verify storage adapter is working
4. **Debug write debouncing**: Changes may be delayed by debouncing

```typescript
// Debug persistence
const { hasHydrated, rehydrate } = usePersistence();
console.log('Hydrated:', hasHydrated);

// Force immediate write (for debugging)
const store = useStore.getState();
await store.rehydrate();
```

#### Storage Errors

1. **Check browser storage limits**: IndexedDB quotas vary by browser
2. **Verify permissions**: Some browsers restrict storage in incognito mode  
3. **Clear corrupted data**: Use `clearPersistedState()` to reset

```typescript
// Clear and restart
const { clearPersistedState } = usePersistence();
await clearPersistedState();
window.location.reload();
```

#### Migration Failures

1. **Check migration logic**: Ensure all version transitions are handled
2. **Test with real data**: Validate migrations with actual persisted data
3. **Add fallback logic**: Gracefully handle migration failures

```typescript
// Safe migration with fallback
migrate: async (persistedState, version) => {
  try {
    return await migrateToCurrentVersion(persistedState, version);
  } catch (error) {
    console.warn('Migration failed, using defaults:', error);
    return getDefaultState();
  }
}
```

### Performance Issues

#### Excessive Writes

- **Increase debounce delay**: Set higher `writeDelay` in config
- **Optimize partialize function**: Exclude frequently changing fields
- **Use selective updates**: Only update specific state slices

#### Storage Bloat

- **Monitor storage usage**: Use `getStorageInfo()` to check usage
- **Implement cleanup**: Remove old sessions and unused data
- **Enable compression**: Use `compress: true` for large objects

## Future Enhancements

### Planned Features

- **Cloud Sync**: Sync state across devices (requires backend)
- **Selective Sync**: User-controlled sync preferences
- **Backup/Restore**: Export/import state for backup
- **Advanced Recovery**: Crash detection and auto-recovery
- **Performance Analytics**: Track storage performance metrics

### Extension Points

The persistence layer is designed for extension:

```typescript
// Custom storage adapter
class CustomStorageAdapter implements StorageAdapter {
  // Implement custom storage logic
}

// Custom persistence middleware
const customPersist = persist({
  storage: new CustomStorageAdapter(),
  // ... other config
});
```

## API Reference

### Hooks

- `useStore()` - Main store hook with persistence
- `usePersistence()` - Persistence-specific methods
- `useRecovery()` - Recovery-specific methods  
- `useChunks()` - Optimized chunks selector
- `useParameters()` - Optimized parameters selector

### Types

- `PersistConfig<T>` - Configuration for persistence middleware
- `PersistState` - State interface for persistence methods
- `AppState` - Main application state interface

### Utilities

- `createPersistedStore()` - Create a store with persistence
- `createCustomPersistConfig()` - Create custom configuration

---

For more details, see the source code in `src/lib/store/` and tests in `src/lib/store/__tests__/`.