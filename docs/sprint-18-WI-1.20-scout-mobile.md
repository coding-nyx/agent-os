# WI-1.20 — Scout: Mobile UX

## Type
Module UX / Mobile Design

## Module
`src/modules/scout/`

## Design Principles
- **Reading-first**: Scout is for research — reading experience must be excellent on mobile
- **Progressive disclosure**: Show summary first, tap to expand full content
- **Capture anywhere**: Quick source/note capture always accessible

## Mobile Layout Specifications

### Dashboard
- Research session cards: full-width, tap to open
- Quick stats: compact row (sessions, nodes, sources)
- New research button: prominent FAB

### Research Workspace (Active Session)
- Single-pane on mobile: default to chat/AI panel
- Tab bar at bottom for switching: Chat | Sources | Artifacts | Notes
- Sources panel: full-width list, tap to preview
- Artifacts panel: card stack, tap to expand
- No split-pane on mobile

### Source Library
- Full-width source cards
- Search bar: sticky top
- Filter chips: horizontally scrollable
- Add source: bottom sheet form

### Digest Viewer
- Full-screen reading mode with optimized typography
- Large font (16px+ body), generous line-height (1.7)
- Dark background for comfortable reading
- Scroll progress indicator (thin bar at top)
- Floating "Back" button, not header back (saves vertical space)

### Deep Research
- Progress shown as full-width progress bar with stage label
- Results: card stack, expandable sections
- Export: bottom sheet with format options

### Upload
- Upload zone: large, full-width, clear drag/tap indication
- Upload progress: inline card with stage indicator
- Document preview: full-screen

## Specific Fixes
1. `ActiveResearchWorkspace`: single-pane with tab navigation on mobile
2. `DigestViewer`: optimized reading typography on mobile
3. `SourceLibraryPane`: full-width, search sticky
4. `DeepResearchPanel`: progress inline, not sidebar
5. `ExportDialog`: bottom sheet on mobile
6. `NewSessionDialog`: bottom sheet on mobile
7. `ScoutUploadZone`: large touch target, clear state indication

## Acceptance Criteria
- [ ] Research workspace is single-pane on mobile with tab switching
- [ ] Reading experience uses optimized mobile typography
- [ ] Source capture accessible within 2 taps
- [ ] Upload progress visible inline
- [ ] All touch targets ≥ 44x44px
