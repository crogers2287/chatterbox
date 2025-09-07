"""
Cleanup Service for Recovery System
Handles automated cleanup of expired recovery tokens and associated files
"""

import asyncio
import json
import logging
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

class CleanupService:
    """Service for cleaning up expired recovery tokens and storage"""
    
    def __init__(
        self,
        storage_path: str = "./recovery_storage",
        token_file: str = "./recovery_tokens.json",
        retention_hours: int = 24,
        max_storage_mb: int = 1024
    ):
        self.storage_path = Path(storage_path)
        self.token_file = Path(token_file)
        self.retention_hours = retention_hours
        self.max_storage_bytes = max_storage_mb * 1024 * 1024
        
        # Ensure storage directory exists
        self.storage_path.mkdir(exist_ok=True)
        
        # Metrics
        self.metrics = {
            "tokens_cleaned": 0,
            "files_cleaned": 0,
            "bytes_freed": 0,
            "errors": 0,
            "last_cleanup": None,
            "last_error": None
        }
    
    def load_tokens(self) -> Dict[str, dict]:
        """Load recovery tokens from JSON file"""
        if not self.token_file.exists():
            return {}
        
        try:
            with open(self.token_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load tokens: {e}")
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            return {}
    
    def save_tokens(self, tokens: Dict[str, dict]) -> bool:
        """Save recovery tokens to JSON file"""
        try:
            with open(self.token_file, 'w') as f:
                json.dump(tokens, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save tokens: {e}")
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            return False
    
    def is_expired(self, token_data: dict) -> bool:
        """Check if a token has expired"""
        try:
            expiry = datetime.fromisoformat(token_data.get("expires_at", ""))
            return datetime.utcnow() > expiry
        except:
            # If we can't parse the expiry, consider it expired
            return True
    
    def get_storage_size(self) -> int:
        """Get total size of recovery storage in bytes"""
        total_size = 0
        try:
            for path in self.storage_path.rglob("*"):
                if path.is_file():
                    total_size += path.stat().st_size
        except Exception as e:
            logger.error(f"Failed to calculate storage size: {e}")
        return total_size
    
    async def cleanup_expired_tokens(self) -> Tuple[int, int, int]:
        """
        Clean up expired tokens and their associated files
        Returns: (tokens_cleaned, files_cleaned, bytes_freed)
        """
        tokens_cleaned = 0
        files_cleaned = 0
        bytes_freed = 0
        
        logger.info("Starting expired token cleanup")
        
        # Load current tokens
        tokens = self.load_tokens()
        active_tokens = {}
        
        for token, data in tokens.items():
            if self.is_expired(data):
                # Clean up associated file
                if "file_path" in data:
                    file_path = Path(data["file_path"])
                    if file_path.exists():
                        try:
                            file_size = file_path.stat().st_size
                            file_path.unlink()
                            files_cleaned += 1
                            bytes_freed += file_size
                            logger.info(f"Deleted expired file: {file_path}")
                        except Exception as e:
                            logger.error(f"Failed to delete file {file_path}: {e}")
                            self.metrics["errors"] += 1
                
                tokens_cleaned += 1
                logger.info(f"Cleaned expired token: {token}")
            else:
                # Keep active tokens
                active_tokens[token] = data
        
        # Save active tokens back
        if tokens_cleaned > 0:
            self.save_tokens(active_tokens)
        
        # Update metrics
        self.metrics["tokens_cleaned"] += tokens_cleaned
        self.metrics["files_cleaned"] += files_cleaned
        self.metrics["bytes_freed"] += bytes_freed
        self.metrics["last_cleanup"] = datetime.utcnow().isoformat()
        
        logger.info(
            f"Cleanup complete: {tokens_cleaned} tokens, "
            f"{files_cleaned} files, {bytes_freed} bytes freed"
        )
        
        return tokens_cleaned, files_cleaned, bytes_freed
    
    async def cleanup_orphaned_files(self) -> Tuple[int, int]:
        """
        Clean up orphaned files not associated with any token
        Returns: (files_cleaned, bytes_freed)
        """
        files_cleaned = 0
        bytes_freed = 0
        
        logger.info("Starting orphaned file cleanup")
        
        # Get all valid file paths from tokens
        tokens = self.load_tokens()
        valid_files = {
            Path(data["file_path"])
            for data in tokens.values()
            if "file_path" in data
        }
        
        # Find and clean orphaned files
        try:
            for file_path in self.storage_path.rglob("*"):
                if file_path.is_file() and file_path not in valid_files:
                    try:
                        file_size = file_path.stat().st_size
                        file_path.unlink()
                        files_cleaned += 1
                        bytes_freed += file_size
                        logger.info(f"Deleted orphaned file: {file_path}")
                    except Exception as e:
                        logger.error(f"Failed to delete orphaned file {file_path}: {e}")
                        self.metrics["errors"] += 1
        except Exception as e:
            logger.error(f"Error during orphaned file cleanup: {e}")
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
        
        # Update metrics
        self.metrics["files_cleaned"] += files_cleaned
        self.metrics["bytes_freed"] += bytes_freed
        
        logger.info(f"Orphaned cleanup complete: {files_cleaned} files, {bytes_freed} bytes freed")
        
        return files_cleaned, bytes_freed
    
    async def emergency_cleanup(self) -> Tuple[int, int, int]:
        """
        Emergency cleanup when storage quota is exceeded
        Deletes oldest tokens first until under quota
        Returns: (tokens_cleaned, files_cleaned, bytes_freed)
        """
        tokens_cleaned = 0
        files_cleaned = 0
        bytes_freed = 0
        
        logger.warning("Starting emergency cleanup due to quota exceeded")
        
        # Load and sort tokens by creation time
        tokens = self.load_tokens()
        sorted_tokens = sorted(
            tokens.items(),
            key=lambda x: x[1].get("created_at", ""),
        )
        
        current_size = self.get_storage_size()
        
        # Delete oldest tokens until under quota
        for token, data in sorted_tokens:
            if current_size <= self.max_storage_bytes * 0.8:  # Target 80% of quota
                break
            
            # Delete file
            if "file_path" in data:
                file_path = Path(data["file_path"])
                if file_path.exists():
                    try:
                        file_size = file_path.stat().st_size
                        file_path.unlink()
                        files_cleaned += 1
                        bytes_freed += file_size
                        current_size -= file_size
                    except Exception as e:
                        logger.error(f"Failed to delete file {file_path}: {e}")
                        self.metrics["errors"] += 1
            
            # Remove token
            del tokens[token]
            tokens_cleaned += 1
        
        # Save remaining tokens
        self.save_tokens(tokens)
        
        # Update metrics
        self.metrics["tokens_cleaned"] += tokens_cleaned
        self.metrics["files_cleaned"] += files_cleaned
        self.metrics["bytes_freed"] += bytes_freed
        
        logger.info(
            f"Emergency cleanup complete: {tokens_cleaned} tokens, "
            f"{files_cleaned} files, {bytes_freed} bytes freed"
        )
        
        return tokens_cleaned, files_cleaned, bytes_freed
    
    async def check_storage_quota(self) -> bool:
        """Check if storage quota is exceeded"""
        current_size = self.get_storage_size()
        quota_exceeded = current_size > self.max_storage_bytes
        
        if quota_exceeded:
            logger.warning(
                f"Storage quota exceeded: {current_size}/{self.max_storage_bytes} bytes"
            )
        
        return quota_exceeded
    
    async def run_cleanup(self) -> Dict[str, int]:
        """
        Run full cleanup process
        Returns metrics dictionary
        """
        logger.info("Starting cleanup process")
        
        # Reset per-run counters
        tokens_cleaned = 0
        files_cleaned = 0
        bytes_freed = 0
        
        try:
            # First, clean expired tokens
            tc, fc, bf = await self.cleanup_expired_tokens()
            tokens_cleaned += tc
            files_cleaned += fc
            bytes_freed += bf
            
            # Then, clean orphaned files
            fc, bf = await self.cleanup_orphaned_files()
            files_cleaned += fc
            bytes_freed += bf
            
            # Check if emergency cleanup is needed
            if await self.check_storage_quota():
                tc, fc, bf = await self.emergency_cleanup()
                tokens_cleaned += tc
                files_cleaned += fc
                bytes_freed += bf
            
            logger.info(
                f"Total cleanup: {tokens_cleaned} tokens, "
                f"{files_cleaned} files, {bytes_freed} bytes freed"
            )
            
            return {
                "tokens_cleaned": tokens_cleaned,
                "files_cleaned": files_cleaned,
                "bytes_freed": bytes_freed,
                "storage_size": self.get_storage_size(),
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            self.metrics["errors"] += 1
            self.metrics["last_error"] = str(e)
            return {
                "tokens_cleaned": tokens_cleaned,
                "files_cleaned": files_cleaned,
                "bytes_freed": bytes_freed,
                "storage_size": self.get_storage_size(),
                "success": False,
                "error": str(e)
            }
    
    def get_metrics(self) -> Dict:
        """Get cleanup service metrics"""
        return {
            **self.metrics,
            "storage_size": self.get_storage_size(),
            "storage_limit": self.max_storage_bytes,
            "retention_hours": self.retention_hours
        }


class ScheduledCleanupService:
    """Scheduled cleanup service that runs periodically"""
    
    def __init__(
        self,
        cleanup_service: CleanupService,
        interval_hours: float = 1.0
    ):
        self.cleanup_service = cleanup_service
        self.interval_seconds = interval_hours * 3600
        self.running = False
        self.task: Optional[asyncio.Task] = None
        
    async def start(self):
        """Start the scheduled cleanup service"""
        if self.running:
            logger.warning("Scheduled cleanup service already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._run_periodic())
        logger.info(f"Scheduled cleanup service started (interval: {self.interval_seconds}s)")
    
    async def stop(self):
        """Stop the scheduled cleanup service"""
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("Scheduled cleanup service stopped")
    
    async def _run_periodic(self):
        """Run cleanup periodically"""
        while self.running:
            try:
                # Run cleanup
                await self.cleanup_service.run_cleanup()
                
                # Wait for next interval
                await asyncio.sleep(self.interval_seconds)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduled cleanup: {e}")
                # Continue running even if cleanup fails
                await asyncio.sleep(self.interval_seconds)


# Convenience functions for integration
def create_cleanup_service(
    storage_path: str = "./recovery_storage",
    token_file: str = "./recovery_tokens.json",
    retention_hours: int = 24,
    max_storage_mb: int = 1024
) -> CleanupService:
    """Create a cleanup service instance"""
    return CleanupService(storage_path, token_file, retention_hours, max_storage_mb)


def create_scheduled_cleanup(
    cleanup_service: CleanupService,
    interval_hours: float = 1.0
) -> ScheduledCleanupService:
    """Create a scheduled cleanup service"""
    return ScheduledCleanupService(cleanup_service, interval_hours)