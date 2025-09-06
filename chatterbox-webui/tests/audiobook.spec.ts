import { test, expect } from '@playwright/test';

test.describe('Audiobook Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the app
    await page.goto('http://localhost:5175');
    
    // Wait for app to load
    await page.waitForLoadState('networkidle');
    
    // Navigate to audiobook mode
    await page.click('button:has-text("Developer")'); // User menu
    await page.click('text=Audiobook Mode');
    
    // Wait for audiobook page to load
    await page.waitForSelector('text=Advanced Audiobook Studio');
  });

  test('should load audiobook interface', async ({ page }) => {
    // Check that all tabs are visible
    await expect(page.locator('text=Single Voice')).toBeVisible();
    await expect(page.locator('text=Multi-Voice')).toBeVisible();
    await expect(page.locator('text=Batch Processing')).toBeVisible();
  });

  test('should allow text input and generation', async ({ page }) => {
    // Type some text
    const testText = 'This is a test audiobook. It should generate audio properly.';
    await page.fill('textarea', testText);
    
    // Check that generate button is enabled
    const generateButton = page.locator('button:has-text("Generate Audiobook")');
    await expect(generateButton).toBeEnabled();
    
    // Click generate
    await generateButton.click();
    
    // Wait for generation to start
    await expect(page.locator('text=Generating...')).toBeVisible();
    
    // Wait for chunks to appear
    await page.waitForSelector('.space-y-2:has-text("chunk")', { timeout: 30000 });
    
    // Check that generated files section appears
    await expect(page.locator('text=Generated Audio Files')).toBeVisible();
  });

  test('should handle file upload', async ({ page }) => {
    // Create a test file
    const fileName = 'test-audiobook.txt';
    const fileContent = 'Chapter 1\n\nThis is the first chapter of my audiobook.';
    
    // Upload file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });
    
    // Check that text appears in textarea
    await expect(page.locator('textarea')).toHaveValue(fileContent);
    
    // Check that filename is used
    await page.click('button:has-text("Generate Audiobook")');
    await page.waitForSelector('text=Generated Audio Files');
  });

  test('should save and load voice settings', async ({ page }) => {
    // Open voice settings
    await page.click('button:has-text("Settings")');
    
    // Wait for dialog
    await page.waitForSelector('text=Voice Settings');
    
    // Change voice name
    await page.fill('input[id="voice-name"]', 'Test Voice');
    
    // Adjust some sliders
    const speedSlider = page.locator('text=Speed Rate').locator('..').locator('[role="slider"]');
    await speedSlider.click();
    
    // Save settings
    await page.click('button:has-text("Save Settings")');
    
    // Check for success toast
    await expect(page.locator('text=Voice settings saved')).toBeVisible();
  });

  test('should handle multi-voice mode', async ({ page }) => {
    // Switch to multi-voice tab
    await page.click('text=Multi-Voice');
    
    // Add sample text with character dialogue
    const multiVoiceText = `NARRATOR: This is the narrator speaking.
    
JOHN: Hello, I am John.

MARY: And I am Mary.

NARRATOR: They said together.`;
    
    await page.fill('textarea', multiVoiceText);
    
    // Auto-detect characters
    await page.click('button:has-text("Auto-detect Characters")');
    
    // Check that voices were created for each character
    await expect(page.locator('text=NARRATOR Voice')).toBeVisible();
    await expect(page.locator('text=JOHN Voice')).toBeVisible();
    await expect(page.locator('text=MARY Voice')).toBeVisible();
  });

  test('should export audiobook', async ({ page }) => {
    // Add text and generate
    await page.fill('textarea', 'Short test for export.');
    await page.click('button:has-text("Generate Audiobook")');
    
    // Wait for generation to complete
    await page.waitForSelector('text=1 of 1 chunks generated', { timeout: 30000 });
    
    // Test export button
    const exportButton = page.locator('button:has-text("Export Audiobook")');
    await expect(exportButton).toBeEnabled();
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    
    // Check for export progress toast
    await expect(page.locator('text=Concatenating audio files')).toBeVisible();
  });

  test('should persist voice library', async ({ page, context }) => {
    // Add a voice to library
    await page.click('button:has-text("Settings")');
    await page.fill('input[id="voice-name"]', 'Persistent Voice');
    await page.click('button:has-text("Save Settings")');
    
    // Save to library
    await page.click('button:has-text("Settings")');
    await page.click('text=Save to Library');
    
    // Reload page
    await page.reload();
    
    // Navigate back to audiobook mode
    await page.click('button:has-text("Developer")');
    await page.click('text=Audiobook Mode');
    
    // Open voice library
    await page.click('button:has-text("Voice Library")');
    
    // Check that saved voice is there
    await expect(page.locator('text=Persistent Voice')).toBeVisible();
  });

  test('should handle batch processing', async ({ page }) => {
    // Switch to batch tab
    await page.click('text=Batch Processing');
    
    // Upload multiple files
    const files = [
      { name: 'book1.txt', content: 'This is book one.' },
      { name: 'book2.txt', content: 'This is book two.' },
    ];
    
    const fileInput = page.locator('input[type="file"]').last();
    await fileInput.setInputFiles(files.map(f => ({
      name: f.name,
      mimeType: 'text/plain',
      buffer: Buffer.from(f.content)
    })));
    
    // Check that files appear in list
    await expect(page.locator('text=book1.txt')).toBeVisible();
    await expect(page.locator('text=book2.txt')).toBeVisible();
    
    // Start batch processing
    await page.click('button:has-text("Process All Files")');
    
    // Check for processing indicators
    await expect(page.locator('text=Processing 2 files')).toBeVisible();
  });

  test('should show recent projects', async ({ page }) => {
    // Generate an audiobook
    await page.fill('textarea', 'Test project content');
    await page.click('button:has-text("Generate Audiobook")');
    
    // Wait for generation
    await page.waitForSelector('text=Generated Audio Files');
    
    // Check that recent projects section appears
    await expect(page.locator('text=Recent Projects')).toBeVisible();
    
    // Reload and check persistence
    await page.reload();
    await page.click('button:has-text("Developer")');
    await page.click('text=Audiobook Mode');
    
    // Recent projects should still be there
    await expect(page.locator('text=Recent Projects')).toBeVisible();
  });

  test('should handle drag and drop', async ({ page }) => {
    // Create a data transfer with a file
    await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      const dt = new DataTransfer();
      const file = new File(['Drag and drop test content'], 'dragged.txt', { type: 'text/plain' });
      dt.items.add(file);
      
      const dragEvent = new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      });
      
      textarea?.dispatchEvent(dragEvent);
    });
    
    // Wait a bit for the drop to process
    await page.waitForTimeout(500);
    
    // Check that content was loaded
    await expect(page.locator('textarea')).toHaveValue('Drag and drop test content');
  });
});

// Test the full user journey
test('Full audiobook creation journey', async ({ page }) => {
  // 1. Navigate to audiobook mode
  await page.goto('http://localhost:5175');
  await page.click('button:has-text("Developer")');
  await page.click('text=Audiobook Mode');
  
  // 2. Upload a file
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'my-story.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`Chapter 1: The Beginning

Once upon a time, there was a developer who needed to test their audiobook application.

Chapter 2: The Implementation

They wrote comprehensive tests to ensure everything worked perfectly.`)
  });
  
  // 3. Configure voice settings
  await page.click('button:has-text("Settings")');
  await page.fill('input[id="voice-name"]', 'Story Narrator');
  
  // Adjust speed
  const speedValue = page.locator('text=Speed Rate').locator('..').locator('.text-xs');
  await expect(speedValue).toContainText('1.0x');
  
  await page.click('button:has-text("Save Settings")');
  
  // 4. Generate audiobook
  await page.click('button:has-text("Generate Audiobook")');
  
  // 5. Wait for generation
  await page.waitForSelector('text=Generated Audio Files', { timeout: 60000 });
  
  // 6. Check chunks are generated
  const chunks = page.locator('.space-y-2:has-text("Chapter")');
  await expect(chunks).toHaveCount(2);
  
  // 7. Play a chunk
  const playButton = page.locator('button[title="Play"]').first();
  await playButton.click();
  
  // 8. Export the audiobook
  const exportButton = page.locator('button:has-text("Export Audiobook")');
  
  // Wait for all chunks to be completed
  await page.waitForSelector('text=2 of 2 chunks generated', { timeout: 60000 });
  
  // Set up download listener
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  
  // 9. Verify export completes
  await expect(page.locator('text=Export complete')).toBeVisible({ timeout: 30000 });
  
  // 10. Check recent projects
  await expect(page.locator('text=my-story')).toBeVisible();
});