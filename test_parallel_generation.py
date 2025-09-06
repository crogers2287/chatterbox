#!/usr/bin/env python3
"""Test parallel generation with dual GPU load balancer"""

import asyncio
import aiohttp
import time
import json

API_URL = "http://localhost:6095"

async def generate_single(session, text, index):
    """Generate audio for a single chunk"""
    start = time.time()
    
    data = {
        'text': text,
        'temperature': '0.8',
        'cfg_weight': '0.5',
        'exaggeration': '0.5',
        'min_p': '0.05',
        'repetition_penalty': '1.2'
    }
    
    print(f"Chunk {index}: Starting generation...")
    try:
        async with session.post(f"{API_URL}/synthesize", data=data) as response:
            result = await response.json()
            elapsed = time.time() - start
            if response.status == 200:
                speed = result.get('inference_speed', 0)
                print(f"Chunk {index}: Completed in {elapsed:.2f}s at {speed:.1f} it/s")
                return elapsed, speed
            else:
                print(f"Chunk {index}: Failed - {response.status}")
                return elapsed, 0
    except Exception as e:
        elapsed = time.time() - start
        print(f"Chunk {index}: Error - {str(e)}")
        return elapsed, 0

async def test_parallel_generation():
    """Test parallel generation with multiple chunks"""
    
    # Test texts
    chunks = [
        "This is the first chunk of text for testing parallel generation.",
        "This is the second chunk that should process simultaneously.",
        "The third chunk demonstrates dual GPU processing capability.",
        "Finally, the fourth chunk completes our parallel test."
    ]
    
    print(f"Testing parallel generation with {len(chunks)} chunks...")
    print(f"Using API: {API_URL}")
    print("-" * 50)
    
    # Sequential test
    print("\n1. Sequential generation (baseline):")
    sequential_start = time.time()
    async with aiohttp.ClientSession() as session:
        for i, text in enumerate(chunks):
            await generate_single(session, text, i+1)
    sequential_time = time.time() - sequential_start
    print(f"Total sequential time: {sequential_time:.2f}s")
    
    # Parallel test
    print("\n2. Parallel generation (2 concurrent):")
    parallel_start = time.time()
    async with aiohttp.ClientSession() as session:
        # Process in batches of 2 (matching CONCURRENT_LIMIT in frontend)
        for i in range(0, len(chunks), 2):
            batch = chunks[i:i+2]
            tasks = [generate_single(session, text, i+j+1) for j, text in enumerate(batch)]
            await asyncio.gather(*tasks)
    parallel_time = time.time() - parallel_start
    print(f"Total parallel time: {parallel_time:.2f}s")
    
    # Summary
    print("\n" + "=" * 50)
    print("SUMMARY:")
    print(f"Sequential time: {sequential_time:.2f}s")
    print(f"Parallel time:   {parallel_time:.2f}s")
    print(f"Speed improvement: {sequential_time/parallel_time:.2f}x faster")
    print(f"Time saved: {sequential_time - parallel_time:.2f}s")

if __name__ == "__main__":
    asyncio.run(test_parallel_generation())