#!/usr/bin/env python3
"""
Load balancer for dual GPU Chatterbox TTS servers with streaming support
Handles both regular HTTP requests and Server-Sent Events (SSE) streaming
"""
import asyncio
import aiohttp
from aiohttp import web, ClientSession
import random
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
GPU_SERVERS = [
    'http://localhost:6093',  # GPU 0
    'http://localhost:6094'   # GPU 1
]
LOAD_BALANCER_PORT = 6095

# Track server health and load
server_stats = {
    server: {
        'requests': 0, 
        'streaming_requests': 0,
        'errors': 0, 
        'last_error': None, 
        'healthy': True
    }
    for server in GPU_SERVERS
}

async def check_server_health():
    """Periodically check if servers are healthy"""
    async with ClientSession() as session:
        while True:
            for server in GPU_SERVERS:
                try:
                    async with session.get(f"{server}/health", timeout=5) as resp:
                        data = await resp.json()
                        server_stats[server]['healthy'] = resp.status == 200
                        server_stats[server]['streaming_enabled'] = data.get('streaming_enabled', False)
                except Exception as e:
                    logger.warning(f"Health check failed for {server}: {e}")
                    server_stats[server]['healthy'] = False
                    server_stats[server]['streaming_enabled'] = False
            await asyncio.sleep(10)  # Check every 10 seconds

async def handle_streaming_request(request, server):
    """Handle SSE streaming requests"""
    server_stats[server]['streaming_requests'] += 1
    
    try:
        # Build target URL
        target_url = f"{server}{request.path_qs}"
        
        # Prepare request data
        data = None
        headers = {k: v for k, v in request.headers.items() 
                  if k.lower() not in ['host', 'content-length']}
        
        # Handle multipart form data for file uploads
        if request.content_type and 'multipart' in request.content_type:
            reader = await request.multipart()
            form_data = aiohttp.FormData()
            
            async for part in reader:
                if part.filename:
                    # File upload
                    content = await part.read()
                    form_data.add_field(
                        part.name,
                        content,
                        filename=part.filename,
                        content_type=part.headers.get('Content-Type')
                    )
                else:
                    # Regular form field
                    value = await part.text()
                    form_data.add_field(part.name, value)
            
            data = form_data
        else:
            # JSON or other data
            data = await request.read() if request.body_exists else None
        
        # Create streaming response
        response = web.StreamResponse(
            status=200,
            reason='OK',
            headers={
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST',
            }
        )
        await response.prepare(request)
        
        # Make streaming request to backend
        async with ClientSession() as session:
            # Use the same method as the original request
            method = request.method
            async with session.request(
                method=method,
                url=target_url,
                headers=headers,
                data=data if method != 'GET' else None,
                params=dict(request.query) if method == 'GET' else None,
                timeout=aiohttp.ClientTimeout(total=None)  # No timeout for streaming
            ) as backend_response:
                # Stream data from backend to client
                async for chunk in backend_response.content.iter_any():
                    await response.write(chunk)
                    await response.drain()
        
        await response.write_eof()
        return response
        
    except Exception as e:
        logger.error(f"Streaming error for {server}: {e}")
        server_stats[server]['errors'] += 1
        server_stats[server]['last_error'] = str(e)
        raise
    finally:
        server_stats[server]['streaming_requests'] -= 1

async def handle_request(request):
    """Load balance requests across GPU servers"""
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return web.Response(
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            }
        )
    
    # Get healthy servers
    healthy_servers = [s for s in GPU_SERVERS if server_stats[s]['healthy']]
    
    if not healthy_servers:
        return web.Response(text="No healthy servers available", status=503)
    
    # Check if this is a streaming request
    is_streaming = request.path == '/synthesize-stream'
    
    # For streaming requests, prefer servers with streaming enabled
    if is_streaming:
        streaming_servers = [s for s in healthy_servers 
                           if server_stats[s].get('streaming_enabled', False)]
        if streaming_servers:
            healthy_servers = streaming_servers
    
    # Choose server with least active requests
    # For streaming, weight streaming requests more heavily
    def get_server_load(server):
        return (server_stats[server]['requests'] + 
                server_stats[server]['streaming_requests'] * 3)
    
    server = min(healthy_servers, key=get_server_load)
    
    # Handle streaming requests differently
    if is_streaming:
        return await handle_streaming_request(request, server)
    
    # Track regular request
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
                headers = {k: v for k, v in response.headers.items() 
                          if k.lower() not in ['content-encoding', 'transfer-encoding']}
                # Add CORS headers
                headers['Access-Control-Allow-Origin'] = '*'
                headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
                
                resp = web.Response(
                    body=body,
                    status=response.status,
                    headers=headers
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
        stats_html += f"  Healthy: {stats['healthy']}\n"
        stats_html += f"  Streaming Enabled: {stats.get('streaming_enabled', False)}\n"
        stats_html += f"  Active Requests: {stats['requests']}\n"
        stats_html += f"  Active Streaming: {stats['streaming_requests']}\n"
        stats_html += f"  Total Errors: {stats['errors']}\n"
        if stats['last_error']:
            stats_html += f"  Last Error: {stats['last_error']}\n"
        stats_html += "\n"
    stats_html += "</pre>"
    
    return web.Response(text=stats_html, content_type='text/html')

async def websocket_handler(request):
    """Handle WebSocket connections for real-time streaming (future enhancement)"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    # Get healthy streaming server
    healthy_servers = [s for s in GPU_SERVERS 
                      if server_stats[s]['healthy'] and 
                      server_stats[s].get('streaming_enabled', False)]
    
    if not healthy_servers:
        await ws.send_str(json.dumps({'error': 'No streaming servers available'}))
        await ws.close()
        return ws
    
    server = min(healthy_servers, 
                key=lambda s: server_stats[s]['streaming_requests'])
    
    # TODO: Implement WebSocket proxying to backend
    await ws.send_str(json.dumps({'info': 'WebSocket streaming not yet implemented'}))
    await ws.close()
    
    return ws

async def init_app():
    """Initialize the application"""
    app = web.Application()
    
    # Add routes
    app.router.add_get('/stats', stats_handler)
    app.router.add_get('/ws', websocket_handler)
    app.router.add_route('*', '/{path:.*}', handle_request)
    
    # Start health checker
    asyncio.create_task(check_server_health())
    
    return app

if __name__ == '__main__':
    logger.info(f"Starting load balancer on port {LOAD_BALANCER_PORT}")
    logger.info(f"Backend servers: {GPU_SERVERS}")
    
    app = init_app()
    web.run_app(
        app,
        host='0.0.0.0',
        port=LOAD_BALANCER_PORT,
        access_log=logger
    )