#!/usr/bin/env python3
"""Test if voice files are being used in synthesis"""
import requests
import json
import time

# API endpoints
API_BASE = "http://localhost:6093"

def test_synthesis_with_voice():
    """Test synthesis with and without voice file"""
    
    test_text = "This is a test to see if voice files are being used correctly."
    
    # First, get list of saved voices
    print("1. Getting saved voices...")
    response = requests.get(f"{API_BASE}/voices")
    if response.status_code != 200:
        print(f"Failed to get voices: {response.status_code}")
        return
        
    voices = response.json().get('voices', [])
    print(f"   Found {len(voices)} saved voices")
    
    if not voices:
        print("   No saved voices found. Please save a voice first.")
        return
        
    # Use the first voice with audio
    voice_with_audio = None
    for voice in voices:
        if voice.get('voiceReferenceUrl') or voice.get('voiceReferenceData') or voice.get('voiceReferenceFile'):
            voice_with_audio = voice
            break
            
    if not voice_with_audio:
        print("   No voices with audio found.")
        return
        
    print(f"\n2. Using voice: {voice_with_audio['name']} (ID: {voice_with_audio['id']})")
    
    # Get the voice audio file
    print("\n3. Downloading voice audio file...")
    audio_response = requests.get(f"{API_BASE}/voices/{voice_with_audio['id']}/audio")
    if audio_response.status_code != 200:
        print(f"   Failed to get voice audio: {audio_response.status_code}")
        return
    
    audio_content = audio_response.content
    print(f"   Downloaded {len(audio_content)} bytes of audio")
    
    # Test 1: Synthesis WITHOUT voice file (using JSON endpoint)
    print("\n4. Testing synthesis WITHOUT voice file...")
    params = voice_with_audio.get('parameters', {})
    json_request = {
        'text': test_text,
        'exaggeration': params.get('exaggeration', 0.5),
        'temperature': params.get('temperature', 0.8),
        'cfg_weight': params.get('cfg_weight', 0.5),
        'min_p': params.get('min_p', 0.05),
        'top_p': params.get('top_p', 1.0),
        'repetition_penalty': params.get('repetition_penalty', 1.2),
        'seed': params.get('seed', 42)
    }
    
    start_time = time.time()
    response = requests.post(f"{API_BASE}/synthesize-json", json=json_request)
    no_voice_time = time.time() - start_time
    
    if response.status_code == 200:
        result = response.json()
        print(f"   Success! Generated in {no_voice_time:.2f}s")
        print(f"   Audio URL: {result.get('audio_url')}")
    else:
        print(f"   Failed: {response.status_code} - {response.text}")
    
    # Test 2: Synthesis WITH voice file (using multipart endpoint)
    print("\n5. Testing synthesis WITH voice file...")
    
    # Create multipart form data
    files = {
        'audio_prompt': ('voice.wav', audio_content, 'audio/wav')
    }
    
    form_data = {
        'text': test_text,
        'exaggeration': str(params.get('exaggeration', 0.5)),
        'temperature': str(params.get('temperature', 0.8)),
        'cfg_weight': str(params.get('cfg_weight', 0.5)),
        'min_p': str(params.get('min_p', 0.05)),
        'top_p': str(params.get('top_p', 1.0)),
        'repetition_penalty': str(params.get('repetition_penalty', 1.2)),
        'seed': str(params.get('seed', 42))
    }
    
    start_time = time.time()
    response = requests.post(f"{API_BASE}/synthesize", data=form_data, files=files)
    with_voice_time = time.time() - start_time
    
    if response.status_code == 200:
        result = response.json()
        print(f"   Success! Generated in {with_voice_time:.2f}s")
        print(f"   Audio URL: {result.get('audio_url')}")
    else:
        print(f"   Failed: {response.status_code} - {response.text}")
    
    print("\n6. Summary:")
    print(f"   - Without voice file: {no_voice_time:.2f}s")
    print(f"   - With voice file: {with_voice_time:.2f}s")
    print(f"   - Difference: {abs(with_voice_time - no_voice_time):.2f}s")
    print("\n   Note: Voice cloning should take longer as it processes the reference audio.")

if __name__ == "__main__":
    test_synthesis_with_voice()