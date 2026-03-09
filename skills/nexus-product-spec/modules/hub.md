# Hub — Central Dashboard

> **ID**: `hub` | **Theme**: — | **Core**: No | **Soul Priority**: — | **Security**: open

## Purpose
Hub is the user's command center — a single view showing the health and status of all active modules, recent activity across the platform, and quick access to any module. It aggregates NSV data for a holistic overview.

## NSV Ownership
- **Writes**: (none)
- **Reads**: Read-only access for aggregation and display

## Cross-Module Links
- Aggregates status and health from all active modules
- Provides quick-launch navigation to any module
- Displays NSV-derived holistic wellness overview

## Data Shape
No owned data — renders aggregated views from Global Soul (NSV snapshot, overall wellness score), module activity feeds, and module health indicators.

## Implementation Notes
- Display-only module — no agent personality, no actions, no onboarding
