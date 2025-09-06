import { test, expect } from '@playwright/test';

// Test configuration
const API_PORT = 6095; // Load balancer port
const TEST_TEXTS = [
  'Hello, this is the first chunk.',
  'This is the second chunk of text.',
  'And this is the third and final chunk.'
];

test.describe('Chatterbox TTS Web UI - Comprehensive Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console log monitoring
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      // Log console messages for debugging
      if (type === 'error') {
        console.error(`[Browser Error] ${text}`);
      } else if (type === 'warning') {
        console.warn(`[Browser Warning] ${text}`);
      } else if (text.includes('[Playlist]') || text.includes('[API]') || text.includes('[ChunkStreamingPlayer]')) {
        console.log(`[Browser] ${text}`);
      }
    });

    // Monitor network errors
    page.on('requestfailed', request => {
      console.error(`[Network Failed] ${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });

    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('[data-testid="text-input"], textarea', { timeout: 10000 });
  });

  test('1. Verify correct API endpoint connection (port 6095)', async ({ page }) => {
    // Take initial screenshot
    await page.screenshot({ path: 'screenshots/01-initial-load.png', fullPage: true });

    // Monitor network requests to verify correct API endpoint
    const apiRequests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('api') || url.includes(':609')) {
        apiRequests.push(url);
        console.log(`[API Request] ${request.method()} ${url}`);
      }
    });

    // Trigger an API call by adding text
    const textInput = await page.locator('textarea').first();
    await textInput.fill('Test API connection');
    
    // Click "Add to Playlist" button
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    await addButton.click();
    
    // Wait a moment for any API calls
    await page.waitForTimeout(1000);
    
    // Verify we're using the correct port
    const incorrectPorts = apiRequests.filter(url => url.includes(':6093') || url.includes(':6094'));
    const correctPort = apiRequests.filter(url => url.includes(':6095'));
    
    expect(incorrectPorts.length).toBe(0);
    expect(correctPort.length).toBeGreaterThan(0);
    
    console.log(`[Test Result] Found ${correctPort.length} requests to port 6095 (load balancer)`);
    console.log(`[Test Result] Found ${incorrectPorts.length} requests to wrong ports (should be 0)`);
    
    await page.screenshot({ path: 'screenshots/02-api-verification.png', fullPage: true });
  });

  test('2. Add text chunks to playlist', async ({ page }) => {
    const textInput = await page.locator('textarea').first();
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    
    // Add multiple chunks
    for (let i = 0; i < TEST_TEXTS.length; i++) {
      await textInput.fill(TEST_TEXTS[i]);
      await addButton.click();
      
      // Verify chunk appears in playlist
      await expect(page.locator(`text="${TEST_TEXTS[i]}"`)).toBeVisible({ timeout: 5000 });
    }
    
    // Verify all chunks are present
    const chunkElements = await page.locator('[data-testid="chunk-item"], .p-4.bg-muted\\/50').count();
    expect(chunkElements).toBe(TEST_TEXTS.length);
    
    await page.screenshot({ path: 'screenshots/03-chunks-added.png', fullPage: true });
  });

  test('3. Test Generate All with parallel processing', async ({ page }) => {
    // Add multiple chunks first
    const textInput = await page.locator('textarea').first();
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    
    for (const text of TEST_TEXTS) {
      await textInput.fill(text);
      await addButton.click();
    }
    
    // Monitor network requests to verify parallel processing
    let concurrentRequests = 0;
    let maxConcurrentRequests = 0;
    const synthesisRequests: { url: string; timestamp: number }[] = [];
    
    page.on('request', request => {
      if (request.url().includes('/synthesize')) {
        concurrentRequests++;
        maxConcurrentRequests = Math.max(maxConcurrentRequests, concurrentRequests);
        synthesisRequests.push({
          url: request.url(),
          timestamp: Date.now()
        });
        console.log(`[Synthesis Request] Started - Concurrent: ${concurrentRequests}`);
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/synthesize')) {
        concurrentRequests--;
        console.log(`[Synthesis Response] Completed - Status: ${response.status()}`);
      }
    });
    
    // Click Generate All
    const generateAllButton = await page.locator('button:has-text("Generate All")').first();
    await generateAllButton.click();
    
    await page.screenshot({ path: 'screenshots/04-generating-start.png', fullPage: true });
    
    // Wait for generation to complete (with longer timeout)
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll('.animate-spin');
        return spinners.length === 0;
      },
      { timeout: 60000 }
    );
    
    // Verify parallel processing occurred
    console.log(`[Test Result] Max concurrent requests: ${maxConcurrentRequests}`);
    expect(maxConcurrentRequests).toBeGreaterThanOrEqual(2); // Should use both GPUs
    
    // Verify all chunks completed
    const completedChunks = await page.locator('[data-testid="status-completed"], .text-green-600').count();
    expect(completedChunks).toBe(TEST_TEXTS.length);
    
    await page.screenshot({ path: 'screenshots/05-generation-complete.png', fullPage: true });
  });

  test('4. Verify auto-play functionality', async ({ page }) => {
    // Add a single chunk
    const textInput = await page.locator('textarea').first();
    await textInput.fill('Testing auto-play functionality');
    
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    await addButton.click();
    
    // Monitor for audio playback
    let audioPlayed = false;
    
    await page.exposeFunction('onAudioPlay', () => {
      audioPlayed = true;
      console.log('[Audio] Playback started - auto-play working!');
    });
    
    await page.evaluate(() => {
      // Override play method on all audio elements
      const originalPlay = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function() {
        (window as any).onAudioPlay();
        return originalPlay.call(this);
      };
    });
    
    // Generate the chunk
    const generateButton = await page.locator('button[title*="Generate"], button:has(.lucide-play)').first();
    await generateButton.click();
    
    // Wait for generation and auto-play
    await page.waitForTimeout(10000); // Give time for generation and playback
    
    expect(audioPlayed).toBe(true);
    
    await page.screenshot({ path: 'screenshots/06-autoplay-test.png', fullPage: true });
  });

  test('5. Test session saving and loading', async ({ page }) => {
    // Add chunks and generate audio
    const textInput = await page.locator('textarea').first();
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    
    // Add test chunk
    await textInput.fill('Session persistence test chunk');
    await addButton.click();
    
    // Generate audio
    const generateButton = await page.locator('button[title*="Generate"], button:has(.lucide-play)').first();
    await generateButton.click();
    
    // Wait for generation
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 30000 }
    );
    
    await page.screenshot({ path: 'screenshots/07-before-reload.png', fullPage: true });
    
    // Get session data from localStorage
    const sessionData = await page.evaluate(() => {
      const storage = window.localStorage;
      return {
        chunks: storage.getItem('chunks'),
        parameters: storage.getItem('ttsParameters'),
        sessions: storage.getItem('sessions')
      };
    });
    
    console.log('[Session Data] Chunks stored:', !!sessionData.chunks);
    console.log('[Session Data] Parameters stored:', !!sessionData.parameters);
    
    // Reload the page
    await page.reload();
    
    // Wait for app to reinitialize
    await page.waitForSelector('[data-testid="text-input"], textarea', { timeout: 10000 });
    
    // Verify chunks are restored
    await expect(page.locator('text="Session persistence test chunk"')).toBeVisible({ timeout: 5000 });
    
    // Check if audio is still available
    const playButtons = await page.locator('button[title*="Play"], button:has(.lucide-play)').count();
    expect(playButtons).toBeGreaterThan(0);
    
    // Try to play restored audio
    const firstPlayButton = await page.locator('button[title*="Play"], button:has(.lucide-play)').first();
    await firstPlayButton.click();
    
    await page.screenshot({ path: 'screenshots/08-after-reload.png', fullPage: true });
  });

  test('6. Check for console and network errors', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const networkErrors: string[] = [];
    
    // Collect all errors and warnings
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });
    
    page.on('requestfailed', request => {
      networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    
    // Perform basic operations
    const textInput = await page.locator('textarea').first();
    await textInput.fill('Error checking test');
    
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    await addButton.click();
    
    // Open network debug panel if available
    const networkDebugButton = page.locator('button:has-text("Network Debug")');
    if (await networkDebugButton.count() > 0) {
      await networkDebugButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'screenshots/09-network-debug.png', fullPage: true });
    }
    
    // Final screenshot with devtools
    await page.screenshot({ path: 'screenshots/10-final-state.png', fullPage: true });
    
    // Report findings
    console.log('\n=== Error Report ===');
    console.log(`Console Errors: ${errors.length}`);
    errors.forEach(err => console.log(`  - ${err}`));
    
    console.log(`\nConsole Warnings: ${warnings.length}`);
    warnings.forEach(warn => console.log(`  - ${warn}`));
    
    console.log(`\nNetwork Errors: ${networkErrors.length}`);
    networkErrors.forEach(err => console.log(`  - ${err}`));
    
    // The test passes if there are no critical errors
    // Some warnings might be acceptable
    expect(networkErrors.length).toBe(0);
  });

  test('7. Test streaming mode functionality', async ({ page }) => {
    // Enable streaming mode if available
    const streamingSwitch = page.locator('label:has-text("Streaming Mode")').locator('..').locator('button[role="switch"]');
    
    if (await streamingSwitch.count() > 0) {
      await streamingSwitch.click();
      console.log('[Test] Streaming mode enabled');
      
      // Add and generate a chunk with streaming
      const textInput = await page.locator('textarea').first();
      await textInput.fill('Testing streaming synthesis mode');
      
      const addButton = await page.locator('button:has-text("Add to Playlist")').first();
      await addButton.click();
      
      // Monitor streaming chunks
      let streamingChunks = 0;
      page.on('response', async response => {
        if (response.url().includes('/synthesize/stream')) {
          const contentType = response.headers()['content-type'];
          if (contentType?.includes('text/event-stream')) {
            streamingChunks++;
            console.log(`[Streaming] Received chunk ${streamingChunks}`);
          }
        }
      });
      
      // Generate with streaming
      const generateButton = await page.locator('button[title*="Generate"], button:has(.lucide-play)').first();
      await generateButton.click();
      
      // Wait for completion
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: 30000 }
      );
      
      console.log(`[Test Result] Received ${streamingChunks} streaming chunks`);
      await page.screenshot({ path: 'screenshots/11-streaming-mode.png', fullPage: true });
    }
  });

  test('8. Test voice cloning functionality', async ({ page }) => {
    // Check if voice reference upload is available
    const voiceUpload = page.locator('input[type="file"]').first();
    
    if (await voiceUpload.count() > 0) {
      console.log('[Test] Voice cloning interface found');
      
      // Take screenshot of voice interface
      await page.screenshot({ path: 'screenshots/12-voice-interface.png', fullPage: true });
      
      // Note: Actual file upload would require a test audio file
      // For now, we just verify the interface exists
      expect(await voiceUpload.isVisible()).toBe(true);
    }
  });
});

// Additional performance and stress tests
test.describe('Performance and Stress Tests', () => {
  test('Load test with multiple concurrent generations', async ({ page }) => {
    await page.goto('/');
    
    // Add 10 chunks quickly
    const textInput = await page.locator('textarea').first();
    const addButton = await page.locator('button:has-text("Add to Playlist")').first();
    
    for (let i = 0; i < 10; i++) {
      await textInput.fill(`Performance test chunk ${i + 1}`);
      await addButton.click();
    }
    
    // Monitor performance
    const startTime = Date.now();
    
    // Generate all
    const generateAllButton = await page.locator('button:has-text("Generate All")').first();
    await generateAllButton.click();
    
    // Wait for all to complete
    await page.waitForFunction(
      () => {
        const spinners = document.querySelectorAll('.animate-spin');
        return spinners.length === 0;
      },
      { timeout: 120000 }
    );
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log(`[Performance] Generated 10 chunks in ${totalTime.toFixed(2)} seconds`);
    console.log(`[Performance] Average time per chunk: ${(totalTime / 10).toFixed(2)} seconds`);
    
    await page.screenshot({ path: 'screenshots/13-performance-test.png', fullPage: true });
  });
});