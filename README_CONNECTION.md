# Chatterbox TTS Connection Guide

## Frontend Connection Issues

If the WebUI shows "Not connected to Chatterbox TTS", follow these steps:

### 1. Check Service Status
```bash
./chatterbox-service-manager.sh status
```

Ensure both services show as active:
- ✅ Single GPU Service: Active (port 6093)
- ✅ WebUI Service: Active (port 5173)

### 2. Update API URL Configuration

Edit `/home/crogers2287/chatterbox/chatterbox-webui/.env`:

**For local access (http://localhost:5173):**
```
VITE_API_URL=http://localhost:6093
```

**For Tailscale access (http://fred.taile5e8a3.ts.net:5173):**
```
VITE_API_URL=http://fred.taile5e8a3.ts.net:6093
```

**For dual GPU mode:**
```
VITE_API_URL=http://localhost:6095
```

### 3. Restart WebUI Service
```bash
sudo systemctl restart chatterbox-webui.service
```

### 4. Test Connection
Open the test page in your browser:
- Local: http://localhost:5173/test-connection.html
- Tailscale: http://fred.taile5e8a3.ts.net:5173/test-connection.html

### 5. Clear Browser Cache
If still having issues:
1. Open browser developer tools (F12)
2. Go to Application/Storage tab
3. Clear localStorage
4. Hard refresh (Ctrl+Shift+R)

### Common Issues

**CORS Errors:**
- The API has CORS enabled for all origins
- If you see CORS errors, ensure you're accessing both services from the same protocol (http)

**Network Errors:**
- Check firewall: `sudo ufw status`
- Test API directly: `curl http://localhost:6093/health`
- Check API logs: `sudo journalctl -u chatterbox-tts -f`

**Wrong API Port:**
- Single GPU: 6093
- Dual GPU Load Balancer: 6095
- WebUI: 5173

### Direct API Test
```bash
# Test health endpoint
curl http://localhost:6093/health

# Test synthesis
curl -X POST http://localhost:6093/synthesize-json \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "temperature": 0.8}'
```