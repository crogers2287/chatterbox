"""
Tests for cleanup service implementation
"""

import asyncio
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch, AsyncMock

from services.cleanup import CleanupService, ScheduledCleanupService


class TestCleanupService(unittest.TestCase):
    """Test cleanup service functionality"""
    
    def setUp(self):
        """Set up test environment"""
        # Create temporary directory for test files
        self.temp_dir = tempfile.mkdtemp()
        self.storage_path = os.path.join(self.temp_dir, "recovery_storage")
        self.token_file = os.path.join(self.temp_dir, "recovery_tokens.json")
        
        # Create cleanup service instance
        self.cleanup_service = CleanupService(
            storage_path=self.storage_path,
            token_file=self.token_file,
            retention_hours=1,
            max_storage_mb=10
        )
    
    def tearDown(self):
        """Clean up test environment"""
        # Remove temporary directory
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def create_test_token(self, token_id: str, expired: bool = False):
        """Create a test token with associated file"""
        # Create token data
        if expired:
            expires_at = (datetime.utcnow() - timedelta(hours=2)).isoformat()
        else:
            expires_at = (datetime.utcnow() + timedelta(hours=2)).isoformat()
        
        file_path = os.path.join(self.storage_path, f"{token_id}.wav")
        
        token_data = {
            "token_id": token_id,
            "file_path": file_path,
            "expires_at": expires_at,
            "created_at": datetime.utcnow().isoformat(),
            "file_size": 1024 * 1024  # 1MB
        }
        
        # Create file
        os.makedirs(self.storage_path, exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(b"x" * (1024 * 1024))  # 1MB of data
        
        return token_data
    
    def test_load_save_tokens(self):
        """Test loading and saving tokens"""
        # Test empty file
        tokens = self.cleanup_service.load_tokens()
        self.assertEqual(tokens, {})
        
        # Test saving tokens
        test_tokens = {
            "token1": self.create_test_token("token1"),
            "token2": self.create_test_token("token2")
        }
        
        # Save tokens manually
        with open(self.token_file, "w") as f:
            json.dump(test_tokens, f)
        
        # Load tokens
        loaded_tokens = self.cleanup_service.load_tokens()
        self.assertEqual(len(loaded_tokens), 2)
        self.assertIn("token1", loaded_tokens)
        self.assertIn("token2", loaded_tokens)
    
    def test_is_expired(self):
        """Test token expiration checking"""
        # Create expired token
        expired_token = self.create_test_token("expired", expired=True)
        self.assertTrue(self.cleanup_service.is_expired(expired_token))
        
        # Create valid token
        valid_token = self.create_test_token("valid", expired=False)
        self.assertFalse(self.cleanup_service.is_expired(valid_token))
        
        # Test invalid date format
        invalid_token = {"expires_at": "invalid-date"}
        self.assertTrue(self.cleanup_service.is_expired(invalid_token))
    
    def test_get_storage_size(self):
        """Test storage size calculation"""
        # Create test files
        self.create_test_token("token1")
        self.create_test_token("token2")
        
        # Get storage size
        size = self.cleanup_service.get_storage_size()
        self.assertEqual(size, 2 * 1024 * 1024)  # 2MB
    
    async def test_cleanup_expired_tokens(self):
        """Test cleanup of expired tokens"""
        # Create test tokens
        tokens = {
            "expired1": self.create_test_token("expired1", expired=True),
            "expired2": self.create_test_token("expired2", expired=True),
            "valid1": self.create_test_token("valid1", expired=False),
        }
        
        # Save tokens
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        
        # Run cleanup
        tokens_cleaned, files_cleaned, bytes_freed = await self.cleanup_service.cleanup_expired_tokens()
        
        # Verify results
        self.assertEqual(tokens_cleaned, 2)
        self.assertEqual(files_cleaned, 2)
        self.assertEqual(bytes_freed, 2 * 1024 * 1024)
        
        # Verify remaining tokens
        remaining_tokens = self.cleanup_service.load_tokens()
        self.assertEqual(len(remaining_tokens), 1)
        self.assertIn("valid1", remaining_tokens)
        
        # Verify files deleted
        self.assertFalse(os.path.exists(os.path.join(self.storage_path, "expired1.wav")))
        self.assertFalse(os.path.exists(os.path.join(self.storage_path, "expired2.wav")))
        self.assertTrue(os.path.exists(os.path.join(self.storage_path, "valid1.wav")))
    
    async def test_cleanup_orphaned_files(self):
        """Test cleanup of orphaned files"""
        # Create valid token
        tokens = {
            "valid1": self.create_test_token("valid1", expired=False)
        }
        
        # Save tokens
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        
        # Create orphaned files
        orphan_path1 = os.path.join(self.storage_path, "orphan1.wav")
        orphan_path2 = os.path.join(self.storage_path, "orphan2.wav")
        
        with open(orphan_path1, "wb") as f:
            f.write(b"x" * (512 * 1024))  # 512KB
        
        with open(orphan_path2, "wb") as f:
            f.write(b"x" * (512 * 1024))  # 512KB
        
        # Run cleanup
        files_cleaned, bytes_freed = await self.cleanup_service.cleanup_orphaned_files()
        
        # Verify results
        self.assertEqual(files_cleaned, 2)
        self.assertEqual(bytes_freed, 1024 * 1024)  # 1MB total
        
        # Verify files
        self.assertFalse(os.path.exists(orphan_path1))
        self.assertFalse(os.path.exists(orphan_path2))
        self.assertTrue(os.path.exists(os.path.join(self.storage_path, "valid1.wav")))
    
    async def test_emergency_cleanup(self):
        """Test emergency cleanup when quota exceeded"""
        # Create multiple tokens
        tokens = {}
        for i in range(5):
            token_id = f"token{i}"
            tokens[token_id] = self.create_test_token(token_id, expired=False)
            # Set different creation times
            tokens[token_id]["created_at"] = (
                datetime.utcnow() - timedelta(hours=5-i)
            ).isoformat()
        
        # Save tokens
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        
        # Set small storage limit to trigger emergency cleanup
        self.cleanup_service.max_storage_bytes = 3 * 1024 * 1024  # 3MB limit
        
        # Run emergency cleanup
        tokens_cleaned, files_cleaned, bytes_freed = await self.cleanup_service.emergency_cleanup()
        
        # Should clean oldest tokens to get under 80% of limit (2.4MB)
        # This means cleaning at least 3 tokens (5MB - 3MB = 2MB to free)
        self.assertGreaterEqual(tokens_cleaned, 3)
        self.assertGreaterEqual(files_cleaned, 3)
        self.assertGreaterEqual(bytes_freed, 3 * 1024 * 1024)
        
        # Verify oldest tokens were deleted first
        remaining_tokens = self.cleanup_service.load_tokens()
        self.assertNotIn("token0", remaining_tokens)  # Oldest
        self.assertNotIn("token1", remaining_tokens)
        self.assertNotIn("token2", remaining_tokens)
    
    async def test_check_storage_quota(self):
        """Test storage quota checking"""
        # Create files to fill storage
        for i in range(3):
            self.create_test_token(f"token{i}")
        
        # Set limit that will be exceeded
        self.cleanup_service.max_storage_bytes = 2 * 1024 * 1024  # 2MB limit
        
        # Check quota
        quota_exceeded = await self.cleanup_service.check_storage_quota()
        self.assertTrue(quota_exceeded)
        
        # Increase limit
        self.cleanup_service.max_storage_bytes = 10 * 1024 * 1024  # 10MB limit
        
        # Check quota again
        quota_exceeded = await self.cleanup_service.check_storage_quota()
        self.assertFalse(quota_exceeded)
    
    async def test_run_cleanup(self):
        """Test full cleanup process"""
        # Create mixed tokens
        tokens = {
            "expired1": self.create_test_token("expired1", expired=True),
            "valid1": self.create_test_token("valid1", expired=False),
            "valid2": self.create_test_token("valid2", expired=False),
        }
        
        # Save tokens
        with open(self.token_file, "w") as f:
            json.dump(tokens, f)
        
        # Create orphaned file
        orphan_path = os.path.join(self.storage_path, "orphan.wav")
        with open(orphan_path, "wb") as f:
            f.write(b"x" * (1024 * 1024))  # 1MB
        
        # Run cleanup
        result = await self.cleanup_service.run_cleanup()
        
        # Verify results
        self.assertTrue(result["success"])
        self.assertGreaterEqual(result["tokens_cleaned"], 1)  # At least expired token
        self.assertGreaterEqual(result["files_cleaned"], 2)  # Expired file + orphan
        self.assertGreaterEqual(result["bytes_freed"], 2 * 1024 * 1024)  # 2MB
    
    def test_get_metrics(self):
        """Test metrics retrieval"""
        metrics = self.cleanup_service.get_metrics()
        
        # Verify metrics structure
        self.assertIn("tokens_cleaned", metrics)
        self.assertIn("files_cleaned", metrics)
        self.assertIn("bytes_freed", metrics)
        self.assertIn("errors", metrics)
        self.assertIn("last_cleanup", metrics)
        self.assertIn("last_error", metrics)
        self.assertIn("storage_size", metrics)
        self.assertIn("storage_limit", metrics)
        self.assertIn("retention_hours", metrics)
        
        # Initial values
        self.assertEqual(metrics["tokens_cleaned"], 0)
        self.assertEqual(metrics["files_cleaned"], 0)
        self.assertEqual(metrics["bytes_freed"], 0)
        self.assertEqual(metrics["errors"], 0)


class TestScheduledCleanupService(unittest.TestCase):
    """Test scheduled cleanup service"""
    
    def setUp(self):
        """Set up test environment"""
        self.cleanup_service = Mock(spec=CleanupService)
        self.cleanup_service.run_cleanup = AsyncMock(return_value={
            "success": True,
            "tokens_cleaned": 1,
            "files_cleaned": 1,
            "bytes_freed": 1024
        })
        
        self.scheduled_service = ScheduledCleanupService(
            self.cleanup_service,
            interval_hours=0.001  # Very short interval for testing
        )
    
    async def test_start_stop(self):
        """Test starting and stopping scheduled service"""
        # Start service
        await self.scheduled_service.start()
        self.assertTrue(self.scheduled_service.running)
        self.assertIsNotNone(self.scheduled_service.task)
        
        # Wait a bit to ensure task runs
        await asyncio.sleep(0.01)
        
        # Stop service
        await self.scheduled_service.stop()
        self.assertFalse(self.scheduled_service.running)
        
        # Verify cleanup was called
        self.cleanup_service.run_cleanup.assert_called()
    
    async def test_multiple_start(self):
        """Test multiple start calls"""
        # Start service
        await self.scheduled_service.start()
        
        # Try to start again
        with patch("logging.Logger.warning") as mock_warning:
            await self.scheduled_service.start()
            mock_warning.assert_called()
    
    async def test_error_handling(self):
        """Test error handling in scheduled cleanup"""
        # Make cleanup fail
        self.cleanup_service.run_cleanup.side_effect = Exception("Test error")
        
        # Start service
        await self.scheduled_service.start()
        
        # Wait for task to run
        await asyncio.sleep(0.01)
        
        # Service should still be running despite error
        self.assertTrue(self.scheduled_service.running)
        
        # Stop service
        await self.scheduled_service.stop()


# Run tests with asyncio
def run_async_test(coro):
    """Helper to run async tests"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# Patch async test methods
for attr_name in dir(TestCleanupService):
    attr = getattr(TestCleanupService, attr_name)
    if asyncio.iscoroutinefunction(attr):
        wrapped = lambda self, coro=attr: run_async_test(coro(self))
        setattr(TestCleanupService, attr_name, wrapped)

for attr_name in dir(TestScheduledCleanupService):
    attr = getattr(TestScheduledCleanupService, attr_name)
    if asyncio.iscoroutinefunction(attr):
        wrapped = lambda self, coro=attr: run_async_test(coro(self))
        setattr(TestScheduledCleanupService, attr_name, wrapped)


if __name__ == "__main__":
    unittest.main()