# WI-X.4 — Spine Event Debug Log

## Type
Cross-cutting / Observability

## Priority
P2 — Final observability pass after all modules are fixed

## Summary
When debug mode is ON, capture and display ALL spine events (not just the visual pulse overlay). Show cascade chains, event history, and provide filtering by domain/priority/module.

## Current State
- `SpineOverlay` shows last 8 events as animated pills, auto-decays after timeout
- `SoulActivityTag` shows last event type with 3s TTL
- `TelemetryTicker` polls `NexusLogger.getRecentSpineEvents(1)` every 1s
- `NexusLogger.spineEvents` array captures all spine events (max 200)
- Spine cascade rules exist in `cascade-rules.ts` but cascade chains aren't visualized

## Deliverables

### 1. Spine Event Log Tab in `DebugActivityOverlay`
- Full scrollable history of spine events (last 200)
- Columns: timestamp, type, source, domain (color-coded), priority (badge), data snippet
- Click to expand full event data
- Filter controls: by domain (B/E/C/R/system), by priority (info/alert/critical), by source module

### 2. Cascade Chain Visualization
- When a cascade rule fires, log both the trigger event and the resulting event
- Show as parent→child in the debug log (indented or linked)
- E.g., `BURNOUT_WARNING → REDUCE_TRAINING_LOAD` shown as a chain

### 3. Spine Event Counter Badge
- In the `DebugActivityOverlay` collapsed pill, show count of events since last expansion
- In `ModuleLayout` header, show event count badge next to `TelemetryTicker` when debug ON

### 4. Export Spine Log
- "Copy as JSON" button for the full spine event buffer
- Useful for debugging cross-module coordination issues

## Files Modified
- `src/core/components/debug/DebugActivityOverlay.tsx` — spine tab
- `src/lib/spine/spine-event-bus.ts` — cascade chain metadata
- `src/lib/nexus-logger.ts` — cascade chain capture
- `src/core/layout/ModuleLayout.tsx` — event count badge (debug only)

## Acceptance Criteria
- [ ] All spine events visible in debug overlay with domain/priority filtering
- [ ] Cascade chains clearly show trigger→result relationships
- [ ] Event counter badge visible in header when debug ON
- [ ] Export produces valid JSON
- [ ] Zero performance impact when debug OFF
