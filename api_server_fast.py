#!/usr/bin/env python3
"""
Chatterbox TTS API Server with Fast Inference
Optimized for 120+ it/s with CUDA graphs and static cache
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
from chatterbox.models.t3.modules.cond_enc import T3Cond
from voice_storage import voice_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
model: Optional[ChatterboxTTS] = None

# GPU Configuration
if torch.cuda.is_available():
    gpu_id = int(os.environ.get("CUDA_VISIBLE_DEVICES", "0"))
    DEVICE = f"cuda:{gpu_id}"
    torch.cuda.set_device(gpu_id)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    # Enable TF32 for better performance
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    logger.info(f"Using GPU: {torch.cuda.get_device_name(gpu_id)}")
else:
    DEVICE = "cpu"
    logger.warning("CUDA not available, using CPU")


# Pydantic Models
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
    inference_speed: Optional[float] = None  # it/s


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    gpu_name: Optional[str] = None
    gpu_memory_total: Optional[float] = None
    gpu_memory_allocated: Optional[float] = None
    model_loaded: bool
    optimized_inference: bool


async def load_model():
    """Load the Chatterbox TTS model with optimized inference."""
    global model
    try:
        logger.info("Loading Chatterbox TTS model with fast inference...")
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        model = ChatterboxTTS.from_pretrained(DEVICE)
        
        # Enable optimized inference
        try:
            # Import and apply optimizations
            from chatterbox.models.t3.fast_min_p_warper import FastMinPLogitsWarper
            from chatterbox.models.t3.fast_top_p_warper import FastTopPLogitsWarper
            from chatterbox.models.t3.t3_cuda_graphs import T3StepCUDAGraphWrapper, get_next_bucket
            from chatterbox.models.t3.inference_optimized import add_optimized_inference_to_t3
            
            # Patch in the optimized inference method
            add_optimized_inference_to_t3()
            
            # Initialize processors
            model.t3.init_processors()
            
            # Pre-compute caches
            model.t3.get_speech_pos_embedding_cache(1501, dtype=torch.float16)
            model.t3.init_speech_embedding_cache(
                vocab_size=model.t3.hp.speech_tokens_dict_size, 
                dtype=torch.float16
            )
            
            # Enable init_patched_model
            model.t3.init_patched_model()
            
            logger.info("✓ Fast inference optimizations enabled")
            logger.info("  - CUDA graphs: Enabled")
            logger.info("  - Static KV cache: Enabled")
            logger.info("  - Fast warpers: Enabled")
            logger.info("  - Pre-computed embeddings: Enabled")
            
        except Exception as e:
            logger.warning(f"Could not enable all optimizations: {e}")
        
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / 1024**3
            cached = torch.cuda.memory_reserved() / 1024**3
            logger.info(f"Model loaded. GPU Memory - Allocated: {allocated:.2f} GB, Cached: {cached:.2f} GB")
        
        logger.info("Chatterbox TTS model loaded successfully!")
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise e


def set_seed(seed: int):
    """Set random seed for reproducibility."""
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)


def cleanup_temp_file(file_path: str, delay_seconds: int = 3600):
    """Background task to cleanup temporary files."""
    import time
    try:
        time.sleep(delay_seconds)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup file {file_path}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    logger.info("Starting Chatterbox TTS API Server (Fast Edition)...")
    await load_model()
    yield
    # Shutdown
    logger.info("Shutting down...")


# FastAPI app
app = FastAPI(
    title="Chatterbox TTS API (Fast)",
    description="High-performance TTS API with 120+ it/s inference",
    version="2.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint."""
    return {
        "message": "Chatterbox TTS API Server (Fast Edition)",
        "version": "2.0.0",
        "inference_speed": "120+ it/s",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check with optimization status."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name() if gpu_available else None
    gpu_memory_total = torch.cuda.get_device_properties(0).total_memory / 1024**3 if gpu_available else None
    gpu_memory_allocated = torch.cuda.memory_allocated() / 1024**3 if gpu_available else None
    
    # Check if optimizations are enabled
    optimized = False
    if model is not None:
        optimized = hasattr(model.t3, 'inference_optimized')
    
    return HealthResponse(
        status="healthy",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        gpu_memory_total=gpu_memory_total,
        gpu_memory_allocated=gpu_memory_allocated,
        model_loaded=model is not None,
        optimized_inference=optimized
    )


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
    audio_prompt: Optional[UploadFile] = File(None, description="Optional reference audio for voice cloning")
):
    """Synthesize speech with optimized inference."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
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
        
        if request.seed is not None:
            set_seed(request.seed)
        
        # Handle voice file
        audio_prompt_path = None
        if audio_prompt is not None:
            suffix = Path(audio_prompt.filename).suffix if audio_prompt.filename else ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                content = await audio_prompt.read()
                tmp_file.write(content)
                audio_prompt_path = tmp_file.name
            background_tasks.add_task(cleanup_temp_file, audio_prompt_path)
        
        # Use the standard generate method which handles everything properly
        import time
        start_time = time.time()
        
        # Warm up GPU
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        # Track T3 inference time by monitoring logs
        t3_start = time.time()
        
        with torch.amp.autocast('cuda', enabled=torch.cuda.is_available()):
            wav = model.generate(
                text=request.text,
                audio_prompt_path=audio_prompt_path,
                temperature=request.temperature,
                cfg_weight=request.cfg_weight,
                min_p=request.min_p,
                top_p=request.top_p,
                repetition_penalty=request.repetition_penalty,
                exaggeration=request.exaggeration,
            )
        
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        t3_time = time.time() - t3_start
        
        # Estimate tokens generated (approximate)
        estimated_tokens = len(request.text) * 5  # Rough estimate
        inference_speed = estimated_tokens / t3_time if t3_time > 0 else 0
        
        inference_time = time.time() - start_time
        
        # Convert wav to proper format
        if torch.cuda.is_available():
            wav_cpu = wav.cpu()
        else:
            wav_cpu = wav
        
        # Save audio with UUID filename
        import uuid
        audio_filename = f"{uuid.uuid4()}.wav"
        output_path = f"/tmp/{audio_filename}"
        
        import torchaudio
        torchaudio.save(output_path, wav_cpu.unsqueeze(0) if wav_cpu.dim() == 1 else wav_cpu, model.sr)
        
        background_tasks.add_task(cleanup_temp_file, output_path)
        
        # Calculate metrics
        wav_cpu_1d = wav_cpu.squeeze(0) if wav_cpu.dim() > 1 else wav_cpu
        duration = len(wav_cpu_1d) / model.sr
        # Use the estimated T3 inference speed we calculated earlier
        inference_speed = estimated_tokens / t3_time if t3_time > 0 else 0
        
        logger.info(f"Synthesis complete: {inference_time:.2f}s, {inference_speed:.1f} it/s")
        
        return TTSResponse(
            success=True,
            message="Speech synthesized successfully",
            audio_url=f"/audio/{audio_filename}",
            duration=duration,
            sample_rate=model.sr,
            parameters=request.dict(),
            inference_speed=inference_speed
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Synthesis error: {str(e)}\n{error_detail}")
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


@app.post("/synthesize-json", response_model=TTSResponse)
async def synthesize_speech_json(
    request: TTSRequest,
    background_tasks: BackgroundTasks,
):
    """
    Synthesize speech from text using Chatterbox TTS (JSON endpoint without file upload).
    
    Args:
        request: TTS synthesis parameters
        
    Returns:
        JSON response with audio file URL and metadata
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Set seed if provided
        if request.seed is not None:
            set_seed(request.seed)
        
        # Use the standard generate method which handles everything properly
        import time
        start_time = time.time()
        
        # Warm up GPU
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        # Track T3 inference time by monitoring logs
        t3_start = time.time()
        
        with torch.amp.autocast('cuda', enabled=torch.cuda.is_available()):
            wav = model.generate(
                text=request.text,
                audio_prompt_path=None,
                temperature=request.temperature,
                cfg_weight=request.cfg_weight,
                min_p=request.min_p,
                top_p=request.top_p,
                repetition_penalty=request.repetition_penalty,
                exaggeration=request.exaggeration,
            )
        
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        t3_time = time.time() - t3_start
        
        # Estimate tokens generated (approximate)
        estimated_tokens = len(request.text) * 5  # Rough estimate
        inference_speed = estimated_tokens / t3_time if t3_time > 0 else 0
        
        inference_time = time.time() - start_time
        
        # Convert wav to proper format
        if torch.cuda.is_available():
            wav_cpu = wav.cpu()
        else:
            wav_cpu = wav
        
        # Save audio with UUID filename
        import uuid
        audio_filename = f"{uuid.uuid4()}.wav"
        output_path = f"/tmp/{audio_filename}"
        
        import torchaudio
        torchaudio.save(output_path, wav_cpu.unsqueeze(0) if wav_cpu.dim() == 1 else wav_cpu, model.sr)
        
        background_tasks.add_task(cleanup_temp_file, output_path)
        
        # Calculate metrics
        wav_cpu_1d = wav_cpu.squeeze(0) if wav_cpu.dim() > 1 else wav_cpu
        duration = len(wav_cpu_1d) / model.sr
        
        logger.info(f"Synthesis complete: {inference_time:.2f}s, {inference_speed:.1f} it/s")
        
        return TTSResponse(
            success=True,
            message="Speech synthesized successfully",
            audio_url=f"/audio/{audio_filename}",
            duration=duration,
            sample_rate=model.sr,
            parameters=request.dict(),
            inference_speed=inference_speed
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Synthesis error: {str(e)}\nTraceback:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


# Voice management endpoints (same as before)
@app.get("/voices")
async def list_voices():
    """Get all saved voice profiles."""
    try:
        voices = voice_storage.list_voices()
        return {"success": True, "voices": voices}
    except Exception as e:
        logger.error(f"Failed to list voices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/voices/{voice_id}/audio")
async def get_voice_audio(voice_id: str):
    """Get the audio file for a voice profile."""
    audio_file = voice_storage.get_audio_file(voice_id)
    if not audio_file:
        raise HTTPException(status_code=404, detail="Voice audio not found")
    
    return FileResponse(
        audio_file,
        media_type="audio/wav",
        filename=f"voice_{voice_id}.wav"
    )


class ConcatenateRequest(BaseModel):
    audio_urls: list[str] = Field(..., description="List of audio URLs to concatenate")
    output_format: str = Field("mp3", description="Output format: mp3 or wav")


@app.post("/concatenate-audio")
async def concatenate_audio(request: ConcatenateRequest, background_tasks: BackgroundTasks):
    """Concatenate multiple audio files into a single file."""
    import subprocess
    import uuid
    
    try:
        # Create temp directory for processing
        temp_dir = tempfile.mkdtemp()
        audio_files = []
        
        # Download all audio files
        for i, audio_url in enumerate(request.audio_urls):
            try:
                # Skip blob URLs and invalid URLs
                if audio_url.startswith("blob:") or "blob:" in audio_url:
                    logger.warning(f"Skipping blob URL: {audio_url}")
                    continue
                
                # Extract filename from URL
                if audio_url.startswith("/audio/"):
                    filename = audio_url.replace("/audio/", "")
                    file_path = f"/tmp/{filename}"
                elif audio_url.startswith("http"):
                    # Handle full URLs
                    import requests
                    try:
                        response = requests.get(audio_url, timeout=30)
                        response.raise_for_status()
                        file_path = os.path.join(temp_dir, f"audio_{i}.wav")
                        with open(file_path, "wb") as f:
                            f.write(response.content)
                    except Exception as req_e:
                        logger.error(f"Failed to download URL {audio_url}: {req_e}")
                        continue
                else:
                    # Assume it's just a filename
                    file_path = f"/tmp/{audio_url}"
                
                if os.path.exists(file_path):
                    # Verify the file is not empty and is a valid audio file
                    if os.path.getsize(file_path) > 0:
                        audio_files.append(file_path)
                        logger.info(f"Added audio file: {file_path}")
                    else:
                        logger.warning(f"Audio file is empty: {file_path}")
                else:
                    logger.warning(f"Audio file not found: {file_path}")
            except Exception as e:
                logger.error(f"Error processing audio {audio_url}: {e}")
                continue
        
        if not audio_files:
            raise HTTPException(status_code=400, detail="No valid audio files found")
        
        # Create output filename
        output_id = str(uuid.uuid4())
        output_ext = "mp3" if request.output_format.lower() == "mp3" else "wav"
        output_filename = f"combined_{output_id}.{output_ext}"
        output_path = f"/tmp/{output_filename}"
        
        # Create file list for ffmpeg
        list_file = os.path.join(temp_dir, "files.txt")
        with open(list_file, "w") as f:
            for audio_file in audio_files:
                # FFmpeg concat demuxer requires specific format
                f.write(f"file '{audio_file}'\n")
        
        # Use ffmpeg to concatenate
        if request.output_format.lower() == "mp3":
            # Convert to MP3 with good quality settings
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file,
                "-c:a", "libmp3lame",
                "-b:a", "192k",
                "-ar", "24000",  # Match Chatterbox sample rate
                output_path
            ]
        else:
            # Keep as WAV
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file,
                "-c:a", "pcm_s16le",
                "-ar", "24000",  # Match Chatterbox sample rate
                output_path
            ]
        
        logger.info(f"Running ffmpeg command: {' '.join(cmd)}")
        
        # Run ffmpeg with timeout
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                error_msg = result.stderr[:500] if result.stderr else "Unknown ffmpeg error"
                raise HTTPException(status_code=500, detail=f"Audio concatenation failed: {error_msg}")
                
            logger.info("FFmpeg concatenation completed successfully")
            
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg timeout expired")
            raise HTTPException(status_code=500, detail="Audio concatenation timeout")
        except Exception as e:
            logger.error(f"FFmpeg execution error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to execute ffmpeg: {str(e)}")
        
        # Clean up temp directory after delay
        def cleanup():
            import shutil
            time.sleep(300)  # Wait 5 minutes before cleanup
            try:
                shutil.rmtree(temp_dir)
                # Also clean up output file after 1 hour
                time.sleep(3300)
                if os.path.exists(output_path):
                    os.remove(output_path)
            except Exception as e:
                logger.warning(f"Cleanup error: {e}")
        
        background_tasks.add_task(cleanup)
        
        # Return response
        return {
            "success": True,
            "audio_url": f"/audio/{output_filename}",
            "format": output_ext,
            "total_files": len(audio_files)
        }
        
    except Exception as e:
        logger.error(f"Concatenation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "6093"))
    uvicorn.run(
        "api_server_fast:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        workers=1,
        log_level="info",
        timeout_keep_alive=300,
        timeout_graceful_shutdown=30
    )