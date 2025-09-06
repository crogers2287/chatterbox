# Chatterbox Troubleshooting Guide

## Common Issues and Solutions

### Backend Issues

#### GPU Not Detected

**Symptoms**:
- "CUDA not available" error
- Falling back to CPU mode
- Very slow inference

**Solutions**:
```bash
# Check NVIDIA driver
nvidia-smi

# Verify CUDA installation
python -c "import torch; print(torch.cuda.is_available())"

# Check PyTorch CUDA version
python -c "import torch; print(torch.version.cuda)"

# Reinstall PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

#### Out of Memory (OOM) Errors

**Symptoms**:
- "CUDA out of memory" error
- Server crashes during synthesis
- Cannot load model

**Solutions**:
```python
# Clear GPU memory before loading
import torch
torch.cuda.empty_cache()

# Monitor GPU memory
nvidia-smi -l 1

# Reduce batch size or chunk size
chunk_size = 50  # Lower from default 100

# Use single GPU instead of dual
CUDA_VISIBLE_DEVICES=0 python api_server_fast.py
```

#### Model Loading Failures

**Symptoms**:
- "Model not found" error
- Download timeouts
- Corrupted model files

**Solutions**:
```bash
# Clear model cache
rm -rf ~/.cache/huggingface/

# Manual download with retry
huggingface-cli download chatterbox/models --local-dir ./models

# Use local model path
model = ChatterboxTTS.from_pretrained("./models")
```

#### API Server Won't Start

**Symptoms**:
- Port already in use
- Permission denied
- Module import errors

**Solutions**:
```bash
# Kill existing processes
pkill -f api_server
lsof -i :6093 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Check port availability
netstat -tulpn | grep 6093

# Run with different port
API_PORT=6099 python api_server_fast.py

# Fix permissions
sudo chown -R $USER:$USER /home/crogers2287/chatterbox
```

### Frontend Issues

#### UI Won't Load

**Symptoms**:
- Blank page
- "Cannot connect to server"
- CORS errors

**Solutions**:
```bash
# Check if backend is running
curl http://localhost:6095/health

# Verify frontend build
cd chatterbox-webui
npm run build

# Check for JavaScript errors
# Open browser console (F12)

# Rebuild node modules
rm -rf node_modules package-lock.json
npm install
```

#### Audio Playback Issues

**Symptoms**:
- No audio output
- Distorted sound
- "Failed to load audio" error

**Solutions**:
```javascript
// Check browser console for errors
// Verify audio URL is correct
console.log('Audio URL:', audioUrl);

// Test direct audio access
fetch('/api/audio/test.wav')
  .then(r => console.log('Audio fetch:', r.status));

// Clear audio cache
localStorage.removeItem('audioCache');
```

#### API Connection Errors

**Symptoms**:
- "Network error"
- "Failed to fetch"
- Timeout errors

**Solutions**:
```bash
# Test API directly
curl -X POST http://localhost:6095/synthesize \
  -F "text=Test" -v

# Check CORS headers
curl -I http://localhost:6095/health

# Update API URL in frontend
export VITE_API_URL=http://localhost:6095
```

### Performance Issues

#### Slow Inference Speed

**Symptoms**:
- < 50 it/s on capable GPU
- Long synthesis times
- UI timeouts

**Solutions**:
```python
# Enable optimizations
torch.backends.cudnn.benchmark = True
torch.backends.cuda.matmul.allow_tf32 = True

# Check if CUDA graphs are working
print("CUDA graphs enabled:", model.t3_model.cuda_graph_wrapper is not None)

# Profile inference
import torch.profiler
with torch.profiler.profile() as prof:
    model.generate(text)
print(prof.key_averages())
```

#### High Latency

**Symptoms**:
- Slow first response
- Delayed streaming chunks
- UI lag

**Solutions**:
```bash
# Pre-warm the model
curl -X POST http://localhost:6095/synthesize \
  -F "text=Warm up" > /dev/null

# Enable streaming mode
# Use chunk_size=50 for lower latency

# Check network latency
ping localhost
traceroute localhost
```

### Service Management Issues

#### systemd Services Failing

**Symptoms**:
- Services won't start
- Immediate crash after start
- "Main process exited" errors

**Solutions**:
```bash
# Check service logs
sudo journalctl -u chatterbox-gpu0 -n 100

# Verify service file paths
sudo systemctl cat chatterbox-gpu0

# Test manual execution
/home/crogers2287/chatterbox/venv/bin/python \
  /home/crogers2287/chatterbox/api_server_fast.py

# Reset failed services
sudo systemctl reset-failed
sudo systemctl daemon-reload
```

#### Log File Issues

**Symptoms**:
- No logs generated
- Permission denied writing logs
- Disk full errors

**Solutions**:
```bash
# Create log directory
mkdir -p /home/crogers2287/chatterbox/logs

# Fix permissions
chmod 755 logs/

# Check disk space
df -h /home/crogers2287

# Rotate large logs
find logs/ -name "*.log" -size +100M -exec mv {} {}.old \;
```

### Voice Cloning Issues

#### Poor Voice Quality

**Symptoms**:
- Cloned voice sounds robotic
- Doesn't match reference
- Inconsistent results

**Solutions**:
```python
# Use longer reference audio (15-30 seconds)
# Ensure clean audio without background noise
# Normalize audio levels

# Preprocess audio
import librosa
import soundfile as sf

# Load and normalize
audio, sr = librosa.load("voice.wav", sr=24000)
audio = librosa.util.normalize(audio)
sf.write("voice_normalized.wav", audio, sr)
```

#### Voice Storage Corruption

**Symptoms**:
- "Failed to load voice" errors
- Missing embeddings
- JSON decode errors

**Solutions**:
```bash
# Backup current voices
cp -r saved_voices saved_voices.backup

# Validate JSON
python -m json.tool saved_voices/voices.json

# Rebuild voice index
python voice_storage.py --rebuild

# Clear corrupted entries
# Use the clear_corrupted_voices.html tool
```

## Debugging Tools

### Backend Debugging

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Add breakpoints
import pdb; pdb.set_trace()

# Memory profiling
import tracemalloc
tracemalloc.start()
# ... code ...
current, peak = tracemalloc.get_traced_memory()
print(f"Current memory: {current / 1e6:.1f} MB")
```

### Frontend Debugging

```javascript
// Enable debug mode
localStorage.setItem('debug', 'true');

// Add console logging
if (localStorage.getItem('debug')) {
  console.log('API Request:', request);
  console.log('API Response:', response);
}

// React DevTools
// Install browser extension
// Inspect component props and state
```

### Network Debugging

```bash
# Monitor API traffic
tcpdump -i lo -n port 6095

# Test with curl verbose
curl -X POST http://localhost:6095/synthesize \
  -F "text=Test" \
  -F "temperature=0.8" \
  -v 2>&1 | grep -E "(>|<)"

# Check firewall rules
sudo iptables -L -n | grep 6095
```

## Emergency Recovery

### Complete System Reset

```bash
#!/bin/bash
# Emergency reset script

# Stop all services
sudo systemctl stop chatterbox-backend.target
pkill -f chatterbox
pkill -f api_server

# Clear caches
rm -rf ~/.cache/huggingface/
rm -rf logs/*.log
rm -rf __pycache__/
find . -name "*.pyc" -delete

# Reset GPU
sudo nvidia-smi --gpu-reset

# Restart services
sudo systemctl start chatterbox-backend.target
```

### Data Recovery

```python
# Recover audio from incomplete sessions
import os
import json
from datetime import datetime

# Find orphaned audio files
audio_files = set(os.listdir("saved_voices/audio_files/"))
referenced = set()

with open("saved_voices/voices.json") as f:
    data = json.load(f)
    for voice in data["voices"]:
        if "audio_file" in voice:
            referenced.add(os.path.basename(voice["audio_file"]))

orphaned = audio_files - referenced
print(f"Found {len(orphaned)} orphaned audio files")
```

## Getting Help

### Diagnostic Information

When reporting issues, include:

```bash
# System info
uname -a
nvidia-smi
python --version
pip freeze | grep -E "torch|chatterbox"

# Service status
sudo systemctl status chatterbox-*

# Recent logs
journalctl -u chatterbox-gpu0 -n 50 --no-pager

# API health
curl http://localhost:6095/health | jq
```

### Log Collection Script

```bash
#!/bin/bash
# collect-debug-info.sh

OUTPUT="chatterbox-debug-$(date +%Y%m%d-%H%M%S).tar.gz"

mkdir -p debug-info
cp logs/*.log debug-info/
systemctl status chatterbox-* > debug-info/services.txt
nvidia-smi > debug-info/gpu.txt
pip freeze > debug-info/requirements.txt

tar czf $OUTPUT debug-info/
rm -rf debug-info/

echo "Debug info collected: $OUTPUT"
```