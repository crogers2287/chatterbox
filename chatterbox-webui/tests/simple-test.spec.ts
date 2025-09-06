import { test, expect } from '@playwright/test';

test.describe('Chatterbox TTS Quick Test', () => {
  test('Check API connection and basic functionality', async ({ page }) => {
    console.log('1. Loading page...');
    await page.goto('http://localhost:5173');
    
    // Wait for the app to load
    await page.waitForSelector('textarea', { timeout: 10000 });
    
    // Take screenshot of initial state
    await page.screenshot({ path: 'test-screenshots/1-initial.png', fullPage: true });
    
    console.log('2. Checking API URL configuration...');
    const apiUrl = await page.evaluate(() => {
      return (window as any).import?.meta?.env?.VITE_API_URL || 'not found';
    });
    console.log(`   API URL: ${apiUrl}`);
    
    // Monitor network requests
    const apiRequests: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('localhost:609')) {
        apiRequests.push(url);
        console.log(`[API Request] ${request.method()} ${url}`);
      }
    });
    
    console.log('3. Adding text chunk...');
    const textInput = await page.locator('textarea').first();
    await textInput.fill('Hello, this is a test of the Chatterbox system');
    
    const addButton = await page.locator('button:has-text("Add")').first();
    await addButton.click();
    
    // Wait for chunk to appear
    await page.waitForSelector('text=Hello, this is a test', { timeout: 5000 });
    
    await page.screenshot({ path: 'test-screenshots/2-chunk-added.png', fullPage: true });
    
    console.log('4. Testing synthesis...');
    // Look for generate button (could be play icon)
    const generateButtons = await page.locator('button[title*="Generate"], button:has(svg.lucide-play)');
    const generateCount = await generateButtons.count();
    console.log(`   Found ${generateCount} generate buttons`);
    
    if (generateCount > 0) {
      await generateButtons.first().click();
      
      // Wait for generation to start (spinner appears)
      await page.waitForSelector('.animate-spin', { timeout: 5000 });
      console.log('   Generation started...');
      
      // Wait for generation to complete (spinner disappears)
      await page.waitForFunction(
        () => !document.querySelector('.animate-spin'),
        { timeout: 30000 }
      );
      console.log('   Generation completed!');
      
      await page.screenshot({ path: 'test-screenshots/3-generated.png', fullPage: true });
    }
    
    // Check for errors in console
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Final checks
    console.log(`\nAPI Requests made: ${apiRequests.length}`);
    console.log(`Console errors: ${errors.length}`);
    
    // Verify we used the correct API
    const correctApiUsed = apiRequests.some(url => url.includes('localhost:6095'));
    expect(correctApiUsed).toBe(true);
  });
});