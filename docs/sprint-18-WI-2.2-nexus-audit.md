# WI-2.2 — Nexus: Full Audit

## Type
Platform Page Audit

## Module
`src/modules/nexus/`

## Summary
Nexus is the orchestrator page — first page after auth. Contains onboarding flow, dashboard, and AI chat. Also has `NexusOverlay` (floating sidebar) that appears globally.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `NexusPage.tsx` | Onboarding/dashboard state, vault nudge |
| `NexusDashboard.tsx` | Multi-card overview — overflow |
| `CommandPalette.tsx` | Search/command overlay — z-index, containment |
| `DailyBriefSection.tsx` | Brief content — text overflow |
| `ModuleHealthFAB.tsx` | Floating button — position vs GlobalFAB |
| `SynthesisPanel.tsx` | Long synthesis text — scroll |
| `MemorySearchResults.tsx` | Search results list — scroll |
| `NexusErrorBoundary.tsx` | Error fallback — layout |
| `NexusOverlay.tsx` (global) | Floating sidebar — z-index, mobile overlay, width management |

## Critical Fixes
1. `NexusOverlay`: collapsed width (60px) and expanded width (180px) — verify no content clipping
2. `CommandPalette`: z-index must be `--z-modal` level, backdrop must block interaction
3. `ModuleHealthFAB`: must not conflict with `GlobalFAB` positioning
4. `NexusDashboard`: all cards handle long module names and descriptions
5. `SynthesisPanel`: long AI synthesis text must scroll
6. Onboarding flow: multi-step form must scroll, progress indicator visible

## Mobile Fixes
- `NexusOverlay`: hidden on mobile (chat accessible via other means)
- Dashboard: single-column cards
- Command palette: full-screen on mobile
- Onboarding: full-screen steps, large inputs

## Placeholder Audit
- Dashboard module health cards — verify connected to real module state
- Synthesis content — must be real AI output or empty state
- Daily brief — real data or hidden

## Acceptance Criteria
- [ ] NexusOverlay doesn't clip content when collapsed/expanded
- [ ] Command palette properly overlays all content
- [ ] No FAB positioning conflicts
- [ ] Dashboard handles long text
- [ ] `npm run build` passes
