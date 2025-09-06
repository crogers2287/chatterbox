# Chatterbox API Reference

## Base URLs

- **Development**: `http://localhost:6095` (load balancer)
- **Direct GPU0**: `http://localhost:6093`
- **Direct GPU1**: `http://localhost:6094`
- **Production**: Configure via nginx proxy

## Authentication

Currently no authentication required for API access. Frontend supports mock authentication for multi-user scenarios.

## Endpoints

### 1. Text-to-Speech Synthesis

#### Standard Synthesis

**Endpoint**: `POST /synthesize`

**Request** (multipart/form-data):
```typescript
interface SynthesizeRequest {
  text: string;               // Required, max 5000 chars
  exaggeration?: number;      // 0.1-2.0, default: 0.5
  temperature?: number;       // 0.05-5.0, default: 0.8
  cfg_weight?: number;        // 0.0-1.0, default: 0.5
  min_p?: number;            // 0.0-1.0, default: 0.05
  top_p?: number;            // 0.0-1.0, default: 1.0
  repetition_penalty?: number; // 1.0-2.0, default: 1.2
  seed?: number;             // Random seed
  speech_rate?: number;      // 0.5-2.0, default: 1.0
  audio_prompt?: File;       // Optional voice reference
  voice_id?: string;         // Saved voice ID
}
```

**Response** (JSON):
```typescript
interface SynthesizeResponse {
  success: boolean;
  message: string;
  audio_url?: string;        // Relative path to audio file
  duration?: number;         // Audio duration in seconds
  sample_rate: number;       // 24000
  parameters: {
    text: string;
    temperature: number;
    cfg_weight: number;
    // ... all used parameters
  };
  inference_speed?: number;  // iterations/second
}
```

**Example**:
```bash
curl -X POST http://localhost:6095/synthesize \
  -F "text=Hello, this is a test." \
  -F "temperature=0.8" \
  -F "exaggeration=0.5"
```

#### Streaming Synthesis

**Endpoint**: `POST /synthesize-stream`

**Request**: Same as standard synthesis + `chunk_size` parameter

**Response**: Server-Sent Events (SSE) stream

**Event Types**:
```typescript
// Audio chunk event
interface AudioChunkEvent {
  event: 'audio_chunk';
  data: {
    chunk_id: number;
    audio_chunk: string;     // Base64 encoded audio
    sample_rate: number;
    metrics: {
      first_chunk_latency: number;
      total_latency: number;
      rtf: number;           // Real-time factor
      total_audio_duration: number;
      chunks_generated: number;
    };
  };
}

// Completion event
interface DoneEvent {
  event: 'done';
  data: {
    message: string;
    total_chunks: number;
  };
}

// Error event
interface ErrorEvent {
  event: 'error';
  data: {
    error: string;
  };
}
```

**JavaScript Client Example**:
```javascript
const eventSource = new EventSource('/synthesize-stream');

eventSource.addEventListener('audio_chunk', (e) => {
  const data = JSON.parse(e.data);
  // Process audio chunk
});

eventSource.addEventListener('done', (e) => {
  eventSource.close();
});
```

### 2. Voice Management

#### Clone Voice

**Endpoint**: `POST /voice-clone`

**Request** (multipart/form-data):
```typescript
interface VoiceCloneRequest {
  audio_file: File;          // Audio file for voice extraction
  name: string;              // Voice name
  description?: string;      // Optional description
  save?: boolean;           // Save to library (default: true)
}
```

**Response**:
```typescript
interface VoiceCloneResponse {
  success: boolean;
  message: string;
  voice_id?: string;         // Unique voice identifier
  voice_embedding?: number[]; // Raw embedding (if save=false)
}
```

#### List Saved Voices

**Endpoint**: `GET /saved-voices`

**Response**:
```typescript
interface SavedVoicesResponse {
  success: boolean;
  voices: Array<{
    id: string;
    name: string;
    description?: string;
    created_at: string;      // ISO timestamp
    audio_file?: string;     // Reference audio path
    embedding_shape: number[];
  }>;
}
```

#### Get Voice Details

**Endpoint**: `GET /saved-voices/{voice_id}`

**Response**:
```typescript
interface VoiceDetailResponse {
  success: boolean;
  voice: {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    audio_file?: string;
    embedding: number[];     // Full embedding data
  };
}
```

#### Delete Voice

**Endpoint**: `DELETE /saved-voices/{voice_id}`

**Response**:
```typescript
interface DeleteVoiceResponse {
  success: boolean;
  message: string;
}
```

### 3. System Status

#### Health Check

**Endpoint**: `GET /health`

**Response**:
```typescript
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  gpu_available: boolean;
  gpu_name?: string;
  gpu_memory_total?: number;   // GB
  gpu_memory_allocated?: number; // GB
  model_loaded: boolean;
  optimized_inference: boolean;
  version?: string;
}
```

#### Load Balancer Stats

**Endpoint**: `GET /lb-stats`

**Response**:
```typescript
interface LoadBalancerStats {
  servers: Array<{
    url: string;
    status: 'healthy' | 'unhealthy';
    request_count: number;
    error_count: number;
    last_check: string;       // ISO timestamp
    response_time?: number;   // ms
  }>;
  total_requests: number;
  total_errors: number;
  uptime: number;            // seconds
}
```

### 4. Audiobook Features

#### Create Audiobook Project

**Endpoint**: `POST /audiobook/create-project`

**Request**:
```typescript
interface CreateProjectRequest {
  name: string;
  description?: string;
  voice_id?: string;         // Default voice for project
}
```

**Response**:
```typescript
interface ProjectResponse {
  success: boolean;
  project: {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    chapters: number;
    total_duration: number;
  };
}
```

#### Batch Process Chapters

**Endpoint**: `POST /audiobook/batch-process`

**Request**:
```typescript
interface BatchProcessRequest {
  project_id: string;
  chapters: Array<{
    title: string;
    content: string;
    voice_id?: string;       // Override project default
  }>;
  parameters?: {              // TTS parameters
    temperature?: number;
    exaggeration?: number;
    // ... other TTS params
  };
}
```

**Response**: SSE stream with progress updates

## Error Handling

### Error Response Format

```typescript
interface ErrorResponse {
  success: false;
  error: string;
  detail?: string;
  status_code: number;
}
```

### Common Error Codes

- `400` - Bad Request (invalid parameters)
- `404` - Resource not found
- `413` - Request entity too large
- `422` - Unprocessable entity
- `500` - Internal server error
- `503` - Service unavailable (GPU busy)

### Error Examples

```json
{
  "success": false,
  "error": "Text parameter is required",
  "status_code": 400
}

{
  "success": false,
  "error": "GPU memory exhausted",
  "detail": "Try reducing text length or wait for current tasks to complete",
  "status_code": 503
}
```

## Rate Limiting

Currently no rate limiting implemented. For production:
- Configure nginx rate limiting
- Implement API key authentication
- Add request queuing for heavy loads

## WebSocket Support (Future)

Planned WebSocket endpoints for:
- Real-time synthesis progress
- Bidirectional streaming
- Live voice conversion

## Client Libraries

### TypeScript/JavaScript

Provided in `chatterbox-webui/src/lib/api.ts`:

```typescript
import { chatterboxAPI } from '@/lib/api';

// Standard synthesis
const response = await chatterboxAPI.synthesize({
  text: "Hello world",
  temperature: 0.8
});

// Streaming synthesis
chatterboxAPI.synthesizeStream(
  { text: "Hello world" },
  undefined,
  {
    onChunk: (chunk) => console.log('Chunk:', chunk),
    onComplete: () => console.log('Done'),
    onError: (err) => console.error(err)
  }
);
```

### Python

```python
import requests

# Using requests
response = requests.post(
    "http://localhost:6095/synthesize",
    files={"text": (None, "Hello world")},
    data={"temperature": 0.8}
)

if response.json()["success"]:
    audio_url = response.json()["audio_url"]
    # Download audio file
```

### cURL Examples

```bash
# Basic synthesis
curl -X POST http://localhost:6095/synthesize \
  -F "text=Hello world" \
  -o output.wav

# With voice clone
curl -X POST http://localhost:6095/synthesize \
  -F "text=Hello world" \
  -F "audio_prompt=@voice_sample.wav" \
  -o output.wav

# Check health
curl http://localhost:6095/health | jq
```