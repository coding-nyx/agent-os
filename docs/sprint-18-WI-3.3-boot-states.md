# WI-3.3 — Boot / Loading States

## Type
Auth & Entry Audit

## Scope
`BootLoader.tsx`, loading skeletons, error boundaries

## Summary
Audit all loading and error states for consistent layout, overflow handling, and mobile display.

## Audit Areas

### BootLoader
- Initial app boot screen
- Must fill viewport on all devices: `100dvh` or `100vh` with fallback
- Content centered vertically and horizontally
- Animation performance on low-end mobile
- No content shift when transitioning from boot to app

### UnifiedModulePage Loading State
- Skeleton cards: proportional to actual content
- Centered with max-width constraint
- Animated skeleton (shimmer) — verify performance

### AIRuntimeGate
- "AI unavailable" banner: full-width, doesn't push content off-screen
- Banner fixed at top: `z-50` — should use `--z-header` variable

### AppErrorBoundary
- Error fallback UI: centered, mobile-friendly
- Retry button: large, obvious
- Error message: scrollable if long (stack traces in debug mode)

### SyncTransition
- Module exit transition — verify it covers the full viewport
- No content visible behind transition overlay

### Empty States
- `EmptyState` component: responsive sizing (sm, md, lg variants)
- Verify all module empty states use consistent component

## Fixes
1. `AIRuntimeGate` banner: replace `z-50` with `z-[var(--z-header)]`
2. `BootLoader`: use `100dvh` for proper mobile viewport
3. Error boundary: scrollable error details, mobile-friendly
4. All skeletons: proportional sizing, no hardcoded pixel widths

## Acceptance Criteria
- [ ] Boot loader fills viewport correctly on all devices
- [ ] All loading skeletons proportional
- [ ] Error boundaries mobile-friendly with scrollable details
- [ ] AI unavailable banner uses correct z-index
- [ ] `npm run build` passes
