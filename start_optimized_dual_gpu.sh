#!/bin/bash

# Kill existing servers
echo "Stopping existing servers..."
pkill -f api_server.py
sleep 2

# Set performance mode for GPUs
echo "Setting GPUs to maximum performance mode..."
sudo nvidia-smi -pm 1
sudo nvidia-smi -pl 350  # Set power limit to 350W for RTX 3090

# Enable persistence mode
sudo nvidia-smi -pm ENABLED

# Start GPU 0 server with optimizations
echo "Starting optimized server on GPU 0..."
CUDA_VISIBLE_DEVICES=0 \
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512 \
CUDA_LAUNCH_BLOCKING=0 \
OMP_NUM_THREADS=4 \
nohup venv/bin/python -u api_server.py > gpu0_server.log 2>&1 &

echo "Waiting for GPU 0 server to initialize..."
sleep 15

# Start GPU 1 server with modified port
echo "Starting optimized server on GPU 1..."

# Create a copy of api_server.py with different port
cp api_server.py api_server_gpu1.py
sed -i 's/port=6093/port=6094/g' api_server_gpu1.py

CUDA_VISIBLE_DEVICES=1 \
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512 \
CUDA_LAUNCH_BLOCKING=0 \
OMP_NUM_THREADS=4 \
nohup venv/bin/python -u api_server_gpu1.py > gpu1_server.log 2>&1 &

echo "Waiting for GPU 1 server to initialize..."
sleep 15

# Check GPU utilization
echo -e "\nChecking GPU utilization:"
nvidia-smi --query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total --format=csv

# Update web UI to use both servers with round-robin
echo -e "\nCreating load-balanced API configuration..."

# Create a simple HAProxy configuration
cat > haproxy_chatterbox.cfg << 'EOF'
global
    daemon
    
defaults
    mode http
    timeout connect 5000ms
    timeout client 300s
    timeout server 300s

frontend tts_frontend
    bind *:6095
    default_backend tts_servers

backend tts_servers
    balance roundrobin
    server gpu0 localhost:6093 check
    server gpu1 localhost:6094 check
EOF

echo -e "\nDual GPU setup complete!"
echo "Servers running on:"
echo "  GPU 0: http://localhost:6093"
echo "  GPU 1: http://localhost:6094"
echo ""
echo "To use HAProxy load balancer:"
echo "  haproxy -f haproxy_chatterbox.cfg"
echo "  Then access: http://fred.taile5e8a3.ts.net:6095"
echo ""
echo "Monitor performance with:"
echo "  watch -n1 nvidia-smi"
echo ""
echo "Check logs with:"
echo "  tail -f gpu0_server.log"
echo "  tail -f gpu1_server.log"