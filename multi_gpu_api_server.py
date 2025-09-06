#!/usr/bin/env python3
"""
Multi-GPU Enhanced Chatterbox TTS API Server
Distributes model components across multiple GPUs for better utilization
"""

import os
import asyncio
import tempfile
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

from chatterbox.tts import ChatterboxTTS

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
model: Optional[ChatterboxTTS] = None

# Multi-GPU Configuration
ENABLE_MULTI_GPU = torch.cuda.device_count() > 1

if torch.cuda.is_available():
    if ENABLE_MULTI_GPU:
        # Use both GPUs
        T3_DEVICE = "cuda:0"
        S3GEN_DEVICE = "cuda:1"
        VE_DEVICE = "cuda:0"  # Voice encoder on GPU 0
        logger.info(f"Multi-GPU mode enabled: T3 on GPU 0, S3Gen on GPU 1")
        logger.info(f"GPU 0: {torch.cuda.get_device_name(0)}")
        logger.info(f"GPU 1: {torch.cuda.get_device_name(1)}")
    else:
        # Single GPU mode
        T3_DEVICE = "cuda:0"
        S3GEN_DEVICE = "cuda:0"
        VE_DEVICE = "cuda:0"
        logger.info(f"Single GPU mode: {torch.cuda.get_device_name(0)}")
    
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
else:
    T3_DEVICE = "cpu"
    S3GEN_DEVICE = "cpu"
    VE_DEVICE = "cpu"
    logger.warning("CUDA not available, using CPU")


# Pydantic Models (same as original)
class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize", max_length=5000)
    exaggeration: float = Field(0.5, description="Voice exaggeration level", ge=0.1, le=2.0)
    temperature: float = Field(0.8, description="Sampling temperature", ge=0.05, le=5.0)
    cfg_weight: float = Field(0.5, description="Classifier-free guidance weight", ge=0.0, le=1.0)
    min_p: float = Field(0.05, description="Minimum probability threshold", ge=0.0, le=1.0)
    top_p: float = Field(1.0, description="Top-p sampling", ge=0.0, le=1.0)
    repetition_penalty: float = Field(1.2, description="Repetition penalty", ge=1.0, le=2.0)
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    speech_rate: float = Field(1.0, description="Speech rate multiplier", ge=0.5, le=2.0)


class TTSResponse(BaseModel):
    success: bool
    message: str
    audio_url: Optional[str] = None
    duration: Optional[float] = None
    sample_rate: int
    parameters: Dict[str, Any]
    gpu_info: Optional[Dict[str, Any]] = None


class MultiGPUChatterboxTTS(ChatterboxTTS):
    """Extended ChatterboxTTS with multi-GPU support"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.t3_device = T3_DEVICE
        self.s3gen_device = S3GEN_DEVICE
        self.ve_device = VE_DEVICE
        
        # Move models to their respective devices
        if ENABLE_MULTI_GPU:
            self.t3 = self.t3.to(self.t3_device)
            self.s3gen = self.s3gen.to(self.s3gen_device)
            self.ve = self.ve.to(self.ve_device)
            if self.conds is not None:
                # Keep conditionals on primary device
                self.conds = self.conds.to(self.t3_device)
            
            logger.info(f"Models distributed across GPUs:")
            logger.info(f"  T3 on {self.t3_device}")
            logger.info(f"  S3Gen on {self.s3gen_device}")
            logger.info(f"  VE on {self.ve_device}")
    
    def generate(self, *args, **kwargs):
        """Override generate to handle multi-GPU inference"""
        if not ENABLE_MULTI_GPU:
            return super().generate(*args, **kwargs)
        
        # The parent generate method will need to be modified to handle
        # tensors on different devices. For now, this is a placeholder
        # that shows the concept.
        
        # Ensure proper device handling in the generation pipeline
        with torch.cuda.device(0):  # Primary device context
            return super().generate(*args, **kwargs)


async def load_model():
    """Load the Chatterbox TTS model with multi-GPU optimization."""
    global model
    try:
        logger.info("Loading Chatterbox TTS model with multi-GPU support...")
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            if ENABLE_MULTI_GPU:
                torch.cuda.set_device(0)  # Set primary device
        
        # Load model to CPU first (for flexibility)
        base_model = ChatterboxTTS.from_pretrained("cpu")
        
        # Create multi-GPU wrapper
        model = MultiGPUChatterboxTTS(
            t3=base_model.t3,
            s3gen=base_model.s3gen,
            ve=base_model.ve,
            tokenizer=base_model.tokenizer,
            device=T3_DEVICE,  # Primary device
            conds=base_model.conds
        )
        
        if torch.cuda.is_available():
            # Log memory usage for each GPU
            for i in range(torch.cuda.device_count()):
                allocated = torch.cuda.memory_allocated(i) / 1024**3
                cached = torch.cuda.memory_reserved(i) / 1024**3
                logger.info(f"GPU {i} Memory - Allocated: {allocated:.2f} GB, Cached: {cached:.2f} GB")
        
        logger.info("Chatterbox TTS model loaded successfully!")
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise e


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    logger.info("Starting Multi-GPU Chatterbox TTS API Server...")
    await load_model()
    yield
    # Shutdown
    logger.info("Shutting down Multi-GPU Chatterbox TTS API Server...")


# FastAPI app initialization
app = FastAPI(
    title="Multi-GPU Chatterbox TTS API",
    description="RESTful API for Chatterbox Text-to-Speech synthesis with multi-GPU support",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def set_seed(seed: int):
    """Set random seed for reproducibility."""
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)


def cleanup_temp_file(file_path: str, delay_seconds: int = 3600):
    """Background task to cleanup temporary files after a delay."""
    import time
    try:
        time.sleep(delay_seconds)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup file {file_path}: {e}")


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Multi-GPU Chatterbox TTS API Server",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/health",
        "gpu_mode": "multi-gpu" if ENABLE_MULTI_GPU else "single-gpu"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint with detailed GPU status."""
    response = {
        "status": "healthy",
        "model_loaded": model is not None,
        "multi_gpu_enabled": ENABLE_MULTI_GPU,
        "gpus": []
    }
    
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            gpu_info = {
                "id": i,
                "name": torch.cuda.get_device_name(i),
                "memory_total_gb": torch.cuda.get_device_properties(i).total_memory / 1024**3,
                "memory_allocated_gb": torch.cuda.memory_allocated(i) / 1024**3,
                "memory_cached_gb": torch.cuda.memory_reserved(i) / 1024**3,
                "utilization": "N/A"  # Would need nvidia-ml-py for real-time utilization
            }
            response["gpus"].append(gpu_info)
    
    return response


@app.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(
    background_tasks: BackgroundTasks,
    text: str = Form(...),
    exaggeration: float = Form(0.5),
    temperature: float = Form(0.8),
    cfg_weight: float = Form(0.5),
    min_p: float = Form(0.05),
    top_p: float = Form(1.0),
    repetition_penalty: float = Form(1.2),
    seed: Optional[int] = Form(None),
    speech_rate: float = Form(1.0),
    audio_prompt: Optional[UploadFile] = File(None, description="Optional reference audio file for voice cloning")
):
    """Synthesize speech from text using multi-GPU Chatterbox TTS."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Create request object
        request = TTSRequest(
            text=text,
            exaggeration=exaggeration,
            temperature=temperature,
            cfg_weight=cfg_weight,
            min_p=min_p,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
            seed=seed,
            speech_rate=speech_rate
        )
        
        # Set seed if provided
        if request.seed is not None:
            set_seed(request.seed)
        
        # Handle audio prompt if provided
        audio_prompt_path = None
        if audio_prompt is not None:
            suffix = Path(audio_prompt.filename).suffix if audio_prompt.filename else ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                content = await audio_prompt.read()
                tmp_file.write(content)
                audio_prompt_path = tmp_file.name
            background_tasks.add_task(cleanup_temp_file, audio_prompt_path)
        
        # Record GPU stats before synthesis
        gpu_stats_before = []
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                gpu_stats_before.append(torch.cuda.memory_allocated(i))
        
        # Synthesize speech
        synthesis_start = time.time()
        
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        with torch.amp.autocast('cuda', enabled=torch.cuda.is_available()):
            wav = model.generate(
                text=request.text,
                audio_prompt_path=audio_prompt_path,
                exaggeration=request.exaggeration,
                temperature=request.temperature,
                cfg_weight=request.cfg_weight,
                min_p=request.min_p,
                top_p=request.top_p,
                repetition_penalty=request.repetition_penalty,
            )
        
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        synthesis_time = time.time() - synthesis_start
        
        # Get GPU stats after synthesis
        gpu_stats = {}
        if torch.cuda.is_available() and ENABLE_MULTI_GPU:
            for i in range(torch.cuda.device_count()):
                mem_after = torch.cuda.memory_allocated(i)
                mem_used = (mem_after - gpu_stats_before[i]) / 1024**3
                gpu_stats[f"gpu_{i}_synthesis_memory_gb"] = mem_used
            gpu_stats["synthesis_time_seconds"] = synthesis_time
        
        # Move to CPU and save
        wav_cpu = wav.cpu() if torch.cuda.is_available() else wav
        
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        output_path = output_file.name
        output_file.close()
        
        # Save audio
        import torchaudio
        torchaudio.save(output_path, wav_cpu, model.sr)
        
        # Schedule cleanup
        background_tasks.add_task(cleanup_temp_file, output_path)
        
        # Calculate duration
        wav_numpy = wav_cpu.squeeze(0).numpy()
        duration = len(wav_numpy) / model.sr
        
        return TTSResponse(
            success=True,
            message="Speech synthesized successfully with multi-GPU optimization",
            audio_url=f"/audio/{Path(output_path).name}",
            duration=duration,
            sample_rate=model.sr,
            parameters=request.dict(),
            gpu_info=gpu_stats if ENABLE_MULTI_GPU else None
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Synthesis error: {str(e)}\nTraceback:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/audio/{filename}")
async def get_audio(filename: str):
    """Serve generated audio files."""
    file_path = f"/tmp/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=filename,
        headers={"Cache-Control": "no-cache"}
    )


@app.get("/gpu-stats")
async def gpu_stats():
    """Get detailed GPU statistics."""
    if not torch.cuda.is_available():
        return {"error": "CUDA not available"}
    
    stats = {
        "multi_gpu_enabled": ENABLE_MULTI_GPU,
        "gpu_count": torch.cuda.device_count(),
        "model_distribution": {
            "t3_device": str(model.t3_device) if model else "not loaded",
            "s3gen_device": str(model.s3gen_device) if model else "not loaded",
            "ve_device": str(model.ve_device) if model else "not loaded"
        } if ENABLE_MULTI_GPU else None,
        "gpus": []
    }
    
    for i in range(torch.cuda.device_count()):
        gpu_stat = {
            "id": i,
            "name": torch.cuda.get_device_name(i),
            "memory": {
                "total_gb": torch.cuda.get_device_properties(i).total_memory / 1024**3,
                "allocated_gb": torch.cuda.memory_allocated(i) / 1024**3,
                "cached_gb": torch.cuda.memory_reserved(i) / 1024**3,
                "free_gb": (torch.cuda.get_device_properties(i).total_memory - torch.cuda.memory_allocated(i)) / 1024**3
            }
        }
        stats["gpus"].append(gpu_stat)
    
    return stats


if __name__ == "__main__":
    import sys
    
    # Allow port to be specified as command line argument
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 6094
    
    uvicorn.run(
        "multi_gpu_api_server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        workers=1,  # Single worker to avoid model loading issues
        log_level="info",
        timeout_keep_alive=300,
        timeout_graceful_shutdown=30
    )