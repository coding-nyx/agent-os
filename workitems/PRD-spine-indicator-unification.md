---
title: "Spine Indicator Unification"
version: "1.0"
status: Draft
author: Product Manager Agent
date: 2026-03-19
target_agents: [Design Agent, Developer Agent]
related_files:
  - src/core/components/SpineOverlay.tsx
  - src/core/components/SpineSideRail.tsx
  - src/core/components/ChatInterface.tsx
  - src/lib/stores/ui-store.ts
---

# PRD: Spine Indicator Unification

## 🎯 1. Problem Statement

The Agnes/Nexus app uses three separate visual constructs that share the word "spine" but behave inconsistently: `SpineOverlay` (an animated vertical line with pulse dots representing live AI module events) is entirely hidden below 1024 px, leaving mobile and tablet users with no real-time feedback from the Spine event bus; `SpineSideRail` (event detail cards) only appears above 1280 px, creating a 256 px no-man's-land where the line is visible but cards are not; the orange-theme chat bubble border-spine is a purely decorative construct with no connection to actual Spine events, yet it borrows the same visual language, confusing the mental model; and no user preference mechanism exists to show, hide, or resize any of these indicators. Collectively, these gaps mean the majority of users — on mobile, tablet, or smaller desktops — receive no signal that the AI system is actively working, eroding trust and transparency in a product whose core value proposition is real-time AI responsiveness.

---

## ✅ 2. Goals & Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | Ensure every breakpoint delivers *some* form of Spine event feedback to the user |
| G2 | Eliminate the offset-calculation fragility by replacing `clamp`-based positioning with layout-anchored placement |
| G3 | Resolve the orange-theme naming/visual collision with a single clear decision |
| G4 | Introduce a lightweight user preference toggle (in-memory via Zustand UIStore for MVP) |
| G5 | Close the 1024–1279 px gap between SpineOverlay line visibility and SpineSideRail card visibility |

### Non-Goals

- Redesigning the Spine event bus architecture or its domain/color taxonomy
- Introducing server-side persistence for user preferences (deferred to a future User Preferences epic)
- Adding new Spine event domains or changing existing color mappings
- Rewriting `SpineOverlay` or `SpineSideRail` as entirely new components (incremental evolution only)
- Modifying the `/hub` route suppression of SpineOverlay (behavior is intentional)
- Building an analytics dashboard or log viewer on top of Spine events

---

## 👤 3. User Stories

### Story 1 — Mobile User (< 640 px)

**As a** mobile user interacting with Agnes on my phone,  
**I want** to see a subtle indicator when an AI module fires a Spine event,  
**So that** I know the system is actively processing even when the full overlay is too wide to display.

#### Acceptance Criteria
- **Given** I am on a viewport < 640 px wide  
  **When** a Spine event fires for any domain  
  **Then** a compact status indicator (e.g., a small pulsing dot or bottom-bar badge) becomes briefly visible without obscuring chat input
- **Given** the spine toggle is OFF  
  **When** I am on any screen  
  **Then** no Spine indicator of any kind renders at any breakpoint
- **Given** I am on a viewport < 640 px wide  
  **When** no Spine event has fired in the last 5 seconds  
  **Then** the compact indicator returns to its idle/dim state

---

### Story 2 — Tablet User (640–1023 px)

**As a** tablet user in portrait or landscape mode,  
**I want** a minimal Spine indicator that does not overlap the chat panel,  
**So that** I get event feedback without layout disruption.

#### Acceptance Criteria
- **Given** I am on a viewport between 640 px and 1023 px  
  **When** a Spine event fires  
  **Then** a slim vertical line (reduced opacity, no tick dots) is visible at a fixed safe-area position that does not overlap the chat input field
- **Given** I am on a viewport between 640 px and 1023 px  
  **When** the layout switches between `full` and `overlay` modes  
  **Then** the spine indicator repositions correctly and does not clip or overlap UI panels

---

### Story 3 — Desktop User (1024–1279 px)

**As a** desktop user on a standard 1080 p monitor,  
**I want** the SpineOverlay line AND at least a minimal event summary to both be visible simultaneously,  
**So that** I don't see the line without understanding what it represents.

#### Acceptance Criteria
- **Given** I am on a viewport between 1024 px and 1279 px  
  **When** any Spine event fires  
  **Then** both the animated pulse dot on the line AND a condensed event indicator (e.g., 2-card mini-rail or tooltip) are visible
- **Given** I am on a viewport between 1024 px and 1279 px  
  **When** I am in `split` layout  
  **Then** the SpineOverlay right-offset is anchored to the right edge of the chat panel (not a clamp formula), with a fixed 24 px gap

---

### Story 4 — Wide Desktop User (≥ 1280 px)

**As a** wide-desktop user,  
**I want** the full SpineOverlay line with tick dots and the SpineSideRail event cards to render as they do today,  
**So that** my existing experience is not regressed.

#### Acceptance Criteria
- **Given** I am on a viewport ≥ 1280 px  
  **When** the page loads  
  **Then** both SpineOverlay (line + pulse dots) and SpineSideRail (last 4 event cards) are visible by default
- **Given** I am on a viewport ≥ 1280 px  
  **When** I toggle the spine indicator OFF  
  **Then** both SpineOverlay and SpineSideRail are hidden until toggled ON again

---

### Story 5 — Power User (Any Breakpoint)

**As a** power user who finds the spine overlay distracting during focused sessions,  
**I want** a persistent-within-session toggle to hide all Spine indicators,  
**So that** I can work distraction-free without the UI interfering.

#### Acceptance Criteria
- **Given** I open the settings or command panel  
  **When** I toggle "Hide Spine Indicator"  
  **Then** all Spine visual components (SpineOverlay, SpineSideRail, mobile compact dot) are immediately hidden
- **Given** I have toggled the spine OFF during a session  
  **When** I refresh the page  
  **Then** the preference resets to ON (default) — MVP does not persist across sessions
- **Given** the toggle is accessible  
  **When** I am on any breakpoint  
  **Then** the toggle control is reachable within 2 taps/clicks from any screen

---

### Story 6 — Developer / Agent Debugger (Any Breakpoint)

**As a** developer or agent author monitoring Spine event flow,  
**I want** Spine events to be clearly labeled with domain, type, and source in the SideRail,  
**So that** I can confirm my module is emitting events correctly without opening DevTools.

#### Acceptance Criteria
- **Given** I am on a viewport ≥ 1024 px with the spine enabled  
  **When** my module fires a Spine event  
  **Then** the event card in SpineSideRail shows domain badge, event type, and source within 300 ms of emission
- **Given** I am on a viewport < 1024 px  
  **When** my module fires a Spine event  
  **Then** the compact indicator correctly reflects the domain color of the emitted event

---

## 📐 4. Acceptance Criteria Per Breakpoint

| Breakpoint | Label | SpineOverlay Line | Pulse Dots | SpineSideRail Cards | Compact Indicator | Toggle Accessible |
|---|---|---|---|---|---|---|
| < 640 px | **xs** | Hidden | Hidden | Hidden | ✅ Visible (compact dot/badge) | ✅ Via settings |
| 640–1023 px | **sm–md** | ✅ Slim line, reduced opacity, no ticks | ✅ (max 3, smaller) | Hidden | ✅ Fallback if line not visible | ✅ Via settings |
| 1024–1279 px | **lg** | ✅ Full line with tick dots | ✅ All 5 domains | ✅ Mini-rail, 2 cards | N/A (line visible) | ✅ Via settings or FAB |
| ≥ 1280 px | **xl+** | ✅ Full line with tick dots | ✅ All 5 domains | ✅ Full rail, 4 cards | N/A (full rail visible) | ✅ Via settings or FAB |

**Positioning rules (all breakpoints):**
- In `split` layout: SpineOverlay anchors to the right edge of the chat panel container (CSS `right` relative to panel, not viewport clamp)
- In `full` / `overlay` layout: SpineOverlay stays at `right: 2.5rem` as today
- Compact indicator (xs): fixed to bottom-right, above the chat input safe area, z-index ≤ 60 (below SpineOverlay z-70)
- `/hub` route: all Spine indicators suppressed regardless of toggle state

---

## 🎨 5. Orange Theme Chat Bubble Spine — Decision

### Options Considered

| Option | Summary | Effort |
|---|---|---|
| A | Remove border-spine from orange theme entirely | Low |
| B | Extend border-spine to ALL themes for consistency | High |
| C | Rename/retheme as a decorative "thread line," no Spine event association | Low |

### ✅ Recommendation: **Option A — Remove**

Remove `border-l-2 border-orange-500/30 rounded-none` / `border-r-2 border-white/20 rounded-none` from the orange theme's chat bubble rendering in `ChatInterface.tsx` and restore `rounded-2xl` consistent with all other themes.

**Rationale:** The border-spine is a vestigial decorative artefact that actively contradicts the Spine event bus mental model with zero functional benefit; Option C (renaming) still leaves a confusingly similar visual in the UI, and Option B bloats scope without solving the core consistency problem.

---

## 🗺️ 6. Recommended Behavior Per Breakpoint

### xs (< 640 px)
- **SpineOverlay line:** Not rendered
- **SpineOverlay pulse dots:** Not rendered
- **SpineSideRail cards:** Not rendered
- **Compact indicator:** A single 8 px pulsing dot, fixed bottom-right, above the safe area inset. Color reflects the most-recent Spine event domain. Fades to 20% opacity after 3 s of inactivity.
- **User preference toggle:** Accessible via the settings drawer (already assumed to exist); hides the compact dot when OFF

### sm–md (640–1023 px)
- **SpineOverlay line:** Rendered at 1 px width, 50 vh height, opacity 60% of desktop value, no tick dots. Positioned at a safe fixed offset that is tested against both `full` and `split` layout panel edges.
- **SpineOverlay pulse dots:** Up to 3 simultaneous dots (reduced from 5) at 60% size
- **SpineSideRail cards:** Not rendered; the line serves as the sole indicator
- **Compact indicator:** Shown only when the SpineOverlay line is not visible (i.e., toggled off or obstructed); serves as fallback
- **User preference toggle:** Accessible via settings drawer; hides both line and compact dot

### lg (1024–1279 px)
- **SpineOverlay line:** Full height (70 vh), full opacity, 6 tick dots — identical to today
- **SpineOverlay pulse dots:** All 5 domain dots rendered
- **SpineSideRail cards:** A condensed 2-card mini-rail renders at `xl:hidden lg:flex` (new class addition) — same card design at `w-40` instead of `w-48`
- **User preference toggle:** Accessible via settings or a persistent FAB (≤ 2 interactions to reach)

### xl+ (≥ 1280 px)
- **SpineOverlay line:** Full — no change from current behavior
- **SpineOverlay pulse dots:** Full — no change from current behavior
- **SpineSideRail cards:** Full 4-card rail — no change from current behavior
- **User preference toggle:** Accessible via settings or FAB

---

## ⚙️ 7. Preference / Toggle Requirement

### What the Toggle Controls
A single boolean `spineVisible: boolean` added to the existing Zustand `ui-store.ts`. When `false`:
- `SpineOverlay` does not render (conditional at component root)
- `SpineSideRail` does not render (conditional at component root)
- The xs compact indicator does not render

### Where It Lives
- **Primary:** Inside the existing settings/preferences panel (or wherever `ui-store` activeLayout controls are surfaced today)
- **Secondary (optional, lg+):** A persistent FAB or icon button near the SpineOverlay itself (e.g., a small eye-slash icon that appears on hover of the line)

### Persistence
- **MVP:** In-memory Zustand state only — resets to `true` (visible) on page refresh
- **Post-MVP:** Migrate to a `userPreferences` store with `localStorage` hydration (out of scope for this PRD)

### Default State
- `spineVisible: true` — Spine indicators are ON by default for all users

### Toggle Action Contract
```
Action:  user clicks "Hide Spine" toggle
Payload: { spineVisible: false }
Store:   ui-store.ts → setSpineVisible(false)
Effect:  SpineOverlay, SpineSideRail, CompactSpineDot unmount immediately (AnimatePresence exit animation plays)

Action:  user clicks "Show Spine" toggle
Payload: { spineVisible: true }
Store:   ui-store.ts → setSpineVisible(true)
Effect:  Components remount; AnimatePresence entrance animation plays
```

---

## 🏆 8. Priority Ranking

| Priority | Sub-Problem | Rationale |
|---|---|---|
| **P0** | Mobile blind spot | The majority of web traffic is mobile; zero Spine feedback is a complete feature gap, not a polish issue |
| **P1** | Offset calculation fragility | Active layout breakage at certain viewport widths directly corrupts the UI and is reproducible — affects real users today |
| **P1** | SpineSideRail gap (1024–1279 px) | The line appears without any context cards, confusing desktop users who see activity with no explanation |
| **P2** | Orange theme inconsistency | Causes mental-model confusion but no functional breakage; addressable with a small code deletion |
| **P2** | Preference toggle | Quality-of-life for power users; does not affect new users; low risk to defer one sprint |
| **P3** | Compact indicator design polish | The xs/sm compact dot needs a finalized design spec before implementation; UX detail, not a blocker |

---

## 🚫 9. Out of Scope

1. **Spine event bus refactoring** — Domain taxonomy, event schema, color assignments, and the bus itself are frozen for this PRD
2. **Server-side / cross-session preference persistence** — `localStorage` hydration and user-account-level preferences are deferred to a dedicated User Preferences epic
3. **SpineOverlay animation redesign** — Changing easing curves, keyframe timing, or adding new animation variants is out of scope; only positional/visibility logic changes
4. **New Spine domains or color tokens** — No new domain (e.g., "Memory", "Planning") should be added as part of this work
5. **Hub route changes** — The `/hub` suppression of SpineOverlay is intentional and must not be altered
6. **SpineSideRail feature expansion** — Adding click-to-expand, filtering, or event history beyond the last 4 cards is deferred
7. **Theme system overhaul** — The orange-theme decision (Option A) is a targeted deletion only; no other theme should be modified as collateral
8. **Accessibility audit** — ARIA labeling and screen-reader support for Spine indicators is important but tracked separately under an Accessibility epic

---

## ❓ 10. Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| OQ-1 | **What is the safe-area bottom inset on mobile?** The xs compact dot must not overlap the chat input or native browser nav bars — does the app currently use `env(safe-area-inset-bottom)` or a fixed padding value? | Developer Agent | ✅ Yes — blocks xs implementation |
| OQ-2 | **Does a settings/preferences panel already exist?** The toggle needs a home. If no settings panel exists, a FAB is the fallback — but the Design Agent needs to spec it before development begins. | Design Agent | ✅ Yes — blocks toggle placement |
| OQ-3 | **What is the exact right-edge coordinate of the chat panel in `split` layout?** The offset fix (P1) requires anchoring to a real layout value. Is the panel width driven by a CSS variable, a Zustand value, or a hard-coded Tailwind class? | Developer Agent | ✅ Yes — blocks offset fix |
| OQ-4 | **Should the mini-rail (2 cards at lg breakpoint) be a separate component or a responsive variant of SpineSideRail?** This is an architecture question that affects how the Developer Agent implements the lg story — it should be decided before coding begins. | Developer Agent | ⚠️ Partial — can prototype either way |
| OQ-5 | **Is there a planned Settings or Command Palette sprint?** If the preference toggle is being held for a larger settings refactor, the FAB fallback should be built now to avoid blocking P2 stories. | Product Manager | ℹ️ Informational |

---

*End of PRD — Spine Indicator Unification v1.0*
