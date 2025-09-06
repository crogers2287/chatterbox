#!/usr/bin/env python3
"""
Comprehensive tests for the recovery token system.
Tests database, service, and API endpoint functionality.
"""

import os
import asyncio
import tempfile
import sqlite3
import pytest
import json
from datetime import datetime, timedelta
from pathlib import Path
from io import BytesIO
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from fastapi import FastAPI

# Import our modules
from recovery_database import RecoveryDatabase, create_session_hash
from recovery_service import (
    RecoveryService, 
    RecoveryConfig, 
    RecoveryServiceError, 
    RateLimitError, 
    InvalidFileError, 
    TokenNotFoundError, 
    TokenExpiredError
)
from recovery_endpoints import recovery_router

# Test data
TEST_AUDIO_WAV = (
    b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00'
    b'\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
)

TEST_AUDIO_MP3 = (
    b'\xff\xfb\x90\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
    b'\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
)

class TestRecoveryDatabase:
    """Test suite for RecoveryDatabase class."""
    
    @pytest.fixture
    async def db(self):
        """Create a temporary database for testing."""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
            db_path = tmp.name
        
        try:
            db = RecoveryDatabase(db_path)
            yield db
        finally:
            # Cleanup
            if os.path.exists(db_path):
                os.remove(db_path)
    
    @pytest.fixture
    def test_file(self):
        """Create a temporary test file."""
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            tmp.write(TEST_AUDIO_WAV)
            tmp.flush()
            yield tmp.name, len(TEST_AUDIO_WAV)
        
        # Cleanup
        if os.path.exists(tmp.name):
            os.remove(tmp.name)
    
    @pytest.mark.asyncio
    async def test_database_initialization(self, db):
        """Test database schema initialization."""
        # Check that tables were created
        with sqlite3.connect(db.db_path) as conn:
            cursor = conn.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='recovery_tokens'
            """)
            assert cursor.fetchone() is not None
    
    @pytest.mark.asyncio
    async def test_create_token(self, db, test_file):
        """Test token creation."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        token = await db.create_token(file_path, file_size, session_hash)
        
        assert token.token is not None
        assert len(token.token) == 36  # UUID v4 length
        assert token.file_path == file_path
        assert token.file_size == file_size
        assert token.session_hash == session_hash
        assert token.checksum is not None
        assert token.created_at is not None
        assert token.expires_at > token.created_at
    
    @pytest.mark.asyncio
    async def test_create_token_missing_file(self, db):
        """Test token creation with missing file."""
        session_hash = create_session_hash("test-session")
        
        with pytest.raises(FileNotFoundError):
            await db.create_token("/nonexistent/file.wav", 1000, session_hash)
    
    @pytest.mark.asyncio
    async def test_create_token_size_mismatch(self, db, test_file):
        """Test token creation with size mismatch."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        with pytest.raises(ValueError, match="File size mismatch"):
            await db.create_token(file_path, file_size + 100, session_hash)
    
    @pytest.mark.asyncio
    async def test_get_token(self, db, test_file):
        """Test token retrieval."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        # Create token
        created_token = await db.create_token(file_path, file_size, session_hash)
        
        # Retrieve token
        retrieved_token = await db.get_token(created_token.token)
        
        assert retrieved_token is not None
        assert retrieved_token.token == created_token.token
        assert retrieved_token.file_path == created_token.file_path
        assert retrieved_token.checksum == created_token.checksum
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_token(self, db):
        """Test retrieval of nonexistent token."""
        result = await db.get_token("nonexistent-token")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_mark_retrieved(self, db, test_file):
        """Test marking token as retrieved."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        # Create token
        token = await db.create_token(file_path, file_size, session_hash)
        
        # Mark as retrieved
        marked = await db.mark_retrieved(token.token)
        assert marked is True
        
        # Check that retrieved_at is set
        retrieved_token = await db.get_token(token.token)
        assert retrieved_token.retrieved_at is not None
        
        # Try to mark again (should return False)
        marked_again = await db.mark_retrieved(token.token)
        assert marked_again is False
    
    @pytest.mark.asyncio
    async def test_cleanup_expired(self, db, test_file):
        """Test cleanup of expired tokens."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        # Create token with short TTL
        token = await db.create_token(file_path, file_size, session_hash, ttl_hours=0)  # Expired immediately
        
        # Cleanup
        cleaned = await db.cleanup_expired()
        
        assert cleaned == 1
        
        # Verify token is gone
        retrieved = await db.get_token(token.token)
        assert retrieved is None
    
    @pytest.mark.asyncio
    async def test_count_tokens_for_session(self, db, test_file):
        """Test session token counting for rate limiting."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        # Create multiple tokens
        for i in range(3):
            await db.create_token(file_path, file_size, session_hash)
        
        # Count tokens
        count = await db.count_tokens_for_session(session_hash, hours=1)
        assert count == 3
        
        # Different session should have 0
        other_session = create_session_hash("other-session")
        other_count = await db.count_tokens_for_session(other_session, hours=1)
        assert other_count == 0
    
    @pytest.mark.asyncio
    async def test_storage_stats(self, db, test_file):
        """Test storage statistics."""
        file_path, file_size = test_file
        session_hash = create_session_hash("test-session")
        
        # Create some tokens
        token1 = await db.create_token(file_path, file_size, session_hash)
        token2 = await db.create_token(file_path, file_size, session_hash)
        
        # Mark one as retrieved
        await db.mark_retrieved(token1.token)
        
        # Get stats
        stats = await db.get_storage_stats()
        
        assert stats["total_tokens"] == 2
        assert stats["active_tokens"] == 1
        assert stats["retrieved_tokens"] == 1
        assert stats["total_file_size"] == file_size * 2


class TestRecoveryService:
    """Test suite for RecoveryService class."""
    
    @pytest.fixture
    async def service(self):
        """Create a test recovery service."""
        # Use temporary directories
        with tempfile.TemporaryDirectory() as temp_dir:
            with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
                db_path = tmp.name
            
            try:
                config = RecoveryConfig(
                    recovery_storage_path=temp_dir,
                    max_file_size=1024 * 1024,  # 1MB for testing
                    rate_limit_tokens=5  # Lower limit for testing
                )
                db = RecoveryDatabase(db_path)
                service = RecoveryService(config, db)
                yield service
            finally:
                if os.path.exists(db_path):
                    os.remove(db_path)
    
    @pytest.mark.asyncio
    async def test_create_recovery_token_success(self, service):
        """Test successful token creation."""
        audio_file = BytesIO(TEST_AUDIO_WAV)
        
        token = await service.create_recovery_token(
            audio_file=audio_file,
            filename="test.wav",
            session_identifier="127.0.0.1:test-browser"
        )
        
        assert token.token is not None
        assert token.file_size == len(TEST_AUDIO_WAV)
        assert token.checksum is not None
        assert token.expires_at is not None
    
    @pytest.mark.asyncio
    async def test_create_recovery_token_empty_file(self, service):
        """Test token creation with empty file."""
        audio_file = BytesIO(b"")
        
        with pytest.raises(InvalidFileError, match="File is empty"):
            await service.create_recovery_token(
                audio_file=audio_file,
                filename="empty.wav",
                session_identifier="127.0.0.1:test-browser"
            )
    
    @pytest.mark.asyncio
    async def test_create_recovery_token_file_too_large(self, service):
        """Test token creation with file too large."""
        large_file = BytesIO(b"x" * (2 * 1024 * 1024))  # 2MB, exceeds 1MB limit
        
        with pytest.raises(InvalidFileError, match="File too large"):
            await service.create_recovery_token(
                audio_file=large_file,
                filename="large.wav",
                session_identifier="127.0.0.1:test-browser"
            )
    
    @pytest.mark.asyncio
    async def test_create_recovery_token_invalid_format(self, service):
        """Test token creation with invalid file format."""
        audio_file = BytesIO(b"not audio data")
        
        with pytest.raises(InvalidFileError, match="Unsupported file type"):
            await service.create_recovery_token(
                audio_file=audio_file,
                filename="test.txt",  # Wrong extension
                session_identifier="127.0.0.1:test-browser"
            )
    
    @pytest.mark.asyncio
    async def test_create_recovery_token_invalid_audio_headers(self, service):
        """Test token creation with invalid audio headers."""
        audio_file = BytesIO(b"fake wav content")  # Wrong headers
        
        with pytest.raises(InvalidFileError, match="File does not appear to be valid audio"):
            await service.create_recovery_token(
                audio_file=audio_file,
                filename="fake.wav",
                session_identifier="127.0.0.1:test-browser"
            )
    
    @pytest.mark.asyncio
    async def test_rate_limiting(self, service):
        """Test rate limiting functionality."""
        session_id = "127.0.0.1:test-browser"
        
        # Create tokens up to the limit
        for i in range(service.config.rate_limit_tokens):
            audio_file = BytesIO(TEST_AUDIO_WAV)
            await service.create_recovery_token(
                audio_file=audio_file,
                filename=f"test{i}.wav",
                session_identifier=session_id
            )
        
        # Next one should fail
        audio_file = BytesIO(TEST_AUDIO_WAV)
        with pytest.raises(RateLimitError, match="Rate limit exceeded"):
            await service.create_recovery_token(
                audio_file=audio_file,
                filename="test_over_limit.wav",
                session_identifier=session_id
            )
    
    @pytest.mark.asyncio
    async def test_retrieve_audio_file_success(self, service):
        """Test successful audio file retrieval."""
        # Create token
        audio_file = BytesIO(TEST_AUDIO_WAV)
        token = await service.create_recovery_token(
            audio_file=audio_file,
            filename="test.wav",
            session_identifier="127.0.0.1:test-browser"
        )
        
        # Retrieve file
        file_data, filename, mime_type = await service.retrieve_audio_file(token.token)
        
        assert file_data == TEST_AUDIO_WAV
        assert filename == "recovered_audio.wav"  # Generic name for UUID files
        assert mime_type == "audio/wav"
    
    @pytest.mark.asyncio
    async def test_retrieve_audio_file_not_found(self, service):
        """Test retrieval with invalid token."""
        with pytest.raises(TokenNotFoundError, match="Recovery token not found"):
            await service.retrieve_audio_file("invalid-token")
    
    @pytest.mark.asyncio
    async def test_retrieve_audio_file_already_used(self, service):
        """Test retrieval of already used token."""
        # Create and retrieve token
        audio_file = BytesIO(TEST_AUDIO_WAV)
        token = await service.create_recovery_token(
            audio_file=audio_file,
            filename="test.wav",
            session_identifier="127.0.0.1:test-browser"
        )
        
        # First retrieval should work
        await service.retrieve_audio_file(token.token)
        
        # Second retrieval should fail
        with pytest.raises(TokenExpiredError, match="Recovery token already used"):
            await service.retrieve_audio_file(token.token)
    
    @pytest.mark.asyncio
    async def test_cleanup_expired_tokens(self, service):
        """Test cleanup of expired tokens."""
        # Create token
        audio_file = BytesIO(TEST_AUDIO_WAV)
        token = await service.create_recovery_token(
            audio_file=audio_file,
            filename="test.wav",
            session_identifier="127.0.0.1:test-browser"
        )
        
        # Manually expire the token by updating the database
        async with service.db.db_connection() as conn:
            await conn.execute("""
                UPDATE recovery_tokens 
                SET expires_at = datetime('now', '-1 hour')
                WHERE token = ?
            """, (token.token,))
            await conn.commit()
        
        # Cleanup should remove it
        cleaned = await service.cleanup_expired_tokens()
        assert cleaned >= 1
    
    @pytest.mark.asyncio
    async def test_get_service_stats(self, service):
        """Test service statistics."""
        # Create some tokens
        for i in range(2):
            audio_file = BytesIO(TEST_AUDIO_WAV)
            await service.create_recovery_token(
                audio_file=audio_file,
                filename=f"test{i}.wav",
                session_identifier="127.0.0.1:test-browser"
            )
        
        stats = await service.get_service_stats()
        
        assert "total_tokens" in stats
        assert "config" in stats
        assert stats["total_tokens"] >= 2
        assert stats["config"]["max_file_size_mb"] == 1.0  # 1MB converted


class TestRecoveryEndpoints:
    """Test suite for Recovery API endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client with recovery endpoints."""
        app = FastAPI()
        app.include_router(recovery_router)
        
        # Mock the service
        with patch('recovery_endpoints.get_recovery_service') as mock_get_service:
            mock_service = MagicMock()
            mock_get_service.return_value = mock_service
            
            # Configure service mocks
            mock_service.config.max_file_size = 50 * 1024 * 1024
            mock_service.config.rate_limit_tokens = 10
            mock_service.config.rate_limit_window_hours = 1
            
            with TestClient(app) as client:
                yield client, mock_service
    
    def test_generate_recovery_token_success(self, client):
        """Test successful token generation via API."""
        test_client, mock_service = client
        
        # Mock service response
        mock_service.create_recovery_token.return_value = asyncio.coroutine(
            lambda: MagicMock(
                token="test-token-123",
                expires_at="2024-01-01T12:00:00",
                file_size=len(TEST_AUDIO_WAV),
                checksum="test-checksum"
            )
        )()
        
        # Make request
        response = test_client.post(
            "/api/recovery/audio/token",
            files={"audio_file": ("test.wav", BytesIO(TEST_AUDIO_WAV), "audio/wav")}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["token"] == "test-token-123"
        assert data["file_size"] == len(TEST_AUDIO_WAV)
    
    def test_generate_recovery_token_rate_limit(self, client):
        """Test rate limiting in token generation."""
        test_client, mock_service = client
        
        # Mock rate limit error
        from recovery_service import RateLimitError
        mock_service.create_recovery_token.side_effect = RateLimitError("Rate limit exceeded")
        
        response = test_client.post(
            "/api/recovery/audio/token",
            files={"audio_file": ("test.wav", BytesIO(TEST_AUDIO_WAV), "audio/wav")}
        )
        
        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json()["detail"]
    
    def test_generate_recovery_token_invalid_file(self, client):
        """Test token generation with invalid file."""
        test_client, mock_service = client
        
        # Mock invalid file error
        from recovery_service import InvalidFileError
        mock_service.create_recovery_token.side_effect = InvalidFileError("Invalid file format")
        
        response = test_client.post(
            "/api/recovery/audio/token",
            files={"audio_file": ("test.txt", BytesIO(b"not audio"), "text/plain")}
        )
        
        assert response.status_code == 400
        assert "Invalid file format" in response.json()["detail"]
    
    def test_generate_recovery_token_empty_file(self, client):
        """Test token generation with empty file."""
        test_client, mock_service = client
        
        response = test_client.post(
            "/api/recovery/audio/token",
            files={"audio_file": ("empty.wav", BytesIO(b""), "audio/wav")}
        )
        
        assert response.status_code == 400
        assert "Empty file" in response.json()["detail"]
    
    def test_retrieve_audio_file_success(self, client):
        """Test successful audio file retrieval."""
        test_client, mock_service = client
        
        # Mock service response
        mock_service.retrieve_audio_file.return_value = asyncio.coroutine(
            lambda: (TEST_AUDIO_WAV, "test.wav", "audio/wav")
        )()
        
        response = test_client.get("/api/recovery/audio/test-token-123")
        
        assert response.status_code == 200
        assert response.content == TEST_AUDIO_WAV
        assert response.headers["content-type"] == "audio/wav"
        assert "attachment" in response.headers["content-disposition"]
    
    def test_retrieve_audio_file_not_found(self, client):
        """Test retrieval with invalid token."""
        test_client, mock_service = client
        
        from recovery_service import TokenNotFoundError
        mock_service.retrieve_audio_file.side_effect = TokenNotFoundError("Token not found")
        
        response = test_client.get("/api/recovery/audio/invalid-token")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]
    
    def test_retrieve_audio_file_already_used(self, client):
        """Test retrieval of already used token."""
        test_client, mock_service = client
        
        from recovery_service import TokenExpiredError
        mock_service.retrieve_audio_file.side_effect = TokenExpiredError("Token already used")
        
        response = test_client.get("/api/recovery/audio/used-token")
        
        assert response.status_code == 410
        assert "already used" in response.json()["detail"]
    
    def test_get_recovery_stats(self, client):
        """Test recovery statistics endpoint."""
        test_client, mock_service = client
        
        mock_service.get_service_stats.return_value = asyncio.coroutine(
            lambda: {
                "total_tokens": 5,
                "active_tokens": 3,
                "config": {"max_file_size_mb": 50}
            }
        )()
        
        response = test_client.get("/api/recovery/stats")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["stats"]["total_tokens"] == 5
    
    def test_manual_cleanup(self, client):
        """Test manual cleanup endpoint."""
        test_client, mock_service = client
        
        mock_service.cleanup_expired_tokens.return_value = asyncio.coroutine(
            lambda: 3
        )()
        
        response = test_client.post("/api/recovery/cleanup")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["tokens_removed"] == 3
    
    def test_health_check(self, client):
        """Test health check endpoint."""
        test_client, mock_service = client
        
        mock_service.get_service_stats.return_value = asyncio.coroutine(
            lambda: {"active_tokens": 2}
        )()
        
        response = test_client.get("/api/recovery/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status"] == "healthy"


class TestFileValidation:
    """Test audio file validation logic."""
    
    def test_wav_validation(self):
        """Test WAV file validation."""
        from recovery_service import RecoveryService
        service = RecoveryService()
        
        # Valid WAV file
        assert service._is_valid_audio_file(TEST_AUDIO_WAV, "audio/wav") is True
        
        # Invalid WAV file
        assert service._is_valid_audio_file(b"fake wav", "audio/wav") is False
    
    def test_mp3_validation(self):
        """Test MP3 file validation."""
        from recovery_service import RecoveryService
        service = RecoveryService()
        
        # Valid MP3 file
        assert service._is_valid_audio_file(TEST_AUDIO_MP3, "audio/mp3") is True
        
        # Invalid MP3 file
        assert service._is_valid_audio_file(b"fake mp3", "audio/mp3") is False
    
    def test_ogg_validation(self):
        """Test OGG file validation."""
        from recovery_service import RecoveryService
        service = RecoveryService()
        
        # Valid OGG file header
        ogg_data = b"OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00"
        assert service._is_valid_audio_file(ogg_data, "audio/ogg") is True
        
        # Invalid OGG file
        assert service._is_valid_audio_file(b"fake ogg", "audio/ogg") is False


class TestIntegration:
    """Integration tests for the complete recovery system."""
    
    @pytest.mark.asyncio
    async def test_end_to_end_recovery_flow(self):
        """Test complete recovery flow from creation to retrieval."""
        # Setup temporary environment
        with tempfile.TemporaryDirectory() as temp_dir:
            with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
                db_path = tmp.name
            
            try:
                # Initialize components
                config = RecoveryConfig(recovery_storage_path=temp_dir)
                db = RecoveryDatabase(db_path)
                service = RecoveryService(config, db)
                
                # Create recovery token
                audio_file = BytesIO(TEST_AUDIO_WAV)
                token = await service.create_recovery_token(
                    audio_file=audio_file,
                    filename="integration_test.wav",
                    session_identifier="integration-test-session"
                )
                
                assert token.token is not None
                
                # Retrieve audio file
                file_data, filename, mime_type = await service.retrieve_audio_file(token.token)
                
                assert file_data == TEST_AUDIO_WAV
                assert mime_type == "audio/wav"
                
                # Verify token is marked as used
                with pytest.raises(TokenExpiredError):
                    await service.retrieve_audio_file(token.token)
                
                # Test cleanup
                cleaned = await service.cleanup_expired_tokens()
                # Should clean up the used token
                
            finally:
                if os.path.exists(db_path):
                    os.remove(db_path)


if __name__ == "__main__":
    # Run tests with pytest
    import sys
    
    # Add current directory to path for imports
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, current_dir)
    
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])