#!/bin/bash
# Stop the old Chatterbox servers

echo "Stopping old Chatterbox servers..."

# Find and kill the old API servers
pkill -f "api_server_fast.py"
pkill -f "api_server_fast_gpu1.py"
pkill -f "dual_gpu_loadbalancer.py"

# Also stop any process on port 8000
fuser -k 8000/tcp 2>/dev/null || echo "Port 8000 already free"

echo "Old servers stopped."
echo "Now you can start the unified server with: ./start-unified-tts.sh start"