#!/usr/bin/env python3
"""
VibeVoice TTS Integration Module
Provides interface to Microsoft VibeVoice Docker container
"""

import os
import asyncio
import aiohttp
import logging
from typing import Optional, Dict, Any
from pathlib import Path
import tempfile
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


class VibeVoiceClient:
    """Client for interacting with VibeVoice TTS service."""
    
    def __init__(self, base_url: str = "http://localhost:5000", api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
            
    async def initialize(self):
        """Initialize the client session if not using context manager."""
        if not self.session:
            self.session = aiohttp.ClientSession()
            
    async def close(self):
        """Close the client session."""
        if self.session:
            await self.session.close()
            self.session = None
            
    async def health_check(self) -> Dict[str, Any]:
        """Check if VibeVoice service is healthy."""
        try:
            if not self.session:
                await self.initialize()
                
            async with self.session.get(f"{self.base_url}/health") as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    return {"status": "unhealthy", "error": f"HTTP {resp.status}"}
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "error", "error": str(e)}
            
    async def list_voices(self) -> Dict[str, Any]:
        """List available voices in VibeVoice."""
        try:
            if not self.session:
                await self.initialize()
                
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            async with self.session.get(
                f"{self.base_url}/api/voices",
                headers=headers
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    error_text = await resp.text()
                    raise Exception(f"Failed to list voices: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"List voices failed: {e}")
            raise
            
    async def synthesize(
        self,
        text: str,
        voice_id: str = "en-US-JennyNeural",
        speed: float = 1.0,
        pitch: float = 0.0,
        volume: float = 1.0,
        output_format: str = "wav",
        sample_rate: int = 24000,
        **kwargs
    ) -> bytes:
        """
        Synthesize speech using VibeVoice.
        
        Args:
            text: Text to synthesize
            voice_id: Voice identifier (e.g., "en-US-JennyNeural")
            speed: Speech rate multiplier (0.5-2.0)
            pitch: Pitch adjustment in semitones (-12 to 12)
            volume: Volume level (0.0-1.0)
            output_format: Audio format (wav, mp3, ogg)
            sample_rate: Sample rate in Hz
            **kwargs: Additional parameters for VibeVoice
            
        Returns:
            Audio data as bytes
        """
        try:
            if not self.session:
                await self.initialize()
                
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            payload = {
                "text": text,
                "voice": voice_id,
                "speed": speed,
                "pitch": pitch,
                "volume": volume,
                "format": output_format,
                "sample_rate": sample_rate,
                **kwargs
            }
            
            async with self.session.post(
                f"{self.base_url}/api/synthesize",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status == 200:
                    return await resp.read()
                else:
                    error_text = await resp.text()
                    raise Exception(f"Synthesis failed: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            raise
            
    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str = "en-US-JennyNeural",
        speed: float = 1.0,
        pitch: float = 0.0,
        volume: float = 1.0,
        output_format: str = "wav",
        sample_rate: int = 24000,
        chunk_size: int = 4096,
        **kwargs
    ):
        """
        Synthesize speech with streaming response.
        
        Yields audio chunks as they become available.
        """
        try:
            if not self.session:
                await self.initialize()
                
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            payload = {
                "text": text,
                "voice": voice_id,
                "speed": speed,
                "pitch": pitch,
                "volume": volume,
                "format": output_format,
                "sample_rate": sample_rate,
                "stream": True,
                **kwargs
            }
            
            async with self.session.post(
                f"{self.base_url}/api/synthesize/stream",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status == 200:
                    async for chunk in resp.content.iter_chunked(chunk_size):
                        if chunk:
                            yield chunk
                else:
                    error_text = await resp.text()
                    raise Exception(f"Streaming synthesis failed: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"Streaming synthesis failed: {e}")
            raise


class VibeVoiceAdapter:
    """
    Adapter to make VibeVoice compatible with Chatterbox API interface.
    """
    
    def __init__(self, vibevoice_url: str = "http://localhost:5000", api_key: Optional[str] = None):
        self.client = VibeVoiceClient(vibevoice_url, api_key)
        self.voice_mapping = {
            "default": "en-US-JennyNeural",
            "male": "en-US-GuyNeural",
            "female": "en-US-JennyNeural",
            "child": "en-US-AriaNeural",
            "elder": "en-US-DavisNeural"
        }
        
    async def synthesize_compatible(
        self,
        text: str,
        exaggeration: float = 0.5,
        temperature: float = 0.8,
        cfg_weight: float = 0.5,
        min_p: float = 0.05,
        top_p: float = 1.0,
        repetition_penalty: float = 1.2,
        seed: Optional[int] = None,
        speech_rate: float = 1.0,
        voice_preset: str = "default"
    ) -> tuple[bytes, int, float]:
        """
        Synthesize speech with Chatterbox-compatible parameters.
        
        Maps Chatterbox parameters to VibeVoice equivalents.
        
        Returns:
            Tuple of (audio_bytes, sample_rate, duration)
        """
        # Map exaggeration to pitch variation
        pitch = (exaggeration - 0.5) * 4  # Map 0.5 -> 0, 1.0 -> 2, 0.1 -> -1.6
        
        # Map temperature to speaking style variation
        # Higher temperature = more expressive
        style = "cheerful" if temperature > 1.0 else "neutral" if temperature > 0.5 else "calm"
        
        # Get voice ID
        voice_id = self.voice_mapping.get(voice_preset, "en-US-JennyNeural")
        
        # Synthesize
        audio_bytes = await self.client.synthesize(
            text=text,
            voice_id=voice_id,
            speed=speech_rate,
            pitch=pitch,
            style=style,
            sample_rate=24000
        )
        
        # Calculate duration from audio data
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            
            # Read audio info
            data, sr = sf.read(tmp.name)
            duration = len(data) / sr
            
            os.unlink(tmp.name)
            
        return audio_bytes, 24000, duration
        
    async def __aenter__(self):
        await self.client.__aenter__()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.__aexit__(exc_type, exc_val, exc_tb)