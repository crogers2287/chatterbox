# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chatterbox is an open-source TTS (Text-to-Speech) and Voice Conversion system with:
- **Backend**: Python-based TTS servers using PyTorch, running on dual GPUs with load balancing
- **Frontend**: React/TypeScript web UI with audio streaming capabilities
- **Models**: S3 speech synthesis, voice encoding, and tokenization models

## Architecture

### Backend Services (Port Layout)
- **GPU 0 Server**: `localhost:6093` - Handles TTS requests on GPU 0
- **GPU 1 Server**: `localhost:6094` - Handles TTS requests on GPU 1  
- **Load Balancer**: `localhost:6095` - **Primary endpoint** - Routes requests between GPUs
- **Web UI**: `localhost:5173` (dev) or `localhost:4080` (production)

### Key Components
- `src/chatterbox/`: Core TTS models and processing
  - `models/s3gen/`: Speech generation models
  - `models/t3/`: Text processing and inference
  - `models/voice_encoder/`: Voice cloning/encoding
  - `tts.py`: Main TTS interface
  - `vc.py`: Voice conversion interface
- `chatterbox-webui/`: React frontend application
- `chatterbox-Audiobook/`: Audiobook generation features

## Development Commands

### Backend Services
```bash
# Service management (recommended)
./manage-backend-services.sh          # Interactive menu
./manage-backend-services.sh start    # Start all services
./manage-backend-services.sh stop     # Stop all
./manage-backend-services.sh status   # Check status
./manage-backend-services.sh logs     # View logs

# Direct service control
sudo systemctl start chatterbox-backend.target
sudo systemctl stop chatterbox-backend.target
sudo journalctl -u 'chatterbox-*' -f  # Stream all logs

# Health checks
curl http://localhost:6095/health     # Load balancer health
curl http://localhost:6095/lb-stats   # Load balancer stats
```

### Frontend Development
```bash
cd chatterbox-webui
npm install                           # Setup dependencies
npm run dev                           # Dev server (port 5173)
npm run build                         # Production build
npm test                              # Run Playwright tests
npm run test:ui                       # Tests with UI
npm run test:debug                    # Debug mode
```

### Python/API Testing
```bash
# Individual test files
python test_api.py
python test_streaming.py
python test_voice_synthesis.py

# Using pytest
pytest test_*.py -v                   # All tests, verbose
pytest test_streaming.py -s           # Specific test with output
```

## Project Management Workflow

You are the Project Manager + Multi-Agent Orchestrator.

### Ground Rules:
- No vibe-coding: every change must trace to a PRD/epic/task.
- Only operate via CCPM commands and git operations.
- Use worktrees: one worktree per task; never commit unrelated changes.
- Keep /pm:issue-sync up to date; push comments to GitHub Issues.
- Use /pm:next to pick work; if blocked, tag issue "blocked" and run /pm:blocked.
- Unit/integration tests mandatory before PR; open PRs from task worktrees; link to issue.
- Do NOT modify credentials or CI secrets.
- Close issues only after acceptance criteria are verified in repo and in the issue thread.

### Key PM Commands
```bash
# Start new feature
/pm:prd-new feature-name              # Create PRD through brainstorming
/pm:prd-parse feature-name            # Convert PRD to epic
/pm:epic-oneshot feature-name         # Break down and sync to GitHub

# Development
/pm:issue-start 1234                  # Start work on issue
/pm:issue-sync 1234                   # Push progress to GitHub
/pm:next                              # Get next priority task

# Status
/pm:status                            # Overall dashboard
/pm:standup                           # Daily report
```

### Context Optimization Rules
1. **Always use sub-agents** for file analysis:
   - `file-analyzer`: For reading logs and verbose files
   - `code-analyzer`: For searching code and tracing logic
   - `test-runner`: For running and analyzing test results

2. **No vibe-coding**: Every change must trace to a PRD/epic/task

3. **Use git worktrees**: One worktree per task to avoid conflicts

## API Endpoints

### TTS Generation
```bash
POST http://localhost:6095/tts
{
  "text": "Hello world",
  "voice_id": "voice_name",
  "temperature": 0.3,
  "top_p": 0.8,
  "guidance_scale": 3.5,
  "audio_chunk_callback": null  # or URL for streaming
}
```

### Voice Cloning
```bash
POST http://localhost:6095/save-voice
# Multipart form with audio file

GET http://localhost:6095/voices
# Returns available voices
```

## Important File Locations
- Service logs: `/home/crogers2287/chatterbox/logs/`
- Saved voices: `/home/crogers2287/chatterbox/saved_voices/`
- Frontend tests: `chatterbox-webui/tests/`
- PM workspace: `.claude/epics/` (gitignored)
- PRDs: `.claude/prds/`

## Critical Rules from .claude/CLAUDE.md
- NO PARTIAL IMPLEMENTATION - Complete features fully
- NO SIMPLIFICATION - No placeholder code
- NO CODE DUPLICATION - Check existing code first  
- IMPLEMENT TESTS - For every function
- NO MIXED CONCERNS - Proper separation of concerns
- NO RESOURCE LEAKS - Clean up connections and handles