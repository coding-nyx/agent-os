# WI-1.17 — Scout: Layout & Overflow

## Type
Module Audit / UI Fix

## Module
`src/modules/scout/`

## Summary
Scout has its own shell layout system (`scout-shell-layout.ts` with `SCOUT_SHELL_BREAKPOINTS`) and a multi-pane research workspace. Audit all views for overflow, particularly the research workspace which splits into multiple panels.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `ScoutPage.tsx` | Shell layout, breakpoint system, view management |
| `ScoutDashboard.tsx` | Research overview — cards, metrics |
| `ActiveResearchWorkspace.tsx` | Multi-pane layout — panel overflow, resize |
| `ScoutResearchArtifactsPanel.tsx` | Artifact list — scroll, long titles |
| `ScoutSessionList.tsx` | Session list — scroll, active state |
| `ScoutUploadZone.tsx` | File drop zone — sizing, drag state |
| `ScoutDocumentCard.tsx` | Document card — long filename, status |
| `ScoutEvidenceSources.tsx` | Source citations — long URLs, text |
| `SignalBubbleCanvas.tsx` | Canvas element — containment |
| `ExportDialog.tsx` | Export modal — content scroll |
| `NewSessionDialog.tsx` | Form modal — content scroll |
| `DeepResearchPanel` | Research progress, results — long content |
| `DigestViewer` | Long reading content — scroll |
| `SourceLibraryPane` | Source list — search, filter, scroll |

## Critical Fixes
1. `ActiveResearchWorkspace`: multi-pane must degrade to single-pane on mobile (< 768px)
2. `DigestViewer`: reading content must scroll with proper typography
3. `SourceLibraryPane`: search bar sticky, source list scrollable
4. `ScoutResearchArtifactsPanel`: artifact cards handle long titles with truncation
5. `SignalBubbleCanvas`: canvas must stay within container bounds
6. `ExportDialog` / `NewSessionDialog`: content must scroll within modal
7. Scout shell breakpoints: verify `SCOUT_SHELL_BREAKPOINTS` align with global breakpoints

## Acceptance Criteria
- [ ] Multi-pane workspace degrades to single-pane on mobile
- [ ] All reading content scrolls properly
- [ ] Search bars sticky, lists scrollable
- [ ] Long text truncated or wrapped
- [ ] Canvas contained
- [ ] `npm run build` passes
