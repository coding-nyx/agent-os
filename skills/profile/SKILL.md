---
name: profile
description: User identity management and global platform settings.
---

# Profile Module

The Profile module manages the user's digital identity, global configurations, and the visualization settings for the Neural State Vector (NSV).

## Domain
Focuses on user authentication metadata, global preferences, and security settings.

## Data Structures (NSV)
- **User Identity**: Core user profile (name, avatar, locale, credentials).
- **Global Settings**: Dark/Light mode, haptic feedback, LLM model selection.
- **NSV Display Config**: Rules for which metrics are prioritized in the Hub and Dashboard.

## AI Action Tags
- `update_profile_settings(settings: object)`: Modifies user-specific global preferences.
- `update_identity_meta(data: object)`: Persists non-encrypted user metadata.
- `configure_nsv_visibility(config: object)`: Adjusts which data points are prominent in the UI.
- `sync_across_devices()`: Ensures consistency of profile data across the user's logged-in instances.
