#!/bin/bash
# Unified TTS System Startup Script

set -e

echo "=== Chatterbox + VibeVoice Unified TTS System ==="
echo

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p saved_voices logs ssl

# Check for VibeVoice license
if [ -z "$VIBEVOICE_LICENSE_KEY" ]; then
    echo "Warning: VIBEVOICE_LICENSE_KEY not set. VibeVoice may run in limited mode."
    echo "Set it with: export VIBEVOICE_LICENSE_KEY=your-license-key"
fi

# Set VibeVoice to use large model by default
export VIBEVOICE_MODEL_SIZE=large
export VIBEVOICE_ENABLE_GPU=true
export VIBEVOICE_ENABLE_VOICE_CLONING=true

# Parse command line arguments
COMMAND=${1:-up}
DETACHED=""

if [ "$COMMAND" == "start" ]; then
    COMMAND="up"
    DETACHED="-d"
fi

case "$COMMAND" in
    up|start)
        echo "Starting unified TTS services..."
        docker-compose -f docker-compose.yml up $DETACHED --build
        ;;
    
    down|stop)
        echo "Stopping unified TTS services..."
        docker-compose -f docker-compose.yml down
        ;;
    
    restart)
        echo "Restarting unified TTS services..."
        docker-compose -f docker-compose.yml restart
        ;;
    
    logs)
        echo "Showing logs..."
        docker-compose -f docker-compose.yml logs -f
        ;;
    
    status)
        echo "Service status:"
        docker-compose -f docker-compose.yml ps
        echo
        echo "Testing health endpoints..."
        
        # Test unified API
        echo -n "Unified API: "
        curl -s http://localhost:8000/health > /dev/null && echo "✓ Healthy" || echo "✗ Unhealthy"
        
        # Test engine status
        echo -n "TTS Engines: "
        curl -s http://localhost:8000/engines | jq -r '.available_engines | join(", ")'
        
        # Test WebUI
        echo -n "WebUI: "
        curl -s http://localhost:5173 > /dev/null && echo "✓ Running" || echo "✗ Not running"
        ;;
    
    test)
        echo "Running integration test..."
        
        # Test Chatterbox engine
        echo "Testing Chatterbox engine..."
        curl -X POST http://localhost:8000/synthesize \
            -F "text=Hello from Chatterbox" \
            -F "engine=chatterbox" \
            -F "temperature=0.8" | jq
        
        # Test VibeVoice engine
        echo -e "\nTesting VibeVoice engine..."
        curl -X POST http://localhost:8000/synthesize \
            -F "text=Hello from VibeVoice" \
            -F "engine=vibevoice" \
            -F "voice_preset=default" | jq
        ;;
    
    pull)
        echo "Pulling latest images..."
        docker-compose -f docker-compose.yml pull
        ;;
    
    build)
        echo "Building images..."
        docker-compose -f docker-compose.yml build
        ;;
    
    *)
        echo "Usage: $0 [start|stop|restart|logs|status|test|pull|build]"
        echo
        echo "Commands:"
        echo "  start   - Start all services in background"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  logs    - Show service logs"
        echo "  status  - Show service status and health"
        echo "  test    - Run integration tests"
        echo "  pull    - Pull latest Docker images"
        echo "  build   - Build Docker images"
        exit 1
        ;;
esac