# WI-1.4 — Agnes: Mobile UX

## Type
Module UX / Mobile Design

## Module
`src/modules/agnes/`

## Summary
Redesign Agnes mobile experience for spacious, immersive interaction. Agnes is a therapy module — the UX should feel calm, focused, and clutter-free on mobile.

## Design Principles
- **Sanctuary feel**: generous whitespace, breathing room, no cramped layouts
- **One thing at a time**: on mobile, show one primary view (chat OR dashboard OR somatic), not all three
- **Large touch targets**: all buttons min 44x44px, generous tap areas
- **Safe for emotional context**: no jarring transitions, gentle animations

## Mobile Layout Specifications

### Selecting State (Home)
- Full-width card stack: therapist card, session history, quick actions
- Cards use full viewport width minus 16px margins
- "Start Session" button: full-width, large (56px height), bottom-anchored
- Dashboard stats collapsed into a compact summary row (expandable)

### Session State (Chat)
- Already handled by `SingleAgentLayout` mobile overlay — verify it works
- Chat input: sticky bottom with safe-area padding
- Message bubbles: max-width 85%, text wraps gracefully
- Streaming indicator: visible and not obscured by keyboard

### Somatic State (Exercises)
- Full-screen immersive: exercise fills entire viewport
- Navigation: minimal top bar with back button and exercise name
- Timer/animation: centered, large, easily readable
- Instruction text: large font (18px+), high contrast
- "Complete" button: large, bottom-anchored, safe-area aware

### Sidebar on Mobile
- Hidden by default — accessible via hamburger or swipe-from-left
- Uses `MobileBottomSheet` (WI-X.3) when opened — shows personality settings
- Never overlays content without explicit user action

## Specific Fixes
1. Sanctuary background: reduce blur/opacity on mobile for performance
2. 3D environment: disable on mobile (< 768px) to save battery and GPU
3. Telemetry header: collapse to single-line summary on mobile
4. Therapist card: full-width, simplified layout (no sidebar image on mobile)
5. Somatic session picker: 2-column grid → single column on mobile
6. Settings: use bottom sheet, not centered modal

## Acceptance Criteria
- [ ] Agnes mobile layout is spacious with generous margins and padding
- [ ] Somatic exercises are full-screen on mobile
- [ ] All touch targets ≥ 44x44px
- [ ] No layout shift when keyboard appears
- [ ] 3D environment disabled on mobile
- [ ] `npm run build` passes
