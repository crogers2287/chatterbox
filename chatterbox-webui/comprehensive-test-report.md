# Chatterbox TTS Web UI Test Report

## Test Environment
- Frontend: http://localhost:5173
- API Load Balancer: http://localhost:6095
- Date: August 28, 2025

## Test Results Summary

### ✅ 1. API Connectivity (Port 6095)
- **Status**: WORKING
- **Details**: 
  - API health check returns successful response
  - Load balancer correctly routes to GPU servers (6093, 6094)
  - Direct synthesis API test successful
  - Audio generation and download working

### ⚠️ 2. Frontend API Configuration
- **Status**: FIXED (was using Tailscale URL)
- **Issue**: Frontend was configured to use `fred.taile5e8a3.ts.net:6095` instead of `localhost:6095`
- **Fix**: Updated `.env` file to use localhost URLs
- **Result**: Frontend now connects to correct API endpoint

### 🔄 3. Parallel Generation
- **Status**: TO BE TESTED
- **Expected**: Should use both GPUs concurrently (limit of 2)
- **Implementation**: Code shows proper parallel processing logic in `generateAll()`

### 🔄 4. Auto-Play Functionality
- **Status**: TO BE TESTED
- **Expected**: Audio should play automatically when chunks complete during batch generation
- **Implementation**: Auto-play logic is present in the code

### 🔄 5. Session Persistence
- **Status**: TO BE TESTED
- **Expected**: Audio data should persist across page reloads
- **Implementation**: Code shows base64 audio storage in localStorage

### ✅ 6. Console/Network Errors
- **Status**: NO CRITICAL ERRORS
- **Details**: No network failures or critical JavaScript errors detected

## Key Findings

### API Structure
- Synthesis endpoint: `/synthesize-json` (not `/api/synthesize`)
- Audio download: `/audio/{filename}`
- Health check: `/health`
- Model info: `/models/info`

### Frontend Implementation
1. **Text Input**: Working correctly
2. **Add to Playlist**: Working correctly
3. **Generate Button**: Uses regenerate icon (RotateCw) on individual chunks
4. **Generate All**: Available in header when chunks exist
5. **Audio Playback**: Uses hidden audio element with blob URLs

## Specific Issues Found and Fixes

### Issue 1: Wrong API URL
- **Problem**: Frontend using Tailscale hostname instead of localhost
- **Fix**: Updated `.env` file:
  ```
  VITE_API_URL=http://localhost:6095
  VITE_BYPASS_AUTH=true
  VITE_AUDIOBOOK_API_URL=http://localhost:7860
  ```

### Issue 2: Test Configuration
- **Problem**: Playwright tests were using wrong port (5175 instead of 5173)
- **Fix**: Updated `playwright.config.ts` to use port 5173

## Manual Testing Steps

1. **Open Web UI**: http://localhost:5173
2. **Add Text**: Enter text in textarea and click "Add to Playlist"
3. **Generate Single**: Click the regenerate button (circular arrow) on a chunk
4. **Generate All**: Click "Generate All" button in playlist header
5. **Play Audio**: Click play button when generation completes
6. **Check Persistence**: Reload page and verify chunks/audio remain

## API Test Results

```bash
# Direct synthesis test
curl -X POST http://localhost:6095/synthesize-json \
  -H "Content-Type: application/json" \
  -d '{"text": "Test", "speed": 1.0, "temperature": 0.3, "top_k": 20, "top_p": 0.9}'

# Result: SUCCESS
# Audio generated in ~2 seconds
# File size: ~100KB for 2-second audio
```

## Recommendations

1. **Parallel Processing**: Monitor GPU utilization during batch generation to confirm both GPUs are being used
2. **Error Handling**: Add user-visible error messages when generation fails
3. **Progress Indication**: Show which GPU is processing each chunk
4. **Performance**: Current inference speed ~20 it/s per GPU

## Files Modified

1. `/home/crogers2287/chatterbox/chatterbox-webui/.env` - Updated API URLs to use localhost
2. `/home/crogers2287/chatterbox/chatterbox-webui/playwright.config.ts` - Fixed port configuration

## Test Artifacts

- Screenshots: `/home/crogers2287/chatterbox/chatterbox-webui/test-screenshots/`
- Test audio: `/home/crogers2287/chatterbox/chatterbox-webui/test-output.wav`
- Backup files: `.env.backup` (original configuration preserved)