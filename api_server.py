#!/usr/bin/env python3
"""
Chatterbox TTS API Server
FastAPI backend providing RESTful API access to Chatterbox TTS functionality.
Optimized for GPU acceleration and production deployment.
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
from voice_storage import voice_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
model: Optional[ChatterboxTTS] = None

# GPU Configuration
if torch.cuda.is_available():
    DEVICE = "cuda:0"
    torch.cuda.set_device(0)
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.enabled = True
    logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
else:
    DEVICE = "cpu"
    logger.warning("CUDA not available, using CPU")


# Pydantic Models for API
class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize", max_length=5000)  # Increased limit
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


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    gpu_name: Optional[str] = None
    gpu_memory_total: Optional[float] = None
    gpu_memory_allocated: Optional[float] = None
    model_loaded: bool


async def load_model():
    """Load the Chatterbox TTS model with GPU optimization."""
    global model
    try:
        logger.info("Loading Chatterbox TTS model...")
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        model = ChatterboxTTS.from_pretrained(DEVICE)
        
        if torch.cuda.is_available():
            # Ensure all model components are on GPU
            model.t3 = model.t3.to(DEVICE)
            model.s3gen = model.s3gen.to(DEVICE)
            model.ve = model.ve.to(DEVICE)
            if model.conds is not None:
                model.conds = model.conds.to(DEVICE)
            
            allocated = torch.cuda.memory_allocated() / 1024**3
            cached = torch.cuda.memory_reserved() / 1024**3
            logger.info(f"Model loaded. GPU Memory - Allocated: {allocated:.2f} GB, Cached: {cached:.2f} GB")
        
        logger.info("Chatterbox TTS model loaded successfully!")
        
        # Monkey-patch optimized inference
        try:
            from chatterbox.models.t3.inference_optimized import add_optimized_inference_to_t3
            add_optimized_inference_to_t3()
            logger.info("Optimized inference enabled")
        except Exception as e:
            logger.warning(f"Could not enable optimized inference: {e}")
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise e


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    logger.info("Starting Chatterbox TTS API Server...")
    await load_model()
    yield
    # Shutdown
    logger.info("Shutting down Chatterbox TTS API Server...")


# FastAPI app initialization
app = FastAPI(
    title="Chatterbox TTS API",
    description="RESTful API for Chatterbox Text-to-Speech synthesis",
    version="1.0.0",
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
        # Wait before cleaning up (default 1 hour)
        time.sleep(delay_seconds)
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to cleanup file {file_path}: {e}")


def adjust_speech_rate(audio_path: str, rate: float, sample_rate: int) -> str:
    """Adjust speech rate using time stretching."""
    if rate == 1.0:
        return audio_path
    
    try:
        import pyrubberband as pyrb
        import soundfile as sf
        
        # Read audio file
        audio_data, sr = sf.read(audio_path)
        
        # Apply time stretching
        stretched_audio = pyrb.time_stretch(audio_data, sr, rate)
        
        # Save to new file
        output_path = audio_path.replace('.wav', f'_rate{rate}.wav')
        sf.write(output_path, stretched_audio, sr)
        
        # Clean up original file
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
        return output_path
    except Exception as e:
        logger.warning(f"Failed to adjust speech rate: {e}")
        return audio_path  # Return original if adjustment fails


@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Chatterbox TTS API Server",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with system status."""
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    gpu_memory_total = torch.cuda.get_device_properties(0).total_memory / 1024**3 if gpu_available else None
    gpu_memory_allocated = torch.cuda.memory_allocated() / 1024**3 if gpu_available else None
    
    return HealthResponse(
        status="healthy",
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        gpu_memory_total=gpu_memory_total,
        gpu_memory_allocated=gpu_memory_allocated,
        model_loaded=model is not None
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
    audio_prompt: Optional[UploadFile] = File(None, description="Optional reference audio file for voice cloning")
):
    """
    Synthesize speech from text using Chatterbox TTS.
    
    Args:
        request: TTS synthesis parameters
        audio_prompt: Optional reference audio file for voice cloning
        
    Returns:
        JSON response with audio file URL and metadata
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Create request object from form data
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
            # Save uploaded file temporarily
            suffix = Path(audio_prompt.filename).suffix if audio_prompt.filename else ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
                content = await audio_prompt.read()
                tmp_file.write(content)
                audio_prompt_path = tmp_file.name
            
            # Schedule cleanup
            background_tasks.add_task(cleanup_temp_file, audio_prompt_path)
        
        # Synthesize speech with GPU acceleration
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
            wav_cpu = wav.cpu()
        else:
            wav_cpu = wav
        
        # Save output audio
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        output_path = output_file.name
        output_file.close()
        
        # Convert to numpy and save
        wav_numpy = wav_cpu.squeeze(0).numpy()
        
        # Simple WAV file writing (you might want to use torchaudio.save for better quality)
        import torchaudio
        torchaudio.save(output_path, wav_cpu, model.sr)
        
        # Apply speech rate adjustment if needed
        if hasattr(request, 'speech_rate') and request.speech_rate != 1.0:
            output_path = adjust_speech_rate(output_path, request.speech_rate, model.sr)
        
        # Schedule cleanup for output file (after 1 hour)
        background_tasks.add_task(cleanup_temp_file, output_path)
        
        # Calculate duration
        duration = len(wav_numpy) / model.sr
        # Adjust duration for speech rate
        if hasattr(request, 'speech_rate'):
            duration = duration / request.speech_rate
        
        return TTSResponse(
            success=True,
            message="Speech synthesized successfully",
            audio_url=f"/audio/{Path(output_path).name}",
            duration=duration,
            sample_rate=model.sr,
            parameters=request.dict()
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Synthesis error: {str(e)}\nTraceback:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.get("/audio/{filename}")
async def get_audio(filename: str, background_tasks: BackgroundTasks):
    """
    Serve generated audio files.
    
    Args:
        filename: Audio file name
        
    Returns:
        Audio file response
    """
    file_path = f"/tmp/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Don't cleanup after serving - let the generation cleanup handle it
    
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
        
        # Synthesize speech with GPU acceleration
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        
        with torch.amp.autocast('cuda', enabled=torch.cuda.is_available()):
            wav = model.generate(
                text=request.text,
                audio_prompt_path=None,
                exaggeration=request.exaggeration,
                temperature=request.temperature,
                cfg_weight=request.cfg_weight,
                min_p=request.min_p,
                top_p=request.top_p,
                repetition_penalty=request.repetition_penalty,
                )
        
        if torch.cuda.is_available():
            torch.cuda.synchronize()
            wav_cpu = wav.cpu()
        else:
            wav_cpu = wav
        
        # Save output audio
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        output_path = output_file.name
        output_file.close()
        
        # Convert to numpy and save
        wav_numpy = wav_cpu.squeeze(0).numpy()
        
        # Simple WAV file writing (you might want to use torchaudio.save for better quality)
        import torchaudio
        torchaudio.save(output_path, wav_cpu, model.sr)
        
        # Apply speech rate adjustment if needed
        if hasattr(request, 'speech_rate') and request.speech_rate != 1.0:
            output_path = adjust_speech_rate(output_path, request.speech_rate, model.sr)
        
        # Schedule cleanup for output file (after 1 hour)
        background_tasks.add_task(cleanup_temp_file, output_path)
        
        # Calculate duration
        duration = len(wav_numpy) / model.sr
        # Adjust duration for speech rate
        if hasattr(request, 'speech_rate'):
            duration = duration / request.speech_rate
        
        return TTSResponse(
            success=True,
            message="Speech synthesized successfully",
            audio_url=f"/audio/{Path(output_path).name}",
            duration=duration,
            sample_rate=model.sr,
            parameters=request.dict()
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Synthesis error: {str(e)}\nTraceback:\n{error_detail}")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {str(e)}")


@app.post("/voice-conversion")
async def voice_conversion(
    source_audio: UploadFile = File(..., description="Source audio file"),
    target_voice: UploadFile = File(..., description="Target voice reference"),
    background_tasks: BackgroundTasks = None
):
    """
    Voice conversion using Chatterbox VC.
    Note: This endpoint requires the VC model to be implemented.
    """
    raise HTTPException(status_code=501, detail="Voice conversion not yet implemented in this API")


@app.get("/models/info")
async def model_info():
    """Get information about the loaded model."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    info = {
        "model_type": "ChatterboxTTS",
        "device": model.device,
        "sample_rate": model.sr,
        "loaded": True
    }
    
    if torch.cuda.is_available():
        info.update({
            "gpu_memory_allocated": torch.cuda.memory_allocated() / 1024**3,
            "gpu_memory_cached": torch.cuda.memory_reserved() / 1024**3
        })
    
    return info


class ConcatRequest(BaseModel):
    audio_urls: list[str] = Field(..., description="List of audio URLs to concatenate")
    output_format: str = Field("mp3", description="Output format (mp3 or wav)")


@app.post("/concatenate-audio")
async def concatenate_audio(
    request: ConcatRequest,
    background_tasks: BackgroundTasks,
):
    """
    Concatenate multiple audio files into a single file.
    
    Args:
        request: List of audio URLs to concatenate
        
    Returns:
        URL of the concatenated audio file
    """
    import subprocess
    import uuid
    
    try:
        # Create temporary files for processing
        temp_files = []
        concat_list_file = None
        
        # Download all audio files
        for i, audio_url in enumerate(request.audio_urls):
            # Extract filename from URL
            if audio_url.startswith('/audio/'):
                filename = audio_url.replace('/audio/', '')
            else:
                filename = audio_url.split('/')[-1]
            file_path = f"/tmp/{filename}"
            
            if not os.path.exists(file_path):
                logger.warning(f"File not found at: {file_path}, trying alternative path")
                raise HTTPException(status_code=404, detail=f"Audio file not found: {filename}")
            
            temp_files.append(file_path)
        
        if not temp_files:
            raise HTTPException(status_code=400, detail="No valid audio files provided")
        
        # Create output filename
        output_id = str(uuid.uuid4())
        output_ext = "mp3" if request.output_format == "mp3" else "wav"
        output_path = f"/tmp/concat_{output_id}.{output_ext}"
        
        # Create a file list for ffmpeg
        concat_list_file = f"/tmp/concat_list_{output_id}.txt"
        with open(concat_list_file, 'w') as f:
            for file_path in temp_files:
                # Escape single quotes in file paths
                escaped_path = file_path.replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")
        
        # Use ffmpeg to concatenate files
        if request.output_format == "mp3":
            # Concatenate and convert to MP3
            cmd = [
                'ffmpeg', '-f', 'concat', '-safe', '0', '-i', concat_list_file,
                '-acodec', 'libmp3lame', '-ab', '192k', '-ar', '44100',
                output_path, '-y'
            ]
        else:
            # Concatenate as WAV
            cmd = [
                'ffmpeg', '-f', 'concat', '-safe', '0', '-i', concat_list_file,
                '-acodec', 'pcm_s16le', '-ar', '44100',
                output_path, '-y'
            ]
        
        # Run ffmpeg
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"Audio concatenation failed: {result.stderr}")
        
        # Clean up the concat list file
        if concat_list_file and os.path.exists(concat_list_file):
            os.remove(concat_list_file)
        
        # Schedule cleanup for output file
        background_tasks.add_task(cleanup_temp_file, output_path, delay_seconds=3600)
        
        # Return the URL
        return {
            "success": True,
            "audio_url": f"/audio/{os.path.basename(output_path)}",
            "format": request.output_format,
            "total_files": len(temp_files)
        }
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg error: {e}")
        raise HTTPException(status_code=500, detail="Audio concatenation failed")
    except Exception as e:
        logger.error(f"Concatenation error: {e}")
        if concat_list_file and os.path.exists(concat_list_file):
            os.remove(concat_list_file)
        raise HTTPException(status_code=500, detail=f"Concatenation failed: {str(e)}")


# Voice Profile Management Endpoints

class SavedVoice(BaseModel):
    """Model for saved voice profiles"""
    id: Optional[str] = None
    name: str
    parameters: Dict[str, Any]
    voiceReferenceData: Optional[str] = None
    voiceReferenceUrl: Optional[str] = None
    createdAt: Optional[str] = None


@app.get("/voices")
async def list_voices():
    """Get all saved voice profiles"""
    try:
        voices = voice_storage.list_voices()
        return {"success": True, "voices": voices}
    except Exception as e:
        logger.error(f"Failed to list voices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/voices/{voice_id}")
async def get_voice(voice_id: str):
    """Get a specific voice profile by ID"""
    voice = voice_storage.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"success": True, "voice": voice}


@app.post("/voices")
async def save_voice(voice: SavedVoice):
    """Save a new voice profile"""
    try:
        saved_voice = voice_storage.save_voice(voice.dict(exclude_none=True))
        return {"success": True, "voice": saved_voice}
    except Exception as e:
        logger.error(f"Failed to save voice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a voice profile"""
    deleted = voice_storage.delete_voice(voice_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Voice not found")
    return {"success": True, "message": "Voice deleted"}


@app.get("/voices/{voice_id}/audio")
async def get_voice_audio(voice_id: str):
    """Get the audio file for a voice profile"""
    audio_file = voice_storage.get_audio_file(voice_id)
    if not audio_file:
        raise HTTPException(status_code=404, detail="Voice audio not found")
    
    return FileResponse(
        audio_file,
        media_type="audio/wav",
        filename=f"voice_{voice_id}.wav"
    )


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", "6093"))
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        workers=1,  # Single worker to avoid model loading issues
        log_level="info",
        timeout_keep_alive=300,  # 5 minutes
        timeout_graceful_shutdown=30
    )