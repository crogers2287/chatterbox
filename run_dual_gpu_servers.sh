#!/bin/bash
# Run two Chatterbox TTS API servers, one on each GPU

echo "Starting dual GPU Chatterbox TTS servers..."

# Kill any existing servers
pkill -f "api_server.py"
sleep 2

# Start server on GPU 0
echo "Starting server on GPU 0 (port 6093)..."
CUDA_VISIBLE_DEVICES=0 nohup venv/bin/python api_server.py > gpu0_server.log 2>&1 &
GPU0_PID=$!
echo "GPU 0 server PID: $GPU0_PID"

# Wait a bit for first server to load
sleep 10

# Start server on GPU 1
echo "Starting server on GPU 1 (port 6094)..."
CUDA_VISIBLE_DEVICES=1 nohup venv/bin/python api_server.py > gpu1_server.log 2>&1 &
GPU1_PID=$!
echo "GPU 1 server PID: $GPU1_PID"

# Create nginx configuration for load balancing
cat > /tmp/chatterbox_lb.conf << 'EOF'
upstream chatterbox_backend {
    least_conn;  # Use least connections load balancing
    server localhost:6093 weight=1;
    server localhost:6094 weight=1;
}

server {
    listen 6095;
    server_name localhost;

    location / {
        proxy_pass http://chatterbox_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Increased timeouts for TTS processing
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

echo "Load balancer configuration created at /tmp/chatterbox_lb.conf"
echo ""
echo "To use with nginx:"
echo "  sudo cp /tmp/chatterbox_lb.conf /etc/nginx/sites-available/chatterbox_lb"
echo "  sudo ln -s /etc/nginx/sites-available/chatterbox_lb /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Servers are running:"
echo "  GPU 0 server: http://localhost:6093"
echo "  GPU 1 server: http://localhost:6094"
echo "  Load balancer would be at: http://localhost:6095"
echo ""
echo "Check logs with:"
echo "  tail -f gpu0_server.log"
echo "  tail -f gpu1_server.log"