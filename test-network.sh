#!/bin/bash

echo "Testing Chatterbox API Network Connectivity"
echo "=========================================="

# Test 1: Health check
echo -e "\n1. Testing health endpoint..."
curl -s -X GET http://localhost:6093/health | jq '.' || echo "Health check failed"

# Test 2: Synthesize with all parameters
echo -e "\n2. Testing synthesize-json endpoint..."
RESPONSE=$(curl -s -X POST http://localhost:6093/synthesize-json \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Network connectivity test",
    "exaggeration": 0.5,
    "temperature": 0.8,
    "cfg_weight": 0.5,
    "min_p": 0.05,
    "top_p": 1.0,
    "repetition_penalty": 1.2,
    "speech_rate": 1.0
  }')

echo "$RESPONSE" | jq '.' || echo "Synthesize failed"

# Extract audio URL if successful
AUDIO_URL=$(echo "$RESPONSE" | jq -r '.audio_url // empty')

if [ -n "$AUDIO_URL" ]; then
    echo -e "\n3. Testing audio retrieval..."
    echo "Audio URL: http://localhost:6093$AUDIO_URL"
    
    # Test audio retrieval
    curl -s -I "http://localhost:6093$AUDIO_URL" | head -10
fi

# Test 4: CORS headers
echo -e "\n4. Testing CORS headers..."
curl -s -I -X OPTIONS http://localhost:6093/synthesize-json \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control" || echo "No CORS headers found"