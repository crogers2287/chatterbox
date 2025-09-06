#!/usr/bin/env python3
"""
Simple load balancer for dual GPU Chatterbox TTS servers
"""
import asyncio
from aiohttp import web, ClientSession
import random
import time

# Configuration
GPU_SERVERS = [
    'http://localhost:6093',  # GPU 0
    'http://localhost:6094'   # GPU 1
]
LOAD_BALANCER_PORT = 6095

# Track server health and load
server_stats = {
    server: {'requests': 0, 'errors': 0, 'last_error': None, 'healthy': True}
    for server in GPU_SERVERS
}

async def check_server_health():
    """Periodically check if servers are healthy"""
    async with ClientSession() as session:
        while True:
            for server in GPU_SERVERS:
                try:
                    async with session.get(f"{server}/health", timeout=5) as resp:
                        server_stats[server]['healthy'] = resp.status == 200
                except:
                    server_stats[server]['healthy'] = False
            await asyncio.sleep(10)  # Check every 10 seconds

async def handle_request(request):
    """Load balance requests across GPU servers"""
    # Get healthy servers
    healthy_servers = [s for s in GPU_SERVERS if server_stats[s]['healthy']]
    
    if not healthy_servers:
        return web.Response(text="No healthy servers available", status=503)
    
    # Choose server with least requests (least connections algorithm)
    server = min(healthy_servers, key=lambda s: server_stats[s]['requests'])
    
    # Track request
    server_stats[server]['requests'] += 1
    
    # Build target URL
    target_url = f"{server}{request.path_qs}"
    
    try:
        async with ClientSession() as session:
            # Forward request body if exists
            data = await request.read() if request.body_exists else None
            
            # Copy headers, excluding host
            headers = {k: v for k, v in request.headers.items() 
                      if k.lower() not in ['host', 'content-length']}
            
            # Add CORS headers for cross-origin requests
            if 'origin' in request.headers:
                headers['Origin'] = request.headers['Origin']
            
            # Make request to backend server
            async with session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=data,
                timeout=300  # 5 minute timeout for TTS
            ) as response:
                body = await response.read()
                
                # Create response with backend's headers
                resp_headers = {k: v for k, v in response.headers.items() 
                               if k.lower() not in ['content-encoding', 'transfer-encoding']}
                
                # Ensure CORS headers are included
                if 'access-control-allow-origin' in response.headers:
                    resp_headers['Access-Control-Allow-Origin'] = response.headers['access-control-allow-origin']
                else:
                    # Add CORS headers if not present
                    origin = request.headers.get('Origin', '*')
                    resp_headers['Access-Control-Allow-Origin'] = origin
                    resp_headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                    resp_headers['Access-Control-Allow-Headers'] = 'Content-Type'
                
                resp = web.Response(
                    body=body,
                    status=response.status,
                    headers=resp_headers
                )
                
                return resp
                
    except Exception as e:
        server_stats[server]['errors'] += 1
        server_stats[server]['last_error'] = str(e)
        server_stats[server]['requests'] -= 1  # Don't count failed requests
        
        # Try another server if available
        other_servers = [s for s in healthy_servers if s != server]
        if other_servers:
            server = random.choice(other_servers)
            return await handle_request(request)  # Retry with different server
        
        return web.Response(text=f"Backend error: {str(e)}", status=502)
    finally:
        server_stats[server]['requests'] -= 1  # Decrement active requests

async def stats_handler(request):
    """Show load balancer statistics"""
    stats_html = "<h1>Load Balancer Stats</h1><pre>"
    for server, stats in server_stats.items():
        stats_html += f"\n{server}:\n"
        stats_html += f"  Status: {'HEALTHY' if stats['healthy'] else 'UNHEALTHY'}\n"
        stats_html += f"  Active Requests: {stats['requests']}\n"
        stats_html += f"  Errors: {stats['errors']}\n"
        if stats['last_error']:
            stats_html += f"  Last Error: {stats['last_error']}\n"
    stats_html += "</pre>"
    return web.Response(text=stats_html, content_type='text/html')

async def init_app():
    """Initialize the web application"""
    app = web.Application()
    
    # Add routes
    app.router.add_get('/lb-stats', stats_handler)
    app.router.add_route('*', '/{path:.*}', handle_request)
    
    # Start health checker
    asyncio.create_task(check_server_health())
    
    return app

if __name__ == '__main__':
    print(f"Starting load balancer on port {LOAD_BALANCER_PORT}")
    print(f"Balancing between: {', '.join(GPU_SERVERS)}")
    print(f"Stats available at: http://localhost:{LOAD_BALANCER_PORT}/lb-stats")
    
    app = init_app()
    web.run_app(app, host='0.0.0.0', port=LOAD_BALANCER_PORT)