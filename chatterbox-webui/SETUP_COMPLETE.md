# Chatterbox TTS Setup Complete! 🎉

## Current Status

✅ **Chatterbox API**: Running at http://localhost:6093
✅ **Web UI**: Running at http://localhost:5175
✅ **Authentication**: Bypassed for development (auto-login as admin)
⏳ **Audiobook Backend**: Ready to start when needed

## Access the Application

1. **Open your browser** and go to: http://localhost:5175

2. **You're automatically logged in** as an admin user (no login required in dev mode)

3. **Switch between modes**:
   - **Standard TTS Mode**: Default view
   - **Audiobook Mode**: Click your username (top right) → "Audiobook Mode"

## Features Available

### Standard TTS Mode
- Text-to-speech synthesis
- Voice cloning
- Session management with tabs
- Saved voices
- Batch processing
- Export functionality

### Advanced Audiobook Mode
- **Single Voice**: Simple audiobook generation
- **Multi-Voice**: Automatic character voice assignment
- **Batch Processing**: Process multiple files at once
- **Markdown Support**: Upload and preview .md files
- **Voice Library**: Save and reuse voice profiles
- **Chapter Detection**: Auto-split books into chapters
- **Professional Audio**: Volume normalization at -18dB
- **Project Management**: Save/load audiobook projects

## Key Features of the Audiobook Interface

1. **File Upload Support**
   - Drag & drop or click to upload
   - Supports .txt, .md, .markdown files
   - Markdown preview with formatting

2. **Batch Processing**
   - Process multiple books simultaneously
   - Progress tracking per file
   - Export individually or all at once

3. **Multi-Voice Features**
   - Auto-detect characters from dialogue
   - Character name format: `CHARACTER_NAME: dialogue`
   - Automatic voice assignment
   - Round-robin voice allocation for many characters

4. **Voice Profiles**
   - Save voices to library
   - Adjust speed, temperature, exaggeration
   - Upload voice samples for cloning
   - Per-character voice settings

5. **Advanced Settings**
   - Auto-split chapters by pattern
   - Remove annotations
   - Configurable chunk sizes
   - Pause duration control

## Starting the Audiobook Backend (Optional)

If you want to actually generate audiobooks (not just use the UI):

```bash
cd /home/crogers2287/chatterbox
source venv/bin/activate
python launch_audiobook.py
```

This will start the Gradio interface at http://localhost:7860

## Quick Test

1. Go to http://localhost:5175
2. Click your username → "Audiobook Mode"
3. Try these features:
   - Upload a markdown file
   - Toggle between Edit/Preview
   - Add multiple voice profiles
   - Try the batch upload with multiple files

## Development Notes

- Authentication is bypassed with `VITE_BYPASS_AUTH=true`
- User data is stored per user ID in localStorage
- The audiobook API endpoints expect port 7860
- All features work with mock data if backend isn't running

## Troubleshooting

If something isn't working:

1. **Check services**: `python3 test_setup.py`
2. **Restart frontend**: `cd chatterbox-webui && npm run dev`
3. **Check browser console**: F12 → Console tab
4. **Clear browser cache**: Ctrl+Shift+R

## Next Steps

1. Explore the audiobook interface
2. Upload some text/markdown files
3. Create voice profiles
4. Test batch processing
5. Start the audiobook backend when ready to generate real audio

Enjoy your professional audiobook studio! 🎵📚