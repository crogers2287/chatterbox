import { test, expect } from '@playwright/test';

test('app loads', async ({ page }) => {
  await page.goto('http://localhost:5175');
  
  // Check if we're automatically logged in
  await expect(page.locator('button:has-text("Developer")')).toBeVisible({ timeout: 30000 });
});

test('can navigate to audiobook mode', async ({ page }) => {
  await page.goto('http://localhost:5175');
  
  // Click user menu
  await page.click('button:has-text("Developer")');
  
  // Click audiobook mode
  await page.click('text=Audiobook Mode');
  
  // Should navigate to audiobook page
  await expect(page).toHaveURL(/.*\/audiobook/);
  
  // Should see audiobook generator title
  await expect(page.locator('h1:has-text("Advanced Audiobook Studio")')).toBeVisible();
});