# Bridge — Alert Daemon

> **ID**: `bridge` | **Theme**: Slate | **Core**: No | **Soul Priority**: — | **Security**: open

## Purpose
Bridge is a headless module (no UI page). It monitors Spine events in the background and triggers alerts/notifications based on configurable rules. It is the platform's background watchdog.

## Spine Events
- **Emits**: Alert/notification events
- **Listens**: All Spine events (background monitoring via configurable rule engine)

## Cross-Module Links
- Monitors all module Spine events for alert-worthy conditions
- Triggers user notifications based on cascade outputs (e.g., BURNOUT_WARNING → push notification)

## Data Shape
Configurable alert rules mapping Spine event patterns to notification actions. No persistent user data beyond alert configuration and delivery history.

## Implementation Notes
- Headless — no page, no agent personality, no onboarding
- No soul impact; purely a notification/alert relay
