---
issue: 17
title: Recovery UI Components
analyzed: 2025-09-07T00:27:40Z
estimated_hours: 14
parallelization_factor: 3.5
---

# Parallel Work Analysis: Issue #17

## Overview
Create three independent UI components for the recovery system: RecoveryBanner (non-intrusive notification), RecoveryModal (detailed session selection), and AutoSaveIndicator (visual feedback states). These components will integrate with existing recovery backend services and follow the established UI patterns using React, TypeScript, Tailwind CSS, and Radix UI components.

## Parallel Streams

### Stream A: RecoveryBanner Component
**Scope**: Non-intrusive notification banner with restore/dismiss actions
**Files**:
- `chatterbox-webui/src/components/recovery/RecoveryBanner.tsx`
- `chatterbox-webui/src/components/recovery/types.ts`
**Agent Type**: frontend-specialist
**Can Start**: immediately
**Estimated Hours**: 4
**Dependencies**: none

### Stream B: RecoveryModal Component  
**Scope**: Detailed modal view for session selection and restore options
**Files**:
- `chatterbox-webui/src/components/recovery/RecoveryModal.tsx`
- `chatterbox-webui/src/components/recovery/SessionCard.tsx`
**Agent Type**: frontend-specialist
**Can Start**: immediately
**Estimated Hours**: 6
**Dependencies**: none

### Stream C: AutoSaveIndicator Component
**Scope**: Visual feedback component showing saving/saved/error states
**Files**:
- `chatterbox-webui/src/components/recovery/AutoSaveIndicator.tsx`
**Agent Type**: frontend-specialist
**Can Start**: immediately
**Estimated Hours**: 3
**Dependencies**: none

### Stream D: Integration & Testing
**Scope**: Component integration, testing, and Storybook stories
**Files**:
- `chatterbox-webui/src/components/recovery/index.ts`
- `chatterbox-webui/tests/recovery-components.spec.ts`
- `chatterbox-webui/src/stories/RecoveryBanner.stories.ts`
- `chatterbox-webui/src/stories/RecoveryModal.stories.ts`
- `chatterbox-webui/src/stories/AutoSaveIndicator.stories.ts`
**Agent Type**: frontend-specialist
**Can Start**: after Streams A, B, C complete
**Estimated Hours**: 1
**Dependencies**: Stream A, B, C

## Coordination Points

### Shared Files
These files will be coordinated across streams:
- `chatterbox-webui/src/components/recovery/types.ts` - Stream A creates, others import
- Component directory structure - All streams working in same directory

### Sequential Requirements
1. Stream A should create the shared `types.ts` file first
2. Streams B & C can reference types created by Stream A
3. Stream D requires all components to be completed

## Conflict Risk Assessment
- **Low Risk**: Components are independent with minimal shared interfaces
- **Low Risk**: Working in dedicated `/recovery/` directory avoiding conflicts
- **Medium Risk**: Only shared concern is the types file - easily manageable

## Parallelization Strategy

**Recommended Approach**: hybrid

Launch Streams A, B, and C simultaneously as they are independent components. Stream A should prioritize creating the types file early for others to reference. Stream D starts when all three component streams complete.

## Expected Timeline

With parallel execution:
- Wall time: 6 hours (longest stream)
- Total work: 14 hours
- Efficiency gain: 57%

Without parallel execution:
- Wall time: 14 hours

## Technical Context

### Existing Architecture
- React 18 with TypeScript
- Tailwind CSS for styling  
- Radix UI primitives (Button, Dialog, etc.)
- Lucide React for icons
- Zustand for state management
- Playwright for testing

### Recovery Backend Integration
- Recovery service API already exists (`recovery_service.py`)
- Database layer implemented (`recovery_database.py`)
- API endpoints available (`recovery_endpoints.py`)
- Components will use existing API patterns via `chatterboxAPI`

### UI Component Patterns
- Consistent with existing components (StatusBar.tsx as reference)
- Follow established button variants and styling
- Implement accessibility with ARIA labels and keyboard navigation
- Use established color tokens (green-500, red-500, muted-foreground)

## Component Specifications

### RecoveryBanner
- Small, non-intrusive notification at top/bottom of interface
- Action buttons: "Restore Session" and "Dismiss"
- Shows brief session info (timestamp, audio count)
- Auto-dismiss after timeout option
- Slide-in/slide-out animations

### RecoveryModal
- Full modal dialog using Radix Dialog primitive
- List of available recovery sessions
- Session cards showing: timestamp, duration, audio clips count
- Preview/select individual audio clips
- Bulk actions: "Restore All" or "Restore Selected"
- Search/filter capabilities for multiple sessions

### AutoSaveIndicator
- Small indicator component (dot or icon)
- Three states: saving (spinner), saved (checkmark), error (x)
- Tooltip showing last save time
- Minimal footprint, typically in corner of interface
- Fade in/out transitions between states

## Notes
- All components should work with mock data initially
- Focus on TypeScript interfaces matching backend data structures
- Implement responsive design for mobile compatibility
- Use existing design tokens and component patterns
- Components should be composable and reusable
- Consider adding debug/development modes for testing