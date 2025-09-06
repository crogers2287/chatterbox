#!/bin/bash
# Chatterbox TTS Service Startup Script
# This script ensures proper environment setup before starting the API server

set -e

# Configuration
CHATTERBOX_HOME="/home/crogers2287/chatterbox"
VENV_PATH="$CHATTERBOX_HOME/venv"
PYTHON_PATH="$VENV_PATH/bin/python"
API_SCRIPT="$CHATTERBOX_HOME/api_server.py"

# Logging
LOG_DIR="/var/log/chatterbox-tts"
mkdir -p "$LOG_DIR" 2>/dev/null || true

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/startup.log"
}

# Check if running as correct user
if [ "$USER" != "crogers2287" ]; then
    log "ERROR: Service must run as user crogers2287"
    exit 1
fi

# Change to working directory
cd "$CHATTERBOX_HOME"

# Activate virtual environment
if [ ! -f "$PYTHON_PATH" ]; then
    log "ERROR: Virtual environment not found at $VENV_PATH"
    exit 1
fi

log "Starting Chatterbox TTS API Server..."

# Set GPU environment
export CUDA_VISIBLE_DEVICES=0
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512

# Add source to Python path
export PYTHONPATH="$CHATTERBOX_HOME/src:$PYTHONPATH"

# Check GPU availability
if command -v nvidia-smi >/dev/null 2>&1; then
    log "GPU Status:"
    nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits | while read line; do
        log "  $line"
    done
else
    log "WARNING: nvidia-smi not available"
fi

# Start the API server
log "Executing: $PYTHON_PATH $API_SCRIPT"
exec "$PYTHON_PATH" "$API_SCRIPT"