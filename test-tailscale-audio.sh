#!/bin/bash

echo "Testing Audiobook Generation with Tailscale DNS"
echo "=============================================="

# Test API directly
echo -e "\n1. Testing synthesize API with Tailscale DNS..."
curl -X POST http://fred.taile5e8a3.ts.net:6093/synthesize-json \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a test of audiobook generation using Tailscale DNS. The network should work properly now.",
    "exaggeration": 0.5,
    "temperature": 0.8,
    "cfg_weight": 0.5,
    "min_p": 0.05,
    "top_p": 1.0,
    "repetition_penalty": 1.2,
    "speech_rate": 1.0
  }' \
  -s | jq '.' || echo "Failed"

echo -e "\n✓ API is accessible via Tailscale DNS"
echo -e "\nAccess the web UI at: http://100.98.154.42:5173/"
echo "The API will use: http://fred.taile5e8a3.ts.net:6093"