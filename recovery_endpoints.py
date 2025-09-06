#!/usr/bin/env python3
"""
Recovery token API endpoints for FastAPI integration.
Provides REST API for audio file recovery token management.
"""

import os
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from io import BytesIO

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
import uvicorn

from recovery_service import (
    RecoveryService, 
    RecoveryServiceError, 
    RateLimitError, 
    InvalidFileError, 
    TokenNotFoundError, 
    TokenExpiredError,
    get_recovery_service
)

logger = logging.getLogger(__name__)

# Pydantic models
class TokenGenerationRequest(BaseModel):
    """Request model for token generation metadata."""
    duration: Optional[float] = Field(None, description="Audio duration in seconds")
    timestamp: Optional[str] = Field(None, description="Creation timestamp")
    user_session: Optional[str] = Field(None, description="User session identifier")

class TokenGenerationResponse(BaseModel):
    """Response model for token generation."""
    success: bool
    token: str
    expires_at: str
    file_size: int
    checksum: str
    message: str

class RecoveryStatsResponse(BaseModel):
    """Response model for recovery statistics."""
    success: bool
    stats: Dict[str, Any]

class ErrorResponse(BaseModel):
    """Error response model."""
    success: bool = False
    error: str
    details: Optional[str] = None

# Create router
recovery_router = APIRouter(prefix="/api/recovery", tags=["recovery"])

def get_client_identifier(request: Request) -> str:
    """
    Extract client identifier for rate limiting.
    
    Args:
        request: FastAPI request object
        
    Returns:
        str: Client identifier string
    """
    # Combine IP address and User-Agent for session identification
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    return f"{client_ip}:{user_agent}"

@recovery_router.post("/audio/token", response_model=TokenGenerationResponse)
async def generate_recovery_token(
    request: Request,
    audio_file: UploadFile = File(..., description="Audio file to create recovery token for"),
    metadata: Optional[str] = Form(None, description="JSON metadata (optional)")
):
    """
    Generate a recovery token for an audio file.
    
    The token allows recovery of the audio file for 24 hours after creation.
    Rate limited to 10 tokens per session per hour.
    
    Args:
        audio_file: Audio file (max 50MB)
        metadata: Optional JSON metadata
        
    Returns:
        TokenGenerationResponse: Token information
        
    Raises:
        400: Invalid file or rate limit exceeded
        413: File too large
        500: Internal server error
    """
    service = get_recovery_service()
    client_id = get_client_identifier(request)
    
    try:
        # Validate file size before processing
        if audio_file.size and audio_file.size > service.config.max_file_size:
            size_mb = audio_file.size / (1024 * 1024)
            max_mb = service.config.max_file_size / (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=f"File too large: {size_mb:.1f}MB exceeds {max_mb}MB limit"
            )
        
        # Read file content
        file_content = await audio_file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="Empty file uploaded")
        
        # Create file-like object for service
        file_obj = BytesIO(file_content)
        
        # Parse metadata if provided
        metadata_dict = {}
        if metadata:
            try:
                import json
                metadata_dict = json.loads(metadata)
            except json.JSONDecodeError:
                logger.warning("Invalid metadata JSON provided, ignoring")
        
        # Generate token
        token_response = await service.create_recovery_token(
            audio_file=file_obj,
            filename=audio_file.filename or "audio.wav",
            session_identifier=client_id,
            metadata=metadata_dict
        )
        
        logger.info(f"Generated recovery token for {audio_file.filename} from {client_id}")
        
        return TokenGenerationResponse(
            success=True,
            token=token_response.token,
            expires_at=token_response.expires_at,
            file_size=token_response.file_size,
            checksum=token_response.checksum,
            message="Recovery token generated successfully"
        )
        
    except RateLimitError as e:
        logger.warning(f"Rate limit exceeded for {client_id}: {str(e)}")
        raise HTTPException(status_code=429, detail=str(e))
    
    except InvalidFileError as e:
        logger.warning(f"Invalid file from {client_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    
    except RecoveryServiceError as e:
        logger.error(f"Service error for {client_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate recovery token")
    
    except Exception as e:
        logger.error(f"Unexpected error generating token: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@recovery_router.get("/audio/{token}")
async def retrieve_audio_file(token: str):
    """
    Retrieve audio file using recovery token.
    
    This is a one-time use operation. The token becomes invalid after successful retrieval.
    
    Args:
        token: Recovery token UUID
        
    Returns:
        Audio file response with appropriate headers
        
    Raises:
        404: Token not found or expired
        410: Token already used
        500: Internal server error
    """
    service = get_recovery_service()
    
    try:
        # Retrieve audio file
        file_data, filename, mime_type = await service.retrieve_audio_file(token)
        
        logger.info(f"Retrieved audio file for token {token}: {filename}")
        
        # Return file response with appropriate headers
        return Response(
            content=file_data,
            media_type=mime_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(file_data)),
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
        
    except TokenNotFoundError:
        logger.warning(f"Token not found: {token}")
        raise HTTPException(status_code=404, detail="Recovery token not found or expired")
    
    except TokenExpiredError:
        logger.warning(f"Token already used: {token}")
        raise HTTPException(status_code=410, detail="Recovery token already used")
    
    except RecoveryServiceError as e:
        logger.error(f"Service error retrieving token {token}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve audio file")
    
    except Exception as e:
        logger.error(f"Unexpected error retrieving token {token}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@recovery_router.get("/stats", response_model=RecoveryStatsResponse)
async def get_recovery_stats():
    """
    Get recovery service statistics.
    
    Returns information about token storage, usage, and configuration.
    
    Returns:
        RecoveryStatsResponse: Service statistics
    """
    service = get_recovery_service()
    
    try:
        stats = await service.get_service_stats()
        
        return RecoveryStatsResponse(
            success=True,
            stats=stats
        )
        
    except Exception as e:
        logger.error(f"Error getting recovery stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")

@recovery_router.post("/cleanup")
async def manual_cleanup():
    """
    Manually trigger cleanup of expired tokens.
    
    This endpoint allows manual cleanup outside of the scheduled task.
    Useful for testing or administrative purposes.
    
    Returns:
        Dict with cleanup results
    """
    service = get_recovery_service()
    
    try:
        cleaned_count = await service.cleanup_expired_tokens()
        
        logger.info(f"Manual cleanup completed: {cleaned_count} tokens removed")
        
        return {
            "success": True,
            "message": f"Cleanup completed successfully",
            "tokens_removed": cleaned_count
        }
        
    except Exception as e:
        logger.error(f"Error during manual cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail="Cleanup failed")

@recovery_router.get("/health")
async def recovery_health_check():
    """
    Health check for recovery service.
    
    Returns basic service status and connectivity.
    
    Returns:
        Dict with health status
    """
    try:
        service = get_recovery_service()
        stats = await service.get_service_stats()
        
        # Basic health indicators
        health_status = {
            "success": True,
            "status": "healthy",
            "database_accessible": True,
            "storage_accessible": os.path.exists(service.config.recovery_storage_path),
            "active_tokens": stats.get("active_tokens", 0),
            "storage_path": service.config.recovery_storage_path,
            "max_file_size_mb": service.config.max_file_size / (1024 * 1024),
            "rate_limit": f"{service.config.rate_limit_tokens} tokens per {service.config.rate_limit_window_hours}h"
        }
        
        return health_status
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "success": False,
            "status": "unhealthy",
            "error": str(e)
        }

# Error handlers
@recovery_router.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Custom HTTP exception handler for recovery endpoints."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail,
            details=getattr(exc, 'details', None)
        ).dict()
    )

@recovery_router.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """General exception handler for recovery endpoints."""
    logger.error(f"Unhandled exception in recovery endpoint: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            details="An unexpected error occurred"
        ).dict()
    )

# Integration function for main FastAPI app
def add_recovery_endpoints(app):
    """
    Add recovery endpoints to FastAPI app.
    
    Args:
        app: FastAPI application instance
    """
    app.include_router(recovery_router)
    
    # Add startup event to initialize cleanup task
    @app.on_event("startup")
    async def start_recovery_cleanup():
        """Start background cleanup task."""
        import asyncio
        from recovery_service import start_cleanup_task
        
        # Start cleanup task in background
        asyncio.create_task(start_cleanup_task())
        logger.info("Recovery token cleanup task started")

if __name__ == "__main__":
    # Test the endpoints
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    
    app = FastAPI(title="Recovery Token API Test")
    
    # Add CORS for testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Add recovery endpoints
    add_recovery_endpoints(app)
    
    # Run test server
    uvicorn.run(app, host="0.0.0.0", port=8000)