# Chatterbox Testing Guide

## Test Organization

### Backend Tests

```
chatterbox/
├── test_api.py              # API endpoint tests
├── test_streaming.py        # Streaming functionality
├── test_voice_clone.py      # Voice cloning tests
├── test_dual_gpu_performance.py # Performance benchmarks
├── test_integration.py      # End-to-end tests
└── test_inference_speed.py  # Model performance
```

### Frontend Tests

```
chatterbox-webui/tests/
├── basic.spec.ts           # Basic functionality
├── audio-generation.spec.ts # Audio synthesis
├── audiobook.spec.ts       # Audiobook features
├── comprehensive-tts.spec.ts # Full TTS testing
└── simple-test.spec.ts     # Quick smoke tests
```

## Running Tests

### Quick Test Commands

```bash
# Backend unit tests
python test_api.py

# Frontend E2E tests
cd chatterbox-webui
npm run test

# Comprehensive test suite
./run-comprehensive-tests.sh

# Test with UI (interactive)
npm run test:ui

# Debug specific test
npm run test:debug tests/audio-generation.spec.ts
```

### Performance Testing

```bash
# Test inference speed
python test_inference_speed.py

# Dual GPU performance
python test_dual_gpu_performance.py

# Streaming performance
python test_streaming.py --benchmark

# Load testing
python test_parallel_generation.py --requests 100
```

## Writing Tests

### Backend Test Structure

```python
import unittest
import requests
import time

class TestChatterboxAPI(unittest.TestCase):
    BASE_URL = "http://localhost:6095"
    
    def setUp(self):
        """Setup before each test"""
        self.session = requests.Session()
        self.wait_for_server()
    
    def wait_for_server(self, timeout=30):
        """Wait for API server to be ready"""
        start = time.time()
        while time.time() - start < timeout:
            try:
                resp = self.session.get(f"{self.BASE_URL}/health")
                if resp.status_code == 200:
                    return
            except:
                pass
            time.sleep(1)
        raise TimeoutError("Server not ready")
    
    def test_synthesis_basic(self):
        """Test basic text synthesis"""
        response = self.session.post(
            f"{self.BASE_URL}/synthesize",
            data={"text": "Test synthesis"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("audio_url", data)
```

### Frontend Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Audio Generation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    
    // Wait for app to load
    await page.waitForSelector('[data-testid="text-input"]');
  });
  
  test('should generate audio from text', async ({ page }) => {
    // Enter text
    await page.fill('[data-testid="text-input"]', 'Test audio generation');
    
    // Click generate
    await page.click('button:has-text("Generate")');
    
    // Wait for audio
    await page.waitForSelector('audio', { timeout: 30000 });
    
    // Verify audio element
    const audio = await page.locator('audio');
    await expect(audio).toBeVisible();
    
    // Check audio source
    const src = await audio.getAttribute('src');
    expect(src).toBeTruthy();
  });
});
```

## Test Categories

### 1. Unit Tests

**Backend Model Tests**:
```python
def test_tokenizer():
    """Test text tokenization"""
    from chatterbox.models.tokenizers import Tokenizer
    tokenizer = Tokenizer()
    tokens = tokenizer.encode("Hello world")
    assert len(tokens) > 0
    assert isinstance(tokens, list)

def test_voice_encoder():
    """Test voice embedding extraction"""
    from chatterbox.models.voice_encoder import VoiceEncoder
    encoder = VoiceEncoder()
    # Load test audio
    embedding = encoder.encode("test_audio.wav")
    assert embedding.shape[0] == 512  # Expected dimension
```

**Frontend Component Tests**:
```typescript
// Using React Testing Library
import { render, fireEvent } from '@testing-library/react';
import { TTSParameters } from '@/components/TTSParameters';

test('parameter sliders update values', () => {
  const onUpdate = jest.fn();
  const { getByLabelText } = render(
    <TTSParameters onUpdate={onUpdate} />
  );
  
  const tempSlider = getByLabelText('Temperature');
  fireEvent.change(tempSlider, { target: { value: '0.9' } });
  
  expect(onUpdate).toHaveBeenCalledWith({
    temperature: 0.9
  });
});
```

### 2. Integration Tests

**API Integration**:
```python
def test_full_synthesis_flow():
    """Test complete synthesis pipeline"""
    # 1. Upload voice sample
    with open("test_voice.wav", "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/voice-clone",
            files={"audio_file": f},
            data={"name": "Test Voice"}
        )
    voice_id = resp.json()["voice_id"]
    
    # 2. Synthesize with cloned voice
    resp = requests.post(
        f"{BASE_URL}/synthesize",
        data={
            "text": "Testing voice clone",
            "voice_id": voice_id
        }
    )
    assert resp.json()["success"]
    
    # 3. Verify audio
    audio_url = resp.json()["audio_url"]
    audio_resp = requests.get(f"{BASE_URL}{audio_url}")
    assert audio_resp.status_code == 200
    assert len(audio_resp.content) > 1000  # Non-empty audio
```

**UI Flow Tests**:
```typescript
test('complete audiobook generation flow', async ({ page }) => {
  // Navigate to audiobook section
  await page.click('[data-testid="audiobook-tab"]');
  
  // Create project
  await page.fill('[name="project-name"]', 'Test Book');
  await page.click('button:has-text("Create Project")');
  
  // Add chapter
  await page.fill('[name="chapter-title"]', 'Chapter 1');
  await page.fill('[name="chapter-content"]', 'Chapter content...');
  await page.click('button:has-text("Add Chapter")');
  
  // Generate audiobook
  await page.click('button:has-text("Generate All")');
  
  // Wait for completion
  await page.waitForSelector(
    'text=Generation complete',
    { timeout: 60000 }
  );
});
```

### 3. Performance Tests

**Latency Testing**:
```python
def test_synthesis_latency():
    """Measure synthesis response time"""
    latencies = []
    
    for i in range(10):
        start = time.time()
        resp = requests.post(
            f"{BASE_URL}/synthesize",
            data={"text": "Latency test"}
        )
        latency = time.time() - start
        latencies.append(latency)
    
    avg_latency = sum(latencies) / len(latencies)
    print(f"Average latency: {avg_latency:.3f}s")
    assert avg_latency < 2.0  # Should be under 2 seconds
```

**Throughput Testing**:
```python
import concurrent.futures

def test_concurrent_requests():
    """Test handling multiple simultaneous requests"""
    def make_request(i):
        return requests.post(
            f"{BASE_URL}/synthesize",
            data={"text": f"Request {i}"}
        )
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(make_request, i) for i in range(50)]
        results = [f.result() for f in futures]
    
    success_count = sum(1 for r in results if r.json()["success"])
    assert success_count >= 45  # Allow some failures under load
```

### 4. Stress Tests

**Memory Leak Detection**:
```python
def test_memory_stability():
    """Check for memory leaks over many requests"""
    import psutil
    process = psutil.Process()
    
    initial_memory = process.memory_info().rss / 1e9  # GB
    
    for i in range(100):
        resp = requests.post(
            f"{BASE_URL}/synthesize",
            data={"text": "Memory test"}
        )
        assert resp.status_code == 200
    
    final_memory = process.memory_info().rss / 1e9
    memory_increase = final_memory - initial_memory
    
    print(f"Memory increase: {memory_increase:.2f} GB")
    assert memory_increase < 1.0  # Should not leak > 1GB
```

## Test Data

### Test Audio Files

```bash
# Generate test audio files
test_audio/
├── male_voice.wav      # Male voice sample
├── female_voice.wav    # Female voice sample
├── child_voice.wav     # Child voice sample
├── noisy_audio.wav     # Audio with background noise
└── long_audio.wav      # 30+ second sample
```

### Test Text Corpus

```python
TEST_TEXTS = [
    "Hello, this is a test.",  # Basic
    "The quick brown fox jumps over the lazy dog.",  # Pangram
    "Testing 123, one two three!",  # Numbers and punctuation
    "こんにちは",  # Unicode (Japanese)
    "This is a very long text that tests the system's ability to handle "
    "extended passages with multiple sentences and complex punctuation.",
    # Edge cases
    "",  # Empty string
    " ",  # Whitespace only
    "!@#$%^&*()",  # Special characters
]
```

## Debugging Failed Tests

### Backend Debugging

```bash
# Run with verbose output
python test_api.py -v

# Run specific test method
python -m unittest test_api.TestChatterboxAPI.test_synthesis_basic

# Enable debug logging
LOG_LEVEL=DEBUG python test_api.py

# Check server logs during test
tail -f logs/gpu0_server.log
```

### Frontend Debugging

```bash
# Run in headed mode (see browser)
npm run test -- --headed

# Debug mode (opens Playwright inspector)
npm run test:debug

# Generate trace on failure
npm run test -- --trace on-first-retry

# View test report
npm run test -- --reporter=html
npx playwright show-report
```

### Common Issues

1. **Server not ready**:
   ```python
   # Add retry logic
   @retry(tries=3, delay=2)
   def test_with_retry():
       # Test code
   ```

2. **GPU memory errors**:
   ```python
   def setUp(self):
       # Clear GPU memory before test
       if torch.cuda.is_available():
           torch.cuda.empty_cache()
   ```

3. **Flaky UI tests**:
   ```typescript
   // Add explicit waits
   await page.waitForLoadState('networkidle');
   await page.waitForSelector('.element', { state: 'visible' });
   ```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.8'
      - name: Install dependencies
        run: pip install -r requirements.txt
      - name: Run tests
        run: python -m pytest tests/
  
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd chatterbox-webui && npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Run tests
        run: cd chatterbox-webui && npm test
```

## Test Coverage

### Measuring Coverage

```bash
# Backend coverage
pip install pytest-cov
pytest --cov=chatterbox --cov-report=html

# Frontend coverage
npm run test -- --coverage
```

### Coverage Goals

- **Critical paths**: 90%+ coverage
- **API endpoints**: 100% coverage
- **UI components**: 80%+ coverage
- **Error handling**: 100% coverage