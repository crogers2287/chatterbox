#!/usr/bin/env python3
"""
Recovery token management service.
High-level operations for audio file recovery tokens with validation and security.
"""

import os
import asyncio
import tempfile
import mimetypes
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, BinaryIO
from dataclasses import dataclass
import hashlib
import uuid

from recovery_database import RecoveryDatabase, RecoveryToken, create_session_hash

logger = logging.getLogger(__name__)

@dataclass
class TokenResponse:
    """Response data for token creation."""
    token: str
    expires_at: str
    file_size: int
    checksum: str

@dataclass
class RecoveryConfig:
    """Configuration for recovery service."""
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    token_ttl_hours: int = 24
    rate_limit_tokens: int = 10  # per hour per session
    rate_limit_window_hours: int = 1
    allowed_mime_types: List[str] = None
    recovery_storage_path: str = "/tmp/chatterbox-recovery"
    
    def __post_init__(self):
        if self.allowed_mime_types is None:
            self.allowed_mime_types = [
                'audio/wav',
                'audio/wave',
                'audio/x-wav',
                'audio/mpeg',
                'audio/mp3',
                'audio/ogg',
                'audio/webm',
                'audio/flac',
                'audio/x-flac',
                'audio/aac',
                'audio/x-aac'
            ]

class RecoveryServiceError(Exception):
    """Base exception for recovery service errors."""
    pass

class RateLimitError(RecoveryServiceError):
    """Rate limit exceeded error."""
    pass

class InvalidFileError(RecoveryServiceError):
    """Invalid file error."""
    pass

class TokenNotFoundError(RecoveryServiceError):
    """Token not found error."""
    pass

class TokenExpiredError(RecoveryServiceError):
    """Token expired error."""
    pass

class RecoveryService:
    """
    High-level recovery token management service.
    Handles file validation, token creation, and retrieval with security measures.
    """
    
    def __init__(self, config: Optional[RecoveryConfig] = None, db: Optional[RecoveryDatabase] = None):
        """
        Initialize recovery service.
        
        Args:
            config: Service configuration
            db: Database instance (optional, will create default if not provided)
        """
        self.config = config or RecoveryConfig()
        self.db = db or RecoveryDatabase()
        
        # Ensure recovery storage directory exists
        Path(self.config.recovery_storage_path).mkdir(exist_ok=True, parents=True)
        
        logger.info(f"Recovery service initialized with storage at {self.config.recovery_storage_path}")
    
    async def create_recovery_token(
        self,
        audio_file: BinaryIO,
        filename: str,
        session_identifier: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> TokenResponse:
        """
        Create a recovery token for an audio file.
        
        Args:
            audio_file: File-like object containing audio data
            filename: Original filename
            session_identifier: Session identifier for rate limiting
            metadata: Optional metadata dict
            
        Returns:
            TokenResponse: Token information
            
        Raises:
            RateLimitError: If rate limit exceeded
            InvalidFileError: If file is invalid
            RecoveryServiceError: For other service errors
        """
        # Create session hash for rate limiting
        session_hash = create_session_hash(session_identifier)
        
        # Check rate limits
        await self._check_rate_limits(session_hash)
        
        # Validate file
        file_data = audio_file.read()
        await self._validate_file(file_data, filename)
        
        # Create temporary storage file
        stored_path = await self._store_file(file_data, filename)
        
        try:
            # Create database token
            token_record = await self.db.create_token(
                file_path=stored_path,
                file_size=len(file_data),
                session_hash=session_hash,
                ttl_hours=self.config.token_ttl_hours
            )
            
            logger.info(f"Created recovery token for {filename} (size: {len(file_data)} bytes)")
            
            return TokenResponse(
                token=token_record.token,
                expires_at=token_record.expires_at.isoformat(),
                file_size=token_record.file_size,
                checksum=token_record.checksum
            )
            
        except Exception as e:
            # Clean up stored file if token creation failed
            try:
                if os.path.exists(stored_path):
                    os.remove(stored_path)
            except OSError:
                pass  # Ignore cleanup errors
            raise RecoveryServiceError(f"Failed to create recovery token: {str(e)}")
    
    async def retrieve_audio_file(self, token: str) -> tuple[bytes, str, str]:
        """
        Retrieve audio file using recovery token.
        
        Args:
            token: Recovery token string
            
        Returns:
            tuple[bytes, str, str]: (file_data, filename, mime_type)
            
        Raises:
            TokenNotFoundError: If token not found
            TokenExpiredError: If token expired
            RecoveryServiceError: For other service errors
        """
        # Get token from database
        token_record = await self.db.get_token(token)
        if not token_record:
            raise TokenNotFoundError(f"Recovery token not found or expired: {token}")
        
        # Check if already retrieved (one-time use)
        if token_record.retrieved_at:
            raise TokenExpiredError(f"Recovery token already used: {token}")
        
        # Check file exists
        if not os.path.exists(token_record.file_path):
            logger.error(f"File not found for token {token}: {token_record.file_path}")
            raise RecoveryServiceError("Audio file no longer available")
        
        try:
            # Read file data
            with open(token_record.file_path, 'rb') as f:
                file_data = f.read()
            
            # Verify checksum
            actual_checksum = hashlib.sha256(file_data).hexdigest()
            if actual_checksum != token_record.checksum:
                logger.error(f"Checksum mismatch for token {token}")
                raise RecoveryServiceError("File integrity check failed")
            
            # Mark token as retrieved
            marked = await self.db.mark_retrieved(token)
            if not marked:
                logger.warning(f"Failed to mark token {token} as retrieved")
            
            # Determine filename and mime type
            filename = self._extract_filename_from_path(token_record.file_path)
            mime_type = self._get_mime_type(filename)
            
            logger.info(f"Retrieved audio file for token {token} (size: {len(file_data)} bytes)")
            
            return file_data, filename, mime_type
            
        except Exception as e:
            if isinstance(e, (TokenNotFoundError, TokenExpiredError, RecoveryServiceError)):
                raise
            raise RecoveryServiceError(f"Failed to retrieve audio file: {str(e)}")
    
    async def cleanup_expired_tokens(self) -> int:
        """
        Clean up expired tokens and files.
        
        Returns:
            int: Number of tokens cleaned up
        """
        try:
            count = await self.db.cleanup_expired()
            if count > 0:
                logger.info(f"Recovery cleanup completed: {count} tokens removed")
            return count
        except Exception as e:
            logger.error(f"Recovery cleanup failed: {str(e)}")
            return 0
    
    async def get_service_stats(self) -> Dict[str, Any]:
        """
        Get service statistics.
        
        Returns:
            Dict with service statistics
        """
        db_stats = await self.db.get_storage_stats()
        
        # Add service-level stats
        stats = {
            **db_stats,
            "config": {
                "max_file_size_mb": self.config.max_file_size / (1024 * 1024),
                "token_ttl_hours": self.config.token_ttl_hours,
                "rate_limit_per_hour": self.config.rate_limit_tokens,
                "allowed_mime_types": len(self.config.allowed_mime_types)
            },
            "storage_path": self.config.recovery_storage_path
        }
        
        return stats
    
    async def _check_rate_limits(self, session_hash: str) -> None:
        """
        Check rate limits for session.
        
        Args:
            session_hash: Session hash for rate limiting
            
        Raises:
            RateLimitError: If rate limit exceeded
        """
        count = await self.db.count_tokens_for_session(
            session_hash, 
            self.config.rate_limit_window_hours
        )
        
        if count >= self.config.rate_limit_tokens:
            logger.warning(f"Rate limit exceeded for session {session_hash[:8]}...")
            raise RateLimitError(
                f"Rate limit exceeded: {count}/{self.config.rate_limit_tokens} "
                f"tokens in {self.config.rate_limit_window_hours} hour(s)"
            )
    
    async def _validate_file(self, file_data: bytes, filename: str) -> None:
        """
        Validate audio file.
        
        Args:
            file_data: File binary data
            filename: Original filename
            
        Raises:
            InvalidFileError: If file is invalid
        """
        # Check file size
        if len(file_data) == 0:
            raise InvalidFileError("File is empty")
        
        if len(file_data) > self.config.max_file_size:
            size_mb = len(file_data) / (1024 * 1024)
            max_mb = self.config.max_file_size / (1024 * 1024)
            raise InvalidFileError(f"File too large: {size_mb:.1f}MB > {max_mb}MB")
        
        # Check mime type
        mime_type = self._get_mime_type(filename)
        if mime_type not in self.config.allowed_mime_types:
            raise InvalidFileError(f"Unsupported file type: {mime_type}")
        
        # Basic audio file validation (check for audio headers)
        if not self._is_valid_audio_file(file_data, mime_type):
            raise InvalidFileError("File does not appear to be valid audio")
    
    def _is_valid_audio_file(self, file_data: bytes, mime_type: str) -> bool:
        """
        Basic validation for audio file headers.
        
        Args:
            file_data: File binary data
            mime_type: MIME type
            
        Returns:
            bool: True if file appears to be valid audio
        """
        if len(file_data) < 12:
            return False
        
        # Check common audio file signatures
        if mime_type in ['audio/wav', 'audio/wave', 'audio/x-wav']:
            # WAV files start with "RIFF" and contain "WAVE"
            return file_data[:4] == b'RIFF' and file_data[8:12] == b'WAVE'
        
        elif mime_type in ['audio/mpeg', 'audio/mp3']:
            # MP3 files start with ID3 tag or sync frame
            return (file_data[:3] == b'ID3' or 
                   (file_data[0] == 0xFF and (file_data[1] & 0xE0) == 0xE0))
        
        elif mime_type == 'audio/ogg':
            # OGG files start with "OggS"
            return file_data[:4] == b'OggS'
        
        elif mime_type in ['audio/flac', 'audio/x-flac']:
            # FLAC files start with "fLaC"
            return file_data[:4] == b'fLaC'
        
        elif mime_type in ['audio/aac', 'audio/x-aac']:
            # AAC files often start with ADTS sync (0xFF 0xF1 or similar)
            return file_data[0] == 0xFF and (file_data[1] & 0xF0) == 0xF0
        
        elif mime_type == 'audio/webm':
            # WebM files start with EBML header (0x1A 0x45 0xDF 0xA3)
            return file_data[:4] == b'\x1a\x45\xdf\xa3'
        
        # If we don't recognize the format, assume it's valid
        return True
    
    async def _store_file(self, file_data: bytes, filename: str) -> str:
        """
        Store file in recovery storage.
        
        Args:
            file_data: File binary data
            filename: Original filename
            
        Returns:
            str: Path to stored file
        """
        # Generate unique filename
        file_ext = Path(filename).suffix.lower()
        stored_filename = f"{uuid.uuid4()}{file_ext}"
        stored_path = os.path.join(self.config.recovery_storage_path, stored_filename)
        
        # Write file atomically
        temp_path = stored_path + '.tmp'
        try:
            with open(temp_path, 'wb') as f:
                f.write(file_data)
            
            # Atomic move
            os.rename(temp_path, stored_path)
            
            return stored_path
            
        except Exception as e:
            # Clean up temp file if it exists
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            raise RecoveryServiceError(f"Failed to store file: {str(e)}")
    
    def _get_mime_type(self, filename: str) -> str:
        """
        Get MIME type for filename.
        
        Args:
            filename: Filename
            
        Returns:
            str: MIME type
        """
        mime_type, _ = mimetypes.guess_type(filename)
        return mime_type or 'application/octet-stream'
    
    def _extract_filename_from_path(self, file_path: str) -> str:
        """
        Extract a reasonable filename from storage path.
        
        Args:
            file_path: Storage file path
            
        Returns:
            str: Extracted filename
        """
        base_name = Path(file_path).name
        # If it's a UUID filename, create a generic name
        if len(base_name.split('.')[0]) == 36:  # UUID length
            ext = Path(file_path).suffix
            return f"recovered_audio{ext}"
        return base_name

# Global service instance
_service_instance: Optional[RecoveryService] = None

def get_recovery_service() -> RecoveryService:
    """Get global recovery service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = RecoveryService()
    return _service_instance

# Background cleanup task
async def start_cleanup_task(service: Optional[RecoveryService] = None, interval_hours: int = 1):
    """
    Start background cleanup task.
    
    Args:
        service: Recovery service instance
        interval_hours: Cleanup interval in hours
    """
    if service is None:
        service = get_recovery_service()
    
    logger.info(f"Starting recovery cleanup task (interval: {interval_hours}h)")
    
    while True:
        try:
            await asyncio.sleep(interval_hours * 3600)  # Convert hours to seconds
            await service.cleanup_expired_tokens()
        except asyncio.CancelledError:
            logger.info("Recovery cleanup task cancelled")
            break
        except Exception as e:
            logger.error(f"Recovery cleanup task error: {str(e)}")
            # Continue running despite errors

if __name__ == "__main__":
    # Test the service
    import asyncio
    
    async def test_service():
        service = RecoveryService()
        
        # Create test audio data
        test_audio = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
        
        # Test token creation
        from io import BytesIO
        audio_file = BytesIO(test_audio)
        
        try:
            token = await service.create_recovery_token(
                audio_file, 
                "test.wav", 
                "127.0.0.1:test-session"
            )
            print(f"Created token: {token.token}")
            
            # Test retrieval
            data, filename, mime_type = await service.retrieve_audio_file(token.token)
            print(f"Retrieved: {filename} ({mime_type}) - {len(data)} bytes")
            
            # Test stats
            stats = await service.get_service_stats()
            print(f"Stats: {stats}")
            
        except Exception as e:
            print(f"Test failed: {e}")
    
    asyncio.run(test_service())