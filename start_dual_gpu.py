#!/usr/bin/env python3
"""
Start dual GPU Chatterbox TTS servers with a simple load balancer
"""
import os
import sys
import time
import subprocess
import signal
from threading import Thread
import random
import asyncio
import aiohttp
from aiohttp import web
import json

# Server configurations
GPU0_PORT = 6093
GPU1_PORT = 6094
LOAD_BALANCER_PORT = 6095

servers = []

def start_server(gpu_id, port):
    """Start a Chatterbox API server on specific GPU and port"""
    print(f"Starting server on GPU {gpu_id} (port {port})...")
    
    env = os.environ.copy()
    env['CUDA_VISIBLE_DEVICES'] = str(gpu_id)
    
    # Create a modified version of api_server.py with custom port
    with open('api_server.py', 'r') as f:
        content = f.read()
    
    # Replace the port in the content
    modified_content = content.replace('port=6093', f'port={port}')
    
    # Write to temporary file
    temp_filename = f'api_server_gpu{gpu_id}.py'
    with open(temp_filename, 'w') as f:
        f.write(modified_content)
    
    # Start the server
    process = subprocess.Popen(
        [sys.executable, temp_filename],
        env=env,
        stdout=open(f'gpu{gpu_id}_server.log', 'w'),
        stderr=subprocess.STDOUT
    )
    
    return process

async def proxy_request(request):
    """Simple round-robin load balancer"""
    # Choose server based on request count
    port = random.choice([GPU0_PORT, GPU1_PORT])
    target_url = f"http://localhost:{port}{request.path_qs}"
    
    try:
        async with aiohttp.ClientSession() as session:
            # Forward the request
            data = await request.read() if request.body_exists else None
            
            async with session.request(
                method=request.method,
                url=target_url,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ['host', 'content-length']},
                data=data
            ) as response:
                body = await response.read()
                
                return web.Response(
                    body=body,
                    status=response.status,
                    headers={k: v for k, v in response.headers.items() if k.lower() not in ['content-encoding', 'transfer-encoding']}
                )
    except Exception as e:
        return web.Response(text=f"Proxy error: {str(e)}", status=503)

async def start_load_balancer():
    """Start simple load balancer"""
    app = web.Application()
    app.router.add_route('*', '/{path:.*}', proxy_request)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', LOAD_BALANCER_PORT)
    await site.start()
    
    print(f"Load balancer started on port {LOAD_BALANCER_PORT}")
    print(f"Access your API at: http://localhost:{LOAD_BALANCER_PORT}")
    
    # Keep running
    await asyncio.Event().wait()

def cleanup(signum, frame):
    """Clean up on exit"""
    print("\nShutting down servers...")
    for proc in servers:
        proc.terminate()
    
    # Remove temporary files
    for gpu_id in [0, 1]:
        try:
            os.remove(f'api_server_gpu{gpu_id}.py')
        except:
            pass
    
    sys.exit(0)

def main():
    # Set up signal handler
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    print("Starting dual GPU Chatterbox TTS setup...")
    print("This will utilize both RTX 3090s for maximum performance!")
    
    # Kill any existing servers
    os.system("pkill -f api_server.py")
    time.sleep(2)
    
    # Start servers
    gpu0_proc = start_server(0, GPU0_PORT)
    servers.append(gpu0_proc)
    time.sleep(10)  # Let first server load the model
    
    gpu1_proc = start_server(1, GPU1_PORT)
    servers.append(gpu1_proc)
    time.sleep(10)  # Let second server load
    
    print("\nServers started:")
    print(f"  GPU 0: http://localhost:{GPU0_PORT}")
    print(f"  GPU 1: http://localhost:{GPU1_PORT}")
    print(f"  Load Balancer: http://localhost:{LOAD_BALANCER_PORT}")
    print("\nStarting load balancer...")
    
    # Run load balancer
    asyncio.run(start_load_balancer())

if __name__ == "__main__":
    main()