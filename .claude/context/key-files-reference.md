# Chatterbox Key Files Reference

## Core Backend Files

### API Servers

#### `api_server_fast.py`
- **Purpose**: Main FastAPI server with GPU optimization
- **Key Features**:
  - CUDA graph compilation for 120+ it/s
  - Voice cloning endpoints
  - Health monitoring
  - Static file serving
- **Important Functions**:
  - `load_model()`: Initializes TTS with optimizations
  - `synthesize_speech()`: Main synthesis endpoint
  - `voice_clone()`: Extract voice embeddings

#### `dual_gpu_loadbalancer.py`
- **Purpose**: Distributes requests across GPU servers
- **Key Features**:
  - Round-robin load balancing
  - Health check monitoring
  - Request statistics
  - Automatic failover
- **Configuration**:
  ```python
  SERVERS = [
      "http://localhost:6093",  # GPU 0
      "http://localhost:6094"   # GPU 1
  ]
  ```

#### `api_server_streaming.py` (if exists)
- **Purpose**: Streaming synthesis with SSE
- **Key Features**:
  - Chunked audio generation
  - Real-time streaming
  - Low latency (<0.5s first chunk)

### Model Files

#### `src/chatterbox/tts.py`
- **Purpose**: Main TTS interface
- **Class**: `ChatterboxTTS`
- **Key Methods**:
  - `from_pretrained()`: Load model weights
  - `generate()`: Synthesize speech
  - `generate_stream()`: Streaming synthesis
  - `clone_voice()`: Extract voice features

#### `src/chatterbox/models/t3/t3.py`
- **Purpose**: Text-to-Token transformer model
- **Architecture**: Custom transformer with:
  - Learned position embeddings
  - Conditional encoding for voice
  - Classifier-free guidance

#### `src/chatterbox/models/s3gen/s3gen.py`
- **Purpose**: Token-to-Speech vocoder
- **Features**:
  - Flow matching architecture
  - HiFiGAN decoder
  - 24kHz output

### Configuration

#### `pyproject.toml`
- **Purpose**: Python project configuration
- **Key Sections**:
  - Dependencies
  - Build configuration
  - Package metadata

## Core Frontend Files

### Main Application

#### `chatterbox-webui/src/App.tsx`
- **Purpose**: Root React component
- **Features**:
  - Router setup
  - Global providers
  - Layout structure

#### `chatterbox-webui/src/lib/api.ts`
- **Purpose**: API client library
- **Exports**: `chatterboxAPI` object
- **Key Methods**:
  - `synthesize()`: Standard TTS
  - `synthesizeStream()`: Streaming TTS
  - `cloneVoice()`: Voice cloning
  - `getSavedVoices()`: Voice library

#### `chatterbox-webui/src/lib/store.ts`
- **Purpose**: Zustand state management
- **State Structure**:
  ```typescript
  interface ChatterboxStore {
    // TTS parameters
    parameters: TTSParameters;
    // Audio management
    audioUrl: string | null;
    isGenerating: boolean;
    // Session management
    sessions: Session[];
    activeSessionId: string;
  }
  ```

### Key Components

#### `chatterbox-webui/src/components/TextInput.tsx`
- **Purpose**: Main text input interface
- **Features**:
  - Multi-line text area
  - Character counter
  - Generate button
  - Session integration

#### `chatterbox-webui/src/components/TTSParameters.tsx`
- **Purpose**: Parameter control panel
- **Controls**:
  - Temperature slider
  - Exaggeration slider
  - Speech rate
  - Voice selection
  - Engine toggle (if unified)

#### `chatterbox-webui/src/components/StreamingAudioPlayer.tsx`
- **Purpose**: Real-time audio playback
- **Features**:
  - Chunk-by-chunk playback
  - Progress visualization
  - Performance metrics
  - Download option

### Configuration Files

#### `chatterbox-webui/vite.config.ts`
- **Purpose**: Vite build configuration
- **Key Settings**:
  - Proxy configuration for API
  - Build optimizations
  - Development server setup

#### `chatterbox-webui/tailwind.config.js`
- **Purpose**: Tailwind CSS configuration
- **Customizations**:
  - Theme colors
  - Custom utilities
  - Plugin configuration

## Service Configuration

### systemd Services

#### `chatterbox-gpu0.service`
```ini
[Unit]
Description=Chatterbox GPU0 API Server

[Service]
Type=simple
ExecStart=/path/to/venv/bin/python api_server_fast.py
Environment="CUDA_VISIBLE_DEVICES=0"
Restart=always
```

#### `chatterbox-loadbalancer.service`
```ini
[Unit]
Description=Chatterbox Load Balancer
After=chatterbox-gpu0.service chatterbox-gpu1.service

[Service]
Type=simple
ExecStart=/path/to/venv/bin/python dual_gpu_loadbalancer.py
```

### Nginx Configuration

#### `nginx-chatterbox.conf`
```nginx
upstream chatterbox_backend {
    server localhost:6095;
}

server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://localhost:5173;
    }
    
    location /api/ {
        proxy_pass http://chatterbox_backend/;
    }
}
```

## Utility Scripts

### Service Management

#### `manage-backend-services.sh`
- **Purpose**: Interactive service control
- **Commands**:
  - Start/stop/restart services
  - View logs
  - Check status

#### `start_dual_gpu_production.sh`
- **Purpose**: Production startup script
- **Actions**:
  1. Stop old processes
  2. Clear logs
  3. Start GPU servers
  4. Start load balancer
  5. Verify health

### Testing Scripts

#### `run-comprehensive-tests.sh`
- **Purpose**: Full test suite execution
- **Coverage**:
  - Backend unit tests
  - API integration tests
  - Frontend E2E tests
  - Performance benchmarks

## Data Storage

### Voice Storage

#### `saved_voices/voices.json`
```json
{
  "voices": [
    {
      "id": "voice_123",
      "name": "Custom Voice",
      "created_at": "2024-01-01T00:00:00Z",
      "audio_file": "audio_files/voice_123.wav",
      "embedding_file": "embeddings/voice_123.pt"
    }
  ]
}
```

### Log Files

```
logs/
├── gpu0_server.log      # GPU 0 server logs
├── gpu1_server.log      # GPU 1 server logs
├── loadbalancer.log     # Load balancer logs
└── frontend.log         # UI server logs
```

## Model Weights

Model files are typically downloaded automatically on first run:

```
~/.cache/huggingface/hub/
├── models--chatterbox/
│   ├── t3_model.pt
│   ├── s3gen_model.pt
│   └── voice_encoder.pt
└── tokenizers/
    └── tokenizer.json
```

## Environment Variables

### Backend
- `CUDA_VISIBLE_DEVICES`: GPU selection (0, 1)
- `API_PORT`: Server port override
- `LOG_LEVEL`: Logging verbosity
- `MODEL_CACHE_DIR`: Custom model location

### Frontend
- `VITE_API_URL`: API endpoint override
- `NODE_ENV`: Development/production mode
- `PORT`: UI server port