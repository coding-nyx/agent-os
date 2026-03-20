# WI-2.3 — Notifications: Full Audit

## Type
Platform Page Audit

## Module
`src/modules/notifications/`

## Summary
Single-file page (`NotificationsPage.tsx`) displaying notification inbox with per-module settings panels. Must handle potentially long notification lists.

## Audit Areas

### Notification List
- Scroll performance with 100+ notifications
- Individual notification cards: long text overflow (title, note, deep link)
- Time-ago display: ensure it doesn't wrap awkwardly
- Priority badges: consistent sizing
- Read/unread state: clear visual distinction
- Empty inbox: meaningful empty state

### Notification Card Layout
- Type icon + source badge: left-aligned, fixed width
- Content: title (truncated 1 line), note (truncated 2 lines), timestamp
- Actions: mark-read, delete — accessible via button or swipe
- Deep link: tap card to navigate

### Settings Panels
- Per-module notification settings: Agnes, Titan, Ledger, Soma, Atlas
- Each is imported as a separate component — verify they all scroll within their modal
- Settings toggle layout: consistent across all 5 panels
- Schedule configuration: recurrence picker overflow

### Mobile Fixes
- Full-width notification cards
- Swipe-to-dismiss for mark-read/delete
- Settings panels: bottom sheet on mobile
- Filter bar: horizontally scrollable chips (all, unread, critical, etc.)
- Bulk actions: select mode with bottom action bar

## Placeholder Audit
- Verify notification generation is real (from spine events, reminders)
- No hardcoded demo notifications

## Acceptance Criteria
- [ ] List handles 100+ notifications without jank
- [ ] All text truncated appropriately
- [ ] Settings panels scroll in their containers
- [ ] Mobile: swipe actions, bottom sheets
- [ ] Empty state when no notifications
- [ ] `npm run build` passes
