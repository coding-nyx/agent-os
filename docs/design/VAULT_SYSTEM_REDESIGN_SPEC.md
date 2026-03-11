# Vault System Redesign — UX/UI Design Specification
**Document:** `docs/design/VAULT_SYSTEM_REDESIGN_SPEC.md`  
**Status:** Design Proposal — Ready for Implementation  
**Design System:** Dark Glassmorphism · Framer Motion · Lucide React · 8pt Grid

---

## Table of Contents
1. [App-Level Vault Gate](#1-app-level-vault-gate)
2. [Profile Popover Vault Controls](#2-profile-popover-vault-controls)
3. [Locked Orchestrator State](#3-locked-orchestrator-state)
4. [Vault Onboarding Nudge](#4-vault-onboarding-nudge)
5. [Module-Level Lock Preferences (Security Panel Redesign)](#5-module-level-lock-preferences)
6. [In-Module Unlock Flow](#6-in-module-unlock-flow)
7. [New Component Inventory](#7-new-component-inventory)

---

## Design Principles for This Spec

**Zero-data-leak at all costs.** No content (not even counts or labels) renders outside the gate when vault is set up and locked. The only visible non-sensitive elements are branding, navigation structure (not content), and the unlock mechanism itself.

**Spatial memory over full-screen takeover.** Users should never feel disoriented. Prefer overlays and drawers over route changes so the URL doesn't jump and back navigation stays predictable.

**Vault = invisible when working.** When unlocked, the vault should feel like it doesn't exist. Every vault touchpoint only appears when relevant (locked state, initial setup, explicit lock action).

**One password input per session.** Never ask the user to re-enter their vault password in the same session unless they explicitly locked it. Auto-unlock via `SESSION_MODE` session password must be transparent.

---

## 1. App-Level Vault Gate

### Decision: Full-Screen Overlay Portal (Modified Option A)

**Why not Option B (blur + banner):** Blurring a glassmorphism layout that already uses `backdrop-blur-md` causes GPU layering conflicts and creates visually muddy "double blur" artifacts. More critically, blurred content still leaks structural information — module counts, card positions, chat history lengths.

**Why not Option C (`/vault` route):** Route-based gates break deep links, corrupt the browser back stack, and feel like a page load interruption in a SPA. The vault should feel like a *security membrane*, not a redirect.

**Chosen approach:** Mount a `<VaultGateOverlay>` component via React portal directly in the app root. The overlay sits at `z-[200]` above all content. The underlying app renders at `opacity-0 pointer-events-none` — present in the DOM, never visible to the user.

---

### Component: `VaultGateOverlay`

**File:** `src/core/components/VaultGateOverlay.tsx`

**Mount condition:** Render inside `App.tsx` (or root layout), wrapped in `AnimatePresence`. Show when:
```typescript
const showGate = hasVault && !isUnlocked && !isLoading && !!user && !isGuest;
```

**Visual structure (mobile-first, centered column):**

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│         ╔═══════════════╗           │
│         ║  [NEXUS logo] ║           │
│         ╠═══════════════╣           │
│         ║               ║           │
│         ║  🔒  (28px)   ║  ← animated pulse ring
│         ║               ║
│         ║  NEXUS VAULT  ║  ← text-xs tracking-[0.4em] text-white/40
│         ║               ║
│         ║  ─────────── ║
│         ║               ║
│         ║  [NeuralInput]║  ← password, type="password"
│         ║               ║  ← label: "MASTER KEY"
│         ║  [NeuralButton]  ← "INITIALIZE HANDSHAKE"
│         ║               ║
│         ║  ─────────── ║
│         ║               ║
│         ║  SESSION_MODE ║  ← persistence toggle (compact)
│         ╚═══════════════╝
│                                     │
│  [Skip / Use without vault] (ghost) │  ← text-[10px] text-white/25, only shows
│                                     │    if hasVault === false (initial setup skip)
└─────────────────────────────────────┘

Background: radial gradient from indigo-900/30 → black
Noise texture overlay at 3% opacity (matches app aesthetic)
```

**Key implementation details:**

```tsx
// Wrapper in App.tsx
<AnimatePresence>
  {showGate && (
    <motion.div
      key="vault-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, rgba(79,70,229,0.12) 0%, #020205 70%)'
      }}
    >
      <VaultGateOverlay />
    </motion.div>
  )}
</AnimatePresence>
```

**The lock icon animation:**
```tsx
// Pulse ring around lock icon — indigo, not pulsing aggressively
// Use a 2s ease-in-out infinite scale animation on a wrapper div
// Inner lock icon: Lock from lucide-react, w-7 h-7 text-white/50
// Badge container: w-16 h-16 rounded-2xl bg-white/5 border border-white/10
// Outer ring: w-20 h-20 rounded-3xl border border-indigo-500/20 animate-[ping_3s_ease-in-out_infinite]
```

**Error state:**
- On wrong password: The input border flashes `border-rose-500/60` for 300ms
- Shake animation on the GlassCard: `x: [0, -8, 8, -4, 4, 0]` over 300ms
- Error text appears below input: `text-[10px] text-rose-400/80 tracking-widest uppercase`
- Error copy: `"HANDSHAKE FAILED — INVALID KEY"` (max 1 attempt feedback, no counter shown)

**Success transition:**
```
1. NeuralButton shows loading spinner (isHandshaking = true)
2. On success: button goes to checkmark state (200ms)  
3. Gate overlay: exit animation (opacity 0, slight scale up, blur 8px) — 350ms
4. App content: fades in from opacity-0 (delayed 200ms to overlap with gate exit)
```

**Persistence toggle in gate:**
A compact two-option toggle row at the bottom of the card:
```
[🛡 STRICT]  [⏱ SESSION]   ← pill toggle, w-full, rounded-xl
current mode highlighted in indigo-500/20 with border-indigo-500/40
text-[9px] tracking-[0.15em]
```
This lets users set their persistence preference *before* unlocking — so they don't have to re-enter settings after.

---

### Accessibility

- Gate overlay has `role="dialog"` `aria-modal="true"` `aria-label="Vault unlock required"`
- Focus is auto-trapped inside the overlay on mount (`focus-trap-react` or manual `useEffect`)
- First focus goes to the password input
- `Escape` key does NOT close the gate (intentional — vault is a security gate, not a dismissible modal)

---

## 2. Profile Popover Vault Controls

### Current State Analysis

The existing `SystemCommandCenter` has two panes:
- **Main:** Neural Identity → System Prefs → Profile Surface → (Purge Local Key if unlocked) → Terminate Link
- **Settings:** Vault Persistence toggle (STRICT/SESSION) → Destroy Neural Soul

**Problems:**
1. "Purge Local Key" (lock vault) is buried after Profile Surface and uses confusing nomenclature
2. No "Unlock vault" CTA — if vault is locked, there's no way to unlock from here
3. No "Create vault" path for users without a vault
4. Persistence mode is in a sub-menu, but it's a frequently needed preference
5. Vault status is only shown via the dot indicator — no explicit state label

### Redesigned Popover Structure

The popover stays at its current width (`w-80` / `max-w-sm`). No height increase — we reorganize, not expand.

**New main pane layout:**

```
┌─────────────────────────────────────────────┐
│  ╔═══════════════════════════════════════╗   │
│  ║  [User icon]  raj@example.com        ║   │ ← Neural Identity block
│  ║               [VAULT STATUS PILL]    ║   │   pill: SECURED/LOCKED/UNENCRYPTED
│  ╚═══════════════════════════════════════╝   │
│                                             │
│  ─── VAULT ──────────────────── [border] ── │ ← section label: text-[9px] tracking-[0.3em]
│                                             │
│  [Vault action row — state-driven, see below]│
│                                             │
│  ─── NAVIGATION ─────────────────────────── │
│                                             │
│  [⚙]  System Prefs         →               │
│  [👤] Profile Surface       →               │
│                                             │
│  ─── SESSION ──────────────────────────── ─ │
│                                             │
│  [🚪] Terminate Link                        │
└─────────────────────────────────────────────┘
```

---

### Vault Status Pill

Replaces the `identityLabel` text in the identity block. Shows next to the email, right-aligned:

| Vault State | Pill Text | Pill Colors |
|---|---|---|
| `!hasVault` | `UNENCRYPTED` | `bg-amber-500/10 border border-amber-500/20 text-amber-400` |
| `hasVault && !isUnlocked` | `LOCKED` | `bg-red-500/10 border border-red-500/20 text-red-400` |
| `hasVault && isUnlocked` | `SECURED` | `bg-emerald-500/10 border border-emerald-500/20 text-emerald-400` |

```tsx
// Vault status pill — inline in identity block
<span className={cn(
  "text-[8px] font-black tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border",
  vaultPillClass  // from table above
)}>
  {vaultStatusLabel}
</span>
```

---

### Vault Action Row (State-Driven)

This single row in the "VAULT" section changes completely based on state. All three states fit in the same vertical space (~44px).

**State 1: No vault (`!hasVault`)**
```
┌──────────────────────────────────────────────┐
│  [Shield+]  Initialize Vault          →      │
│             Encrypt your data                │  ← text-[9px] text-white/40
└──────────────────────────────────────────────┘
```
- Background: `bg-indigo-500/8 border border-indigo-500/15`
- On click: opens `UnifiedAuthModal` at `VAULT_HANDSHAKE` step
- Icon: `ShieldPlus` from lucide-react, `text-indigo-400`

**State 2: Vault locked (`hasVault && !isUnlocked`)**
```
┌──────────────────────────────────────────────┐
│  [🔒]  Vault Locked              [UNLOCK →]  │
│        Tap to decrypt session                │
└──────────────────────────────────────────────┘
```
- Row background: `bg-amber-500/8 border border-amber-500/15`
- "UNLOCK" is a `NeuralButton` variant="ghost" size="sm" `text-amber-400`
- On "UNLOCK" click: closes popover + opens `VaultUnlockDrawer` (see §6) OR triggers `VaultGateOverlay` if at Orchestrator
- Icon: `Lock` from lucide-react, `text-amber-400`

**State 3: Vault unlocked (`hasVault && isUnlocked`)**
```
┌──────────────────────────────────────────────┐
│  [🔓]  Vault Active              [LOCK]      │
│        [🛡 STRICT] ←●→ [⏱ SESSION]          │  ← persistence toggle inline
└──────────────────────────────────────────────┘
```
- Row background: `bg-emerald-500/8 border border-emerald-500/15`
- "LOCK" button: ghost, `text-white/60 hover:text-amber-400` — triggers `lockVault()`
- Persistence toggle: compact pill toggle, `text-[8px]`, directly below the lock/unlock row
- This expands the vault row height to ~64px when unlocked — acceptable since it replaces needing a sub-menu

**Persistence toggle (inline, unlocked state):**
```tsx
// Two-option pill toggle
<div className="flex items-center gap-1 mt-2">
  <button
    onClick={() => setPersistenceMode('STRICT')}
    className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase transition-all",
      persistenceMode === 'STRICT'
        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
        : "text-white/30 hover:text-white/50"
    )}
  >
    <Shield className="w-2.5 h-2.5" /> STRICT
  </button>
  <button
    onClick={() => setPersistenceMode('SESSION')}
    className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[8px] font-black tracking-widest uppercase transition-all",
      persistenceMode === 'SESSION'
        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
        : "text-white/30 hover:text-white/50"
    )}
  >
    <Clock className="w-2.5 h-2.5" /> SESSION
  </button>
</div>
```

---

### System Prefs Sub-Menu Changes

With vault controls promoted to the main pane, the Settings sub-menu simplifies to:

```
← Back

─── DANGER ZONE ───────────────────────

[🗑] Destroy Neural Soul         →
     Permanently delete all data
```

Remove the persistence mode section from here (it lives in the main pane now). Keep only the destructive action. This makes the settings sub-menu *intentionally sparse* — opening it is a warning in itself.

---

### Avatar Vault Badge

The avatar dot indicator gains a third visual state:

| State | Dot Color | Meaning |
|---|---|---|
| Guest | `bg-amber-500` | Anonymous session |
| Locked / No vault | `bg-red-500` | Vault locked or not set up |
| Unlocked | `bg-emerald-500` | Vault active |

Additionally, if `!hasVault`, add a small `ShieldAlert` icon overlay on the avatar at 40% opacity as a persistent soft nudge (see §4).

---

## 3. Locked Orchestrator State

### Decision: Hybrid Locked State (NOT a VaultLockedShell clone)

Orchestrator is the home page. Showing a plain lock icon + unlock CTA (same as any module) wastes the opportunity to make the vault feel meaningful and fails to communicate *why* locking is worthwhile.

The locked Orchestrator should answer: "You have data here. It's protected. Here's how to get back to it."

### Visual Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [HEADER — same as normal Orchestrator]                     │
│  "NEXUS"  nav items visible but faded  [Profile popover]   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ╔═══════════════════════════════════════════════════════╗  │
│  ║          VAULT SEALED                               ║  │ ← centered card
│  ║                                                     ║  │   max-w-sm, mx-auto
│  ║   [Lock icon 32px with pulse ring]                  ║  │
│  ║                                                     ║  │
│  ║   Your intelligence network is encrypted            ║  │ ← text-sm text-white/60
│  ║   X modules · Last active [date]                   ║  │ ← non-sensitive metadata
│  ║                                                     ║  │
│  ║   [NeuralButton "UNLOCK VAULT" themeColor="cyan"]  ║  │
│  ╚═══════════════════════════════════════════════════════╝  │
│                                                             │
│  [MODULE GRID — visible but locked appearance]              │
│  Opacity: 25%  filter: grayscale(60%)  pointer-events:none  │
│  Module cards show module icon + name, NO content           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why show the module grid at low opacity:**
The ghost grid serves as a *content promise* — users can see their modules exist and they have data there, without any of the data being visible. It transforms the locked state from "wall" to "frosted glass door". This is psychologically compelling for re-engagement.

**Key difference from module VaultLockedShell:**
- Orchestrator uses a centered card + ghost grid (bespoke)
- Modules use `VaultLockedShell` (existing component, keep as-is)
- The header remains visible on Orchestrator; module layouts may hide content behind `VaultLockedShell`

---

### Implementation: `OrchestratorLockedState`

**File:** `src/modules/orchestrator/components/OrchestratorLockedState.tsx`

```tsx
// Props
interface OrchestratorLockedStateProps {
  moduleCount: number;
  lastActive: string | null;
  onUnlock: () => void;
}
```

**Ghost grid:**
```tsx
// Map over MODULE_MANIFEST entries that have a page
// Each ghost card:
<div
  key={id}
  className="aspect-square rounded-2xl bg-white/3 border border-white/5 flex flex-col items-center justify-center gap-2"
  aria-hidden="true"
>
  <ModuleIcon className="w-6 h-6 text-white/20" />
  <span className="text-[9px] text-white/15 uppercase tracking-widest font-bold">
    {module.title}
  </span>
</div>
```
Grid layout: `grid grid-cols-3 sm:grid-cols-4 gap-3 p-4 mt-6`

**Unlock CTA:**
Uses `NeuralButton` with `themeColor="cyan"` (Orchestrator's color), `size="lg"`, `variant="primary"`.  
On click: triggers `VaultUnlockDrawer` (§6) which slides up from bottom.

**The centered unlock card:**
```tsx
<GlassCard
  className="p-8 text-center max-w-sm mx-auto relative z-10"
  glow={false}
>
  {/* Animated lock icon with pulse ring */}
  <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-6">
    <div className="absolute inset-0 rounded-3xl border border-cyan-500/15 animate-ping" />
    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
      <Lock className="w-7 h-7 text-white/40" />
    </div>
  </div>
  
  <h2 className="text-xs font-black uppercase tracking-[0.4em] text-white/80 mb-2">
    VAULT SEALED
  </h2>
  <p className="text-xs text-white/40 leading-relaxed mb-6">
    Your intelligence network is encrypted.<br />
    {moduleCount} modules · {lastActiveLabel}
  </p>
  
  <NeuralButton
    themeColor="cyan"
    size="lg"
    onClick={onUnlock}
    className="w-full"
  >
    UNLOCK VAULT
  </NeuralButton>
</GlassCard>
```

---

## 4. Vault Onboarding Nudge

### Decision: Three-Touch Passive Nudge System

**No post-login modal.** This is the most disruptive pattern and kills new user momentum. Users who skipped vault setup did so intentionally — respect that decision, then remind gently.

**Touch 1: Avatar badge (persistent, lowest friction)**

When `!hasVault && !isGuest`, the profile avatar shows a `ShieldAlert` icon overlay on the bottom-right corner (replacing the status dot):

```tsx
// In SystemCommandCenter trigger button
{!hasVault && !isGuest && (
  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
    <ShieldAlert className="w-2 h-2 text-amber-400" />
  </div>
)}
```

This is the *always visible* nudge. When the user opens the popover, they see the "UNENCRYPTED" pill in the identity section and the "Initialize Vault" row — both reinforce the message without being intrusive.

---

**Touch 2: Orchestrator inline banner (one-time, dismissible)**

A soft banner appears at the top of the Orchestrator content area (below header, above module grid). Shown only once per user — dismissed by local storage flag `nexus_vault_nudge_dismissed`.

```
┌─────────────────────────────────────────────────────────────┐
│  [🔓 ShieldAlert icon]  Your data is unencrypted            │ ← amber-500/80
│  Add a master key to protect all modules         [SECURE →] │ ← amber-500 button
│                                                    [✕ dismiss]│
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
```tsx
<motion.div
  initial={{ opacity: 0, y: -8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  className="mx-4 mb-4 flex items-center gap-3 px-4 py-3 rounded-xl
             bg-amber-500/8 border border-amber-500/15"
>
  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
  <p className="text-xs text-amber-300/80 flex-1 leading-relaxed">
    Your data is unencrypted. Add a master vault key to secure all modules.
  </p>
  <button
    onClick={handleSecureNow}
    className="text-[9px] font-black text-amber-400 uppercase tracking-widest
               hover:text-amber-300 transition-colors shrink-0"
  >
    SECURE →
  </button>
  <button
    onClick={handleDismiss}
    aria-label="Dismiss vault nudge"
    className="text-white/20 hover:text-white/50 transition-colors"
  >
    <X className="w-3.5 h-3.5" />
  </button>
</motion.div>
```

**Dismiss behavior:** Sets `localStorage.setItem('nexus_vault_nudge_dismissed', 'true')`. Never shows again. No sneaky re-appearance after X days.

---

**Touch 3: Security Panel callout (contextual, always visible when no vault)**

In `SecurityPanel`, when `!hasVault`, the vault status card shows a more prominent initialize CTA instead of the current status display:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠  VAULT NOT INITIALIZED                               │ ← rose-400
│                                                         │
│  Your module data is stored without encryption.         │ ← text-xs text-white/50
│  Initialize a master vault to protect all data.         │
│                                                         │
│  [NeuralButton "INITIALIZE MASTER VAULT" indigo, full]  │
└─────────────────────────────────────────────────────────┘
```

This is the *highest-intent* nudge — users who navigated to Profile > Security already care about their data. Deliver accordingly.

---

## 5. Module-Level Lock Preferences

### Decision: Keep, but Reframe as "Access Controls"

With a global vault model, per-module locks become **access gating preferences**, not security mechanisms. The security is provided by the vault itself — these toggles control *which modules require the vault to be open*.

This is a meaningful distinction: a user may want Ledger (financial data) to always require vault, but Agnes (coaching) to be accessible when vault is locked (e.g., for quick notes).

### Redesigned SecurityPanel Section

**Rename:** `Module Security` → `MODULE ACCESS CONTROLS`

**New section header copy:**
```
MODULE ACCESS CONTROLS
When your vault is locked, these modules require you to unlock
before accessing their data. Mandatory modules cannot be changed.
```

**Per-module row (updated):**

```
┌────────────────────────────────────────────────────────────┐
│  [Module icon]  LEDGER                    [●] VAULT REQUIRED │ ← toggle ON
│                 Require vault to access                      │   emerald glow
│                 [MANDATORY — cannot change]                  │ ← if mandatory=true
├────────────────────────────────────────────────────────────┤
│  [Module icon]  AGNES                     [○] OPEN ACCESS   │ ← toggle OFF
│                 Accessible when vault is locked              │   no glow
└────────────────────────────────────────────────────────────┘
```

**Toggle label pattern (changes with state):**
- When ON: `"VAULT REQUIRED"` — module color glow ring on toggle
- When OFF: `"OPEN ACCESS"` — no glow, muted

**Mandatory indicator:**
```tsx
{mod.securityPolicy.mandatory && (
  <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.15em] mt-0.5 block">
    MANDATORY — CANNOT OVERRIDE
  </span>
)}
```

**Add a master toggle at the top of this section:**
```
┌────────────────────────────────────────────────────────────┐
│  [Lock icon]  LOCK ALL ON VAULT LOCK           [●○ toggle] │
│               Lock all modules when vault is locked         │
└────────────────────────────────────────────────────────────┘
```

When this master toggle is ON, it forces all per-module toggles to ON state (visually disabled, they all show active but with reduced opacity on the toggle itself). When OFF, per-module preferences apply individually.

```typescript
// New field in securityPreferences
interface SecurityPreferences {
  vaultLocks: Record<ModuleId, boolean>;
  lockAllOnVaultLock: boolean; // new
}
```

---

### Vault Status Card in SecurityPanel (Updated)

Remove the three-tile grid (`Key Derivation / Persistence mode / Module Access`). Replace with:

```
VAULT STATUS:  [SECURED ●]          ← emerald pill

Master encryption key is active.
Persistence: [SESSION_MODE pill]     ← clickable, opens inline toggle
Last unlocked: Today at 14:32

[Lock Vault]     [Export Data]
```

This is cleaner, actionable, and puts persistence mode one tap away without requiring navigation to the popover.

---

## 6. In-Module Unlock Flow

### Decision: Bottom Drawer (Mobile) / Inline Panel (Desktop)

**Why not a modal:** The current approach (full modal) works but has issues:
1. It's anonymous — the same unlock modal appears everywhere, disconnected from where you are
2. On mobile it can feel like full interruption, especially on small screens where it obscures the module's locked state

**Why not full-screen:** Full-screen unlock is reserved for the `VaultGateOverlay` (app-level, §1). Reusing full-screen for in-module unlock would dilute the meaning of the gate.

**Chosen approach:** A `VaultUnlockDrawer` — a bottom sheet on mobile that slides up 55% of screen height, leaving the `VaultLockedShell` still partially visible above it. On desktop (≥ md breakpoint), it becomes a centered dialog of limited width (`max-w-md`).

---

### Component: `VaultUnlockDrawer`

**File:** `src/core/components/VaultUnlockDrawer.tsx`

**Trigger:** Replaces the `UnifiedAuthModal` when the user is already logged in and just needs to unlock vault. The existing unlock modal in `ModuleLayout` should call this instead.

```tsx
interface VaultUnlockDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  moduleName?: string;       // "Agnes", "Ledger", etc. — for contextual copy
  moduleAccentColor?: string; // "text-indigo-400" etc.
  onUnlocked?: () => void;   // called after successful unlock
}
```

**Mobile layout (< md):**
```
┌─────────────────────────────────────────────────────────────┐
│  ░░░░░░ VaultLockedShell still visible above ░░░░░░░░░░░░░  │ ← 45% of screen
│  ░░░░░░ (not interactive while drawer open) ░░░░░░░░░░░░░░  │
├─────────────────────────────────────────────────────────────┤
│  ───    (drag handle)                                       │ ← white/20 bar
│                                                             │
│  [🔒]  UNLOCK AGNES VAULT         ← module-specific heading │
│                                                             │
│  [NeuralInput type="password" label="MASTER KEY"]           │
│                                                             │
│  [NeuralButton "INITIALIZE HANDSHAKE" themeColor=module]    │
│                                                             │
│  Persistence: [STRICT ←●→ SESSION] inline toggle           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Desktop layout (≥ md):** Standard centered dialog pattern, `max-w-md`, no drag handle. Uses existing `AnimatePresence` pattern.

**Framer Motion animation (mobile):**
```tsx
// Bottom drawer slide-up
<motion.div
  initial={{ y: '100%' }}
  animate={{ y: 0 }}
  exit={{ y: '100%' }}
  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
  className="fixed bottom-0 left-0 right-0 z-[100] md:relative md:bottom-auto"
>
```

**Context-sensitive heading:**
- With module name: `UNLOCK {MODULE_NAME} VAULT`
- Without (generic): `VAULT HANDSHAKE REQUIRED`
- Subtext: `"End-to-end encrypted. Enter your master key to decrypt {moduleName}."`

**After successful unlock:**
1. `onUnlocked()` callback fires
2. Drawer animates out (exit animation)
3. `VaultLockedShell` fades out, module content fades in — handled by the existing `ModuleLayout` lock state logic
4. A success toast: `"✓ Vault unlocked"` (1.5s, bottom-center, emerald, small)

**Drag-to-dismiss (mobile):** When user drags drawer down past 30% of its height, spring-dismiss. Use `useDrag` from `@use-gesture/react` or Framer's `drag` prop with `dragConstraints`.

---

### ModuleLayout Changes

**Current behavior:** `isLocked` shows a full locked overlay + modal trigger.

**New behavior:**
```tsx
// In ModuleLayout, replace unlock modal trigger with:
import { VaultUnlockDrawer } from '@/core/components/VaultUnlockDrawer';

// State
const [showUnlockDrawer, setShowUnlockDrawer] = useState(false);

// In VaultLockedShell onUnlock prop:
<VaultLockedShell
  onUnlock={() => setShowUnlockDrawer(true)}
  // ... existing props
/>

// Drawer (renders outside main content, not modal-on-modal)
<VaultUnlockDrawer
  isOpen={showUnlockDrawer}
  onClose={() => setShowUnlockDrawer(false)}
  moduleName={title}
  moduleAccentColor={`text-${themeColor}-400`}
  onUnlocked={() => setShowUnlockDrawer(false)}
/>
```

No modal-on-modal issue since `VaultUnlockDrawer` renders at a separate DOM layer via portal.

---

## 7. New Component Inventory

Summary of new/modified components required for this redesign:

| Component | File | Type | Priority |
|---|---|---|---|
| `VaultGateOverlay` | `src/core/components/VaultGateOverlay.tsx` | New | P0 |
| `VaultUnlockDrawer` | `src/core/components/VaultUnlockDrawer.tsx` | New | P0 |
| `OrchestratorLockedState` | `src/modules/orchestrator/components/OrchestratorLockedState.tsx` | New | P1 |
| `VaultNudgeBanner` | `src/core/components/VaultNudgeBanner.tsx` | New | P2 |
| `SystemCommandCenter` | `src/core/components/SystemCommandCenter.tsx` | Modified | P0 |
| `SecurityPanel` | `src/modules/profile/components/SecurityPanel.tsx` | Modified | P1 |
| `ModuleLayout` | `src/core/layout/ModuleLayout.tsx` | Modified | P0 |
| `VaultLockedShell` | `src/core/components/VaultLockedShell.tsx` | No change | — |

---

## State Machine Summary

```
[User logs in]
      │
      ▼
  hasVault?
  ├── NO  → App renders normally → VaultNudgeBanner in Orchestrator
  │         Profile popover shows "Initialize Vault" in vault row
  │         Avatar shows ShieldAlert badge
  │
  └── YES → isUnlocked?
            ├── YES (SESSION_MODE auto-unlock) → App renders normally
            │
            └── NO → VaultGateOverlay mounts (z-200)
                      User enters password
                      ├── Wrong → shake animation, error text, stay on gate
                      └── Correct → gate exit animation → app fades in
                                    VaultNudgeBanner never shows (has vault)
```

```
[User navigates to locked module]
      │
      ▼
  ModuleLayout detects isLocked
      │
      ▼
  VaultLockedShell renders (existing, no change)
      │
      ▼
  User taps "Unlock vault to continue"
      │
      ▼
  VaultUnlockDrawer slides up (NEW)
  ├── Wrong password → shake, error, stays open
  └── Correct → drawer exits → module content fades in
```

---

## Breakpoint Behavior Summary

| Component | Mobile (< md) | Desktop (≥ md) |
|---|---|---|
| `VaultGateOverlay` | Full screen, centered card | Full screen, centered card |
| `VaultUnlockDrawer` | Bottom sheet, 55% height | Centered dialog `max-w-md` |
| `OrchestratorLockedState` | Centered card + 3-col ghost grid | Centered card + 4-col ghost grid |
| `SystemCommandCenter` popover | `w-[calc(100vw-32px)]` (existing) | `w-80` (existing) |
| `VaultNudgeBanner` | Full width, stacked layout | Full width, horizontal layout |

---

## What Remains Unchanged

- `VaultLockedShell` — no changes needed, already solid
- `UnifiedAuthModal` — still used for initial vault creation at VAULT_HANDSHAKE step
- `VaultContext` / `vault-context.tsx` — no API changes needed for this design
- `SecurityPanel` vault actions section (Lock, Export) — keep as-is, just reframe the section header

---

*End of specification. Implementation order: VaultGateOverlay → SystemCommandCenter vault row → VaultUnlockDrawer → ModuleLayout integration → OrchestratorLockedState → SecurityPanel redesign → VaultNudgeBanner.*
