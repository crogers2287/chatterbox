#!/usr/bin/env python3
"""
GPU-Unified TTS API Server
Supports both Chatterbox and VibeVoice TTS engines on GPU with dynamic memory management
"""

import os
import asyncio
import tempfile
import logging
import gc
from pathlib import Path
from typing import Optional, Dict, Any, Literal
from contextlib import asynccontextmanager
from enum import Enum
import threading

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from vibevoice_advanced import VibeVoiceLargeAdapter
from voice_storage import voice_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TTS Engine Enum
class TTSEngine(str, Enum):
    CHATTERBOX = "chatterbox"
    VIBEVOICE = "vibevoice"

# Global instances
chatterbox_model = None
vibevoice_adapter: Optional[VibeVoiceLargeAdapter] = None
default_engine = TTSEngine.CHATTERBOX
current_active_engine: Optional[TTSEngine] = None
engine_lock = threading.Lock()

# GPU Configuration
if torch.cuda.is_available():
    gpu_id = int(os.environ.get("CUDA_VISIBLE_DEVICES", "0"))
    DEVICE = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    logger.info(f"Using GPU: {torch.cuda.get_device_name(gpu_id)}")
    
    # Set memory fraction for better sharing
    torch.cuda.set_per_process_memory_fraction(0.5)  # Use only 50% of GPU memory
else:
    DEVICE = "cpu"
    logger.error("CUDA not available! Both engines require GPU.")
    raise RuntimeError("GPU is required for this unified TTS server")


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
    gpu_memory_used: Optional[float] = None


class EngineStatusResponse(BaseModel):
    chatterbox: Dict[str, Any]
    vibevoice: Dict[str, Any]
    default_engine: TTSEngine
    available_engines: list[TTSEngine]
    current_active_engine: Optional[TTSEngine]
    gpu_memory: Dict[str, Any]


def clear_gpu_cache():
    """Clear GPU cache and collect garbage."""
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
    gc.collect()


def get_gpu_memory_info():
    """Get current GPU memory usage."""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**3
        reserved = torch.cuda.memory_reserved() / 1024**3
        total = torch.cuda.get_device_properties(0).total_memory / 1024**3
        return {
            "allocated_gb": round(allocated, 2),
            "reserved_gb": round(reserved, 2),
            "total_gb": round(total, 2),
            "free_gb": round(total - allocated, 2),
            "usage_percent": round((allocated / total) * 100, 1)
        }
    return {}


async def unload_engine(engine: TTSEngine):
    """Unload an engine from GPU memory."""
    global chatterbox_model, vibevoice_adapter
    
    logger.info(f"Unloading {engine} from GPU memory...")
    
    if engine == TTSEngine.CHATTERBOX and chatterbox_model is not None:
        # Move model to CPU first, then delete
        try:
            if hasattr(chatterbox_model, 'to'):
                chatterbox_model.to('cpu')
        except:
            pass
        del chatterbox_model
        chatterbox_model = None
        
    elif engine == TTSEngine.VIBEVOICE and vibevoice_adapter is not None:
        # Close VibeVoice connection
        try:
            await vibevoice_adapter.client.close()
        except:
            pass
        vibevoice_adapter = None
    
    clear_gpu_cache()
    logger.info(f"{engine} unloaded. GPU memory: {get_gpu_memory_info()}")


async def load_engine(engine: TTSEngine):
    """Load a specific engine into GPU memory."""
    global chatterbox_model, vibevoice_adapter, current_active_engine
    
    # If engine is already loaded, return
    if engine == current_active_engine:
        logger.info(f"{engine} is already loaded")
        return
    
    # Unload current engine if different
    if current_active_engine and current_active_engine != engine:
        await unload_engine(current_active_engine)
    
    logger.info(f"Loading {engine} into GPU memory...")
    
    if engine == TTSEngine.CHATTERBOX:
        try:
            from chatterbox.tts import ChatterboxTTS
            
            chatterbox_model = ChatterboxTTS.from_pretrained(DEVICE)
            
            # Apply optimizations if available
            try:
                from chatterbox.models.t3.fast_min_p_warper import FastMinPLogitsWarper
                from chatterbox.models.t3.fast_top_p_warper import FastTopPLogitsWarper
                from chatterbox.models.t3.t3_cuda_graphs import T3StepCUDAGraphWrapper, get_next_bucket
                from chatterbox.models.t3.inference_optimized import add_optimized_inference_to_t3
                
                if hasattr(chatterbox_model, 'models') and 't3' in chatterbox_model.models:
                    add_optimized_inference_to_t3(chatterbox_model.models['t3'])
                    logger.info("Chatterbox optimizations applied")
            except Exception as e:
                logger.warning(f"Could not apply optimizations: {e}")
            
            current_active_engine = TTSEngine.CHATTERBOX
            logger.info(f"Chatterbox loaded. GPU memory: {get_gpu_memory_info()}")
            
        except Exception as e:
            logger.error(f"Failed to load Chatterbox: {e}")
            raise
            
    elif engine == TTSEngine.VIBEVOICE:
        try:
            vibevoice_url = os.environ.get("VIBEVOICE_URL", "http://localhost:5000")
            vibevoice_api_key = os.environ.get("VIBEVOICE_API_KEY")
            
            vibevoice_adapter = VibeVoiceLargeAdapter(vibevoice_url, vibevoice_api_key)
            
            # Initialize and load large model
            async with vibevoice_adapter as adapter:
                # Ensure large model is loaded
                await adapter.ensure_model_loaded()
                
                # Test connection
                health = await adapter.client.health_check()
                if health.get("status") != "healthy":
                    raise Exception(f"VibeVoice unhealthy: {health}")
                if health.get("model_size") != "large":
                    logger.warning(f"VibeVoice is using {health.get('model_size')} model, expected large")
            
            current_active_engine = TTSEngine.VIBEVOICE
            logger.info(f"VibeVoice loaded. GPU memory: {get_gpu_memory_info()}")
            
        except Exception as e:
            logger.error(f"Failed to load VibeVoice: {e}")
            raise


async def ensure_engine_loaded(engine: TTSEngine):
    """Ensure the requested engine is loaded, switching if necessary."""
    with engine_lock:
        await load_engine(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - don't load any model yet, load on demand
    logger.info("GPU Unified TTS Server starting...")
    logger.info(f"Initial GPU memory: {get_gpu_memory_info()}")
    
    yield
    
    # Shutdown - unload all models
    logger.info("Shutting down...")
    if current_active_engine:
        await unload_engine(current_active_engine)
    clear_gpu_cache()


# Create FastAPI app
app = FastAPI(
    title="GPU Unified TTS API",
    description="TTS API supporting Chatterbox and VibeVoice engines on GPU with dynamic switching",
    version="2.0.0",
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
        "available": True,  # Always true since we require GPU
        "loaded": chatterbox_model is not None,
        "gpu_required": True,
        "device": DEVICE
    }
    
    # Check VibeVoice status
    vibevoice_status = {
        "available": True,  # Assuming it's available if configured
        "loaded": vibevoice_adapter is not None,
        "gpu_required": True,
        "url": os.environ.get("VIBEVOICE_URL", "http://localhost:5000")
    }
    
    # Get GPU memory info
    gpu_memory = get_gpu_memory_info()
    
    return EngineStatusResponse(
        chatterbox=chatterbox_status,
        vibevoice=vibevoice_status,
        default_engine=default_engine,
        available_engines=[TTSEngine.CHATTERBOX, TTSEngine.VIBEVOICE],
        current_active_engine=current_active_engine,
        gpu_memory=gpu_memory
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
    """Synthesize speech using specified engine with dynamic GPU switching."""
    
    # Use default engine if not specified
    if engine is None:
        engine = default_engine
    
    # Record initial GPU memory
    initial_gpu_memory = get_gpu_memory_info()
    
    # Ensure the requested engine is loaded (will switch if needed)
    await ensure_engine_loaded(engine)
    
    try:
        if engine == TTSEngine.CHATTERBOX:
            if not chatterbox_model:
                raise HTTPException(status_code=503, detail="Chatterbox failed to load")
            
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
            
            # Generate speech using the correct method
            result = chatterbox_model.generate(
                text=text,
                ref_dict={"ref": voice_ref_tensor} if voice_ref_tensor else None,
                repetition_penalty=repetition_penalty,
                min_p=min_p,
                top_p=top_p,
                temperature=temperature,
                cfg_weight=cfg_weight
            )
            
            # Extract audio from result
            if isinstance(result, tuple):
                generated_audio = result[0].cpu().numpy().squeeze()
                sample_rate = 24000  # Default sample rate
            else:
                generated_audio = result.cpu().numpy().squeeze()
                sample_rate = 24000
            
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
            
            # Get final GPU memory usage
            final_gpu_memory = get_gpu_memory_info()
            gpu_memory_used = final_gpu_memory['allocated_gb'] - initial_gpu_memory.get('allocated_gb', 0)
            
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
                inference_speed=inference_speed,
                gpu_memory_used=gpu_memory_used
            )
            
        else:  # VibeVoice
            if not vibevoice_adapter:
                raise HTTPException(status_code=503, detail="VibeVoice failed to load")
                
            # Handle voice reference for VibeVoice
            voice_reference_path = None
            if voice_file:
                voice_content = await voice_file.read()
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(voice_content)
                    tmp.flush()
                    voice_reference_path = tmp.name
            elif voice_id:
                voice_data = await voice_storage.get_voice(voice_id)
                if voice_data:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(voice_data['audio_data'])
                        tmp.flush()
                        voice_reference_path = tmp.name
            
            async with vibevoice_adapter as adapter:
                audio_bytes, sample_rate, duration = await adapter.synthesize_compatible(
                    text=text,
                    voice_reference_path=voice_reference_path,
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
                
            # Clean up temporary voice file
            if voice_reference_path and os.path.exists(voice_reference_path):
                os.unlink(voice_reference_path)
                
            # Save to temporary file
            output_path = tempfile.mktemp(suffix=".wav")
            with open(output_path, "wb") as f:
                f.write(audio_bytes)
                
            # Get final GPU memory usage
            final_gpu_memory = get_gpu_memory_info()
            gpu_memory_used = final_gpu_memory['allocated_gb'] - initial_gpu_memory.get('allocated_gb', 0)
            
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
                    "voice_preset": voice_preset,
                    "model_size": "large",
                    "voice_cloning": voice_reference_path is not None
                },
                gpu_memory_used=gpu_memory_used
            )
                
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.post("/switch_engine")
async def switch_engine(engine: TTSEngine):
    """Manually switch to a specific engine, unloading the current one."""
    try:
        await ensure_engine_loaded(engine)
        return {
            "success": True,
            "message": f"Switched to {engine}",
            "gpu_memory": get_gpu_memory_info()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to switch engine: {str(e)}")


@app.post("/unload_engine")
async def unload_current_engine():
    """Unload the currently active engine to free GPU memory."""
    if current_active_engine:
        await unload_engine(current_active_engine)
        return {
            "success": True,
            "message": f"Unloaded {current_active_engine}",
            "gpu_memory": get_gpu_memory_info()
        }
    else:
        return {
            "success": True,
            "message": "No engine currently loaded",
            "gpu_memory": get_gpu_memory_info()
        }


@app.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serve generated audio files."""
    file_path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(file_path, media_type="audio/wav")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    status = await get_engine_status()
    
    return {
        "status": "healthy",
        "engines": status.dict(),
        "gpu_available": torch.cuda.is_available()
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)