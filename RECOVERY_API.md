# Recovery Token API Documentation

## Overview

The Recovery Token API provides a secure mechanism for users to recover audio files even after browser data is cleared. Audio files are temporarily stored on the server with unique recovery tokens that expire after 24 hours.

## Base URL

All recovery endpoints are prefixed with `/api/recovery`

## Features

- ✅ **Secure Token Generation**: UUID v4 tokens with SHA-256 file checksums
- ✅ **Rate Limiting**: 10 tokens per session per hour
- ✅ **File Validation**: Audio format verification and size limits (50MB)
- ✅ **One-time Use**: Tokens become invalid after retrieval
- ✅ **Automatic Cleanup**: Expired tokens cleaned up hourly
- ✅ **Cross-tab Sync**: Multiple browser tabs supported

## Authentication

No authentication required. Rate limiting is based on client IP and User-Agent.

## Endpoints

### 1. Generate Recovery Token

Create a recovery token for an audio file.

```http
POST /api/recovery/audio/token
Content-Type: multipart/form-data
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audio_file` | File | Yes | Audio file (max 50MB) |
| `metadata` | String | No | JSON metadata (optional) |

**Supported Audio Formats:**
- WAV (`audio/wav`, `audio/wave`, `audio/x-wav`)
- MP3 (`audio/mpeg`, `audio/mp3`)
- OGG (`audio/ogg`)
- FLAC (`audio/flac`, `audio/x-flac`)
- AAC (`audio/aac`, `audio/x-aac`)
- WebM (`audio/webm`)

**Example Request:**

```javascript
const formData = new FormData();
formData.append('audio_file', audioBlob, 'recording.wav');
formData.append('metadata', JSON.stringify({
  duration: 10.5,
  timestamp: new Date().toISOString(),
  user_session: 'session-123'
}));

const response = await fetch('/api/recovery/audio/token', {
  method: 'POST',
  body: formData
});
```

**Success Response (200):**

```json
{
  "success": true,
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "expires_at": "2024-01-02T12:00:00.000Z",
  "file_size": 245760,
  "checksum": "a1b2c3d4e5f6...",
  "message": "Recovery token generated successfully"
}
```

**Error Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 400 | Invalid file | `{"success": false, "error": "File is empty"}` |
| 413 | File too large | `{"success": false, "error": "File too large: 51.2MB exceeds 50MB limit"}` |
| 429 | Rate limit exceeded | `{"success": false, "error": "Rate limit exceeded: 10/10 tokens in 1 hour(s)"}` |
| 500 | Server error | `{"success": false, "error": "Failed to generate recovery token"}` |

### 2. Retrieve Audio File

Retrieve an audio file using its recovery token.

```http
GET /api/recovery/audio/{token}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | String | Yes | Recovery token UUID |

**Example Request:**

```javascript
const response = await fetch('/api/recovery/audio/550e8400-e29b-41d4-a716-446655440000');
const audioBlob = await response.blob();
```

**Success Response (200):**

Returns the audio file with appropriate headers:

```http
HTTP/1.1 200 OK
Content-Type: audio/wav
Content-Disposition: attachment; filename="recovered_audio.wav"
Content-Length: 245760
Cache-Control: no-cache, no-store, must-revalidate

[Binary audio data]
```

**Error Responses:**

| Code | Description | Example |
|------|-------------|---------|
| 404 | Token not found/expired | `{"success": false, "error": "Recovery token not found or expired"}` |
| 410 | Token already used | `{"success": false, "error": "Recovery token already used"}` |
| 500 | Server error | `{"success": false, "error": "Failed to retrieve audio file"}` |

### 3. Service Statistics

Get recovery service statistics (for monitoring).

```http
GET /api/recovery/stats
```

**Success Response (200):**

```json
{
  "success": true,
  "stats": {
    "total_tokens": 25,
    "active_tokens": 8,
    "expired_tokens": 15,
    "retrieved_tokens": 12,
    "total_file_size": 5242880,
    "database_size": 32768,
    "config": {
      "max_file_size_mb": 50,
      "token_ttl_hours": 24,
      "rate_limit_per_hour": 10,
      "allowed_mime_types": 7
    },
    "storage_path": "/tmp/chatterbox-recovery"
  }
}
```

### 4. Manual Cleanup

Manually trigger cleanup of expired tokens (admin use).

```http
POST /api/recovery/cleanup
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "tokens_removed": 5
}
```

### 5. Health Check

Check recovery service health.

```http
GET /api/recovery/health
```

**Success Response (200):**

```json
{
  "success": true,
  "status": "healthy",
  "database_accessible": true,
  "storage_accessible": true,
  "active_tokens": 8,
  "storage_path": "/tmp/chatterbox-recovery",
  "max_file_size_mb": 50,
  "rate_limit": "10 tokens per 1h"
}
```

## Rate Limiting

Rate limiting is applied per session, identified by client IP address and User-Agent:

- **Limit**: 10 tokens per hour per session
- **Window**: Rolling 1-hour window
- **Response**: HTTP 429 when exceeded
- **Headers**: No rate limit headers currently exposed

## Security

### File Validation

- **Size Limit**: 50MB maximum
- **Format Check**: MIME type validation
- **Header Validation**: Audio file header verification
- **Checksum**: SHA-256 integrity verification

### Token Security

- **Format**: UUID v4 (cryptographically secure)
- **Uniqueness**: Database constraints prevent duplicates
- **Expiration**: 24-hour automatic expiry
- **One-time Use**: Tokens invalidated after retrieval

### Privacy

- **No User Data**: No personal information stored
- **Anonymous**: Session identification via hash only
- **Cleanup**: Files deleted after expiry/retrieval

## Usage Examples

### Complete Recovery Flow

```javascript
class AudioRecovery {
  async saveRecording(audioBlob) {
    const formData = new FormData();
    formData.append('audio_file', audioBlob, 'recording.wav');
    
    try {
      const response = await fetch('/api/recovery/audio/token', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        // Store token in localStorage
        localStorage.setItem('recovery_token', data.token);
        localStorage.setItem('recovery_expires', data.expires_at);
        return data.token;
      } else {
        const error = await response.json();
        throw new Error(error.error);
      }
    } catch (error) {
      console.error('Failed to create recovery token:', error);
      throw error;
    }
  }
  
  async recoverRecording(token = null) {
    const recoveryToken = token || localStorage.getItem('recovery_token');
    
    if (!recoveryToken) {
      throw new Error('No recovery token found');
    }
    
    try {
      const response = await fetch(`/api/recovery/audio/${recoveryToken}`);
      
      if (response.ok) {
        const audioBlob = await response.blob();
        // Clear used token
        localStorage.removeItem('recovery_token');
        localStorage.removeItem('recovery_expires');
        return audioBlob;
      } else {
        const error = await response.json();
        throw new Error(error.error);
      }
    } catch (error) {
      console.error('Failed to recover recording:', error);
      throw error;
    }
  }
  
  hasValidToken() {
    const token = localStorage.getItem('recovery_token');
    const expires = localStorage.getItem('recovery_expires');
    
    if (!token || !expires) return false;
    
    return new Date(expires) > new Date();
  }
}

// Usage
const recovery = new AudioRecovery();

// Save recording
const token = await recovery.saveRecording(audioBlob);
console.log('Recovery token:', token);

// Later, recover recording
const recoveredBlob = await recovery.recoverRecording();
console.log('Recovered audio:', recoveredBlob);
```

### Error Handling

```javascript
async function handleRecoveryErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      // Show user-friendly rate limit message
      alert('Too many recovery tokens created. Please wait an hour and try again.');
    } else if (error.message.includes('File too large')) {
      // Handle file size error
      alert('Audio file is too large. Maximum size is 50MB.');
    } else if (error.message.includes('not found or expired')) {
      // Handle expired/invalid token
      alert('Recovery token has expired or is invalid.');
    } else if (error.message.includes('already used')) {
      // Handle already used token
      alert('Recovery token has already been used.');
    } else {
      // Generic error
      console.error('Recovery error:', error);
      alert('An error occurred during recovery. Please try again.');
    }
  }
}
```

## Storage and Cleanup

### Storage Location

- **Database**: `/tmp/chatterbox_recovery.db` (SQLite)
- **Files**: `/tmp/chatterbox-recovery/` directory
- **Format**: UUID-named files with original extension

### Automatic Cleanup

- **Schedule**: Every hour
- **Triggers**: Expired tokens and retrieved tokens
- **Actions**: Delete files and database records
- **Logging**: Cleanup results logged

### Manual Cleanup

Administrators can trigger manual cleanup:

```bash
curl -X POST http://localhost:6093/api/recovery/cleanup
```

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:6093/api/recovery/health

# Service statistics
curl http://localhost:6093/api/recovery/stats
```

### Logs

Recovery operations are logged with these levels:

- **INFO**: Token creation, retrieval, cleanup
- **WARNING**: Rate limits, invalid files
- **ERROR**: Service errors, cleanup failures

### Metrics

Key metrics to monitor:

- Active token count
- Token creation rate
- Storage space usage
- Cleanup effectiveness
- Error rates

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RECOVERY_DB_PATH` | `/tmp/chatterbox_recovery.db` | Database file path |
| `RECOVERY_STORAGE_PATH` | `/tmp/chatterbox-recovery` | File storage directory |
| `RECOVERY_MAX_FILE_SIZE` | `52428800` | Max file size (50MB) |
| `RECOVERY_TOKEN_TTL_HOURS` | `24` | Token expiration time |
| `RECOVERY_RATE_LIMIT` | `10` | Tokens per hour per session |
| `RECOVERY_CLEANUP_INTERVAL` | `3600` | Cleanup interval (seconds) |

### Service Configuration

```python
from recovery_service import RecoveryConfig

config = RecoveryConfig(
    max_file_size=50 * 1024 * 1024,  # 50MB
    token_ttl_hours=24,
    rate_limit_tokens=10,
    rate_limit_window_hours=1,
    recovery_storage_path="/tmp/chatterbox-recovery"
)
```

## Troubleshooting

### Common Issues

1. **"File is empty" error**
   - Ensure audio blob has content before uploading
   - Check file upload implementation

2. **"File too large" error**
   - Check file size limits (50MB default)
   - Consider compressing audio before upload

3. **"Rate limit exceeded" error**
   - Implement client-side rate limiting
   - Show user-friendly error messages

4. **"Token not found or expired" error**
   - Check token storage and expiration
   - Implement token validation before use

5. **Storage space issues**
   - Monitor `/tmp` directory space
   - Ensure cleanup job is running
   - Consider increasing cleanup frequency

### Debugging

Enable debug logging:

```python
import logging
logging.getLogger('recovery_database').setLevel(logging.DEBUG)
logging.getLogger('recovery_service').setLevel(logging.DEBUG)
```

Check service health:

```bash
curl http://localhost:6093/api/recovery/health | jq
```

View statistics:

```bash
curl http://localhost:6093/api/recovery/stats | jq
```

## Integration with Chatterbox

The Recovery Token API is automatically integrated into the main Chatterbox TTS API server. It's available alongside existing TTS endpoints:

- **Main API**: `http://localhost:6093/`
- **Recovery API**: `http://localhost:6093/api/recovery/`
- **API Docs**: `http://localhost:6093/docs`

The service starts automatically with the TTS server and requires no additional setup.

---

*Generated for Chatterbox TTS Recovery Token System v1.0*