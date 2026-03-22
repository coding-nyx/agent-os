# Profile — User Identity & System Settings

> **ID**: `profile` | **Theme**: violet | **Core**: No | **Soul Priority**: — | **Security**: open

## Purpose
Profile manages the user's core identity, security settings, system configuration, and data portability. It is the settings layer for the platform — not an agent-driven module, but the control surface for identity, security, debugging, and data management.

## File Structure
```
src/modules/profile/
├── ProfilePage.tsx                  # Main page with 4-tab navigation
├── index.ts                         # Exports
└── components/
    ├── IdentityPanel.tsx            # Avatar, display name, account details
    ├── SecurityPanel.tsx            # Vault status, data export, termination
    ├── SystemPanel.tsx              # Module health, debug mode, model selection
    ├── DataBackupPanel.tsx          # Export/import with merge logic
    ├── ModelSelector.tsx            # LLM model selection (text)
    └── VisionModelSelector.tsx      # Vision model selection (images)
```

## Tab Navigation

The Profile page uses `NeuralTabGroup` with 4 tabs:

| Tab ID | Label | Icon | Component |
|--------|-------|------|-----------|
| `identity` | Identity | `User` | `IdentityPanel` |
| `security` | Security | `Shield` | `SecurityPanel` |
| `system` | System | `Settings` | `SystemPanel` |
| `data` | Data & Backup | `DatabaseZap` | `DataBackupPanel` |

---

## 1. Identity Panel

**Purpose**: Display and edit user identity information.

### Features
- **Avatar display**: Initials-based avatar with gradient background
- **Display name editing**: Inline edit with save/cancel (authenticated users only)
- **Account type badge**: Shows `Guest` (amber) or `Authenticated` (violet)
- **Onboarding status badge**: Shows `Onboarded` (emerald) when complete
- **Account details card**:
  - Email (read-only)
  - Member since date (from `profile.createdAt`)

### Data Flow
- Reads: `useAuth()` → `user`, `isGuest`, `profile`
- Writes: `CoreProfileService.updateProfile()` → `preferredName`

---

## 2. Security Panel

**Purpose**: Vault management, encryption settings, and danger zone actions.

### Vault Status Card
Displays current vault state with visual indicators:

| State | Badge Color | Icon |
|-------|-------------|------|
| Unlocked | emerald | `Unlock` |
| Locked | amber | `Lock` |
| Not Initialized | rose | `Lock` |

**Encryption details**: Shows `PBKDF2 + AES-GCM` and current persistence mode.

### Session Retention
Configurable TTL for vault session (stored in `securityPreferences.vaultSessionTtlMinutes`):
- Until tab is closed (0)
- 15 minutes
- 1 hour
- 4 hours
- 12 hours
- 24 hours

**Note**: Disabled when persistence mode is `STRICT`.

### Vault Actions (Collapsible)
- **Lock Vault**: Revoke session access immediately
- **Export All Data**: Full decrypted archive (if unlocked) or metadata-only (if locked)
- **Reset Vault**: Coming soon (destructive, wipes encrypted data)

### Danger Zone
- **Terminate Neural Soul**: Permanently delete all user data
  - Requires confirmation dialog
  - Calls `SoulTerminationService.terminateSoul()`
  - Triggers logout after completion
  - Disabled for guest users

---

## 3. System Panel

**Purpose**: Module health monitoring, debug tools, and model selection.

### Module Health Grid
Displays health status for 6 core modules in a responsive grid:
- `agnes`, `titan`, `atlas`, `ledger`, `scout`, `forge`

Each module shows:
- Module icon and title (from `MODULE_MANIFEST`)
- Status: `Unlocked` (emerald) or `Locked` (amber) based on vault accessibility

### System Info
- **App Version**: From `VITE_APP_VERSION` env var
- **Platform**: `AGNES_OS`
- **Encryption**: `E2EE Active`

### Debug Mode
Master toggle with 6 granular sub-flags (visible when debug mode is ON):

| Flag Key | Label | Description |
|----------|-------|-------------|
| `thinking` | AI Thinking | Show reasoning steps in chat |
| `actionTags` | Action Tags | Show extracted action tags per reply |
| `actionAsked` | Actions Asked | Show what actions the model requested |
| `dataUpdates` | Data Updates | Show soul/profile write events |
| `actionUpdates` | Action Dispatch | Show confirmed action executions |
| `spineEvents` | Spine Events | Show Spine bus events per message |

**Test Notification**: Debug button to send a test alert to inbox (via Spine event).

### Model Selection (Debug Mode Only)
Appears only when debug mode is enabled.

#### Text Model Selector (`ModelSelector`)
**Providers**:
- `openrouter` — Fetches models from OpenRouter API
- `google` — Fetches models from Google Generative Language API
- `grok` — Fetches models from xAI API

**Storage keys**:
- `nexus_debug_provider` — Selected provider
- `preferred_model` — Selected model ID

**Default models**:
- Google: `google/gemini-2.0-flash:free`
- Grok: `x-ai/grok-2`

**Features**:
- Searchable dropdown (capped at 80 results)
- Context length display
- Refresh button to re-fetch model list
- Emits `nexus_model_changed` custom event on selection

#### Vision Model Selector (`VisionModelSelector`)
**Purpose**: Select vision-capable models for image analysis tasks.

**Provider**: OpenRouter only (shows notice for other providers).

**Storage key**: `preferred_vision_model`

**Default**: `openai/gpt-4o-mini`

**Vision detection**: Filters models by:
- Modality fields containing `image`, `vision`, or `multimodal`
- Model ID/name containing `vision`, `multimodal`, `gpt-4o`, `gpt-4.1`, or `gemini`

### Session Actions
- **Sign Out**: Calls `logout()` from auth context

---

## 4. Data & Backup Panel

**Purpose**: Data portability via export/import functionality.

### Export All Data
- Exports all module profiles, Global Soul, and vault-encrypted fields
- Encrypted fields remain encrypted in export (no vault key passed)
- Downloads as `nexus-export-{date}.json`
- Calls `exportAllData()` → `downloadNexusExport()`

### Restore from Backup
- Accepts `nexus-export-*.json` files
- **Merge logic**: Only overwrites if backup is newer than live data
- Reports: items restored, skipped (newer data exists), failed
- Calls `importData()` from `data-import-service`

### Feedback States
Both export and import show inline feedback:
- `idle` — No message
- `loading` — Loading indicator on button
- `success` — Green banner with details
- `error` — Red banner with error message

---

## NSV Ownership
- **Writes**: `preferredName`, `securityPreferences.vaultSessionTtlMinutes`
- **Reads**: Identity, profile, vault state, module accessibility

## Cross-Module Links
- Provides identity data consumed by all modules
- Controls vault lock/unlock affecting all encrypted modules
- Model selection affects AI behavior platform-wide
- Debug flags affect UI overlays across all chat interfaces

## Data Shape
```typescript
// Core identity (via CoreProfileService)
preferredName: string;
createdAt: Timestamp;
onboardingComplete: boolean;

// Security preferences
securityPreferences: {
  vaultSessionTtlMinutes: number; // 0 | 15 | 60 | 240 | 720 | 1440
};

// Debug settings (localStorage)
nexus_debug_mode: boolean;
nexus_debug_flags: DebugFlags;
nexus_debug_provider: 'openrouter' | 'google' | 'grok';
preferred_model: string;
preferred_vision_model: string;
```

## Implementation Notes
- Settings module — no agent personality, no conversational onboarding
- Controls data sovereignty: export, import, vault management, soul termination
- Debug mode and model selection only visible when debug toggle is ON
- All panels use consistent `GlassCard` styling with `panelVariants` animations
- Session retention requires `SESSION` persistence mode (not `STRICT`)
