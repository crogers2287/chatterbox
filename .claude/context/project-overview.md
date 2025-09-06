# Chatterbox TTS Project Overview

## Project Summary

Chatterbox is an open-source, high-performance text-to-speech (TTS) and voice conversion system built with PyTorch. It features:

- **Dual GPU support** with intelligent load balancing for maximum throughput
- **Real-time streaming** synthesis with <0.5s first-chunk latency
- **Web-based UI** built with React and TypeScript for easy access
- **Voice cloning** capabilities with audio reference support
- **Audiobook generation** with batch processing and project management
- **RESTful API** with comprehensive parameter control

## Technology Stack

### Backend
- **Language**: Python 3.8+
- **ML Framework**: PyTorch with CUDA acceleration
- **Models**: 
  - T3 (Text-to-Token) - Custom transformer model
  - S3Gen (Token-to-Speech) - Neural vocoder
  - Voice Encoder - Speaker embedding extraction
- **API Framework**: FastAPI with asyncio support
- **Process Management**: systemd services with auto-restart

### Frontend
- **Framework**: React 18 with TypeScript
- **State Management**: Zustand
- **UI Components**: Radix UI + Tailwind CSS
- **Build Tool**: Vite
- **Testing**: Playwright for E2E tests

### Infrastructure
- **Load Balancer**: Custom Python-based with health checks
- **Web Server**: Nginx for production deployment
- **GPU Support**: NVIDIA CUDA 11.8+
- **Containerization**: Docker with GPU support (optional)

## Key Features

1. **High Performance**
   - 75+ iterations/second per GPU
   - CUDA graph optimization for static shapes
   - TF32 acceleration support
   - Dual GPU parallel processing

2. **Flexible Voice Control**
   - Temperature control for randomness
   - Exaggeration parameter for expressiveness
   - Speech rate adjustment (0.5x-2.0x)
   - Voice cloning from audio samples

3. **Production Ready**
   - Systemd service management
   - Automatic crash recovery
   - Health monitoring endpoints
   - Comprehensive logging

4. **Developer Friendly**
   - RESTful API with OpenAPI spec
   - TypeScript client library
   - Extensive documentation
   - E2E test suite

## Use Cases

- **Audiobook Creation**: Batch convert text to audio with voice consistency
- **Voice Assistants**: Real-time TTS with low latency
- **Content Creation**: Generate voiceovers for videos/podcasts
- **Accessibility**: Convert written content to speech
- **Voice Cloning**: Create custom voices from audio samples