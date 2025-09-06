const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('[Browser]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[Page Error]', err));
  
  console.log('1. Loading page...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'quick-test-1-loaded.png', fullPage: true });
  
  console.log('2. Looking for text input...');
  const textareas = await page.locator('textarea').count();
  console.log(`   Found ${textareas} textarea elements`);
  
  if (textareas > 0) {
    console.log('3. Adding text to first textarea...');
    await page.locator('textarea').first().fill('Quick test of the system');
    
    console.log('4. Looking for Add button...');
    const addButtons = await page.locator('button:has-text("Add")').count();
    console.log(`   Found ${addButtons} Add buttons`);
    
    if (addButtons > 0) {
      await page.locator('button:has-text("Add")').first().click();
      await page.waitForTimeout(1000);
    }
  }
  
  // Check localStorage
  const storage = await page.evaluate(() => {
    return {
      chunks: localStorage.getItem('chunks'),
      apiUrl: localStorage.getItem('apiUrl')
    };
  });
  console.log('5. LocalStorage:', storage);
  
  // Check what API URL the app is using
  const apiInfo = await page.evaluate(() => {
    return {
      viteApiUrl: import.meta.env.VITE_API_URL,
      windowLocation: window.location.href
    };
  });
  console.log('6. API Configuration:', apiInfo);
  
  await page.screenshot({ path: 'quick-test-2-final.png', fullPage: true });
  
  await browser.close();
})();