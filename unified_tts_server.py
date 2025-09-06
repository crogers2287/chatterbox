#!/usr/bin/env python3
"""
Unified TTS API Server
Supports both Chatterbox and VibeVoice TTS engines
"""

import os
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Literal
from contextlib import asynccontextmanager
from enum import Enum

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from chatterbox.tts import ChatterboxTTS
from vibevoice_integration import VibeVoiceAdapter
from voice_storage import voice_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TTS Engine Enum
class TTSEngine(str, Enum):
    CHATTERBOX = "chatterbox"
    VIBEVOICE = "vibevoice"

# Global instances
chatterbox_model: Optional[ChatterboxTTS] = None
vibevoice_adapter: Optional[VibeVoiceAdapter] = None
default_engine = TTSEngine.CHATTERBOX

# GPU Configuration for Chatterbox
if torch.cuda.is_available():
    gpu_id = int(os.environ.get("CUDA_VISIBLE_DEVICES", "0"))
    DEVICE = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    logger.info(f"Using GPU: {torch.cuda.get_device_name(gpu_id)}")
else:
    DEVICE = "cpu"
    logger.warning("CUDA not available, using CPU")


# Pydantic Models
class UnifiedTTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize", max_length=5000)
    engine: TTSEngine = Field(default=TTSEngine.CHATTERBOX, description="TTS engine to use")
    exaggeration: float = Field(0.5, description="Voice exaggeration level", ge=0.1, le=2.0)
    temperature: float = Field(0.8, description="Sampling temperature", ge=0.05, le=5.0)
    cfg_weight: float = Field(0.5, description="Classifier-free guidance weight", ge=0.0, le=1.0)
    min_p: float = Field(0.05, description="Minimum probability threshold", ge=0.0, le=1.0)
    top_p: float = Field(1.0, description="Top-p sampling", ge=0.0, le=1.0)
    repetition_penalty: float = Field(1.2, description="Repetition penalty", ge=1.0, le=2.0)
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    speech_rate: float = Field(1.0, description="Speech rate multiplier", ge=0.5, le=2.0)
    voice_preset: str = Field("default", description="Voice preset for VibeVoice")


class UnifiedTTSResponse(BaseModel):
    success: bool
    message: str
    audio_url: Optional[str] = None
    duration: Optional[float] = None
    sample_rate: int
    parameters: Dict[str, Any]
    engine_used: TTSEngine
    inference_speed: Optional[float] = None


class EngineStatusResponse(BaseModel):
    chatterbox: Dict[str, Any]
    vibevoice: Dict[str, Any]
    default_engine: TTSEngine
    available_engines: list[TTSEngine]


async def load_models():
    """Load both TTS models."""
    global chatterbox_model, vibevoice_adapter, default_engine
    
    # Load Chatterbox
    try:
        logger.info("Loading Chatterbox TTS model...")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        chatterbox_model = ChatterboxTTS.from_pretrained(DEVICE)
        logger.info("Chatterbox model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load Chatterbox model: {e}")
        chatterbox_model = None
    
    # Load VibeVoice adapter
    try:
        vibevoice_url = os.environ.get("VIBEVOICE_URL", "http://localhost:5000")
        vibevoice_api_key = os.environ.get("VIBEVOICE_API_KEY")
        logger.info(f"Initializing VibeVoice adapter for {vibevoice_url}...")
        
        vibevoice_adapter = VibeVoiceAdapter(vibevoice_url, vibevoice_api_key)
        
        # Test connection
        async with vibevoice_adapter as adapter:
            health = await adapter.client.health_check()
            if health.get("status") == "healthy":
                logger.info("VibeVoice connection successful")
            else:
                raise Exception(f"VibeVoice unhealthy: {health}")
                
    except Exception as e:
        logger.error(f"Failed to initialize VibeVoice: {e}")
        vibevoice_adapter = None
    
    # Set default engine based on what's available
    if chatterbox_model:
        default_engine = TTSEngine.CHATTERBOX
    elif vibevoice_adapter:
        default_engine = TTSEngine.VIBEVOICE
    else:
        raise Exception("No TTS engines available!")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await load_models()
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# Create FastAPI app
app = FastAPI(
    title="Unified TTS API",
    description="Text-to-Speech API supporting Chatterbox and VibeVoice engines",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/engines", response_model=EngineStatusResponse)
async def get_engine_status():
    """Get status of all TTS engines."""
    
    # Check Chatterbox status
    chatterbox_status = {
        "available": chatterbox_model is not None,
        "gpu_available": torch.cuda.is_available(),
        "device": DEVICE if chatterbox_model else None
    }
    
    if torch.cuda.is_available() and chatterbox_model:
        chatterbox_status.update({
            "gpu_name": torch.cuda.get_device_name(),
            "gpu_memory_allocated": torch.cuda.memory_allocated() / 1024**3,
            "gpu_memory_total": torch.cuda.get_device_properties(0).total_memory / 1024**3
        })
    
    # Check VibeVoice status
    vibevoice_status = {"available": False}
    if vibevoice_adapter:
        try:
            async with vibevoice_adapter as adapter:
                health = await adapter.client.health_check()
                vibevoice_status = {
                    "available": True,
                    "health": health,
                    "url": adapter.client.base_url
                }
        except:
            vibevoice_status = {"available": False, "error": "Connection failed"}
    
    available_engines = []
    if chatterbox_model:
        available_engines.append(TTSEngine.CHATTERBOX)
    if vibevoice_adapter and vibevoice_status["available"]:
        available_engines.append(TTSEngine.VIBEVOICE)
    
    return EngineStatusResponse(
        chatterbox=chatterbox_status,
        vibevoice=vibevoice_status,
        default_engine=default_engine,
        available_engines=available_engines
    )


@app.post("/synthesize", response_model=UnifiedTTSResponse)
async def synthesize_speech(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    engine: TTSEngine = Form(default=None),
    exaggeration: float = Form(0.5),
    temperature: float = Form(0.8),
    cfg_weight: float = Form(0.5),
    min_p: float = Form(0.05),
    top_p: float = Form(1.0),
    repetition_penalty: float = Form(1.2),
    seed: Optional[int] = Form(None),
    speech_rate: float = Form(1.0),
    voice_preset: str = Form("default"),
    voice_file: Optional[UploadFile] = File(None),
    voice_id: Optional[str] = Form(None)
):
    """Synthesize speech using specified engine."""
    
    # Use default engine if not specified
    if engine is None:
        engine = default_engine
    
    # Validate engine availability
    if engine == TTSEngine.CHATTERBOX and not chatterbox_model:
        raise HTTPException(status_code=503, detail="Chatterbox engine not available")
    if engine == TTSEngine.VIBEVOICE and not vibevoice_adapter:
        raise HTTPException(status_code=503, detail="VibeVoice engine not available")
    
    try:
        if engine == TTSEngine.CHATTERBOX:
            # Use Chatterbox
            import time
            
            # Handle voice reference
            voice_ref_tensor = None
            if voice_file:
                voice_content = await voice_file.read()
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(voice_content)
                    tmp.flush()
                    voice_ref_tensor = chatterbox_model.load_voice(tmp.name, DEVICE)
                    os.unlink(tmp.name)
            elif voice_id:
                voice_data = await voice_storage.get_voice(voice_id)
                if voice_data:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(voice_data['audio_data'])
                        tmp.flush()
                        voice_ref_tensor = chatterbox_model.load_voice(tmp.name, DEVICE)
                        os.unlink(tmp.name)
            
            # Set random seed
            if seed is not None:
                torch.manual_seed(seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(seed)
            
            # Generate speech
            start_time = time.time()
            
            generated_audio, sample_rate = chatterbox_model.generate_audio_with_params(
                text=text,
                voice_ref=voice_ref_tensor,
                exaggeration=exaggeration,
                temperature=temperature,
                cfg_weight=cfg_weight,
                min_p=min_p,
                top_p=top_p,
                repetition_penalty=repetition_penalty,
            )
            
            generation_time = time.time() - start_time
            
            # Apply speech rate adjustment
            if speech_rate != 1.0:
                import librosa
                generated_audio = librosa.effects.time_stretch(generated_audio, rate=speech_rate)
            
            # Save to temporary file
            output_path = tempfile.mktemp(suffix=".wav")
            import soundfile as sf
            sf.write(output_path, generated_audio, sample_rate)
            
            # Calculate metrics
            duration = len(generated_audio) / sample_rate
            tokens_generated = len(text) * 2  # Rough estimate
            inference_speed = tokens_generated / generation_time if generation_time > 0 else 0
            
            # Schedule cleanup
            background_tasks.add_task(lambda: os.unlink(output_path) if os.path.exists(output_path) else None)
            
            return UnifiedTTSResponse(
                success=True,
                message="Speech synthesized successfully with Chatterbox",
                audio_url=f"/audio/{os.path.basename(output_path)}",
                duration=duration,
                sample_rate=sample_rate,
                engine_used=TTSEngine.CHATTERBOX,
                parameters={
                    "text_length": len(text),
                    "generation_time": generation_time,
                    "inference_speed": inference_speed
                },
                inference_speed=inference_speed
            )
            
        else:  # VibeVoice
            async with vibevoice_adapter as adapter:
                audio_bytes, sample_rate, duration = await adapter.synthesize_compatible(
                    text=text,
                    exaggeration=exaggeration,
                    temperature=temperature,
                    cfg_weight=cfg_weight,
                    min_p=min_p,
                    top_p=top_p,
                    repetition_penalty=repetition_penalty,
                    seed=seed,
                    speech_rate=speech_rate,
                    voice_preset=voice_preset
                )
                
                # Save to temporary file
                output_path = tempfile.mktemp(suffix=".wav")
                with open(output_path, "wb") as f:
                    f.write(audio_bytes)
                
                # Schedule cleanup
                background_tasks.add_task(lambda: os.unlink(output_path) if os.path.exists(output_path) else None)
                
                return UnifiedTTSResponse(
                    success=True,
                    message="Speech synthesized successfully with VibeVoice",
                    audio_url=f"/audio/{os.path.basename(output_path)}",
                    duration=duration,
                    sample_rate=sample_rate,
                    engine_used=TTSEngine.VIBEVOICE,
                    parameters={
                        "text_length": len(text),
                        "voice_preset": voice_preset
                    }
                )
                
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serve generated audio files."""
    file_path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(file_path, media_type="audio/wav")


@app.post("/voices/{engine}")
async def list_voices(engine: TTSEngine):
    """List available voices for specified engine."""
    if engine == TTSEngine.CHATTERBOX:
        # Return saved voice references
        voices = await voice_storage.list_voices()
        return {"engine": "chatterbox", "voices": voices}
    
    elif engine == TTSEngine.VIBEVOICE:
        if not vibevoice_adapter:
            raise HTTPException(status_code=503, detail="VibeVoice not available")
        
        try:
            async with vibevoice_adapter as adapter:
                voices = await adapter.client.list_voices()
                return {"engine": "vibevoice", "voices": voices}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list voices: {str(e)}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid engine")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    status = await get_engine_status()
    
    # Determine overall health
    healthy = len(status.available_engines) > 0
    
    return {
        "status": "healthy" if healthy else "unhealthy",
        "engines": status.dict()
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)