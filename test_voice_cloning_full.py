#!/usr/bin/env python3
"""
Test the complete voice cloning flow with the Chatterbox API
"""
import requests
import time
import sys
import os

API_URL = "http://fred.taile5e8a3.ts.net:6095"

def test_health():
    """Test if API is healthy"""
    print("Testing API health...")
    try:
        response = requests.get(f"{API_URL}/health")
        response.raise_for_status()
        health = response.json()
        print(f"✓ API is healthy: {health}")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False

def test_synthesis_without_voice():
    """Test basic synthesis without voice cloning"""
    print("\nTesting synthesis WITHOUT voice cloning...")
    
    data = {
        "text": "Hello, this is a test without voice cloning.",
        "exaggeration": 0.5,
        "temperature": 0.8,
    }
    
    try:
        response = requests.post(f"{API_URL}/synthesize-json", json=data)
        response.raise_for_status()
        result = response.json()
        print(f"✓ Synthesis successful: {result.get('audio_url')}")
        return True
    except Exception as e:
        print(f"✗ Synthesis failed: {e}")
        return False

def test_synthesis_with_voice(voice_file_path):
    """Test synthesis with voice cloning"""
    print(f"\nTesting synthesis WITH voice cloning using: {voice_file_path}")
    
    if not os.path.exists(voice_file_path):
        print(f"✗ Voice file not found: {voice_file_path}")
        return False
    
    # Prepare multipart form data
    with open(voice_file_path, 'rb') as f:
        files = {'audio_prompt': (os.path.basename(voice_file_path), f, 'audio/wav')}
        data = {
            'text': 'Hello, this is a test with voice cloning.',
            'exaggeration': '0.5',
            'temperature': '0.8',
            'cfg_weight': '0.5',
            'min_p': '0.05',
            'top_p': '1.0',
            'repetition_penalty': '1.2',
            'seed': '42',
            'speech_rate': '1.0'
        }
        
        try:
            print("Sending request...")
            response = requests.post(f"{API_URL}/synthesize", data=data, files=files)
            response.raise_for_status()
            result = response.json()
            print(f"✓ Voice cloning synthesis successful: {result.get('audio_url')}")
            print(f"  Parameters used: {result.get('parameters')}")
            return True
        except requests.exceptions.HTTPError as e:
            print(f"✗ HTTP error: {e}")
            print(f"  Response: {e.response.text}")
            return False
        except Exception as e:
            print(f"✗ Voice cloning synthesis failed: {e}")
            return False

def main():
    print("Chatterbox Voice Cloning Test")
    print("=" * 50)
    
    # Test 1: Health check
    if not test_health():
        print("\nAPI is not healthy, stopping tests.")
        sys.exit(1)
    
    # Test 2: Basic synthesis
    test_synthesis_without_voice()
    
    # Test 3: Voice cloning
    # Try to find a test voice file
    test_voices = [
        "test_voice.wav",
        "test_audio.m4a",
        "../test_voice.wav",
        "../test_audio.m4a",
        os.path.expanduser("~/test_voice.wav")
    ]
    
    voice_file = None
    for path in test_voices:
        if os.path.exists(path):
            voice_file = path
            break
    
    if voice_file:
        test_synthesis_with_voice(voice_file)
    else:
        print("\n⚠ No test voice file found. Create one at: test_voice.wav")
        print("  You can record a short audio clip or use any audio file.")
    
    print("\n" + "=" * 50)
    print("Test complete!")

if __name__ == "__main__":
    main()