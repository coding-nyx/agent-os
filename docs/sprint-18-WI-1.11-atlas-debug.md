# WI-1.11 — Atlas: Debug Overlay Integration

## Type
Module Integration / Debug

## Module
`src/modules/atlas/`

## Events to Log

| Event | Category | When |
|-------|----------|------|
| Atlas profile loaded | `profile` | Subscription callback |
| Atlas profile saved | `profile` | Save call |
| Task created/updated/deleted | `profile` | Task CRUD operations |
| Habit check-in | `profile` | Habit tracking update |
| Goal progress update | `profile` | Goal milestone change |
| Energy log created | `profile` | Manual energy entry |
| Morning check-in submitted | `profile` | Morning flow complete |
| Evening check-in submitted | `profile` | Evening flow complete |
| Weekly review completed | `profile` | Review submission |
| Journal entry saved | `profile` | Journal service save |
| View mode changed | `ai` | View switcher interaction |
| Quick-add task | `profile` | Quick capture submission |
| Recovery window created | `profile` | From spine event or AI action |

## Depends On
- WI-X.1

## Acceptance Criteria
- [ ] All Atlas CRUD operations visible in debug overlay
- [ ] Check-in lifecycle visible
- [ ] View mode changes logged
