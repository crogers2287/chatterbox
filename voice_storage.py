"""
Voice profile storage for Chatterbox TTS
Stores voice profiles on the server for global access
"""
import os
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
import uuid
import base64

class VoiceStorage:
    """Manages voice profile storage on the server"""
    
    def __init__(self, storage_dir: str = "/home/crogers2287/chatterbox/saved_voices"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True)
        self.voices_file = self.storage_dir / "voices.json"
        self.audio_dir = self.storage_dir / "audio_files"
        self.audio_dir.mkdir(exist_ok=True)
        
        # Initialize voices file if it doesn't exist
        if not self.voices_file.exists():
            self._save_voices_list([])
    
    def _load_voices_list(self) -> List[Dict[str, Any]]:
        """Load the list of voices from JSON file"""
        try:
            with open(self.voices_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading voices: {e}")
            return []
    
    def _save_voices_list(self, voices: List[Dict[str, Any]]) -> None:
        """Save the list of voices to JSON file"""
        try:
            with open(self.voices_file, 'w') as f:
                json.dump(voices, f, indent=2)
        except Exception as e:
            print(f"Error saving voices: {e}")
    
    def list_voices(self) -> List[Dict[str, Any]]:
        """Get all saved voices"""
        voices = self._load_voices_list()
        # Convert datetime strings back to ISO format for consistency
        for voice in voices:
            if 'createdAt' in voice and not isinstance(voice['createdAt'], str):
                voice['createdAt'] = voice['createdAt']
        return voices
    
    def get_voice(self, voice_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific voice by ID"""
        voices = self._load_voices_list()
        for voice in voices:
            if voice.get('id') == voice_id:
                return voice
        return None
    
    def save_voice(self, voice_data: Dict[str, Any]) -> Dict[str, Any]:
        """Save a new voice profile"""
        voices = self._load_voices_list()
        
        # Generate ID if not provided
        if 'id' not in voice_data:
            voice_data['id'] = f"{int(datetime.now().timestamp() * 1000)}-{uuid.uuid4().hex[:7]}"
        
        # Ensure createdAt is set
        if 'createdAt' not in voice_data:
            voice_data['createdAt'] = datetime.now().isoformat()
        
        # Handle voice file data if present
        if 'voiceReferenceData' in voice_data and voice_data['voiceReferenceData']:
            audio_file_path = self._save_audio_file(voice_data['id'], voice_data['voiceReferenceData'])
            voice_data['voiceReferenceFile'] = str(audio_file_path)
            # Don't store the base64 data in JSON
            voice_data.pop('voiceReferenceData', None)
        
        # Handle voice_file if it's base64 data
        if 'voice_file' in voice_data and isinstance(voice_data['voice_file'], str) and voice_data['voice_file'].startswith('data:'):
            audio_file_path = self._save_audio_file(voice_data['id'], voice_data['voice_file'])
            voice_data['voiceReferenceFile'] = str(audio_file_path)
            voice_data.pop('voice_file', None)
        
        # Add or update voice
        existing_index = None
        for i, v in enumerate(voices):
            if v.get('id') == voice_data['id']:
                existing_index = i
                break
        
        if existing_index is not None:
            voices[existing_index] = voice_data
        else:
            voices.append(voice_data)
        
        self._save_voices_list(voices)
        return voice_data
    
    def delete_voice(self, voice_id: str) -> bool:
        """Delete a voice profile"""
        voices = self._load_voices_list()
        
        # Find and remove the voice
        filtered_voices = []
        deleted = False
        for voice in voices:
            if voice.get('id') == voice_id:
                deleted = True
                # Delete associated audio file if exists
                if 'voiceReferenceFile' in voice:
                    audio_path = Path(voice['voiceReferenceFile'])
                    if audio_path.exists():
                        audio_path.unlink()
            else:
                filtered_voices.append(voice)
        
        if deleted:
            self._save_voices_list(filtered_voices)
        
        return deleted
    
    def _save_audio_file(self, voice_id: str, base64_data: str) -> Path:
        """Save base64 audio data to file"""
        # Extract the actual base64 data (remove data URL prefix if present)
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]
        
        # Decode base64 to bytes
        audio_data = base64.b64decode(base64_data)
        
        # Save to file
        audio_file = self.audio_dir / f"{voice_id}.wav"
        with open(audio_file, 'wb') as f:
            f.write(audio_data)
        
        return audio_file
    
    def get_audio_file(self, voice_id: str) -> Optional[Path]:
        """Get the path to a voice's audio file"""
        voice = self.get_voice(voice_id)
        if voice and 'voiceReferenceFile' in voice:
            audio_path = Path(voice['voiceReferenceFile'])
            if audio_path.exists():
                return audio_path
        
        # Fallback to checking if file exists with voice ID
        audio_file = self.audio_dir / f"{voice_id}.wav"
        if audio_file.exists():
            return audio_file
        
        return None

# Global instance
voice_storage = VoiceStorage()