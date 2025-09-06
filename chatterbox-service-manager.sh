#!/bin/bash
# Chatterbox TTS Service Manager
# Switch between single GPU and dual GPU modes

set -e

print_status() {
    echo -e "\n🔍 Current Service Status:"
    if systemctl is-active --quiet chatterbox-tts.service; then
        echo "✅ Single GPU Service: Active (port 6093)"
    else
        echo "❌ Single GPU Service: Inactive"
    fi
    
    if systemctl is-active --quiet chatterbox-dual-gpu.service; then
        echo "✅ Dual GPU Service: Active (load balancer on port 6095)"
    else
        echo "❌ Dual GPU Service: Inactive"
    fi
    
    if systemctl is-active --quiet chatterbox-webui.service; then
        echo "✅ WebUI Service: Active (port 5173)"
    else
        echo "❌ WebUI Service: Inactive"
    fi
}

enable_single_gpu() {
    echo "Enabling single GPU mode..."
    sudo systemctl stop chatterbox-dual-gpu.service 2>/dev/null || true
    sudo systemctl disable chatterbox-dual-gpu.service 2>/dev/null || true
    sudo systemctl enable chatterbox-tts.service
    sudo systemctl start chatterbox-tts.service
    echo "✅ Single GPU mode enabled"
}

enable_dual_gpu() {
    echo "Enabling dual GPU mode..."
    sudo systemctl stop chatterbox-tts.service 2>/dev/null || true
    sudo systemctl disable chatterbox-tts.service 2>/dev/null || true
    sudo systemctl enable chatterbox-dual-gpu.service
    sudo systemctl start chatterbox-dual-gpu.service
    echo "✅ Dual GPU mode enabled"
}

stop_all() {
    echo "Stopping all Chatterbox services..."
    sudo systemctl stop chatterbox-tts.service 2>/dev/null || true
    sudo systemctl stop chatterbox-dual-gpu.service 2>/dev/null || true
    sudo systemctl stop chatterbox-webui.service 2>/dev/null || true
    echo "✅ All services stopped"
}

start_webui() {
    echo "Starting WebUI service..."
    sudo systemctl start chatterbox-webui.service
    echo "✅ WebUI service started"
}

stop_webui() {
    echo "Stopping WebUI service..."
    sudo systemctl stop chatterbox-webui.service
    echo "✅ WebUI service stopped"
}

show_logs() {
    if [ "$1" == "dual" ]; then
        sudo journalctl -u chatterbox-dual-gpu.service -f
    elif [ "$1" == "webui" ]; then
        sudo journalctl -u chatterbox-webui.service -f
    else
        sudo journalctl -u chatterbox-tts.service -f
    fi
}

case "$1" in
    single)
        enable_single_gpu
        print_status
        ;;
    dual)
        enable_dual_gpu
        print_status
        ;;
    stop)
        stop_all
        print_status
        ;;
    status)
        print_status
        ;;
    logs)
        show_logs "$2"
        ;;
    start-webui)
        start_webui
        print_status
        ;;
    stop-webui)
        stop_webui
        print_status
        ;;
    *)
        echo "Chatterbox TTS Service Manager"
        echo ""
        echo "Usage: $0 {single|dual|stop|status|start-webui|stop-webui|logs [single|dual|webui]}"
        echo ""
        echo "Commands:"
        echo "  single      - Enable single GPU mode (port 6093)"
        echo "  dual        - Enable dual GPU mode (load balancer on port 6095)"
        echo "  stop        - Stop all services"
        echo "  start-webui - Start WebUI service (port 5173)"
        echo "  stop-webui  - Stop WebUI service"
        echo "  status      - Show current service status"
        echo "  logs        - Show service logs (follow mode)"
        echo ""
        echo "Examples:"
        echo "  $0 single       # Switch to single GPU mode"
        echo "  $0 dual         # Switch to dual GPU mode"
        echo "  $0 start-webui  # Start the web interface"
        echo "  $0 logs         # Show logs for active service"
        echo "  $0 logs webui   # Show logs for WebUI service"
        ;;
esac