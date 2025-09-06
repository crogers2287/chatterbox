#!/usr/bin/env python3
"""
Recovery token database implementation with SQLite.
Handles token storage, validation, and cleanup for audio file recovery.
"""

import os
import sqlite3
import hashlib
import uuid
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from contextlib import asynccontextmanager
import aiosqlite

logger = logging.getLogger(__name__)

@dataclass
class RecoveryToken:
    """Recovery token data structure."""
    token: str
    file_path: str
    checksum: str
    file_size: int
    created_at: datetime
    expires_at: datetime
    retrieved_at: Optional[datetime]
    session_hash: str

class RecoveryDatabase:
    """
    SQLite-based recovery token database.
    Provides async operations for token management with automatic cleanup.
    """
    
    def __init__(self, db_path: str = "/tmp/chatterbox_recovery.db"):
        """
        Initialize recovery database.
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.recovery_dir = "/tmp/chatterbox-recovery"
        
        # Ensure recovery directory exists
        Path(self.recovery_dir).mkdir(exist_ok=True)
        
        # Set up database schema
        self._init_schema()
    
    def _init_schema(self):
        """Initialize database schema synchronously during startup."""
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS recovery_tokens (
                    token TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    retrieved_at TIMESTAMP,
                    session_hash TEXT NOT NULL
                );
                
                CREATE INDEX IF NOT EXISTS idx_expires_at ON recovery_tokens(expires_at);
                CREATE INDEX IF NOT EXISTS idx_session_hash ON recovery_tokens(session_hash);
                CREATE INDEX IF NOT EXISTS idx_retrieved_at ON recovery_tokens(retrieved_at);
            """)
            conn.commit()
        
        logger.info(f"Recovery database initialized at {self.db_path}")
    
    async def create_token(
        self, 
        file_path: str, 
        file_size: int, 
        session_hash: str,
        ttl_hours: int = 24
    ) -> RecoveryToken:
        """
        Create a new recovery token for a file.
        
        Args:
            file_path: Path to the audio file
            file_size: Size of the file in bytes
            session_hash: Hash of user session for rate limiting
            ttl_hours: Time to live in hours (default 24)
            
        Returns:
            RecoveryToken: Created token information
            
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file is too large or invalid
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Verify file size matches
        actual_size = os.path.getsize(file_path)
        if actual_size != file_size:
            raise ValueError(f"File size mismatch: expected {file_size}, got {actual_size}")
        
        # Calculate checksum
        checksum = await self._calculate_checksum(file_path)
        
        # Generate token
        token = str(uuid.uuid4())
        
        # Set expiration
        created_at = datetime.utcnow()
        expires_at = created_at + timedelta(hours=ttl_hours)
        
        # Store in database
        recovery_token = RecoveryToken(
            token=token,
            file_path=file_path,
            checksum=checksum,
            file_size=file_size,
            created_at=created_at,
            expires_at=expires_at,
            retrieved_at=None,
            session_hash=session_hash
        )
        
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO recovery_tokens 
                (token, file_path, checksum, file_size, created_at, expires_at, session_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                recovery_token.token,
                recovery_token.file_path,
                recovery_token.checksum,
                recovery_token.file_size,
                recovery_token.created_at.isoformat(),
                recovery_token.expires_at.isoformat(),
                recovery_token.session_hash
            ))
            await db.commit()
        
        logger.info(f"Created recovery token {token} for file {file_path}")
        return recovery_token
    
    async def get_token(self, token: str) -> Optional[RecoveryToken]:
        """
        Retrieve token information.
        
        Args:
            token: Recovery token string
            
        Returns:
            RecoveryToken or None if not found/expired
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT token, file_path, checksum, file_size, created_at, 
                       expires_at, retrieved_at, session_hash
                FROM recovery_tokens
                WHERE token = ? AND expires_at > datetime('now')
            """, (token,))
            
            row = await cursor.fetchone()
            if not row:
                return None
            
            return RecoveryToken(
                token=row[0],
                file_path=row[1],
                checksum=row[2],
                file_size=row[3],
                created_at=datetime.fromisoformat(row[4]),
                expires_at=datetime.fromisoformat(row[5]),
                retrieved_at=datetime.fromisoformat(row[6]) if row[6] else None,
                session_hash=row[7]
            )
    
    async def mark_retrieved(self, token: str) -> bool:
        """
        Mark a token as retrieved (one-time use).
        
        Args:
            token: Recovery token string
            
        Returns:
            bool: True if token was marked, False if not found
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                UPDATE recovery_tokens 
                SET retrieved_at = datetime('now')
                WHERE token = ? AND retrieved_at IS NULL
            """, (token,))
            await db.commit()
            
            affected = cursor.rowcount
            if affected > 0:
                logger.info(f"Marked token {token} as retrieved")
            
            return affected > 0
    
    async def cleanup_expired(self) -> int:
        """
        Clean up expired tokens and associated files.
        
        Returns:
            int: Number of tokens cleaned up
        """
        deleted_count = 0
        
        async with aiosqlite.connect(self.db_path) as db:
            # Get expired tokens
            cursor = await db.execute("""
                SELECT token, file_path
                FROM recovery_tokens
                WHERE expires_at <= datetime('now') OR retrieved_at IS NOT NULL
            """)
            
            expired_tokens = await cursor.fetchall()
            
            for token, file_path in expired_tokens:
                # Delete file if it exists
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        logger.debug(f"Deleted expired file: {file_path}")
                except OSError as e:
                    logger.warning(f"Failed to delete file {file_path}: {e}")
                
                # Delete token record
                await db.execute("DELETE FROM recovery_tokens WHERE token = ?", (token,))
                deleted_count += 1
            
            await db.commit()
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired recovery tokens")
        
        return deleted_count
    
    async def count_tokens_for_session(self, session_hash: str, hours: int = 1) -> int:
        """
        Count tokens created for a session in the last N hours (for rate limiting).
        
        Args:
            session_hash: Session identifier hash
            hours: Time window in hours
            
        Returns:
            int: Number of tokens created
        """
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT COUNT(*)
                FROM recovery_tokens
                WHERE session_hash = ? AND created_at > ?
            """, (session_hash, cutoff.isoformat()))
            
            count = await cursor.fetchone()
            return count[0] if count else 0
    
    async def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get database storage statistics.
        
        Returns:
            Dict with storage statistics
        """
        stats = {
            "total_tokens": 0,
            "active_tokens": 0,
            "expired_tokens": 0,
            "retrieved_tokens": 0,
            "total_file_size": 0,
            "database_size": 0
        }
        
        async with aiosqlite.connect(self.db_path) as db:
            # Total tokens
            cursor = await db.execute("SELECT COUNT(*) FROM recovery_tokens")
            stats["total_tokens"] = (await cursor.fetchone())[0]
            
            # Active tokens
            cursor = await db.execute("""
                SELECT COUNT(*) FROM recovery_tokens 
                WHERE expires_at > datetime('now') AND retrieved_at IS NULL
            """)
            stats["active_tokens"] = (await cursor.fetchone())[0]
            
            # Expired tokens
            cursor = await db.execute("""
                SELECT COUNT(*) FROM recovery_tokens 
                WHERE expires_at <= datetime('now')
            """)
            stats["expired_tokens"] = (await cursor.fetchone())[0]
            
            # Retrieved tokens
            cursor = await db.execute("""
                SELECT COUNT(*) FROM recovery_tokens 
                WHERE retrieved_at IS NOT NULL
            """)
            stats["retrieved_tokens"] = (await cursor.fetchone())[0]
            
            # Total file size
            cursor = await db.execute("SELECT SUM(file_size) FROM recovery_tokens")
            size_result = await cursor.fetchone()
            stats["total_file_size"] = size_result[0] if size_result[0] else 0
        
        # Database file size
        if os.path.exists(self.db_path):
            stats["database_size"] = os.path.getsize(self.db_path)
        
        return stats
    
    async def _calculate_checksum(self, file_path: str) -> str:
        """
        Calculate SHA-256 checksum of a file.
        
        Args:
            file_path: Path to file
            
        Returns:
            str: Hexadecimal checksum
        """
        sha256 = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        
        return sha256.hexdigest()

# Global database instance
_db_instance: Optional[RecoveryDatabase] = None

def get_recovery_db() -> RecoveryDatabase:
    """Get global recovery database instance."""
    global _db_instance
    if _db_instance is None:
        _db_instance = RecoveryDatabase()
    return _db_instance

@asynccontextmanager
async def get_db_connection():
    """Async context manager for database connections."""
    db = get_recovery_db()
    yield db

def create_session_hash(session_data: str) -> str:
    """
    Create a hash for session-based rate limiting.
    
    Args:
        session_data: Session identifier (IP address, user agent, etc.)
        
    Returns:
        str: SHA-256 hash of session data
    """
    return hashlib.sha256(session_data.encode()).hexdigest()

# Initialize database on module import
if __name__ == "__main__":
    # Test the database
    import asyncio
    
    async def test_db():
        db = RecoveryDatabase(":memory:")  # In-memory for testing
        
        # Create a test file
        test_file = "/tmp/test_audio.wav"
        test_data = b"test audio data"
        
        with open(test_file, "wb") as f:
            f.write(test_data)
        
        try:
            # Create token
            session = create_session_hash("127.0.0.1:test-agent")
            token = await db.create_token(test_file, len(test_data), session)
            print(f"Created token: {token.token}")
            
            # Retrieve token
            retrieved = await db.get_token(token.token)
            print(f"Retrieved token: {retrieved.token if retrieved else 'Not found'}")
            
            # Mark as retrieved
            marked = await db.mark_retrieved(token.token)
            print(f"Marked retrieved: {marked}")
            
            # Get stats
            stats = await db.get_storage_stats()
            print(f"Stats: {stats}")
            
            # Cleanup
            cleaned = await db.cleanup_expired()
            print(f"Cleaned up: {cleaned} tokens")
            
        finally:
            # Clean up test file
            if os.path.exists(test_file):
                os.remove(test_file)
    
    asyncio.run(test_db())