# WI-3.1 — Landing Page Audit

## Type
Auth & Entry Audit

## Module
`src/modules/landing/`

## Summary
Landing page is the first thing users see. Must work perfectly on all devices, especially mobile.

## Audit Areas

### Layout
- Background effects: contained, no overflow
- Hero section: text overflow for long strings (though content is controlled)
- Feature cards: grid overflow on mobile
- CTA buttons: sizing and spacing

### Feature Cards
- 3 cards (Agnes, Ledger, Titan) — verify layout:
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: single column
- Card content: description text truncation
- Card icons: consistent sizing

### Auth Modal
- `UnifiedAuthModal` — form overflow, keyboard handling on mobile
- Error messages: don't overflow modal
- Social login buttons: full-width on mobile
- Loading states: centered spinner

### Mobile Fixes
- Hero text: responsive sizing (already uses `clamp` or responsive classes?)
- Feature cards: single column, full-width
- CTA buttons: full-width on mobile
- Auth modal: full-screen or bottom-sheet on mobile
- Background effects: reduce intensity for performance

### Guest Mode
- "Try as Guest" flow: verify navigation works
- Guest mode banner: clear, non-intrusive

## Acceptance Criteria
- [ ] Landing page renders perfectly at all breakpoints
- [ ] Feature cards responsive grid
- [ ] Auth modal handles keyboard on mobile
- [ ] Guest mode flow works end-to-end
- [ ] `npm run build` passes
