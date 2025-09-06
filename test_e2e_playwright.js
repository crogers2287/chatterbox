const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('Starting end-to-end test of Chatterbox TTS...\n');

  try {
    // 1. Load the page
    console.log('1. Loading page...');
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    console.log('✅ Page loaded');

    // 2. Check API connectivity by monitoring network
    console.log('\n2. Checking API connectivity...');
    const healthRequest = page.waitForRequest(req => req.url().includes('/health'), { timeout: 5000 });
    await page.reload();
    const health = await healthRequest;
    console.log(`✅ Health check to: ${health.url()}`);
    
    if (health.url().includes('6095')) {
      console.log('✅ Using correct load balancer port (6095)');
    } else if (health.url().includes('6093')) {
      console.log('❌ Still using direct port 6093 - need to fix');
    }

    // 3. Add text chunks
    console.log('\n3. Adding text chunks...');
    const texts = [
      "Hello, this is the first test chunk for parallel processing.",
      "This is the second chunk that should process simultaneously.",
      "The third chunk demonstrates our dual GPU capability."
    ];

    for (let i = 0; i < texts.length; i++) {
      // Find the textarea
      const textarea = await page.locator('textarea').first();
      await textarea.fill(texts[i]);
      
      // Click Add to Playlist button
      const addButton = await page.locator('button:has-text("Add to Playlist")').first();
      await addButton.click();
      console.log(`✅ Added chunk ${i + 1}`);
      await page.waitForTimeout(500);
    }

    // 4. Check chunks are in playlist
    console.log('\n4. Verifying playlist...');
    const chunkElements = await page.locator('[class*="pending"]').count();
    console.log(`✅ Found ${chunkElements} chunks in playlist`);

    // 5. Test Generate All
    console.log('\n5. Testing Generate All...');
    
    // Set up network monitoring
    let synthesisCount = 0;
    let parallelRequests = [];
    
    page.on('request', request => {
      if (request.url().includes('/synthesize')) {
        synthesisCount++;
        parallelRequests.push({
          time: Date.now(),
          url: request.url()
        });
        console.log(`  → Synthesis request ${synthesisCount} to: ${request.url()}`);
      }
    });

    // Click Generate All button
    const generateAllButton = await page.locator('button:has-text("Generate All")').first();
    await generateAllButton.click();
    console.log('✅ Clicked Generate All');

    // Wait for generations to complete
    console.log('\n6. Monitoring generation progress...');
    
    // Wait for at least one completed chunk
    await page.waitForSelector('[class*="completed"]', { timeout: 30000 });
    
    // Check if we had parallel requests
    if (parallelRequests.length >= 2) {
      const timeDiff = Math.abs(parallelRequests[0].time - parallelRequests[1].time);
      if (timeDiff < 1000) { // Within 1 second
        console.log('✅ Parallel generation confirmed - requests were simultaneous');
      } else {
        console.log(`⚠️  Requests were ${timeDiff}ms apart - may not be truly parallel`);
      }
    }

    // 7. Check auto-play
    console.log('\n7. Checking auto-play...');
    await page.waitForTimeout(2000);
    
    // Check if audio element exists and is playing
    const isPlaying = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return audio && !audio.paused;
    });
    
    if (isPlaying) {
      console.log('✅ Auto-play is working');
    } else {
      console.log('❌ Auto-play not detected');
    }

    // 8. Test session persistence
    console.log('\n8. Testing session persistence...');
    
    // Save current state
    const chunksBeforeReload = await page.evaluate(() => {
      const stored = localStorage.getItem('chunks');
      return stored ? JSON.parse(stored).length : 0;
    });
    console.log(`  Chunks in localStorage: ${chunksBeforeReload}`);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check if chunks persist
    const chunksAfterReload = await page.locator('[class*="completed"]').count();
    if (chunksAfterReload > 0) {
      console.log(`✅ Session persisted - ${chunksAfterReload} completed chunks restored`);
    } else {
      console.log('❌ Session not persisted properly');
    }

    // 9. Test audio playback after reload
    console.log('\n9. Testing audio playback after reload...');
    const playButton = await page.locator('button[aria-label*="play"]').first();
    if (await playButton.isVisible()) {
      await playButton.click();
      await page.waitForTimeout(1000);
      
      const isPlayingAfterReload = await page.evaluate(() => {
        const audio = document.querySelector('audio');
        return audio && !audio.paused;
      });
      
      if (isPlayingAfterReload) {
        console.log('✅ Audio plays after reload - persistence working');
      } else {
        console.log('❌ Audio not playing after reload');
      }
    }

    console.log('\n=== TEST SUMMARY ===');
    console.log('Most critical features tested. Check console output above for any ❌ marks.');

  } catch (error) {
    console.error('Test failed with error:', error);
  }

  // Keep browser open for manual inspection
  console.log('\nBrowser will remain open for manual inspection. Close when done.');
  // await browser.close();
})();