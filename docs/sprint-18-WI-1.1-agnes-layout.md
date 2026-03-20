# WI-1.1 — Agnes: Layout & Overflow

## Type
Module Audit / UI Fix

## Module
`src/modules/agnes/`

## Summary
Audit every component in the Agnes module for overflow, clipping, z-index violations, and text truncation issues. Agnes uses `UnifiedModulePage` with `workspaceType: 'focus'` and a custom sanctuary layout.

## Components to Audit

| Component | Key Concerns |
|-----------|-------------|
| `AgnesPage.tsx` | Overall layout composition, state machine (selecting/session/somatic) |
| `AgnesSanctuaryContent.tsx` | Main content area — verify scroll behavior with long chat threads |
| `AgnesSanctuarySidebar.tsx` | Collapsible sidebar — verify collapse/expand doesn't clip content, hidden on mobile |
| `SanctuaryBackground.tsx` | Background effects — verify no z-index overlap with interactive content |
| `Agnes3DEnvironment.tsx` | Canvas/3D — must not overlay buttons or chat input |
| `AgnesTelemetryHeader.tsx` | Stats display — text truncation for long values |
| `AgnesTherapistCard.tsx` | Card content — long therapist name/description overflow |
| `AgnesPersonalitySidebar.tsx` | Sidebar content — long personality trait text |
| `AgnesDashboard.tsx` | Dashboard metrics — overflow in metric cards |
| `BeliefGraph.tsx` | SVG/canvas graph — must stay within container bounds |
| `AgnesSettingsPanel.tsx` | Settings form — scroll for long settings lists |
| `AgnesNotificationSettingsPanel.tsx` | Settings modal — content must scroll within modal |
| `SomaticSessionPicker.tsx` | Exercise picker — card grid overflow on mobile |
| `BreathworkExercise.tsx` | Full-screen exercise — verify viewport filling |
| `GroundingExercise.tsx` | Full-screen exercise — verify viewport filling |

## Specific Fixes
1. Ensure sanctuary content area has `overflow-y-auto min-h-0` for chat scrolling
2. Sidebar must collapse cleanly without layout jank — use `overflow-hidden` during transition
3. 3D environment canvas: `pointer-events-none` on non-interactive areas, proper z-index below content
4. All text in cards: `truncate` for titles, `line-clamp-2` or `line-clamp-3` for descriptions
5. BeliefGraph: constrain SVG with `max-width: 100%; height: auto` or explicit container dimensions
6. Replace any raw `z-[N]` with `z-[var(--z-*)]`

## Breakpoint Verification
- 320px: single column, sidebar hidden, chat full-width
- 375px: same as 320, slightly more breathing room
- 768px: sidebar begins to show, chat docked
- 1024px: full layout with sidebar + content + chat
- 1440px: generous spacing, all elements visible

## Acceptance Criteria
- [ ] No content clips or overflows its container at any breakpoint
- [ ] No z-index collisions between background, content, sidebar, and overlays
- [ ] All text handles overflow gracefully (truncate, line-clamp, or scroll)
- [ ] Sidebar collapse/expand is smooth with no layout shift
- [ ] `npm run build` passes
