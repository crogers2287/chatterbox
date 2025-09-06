#!/bin/bash
# Run two Chatterbox TTS API servers with fast inference, one on each GPU

echo "Starting dual GPU Chatterbox TTS fast servers..."

# Kill any existing servers
pkill -f "api_server_fast.py"
sleep 2

# Check if venv is activated, if not activate it
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Start server on GPU 0
echo "Starting fast server on GPU 0 (port 6093)..."
CUDA_VISIBLE_DEVICES=0 nohup python api_server_fast.py > gpu0_server_fast.log 2>&1 &
GPU0_PID=$!
echo "GPU 0 server PID: $GPU0_PID"

# Wait a bit for first server to load
sleep 15

# Start server on GPU 1 - Need to modify the port in the script first
echo "Creating GPU 1 version of api_server_fast.py on port 6094..."
cp api_server_fast.py api_server_fast_gpu1.py

# Change the port to 6094
sed -i 's/port=6093/port=6094/g' api_server_fast_gpu1.py

echo "Starting fast server on GPU 1 (port 6094)..."
CUDA_VISIBLE_DEVICES=1 nohup python api_server_fast_gpu1.py > gpu1_server_fast.log 2>&1 &
GPU1_PID=$!
echo "GPU 1 server PID: $GPU1_PID"

echo ""
echo "Fast servers are running:"
echo "  GPU 0 server: http://localhost:6093 (PID: $GPU0_PID)"
echo "  GPU 1 server: http://localhost:6094 (PID: $GPU1_PID)"
echo "  Load balancer: http://localhost:6095 (via dual_gpu_loadbalancer.py)"
echo ""
echo "Check logs with:"
echo "  tail -f gpu0_server_fast.log"
echo "  tail -f gpu1_server_fast.log"
echo "  tail -f loadbalancer.log"
echo ""
echo "Check server health:"
echo "  curl http://localhost:6093/health"
echo "  curl http://localhost:6094/health"
echo "  curl http://localhost:6095/lb-stats"