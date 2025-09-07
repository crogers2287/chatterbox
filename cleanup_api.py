"""
API endpoints for cleanup service integration
"""

from fastapi import APIRouter, HTTPException
from typing import Dict
import asyncio
import logging

from services.cleanup import create_cleanup_service, create_scheduled_cleanup

logger = logging.getLogger(__name__)

# Create router
cleanup_router = APIRouter(prefix="/api/cleanup", tags=["cleanup"])

# Global cleanup service instance
cleanup_service = create_cleanup_service()
scheduled_service = None


@cleanup_router.post("/manual")
async def manual_cleanup() -> Dict:
    """
    Trigger manual cleanup process
    """
    try:
        result = await cleanup_service.run_cleanup()
        return {
            "status": "success",
            "result": result,
            "metrics": cleanup_service.get_metrics()
        }
    except Exception as e:
        logger.error(f"Manual cleanup failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@cleanup_router.get("/metrics")
async def get_cleanup_metrics() -> Dict:
    """
    Get cleanup service metrics
    """
    return {
        "status": "success",
        "metrics": cleanup_service.get_metrics()
    }


@cleanup_router.post("/schedule/start")
async def start_scheduled_cleanup(interval_hours: float = 1.0) -> Dict:
    """
    Start scheduled cleanup service
    """
    global scheduled_service
    
    if scheduled_service and scheduled_service.running:
        return {
            "status": "already_running",
            "message": "Scheduled cleanup is already running"
        }
    
    try:
        scheduled_service = create_scheduled_cleanup(cleanup_service, interval_hours)
        await scheduled_service.start()
        
        return {
            "status": "success",
            "message": f"Scheduled cleanup started with {interval_hours}h interval"
        }
    except Exception as e:
        logger.error(f"Failed to start scheduled cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@cleanup_router.post("/schedule/stop")
async def stop_scheduled_cleanup() -> Dict:
    """
    Stop scheduled cleanup service
    """
    global scheduled_service
    
    if not scheduled_service:
        return {
            "status": "not_running",
            "message": "Scheduled cleanup is not running"
        }
    
    try:
        await scheduled_service.stop()
        scheduled_service = None
        
        return {
            "status": "success",
            "message": "Scheduled cleanup stopped"
        }
    except Exception as e:
        logger.error(f"Failed to stop scheduled cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@cleanup_router.get("/schedule/status")
async def get_schedule_status() -> Dict:
    """
    Get scheduled cleanup status
    """
    return {
        "status": "success",
        "scheduled": scheduled_service is not None and scheduled_service.running,
        "interval_hours": scheduled_service.interval_seconds / 3600 if scheduled_service else None
    }


# Integration function for FastAPI app
def register_cleanup_routes(app):
    """
    Register cleanup routes with the FastAPI app
    """
    app.include_router(cleanup_router)
    
    # Start scheduled cleanup on app startup
    @app.on_event("startup")
    async def startup_cleanup():
        global scheduled_service
        try:
            scheduled_service = create_scheduled_cleanup(cleanup_service, interval_hours=1.0)
            await scheduled_service.start()
            logger.info("Scheduled cleanup service started automatically")
        except Exception as e:
            logger.error(f"Failed to start scheduled cleanup on startup: {e}")
    
    # Stop scheduled cleanup on app shutdown
    @app.on_event("shutdown")
    async def shutdown_cleanup():
        global scheduled_service
        if scheduled_service:
            try:
                await scheduled_service.stop()
                logger.info("Scheduled cleanup service stopped")
            except Exception as e:
                logger.error(f"Error stopping scheduled cleanup: {e}")