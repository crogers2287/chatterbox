import { test, expect } from '@playwright/test';

test.describe('Audio Generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5175/audiobook');
    await page.waitForSelector('text=Advanced Audiobook Studio');
  });

  test('should generate audio from text', async ({ page }) => {
    // Enter text
    const testText = 'This is a test. It should generate audio.';
    await page.fill('textarea', testText);
    
    // Generate audio
    const generateButton = page.locator('button:has-text("Generate Audiobook")');
    await generateButton.click();
    
    // Wait for generation to start
    await expect(page.locator('text=Generating...')).toBeVisible();
    
    // Wait for generated files section
    await expect(page.locator('text=Generated Audio Files')).toBeVisible({ timeout: 30000 });
    
    // Should show 1 chunk
    await expect(page.locator('text=1 of 1 chunks generated')).toBeVisible({ timeout: 30000 });
    
    // Check that chunk has completed status
    await expect(page.locator('[data-testid="chunk-status-completed"]').first()).toBeVisible();
  });

  test('should play generated audio', async ({ page }) => {
    // Generate audio first
    await page.fill('textarea', 'Test audio playback.');
    await page.click('button:has-text("Generate Audiobook")');
    
    // Wait for generation to complete
    await page.waitForSelector('text=1 of 1 chunks generated', { timeout: 30000 });
    
    // Find play button
    const playButton = page.locator('button[title="Play"]').first();
    await expect(playButton).toBeVisible();
    
    // Click play button - should not throw error
    await playButton.click();
    
    // No error toast should appear
    await expect(page.locator('text=Playback failed')).not.toBeVisible({ timeout: 2000 });
  });

  test('should export generated audiobook', async ({ page }) => {
    // Generate audio
    await page.fill('textarea', 'Export test content.');
    await page.click('button:has-text("Generate Audiobook")');
    
    // Wait for generation
    await page.waitForSelector('text=1 of 1 chunks generated', { timeout: 30000 });
    
    // Export button should be enabled
    const exportButton = page.locator('button:has-text("Export Audiobook")');
    await expect(exportButton).toBeEnabled();
    
    // Click export
    await exportButton.click();
    
    // Should show concatenating toast
    await expect(page.locator('text=Concatenating audio files')).toBeVisible();
    
    // Should show success toast (downloads might be blocked in test environment)
    await expect(page.locator('text=Export complete')).toBeVisible({ timeout: 30000 });
  });

  test('should regenerate chunk', async ({ page }) => {
    // Generate audio
    await page.fill('textarea', 'Regeneration test.');
    await page.click('button:has-text("Generate Audiobook")');
    
    // Wait for generation
    await page.waitForSelector('text=1 of 1 chunks generated', { timeout: 30000 });
    
    // Find regenerate button
    const regenerateButton = page.locator('button[title="Regenerate"]').first();
    await regenerateButton.click();
    
    // Should show generating status again
    await expect(page.locator('[data-testid="chunk-status-generating"]').first()).toBeVisible();
    
    // Should complete again
    await expect(page.locator('[data-testid="chunk-status-completed"]').first()).toBeVisible({ timeout: 30000 });
    
    // Should show success toast
    await expect(page.locator('text=Chunk regenerated')).toBeVisible();
  });

  test('should handle generation errors gracefully', async ({ page }) => {
    // Enter very long text that might cause issues
    const longText = 'This is a test. '.repeat(100);
    await page.fill('textarea', longText);
    
    // Try to generate
    await page.click('button:has-text("Generate Audiobook")');
    
    // Should show some progress
    await expect(page.locator('text=Generated Audio Files')).toBeVisible({ timeout: 30000 });
    
    // Should eventually show some completed chunks or handle gracefully
    const completedChunks = page.locator('[data-testid="chunk-status-completed"]');
    const errorChunks = page.locator('[data-testid="chunk-status-error"]');
    
    // Wait for at least one chunk to finish (either success or error)
    await page.waitForTimeout(5000);
    
    const completedCount = await completedChunks.count();
    const errorCount = await errorChunks.count();
    
    // Should have processed at least one chunk
    expect(completedCount + errorCount).toBeGreaterThan(0);
  });
});