# Chatterbox Streaming TTS Implementation

This document describes the streaming Text-to-Speech (TTS) implementation for Chatterbox, enabling real-time audio synthesis with low latency.

## Overview

The streaming implementation allows users to start hearing synthesized audio within ~0.5 seconds, compared to several seconds for regular synthesis. This is achieved by generating and streaming audio in chunks rather than waiting for the entire audio to be generated.

## Architecture

### Components

1. **Streaming TTS Model (`tts_streaming.py`)**
   - Extended `ChatterboxTTS` class with streaming capabilities
   - Generates audio in configurable chunks (default: 50 tokens)
   - Yields audio chunks with performance metrics

2. **Streaming API Server (`api_server_streaming.py`)**
   - FastAPI server with Server-Sent Events (SSE) support
   - `/synthesize-stream` endpoint for streaming synthesis
   - Backward compatible with regular synthesis endpoints
   - GPU-optimized with CUDA support

3. **Load Balancer (`dual_gpu_loadbalancer_streaming.py`)**
   - Distributes streaming requests across multiple GPUs
   - Handles long-lived SSE connections
   - Tracks streaming-specific metrics

4. **Frontend Components**
   - `StreamingAudioPlayer.tsx`: React component for streaming audio playback
   - `StreamingDemo.tsx`: Demo interface comparing streaming vs regular synthesis
   - Web Audio API integration for real-time playback

## Performance Metrics

Based on the reference implementation, the streaming system achieves:
- **First chunk latency**: ~0.472 seconds
- **Real-time factor (RTF)**: ~0.499 (2x faster than real-time)
- **Platform**: RTX 4090 GPU

## API Usage

### Streaming Synthesis Endpoint

```bash
POST /synthesize-stream
```

#### Request (Form Data)
```
text: "Text to synthesize"
exaggeration: 0.5
temperature: 0.8
cfg_weight: 0.5
chunk_size: 50
audio_prompt: (optional file)
```

#### Response (Server-Sent Events)
```javascript
// Audio chunk event
event: audio_chunk
data: {
  "chunk_id": 1,
  "audio_chunk": "base64_encoded_audio",
  "sample_rate": 24000,
  "metrics": {
    "first_chunk_latency": 0.472,
    "total_latency": 1.234,
    "rtf": 0.499,
    "total_audio_duration": 2.5,
    "chunks_generated": 5
  }
}

// Completion event
event: done
data: {"message": "Streaming complete", "total_chunks": 5}

// Error event
event: error
data: {"error": "Error message"}
```

### JavaScript Client Example

```javascript
import { chatterboxAPI } from './lib/api';

const eventSource = chatterboxAPI.synthesizeStream(
  {
    text: "Hello, streaming world!",
    temperature: 0.8,
    chunk_size: 50
  },
  undefined, // No audio prompt
  {
    onChunk: (chunk) => {
      console.log(`Received chunk ${chunk.chunk_id}`);
      // Process audio chunk
    },
    onMetrics: (metrics) => {
      console.log(`RTF: ${metrics.rtf}, Latency: ${metrics.first_chunk_latency}s`);
    },
    onComplete: () => {
      console.log('Streaming complete');
    },
    onError: (error) => {
      console.error('Streaming error:', error);
    }
  }
);
```

## Deployment

### Starting Streaming Servers

```bash
# Start dual GPU streaming servers with load balancer
./start_streaming_servers.sh
```

This starts:
- GPU 0 server on port 6093
- GPU 1 server on port 6094
- Load balancer on port 6095

### Testing

```bash
# Run streaming tests
python test_streaming.py
```

This will:
1. Test server health and streaming capability
2. Run regular synthesis benchmark
3. Run streaming synthesis benchmark
4. Compare performance metrics

### Configuration

Environment variables:
- `CUDA_VISIBLE_DEVICES`: GPU device ID
- `API_PORT`: Server port (default: 6093 + GPU_ID)

Model parameters:
- `chunk_size`: Number of speech tokens per chunk (10-200, default: 50)
- Smaller chunks = lower latency but more overhead
- Larger chunks = better efficiency but higher latency

## Technical Details

### Chunked Generation Process

1. Text is tokenized and prepared for synthesis
2. T3 model generates speech tokens incrementally
3. Tokens are buffered until chunk_size is reached
4. S3Gen vocoder converts token chunks to audio
5. Audio chunks are streamed to client via SSE
6. Client plays chunks as they arrive

### Streaming Optimizations

- **Token buffering**: Accumulates tokens until optimal chunk size
- **GPU memory management**: Efficient CUDA memory usage
- **Watermarking**: Applied per chunk for content protection
- **Metrics tracking**: Real-time performance monitoring

### Frontend Audio Handling

The `StreamingAudioPlayer` component:
- Receives base64-encoded audio chunks via SSE
- Decodes and buffers audio data
- Uses Web Audio API for low-latency playback
- Displays real-time metrics and progress
- Supports download of complete audio

## Comparison with Regular Synthesis

| Metric | Regular | Streaming | Improvement |
|--------|---------|-----------|-------------|
| Time to first audio | 3-5s | ~0.5s | 6-10x faster |
| User experience | Wait for complete audio | Immediate playback | Much better |
| Memory usage | Load entire audio | Incremental | More efficient |
| Network transfer | Single large response | Incremental chunks | Better for slow connections |

## Future Enhancements

1. **WebSocket support**: Alternative to SSE for bidirectional communication
2. **Adaptive chunk sizing**: Dynamic adjustment based on network conditions
3. **Multi-language streaming**: Extended language support
4. **Edge deployment**: CDN-based streaming for global low latency
5. **True streaming inference**: Modify T3 model for incremental token generation

## Troubleshooting

### Common Issues

1. **"Streaming not enabled" error**
   - Ensure you're running the streaming API server
   - Check that the correct ports are configured

2. **High latency**
   - Reduce chunk_size for lower latency
   - Check GPU utilization and memory
   - Ensure load balancer is distributing properly

3. **Audio glitches**
   - Increase chunk_size for smoother playback
   - Check network stability
   - Verify client buffering is working

### Monitoring

Check load balancer stats:
```
http://localhost:6095/stats
```

View server logs:
```bash
tail -f logs/gpu0_streaming_server.log
tail -f logs/gpu1_streaming_server.log
tail -f logs/loadbalancer_streaming.log
```