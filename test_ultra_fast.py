#!/usr/bin/env python3
"""Test the ultra-fast inference speed"""

import time
import requests

def test_inference_speed(port, name):
    """Test the inference speed of a server"""
    url = f"http://localhost:{port}/synthesize-json"
    
    data = {
        "text": "Hello world, this is a test of the ultra-fast Chatterbox TTS synthesis API. We are testing the inference speed to see if we can achieve our target of 120 iterations per second.",
        "temperature": 0.8,
        "cfg_weight": 0.0,
        "exaggeration": 0.5,
        "min_p": 0.05,
        "repetition_penalty": 1.2
    }
    
    print(f"\nTesting {name} on port {port}...")
    
    # Do 3 test runs
    speeds = []
    for i in range(3):
        print(f"  Run {i+1}/3...")
        start = time.time()
        
        response = requests.post(url, json=data)
        
        if response.status_code == 200:
            result = response.json()
            if 'inference_speed' in result:
                speed = result['inference_speed']
                speeds.append(speed)
                print(f"    Inference speed: {speed:.1f} it/s")
            else:
                print(f"    No inference speed in response")
        else:
            print(f"    Error: {response.status_code}")
            print(f"    Response: {response.text}")
    
    if speeds:
        avg_speed = sum(speeds) / len(speeds)
        print(f"  Average speed: {avg_speed:.1f} it/s")
        return avg_speed
    return 0

if __name__ == "__main__":
    # Test the regular fast server
    fast_speed = test_inference_speed(6093, "Fast Server")
    
    # Test the ultra-fast fixed server
    ultra_speed = test_inference_speed(6096, "Ultra-Fast Fixed Server")
    
    print(f"\n--- Summary ---")
    print(f"Fast Server: {fast_speed:.1f} it/s")
    print(f"Ultra-Fast Fixed: {ultra_speed:.1f} it/s")
    print(f"Speed improvement: {ultra_speed/fast_speed:.1f}x" if fast_speed > 0 else "N/A")
    print(f"Target: 120+ it/s")
    print(f"Achieved: {'YES' if ultra_speed >= 120 else 'NO'} ({ultra_speed/120*100:.0f}% of target)")