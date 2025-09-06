#!/usr/bin/env python3
"""Test dual GPU performance vs single GPU"""
import asyncio
import aiohttp
import time
import json

async def test_single_server(url, num_requests=10):
    """Test single server performance"""
    async with aiohttp.ClientSession() as session:
        start_time = time.time()
        
        tasks = []
        for i in range(num_requests):
            data = aiohttp.FormData()
            data.add_field('text', f'This is test request number {i} to measure the performance improvement with dual GPU setup.')
            data.add_field('exaggeration', '0.7')
            data.add_field('temperature', '0.9')
            data.add_field('cfg_weight', '0.6')
            
            tasks.append(session.post(f"{url}/synthesize", data=data))
        
        responses = await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        
        # Check all responses
        success_count = sum(1 for r in responses if r.status == 200)
        
        return total_time, success_count

async def main():
    print("Testing Dual GPU Performance")
    print("=" * 40)
    
    # Test single GPU
    print("\n1. Testing Single GPU (port 6093)...")
    single_time, single_success = await test_single_server("http://localhost:6093", 6)
    print(f"   Time: {single_time:.2f}s")
    print(f"   Success: {single_success}/6")
    print(f"   Avg per request: {single_time/6:.2f}s")
    
    # Test dual GPU load balancer
    print("\n2. Testing Dual GPU Load Balancer (port 6095)...")
    dual_time, dual_success = await test_single_server("http://localhost:6095", 6)
    print(f"   Time: {dual_time:.2f}s")
    print(f"   Success: {dual_success}/6")
    print(f"   Avg per request: {dual_time/6:.2f}s")
    
    # Calculate speedup
    speedup = single_time / dual_time
    print(f"\n3. Performance Summary:")
    print(f"   Speedup: {speedup:.2f}x")
    print(f"   Time saved: {single_time - dual_time:.2f}s")
    print(f"   Efficiency: {speedup/2*100:.1f}% (ideal: 100%)")

if __name__ == "__main__":
    asyncio.run(main())