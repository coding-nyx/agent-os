# WI-2.1 — Hub: Full Audit

## Type
Platform Page Audit

## Module
`src/modules/hub/`

## Summary
Hub uses `ModuleLayout` directly (not `UnifiedModulePage`) with a multi-layer absolute-positioned layout: ambient background, spine pulse overlay, 3D canvas, content layers. High risk for z-index collisions.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `HubPage.tsx` | Multi-layer z-index stacking, view mode switching |
| `CardsView.tsx` | Card grid — overflow on mobile, card sizing |
| `GraphView.tsx` | SVG/canvas graph — containment, touch interaction |
| `ThreeDView.tsx` | WebGL canvas — containment, fallback |
| `HubViewSwitcher.tsx` | View mode selector — mobile sizing |
| `HubBottomDashboard.tsx` | Dashboard stats — overflow at `max-h-[30vh]`, gauge display |
| `DailyBrief.tsx` | Brief content — text overflow |

## Z-Index Audit (Critical)
Current layers in `HubPage`:
- `z-0`: 3D canvas
- `z-[5]`: spine pulse overlay (⚠️ raw number)
- `z-10`: content layers
- `z-[60]`: view switcher (⚠️ raw number)

**Fix:** Replace `z-[5]` → `z-[var(--z-base)]` and `z-[60]` → `z-[var(--z-fab)]`

## Placeholder Audit
- `stabilityGauge`, `resilienceGauge`, `wellnessGauge` — conditionally render only when data exists
- Module stats from `useModuleStats` — verify all connected to real GlobalSoul data
- Daily brief — verify real data or hide when empty

## Mobile Fixes
- Card grid: single column on mobile, 2 columns on tablet
- Bottom dashboard: collapsible (already implemented), but verify scroll within
- 3D view: disable on mobile (already falls back to CARDS)
- Graph view: touch-friendly node interaction
- View switcher: compact on mobile

## Debug Integration
- Wire hub page events: view mode changes, module navigation attempts, vault gate triggers
- Show module accessibility states in debug overlay

## Acceptance Criteria
- [ ] Zero raw z-index values
- [ ] All layers properly ordered without collision
- [ ] Cards and graph contained on all screen sizes
- [ ] Gauges show real data or are hidden
- [ ] `npm run build` passes
