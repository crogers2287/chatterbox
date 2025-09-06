#!/usr/bin/env python3
import base64
import asyncio
import aiohttp
import json
import wave
import io

async def test_streaming():
    """Test streaming endpoint and analyze audio chunks"""
    url = "http://localhost:6095/synthesize-stream?text=Hello%20world&chunk_size=50"
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            print(f"Response status: {response.status}")
            print(f"Response headers: {response.headers}")
            
            chunk_count = 0
            total_size = 0
            
            async for line in response.content:
                line = line.decode('utf-8').strip()
                
                if line.startswith("event:"):
                    event_type = line[7:]
                    print(f"\nEvent type: {event_type}")
                    
                elif line.startswith("data:"):
                    data_str = line[5:]
                    try:
                        data = json.loads(data_str)
                        
                        if 'audio_chunk' in data:
                            chunk_count += 1
                            audio_base64 = data['audio_chunk']
                            audio_bytes = base64.b64decode(audio_base64)
                            total_size += len(audio_bytes)
                            
                            # Analyze WAV chunk
                            print(f"\nChunk {chunk_count}:")
                            print(f"  Size: {len(audio_bytes)} bytes")
                            
                            # Check if it's a valid WAV header
                            if len(audio_bytes) > 44:
                                riff = audio_bytes[:4]
                                wave_fmt = audio_bytes[8:12]
                                print(f"  RIFF header: {riff}")
                                print(f"  WAVE format: {wave_fmt}")
                                
                                # Try to open as WAV
                                try:
                                    wav_file = io.BytesIO(audio_bytes)
                                    with wave.open(wav_file, 'rb') as wav:
                                        print(f"  Channels: {wav.getnchannels()}")
                                        print(f"  Sample width: {wav.getsampwidth()}")
                                        print(f"  Framerate: {wav.getframerate()}")
                                        print(f"  Frames: {wav.getnframes()}")
                                        print(f"  Duration: {wav.getnframes() / wav.getframerate():.3f}s")
                                except Exception as e:
                                    print(f"  ERROR parsing WAV: {e}")
                            
                            # Save first chunk for analysis
                            if chunk_count == 1:
                                with open("/tmp/chunk1.wav", "wb") as f:
                                    f.write(audio_bytes)
                                print(f"  Saved first chunk to /tmp/chunk1.wav")
                                
                        elif 'message' in data:
                            print(f"\nMessage: {data['message']}")
                            if 'total_chunks' in data:
                                print(f"Total chunks: {data['total_chunks']}")
                                
                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}")
                        print(f"Data: {data_str[:100]}...")
            
            print(f"\n\nSummary:")
            print(f"Total chunks received: {chunk_count}")
            print(f"Total audio size: {total_size} bytes")

if __name__ == "__main__":
    asyncio.run(test_streaming())