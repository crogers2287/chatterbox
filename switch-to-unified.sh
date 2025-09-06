#!/bin/bash
# Switch from old servers to unified TTS server

echo "=== Switching to Unified TTS Server ==="
echo

# 1. Stop old servers
echo "1. Stopping old servers..."
pkill -f "api_server_fast.py" || echo "No api_server_fast.py running"
pkill -f "api_server_fast_gpu1.py" || echo "No api_server_fast_gpu1.py running"
pkill -f "dual_gpu_loadbalancer.py" || echo "No loadbalancer running"
sleep 2

# 2. Free up port 8000 if in use
echo "2. Freeing port 8000..."
fuser -k 8000/tcp 2>/dev/null || echo "Port 8000 already free"

# 3. Update WebUI configuration
echo "3. Updating WebUI configuration..."
cat > /home/crogers2287/chatterbox/chatterbox-webui/.env.development << EOF
VITE_API_URL=http://localhost:8000
VITE_AUDIOBOOK_API_URL=http://fred.taile5e8a3.ts.net:7860
VITE_BYPASS_AUTH=true
VITE_ENABLE_ENGINE_SELECTION=true
EOF

# 4. Start the unified server (not in Docker for now)
echo "4. Starting unified GPU server..."
cd /home/crogers2287/chatterbox

# Check if venv exists
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
fi

# Set environment variables
export VIBEVOICE_URL=http://localhost:5000
export VIBEVOICE_MODEL_SIZE=large
export VIBEVOICE_ENABLE_GPU=true

# Start the server
echo "Starting unified server on port 8000..."
python gpu_unified_tts_server.py &

echo
echo "=== Setup Complete ==="
echo "Unified server starting on port 8000"
echo "WebUI configured to use unified server"
echo "You can now toggle between Chatterbox and VibeVoice in the UI"
echo
echo "To check status: curl http://localhost:8000/engines"