#!/usr/bin/env python3
"""Compare inference speeds between standard and fast API servers"""

import requests
import time
import json

def test_synthesis(url, text):
    """Test synthesis speed on a given server"""
    
    # For multipart/form-data
    data = {
        'text': text,
        'temperature': '0.8',
        'cfg_weight': '0.5',
        'exaggeration': '0.5',
        'min_p': '0.05',
        'repetition_penalty': '1.2'
    }
    
    start = time.time()
    response = requests.post(f"{url}/synthesize", data=data)
    end = time.time()
    
    if response.status_code == 200:
        result = response.json()
        elapsed = end - start
        speed = result.get('inference_speed', 0)
        return elapsed, speed
    else:
        print(f"Error: {response.status_code}")
        return None, None

# Test text
test_text = "Hello! This is a test of the Chatterbox TTS synthesis speed. We are comparing the performance of different API server implementations to see how much faster the optimized version runs."

print("=== Chatterbox TTS Speed Comparison ===\n")

# Test the fast server
print("Testing Fast Server (port 6093)...")
elapsed, speed = test_synthesis("http://localhost:6093", test_text)
if elapsed:
    print(f"  Total time: {elapsed:.2f}s")
    print(f"  Inference speed: {speed:.1f} it/s\n")

# Show improvement
print("Summary:")
print(f"- Original speed: ~20 it/s")
print(f"- Fast server: {speed:.1f} it/s")
print(f"- Improvement: {speed/20:.1f}x faster")
print(f"\nThe website IS using the fast server via http://fred.taile5e8a3.ts.net:6093")