# Sprint 22 — Full Product UX/UI Overhaul: Mobile-First, Overlap Fixes & Design System Conformance

**Status:** In Progress  
**Seeded:** 2026-03-19  
**Focus:** End-to-end UX/UI remediation across the entire product. This sprint closes every gap identified in the March 2026 full-product design audit. Three interlocked workstreams: (1) z-index stacking and element overlap fixes, (2) mobile-first layout corrections, (3) design system conformance — replace all native controls, standardize typography/spacing/color, add missing themed primitives.

---

## Background & Audit Findings

A comprehensive end-to-end UX/UI audit was performed across all 12 active routes, all shared layout shells, and all core components. Two sub-audits were run: one for z-index/fixed-element stacking conflicts, one for layout-region crowding and flex/grid chain failures. Key findings below.

### Z-Index Contract (from `src/index.css`)
```
--z-base: 0  →  --z-content: 10  →  --z-header: 50  →  --z-fab: 60
→  --z-overlay: 70  →  --z-modal: 80  →  --z-toast: 90
```

### Root-Cause Families

**Family A — Z-Index Stacking Conflicts (16 confirmed)**
- Multiple components bypass the CSS variable contract with hardcoded values (`z-[120]`, `z-50`, `z-10`)
- Several simultaneously-mounted fixed layers share identical bottom/position coordinates
- Focus-trap in modal prevents interaction with technically-higher-z overlays

**Family B — Layout Crowding / Overflow (11 confirmed)**
- `min-h-[600px]` on chat panels forces overflow on every mobile module page
- Forge `h-1/2` mobile split collapses chat and editor simultaneously
- Hub bottom dashboard is unbounded in height, crushes card grid
- Multiple bottom-area elements (FAB, mobile footer, quick-log, chat input, toasts) stack without coordination

**Family C — Design System Non-Conformance**
- Native `confirm()` / `prompt()` still used in Atlas, Scout, Ledger
- Raw `<select>`, `<textarea>`, `<input>` in Forge, Soma, Ledger, Scout, many form renderers
- Custom toggle implementations in `SystemPanel` instead of `NeuralToggle`
- Missing shared primitives: `NeuralTextarea`, `NeuralSelect`, `NeuralCheckbox`, `NeuralBanner`, `NeuralIconButton`
- Typography below 12px minimum for functional text in many modules
- Hardcoded colors and spacing bypass token system

**Family D — Product/UX Flow Issues**
- `returnTo` deep-link param is encoded by `ProtectedRoute` but ignored by `LandingPage` after auth
- Native dialog calls break product theme and mobile UX
- Landing exposes only 3 of 9 modules
- Onboarding/security copy uses system-internal jargon

---

## Sprint Items

### P0 — Critical Overlap / Stacking Fixes

---

#### S22-001 — Fix NexusRouteBanner z-index contract violation and DataSyncToast collision

**Files:** `src/core/components/NexusRouteBanner.tsx`, `src/core/components/DataSyncToast.tsx`

**Problem:**
- `NexusRouteBanner` uses hardcoded `z-[120]` which sits above every other layer in the system including modals and toasts — breaking the CSS contract entirely.
- Both `NexusRouteBanner` and `DataSyncToast` are positioned `fixed bottom-24 left-1/2 -translate-x-1/2` — identical screen position. NexusRouteBanner (z-120) completely obscures DataSyncToast (z-50). Data sync prompts are invisible.

**Required Changes:**
- `NexusRouteBanner.tsx`: Replace `z-[120]` with `z-[var(--z-toast)]`. Move to `bottom-6` (distinct from DataSyncToast).
- `DataSyncToast.tsx`: Move to `bottom-40` to clear chat input area and no longer share position with RouteBanner. Replace hardcoded `z-50` with `z-[var(--z-toast)]`.

**Acceptance Criteria:**
- [x] Both components visible simultaneously without one obscuring the other
- [x] Neither uses a hardcoded integer z-index — both reference CSS custom property
- [ ] Verified on mobile portrait and desktop

**Status:** done

---

#### S22-002 — Fix ConflictResolutionOverlay blocked by NexusOverlay focus trap

**Files:** `src/core/components/ConflictResolutionOverlay.tsx`, `src/core/components/NexusOverlay.tsx`

**Status:** ✅ Done

**Problem:**
ConflictResolutionOverlay renders at `z-[var(--z-toast)]` (90). NexusOverlay modal renders at `z-[var(--z-modal)]` (80) but its full-height sidebar with focus trap prevents all pointer events reaching the conflict card, even though it is technically z-above the modal. Critical conflict prompts become unreachable while Nexus is open.

**Required Changes:**
- `ConflictResolutionOverlay.tsx`: Raise z to `z-[calc(var(--z-modal)+15)]` = effectively 95. Ensure `pointer-events-auto` is explicit on the card element.
- Consider whether NexusOverlay focus trap should release when ConflictResolutionOverlay is active (use a Zustand flag).

**Acceptance Criteria:**
- [x] Conflict card is tappable/clickable while NexusOverlay modal is open
- [x] Focus trap in NexusOverlay does not intercept keyboard events meant for ConflictResolutionOverlay

---

#### S22-003 — Remove hardcoded min-h-[600px] from UnifiedModulePage command/lab workspaces

**File:** `src/core/components/UnifiedModulePage.tsx`

**Problem:**
Lines 228 and 247 set `min-h-[600px] lg:h-auto lg:min-h-0` on the chat/content panels in `command` and `lab` workspace types. On any viewport under 1024px this forces the panel to 600px regardless of available space, causing overflow and making the chat input unreachable without scrolling. Affects Agnes, Titan, Soma, Scout, Forge, Ledger.

**Required Changes:**
- Line 228: Change `min-h-[600px] lg:h-auto lg:min-h-0` → `min-h-0`
- Line 247: Same change
- Validate each affected module renders chat input within viewport on 375px, 768px, 1024px

**Acceptance Criteria:**
- [x] Chat input visible without scrolling on 375px mobile portrait in Agnes, Titan, Soma
- [x] No content clipping on 768px tablet
- [x] Desktop (1440px+) layouts unchanged

**Status:** done

---

#### S22-004 — Fix Forge mobile split layout (h-1/2 → proper flex stack)

**File:** `src/modules/forge/ForgePage.tsx`

**Problem:**
On mobile, both dashboard and chat panels get `h-1/2` (~320px on 640px screen). The editor section alone needs `min-h-[180px]` textarea + `min-h-[120px]` output + header (~80px) = 380px — already exceeding its 320px allocation. The chat input is clipped and inaccessible.

**Required Changes:**
- Replace `h-1/2 md:h-full` split with flex-based approach:
  - Mobile: vertical stack, dashboard gets `max-h-[45vh] overflow-y-auto`, chat gets `flex-1 min-h-0`
  - `md:` and above: existing side-by-side split remains
- Editor output box `min-h-[120px]` → reduce to `min-h-[80px]` on mobile

**Acceptance Criteria:**
- [x] Chat input visible and usable on mobile without scrolling
- [x] Editor output visible in dashboard panel
- [x] `md:` and above layout unchanged

**Status:** done

---

#### S22-005 — Fix QuickLogDrawer z-index below GlobalFAB

**Files:** `src/modules/titan/components/QuickLogDrawer.tsx`, `src/core/components/GlobalFAB.tsx`

**Problem:**
QuickLogDrawer is `fixed right-0 top-0 h-full z-50`. GlobalFAB is `fixed left-4 z-[var(--z-fab)]` = z-60. FAB floats on top of the open drawer allowing accidental taps.

**Required Changes:**
- `QuickLogDrawer.tsx`: Raise to `z-[var(--z-modal)]` (z-80) so it clears the FAB layer
- Ensure backdrop/close behavior is not broken

**Acceptance Criteria:**
- [x] FAB not visible or tappable when QuickLogDrawer is open
- [x] Drawer close/backdrop still functional

---

#### S22-006 — Fix GlobalFAB backdrop z-index and NexusOverlay duplicate trigger

**Files:** `src/core/components/GlobalFAB.tsx`, `src/core/components/NexusOverlay.tsx`

**Problem (A):** GlobalFAB backdrop at `z-[calc(var(--z-fab)-1)]` = 59 is below NeuralDraftPanel and SpineToast at z-90. Clicking backdrop to close dial passes clicks to underlying toast/draft panel — unintended interactions.

**Problem (B):** Two simultaneous "Consult Nexus" entry points — GlobalFAB's Nexus dial item and NexusOverlay's own trigger button — render in the same bottom-left region when a module bottom bar is active.

**Required Changes:**
- `GlobalFAB.tsx` backdrop: Raise to `z-[var(--z-fab)]` (z-60) so it correctly intercepts all clicks below FAB layer
- `NexusOverlay.tsx`: Suppress the standalone trigger button when `GlobalFAB` is visible (check `isVisible` logic — same conditions: authenticated + onboardingComplete + not on `/` or `/orchestrator`)

**Acceptance Criteria:**
- [x] Clicking outside FAB dial does not accidentally activate toasts or draft cards
- [x] Only one "Consult Nexus" entry point visible at a time

---

#### S22-007 — Fix HubPage bottom dashboard unbounded height crushing cards

**File:** `src/modules/hub/HubPage.tsx`

**Problem:**
The `absolute inset-0 z-10 flex flex-col pointer-events-none` content layer has `HubBottomDashboard` without `shrink-0`. On tablets the dashboard grows and compresses the card/graph area above it. Cards become unreadable or unscrollable.

**Required Changes:**
- Add `shrink-0` to the `HubBottomDashboard` container div
- Add a `max-h` cap for the bottom dashboard on mobile: `max-h-[30vh] overflow-y-auto` on `< md`, unconstrained on `md+`

**Acceptance Criteria:**
- [x] Module cards fully visible above bottom dashboard on 768px tablet
- [x] Bottom dashboard scrollable independently if content overflows on mobile

**Status:** done

---

#### S22-008 — Fix SystemCommandCenter dropdown buried by overlays

**File:** `src/core/components/SystemCommandCenter.tsx`

**Problem:**
Dropdown is `absolute right-0 z-10` relative to the sticky header at z-50 = effective z-60. Any overlay (z-70+) or modal (z-80) renders on top, making security/logout settings unreachable while any overlay is active.

**Required Changes:**
- Make the dropdown `position: fixed` with `z-[var(--z-modal)]` (z-80) rather than `absolute z-10` relative to header, so it always floats above all overlay layers

**Acceptance Criteria:**
- [x] Security/System dropdown accessible while NexusOverlay is open
- [x] Dropdown still visually aligns under the header button on all viewports

---

#### S22-009 — Fix SpineToast mobile stack overflow blocking chat ✅

**File:** `src/core/components/SpineToast.tsx`

**Problem:**
Up to 4 toasts stack upward from `bottom-6 right-6`. Each toast ~100px tall. 4 × 100 = 400px from bottom — covers chat input on portrait mobile.

**Required Changes:**
- Limit visible toast stack to 2 items on `< md` viewports (queue others, show as badge count)
- Add `pb-[env(safe-area-inset-bottom,0px)]` to the toast container for notch devices
- Increase toast container bottom offset to `bottom-20` so it clears the chat input area

**Acceptance Criteria:**
- [x] Chat input fully accessible on 375px portrait with toasts active
- [x] Toasts do not clip on iPhone 14 Pro (safe area inset 34px)

---

#### S22-010 — Fix NeuralDraftPanel + SpineToast horizontal clipping on tablets ✅

**Files:** `src/core/components/NeuralDraftPanel.tsx`, `src/core/components/SpineToast.tsx`

**Problem:**
On screens under ~1400px wide: NeuralDraftPanel is `fixed top-24 right-6 w-[360px]` and SpineToast is `fixed bottom-6 right-6 max-w-[380px]`. Their combined visual weight (both right-anchored) clashes on 1024–1400px screens. On 1024px specifically they can vertically overlap if enough toasts accumulate.

**Required Changes:**
- `NeuralDraftPanel`: On `< lg` viewports switch to `left-4` positioning (or collapse to icon-only with badge)
- `SpineToast`: Ensure it stays right-anchored with `max-w-[min(380px,90vw)]` to prevent overflow

**Acceptance Criteria:**
- [x] NeuralDraftPanel and SpineToast do not visually clash on 1024px viewport
- [x] Neither component clips off-screen on 768px tablet

---

#### S22-011 — Fix ChatInterface action drawer overflow on narrow phones

**File:** `src/core/components/ChatInterface.tsx`

**Problem:**
The upload/action drawer is `absolute bottom-full mb-4 left-0 w-80` = 320px fixed. On 320–375px phones this equals or exceeds viewport width, clipping right-side buttons.

**Required Changes:**
- Replace `w-80` with `w-[min(320px,calc(100vw-2rem))]` so it shrinks on narrow viewports
- Ensure drawer buttons remain tappable at their minimum size

**Acceptance Criteria:**
- [x] All drawer buttons visible and tappable on 320px device
- [x] No horizontal scroll caused by drawer

**Status:** done

---

#### S22-012 — Add shrink-0 to ModuleLayout mobile footer and safe-area to chat scroll button

**Files:** `src/core/layout/ModuleLayout.tsx`, `src/core/components/ChatInterface.tsx`

**Problem (A):** `RenderMobileFooter` div (line 310) lacks `shrink-0`, allowing tall footer content to compress main content.

**Problem (B):** Chat scroll-to-bottom button at `bottom-36` (144px) is a hardcoded offset — collides with chat input + pending request banners on short viewports.

**Required Changes:**
- `ModuleLayout.tsx` line 310: Add `shrink-0` to the footer div
- `ChatInterface.tsx` scroll button: Change `bottom-36` to `bottom-[calc(var(--chat-input-height,_120px)_+_1rem)]` or use a Ref-based dynamic position

**Acceptance Criteria:**
- [x] Mobile footer never compresses main content area
- [x] Scroll-to-bottom button never overlaps chat input bar

**Status:** done

---

### P1 — Design System Conformance

---

#### S22-013 — Replace native confirm()/prompt() calls with ConfirmDialog/NeuralModal

**Files:**
- `src/modules/atlas/components/TaskManager.tsx` (line 395 — `confirm()`)
- `src/modules/atlas/components/HabitBuilder.tsx` (line 361 — `confirm()`)
- `src/modules/atlas/components/GoalTracker.tsx` (line 269 — `confirm()`)
- `src/modules/scout/components/deep-research/DeepResearchPanel.tsx` (line 123 — `window.confirm()`)
- `src/modules/ledger/components/GoalTracker.tsx` (line 456 — `prompt()`)

**Problem:**
Native browser `confirm()` and `prompt()` are theme-breaking, inaccessible on mobile, and not keyboard-navigable. The product has a fully capable `ConfirmDialog` component that should be used instead.

**Required Changes:**
- All `confirm()` for delete flows → replace with `ConfirmDialog` (variant="danger") with proper state management
- `prompt()` in Ledger GoalTracker → replace with a `NeuralModal` containing a `NeuralInput` field
- Wire cancel/confirm handlers in each case

**Acceptance Criteria:**
- [ ] Zero `confirm()` / `prompt()` calls remain in any `.tsx` file
- [ ] Delete confirmations use `ConfirmDialog` with danger variant
- [ ] Ledger contribution input uses `NeuralModal` with `NeuralInput`
- [ ] All dialogs keyboard-navigable and mobile-friendly

---

#### S22-014 — Create NeuralTextarea shared primitive and migrate all raw textareas

**Files to create:** `src/core/components/NeuralTextarea.tsx`

**Files to migrate:**
- `src/modules/forge/ForgePage.tsx` — code editor textarea
- `src/modules/soma/components/PhysicalAssessmentForm.tsx` — notes textarea
- `src/core/components/ChatInterface.tsx` — message compose textarea
- `src/core/components/forms/field-renderers/TextAreaFieldRenderer.tsx`

**Problem:**
Raw `<textarea>` elements are used throughout with inconsistent styling. No shared themed primitive exists.

**Required Changes:**
- Create `NeuralTextarea` with: glass background, themed border, focus ring matching `NeuralInput`, `resize-none` by default, font-mono variant for code contexts, min-height prop, full a11y attributes
- Migrate all identified raw textareas to `NeuralTextarea`
- ChatInterface compose area retains its auto-resize ref logic but wraps in `NeuralTextarea`

**Acceptance Criteria:**
- [x] `NeuralTextarea` component exists and is exported from `src/core/components`
- [x] No raw unstyled `<textarea>` in product TSX (excluding test files)
- [x] ChatInterface compose, Forge editor, Soma assessment form all use NeuralTextarea

---

#### S22-015 — Create NeuralSelect shared primitive and migrate raw selects

**Files to create:** `src/core/components/NeuralSelect.tsx`

**Files to migrate:**
- `src/modules/forge/ForgePage.tsx` — language selector (`<select>`)
- `src/core/components/forms/field-renderers/SelectFieldRenderer.tsx`
- `src/modules/profile/components/ModelSelector.tsx`
- `src/modules/profile/components/VisionModelSelector.tsx`

**Required Changes:**
- Create `NeuralSelect` wrapping a styled native select or Radix `Select`, matching the glassmorphism theme, with chevron icon, same sizing tokens as `NeuralInput`
- Migrate all identified raw selects

**Acceptance Criteria:**
- [x] `NeuralSelect` component exists and exported
- [x] No raw unstyled `<select>` in product TSX
- [x] Forge language selector, Profile model selectors all use NeuralSelect

---

#### S22-016 — Migrate SystemPanel custom toggle to NeuralToggle

**File:** `src/modules/profile/components/SystemPanel.tsx`

**Problem:**
`SystemPanel` implements its own toggle switch (Debug Mode and sub-flags) with bespoke button+span HTML. The product already has `NeuralToggle` which is semantically correct (`role="switch"`, `aria-checked`, focus ring) and used everywhere else.

**Required Changes:**
- Replace the custom `<button role="switch">` toggle implementation (lines 189–207 and 230–248) with `<NeuralToggle>` for both Debug Mode master toggle and all sub-flag toggles
- Wire existing `toggleDebugMode` / `setDebugFlag` handlers

**Acceptance Criteria:**
- [ ] SystemPanel uses `NeuralToggle` for all switch controls
- [ ] Custom toggle implementation code removed
- [ ] Debug mode toggle still functions correctly

---

#### S22-017 — Fix post-auth returnTo deep-link ignored by LandingPage

**Files:** `src/modules/landing/LandingPage.tsx`, `src/core/components/UnifiedAuthModal.tsx`

**Problem:**
`ProtectedRoute` correctly appends `?returnTo=<path>` when redirecting to `/`. But `LandingPage` always navigates to `/orchestrator` after successful auth (`useEffect` on `isAuthenticated`). The `returnTo` param is never read, breaking deep-links.

**Required Changes:**
- `LandingPage.tsx`: Read `returnTo` from `useSearchParams()`. On `isAuthenticated`, navigate to `returnTo` if present and valid, otherwise fall back to `/orchestrator`
- Validate `returnTo` is a relative path (starts with `/`) to prevent open redirect

**Acceptance Criteria:**
- [ ] Navigating to `/atlas` while logged out, then signing in, lands on `/atlas`
- [ ] Navigating to `/` while logged out still lands on `/orchestrator` after auth
- [ ] `returnTo` value validated as relative path only

---

#### S22-018 — Typography minimum size enforcement and contrast improvements

**Files:** `src/index.css`, `src/core/layout/ModuleLayout.tsx`, `src/core/components/SectionHeader.tsx`, and widespread module components

**Problem:**
Functional UI text falls below WCAG minimum: labels at `text-[8px]`, `text-[9px]`, `text-[10px]` with `white/30–40` opacity in therapeutic (Agnes), health (Soma), and financial (Ledger) contexts. `--z-label` CSS class sets 9px.

**Required Changes:**
- `src/index.css`: Raise `.text-label` minimum from 9px to 11px. Add a note that 10px and below is reserved for purely decorative/ambient telemetry text only.
- `ModuleLayout.tsx` subtitle row: Raise `text-[9px]` to `text-xs` (12px)
- Audit and fix all functional labels below 12px across Agnes, Soma, Ledger, Profile modules
- Raise `white/30` and `white/35` text-color usage to `white/50` minimum for functional labels

**Acceptance Criteria:**
- [x] No functional label (control label, body text, helper text) below 11px
- [x] `white/30`/`white/35` opacity only used for purely decorative/ambient text
- [x] Agnes session picker and Soma vitals form labels pass contrast check

---

#### S22-019 — Mobile-first header slim-down and safe-area support

**File:** `src/core/layout/ModuleLayout.tsx`

**Problem:**
The module header on mobile carries: back button + title + status dot + telemetry ticker + Nexus trigger + module switcher + security protocol + SystemCommandCenter — all in a single row. On 375px this is extremely crowded. No `safe-area-inset-top` padding for notch devices.

**Required Changes:**
- Add `pt-[env(safe-area-inset-top,0px)]` to the sticky header
- On `< sm` breakpoint: hide `TelemetryTicker` (already `hidden sm:flex` — verify) and Security Protocol button (add `hidden md:flex`)
- Replace `h-screen` in `ModuleLayout` root with `h-[100dvh]`
- Add `pb-[env(safe-area-inset-bottom,0px)]` to the mobile footer slot

**Acceptance Criteria:**
- [x] Header content not clipped behind notch on iPhone 14 Pro
- [x] Mobile header shows only: back, title, Nexus trigger, module switcher
- [x] No `h-screen` in ModuleLayout root

---

#### S22-020 — Fix Ledger tab strip mobile overflow

**File:** `src/modules/ledger/LedgerPage.tsx`

**Problem:**
Ledger has a horizontal tab strip that overflows on mobile, forcing horizontal scroll with no visible scroll indicator. Tabs also lack proper `role="tab"` / `role="tabpanel"` semantics.

**Required Changes:**
- Wrap tab strip in `overflow-x-auto no-scrollbar` with `scroll-snap-type-x mandatory` so tabs snap on mobile
- Add proper `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`, `aria-labelledby` to the tab system
- Ensure minimum tab width allows labels to be legible on 375px

**Acceptance Criteria:**
- [ ] Tab strip scrollable horizontally on 375px without page-level scroll
- [ ] Tabs have correct ARIA roles and keyboard support (arrow keys)
- [ ] Active tab panel exposed as `role="tabpanel"`

---

### P2 — Per-Module Polish

---

#### S22-021 — Agnes: tone down sci-fi density, improve session picker mobile layout

**File:** `src/modules/agnes/AgnesPage.tsx` and `src/modules/agnes/components/`

**Required Changes:**
- Sidebar: On `< lg` viewports, default to collapsed state (`w-10`) — do not default expanded on tablet
- Session picker: Replace oversized theatrical headings with calmer typography; reduce motion intensity on mobile
- Session summary actions (discard/finalize): Replace raw low-contrast text buttons with `NeuralButton variant="ghost"` and `variant="danger"`
- Raise all functional text to minimum 12px in session chooser

**Acceptance Criteria:**
- [ ] Sidebar collapsed by default on tablet and mobile
- [ ] Session picker readable on 375px without horizontal scroll
- [ ] Discard/finalize use NeuralButton

---

#### S22-022 — Titan: fix training tab crowding and quick-log mobile behavior

**Files:** `src/modules/titan/TitanPage.tsx`, `src/modules/titan/components/QuickLogBar.tsx`

**Required Changes:**
- Add height budget: Tab strip is fixed height; main dashboard area is `flex-1 min-h-0 overflow-y-auto`; QuickLogBar is `shrink-0`
- QuickLogBar raw inputs: wrap with `NeuralInput`
- Ensure bottom stack (QuickLogBar + chat input) does not combine to more than 40% of mobile viewport height

**Acceptance Criteria:**
- [ ] Dashboard visible without scrolling past tab strip on 375px
- [ ] QuickLogBar uses NeuralInput
- [ ] No combined bottom-area stack > 40vh on mobile

---

#### S22-023 — Soma: replace raw textarea, improve form spacing, safe-area fix

**Files:** `src/modules/soma/components/PhysicalAssessmentForm.tsx`, `src/modules/soma/SomaPage.tsx`

**Required Changes:**
- Replace raw `<textarea>` in PhysicalAssessmentForm with `NeuralTextarea`
- Add `min-h-[env(safe-area-inset-bottom,0px)]` bottom padding to SomaDashboard scroll container to clear mobile FAB
- Add 8px minimum vertical spacing between each form field group

**Acceptance Criteria:**
- [ ] PhysicalAssessmentForm uses NeuralTextarea
- [ ] Last vitals field visible above FAB on 375px mobile
- [ ] Form sections have clear visual breathing room

---

#### S22-024 — Scout: standardise dialogs, fix mobile research view

**Files:** `src/modules/scout/components/NewSessionDialog.tsx`, `src/modules/scout/ScoutPage.tsx`

**Required Changes:**
- `NewSessionDialog`: Migrate to `NeuralModal` as base, replace raw `<input>` with `NeuralInput`, replace raw confirm buttons with `NeuralButton`
- `ScoutPage.tsx` review/apply/discard actions: Replace raw buttons with `NeuralButton`
- Research view `p-8` → `p-4 sm:p-8` for mobile breathing room
- Wire full Radix dialog focus trap in NewSessionDialog

**Acceptance Criteria:**
- [ ] NewSessionDialog uses NeuralModal + NeuralInput + NeuralButton
- [ ] Research view padding correct on 375px
- [ ] All Scout dialogs have proper focus trap and Escape key dismiss

---

#### S22-025 — Profile: complete tab semantics, fix hover-only edit affordances

**Files:** `src/modules/profile/ProfilePage.tsx`, `src/modules/profile/components/IdentityPanel.tsx`

**Required Changes:**
- Add `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-labelledby` / `id` linking to profile tab system
- `IdentityPanel`: Replace `opacity-0 group-hover:opacity-100` edit button with always-visible edit affordance (opacity-100, smaller size)
- Make edit button minimum 44×44px touch target

**Acceptance Criteria:**
- [ ] Profile tabs navigable with arrow keys
- [ ] Edit button always visible in IdentityPanel (not hover-only)
- [ ] All tab panels have correct ARIA semantics

---

#### S22-026 — Hub: add shrink-0 to bottom dashboard, fix CardsView semantic headings

**Files:** `src/modules/hub/HubPage.tsx`, `src/modules/hub/components/cards/CardsView.tsx`

**Required Changes:**
- HubPage: Add `shrink-0` and `max-h-[28vh]` cap to HubBottomDashboard container (already in S22-007, confirm done)
- Add proper `tabpanel` relationships to Cards/Graph/3D view switcher
- CardsView: Replace decorative heading divs with semantic `<h2>` / `<h3>` elements
- Reduce `tracking-[0.6em]` extreme letter-spacing to `tracking-widest` max

**Acceptance Criteria:**
- [ ] Hub view switcher has role="tablist" with matching tabpanel IDs
- [ ] CardsView uses semantic headings
- [ ] No tracking value exceeds `tracking-widest`

---

## Governing Constraints

1. **No new native form elements** — every new or migrated control must use a Neural* primitive
2. **No hardcoded z-index integers** — all z-index values reference `var(--z-*)` tokens
3. **No `h-screen`** — replace with `h-[100dvh]` throughout
4. **Touch targets minimum 44×44px** for all interactive elements
5. **No functional text below 11px**
6. **All fixed bottom elements must account for `env(safe-area-inset-bottom)`**

---

## Testing Checklist

- [ ] 320px portrait: Forge dashboard+chat both visible
- [ ] 375px portrait: Agnes session picker, Soma vitals form, Titan training tab, Ledger tab strip
- [ ] 768px tablet: UnifiedModulePage command/lab — chat input visible
- [ ] 768px tablet: AgnesPage sidebar does not crowd session picker
- [ ] 1024px: Hub cards visible above bottom dashboard
- [ ] Desktop: NexusRouteBanner and DataSyncToast both visible simultaneously
- [ ] Desktop: ConflictResolutionOverlay actionable while NexusOverlay is open
- [ ] Desktop: SystemCommandCenter dropdown accessible while any overlay is open
- [ ] Any: QuickLogDrawer (Titan) — GlobalFAB not visible/tappable while drawer open
- [ ] Any: Clicking outside FAB dial does not activate toast or draft card
- [ ] Any: Profile tabs keyboard-navigable with arrow keys
- [ ] Any: Zero native confirm()/prompt() calls trigger in product flows
