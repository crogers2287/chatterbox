#!/bin/bash
# Start dual GPU servers for production use

echo "Starting Chatterbox TTS Dual GPU Setup..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Kill any existing servers
pkill -f "api_server.py"
pkill -f "api_server_streaming.py"
pkill -f "dual_gpu_loadbalancer.py"
sleep 2

# Start GPU 0 server
echo "Starting GPU 0 server on port 6093..."
CUDA_VISIBLE_DEVICES=0 nohup ./venv/bin/python api_server.py > logs/gpu0_server.log 2>&1 &
GPU0_PID=$!
echo "GPU 0 PID: $GPU0_PID"

# Wait for GPU 0 to start
echo "Waiting for GPU 0 to start..."
for i in {1..30}; do
    if curl -s http://localhost:6093/health > /dev/null; then
        echo "GPU 0 server started successfully"
        break
    fi
    sleep 1
done

# Start GPU 1 server  
echo "Starting GPU 1 server on port 6094..."
CUDA_VISIBLE_DEVICES=1 API_PORT=6094 nohup ./venv/bin/python api_server.py > logs/gpu1_server.log 2>&1 &
GPU1_PID=$!
echo "GPU 1 PID: $GPU1_PID"

# Wait for GPU 1 to start
echo "Waiting for GPU 1 to start..."
for i in {1..30}; do
    if curl -s http://localhost:6094/health > /dev/null; then
        echo "GPU 1 server started successfully"
        break
    fi
    sleep 1
done

# Start load balancer
echo "Starting load balancer on port 6095..."
nohup ./venv/bin/python dual_gpu_loadbalancer.py > logs/loadbalancer.log 2>&1 &
LB_PID=$!
echo "Load Balancer PID: $LB_PID"

# Save PIDs for later management
echo "$GPU0_PID" > logs/gpu0.pid
echo "$GPU1_PID" > logs/gpu1.pid
echo "$LB_PID" > logs/loadbalancer.pid

# Test health
sleep 3
echo ""
echo "Testing servers..."
echo -n "GPU 0: "
curl -s http://localhost:6093/health | jq -r '.gpu_name // "Failed to connect"'
echo -n "GPU 1: "
curl -s http://localhost:6094/health | jq -r '.gpu_name // "Failed to connect"'
echo -n "Load Balancer: "
curl -s http://localhost:6095/health > /dev/null && echo "Running" || echo "Failed"

echo ""
echo "Setup complete! Use port 6095 for load-balanced requests."
echo "Logs available in:"
echo "  - logs/gpu0_server.log"
echo "  - logs/gpu1_server.log" 
echo "  - logs/loadbalancer.log"