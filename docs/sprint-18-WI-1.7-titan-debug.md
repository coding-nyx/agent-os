# WI-1.7 — Titan: Debug Overlay Integration

## Type
Module Integration / Debug

## Module
`src/modules/titan/`

## Events to Log

| Event | Category | When |
|-------|----------|------|
| Titan profile loaded | `profile` | Subscription callback |
| Titan profile saved | `profile` | Save call |
| Workout session started | `ai` | Session logger open |
| Workout session saved | `profile` | Session save |
| Quick log parsed | `ai` | `parseQuickLogInput` result |
| PR annotated | `profile` | `annotatePRs` execution |
| Recovery plan created | `profile` | Plan save |
| Recovery check-in submitted | `profile` | Check-in save |
| Cycle created/updated | `profile` | Cycle CRUD |
| Soma data loaded (cross-module) | `profile` | SomaProfile subscription |
| Sleep entry logged | `profile` | Sleep save |
| Clearance status changed | `spine` | Via spine event |

## Depends On
- WI-X.1

## Acceptance Criteria
- [ ] All Titan profile mutations visible in debug overlay
- [ ] Workout quick-log parse results visible
- [ ] Cross-module Soma data load visible
- [ ] Recovery lifecycle visible
