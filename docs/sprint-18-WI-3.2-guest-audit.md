# WI-3.2 — Guest Mode Flow Audit

## Type
Auth & Entry Audit

## Scope
`GuestModePanel`, `ProtectedRoute`, `AppVaultGate`, guest-related logic in `AuthProvider`

## Summary
Audit the complete guest-to-user journey for layout issues, missing states, and overflow.

## Audit Areas

### GuestModePanel
- Displayed when guest enters a module for the first time
- Must be centered, full-width on mobile
- Content: description, "Continue as Guest" button, "Sign In" option
- Text overflow: description may be long for some modules

### ProtectedRoute
- Loading state: should show boot loader or skeleton, not flash
- Redirect logic: verify no layout flicker during redirect

### AppVaultGate
- Full-page vault unlock flow
- Form centered vertically and horizontally
- Input fields: full-width on mobile
- Error messages: visible, don't overflow
- Loading spinner during unlock

### Guest Data Sync
- When guest signs in: `syncAllGuestDataToUser` runs
- No UI for this — add a sync progress indicator if not present
- At minimum: show a brief "Syncing your data..." overlay

## Mobile Fixes
- `GuestModePanel`: full-width card, large buttons
- `AppVaultGate`: vertically centered, keyboard-aware on mobile
- Sync transition: full-screen overlay with progress

## Acceptance Criteria
- [ ] Guest mode panel renders cleanly on all sizes
- [ ] No layout flicker during route protection redirects
- [ ] Vault gate form is keyboard-aware on mobile
- [ ] Guest-to-user sync has visual feedback
- [ ] `npm run build` passes
