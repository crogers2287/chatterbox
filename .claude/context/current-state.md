# Chatterbox TTS - Current Project State

## Project Status

**Last Updated**: January 2025
**Development Stage**: Production-ready with active development
**Primary Maintainer**: crogers2287

## Active Components

### Backend Services (Running)
- **GPU 0 Server**: Port 6093 - `chatterbox-gpu0.service`
- **GPU 1 Server**: Port 6094 - `chatterbox-gpu1.service`
- **Load Balancer**: Port 6095 - `chatterbox-loadbalancer.service`
- **Status**: All services managed by systemd with auto-restart

### Frontend
- **Development UI**: Port 5173 (Vite dev server)
- **Production UI**: Served via nginx on port 80
- **Framework**: React 19 + TypeScript + Vite

## Recent Developments

### Completed Features
1. **Dual GPU Load Balancing**
   - Round-robin request distribution
   - Health monitoring and failover
   - ~150 it/s combined throughput

2. **Streaming TTS Implementation**
   - Server-Sent Events (SSE) for real-time audio
   - <0.5s first chunk latency
   - Chunk-based audio generation

3. **Voice Cloning System**
   - Audio reference upload
   - Voice embedding extraction
   - Persistent voice library

4. **Audiobook Generator**
   - Batch chapter processing
   - Project management
   - Voice consistency across chapters

### Performance Optimizations
1. **CUDA Graph Compilation**: Static shapes for 120+ it/s
2. **TF32 Acceleration**: Tensor Core utilization
3. **Memory Pool Management**: Pre-allocated buffers
4. **Async I/O**: Non-blocking API operations

## Known Issues

### Minor Issues
1. **Voice Library UI**: Occasional sync delays with backend
2. **Mobile Safari**: Audio playback requires user interaction
3. **Large Text**: >3000 chars can cause UI lag

### Performance Considerations
1. **GPU Memory**: Each model uses ~4-6GB VRAM
2. **Cold Start**: First inference takes 3-5s for model warmup
3. **Concurrent Limits**: Max 2-3 simultaneous generations per GPU

## Active Development Areas

### In Progress
1. **WebSocket Support**: Real-time bidirectional communication
2. **Voice Fine-tuning**: Custom voice training interface
3. **Multi-language Support**: Expanding beyond English
4. **Edge Deployment**: Optimized models for smaller GPUs

### Planned Features
1. **Voice Marketplace**: Share and discover custom voices
2. **API Authentication**: Token-based access control
3. **Cloud Integration**: S3 storage for audio files
4. **Mobile Apps**: Native iOS/Android clients

## Configuration State

### Environment
- **Python**: 3.8+ with venv
- **CUDA**: 11.8 with PyTorch 2.x
- **Node.js**: 18+ with npm
- **OS**: Ubuntu Linux (tested on 22.04)

### Key Paths
```
/home/crogers2287/chatterbox/     # Project root
├── venv/                        # Python virtual environment
├── logs/                        # Service logs
├── saved_voices/                # Voice storage
└── chatterbox-webui/build/      # Production UI build
```

### Service Endpoints
- **API (via Load Balancer)**: http://localhost:6095
- **Direct GPU Access**: http://localhost:6093-6094
- **UI Development**: http://localhost:5173
- **UI Production**: http://localhost:80

## Deployment Notes

### Production Setup
1. Services run under systemd for reliability
2. Nginx reverse proxy for web UI
3. Automatic restart on crash
4. Log rotation configured

### Monitoring
- Health checks: `/health` endpoint
- Load balancer stats: `/lb-stats`
- GPU monitoring: `nvidia-smi`
- Service logs: `journalctl`

## Next Steps

### Immediate Priorities
1. Complete WebSocket implementation for better streaming
2. Add comprehensive API documentation
3. Implement request queuing for overload handling
4. Create Docker images for easier deployment

### Long-term Goals
1. Achieve 200+ it/s with optimized models
2. Support 20+ languages with quality voices
3. Build ecosystem of voice tools and integrations
4. Create enterprise deployment options

## Development Notes

### Code Quality
- TypeScript strict mode enabled
- ESLint configured for consistency
- Playwright tests for E2E coverage
- Python type hints throughout

### Git Repository
- Main branch: Stable releases
- Feature branches: Active development
- No remote repository configured (local only)

---

*This document reflects the current state of the Chatterbox TTS project as of January 2025.*