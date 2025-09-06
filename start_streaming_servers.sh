#!/bin/bash

# Start Chatterbox Streaming TTS API Servers with Dual GPU support

echo "Starting Chatterbox Streaming TTS API Servers..."

# Kill any existing servers
echo "Stopping existing servers..."
pkill -f "api_server_streaming.py"
pkill -f "dual_gpu_loadbalancer_streaming.py"
sleep 2

# Create log directory if it doesn't exist
mkdir -p logs

# Start GPU 0 server
echo "Starting streaming server on GPU 0 (port 6093)..."
CUDA_VISIBLE_DEVICES=0 API_PORT=6093 nohup venv/bin/python api_server_streaming.py > logs/gpu0_streaming_server.log 2>&1 &
GPU0_PID=$!
echo "GPU 0 streaming server PID: $GPU0_PID"

# Wait a bit for first server to initialize
sleep 5

# Start GPU 1 server
echo "Starting streaming server on GPU 1 (port 6094)..."
CUDA_VISIBLE_DEVICES=1 API_PORT=6094 nohup venv/bin/python api_server_streaming.py > logs/gpu1_streaming_server.log 2>&1 &
GPU1_PID=$!
echo "GPU 1 streaming server PID: $GPU1_PID"

# Wait for servers to be ready
echo "Waiting for servers to initialize..."
sleep 10

# Check if servers are running
for port in 6093 6094; do
    if curl -s http://localhost:$port/health > /dev/null; then
        echo "✓ Server on port $port is healthy"
        # Check streaming support
        if curl -s http://localhost:$port/health | grep -q '"streaming_enabled":true'; then
            echo "  - Streaming is enabled"
        fi
    else
        echo "✗ Server on port $port failed to start"
    fi
done

# Start load balancer
echo "Starting streaming-aware load balancer on port 6095..."
nohup venv/bin/python dual_gpu_loadbalancer_streaming.py > logs/loadbalancer_streaming.log 2>&1 &
LB_PID=$!
echo "Load balancer PID: $LB_PID"

# Wait and check load balancer
sleep 5
if curl -s http://localhost:6095/stats > /dev/null; then
    echo "✓ Load balancer is running"
else
    echo "✗ Load balancer failed to start"
fi

echo ""
echo "=== Chatterbox Streaming TTS Servers Started ==="
echo "GPU 0 Server: http://localhost:6093 (PID: $GPU0_PID)"
echo "GPU 1 Server: http://localhost:6094 (PID: $GPU1_PID)"
echo "Load Balancer: http://localhost:6095 (PID: $LB_PID)"
echo "Stats: http://localhost:6095/stats"
echo ""
echo "Streaming endpoints:"
echo "  - POST http://localhost:6095/synthesize-stream (SSE)"
echo "  - GET  http://localhost:6095/ws (WebSocket - future)"
echo ""
echo "Logs:"
echo "  - GPU 0: logs/gpu0_streaming_server.log"
echo "  - GPU 1: logs/gpu1_streaming_server.log"
echo "  - Load Balancer: logs/loadbalancer_streaming.log"
echo ""
echo "To stop all servers: pkill -f 'api_server_streaming|loadbalancer_streaming'"