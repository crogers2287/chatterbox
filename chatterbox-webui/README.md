# Chatterbox TTS Web UI

A modern web interface for Chatterbox Text-to-Speech synthesis, built with React, TypeScript, and shadcn/ui.

## Features

- **Text Processing**: Upload files (txt, pdf, epub, docx, mobi) or paste text directly
- **Voice Cloning**: Upload reference audio to clone voices
- **TTS Parameters**: Fine-tune synthesis with adjustable parameters
  - Exaggeration (emotional intensity)
  - Temperature (randomness)
  - CFG Weight (voice similarity)
  - Min P, Top P, Repetition Penalty
  - Seed for reproducible results
- **Playlist Management**: 
  - Generate audio for individual chunks or all at once
  - Play, regenerate, or remove chunks
  - Track generation progress
- **Export Options**: Export as single file or separate chapters
- **Real-time Status**: Monitor API connection and GPU availability

## Prerequisites

1. Chatterbox TTS API server running on port 6093
2. Node.js 18+ and npm installed

## Installation

```bash
cd chatterbox-webui
npm install
```

## Development

```bash
npm run dev
```

The application will be available at:
- Local: http://localhost:5173
- Network: http://[your-ip]:5173

## Build

```bash
npm run build
```

The built files will be in the `dist` directory.

## Configuration

The API endpoint is configured in `src/lib/api.ts`. By default, it connects to `http://localhost:6093`.

## Usage

1. **Add Text**: Upload a document or paste text in the editor
2. **Voice Reference** (optional): Upload an audio file to clone the voice
3. **Adjust Parameters**: Fine-tune the TTS settings as needed
4. **Generate Audio**: Click "Generate All" or generate individual chunks
5. **Export**: Export your audiobook as a single file or separate chapters

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Zustand (state management)
- Axios (API client)
- React Dropzone (file uploads)

## API Integration

The web UI communicates with the Chatterbox TTS API server using:
- `/health` - System status check
- `/synthesize-json` - Text synthesis without voice reference
- `/synthesize` - Text synthesis with voice reference (multipart form)
- `/audio/{filename}` - Audio file retrieval

## License

Same as Chatterbox TTS project