#!/usr/bin/env python3
"""
Test script for Chatterbox Streaming TTS
Tests both regular and streaming synthesis to compare performance
"""

import time
import json
import requests
import base64
import wave
import io
from typing import Dict, Any

# Configuration
API_BASE_URL = "http://localhost:6095"  # Load balancer URL
TEST_TEXT = "Welcome to Chatterbox streaming text to speech! This demonstrates real-time audio synthesis with incredibly low latency. The streaming implementation allows you to hear the beginning of the audio while the rest is still being generated."

def test_health():
    """Test if the server is healthy and streaming is enabled"""
    print("Testing server health...")
    try:
        response = requests.get(f"{API_BASE_URL}/health")
        data = response.json()
        print(f"Server status: {data['status']}")
        print(f"Streaming enabled: {data.get('streaming_enabled', False)}")
        print(f"GPU available: {data['gpu_available']}")
        if data['gpu_available']:
            print(f"GPU: {data['gpu_name']}")
            print(f"GPU memory allocated: {data['gpu_memory_allocated']:.2f} GB")
        return data.get('streaming_enabled', False)
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

def test_regular_synthesis():
    """Test regular (non-streaming) synthesis"""
    print("\n" + "="*60)
    print("Testing REGULAR synthesis...")
    print("="*60)
    
    params = {
        "text": TEST_TEXT,
        "exaggeration": 0.5,
        "temperature": 0.8,
        "cfg_weight": 0.5,
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/synthesize-json",
            json=params,
            timeout=60
        )
        
        end_time = time.time()
        total_time = end_time - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Success!")
            print(f"  Total time: {total_time:.3f}s")
            print(f"  Audio duration: {data['duration']:.2f}s")
            print(f"  Audio URL: {data['audio_url']}")
            print(f"  Real-time factor: {data['duration'] / total_time:.3f}")
            return total_time
        else:
            print(f"✗ Failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return None

def test_streaming_synthesis():
    """Test streaming synthesis with SSE"""
    print("\n" + "="*60)
    print("Testing STREAMING synthesis...")
    print("="*60)
    
    params = {
        "text": TEST_TEXT,
        "exaggeration": 0.5,
        "temperature": 0.8,
        "cfg_weight": 0.5,
        "chunk_size": 50,
    }
    
    # For SSE, we need to use a streaming request
    import sseclient  # You may need to: pip install sseclient-py
    
    start_time = time.time()
    first_chunk_time = None
    chunks_received = 0
    total_audio_duration = 0
    metrics = None
    
    try:
        # Create SSE connection
        headers = {'Accept': 'text/event-stream'}
        response = requests.post(
            f"{API_BASE_URL}/synthesize-stream",
            data=params,
            headers=headers,
            stream=True
        )
        
        client = sseclient.SSEClient(response)
        
        print("Receiving chunks...")
        for event in client.events():
            if event.event == 'audio_chunk':
                chunks_received += 1
                data = json.loads(event.data)
                
                if first_chunk_time is None:
                    first_chunk_time = time.time() - start_time
                    print(f"  ✓ First chunk received in {first_chunk_time:.3f}s!")
                
                # Update metrics
                if 'metrics' in data:
                    metrics = data['metrics']
                    print(f"  Chunk {data['chunk_id']}: RTF={metrics['rtf']:.3f}, "
                          f"Duration={metrics['total_audio_duration']:.2f}s")
                
            elif event.event == 'done':
                print("Streaming complete!")
                break
                
            elif event.event == 'error':
                print(f"Error: {event.data}")
                break
        
        end_time = time.time()
        total_time = end_time - start_time
        
        if metrics:
            print(f"\n✓ Streaming synthesis complete!")
            print(f"  First chunk latency: {metrics['first_chunk_latency']:.3f}s")
            print(f"  Total time: {total_time:.3f}s")
            print(f"  Total chunks: {metrics['chunks_generated']}")
            print(f"  Audio duration: {metrics['total_audio_duration']:.2f}s")
            print(f"  Real-time factor: {metrics['rtf']:.3f}")
            return metrics['first_chunk_latency']
        else:
            print("✗ No metrics received")
            return None
            
    except ImportError:
        print("✗ Please install sseclient-py: pip install sseclient-py")
        return None
    except Exception as e:
        print(f"✗ Streaming error: {e}")
        import traceback
        traceback.print_exc()
        return None

def compare_performance(regular_time: float, streaming_first_chunk: float):
    """Compare performance between regular and streaming synthesis"""
    print("\n" + "="*60)
    print("PERFORMANCE COMPARISON")
    print("="*60)
    
    speedup = regular_time / streaming_first_chunk
    
    print(f"Regular synthesis total time: {regular_time:.3f}s")
    print(f"Streaming first chunk time: {streaming_first_chunk:.3f}s")
    print(f"\n🚀 Streaming is {speedup:.1f}x faster to first audio!")
    print(f"   Users can start hearing audio {regular_time - streaming_first_chunk:.3f}s sooner!")

def main():
    """Run all tests"""
    print("Chatterbox Streaming TTS Test Suite")
    print("=" * 60)
    
    # Check health
    if not test_health():
        print("\n⚠️  Warning: Streaming may not be enabled on the server")
        return
    
    # Test regular synthesis
    regular_time = test_regular_synthesis()
    
    # Test streaming synthesis
    streaming_time = test_streaming_synthesis()
    
    # Compare if both succeeded
    if regular_time and streaming_time:
        compare_performance(regular_time, streaming_time)
    
    print("\n" + "="*60)
    print("Testing complete!")

if __name__ == "__main__":
    main()