#!/usr/bin/env python3
"""
Test client for Chatterbox TTS API
"""

import requests
import json
import time

API_BASE = "http://localhost:6093"

def test_health():
    """Test the health endpoint."""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{API_BASE}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def test_model_info():
    """Test the model info endpoint."""
    print("\n🔍 Testing model info endpoint...")
    response = requests.get(f"{API_BASE}/models/info")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def test_synthesis():
    """Test the TTS synthesis endpoint."""
    print("\n🔍 Testing TTS synthesis...")
    
    payload = {
        "text": "Hello, this is a test of the Chatterbox TTS API service!",
        "exaggeration": 0.5,
        "temperature": 0.8,
        "cfg_weight": 0.5
    }
    
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    start_time = time.time()
    response = requests.post(f"{API_BASE}/synthesize", json=payload)
    end_time = time.time()
    
    print(f"Status: {response.status_code}")
    print(f"Response time: {end_time - start_time:.2f} seconds")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Success: {result['success']}")
        print(f"Message: {result['message']}")
        print(f"Duration: {result.get('duration', 'N/A')} seconds")
        print(f"Sample rate: {result['sample_rate']} Hz")
        print(f"Audio URL: {result.get('audio_url', 'N/A')}")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_root():
    """Test the root endpoint."""
    print("🔍 Testing root endpoint...")
    response = requests.get(f"{API_BASE}/")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.status_code == 200

def main():
    """Run all API tests."""
    print("🚀 Starting Chatterbox TTS API Tests")
    print("=" * 50)
    
    tests = [
        ("Root endpoint", test_root),
        ("Health check", test_health),
        ("Model info", test_model_info),
        ("TTS synthesis", test_synthesis),
    ]
    
    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = test_func()
        except Exception as e:
            print(f"❌ Error in {test_name}: {e}")
            results[test_name] = False
    
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    for test_name, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    
    all_passed = all(results.values())
    print(f"\n🎯 Overall: {'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
    
    if all_passed:
        print("\n🎉 Chatterbox TTS API is working perfectly!")
        print(f"📖 API Documentation: {API_BASE}/docs")
        print(f"🏥 Health Check: {API_BASE}/health")
        print(f"🎤 TTS Synthesis: POST {API_BASE}/synthesize")

if __name__ == "__main__":
    main()