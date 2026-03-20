# WI-1.3 — Agnes: Debug Overlay Integration

## Type
Module Integration / Debug

## Module
`src/modules/agnes/`

## Summary
Wire Agnes-specific events into the global `DebugActivityOverlay` (WI-X.1). When debug mode is enabled, users should see real-time feedback about Agnes operations.

## Events to Log

| Event | Category | When |
|-------|----------|------|
| Agnes profile loaded | `profile` | On `subscribeAgnesProfile` callback |
| Agnes profile saved | `profile` | On `saveAgnesProfile` call |
| Therapy session started | `ai` | On state transition to `'session'` |
| Therapy session ended | `ai` | On state transition away from `'session'` |
| Somatic exercise started | `ai` | On state transition to `'somatic'` |
| Somatic exercise completed | `ai` | On exercise completion callback |
| AI message sent | `ai` | Via `useModuleAI` (handled by WI-X.1) |
| AI message received | `ai` | Via `useModuleAI` (handled by WI-X.1) |
| Belief graph updated | `profile` | On belief data write |
| Agnes spine events | `spine` | Automatic via NexusLogger |

## Implementation
- Add `NexusLogger.emit('profile', { moduleId: 'agnes', label: '...', detail })` calls at key points
- State transitions logged via existing `useEffect` hooks — add logger calls inside
- Somatic exercise events: add logging in `SomaticSessionPicker` callbacks

## Depends On
- WI-X.1 (DebugActivityOverlay must exist)

## Acceptance Criteria
- [ ] Agnes profile load/save events visible in debug overlay
- [ ] Session state transitions visible in debug overlay
- [ ] Somatic exercise lifecycle visible in debug overlay
- [ ] Events include module ID and human-readable labels
