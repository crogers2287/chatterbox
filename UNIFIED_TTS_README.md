# GPU Unified TTS System - Chatterbox + Microsoft VibeVoice

This GPU unified TTS system allows toggling between Chatterbox and Microsoft VibeVoice on the same GPU, with automatic memory management and dynamic engine switching.

## Features

- **GPU Sharing**: Both engines run on the same GPU with automatic switching
- **Dynamic Memory Management**: Engines are loaded/unloaded as needed to optimize GPU usage
- **Simple Toggle**: Easy switching between Chatterbox and VibeVoice via UI or API
- **Unified API**: Single endpoint supports both engines with consistent parameters
- **WebUI Integration**: Real-time engine status and GPU memory monitoring
- **Docker Compose**: Easy deployment with GPU support for both engines

## Quick Start

1. **Set up environment** (optional for VibeVoice):
```bash
export VIBEVOICE_LICENSE_KEY=your-license-key
```

2. **Start all services**:
```bash
./start-unified-tts.sh start
```

3. **Access the WebUI**:
- Open http://localhost in your browser
- Select TTS engine from the parameters panel

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   WebUI (5173)  │────▶│  Nginx (80/443)  │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  GPU Unified API (8000) │
                    │  (Dynamic Engine Switch) │
                    └────────────┬────────────┘
                                 │
                         ┌───────▼────────┐
                         │ Single GPU     │
                         │ ┌────────────┐ │
                         │ │ Chatterbox │ │
                         │ │     OR     │ │
                         │ │ VibeVoice  │ │
                         │ └────────────┘ │
                         └────────────────┘
```

## API Usage

### Synthesize Speech

```bash
# Using Chatterbox engine
curl -X POST http://localhost:8000/synthesize \
  -F "text=Hello world" \
  -F "engine=chatterbox" \
  -F "temperature=0.8" \
  -F "exaggeration=0.5"

# Using VibeVoice engine  
curl -X POST http://localhost:8000/synthesize \
  -F "text=Hello world" \
  -F "engine=vibevoice" \
  -F "voice_preset=default" \
  -F "speech_rate=1.0"
```

### Check Engine Status

```bash
curl http://localhost:8000/engines
```

Response:
```json
{
  "chatterbox": {
    "available": true,
    "gpu_available": true,
    "device": "cuda:0"
  },
  "vibevoice": {
    "available": true,
    "health": {"status": "healthy"}
  },
  "default_engine": "chatterbox",
  "available_engines": ["chatterbox", "vibevoice"]
}
```

## Configuration

### Docker Environment Variables

- `CUDA_VISIBLE_DEVICES`: GPU device for Chatterbox (default: 0)
- `VIBEVOICE_URL`: VibeVoice service URL (default: http://vibevoice:5000)
- `VIBEVOICE_LICENSE_KEY`: License key for VibeVoice
- `VIBEVOICE_API_KEY`: API key for VibeVoice (if required)
- `PORT`: Unified API port (default: 8000)

### Engine-Specific Parameters

**Chatterbox Parameters**:
- `exaggeration`: Voice expressiveness (0.1-2.0)
- `temperature`: Generation randomness (0.05-5.0)
- `cfg_weight`: Classifier-free guidance (0.0-1.0)
- `min_p`: Minimum probability threshold (0.0-1.0)
- `top_p`: Nucleus sampling threshold (0.0-1.0)
- `repetition_penalty`: Reduce repetition (1.0-2.0)
- `seed`: Random seed for reproducibility
- `speech_rate`: Speed adjustment (0.5-2.0)

**VibeVoice Parameters**:
- `voice_preset`: Voice selection (default, male, female, child, elder)
- `speech_rate`: Speed adjustment (0.5-2.0)
- Additional VibeVoice-specific parameters passed through

## Management Commands

```bash
# Start services
./start-unified-tts.sh start

# Stop services
./start-unified-tts.sh stop

# View logs
./start-unified-tts.sh logs

# Check status
./start-unified-tts.sh status

# Run tests
./start-unified-tts.sh test

# Restart services
./start-unified-tts.sh restart
```

## Development

### Adding a New TTS Engine

1. Create an adapter in `vibevoice_integration.py` following the pattern
2. Update `TTSEngine` enum in `unified_tts_server.py`
3. Add engine initialization in `load_models()`
4. Add synthesis logic in `synthesize_speech()`
5. Update UI engine selection in `TTSParameters.tsx`

### Running Without Docker

```bash
# Install dependencies
pip install -r requirements.txt
pip install aiohttp soundfile

# Set environment
export VIBEVOICE_URL=http://localhost:5000

# Run unified server
python unified_tts_server.py
```

## Troubleshooting

### VibeVoice not available
- Check VibeVoice container logs: `docker logs vibevoice`
- Verify license key is set correctly
- Test health endpoint: `curl http://localhost:5000/health`

### GPU not detected
- Ensure nvidia-docker is installed
- Check CUDA_VISIBLE_DEVICES setting
- Verify GPU access: `docker run --rm --gpus all nvidia/cuda:11.8.0-base nvidia-smi`

### Audio generation fails
- Check unified server logs: `./start-unified-tts.sh logs`
- Verify engine status: `curl http://localhost:8000/engines`
- Test each engine individually using the test command

## Performance Considerations

- **Engine Switching**: Automatic GPU memory management when switching engines
- **Memory Usage**: Each engine uses ~50% of GPU memory when loaded
- **Switching Time**: ~2-5 seconds to switch between engines
- **Chatterbox**: Higher quality, customizable voices
- **VibeVoice**: Microsoft's neural voices, different voice selection

## Security

- Both engines run in isolated containers
- API keys and licenses are passed via environment variables
- Voice files are stored locally with configurable retention
- HTTPS support via nginx proxy configuration