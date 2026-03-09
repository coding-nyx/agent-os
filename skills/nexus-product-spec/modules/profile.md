# Profile — User Identity & Preferences

> **ID**: `profile` | **Theme**: — | **Core**: No | **Soul Priority**: — | **Security**: open

## Purpose
Profile manages the user's core identity and global preferences. It is the settings layer for the platform — not an agent-driven module, but the control surface for identity, security, and personalization.

## NSV Ownership
- **Writes**: (none directly — identity changes propagate through Spine)
- **Reads**: Identity management access

## Cross-Module Links
- Provides identity data (name, pronouns, gender) consumed by all modules
- Controls agent personality provisions (custom agent names, genders, tones) used platform-wide
- Manages vault lock settings that govern per-module encryption policies

## Data Shape
Core identity fields (`preferredName`, `pronouns`, `genderIdentity`, `age`, `assignedSexAtBirth`, `occupation`, `typicalSleepHours`), agent personality provisions (`moduleAliases`, `agentGenders`, `personaOverlays`), security preferences (vault locks per module), data export/management controls. Includes soul termination capability via `soul-termination-service.ts`.

## Implementation Notes
- Settings module — no agent personality, no conversational onboarding
- Controls data sovereignty: export, vault management, soul termination
