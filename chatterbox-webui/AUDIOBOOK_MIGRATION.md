# Chatterbox Audiobook Migration Guide

## Overview

This guide explains how to migrate to the psdwizzard/chatterbox-Audiobook version, which adds specialized features for professional audiobook generation.

## Key Features Added

### 1. **Multi-Voice Support**
- Automatic character voice assignment
- Support for unlimited characters with voice rotation
- Character-based dialogue detection

### 2. **Return Pause System**
- Intelligent pause insertion based on line breaks
- Configurable pause duration (default: 0.1s per break)
- Natural flow for audiobook narration

### 3. **Volume Normalization**
- Professional audiobook standards (-18 dB default)
- Consistent volume across different voices
- Prevents audio clipping and distortion

### 4. **Project Management**
- Save/load audiobook projects
- Regenerate specific chunks
- Export in multiple formats (WAV/MP3)

### 5. **Batch Processing**
- Process entire books efficiently
- Chunk-based generation
- Resume interrupted sessions

## Installation Steps

### Backend Setup

1. **Clone the Audiobook Repository**
```bash
git clone https://github.com/psdwizzard/chatterbox-Audiobook.git
cd chatterbox-Audiobook
```

2. **Install Dependencies**
```bash
# Windows
./install-audiobook.bat

# Linux/Mac
pip install -r requirements.txt
```

3. **Launch the Server**
```bash
# Windows
./launch_audiobook.bat

# Linux/Mac
python gradio_tts_app_audiobook.py
```

The audiobook server will run on `http://localhost:7860`

### Frontend Integration

The web UI has been updated with:

1. **New Audiobook Mode**
   - Access via user menu → "Audiobook Mode"
   - Dedicated interface for audiobook generation
   - Multi-voice profile management

2. **API Integration**
   - New `audiobookAPI` client in `/src/lib/audiobookApi.ts`
   - Supports all audiobook-specific features
   - Compatible with existing authentication

3. **UI Components**
   - `AudiobookGenerator` component with full feature support
   - Voice profile editor
   - Chunk management and regeneration
   - Export functionality

## Usage Guide

### Single Voice Audiobook

1. Navigate to Audiobook Mode
2. Enter your text
3. Select "Single Voice" mode
4. Configure voice settings
5. Click "Generate Audiobook"

### Multi-Voice Audiobook

1. Format your text with character names:
```
Narrator: It was a dark and stormy night.
John: "I don't think we should go in there."
Sarah: "Don't be such a coward!"
```

2. Select "Multi Voice" mode
3. Add voice profiles for each character
4. Upload voice samples (optional)
5. Generate audiobook

### Voice Settings

Each voice profile supports:
- **Exaggeration**: 0.1-2.0 (voice distinctiveness)
- **Temperature**: 0.05-5.0 (randomness)
- **Speed Rate**: 0.5-2.0 (speaking speed)
- **Seed**: For consistent voice generation

### Audiobook Settings

- **Volume Normalization**: Enable for professional output
- **Target Volume**: -18 dB (audiobook standard)
- **Pause Duration**: Time per line break
- **Chunk Size**: Characters per generation chunk

## API Endpoints

The audiobook version provides these endpoints:

- `POST /generate_audiobook` - Generate complete audiobook
- `POST /generate_chunk` - Generate single chunk
- `POST /projects/{id}/chunks/{chunk_id}/regenerate` - Regenerate chunk
- `POST /projects/save` - Save project
- `GET /projects/{id}` - Load project
- `POST /projects/{id}/export` - Export audiobook
- `GET /audio/{filename}` - Retrieve audio files

## Migration Checklist

- [ ] Install psdwizzard/chatterbox-Audiobook backend
- [ ] Update frontend to latest version
- [ ] Test single voice generation
- [ ] Test multi-voice generation
- [ ] Verify volume normalization
- [ ] Test pause insertion
- [ ] Check project save/load
- [ ] Verify export functionality

## Troubleshooting

### Common Issues

1. **GPU Memory Errors**
   - Reduce chunk size
   - Enable CPU fallback
   - Close other GPU applications

2. **Voice Consistency**
   - Use fixed seeds for characters
   - Ensure voice samples are clear
   - Adjust exaggeration parameter

3. **Export Issues**
   - Check disk space
   - Verify all chunks completed
   - Try different export format

### Performance Tips

- Use GPU acceleration when available
- Process in smaller chunks for large books
- Enable autosave for long projects
- Use batch processing for multiple books

## Benefits Over Standard Version

1. **Professional Audio Quality**
   - Volume normalization
   - Intelligent pause insertion
   - Consistent voice characteristics

2. **Efficiency**
   - Batch processing
   - Chunk regeneration
   - Project management

3. **Flexibility**
   - Multiple voice support
   - Character detection
   - Customizable settings

4. **Reliability**
   - Resume interrupted sessions
   - Error recovery
   - Progress tracking

## Conclusion

The audiobook version significantly enhances Chatterbox for professional audiobook production while maintaining compatibility with the standard TTS features. The migration is straightforward and provides immediate benefits for audiobook creators.