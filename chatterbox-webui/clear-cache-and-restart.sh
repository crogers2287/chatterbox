#!/bin/bash

echo "Clearing Vite cache and restarting..."

# Kill any running Vite processes
pkill -f vite

# Clear Vite cache
rm -rf node_modules/.vite

# Clear any build artifacts
rm -rf dist

# Sleep to ensure processes are killed
sleep 2

# Start Vite with host binding
npm run dev -- --host 0.0.0.0 --clearScreen false

echo "Vite restarted. Access at:"
echo "  - http://192.168.1.195:5173"
echo "  - http://chatter.skinnyc.pro:5173"
echo ""
echo "API will use internal IP: http://192.168.1.195:6095"