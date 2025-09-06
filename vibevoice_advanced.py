#!/usr/bin/env python3
"""
Advanced VibeVoice Integration for Large Model
Provides full feature parity with Chatterbox including voice cloning
"""

import os
import asyncio
import aiohttp
import logging
import base64
from typing import Optional, Dict, Any, List
from pathlib import Path
import tempfile
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


class VibeVoiceLargeClient:
    """Client for VibeVoice Large Model with advanced features."""
    
    def __init__(self, base_url: str = "http://localhost:5000", api_key: Optional[str] = None):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None
        self.model_size = "large"  # Ensure we use large model
        
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
        """Check if VibeVoice service is healthy and using large model."""
        try:
            if not self.session:
                await self.initialize()
                
            async with self.session.get(f"{self.base_url}/health") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    # Verify large model is loaded
                    if data.get('model_size') != 'large':
                        logger.warning(f"VibeVoice is using {data.get('model_size')} model, not large!")
                    return data
                else:
                    return {"status": "unhealthy", "error": f"HTTP {resp.status}"}
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {"status": "error", "error": str(e)}
            
    async def load_model(self, model_size: str = "large") -> Dict[str, Any]:
        """Ensure the large model is loaded."""
        try:
            if not self.session:
                await self.initialize()
                
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            payload = {
                "model_size": model_size,
                "device": "cuda",  # Force GPU
                "enable_voice_cloning": True,
                "enable_style_transfer": True,
                "gpu_offload": "full",  # Full GPU offloading
                "use_fp16": True,  # Use FP16 for better performance
                "enable_cudnn": True,  # Enable cuDNN optimizations
                "torch_compile": True,  # Use torch.compile for faster inference
                "gpu_memory_fraction": 1.0  # Use all available GPU memory
            }
            
            async with self.session.post(
                f"{self.base_url}/api/load_model",
                json=payload,
                headers=headers
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    error_text = await resp.text()
                    raise Exception(f"Failed to load model: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            raise
            
    async def clone_voice(self, audio_file_path: str, voice_name: str) -> Dict[str, Any]:
        """Clone a voice from an audio file (similar to Chatterbox voice reference)."""
        try:
            if not self.session:
                await self.initialize()
                
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            # Read audio file
            with open(audio_file_path, 'rb') as f:
                audio_data = f.read()
                
            # Create multipart form data
            form = aiohttp.FormData()
            form.add_field('audio', audio_data, filename='voice_reference.wav', content_type='audio/wav')
            form.add_field('voice_name', voice_name)
            form.add_field('model_size', 'large')
            form.add_field('gpu_offload', 'full')  # Full GPU offloading for voice cloning
            form.add_field('use_fp16', 'true')  # Use FP16 for better performance
            form.add_field('enable_cudnn', 'true')  # Enable cuDNN optimizations
            
            async with self.session.post(
                f"{self.base_url}/api/clone_voice",
                data=form,
                headers=headers
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    error_text = await resp.text()
                    raise Exception(f"Voice cloning failed: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"Voice cloning failed: {e}")
            raise
            
    async def list_voices(self, include_cloned: bool = True) -> Dict[str, Any]:
        """List all available voices including cloned ones."""
        try:
            if not self.session:
                await self.initialize()
                
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            params = {
                "include_cloned": include_cloned,
                "model_size": "large"
            }
            
            async with self.session.get(
                f"{self.base_url}/api/voices",
                headers=headers,
                params=params
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    error_text = await resp.text()
                    raise Exception(f"Failed to list voices: HTTP {resp.status} - {error_text}")
        except Exception as e:
            logger.error(f"List voices failed: {e}")
            raise
            
    async def synthesize_advanced(
        self,
        text: str,
        voice_id: str = None,
        voice_reference_path: str = None,
        speed: float = 1.0,
        pitch: float = 0.0,
        volume: float = 1.0,
        style: str = "neutral",
        emotion: str = "neutral",
        emotion_intensity: float = 0.5,
        output_format: str = "wav",
        sample_rate: int = 24000,
        enable_ssml: bool = False,
        **kwargs
    ) -> bytes:
        """
        Advanced synthesis with voice cloning and style transfer.
        
        Args:
            text: Text to synthesize
            voice_id: Pre-existing voice ID or cloned voice name
            voice_reference_path: Path to audio file for instant voice cloning
            speed: Speech rate (0.5-2.0)
            pitch: Pitch adjustment (-12 to 12 semitones)
            volume: Volume level (0.0-1.0)
            style: Speaking style (neutral, cheerful, sad, angry, fearful, etc.)
            emotion: Target emotion
            emotion_intensity: Emotion strength (0.0-1.0)
            output_format: Audio format
            sample_rate: Sample rate
            enable_ssml: Parse text as SSML
            **kwargs: Additional model-specific parameters
            
        Returns:
            Audio data as bytes
        """
        try:
            if not self.session:
                await self.initialize()
                
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            # If voice reference is provided, use it for instant cloning
            if voice_reference_path and not voice_id:
                # Clone voice on-the-fly
                clone_result = await self.clone_voice(voice_reference_path, "temp_voice")
                voice_id = clone_result.get("voice_id", "temp_voice")
                
            payload = {
                "text": text,
                "voice": voice_id or "en-US-JennyNeural",
                "model_size": "large",
                "speed": speed,
                "pitch": pitch,
                "volume": volume,
                "style": style,
                "emotion": emotion,
                "emotion_intensity": emotion_intensity,
                "format": output_format,
                "sample_rate": sample_rate,
                "enable_ssml": enable_ssml,
                "gpu_acceleration": True,
                "gpu_offload": "full",  # Full GPU offloading
                "use_fp16": True,  # Use FP16 for better performance
                "enable_cudnn": True,  # Enable cuDNN optimizations
                "torch_compile": True,  # Use torch.compile
                "gpu_memory_fraction": 1.0,  # Use all available GPU memory
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
            logger.error(f"Advanced synthesis failed: {e}")
            raise
            
    async def synthesize_streaming(
        self,
        text: str,
        voice_id: str = None,
        voice_reference_path: str = None,
        chunk_size: int = 4096,
        **kwargs
    ):
        """Streaming synthesis with same parameters as synthesize_advanced."""
        try:
            if not self.session:
                await self.initialize()
                
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
                
            # Handle voice reference for streaming
            if voice_reference_path and not voice_id:
                clone_result = await self.clone_voice(voice_reference_path, "temp_stream_voice")
                voice_id = clone_result.get("voice_id", "temp_stream_voice")
                
            payload = {
                "text": text,
                "voice": voice_id or "en-US-JennyNeural",
                "model_size": "large",
                "stream": True,
                "chunk_size": chunk_size,
                "gpu_acceleration": True,
                "gpu_offload": "full",  # Full GPU offloading
                "use_fp16": True,  # Use FP16 for better performance
                "enable_cudnn": True,  # Enable cuDNN optimizations
                "torch_compile": True,  # Use torch.compile
                "gpu_memory_fraction": 1.0,  # Use all available GPU memory
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


class VibeVoiceLargeAdapter:
    """
    Adapter for VibeVoice Large Model with full Chatterbox compatibility.
    """
    
    def __init__(self, vibevoice_url: str = "http://localhost:5000", api_key: Optional[str] = None):
        self.client = VibeVoiceLargeClient(vibevoice_url, api_key)
        
        # Extended voice mapping for large model
        self.voice_mapping = {
            # Standard voices
            "default": "en-US-JennyNeural",
            "male": "en-US-GuyNeural", 
            "female": "en-US-JennyNeural",
            "child": "en-US-AriaNeural",
            "elder": "en-US-DavisNeural",
            # Additional voices available in large model
            "professional": "en-US-TonyNeural",
            "casual": "en-US-JasonNeural",
            "narrator": "en-US-ChristopherNeural",
            "assistant": "en-US-AshleyNeural",
            "news": "en-US-ElizabethNeural"
        }
        
        # Style mapping from Chatterbox parameters to VibeVoice styles
        self.style_mapping = {
            "neutral": "neutral",
            "happy": "cheerful",
            "sad": "sad",
            "angry": "angry",
            "fearful": "fearful",
            "surprised": "surprised",
            "disgusted": "disgusted"
        }
        
    async def ensure_model_loaded(self):
        """Ensure the large model is loaded on GPU."""
        await self.client.load_model("large")
        
    async def synthesize_compatible(
        self,
        text: str,
        voice_reference_path: Optional[str] = None,
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
        Synthesize speech with full Chatterbox compatibility.
        
        Maps all Chatterbox parameters to VibeVoice Large equivalents.
        """
        # Ensure model is loaded
        await self.ensure_model_loaded()
        
        # Map Chatterbox parameters to VibeVoice
        
        # Exaggeration maps to emotion intensity and pitch variation
        emotion_intensity = min(exaggeration, 1.0)
        pitch = (exaggeration - 0.5) * 6  # Wider range for large model
        
        # Temperature maps to style variation
        if temperature > 1.5:
            style = "cheerful"
            emotion = "happy"
        elif temperature > 1.0:
            style = "friendly"
            emotion = "neutral"
        elif temperature > 0.5:
            style = "neutral" 
            emotion = "neutral"
        else:
            style = "calm"
            emotion = "neutral"
            
        # CFG weight affects voice consistency (higher = more consistent with reference)
        voice_consistency = cfg_weight
        
        # Min_p and top_p affect variation (converted to style diversity)
        style_diversity = 1.0 - min_p
        
        # Repetition penalty affects prosody variation
        prosody_variation = repetition_penalty - 1.0
        
        # Get voice ID from preset or use reference
        voice_id = None
        if voice_preset and voice_preset != "default":
            voice_id = self.voice_mapping.get(voice_preset, "en-US-JennyNeural")
            
        # Synthesize with advanced parameters
        audio_bytes = await self.client.synthesize_advanced(
            text=text,
            voice_id=voice_id,
            voice_reference_path=voice_reference_path,
            speed=speech_rate,
            pitch=pitch,
            style=style,
            emotion=emotion,
            emotion_intensity=emotion_intensity,
            sample_rate=24000,
            # Additional large model parameters
            voice_consistency=voice_consistency,
            style_diversity=style_diversity,
            prosody_variation=prosody_variation,
            seed=seed
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
        
    async def synthesize_streaming_compatible(
        self,
        text: str,
        voice_reference_path: Optional[str] = None,
        chunk_size: int = 4096,
        **kwargs
    ):
        """Streaming synthesis with Chatterbox compatibility."""
        # Map parameters (similar to synthesize_compatible)
        params = self._map_chatterbox_params(**kwargs)
        
        async for chunk in self.client.synthesize_streaming(
            text=text,
            voice_reference_path=voice_reference_path,
            chunk_size=chunk_size,
            **params
        ):
            yield chunk
            
    def _map_chatterbox_params(self, **kwargs) -> Dict[str, Any]:
        """Map Chatterbox parameters to VibeVoice parameters."""
        params = {}
        
        if 'exaggeration' in kwargs:
            params['emotion_intensity'] = min(kwargs['exaggeration'], 1.0)
            params['pitch'] = (kwargs['exaggeration'] - 0.5) * 6
            
        if 'temperature' in kwargs:
            temp = kwargs['temperature']
            if temp > 1.5:
                params['style'] = 'cheerful'
            elif temp > 1.0:
                params['style'] = 'friendly'
            elif temp > 0.5:
                params['style'] = 'neutral'
            else:
                params['style'] = 'calm'
                
        if 'speech_rate' in kwargs:
            params['speed'] = kwargs['speech_rate']
            
        if 'seed' in kwargs:
            params['seed'] = kwargs['seed']
            
        return params
        
    async def __aenter__(self):
        await self.client.__aenter__()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.__aexit__(exc_type, exc_val, exc_tb)