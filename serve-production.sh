#!/bin/bash

echo "Setting up production server with correct API configuration..."

# Create a simple Node.js server that serves the app with the right config
cat > /home/crogers2287/chatterbox/production-server.js << 'EOF'
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 8080;

// API proxy middleware
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:6095',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error('[Proxy Error]', err);
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
}));

// Serve static files from vite dev server
app.use('/', createProxyMiddleware({
  target: 'http://localhost:5173',
  changeOrigin: true,
  ws: true, // Enable WebSocket support for HMR
  onProxyReq: (proxyReq, req, res) => {
    // Inject script to override API URL
    if (req.path === '/' || req.path === '/index.html') {
      const originalWrite = res.write;
      const originalEnd = res.end;
      const chunks = [];
      
      res.write = function(chunk) {
        chunks.push(Buffer.from(chunk));
        return true;
      };
      
      res.end = function(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk));
        
        const body = Buffer.concat(chunks).toString('utf8');
        const modifiedBody = body.replace(
          '</head>',
          `<script>
            window.VITE_API_URL = '/api';
            console.log('[Production Server] API URL set to:', window.VITE_API_URL);
          </script>
          </head>`
        );
        
        originalWrite.call(res, modifiedBody);
        originalEnd.call(res);
      };
    }
  }
}));

app.listen(PORT, () => {
  console.log(`Production server running at http://localhost:${PORT}`);
  console.log(`Access from: http://192.168.1.195:${PORT}`);
  console.log(`API requests will be proxied to http://localhost:6095`);
});
EOF

# Install dependencies if needed
cd /home/crogers2287/chatterbox
if [ ! -d "node_modules/express" ]; then
    echo "Installing dependencies..."
    npm install express http-proxy-middleware
fi

# Start the production server
echo "Starting production server..."
node production-server.js