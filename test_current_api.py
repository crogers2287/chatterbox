#!/usr/bin/env python3
"""Test which API endpoint is being used and current speed"""

import requests
import time

# Test text
test_text = "This is a speed test to verify the current inference performance of the Chatterbox TTS system."

print("Testing Chatterbox TTS API endpoints...")
print("=" * 50)

# Test each endpoint
endpoints = {
    "Direct GPU 0 (6093)": "http://localhost:6093",
    "Direct GPU 1 (6094)": "http://localhost:6094", 
    "Load Balancer (6095)": "http://localhost:6095"
}

for name, url in endpoints.items():
    print(f"\nTesting {name}...")
    
    data = {
        'text': test_text,
        'temperature': '0.8',
        'cfg_weight': '0.5',
        'exaggeration': '0.5',
        'min_p': '0.05',
        'repetition_penalty': '1.2'
    }
    
    try:
        start = time.time()
        response = requests.post(f"{url}/synthesize", data=data, timeout=30)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            result = response.json()
            speed = result.get('inference_speed', 0)
            print(f"  ✓ Success: {elapsed:.2f}s total, {speed:.1f} it/s inference")
        else:
            print(f"  ✗ Failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Error: {str(e)}")

print("\n" + "=" * 50)
print("CURRENT STATUS:")
print("- The web UI .env is configured to use port 6095 (load balancer)")
print("- But logs show it's still hitting port 6093 directly")
print("- Frontend needs to be restarted to pick up the new configuration")
print("\nTo achieve faster speeds:")
print("1. Restart the frontend to use the load balancer (port 6095)")
print("2. This will distribute requests across both GPUs")
print("3. Current speed is ~70 it/s, target is 120+ it/s")