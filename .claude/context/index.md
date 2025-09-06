# Chatterbox TTS Context Index

Comprehensive context documentation for the Chatterbox Text-to-Speech project.

## Project Context Files

### 1. [Project Overview](./project-overview.md)
**Start Here** - Complete introduction to Chatterbox TTS
- Project goals and capabilities
- Technology stack overview
- Key features and use cases
- Performance targets

### 2. [Architecture](./architecture.md)
**System Design** - Technical architecture and components
- System architecture diagram
- Component interactions
- Data flow patterns
- Service organization

### 3. [Development Workflow](./development-workflow.md)
**Developer Guide** - How to work with the codebase
- Setup instructions
- Development commands
- Common tasks and patterns
- Debugging techniques

### 4. [API Reference](./api-reference.md)
**API Documentation** - Complete API specification
- Endpoint documentation
- Request/response formats
- Client library usage
- Error handling

### 5. [Testing Guide](./testing-guide.md)
**Quality Assurance** - Testing strategy and implementation
- Test organization
- Writing and running tests
- Performance benchmarks
- CI/CD integration

### 6. [Key Files Reference](./key-files-reference.md)
**File Guide** - Important files and their purposes
- Core backend files
- Frontend components
- Configuration files
- Service definitions

### 7. [Troubleshooting](./troubleshooting.md)
**Problem Solving** - Common issues and solutions
- Backend troubleshooting
- Frontend debugging
- Performance optimization
- Emergency procedures

## Quick Reference

### Key URLs
- **Load Balancer**: http://localhost:6095
- **GPU 0 Direct**: http://localhost:6093
- **GPU 1 Direct**: http://localhost:6094
- **Web UI**: http://localhost:5173

### Essential Commands
```bash
# Service management
./manage-backend-services.sh [start|stop|status|logs]

# Development
cd chatterbox-webui && npm run dev

# Testing
./run-comprehensive-tests.sh
```

### Performance Metrics
- **Single GPU**: ~75 it/s
- **Dual GPU**: ~150 it/s combined
- **Streaming latency**: <0.5s first chunk
- **Audio quality**: 24kHz

## Development with Claude Code PM

This project uses Claude Code PM for spec-driven development:

1. **Specs define features**: All work starts with specifications
2. **GitHub Issues track tasks**: Each task is an issue
3. **Parallel development**: Multiple agents can work simultaneously
4. **Context preservation**: This documentation maintains continuity

## Context Usage Tips

1. **New to the project?** Read files 1-3 in order
2. **Adding a feature?** Review architecture and API reference
3. **Debugging issues?** Check troubleshooting first
4. **Writing tests?** Follow the testing guide patterns
5. **Deploying changes?** Use service management scripts

---

*Context created: January 2025*
*Project: Chatterbox Open-Source TTS*