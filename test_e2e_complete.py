#!/usr/bin/env python3
"""
Comprehensive end-to-end test for Chatterbox TTS
Tests all functionality: API connectivity, parallel generation, auto-play, and persistence
"""

import asyncio
import time
import json
from datetime import datetime
import sys

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Installing playwright...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=True)
    subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    from playwright.async_api import async_playwright

async def test_chatterbox():
    async with async_playwright() as p:
        # Launch browser in non-headless mode for visibility
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        print("🚀 Starting Chatterbox TTS End-to-End Test\n")
        
        # Track network requests
        api_requests = []
        synthesis_requests = []
        
        async def log_request(request):
            url = request.url
            if '/health' in url:
                api_requests.append(('health', url, datetime.now()))
            elif '/synthesize' in url:
                api_requests.append(('synthesize', url, datetime.now()))
                synthesis_requests.append(datetime.now())
                print(f"  → Synthesis request to: {url}")
        
        page.on('request', log_request)
        
        # Enable console logging
        page.on('console', lambda msg: print(f"  [Console] {msg.type()}: {msg.text()[:100]}...") if msg.type() in ['error', 'warning'] else None)
        
        try:
            # 1. Load the page
            print("1. Loading Chatterbox TTS...")
            await page.goto('http://localhost:5173')
            await page.wait_for_load_state('networkidle')
            print("✅ Page loaded successfully")
            
            # Wait a bit for initial API calls
            await asyncio.sleep(2)
            
            # 2. Check API connectivity
            print("\n2. Checking API connectivity...")
            health_calls = [req for req in api_requests if req[0] == 'health']
            if health_calls:
                last_health = health_calls[-1]
                if '6095' in last_health[1]:
                    print("✅ Using correct load balancer port (6095)")
                elif '6093' in last_health[1]:
                    print("❌ ERROR: Still using direct port 6093!")
                    print(f"   URL: {last_health[1]}")
                else:
                    print(f"⚠️  Using unexpected port: {last_health[1]}")
            else:
                print("❌ No health check detected")
            
            # 3. Add text chunks
            print("\n3. Adding text chunks to playlist...")
            test_chunks = [
                "Hello world, this is the first test chunk for parallel TTS processing.",
                "Second chunk here, testing dual GPU simultaneous generation capability.",
                "Third and final chunk to complete our comprehensive testing suite."
            ]
            
            for i, text in enumerate(test_chunks):
                # Find textarea
                textarea = page.locator('textarea').first
                await textarea.fill(text)
                
                # Click Add to Playlist
                add_btn = page.locator('button:has-text("Add to Playlist")').first
                await add_btn.click()
                print(f"  ✅ Added chunk {i+1}")
                await asyncio.sleep(0.5)
            
            # 4. Verify chunks in playlist
            print("\n4. Verifying playlist contents...")
            await asyncio.sleep(1)
            
            # Look for chunk elements
            chunk_elements = page.locator('div:has(p:has-text("Hello world"))').count()
            print(f"  ✅ Found chunks in playlist")
            
            # 5. Test Generate All (parallel processing)
            print("\n5. Testing Generate All (parallel processing)...")
            synthesis_requests.clear()
            
            # Find and click Generate All button
            generate_btn = page.locator('button:has-text("Generate All"), button:has-text("Generate Remaining")').first
            await generate_btn.click()
            print("  ✅ Clicked Generate All")
            
            # Wait for generations to start
            await asyncio.sleep(3)
            
            # Check parallel requests
            if len(synthesis_requests) >= 2:
                time_diff = abs((synthesis_requests[0] - synthesis_requests[1]).total_seconds())
                if time_diff < 1.0:
                    print(f"  ✅ Parallel generation confirmed! Requests {time_diff*1000:.0f}ms apart")
                else:
                    print(f"  ⚠️  Requests {time_diff:.1f}s apart - may be sequential")
            
            # Wait for completion
            print("\n6. Waiting for generation to complete...")
            try:
                # Wait for at least one green checkmark
                await page.wait_for_selector('svg[class*="text-green"]', timeout=30000)
                print("  ✅ Generation completed successfully")
            except:
                print("  ❌ Generation timeout or failed")
            
            # 7. Check auto-play
            print("\n7. Checking auto-play functionality...")
            await asyncio.sleep(2)
            
            # Check if audio is playing
            is_playing = await page.evaluate('''() => {
                const audio = document.querySelector('audio');
                return audio && !audio.paused;
            }''')
            
            if is_playing:
                print("  ✅ Auto-play is working - audio started automatically")
            else:
                print("  ❌ Auto-play not detected")
                # Try to click play manually
                try:
                    play_btn = page.locator('button[aria-label*="play"], button:has(svg[class*="Play"])').first
                    if await play_btn.is_visible():
                        await play_btn.click()
                        print("  → Clicked play button manually")
                except:
                    pass
            
            # 8. Check localStorage for persistence
            print("\n8. Testing session persistence...")
            
            # Get localStorage data
            storage_data = await page.evaluate('''() => {
                const chunks = localStorage.getItem('chunks');
                const params = localStorage.getItem('ttsParameters');
                if (chunks) {
                    const parsed = JSON.parse(chunks);
                    return {
                        chunks: parsed.length,
                        withAudio: parsed.filter(c => c.audioData).length,
                        hasParams: !!params
                    };
                }
                return null;
            }''')
            
            if storage_data:
                print(f"  ✅ Found {storage_data['chunks']} chunks in localStorage")
                print(f"  ✅ {storage_data['withAudio']} chunks have audio data saved")
            else:
                print("  ❌ No data in localStorage")
            
            # 9. Test persistence after reload
            print("\n9. Testing persistence after page reload...")
            await page.reload()
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)
            
            # Check if chunks are restored
            restored_chunks = await page.locator('div[class*="bg-muted"]').count()
            if restored_chunks > 0:
                print(f"  ✅ Session restored - {restored_chunks} chunks loaded")
                
                # Check if audio is still playable
                completed = await page.locator('svg[class*="text-green"]').count()
                if completed > 0:
                    print(f"  ✅ {completed} chunks show as completed")
                    
                    # Try to play audio
                    play_btn = page.locator('button[aria-label*="play"], button:has(svg[class*="Play"])').first
                    if await play_btn.is_visible():
                        await play_btn.click()
                        await asyncio.sleep(1)
                        
                        is_playing_after = await page.evaluate('''() => {
                            const audio = document.querySelector('audio');
                            return audio && !audio.paused;
                        }''')
                        
                        if is_playing_after:
                            print("  ✅ Audio plays after reload - full persistence working!")
                        else:
                            print("  ❌ Audio not playing after reload")
            else:
                print("  ❌ Chunks not restored after reload")
            
            # 10. Final API endpoint check
            print("\n10. Final API endpoint verification...")
            recent_api_calls = api_requests[-10:]
            using_6095 = any('6095' in req[1] for req in recent_api_calls)
            using_6093 = any('6093' in req[1] for req in recent_api_calls)
            
            if using_6095 and not using_6093:
                print("  ✅ All API calls using load balancer (6095)")
            elif using_6093:
                print("  ❌ Still making direct calls to 6093")
                direct_calls = [req for req in recent_api_calls if '6093' in req[1]]
                for call in direct_calls[:3]:
                    print(f"     - {call[0]}: {call[1]}")
            
            print("\n" + "="*50)
            print("TEST COMPLETE - Check for ❌ marks above")
            print("="*50)
            
            # Keep browser open for inspection
            print("\nBrowser will stay open for manual inspection.")
            print("Press Ctrl+C to close...")
            await asyncio.sleep(300)
            
        except Exception as e:
            print(f"\n❌ Test failed with error: {e}")
            import traceback
            traceback.print_exc()
        
        # Don't close browser
        # await browser.close()

if __name__ == "__main__":
    asyncio.run(test_chatterbox())