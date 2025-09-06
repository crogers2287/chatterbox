#!/bin/bash

# Start the Chatterbox Web UI

echo "Starting Chatterbox Web UI..."

# Kill any existing vite processes
pkill -f vite || true

# Wait a moment
sleep 1

# Change to the webui directory
cd /home/crogers2287/chatterbox/chatterbox-webui

# Start the dev server
npm run dev