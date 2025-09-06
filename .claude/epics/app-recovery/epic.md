---
name: app-recovery
status: backlog
created: 2025-09-06T20:38:43Z
progress: 0%
prd: .claude/prds/app-recovery.md
github: [Will be updated when synced to GitHub]
---

# Epic: app-recovery

## Overview

Implement a comprehensive recovery system for the Chatterbox TTS application that handles browser crashes, network interruptions, and service failures. The solution leverages existing browser storage APIs, extends the current Zustand state management, and adds minimal backend infrastructure to provide reliable session and audio recovery without impacting performance.

## Architecture Decisions

- **Storage Strategy**: Hybrid approach using IndexedDB for large data (audio blobs) and localStorage for quick session metadata
- **State Management**: Extend existing Zustand store with persistence middleware and recovery actions
- **Backend Minimal**: Leverage existing file serving capabilities with simple recovery token system
- **Recovery Detection**: Browser events (beforeunload, visibilitychange) combined with heartbeat mechanism
- **Simplification**: Use existing audio file storage instead of creating new database tables

## Technical Approach

### Frontend Components

**Recovery UI Components**
- RecoveryBanner.tsx - Shows "Recovery Available" prompt on app load
- RecoveryModal.tsx - Details recovered sessions with restore/dismiss options
- AutoSaveIndicator.tsx - Visual feedback for auto-save status

**State Management Extensions**
- Add persistence layer to existing Zustand store
- Implement recovery slice for managing recovery state
- Create middleware for auto-save with debouncing

**Browser Storage Schema**
```typescript
// IndexedDB schema for audio recovery
{
  sessions: {
    id: string,
    timestamp: number,
    text: string,
    parameters: TTSParams,
    voiceId: string,
    audioChunks: Blob[]
  }
}
```

### Backend Services

**Minimal API Extensions**
- `POST /api/recovery/token` - Generate recovery token for audio files
- `GET /api/recovery/audio/{token}` - Retrieve audio by recovery token
- Reuse existing `/synthesize` endpoint with recovery metadata

**Recovery Token System**
```python
# Simple token generation using existing infrastructure
def generate_recovery_token(audio_path: str) -> str:
    token = hashlib.sha256(f"{audio_path}{time.time()}".encode()).hexdigest()[:16]
    # Store in simple JSON file, no database needed
    recovery_map[token] = {"path": audio_path, "expires": time.time() + 86400}
    return token
```

### Infrastructure

**Deployment Considerations**
- No new services required
- Utilize existing file system for temporary storage
- Implement cleanup cron job for expired recovery files

**Monitoring**
- Add recovery metrics to existing health endpoints
- Log recovery attempts and success rates

## Implementation Strategy

### Phase 1: Local Recovery (Week 1)
- Implement browser storage layer
- Add auto-save to Zustand store
- Create recovery UI components
- Test with simulated crashes

### Phase 2: Server-Side Support (Week 2)
- Add recovery token endpoints
- Implement file cleanup logic
- Integrate with existing audio generation

### Phase 3: Polish & Testing (Week 3)
- End-to-end recovery testing
- Performance optimization
- User documentation

## Task Breakdown Preview

High-level task categories that will be created:
- [ ] Browser Storage Implementation: IndexedDB wrapper and localStorage management
- [ ] State Persistence Layer: Zustand middleware for auto-save and recovery
- [ ] Recovery UI Components: Banner, modal, and indicator components
- [ ] Recovery Token System: Minimal backend for audio file recovery
- [ ] Auto-Save Logic: Debounced saving with conflict resolution
- [ ] Recovery Detection: App initialization checks and restore flow
- [ ] Cleanup Service: Automated removal of expired recovery data
- [ ] Integration Testing: E2E tests for all recovery scenarios

## Dependencies

**External Service Dependencies**
- None - uses standard browser APIs

**Internal Dependencies**
- Existing Zustand store structure
- Current audio file serving mechanism
- Load balancer session affinity for recovery tokens

**Prerequisite Work**
- None - can be implemented independently

## Success Criteria (Technical)

**Performance Benchmarks**
- Auto-save latency < 50ms (measured via performance.mark)
- Recovery detection < 100ms on app load
- Zero impact on TTS generation time

**Quality Gates**
- 100% recovery success rate in E2E tests
- No memory leaks from IndexedDB usage
- Graceful degradation when storage quota exceeded

**Acceptance Criteria**
- All three user personas can successfully recover their work
- Recovery works across browser restarts
- No data loss for sessions < 24 hours old

## Estimated Effort

**Overall Timeline**: 3 weeks (1 developer)
- Week 1: Frontend implementation (40 hours)
- Week 2: Backend integration (30 hours)
- Week 3: Testing and refinement (20 hours)

**Resource Requirements**
- 1 Full-stack developer
- ~100GB additional storage for recovery files
- No additional infrastructure

**Critical Path Items**
- Browser storage implementation (blocks all other work)
- Recovery token system (blocks server-side recovery)
- E2E test suite (blocks release)