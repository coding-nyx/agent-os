# WI-X.3 — Mobile-First Interaction Patterns

## Type
Cross-cutting / UX Design

## Priority
P1 — Execute after module audits to consolidate patterns

## Summary
Define and implement a shared mobile interaction vocabulary: bottom sheets for actions, swipe gestures, pull-to-refresh, safe-area compliance, and minimum touch targets. Create reusable components that modules can adopt.

## Current State
- `SingleAgentLayout` has a solid mobile chat overlay (portaled, full-screen, spring animations)
- Mobile FAB positioning respects `env(safe-area-inset-bottom)` and `moduleBottomBarHeight`
- `ModuleSwitcherPopover` has mobile/desktop variants
- No shared bottom sheet component — modules use `NeuralModal` for everything
- Touch targets vary — some buttons are 36px, some 44px+
- `HubPage` toggles bottom dashboard on mobile but interaction is basic (button toggle)
- No swipe gestures anywhere
- No pull-to-refresh
- Tab groups (`NeuralTabGroup`) use horizontal scroll but no swipe-between-tabs

## Deliverables

### 1. `MobileBottomSheet` Component (`src/core/components/MobileBottomSheet.tsx`)
- Animated from bottom, portal to body
- Drag-to-dismiss handle
- Respects `env(safe-area-inset-bottom)`
- Snap points: peek (30vh), half (50vh), full (90vh)
- Backdrop tap to dismiss
- Used instead of centered modals on mobile for action menus, settings, quick-add forms

### 2. Touch Target Audit Utility
- Create a lint-like checklist: all `<button>`, `<a>`, clickable divs must be min 44x44px on mobile
- Document exceptions (inline text links in prose)

### 3. Safe Area Compliance
- Audit all `fixed` and `sticky` elements for `env(safe-area-inset-*)` usage
- Ensure header, FAB, bottom bars, overlays all respect safe areas
- Add `viewport-fit=cover` to `index.html` `<meta name="viewport">` if not present

### 4. Mobile Layout Principles (docs only, applied per-module)
- **Dashboard views**: Single-column card stack with 16px gaps, no horizontal scroll
- **Forms**: Full-width inputs, large labels, keyboard-aware scroll
- **Lists**: Full-width items, swipe hints for actions
- **Charts**: Horizontally scrollable container with snap points
- **Modals on mobile**: Always bottom sheet or full-screen, never centered floating

### 5. Responsive Breakpoint Strategy
Verify consistent usage:
- `< 640px` (sm): phone portrait — single column, bottom sheets, FABs
- `640px – 768px` (md): phone landscape / small tablet — begin two-column
- `768px – 1024px` (lg): tablet — sidebar chat docks, two-column layouts
- `1024px+` (xl): desktop — full three-column, all rails visible

## Files Modified
- `src/core/components/MobileBottomSheet.tsx` — new
- `index.html` — verify viewport meta
- `src/index.css` — mobile utility additions if needed
- Various module components — applied per-module in WI-1.x / WI-2.x

## Acceptance Criteria
- [ ] `MobileBottomSheet` component works with snap points and drag-to-dismiss
- [ ] All fixed/sticky elements respect safe areas on iOS Safari
- [ ] Touch targets documented and enforced in new/modified components
- [ ] `npm run build` passes
