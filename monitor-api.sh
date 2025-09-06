#!/bin/bash

echo "Monitoring Chatterbox API requests..."
echo "Press Ctrl+C to stop"
echo ""

while true; do
    # Check for any audio file requests
    if lsof -i :6093 2>/dev/null | grep -q ESTABLISHED; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Active connection detected"
    fi
    
    # Monitor /tmp for new audio files
    find /tmp -name "*.wav" -mmin -1 2>/dev/null | while read -r file; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] New audio file: $file"
    done
    
    sleep 2
done