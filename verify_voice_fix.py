#!/usr/bin/env python3
"""Verify that saved voices are being used in synthesis"""
import requests
import time
import json

API_BASE = "http://localhost:6093"

def test_voice_usage():
    """Test that saved voices are actually being used"""
    print("=== Testing Voice Usage Fix ===\n")
    
    # 1. Get saved voices
    print("1. Getting saved voices...")
    response = requests.get(f"{API_BASE}/voices")
    voices = response.json().get('voices', [])
    print(f"   Found {len(voices)} voices")
    
    if not voices:
        print("   No saved voices to test with")
        return
    
    # Find voice with audio
    voice = None
    for v in voices:
        if v.get('voiceReferenceFile') or v.get('voiceReferenceData'):
            voice = v
            break
    
    if not voice:
        print("   No voice with audio found")
        return
        
    print(f"\n2. Using voice: {voice['name']} (ID: {voice['id']})")
    print(f"   Has audio file: {bool(voice.get('voiceReferenceFile'))}")
    
    # Download voice audio
    print("\n3. Downloading voice audio...")
    audio_resp = requests.get(f"{API_BASE}/voices/{voice['id']}/audio")
    if audio_resp.status_code == 200:
        audio_size = len(audio_resp.content)
        print(f"   Audio downloaded: {audio_size} bytes")
    else:
        print(f"   Failed to download audio: {audio_resp.status_code}")
        return
    
    # Test text
    test_text = "Testing voice cloning to verify the saved voice profile is being used correctly."
    
    # Test 1: Synthesis with voice (should take longer)
    print("\n4. Testing WITH voice cloning...")
    files = {
        'audio_prompt': ('voice.wav', audio_resp.content, 'audio/wav')
    }
    data = {
        'text': test_text,
        'exaggeration': str(voice['parameters'].get('exaggeration', 0.7)),
        'temperature': str(voice['parameters'].get('temperature', 0.9)),
        'seed': str(voice['parameters'].get('seed', 42))
    }
    
    start = time.time()
    resp = requests.post(f"{API_BASE}/synthesize", data=data, files=files)
    with_voice_time = time.time() - start
    
    if resp.status_code == 200:
        result = resp.json()
        print(f"   ✓ Success! Time: {with_voice_time:.2f}s")
        print(f"   Audio URL: {result.get('audio_url')}")
    else:
        print(f"   ✗ Failed: {resp.status_code}")
        
    # Test 2: Synthesis without voice (should be faster)
    print("\n5. Testing WITHOUT voice cloning...")
    json_data = {
        'text': test_text,
        'exaggeration': voice['parameters'].get('exaggeration', 0.7),
        'temperature': voice['parameters'].get('temperature', 0.9),
        'seed': voice['parameters'].get('seed', 42)
    }
    
    start = time.time()
    resp = requests.post(f"{API_BASE}/synthesize-json", json=json_data)
    without_voice_time = time.time() - start
    
    if resp.status_code == 200:
        result = resp.json()
        print(f"   ✓ Success! Time: {without_voice_time:.2f}s")
        print(f"   Audio URL: {result.get('audio_url')}")
    else:
        print(f"   ✗ Failed: {resp.status_code}")
        
    # Summary
    print("\n6. Summary:")
    print(f"   - WITH voice cloning: {with_voice_time:.2f}s")
    print(f"   - WITHOUT voice: {without_voice_time:.2f}s")
    print(f"   - Difference: {with_voice_time - without_voice_time:.2f}s")
    
    if with_voice_time > without_voice_time:
        print("\n✅ Voice cloning is working! The synthesis with voice takes longer as expected.")
    else:
        print("\n❌ Issue detected: Voice synthesis should take longer than regular synthesis.")

    # Check server logs
    print("\n7. Recent server logs (check for 'audio_prompt' in synthesis calls):")
    print("   Run: tail -20 /home/crogers2287/chatterbox/logs/gpu0_server.log")
    print("\n8. To test in browser:")
    print("   1. Open browser console (F12)")
    print("   2. Click on a saved voice in the UI")
    print("   3. Generate audio")
    print("   4. Look for console logs showing:")
    print("      - '[Store] Voice audio loaded from server'")
    print("      - '[API] Using multipart endpoint with voice file'")
    print("      - '[Playlist] Regular synthesis - voiceReference: File'")

if __name__ == "__main__":
    test_voice_usage()