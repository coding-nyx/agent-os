---
name: notifications
description: System-wide notification management and alert bridge.
---

# Notifications Module

Notifications serves as the alert bridge, managing the delivery of insights, reminders, and system alerts across the Ara platform.

## Domain
Focuses on notification delivery, priority management, and cross-device synchronization.

## Key Components
- **Notification Engine**: Logic for processing Spine events into user-facing alerts.
- **Reminder Evaluator**: Analysis of Atlas/Titan/Agnes data to generate timely prompts.
- **Alert Dispatcher**: Integration with FCM (Firebase Cloud Messaging) and local notifications.

## Data Structures (NSV)
- **Notification History**: Audit trail of delivered and dismissed alerts.
- **Alert Preferences**: User-defined priority and delivery schedules.

## AI Action Tags
- `dispatch_notification(title: string, body: string, priority: "low" | "medium" | "high")`: Sends a manual alert.
- `update_alert_schedule(rule_id: string, definition: object)`: Modifies automated reminder patterns.
- `clear_notifications(scope: string)`: Dismisses alerts based on criteria.
