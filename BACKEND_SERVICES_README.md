# Chatterbox Backend Services

The Chatterbox TTS backend is now running as systemd services with automatic restart on crash.

## Service Architecture

- **chatterbox-gpu0.service**: GPU 0 API server on port 6093
- **chatterbox-gpu1.service**: GPU 1 API server on port 6094
- **chatterbox-loadbalancer.service**: Load balancer on port 6095
- **chatterbox-backend.target**: Target unit to manage all services together

## Quick Commands

### Using the Management Script
```bash
# Interactive menu
./manage-backend-services.sh

# Direct commands
./manage-backend-services.sh start    # Start all services
./manage-backend-services.sh stop     # Stop all services
./manage-backend-services.sh restart  # Restart all services
./manage-backend-services.sh status   # Check service status
./manage-backend-services.sh logs     # View service logs
```

### Using systemctl directly
```bash
# Start all backend services
sudo systemctl start chatterbox-backend.target

# Stop all backend services
sudo systemctl stop chatterbox-backend.target

# Check individual service status
sudo systemctl status chatterbox-gpu0
sudo systemctl status chatterbox-gpu1
sudo systemctl status chatterbox-loadbalancer

# View logs
sudo journalctl -u chatterbox-gpu0 -f
sudo journalctl -u chatterbox-gpu1 -f
sudo journalctl -u chatterbox-loadbalancer -f

# View all Chatterbox logs
sudo journalctl -u 'chatterbox-*' -f
```

## Service Features

1. **Automatic Restart**: Services will automatically restart if they crash
   - RestartSec=10 (waits 10 seconds before restart)
   - StartLimitBurst=5 (allows 5 restarts within 600 seconds)

2. **Logging**: All logs are saved to:
   - `/home/crogers2287/chatterbox/logs/gpu0_server.log`
   - `/home/crogers2287/chatterbox/logs/gpu1_server.log`
   - `/home/crogers2287/chatterbox/logs/loadbalancer.log`

3. **Dependencies**: Load balancer waits for GPU servers to be ready

4. **Resource Limits**: Configured for high-performance operation
   - File descriptor limit: 65536
   - Process limit: 4096

## API Endpoints

- **Load Balancer (recommended)**: `http://localhost:6095`
- **GPU 0 Direct**: `http://localhost:6093`
- **GPU 1 Direct**: `http://localhost:6094`

## Health Check Endpoints

```bash
# Check load balancer health
curl http://localhost:6095/health

# Check load balancer statistics
curl http://localhost:6095/lb-stats

# Check individual GPU server health
curl http://localhost:6093/health
curl http://localhost:6094/health
```

## Troubleshooting

1. **Services won't start**: Check logs with `sudo journalctl -u chatterbox-gpu0 -n 50`
2. **GPU out of memory**: Services will auto-restart after 10 seconds
3. **Port already in use**: Stop any manual processes with `pkill -f api_server_fast`

## Performance

- Current inference speed: ~75 it/s per GPU
- Dual GPU combined: ~150 it/s theoretical maximum
- Load balancer distributes requests evenly between GPUs