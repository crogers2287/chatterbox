# Cleanup Service Documentation

## Overview

The Cleanup Service is an automated system for managing recovery data lifecycle in the Chatterbox TTS application. It provides both server-side and client-side cleanup capabilities to ensure efficient storage usage and prevent data accumulation.

## Features

### Server-Side Cleanup (Python)
- **Expired Token Cleanup**: Automatically removes recovery tokens after their expiration time
- **Orphaned File Cleanup**: Removes audio files not associated with any valid token
- **Emergency Cleanup**: Triggered when storage quota is exceeded
- **Scheduled Cleanup**: Runs periodically to maintain system health
- **Metrics Tracking**: Monitors cleanup operations and storage usage

### Client-Side Cleanup (TypeScript)
- **IndexedDB Session Cleanup**: Removes expired recovery sessions from browser storage
- **Storage Quota Monitoring**: Tracks browser storage usage and limits
- **Emergency Cleanup**: Automatically frees space when approaching quota
- **Scheduled Cleanup**: Periodic cleanup in the browser environment
- **Cross-Browser Support**: Works with modern browser storage APIs

## Server-Side Implementation

### Basic Usage

```python
from services.cleanup import create_cleanup_service, create_scheduled_cleanup

# Create cleanup service
cleanup_service = create_cleanup_service(
    storage_path="./recovery_storage",
    token_file="./recovery_tokens.json",
    retention_hours=24,
    max_storage_mb=1024
)

# Run manual cleanup
result = await cleanup_service.run_cleanup()
print(f"Cleaned {result['tokens_cleaned']} tokens, freed {result['bytes_freed']} bytes")

# Get metrics
metrics = cleanup_service.get_metrics()
print(f"Total cleaned: {metrics['tokens_cleaned']} tokens, {metrics['files_cleaned']} files")
```

### Scheduled Cleanup

```python
# Create scheduled service
scheduled_service = create_scheduled_cleanup(cleanup_service, interval_hours=1.0)

# Start automatic cleanup
await scheduled_service.start()

# Stop when done
await scheduled_service.stop()
```

### API Integration

```python
from cleanup_api import register_cleanup_routes

# In your FastAPI app
register_cleanup_routes(app)
```

This adds the following endpoints:
- `POST /api/cleanup/manual` - Trigger manual cleanup
- `GET /api/cleanup/metrics` - Get cleanup metrics
- `POST /api/cleanup/schedule/start` - Start scheduled cleanup
- `POST /api/cleanup/schedule/stop` - Stop scheduled cleanup
- `GET /api/cleanup/schedule/status` - Get schedule status

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `retention_hours` | 24 | Hours to keep recovery tokens |
| `max_storage_mb` | 1024 | Maximum storage size in MB |
| `storage_path` | "./recovery_storage" | Directory for audio files |
| `token_file` | "./recovery_tokens.json" | Token database file |

## Client-Side Implementation

### Basic Usage

```typescript
import { createCleanupService, createScheduledCleanup } from '@/lib/recovery/cleanup';

// Create cleanup service
const cleanupService = createCleanupService({
  retentionHours: 24,
  maxStorageMB: 100,
  emergencyThresholdPercent: 90
});

// Run manual cleanup
const result = await cleanupService.runCleanup();
console.log(`Cleaned ${result.sessionsCleared} sessions, freed ${result.bytesFreed} bytes`);

// Get storage status
const status = await cleanupService.getStorageStatus();
console.log(`Storage: ${status.storageInfo.percent.toFixed(1)}% used`);
```

### Scheduled Cleanup

```typescript
// Create scheduled service
const scheduledService = createScheduledCleanup(cleanupService, 1); // 1 hour interval

// Start automatic cleanup
scheduledService.start();

// Stop when done
scheduledService.stop();
```

### React Integration

```typescript
import { useEffect } from 'react';
import { createCleanupService, createScheduledCleanup } from '@/lib/recovery/cleanup';

function App() {
  useEffect(() => {
    // Initialize cleanup on app start
    const cleanupService = createCleanupService();
    const scheduled = createScheduledCleanup(cleanupService);
    
    scheduled.start();
    
    // Cleanup on unmount
    return () => {
      scheduled.stop();
    };
  }, []);

  return <div>Your app content</div>;
}
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `retentionHours` | 24 | Hours to keep sessions |
| `maxStorageMB` | 100 | Maximum browser storage in MB |
| `emergencyThresholdPercent` | 90 | Trigger emergency cleanup at this % |

## Cleanup Process

### Server-Side Flow

1. **Expired Token Cleanup**
   - Load all tokens from JSON database
   - Check expiration timestamp for each token
   - Delete expired tokens and associated files
   - Update token database

2. **Orphaned File Cleanup**
   - Scan storage directory for all files
   - Compare with valid tokens in database
   - Delete files not referenced by any token

3. **Emergency Cleanup**
   - Calculate current storage usage
   - If over limit, sort tokens by age
   - Delete oldest tokens until under 80% of limit

### Client-Side Flow

1. **Expired Session Cleanup**
   - Query IndexedDB for all sessions
   - Check last accessed time against retention
   - Delete expired sessions

2. **Emergency Cleanup**
   - Check browser storage quota usage
   - If over threshold, sort sessions by age
   - Delete oldest sessions to free 20% of used space

## Monitoring and Metrics

### Server Metrics

```python
{
  "tokens_cleaned": 156,
  "files_cleaned": 148,
  "bytes_freed": 157286400,
  "errors": 2,
  "last_cleanup": "2024-01-15T10:30:00Z",
  "last_error": "Permission denied: file.wav",
  "storage_size": 524288000,
  "storage_limit": 1073741824,
  "retention_hours": 24
}
```

### Client Metrics

```typescript
{
  sessionsCleared: 42,
  bytesFreed: 10485760,
  lastCleanup: new Date("2024-01-15T10:30:00Z"),
  errors: 0,
  lastError: null
}
```

## Error Handling

### Common Errors

1. **Storage Permission Denied**
   - Ensure write permissions on storage directory
   - Check file ownership and access rights

2. **Quota Exceeded**
   - Emergency cleanup will run automatically
   - Consider increasing storage limits
   - Review retention policies

3. **Database Corruption**
   - Service continues with available data
   - Corrupted entries are logged and skipped
   - Consider manual database repair

### Recovery Strategies

- **Graceful Degradation**: Service continues even if some operations fail
- **Automatic Retry**: Failed operations retry on next scheduled run
- **Manual Intervention**: API endpoints allow manual cleanup triggers
- **Logging**: All errors logged with context for debugging

## Best Practices

1. **Set Appropriate Retention**
   - Balance user needs with storage costs
   - Consider peak usage patterns
   - Monitor actual usage metrics

2. **Monitor Storage Usage**
   - Set up alerts for high usage
   - Track growth trends
   - Plan capacity accordingly

3. **Test Emergency Cleanup**
   - Simulate quota scenarios
   - Verify oldest-first deletion
   - Ensure critical data protection

4. **Schedule During Low Usage**
   - Run cleanup during off-peak hours
   - Avoid conflicts with active users
   - Consider timezone differences

## Security Considerations

1. **Token Validation**
   - Tokens are one-time use
   - Automatic expiration enforcement
   - No token reuse after cleanup

2. **File Access**
   - Cleanup only touches recovery directory
   - No access to system files
   - Validates file paths

3. **Rate Limiting**
   - API endpoints are rate-limited
   - Prevents cleanup abuse
   - Protects system resources

## Performance Impact

- **CPU**: Minimal, mainly I/O bound
- **Memory**: Low, streams file operations
- **Disk I/O**: Moderate during cleanup
- **Network**: None (local operations only)

## Troubleshooting

### Cleanup Not Running

1. Check service logs for errors
2. Verify storage permissions
3. Ensure token database is accessible
4. Check scheduled task status

### High Storage Usage

1. Review retention settings
2. Check for failed cleanups
3. Look for orphaned files
4. Consider emergency cleanup

### Browser Storage Issues

1. Check IndexedDB availability
2. Verify storage permissions
3. Clear browser cache if needed
4. Check quota limits

## Future Enhancements

- Cloud storage integration
- Compression before storage
- Selective cleanup policies
- Real-time storage analytics
- Multi-tier storage support