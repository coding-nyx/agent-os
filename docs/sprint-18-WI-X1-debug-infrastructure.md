# WI-X.1 — Global Debug Infrastructure

## Type
Cross-cutting / Infrastructure

## Priority
P0 — Execute first, enables all subsequent verification

## Summary
Create a system-wide `DebugActivityOverlay` component and enhance `NexusLogger` with an observable event stream so that every significant runtime event (AI state changes, profile writes, spine events, upload progress, handoff dispatches) is visible when debug mode is enabled.

## Current State
- `useDebugMode` hook exists with granular `DebugFlags` (thinking, actionTags, actionAsked, dataUpdates, actionUpdates, spineEvents)
- `DebugThoughtPanel` shows per-message AI reasoning in chat bubbles
- `ModelBadge` shows active LLM model in header
- `SoulActivityTag` shows last spine event type with 3s TTL
- `NexusLogger` captures errors, actions, spine events in memory arrays — but no UI subscription mechanism
- `TelemetryTicker` in `ModuleLayout` header shows fake ticker when debug OFF, real spine events when debug ON — but limited to last event type string

## Gap
No unified real-time debug panel showing all system activity. Debug info is scattered across individual components. No way to observe: profile save events, document pipeline stages, handoff dispatches, memory consolidation, vault operations.

## Deliverables

### 1. `NexusLogger` Observable Stream (`src/lib/nexus-logger.ts`)
- Add `subscribe(category, callback)` → unsubscribe function
- Categories: `'action' | 'spine' | 'error' | 'profile' | 'upload' | 'handoff' | 'vault' | 'ai'`
- Each event: `{ category, timestamp, moduleId?, label, detail? }`
- Ring buffer: last 500 events max
- `getRecentAll(n?)` method for initial load

### 2. `DebugActivityOverlay` (`src/core/components/debug/DebugActivityOverlay.tsx`)
- Fixed bottom-right panel, collapsible to a small pill
- Only renders when `debugMode === true`
- Sections (tabbed or scrollable):
  - **AI State**: thinking/streaming/idle indicator with module name
  - **Events Feed**: real-time log tail of all categories, color-coded
  - **Spine**: live spine event stream with priority badges and cascade indicators
  - **Profile**: last N profile write events with module/field info
  - **Upload**: active document pipeline stages with progress
- Controls: filter by category, filter by module, clear, copy-to-clipboard
- Respects z-index: `var(--z-overlay)` (below modals, above content)
- Resizable height via drag handle
- Persists collapsed/expanded state to localStorage

### 3. Debug Logging Hooks
Wire `NexusLogger.emit(category, ...)` calls into:
- `useModuleAI` — `ai:send`, `ai:receive`, `ai:stream-start`, `ai:stream-end`, `ai:error`
- All module profile services — `profile:save`, `profile:load`
- `Spine.publish` — already captured, but add cascade chain info
- `NexusHandoffService.store/retrieve` — `handoff:store`, `handoff:retrieve`
- `runDocumentPipeline` — `upload:stage-change` with stage name
- `VaultProvider` lock/unlock events — `vault:lock`, `vault:unlock` (no secrets)
- `ModuleMemoryService` operations — `ai:memory-consolidate`

### 4. Integration in `App.tsx`
- Add `<DebugActivityOverlay />` inside `<AppContent>`, gated by debug mode
- No performance impact when debug is off (component returns null immediately)

## Files Modified
- `src/lib/nexus-logger.ts` — add observable stream
- `src/core/components/debug/DebugActivityOverlay.tsx` — new
- `src/core/components/debug/index.ts` — re-export
- `src/App.tsx` — mount overlay
- `src/lib/hooks/use-module-ai.ts` — add debug logging
- `src/lib/services/nexus-handoff-service.ts` — add debug logging
- `src/lib/services/document-pipeline.ts` — add debug logging
- `src/lib/vault-context.tsx` — add debug logging (non-secret events only)

## Acceptance Criteria
- [ ] Debug overlay appears when debug mode toggled ON via System Command Center
- [ ] Real-time events stream into the overlay within 100ms of occurrence
- [ ] All 8 categories produce events during normal module interaction
- [ ] Overlay is collapsible and remembers state across page navigations
- [ ] Zero render cost when debug mode is OFF
- [ ] No z-index conflicts with modals, toasts, or FABs
- [ ] `npm run build` passes
