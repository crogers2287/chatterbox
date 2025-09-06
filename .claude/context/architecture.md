# Chatterbox Architecture

## System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Web Browser   │────▶│  Nginx (80/443)  │────▶│ React UI (5173) │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                        ┌──────────────────────────────────┼──────────┐
                        │                                  ▼          │
                        │          ┌──────────────────────────┐      │
                        │          │  Load Balancer (6095)    │      │
                        │          │  - Health monitoring     │      │
                        │          │  - Request distribution  │      │
                        │          │  - Statistics tracking   │      │
                        │          └───────────┬──────────────┘      │
                        │                      │                     │
                        │         ┌────────────┴────────────┐        │
                        │         ▼                         ▼        │
                        │  ┌─────────────┐          ┌─────────────┐  │
                        │  │ GPU0 Server │          │ GPU1 Server │  │
                        │  │   (6093)    │          │   (6094)    │  │
                        │  └─────────────┘          └─────────────┘  │
                        │         │                         │        │
                        │         ▼                         ▼        │
                        │  ┌─────────────┐          ┌─────────────┐  │
                        │  │ NVIDIA GPU0 │          │ NVIDIA GPU1 │  │
                        │  └─────────────┘          └─────────────┘  │
                        └────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend (chatterbox-webui/)

**React Application Structure**:
```
src/
├── components/          # UI components
│   ├── TextInput.tsx   # Text input with controls
│   ├── TTSParameters.tsx # Parameter sliders
│   ├── StreamingAudioPlayer.tsx # Real-time playback
│   ├── Sessions.tsx    # Session management
│   └── audiobook/      # Audiobook features
├── lib/                # Core utilities
│   ├── api.ts         # API client
│   ├── store.ts       # Zustand state
│   └── storage.ts     # Local storage
└── contexts/          # React contexts
    └── AuthContext.tsx # Authentication
```

### 2. Backend API Servers

**GPU Server Architecture** (`api_server_fast.py`):
- FastAPI application with asyncio
- CUDA-optimized model loading
- Static graph compilation for performance
- Memory-efficient batch processing

**Key Endpoints**:
- `POST /synthesize` - Generate audio from text
- `POST /synthesize-stream` - Stream audio chunks
- `POST /voice-clone` - Create voice from audio
- `GET /health` - Server health status
- `GET /saved-voices` - List saved voices

### 3. Load Balancer

**Dual GPU Load Balancer** (`dual_gpu_loadbalancer.py`):
```python
# Request routing logic
- Round-robin distribution
- Health-based failover
- Request queuing
- Performance metrics
```

### 4. ML Models (src/chatterbox/)

**Model Pipeline**:
```
Text Input → Tokenizer → T3 Model → S3Gen Vocoder → Audio Output
                            ↑
                     Voice Encoder
                     (for cloning)
```

**Core Models**:
1. **T3 (Text-to-Token)**:
   - Transformer-based architecture
   - Generates speech tokens from text
   - Supports voice conditioning

2. **S3Gen (Token-to-Speech)**:
   - Neural vocoder
   - Converts tokens to waveforms
   - 24kHz sample rate output

3. **Voice Encoder**:
   - Extracts speaker embeddings
   - Enables voice cloning
   - X-vector architecture

## Data Flow

### Regular Synthesis
1. User enters text in UI
2. Frontend sends POST to `/synthesize`
3. Load balancer routes to available GPU
4. Text → Tokens → Audio generation
5. Audio returned as base64 or file
6. Frontend plays/downloads audio

### Streaming Synthesis
1. User requests streaming mode
2. Frontend opens SSE connection
3. Server generates audio chunks
4. Chunks streamed via events
5. Frontend plays chunks in real-time
6. Metrics displayed live

### Voice Cloning
1. User uploads reference audio
2. Voice encoder extracts embedding
3. Embedding saved with metadata
4. Used for future synthesis

## Service Management

### systemd Services
```bash
# Service hierarchy
chatterbox-backend.target
├── chatterbox-gpu0.service     # GPU 0 API server
├── chatterbox-gpu1.service     # GPU 1 API server
└── chatterbox-loadbalancer.service # Load balancer

# WebUI services
chatterbox-webui.service         # Development UI
chatterbox-webui-production.service # Production UI
```

### Process Management
- Automatic restart on crash
- Resource limits configured
- Log rotation enabled
- Health monitoring

## Performance Optimization

### GPU Optimizations
1. **CUDA Graphs**: Static computation graphs
2. **TF32**: Tensor Core acceleration
3. **Memory Pool**: Pre-allocated buffers
4. **Batch Processing**: Efficient inference

### API Optimizations
1. **Async I/O**: Non-blocking operations
2. **Connection Pooling**: Reused connections
3. **Response Caching**: Common requests
4. **Static Files**: CDN-ready assets