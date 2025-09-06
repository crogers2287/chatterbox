#!/usr/bin/env python3
import requests
import json

API_BASE = "http://100.98.154.42:6093"

# Test with m4a file
test_audio = "test_audio.m4a"
with open(test_audio, "rb") as f:
    files = {
        'audio_prompt': ('test_voice.m4a', f, 'audio/m4a')
    }
    data = {
        'text': 'Test with voice cloning',
        'temperature': '0.8',
        'cfg_weight': '0.5',
        'exaggeration': '0.5',
        'min_p': '0.05',
        'top_p': '1.0',
        'repetition_penalty': '1.2'
    }
    
    print("Testing voice cloning...")
    response = requests.post(f"{API_BASE}/synthesize", data=data, files=files)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")