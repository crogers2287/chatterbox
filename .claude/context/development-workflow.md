# Chatterbox Development Workflow

## Getting Started

### Prerequisites
- Python 3.8+ with pip
- Node.js 18+ with npm
- NVIDIA GPU with CUDA 11.8+
- 16GB+ system RAM
- 8GB+ GPU memory

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd chatterbox

# Backend setup
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd chatterbox-webui
npm install
```

## Development Commands

### Backend Development

```bash
# Start single GPU server (development)
python api_server_fast.py

# Start dual GPU setup
./start_dual_gpu_production.sh

# Run with specific GPU
CUDA_VISIBLE_DEVICES=0 python api_server_fast.py

# Start streaming servers
./start_streaming_servers.sh

# Manage systemd services
./manage-backend-services.sh
```

### Frontend Development

```bash
cd chatterbox-webui

# Development server (hot reload)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with UI
npm run test:ui

# Lint code
npm run lint
```

### Testing

```bash
# Backend tests
python test_api.py
python test_streaming.py
python test_voice_clone.py
python test_dual_gpu_performance.py

# Frontend E2E tests
cd chatterbox-webui
npm run test

# Comprehensive test suite
./run-comprehensive-tests.sh
```

## Code Organization

### Backend Structure
```
chatterbox/
├── api_server_fast.py      # Main API server
├── dual_gpu_loadbalancer.py # Load balancer
├── src/chatterbox/         # Core models
│   ├── tts.py             # TTS interface
│   ├── vc.py              # Voice conversion
│   └── models/            # ML models
├── logs/                   # Service logs
└── saved_voices/          # Voice storage
```

### Frontend Structure
```
chatterbox-webui/
├── src/
│   ├── components/        # React components
│   ├── lib/              # Utilities
│   └── contexts/         # React contexts
├── public/               # Static assets
├── tests/                # E2E tests
└── vite.config.ts        # Build config
```

## Common Development Tasks

### Adding a New API Endpoint

1. **Define the endpoint** in `api_server_fast.py`:
```python
@app.post("/new-endpoint")
async def new_endpoint(request: NewRequest):
    # Implementation
    return NewResponse(...)
```

2. **Add TypeScript types** in `lib/api.ts`:
```typescript
interface NewRequest {
  // fields
}

interface NewResponse {
  // fields
}
```

3. **Create API client method**:
```typescript
export const chatterboxAPI = {
  newEndpoint: async (data: NewRequest): Promise<NewResponse> => {
    const response = await axios.post(`${API_URL}/new-endpoint`, data);
    return response.data;
  }
};
```

### Adding a New UI Component

1. **Create component** in `components/`:
```typescript
export const NewComponent: React.FC<Props> = ({ prop }) => {
  return (
    <div className="...">
      {/* Component content */}
    </div>
  );
};
```

2. **Add to parent component**:
```typescript
import { NewComponent } from './components/NewComponent';

// Use in JSX
<NewComponent prop={value} />
```

3. **Write tests** in `tests/`:
```typescript
test('new component works', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.new-component')).toBeVisible();
});
```

### Modifying Model Parameters

1. **Update request model** in `api_server_fast.py`:
```python
class TTSRequest(BaseModel):
    new_param: float = Field(1.0, description="New parameter")
```

2. **Update model call** in synthesis function:
```python
audio = model.generate(
    text,
    new_param=request.new_param,
    # other params
)
```

3. **Update frontend** parameter controls:
```typescript
// In TTSParameters.tsx
<Slider
  label="New Parameter"
  value={params.new_param}
  onChange={(value) => updateParam('new_param', value)}
  min={0}
  max={2}
  step={0.1}
/>
```

## Debugging

### Backend Debugging

```bash
# Check service status
sudo systemctl status chatterbox-gpu0

# View logs
sudo journalctl -u chatterbox-gpu0 -f
tail -f logs/gpu0_server.log

# Test API directly
curl -X POST http://localhost:6093/synthesize \
  -F "text=Test" \
  -F "temperature=0.8"

# Monitor GPU usage
nvidia-smi -l 1
```

### Frontend Debugging

1. **Browser DevTools**:
   - Network tab for API calls
   - Console for errors
   - React DevTools extension

2. **Debug components**:
```typescript
// Add debug logging
console.log('Component state:', state);

// Use debug storage hook
import { useDebugStorage } from '../hooks/useDebugStorage';
const { enableDebug } = useDebugStorage();
```

3. **Test specific scenarios**:
```bash
# Run single test
npm run test -- tests/specific.spec.ts

# Debug mode
npm run test:debug
```

## Performance Optimization

### Backend Performance

1. **Profile inference**:
```python
import time
start = time.time()
audio = model.generate(text)
print(f"Inference time: {time.time() - start:.2f}s")
```

2. **Monitor GPU memory**:
```python
import torch
print(f"Allocated: {torch.cuda.memory_allocated() / 1e9:.2f} GB")
print(f"Reserved: {torch.cuda.memory_reserved() / 1e9:.2f} GB")
```

3. **Optimize batch size**:
```python
# Adjust chunk_size for streaming
chunk_size = 100  # Experiment with values 50-200
```

### Frontend Performance

1. **Bundle analysis**:
```bash
npm run build -- --analyze
```

2. **Lighthouse audit**:
- Open DevTools > Lighthouse
- Run performance audit
- Address recommendations

3. **React profiling**:
- Use React DevTools Profiler
- Identify re-render issues
- Optimize with memo/useMemo

## Deployment

### Production Build

```bash
# Backend
./switch-to-unified.sh  # For unified TTS mode
./manage-backend-services.sh start

# Frontend
cd chatterbox-webui
npm run build
npm install --production

# Start production server
./serve-production.sh
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Scale services
docker-compose up -d --scale gpu-server=2
```

## Git Workflow

### Branch Strategy
- `main` - Stable production code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `perf/*` - Performance improvements

### Commit Messages
```
type(scope): description

Types: feat, fix, perf, docs, test, refactor, style
Scope: api, ui, models, audio, etc.

Example:
feat(api): add batch synthesis endpoint
fix(ui): resolve audio playback on mobile
perf(models): optimize CUDA graph compilation
```