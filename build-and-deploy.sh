#!/bin/bash

# Build and deploy script for Chatterbox with forced API URL

echo "Building Chatterbox with API URL set to /api..."

cd /home/crogers2287/chatterbox/chatterbox-webui

# Kill any running dev servers
pkill -f vite || true

# Clean old builds
rm -rf dist node_modules/.vite

# Set environment variable and build
export VITE_API_URL=/api
export VITE_BYPASS_AUTH=true

echo "Running production build..."
npm run build

# Check if build succeeded
if [ -d "dist" ]; then
    echo "Build successful!"
    
    # Create a simple HTTP server to test the production build
    echo "Starting production server on port 8080..."
    cd dist
    python3 -m http.server 8080 &
    SERVER_PID=$!
    
    echo ""
    echo "Production build is now available at:"
    echo "  - http://localhost:8080"
    echo "  - http://192.168.1.195:8080"
    echo ""
    echo "To stop the server, run: kill $SERVER_PID"
    
    # Also create nginx static files config
    cat > /home/crogers2287/chatterbox/nginx-static-site.conf << 'EOF'
# Nginx config for serving the production build
server {
    listen 8081;
    server_name _;
    
    root /home/crogers2287/chatterbox/chatterbox-webui/dist;
    index index.html;
    
    # API proxy to load balancer
    location /api/ {
        proxy_pass http://localhost:6095/;
        rewrite ^/api/(.*) /$1 break;
        
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
        
        # Timeouts
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }
    
    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
    
    echo "Nginx config created at: /home/crogers2287/chatterbox/nginx-static-site.conf"
    echo ""
    echo "To use with nginx:"
    echo "  sudo nginx -c /home/crogers2287/chatterbox/nginx-static-site.conf"
    
else
    echo "Build failed!"
    exit 1
fi