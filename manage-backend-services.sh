#!/bin/bash

# Chatterbox Backend Service Manager
# This script helps manage the systemd services for Chatterbox TTS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "This script should not be run as root"
        echo "Please run without sudo: ./manage-backend-services.sh"
        exit 1
    fi
}

# Install services
install_services() {
    print_status "Installing Chatterbox backend services..."
    
    # Copy service files to systemd directory
    sudo cp chatterbox-gpu0.service /etc/systemd/system/
    sudo cp chatterbox-gpu1.service /etc/systemd/system/
    sudo cp chatterbox-loadbalancer.service /etc/systemd/system/
    sudo cp chatterbox-backend.target /etc/systemd/system/
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable services
    sudo systemctl enable chatterbox-gpu0.service
    sudo systemctl enable chatterbox-gpu1.service
    sudo systemctl enable chatterbox-loadbalancer.service
    sudo systemctl enable chatterbox-backend.target
    
    print_status "Services installed and enabled successfully!"
}

# Start services
start_services() {
    print_status "Starting Chatterbox backend services..."
    
    # Stop any existing processes
    print_warning "Stopping any existing processes..."
    pkill -f api_server_fast || true
    pkill -f dual_gpu_loadbalancer || true
    sleep 2
    
    # Start services
    sudo systemctl start chatterbox-backend.target
    
    print_status "Services started!"
    sleep 3
    
    # Check status
    status_services
}

# Stop services
stop_services() {
    print_status "Stopping Chatterbox backend services..."
    
    sudo systemctl stop chatterbox-backend.target
    sudo systemctl stop chatterbox-loadbalancer.service
    sudo systemctl stop chatterbox-gpu1.service
    sudo systemctl stop chatterbox-gpu0.service
    
    print_status "Services stopped!"
}

# Restart services
restart_services() {
    print_status "Restarting Chatterbox backend services..."
    stop_services
    sleep 2
    start_services
}

# Check service status
status_services() {
    echo -e "\n${GREEN}=== Service Status ===${NC}"
    
    for service in chatterbox-gpu0 chatterbox-gpu1 chatterbox-loadbalancer; do
        if systemctl is-active --quiet $service; then
            print_status "$service is running"
        else
            print_error "$service is not running"
        fi
    done
    
    echo -e "\n${GREEN}=== Service Health ===${NC}"
    
    # Check GPU 0
    if curl -s http://localhost:6093/health > /dev/null 2>&1; then
        print_status "GPU 0 server (port 6093) is healthy"
    else
        print_error "GPU 0 server (port 6093) is not responding"
    fi
    
    # Check GPU 1
    if curl -s http://localhost:6094/health > /dev/null 2>&1; then
        print_status "GPU 1 server (port 6094) is healthy"
    else
        print_error "GPU 1 server (port 6094) is not responding"
    fi
    
    # Check load balancer
    if curl -s http://localhost:6095/lb-stats > /dev/null 2>&1; then
        print_status "Load balancer (port 6095) is healthy"
    else
        print_error "Load balancer (port 6095) is not responding"
    fi
}

# View logs
view_logs() {
    echo "Select which logs to view:"
    echo "1) GPU 0 server"
    echo "2) GPU 1 server"
    echo "3) Load balancer"
    echo "4) All logs (journalctl)"
    read -p "Choice [1-4]: " choice
    
    case $choice in
        1)
            sudo journalctl -u chatterbox-gpu0 -f
            ;;
        2)
            sudo journalctl -u chatterbox-gpu1 -f
            ;;
        3)
            sudo journalctl -u chatterbox-loadbalancer -f
            ;;
        4)
            sudo journalctl -u 'chatterbox-*' -f
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac
}

# Uninstall services
uninstall_services() {
    print_warning "This will remove the systemd service files."
    read -p "Are you sure? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cancelled"
        return
    fi
    
    stop_services
    
    sudo systemctl disable chatterbox-gpu0.service
    sudo systemctl disable chatterbox-gpu1.service
    sudo systemctl disable chatterbox-loadbalancer.service
    sudo systemctl disable chatterbox-backend.target
    
    sudo rm -f /etc/systemd/system/chatterbox-gpu0.service
    sudo rm -f /etc/systemd/system/chatterbox-gpu1.service
    sudo rm -f /etc/systemd/system/chatterbox-loadbalancer.service
    sudo rm -f /etc/systemd/system/chatterbox-backend.target
    
    sudo systemctl daemon-reload
    
    print_status "Services uninstalled"
}

# Main menu
show_menu() {
    echo -e "\n${GREEN}=== Chatterbox Backend Service Manager ===${NC}"
    echo "1) Install services"
    echo "2) Start services"
    echo "3) Stop services"
    echo "4) Restart services"
    echo "5) Check service status"
    echo "6) View logs"
    echo "7) Uninstall services"
    echo "8) Exit"
    echo
}

# Main loop
main() {
    check_root
    
    while true; do
        show_menu
        read -p "Select an option [1-8]: " choice
        
        case $choice in
            1) install_services ;;
            2) start_services ;;
            3) stop_services ;;
            4) restart_services ;;
            5) status_services ;;
            6) view_logs ;;
            7) uninstall_services ;;
            8) 
                print_status "Exiting..."
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac
        
        echo
        read -p "Press Enter to continue..."
    done
}

# Handle command line arguments
if [[ $# -gt 0 ]]; then
    case $1 in
        install) install_services ;;
        start) start_services ;;
        stop) stop_services ;;
        restart) restart_services ;;
        status) status_services ;;
        logs) view_logs ;;
        uninstall) uninstall_services ;;
        *)
            echo "Usage: $0 {install|start|stop|restart|status|logs|uninstall}"
            exit 1
            ;;
    esac
else
    main
fi