# AGNES/Nyx Design System & UX Review

> Comprehensive UI/UX audit performed against `DESIGN_SYSTEM.md` v3.0, all core components in `src/core/`, module pages in `src/modules/`, and the global CSS/config layer.

---

## 1. Critical UX Issues

### 1.1 ⛔ Modals Have No Focus Trap or Keyboard Dismiss
**Files:** `src/core/components/NeuralModal.tsx`, `src/core/components/UnifiedAuthModal.tsx`

Both modal implementations lack:
- `role="dialog"` and `aria-modal="true"` on the modal container
- Focus trap (Tab cycling stays inside the modal)
- `Escape` key handler to dismiss
- `aria-label` on the close button (`NeuralModal` line 67, `UnifiedAuthModal` line 95)
- Return-focus to trigger element on close

The `UnifiedAuthModal` is the **primary authentication gateway** — a user relying on keyboard navigation or a screen reader cannot reliably interact with it. This is a **WCAG 2.1 Level A violation** (2.1.1 Keyboard, 2.4.3 Focus Order).

**Impact:** Keyboard-only users and screen reader users are blocked from logging in.

### 1.2 ⛔ Module Title Disappears on Mobile
**File:** `src/core/layout/ModuleLayout.tsx`, line 118

```tsx
<div className="flex flex-col hidden sm:flex">
```

The module title and status indicator are completely hidden below `640px`. On mobile, only the back arrow and system controls are visible — the user has **no way to identify which module they are in**.

**Impact:** Total loss of wayfinding on mobile devices.

### 1.3 ⛔ Extremely Small Text Throughout Core Components
**File:** `src/core/components/NeuralButton.tsx`, lines 30–34

```tsx
sm: 'px-3 py-1.5 text-[9px]',
md: 'px-6 py-3 text-[10px]',
lg: 'px-8 py-4 text-[11px]',
xl: 'px-10 py-5 text-[12px]'
```

Button text is **9–12px** across ALL size variants. WCAG recommends a minimum of 14px for interactive text; the design system specifies `text-xs` (12px) for `sm` and `text-sm` (14px) for `md`. The implementation deviates significantly — even "xl" buttons render at only 12px.

Similar issues in:
- `NeuralInput` label: `text-[10px]` (line 19)
- `ChatInterface` timestamps: `text-[8px]` (line 112)
- `TelemetryTicker`: `text-[7px]` (line 49)
- `SectionHeader` label: `text-[9px]` (line 25)
- `SystemCommandCenter` labels: `text-[8px]`, `text-[9px]` throughout

**Impact:** Text is illegible on mobile devices and for users with low vision.

### 1.4 ⛔ Trainer Chat Panel Doesn't Collapse on Mobile
**File:** `src/modules/trainer/TrainerPage.tsx`, line 109

```tsx
const chatWidth = 'clamp(320px, 32vw, 520px)';
```

The chat sidebar has a minimum width of 320px and the main content has no minimum width protection. On a 375px mobile screen, the layout breaks completely — the content area becomes ~55px wide.

**Impact:** Trainer module is **unusable on mobile**.

### 1.5 ⛔ NeuralDraftPanel Overflows on Mobile
**File:** `src/core/components/NeuralDraftPanel.tsx`, line 81

```tsx
className="fixed top-24 right-6 z-[105] w-[360px] ..."
```

Fixed 360px width with `right-6` positioning will overflow on any screen under ~400px. No responsive adaptation.

**Impact:** Draft proposals are partially or fully off-screen on mobile.

---

## 2. Design System Violations

### 2.1 🔴 Font Stack Mismatch — Inter Never Loaded
**File:** `src/index.css`, line 4

```css
--font-sans: "Space Grotesk", "IBM Plex Sans", ui-sans-serif, ...
```

DESIGN_SYSTEM.md §3.1 specifies:
- **Headings:** Space Grotesk (700)
- **Body:** Inter (400/500/700)
- **Telemetry:** Inter monospace (500)

The CSS font stack completely omits Inter. The body font resolves to Space Grotesk everywhere, violating the documented hierarchy. Body text should use Inter for readability; Space Grotesk is a display font not optimized for body paragraphs.

**Also:** Neither Space Grotesk nor Inter are imported via `@font-face` or a CDN link in `index.html`. The fonts will only render if the user has them installed locally.

### 2.2 🔴 ChatInterface Theme Colors Limited to 3 of 10 Modules
**File:** `src/core/components/ChatInterface.tsx`, line 22

```tsx
themeColor: 'indigo' | 'orange' | 'cyan';
```

Modules like Soma (emerald), Atlas (sky), Scout (lime), Forge (rose), Pulse (fuchsia) must coerce to one of three colors. The `module-manifest.ts` defines `chatTheme` for each module — Soma, Atlas, Scout, Forge, and Pulse have **no `chatTheme`** defined, defaulting to `'indigo'` via NexusSubModulePanel.

**Result:** Soma's emerald chat appears as indigo. Forge's rose chat appears as indigo. The visual identity of non-core modules is lost in their primary interaction surface.

### 2.3 🔴 NeuralButton Sizes Don't Match Design System
**File:** `src/core/components/NeuralButton.tsx`

| Size | Design System | Implementation |
|------|---------------|----------------|
| sm | `h-8 px-3 text-xs` | `px-3 py-1.5 text-[9px]` |
| md | `h-10 px-5 text-sm` | `px-6 py-3 text-[10px]` |
| lg | `h-12 px-6 text-base` | `px-8 py-4 text-[11px]` |
| xl | `h-14 px-8 text-lg` | `px-10 py-5 text-[12px]` |

No fixed heights are set; buttons rely entirely on padding. The text sizes are dramatically smaller than documented.

### 2.4 🔴 NeuralInput Focus Ring Hardcoded to Indigo
**File:** `src/core/components/NeuralInput.tsx`, line 31

```tsx
'focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'
```

DESIGN_SYSTEM.md §5.2 specifies focus should use `{C}-500/50` (module color). The input always glows indigo regardless of which module it's rendered in. The icon similarly hardcodes `group-focus-within:text-indigo-400`.

### 2.5 🔴 ModuleLayout Background Uses Wrong Void Color
**File:** `src/core/layout/ModuleLayout.tsx`, line 93

```tsx
className="h-screen bg-[#010103] ..."
```

DESIGN_SYSTEM.md §2.3 specifies Void = `#020205`. The ModuleLayout uses `#010103`. The `index.css` body and BootLoader correctly use `#020205`.

### 2.6 🟡 Nerve Endings Not Implemented
DESIGN_SYSTEM.md §4.3 and §7.2 describe "Peripheral Nerve Endings" as a signature visual element — 1px glowing lines at 8%, 50%, and 92% of viewport width that pulse and carry event dots.

**No implementation exists in the codebase.** The SpineOverlay (line rendering on right side) is a different concept — an event visualization rail, not the documented nerve-ending decorative lines.

### 2.7 🟡 GlassCard Missing Documented Hover State
**File:** `src/core/components/GlassCard.tsx`

DESIGN_SYSTEM.md §5.4 documents hover as: `bg-white/[0.05] border-white/15 scale-[1.005] transition-all duration-300`

The implementation has no hover interaction at all.

### 2.8 🟡 NeuralModal Missing Footer Section
**File:** `src/core/components/NeuralModal.tsx`

DESIGN_SYSTEM.md §5.3 documents a footer: `px-8 pb-6, flex gap-3 justify-end`. The implementation has header + body but no footer slot. Consumers must embed buttons inside `children`.

### 2.9 🟡 components.json Points to Non-Existent CSS Path
**File:** `components.json`, line 9

```json
"css": "src/app/globals.css"
```

The actual CSS file is `src/index.css`. This misconfiguration means Shadcn CLI commands (`npx shadcn@latest add`) would fail to inject new component styles.

### 2.10 🟡 index.html Contains Light Mode Fallback
**File:** `index.html`, lines 19-22

```html
html:not(.dark) body { background-color: #ffffff; color: #000000; }
```

DESIGN_SYSTEM.md §1 states: "There is no light mode." The flash-of-white body style contradicts the dark-only philosophy and can cause a visible flash before React hydrates.

### 2.11 🟡 Duplicate Surface Layer Split: GlassCard vs SurfaceCard
**Files:** `src/core/components/GlassCard.tsx`, `src/core/components/SurfaceCard.tsx`

Two components serve overlapping purposes:
- **GlassCard:** `bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px]` + grid pattern
- **SurfaceCard:** Uses `.surface-card` CSS class with similar properties

Both are actively used across the codebase. This creates confusion about which to use and inconsistent visual behavior (GlassCard has a grid sub-layer, SurfaceCard uses CSS-defined classes).

---

## 3. Accessibility Gaps

### 3.1 NeuralInput Label Not Connected to Input
**File:** `src/core/components/NeuralInput.tsx`

The `<label>` element (line 19) has no `htmlFor` attribute, and the `<input>` has no `id`. Screen readers cannot associate the label with the field.

```tsx
// Current
<label className="...">  {/* No htmlFor */}
<input className="..." {...props} />  {/* No id */}

// Should be
<label htmlFor={inputId} className="...">
<input id={inputId} className="..." {...props} />
```

### 3.2 No Error Announcements in Forms
**File:** `src/core/components/UnifiedAuthModal.tsx`, lines 176, 259

Error messages are rendered as plain `<p>` elements:
```tsx
<p className="text-red-400 text-[10px] ...">{error}</p>
```

No `role="alert"`, no `aria-live="polite"`, no `aria-describedby` linking errors to their inputs. Screen readers won't announce form errors.

### 3.3 Chat Messages Lack Semantic Structure
**File:** `src/core/components/ChatInterface.tsx`

- The message list container has no `role="log"` or `aria-live="polite"` for new message announcements
- Individual messages lack `role="listitem"` or semantic grouping
- The AI "thinking" indicator (bouncing dots) has no text alternative
- Timestamps show current time (`new Date().toLocaleTimeString()`) rather than actual message time

### 3.4 Framer Motion Animations Ignore prefers-reduced-motion
**File:** `src/index.css`, lines 106-113

CSS-level reduced motion is correctly implemented:
```css
@media (prefers-reduced-motion: reduce) { ... }
```

However, Framer Motion animations (which run via JavaScript, not CSS transitions) are **not** governed by this media query. Components like NeuralButton (`whileHover`, `whileTap`), SyncTransition, BootLoader, and all AnimatePresence wrappers continue to animate.

**Fix:** Import `useReducedMotion()` from Framer Motion in animation-heavy components, or set `MotionConfig` at the app root with `reducedMotion="user"`.

### 3.5 NexusOverlay FAB Has No Accessible Name for Closed State
**File:** `src/core/components/NexusOverlay.tsx`, line 52-65

The FAB trigger is a `<motion.button>` with only an icon and decorative text:
```tsx
<motion.button ...>
  <Sparkles className="w-4 h-4 ..." />
  <span className="text-[9px] ...">Consult Nexus</span>
</motion.button>
```

While the text is visible (barely at 9px), there's no `aria-label` and no `aria-expanded` attribute to indicate the overlay state.

### 3.6 Color Contrast Issues
Multiple UI elements rely on white text at very low opacity against dark backgrounds:
- `text-white/20` (opacity 0.2) — contrast ratio ~1.3:1 against `#020205` — **fails WCAG AA** (minimum 4.5:1)
- `text-white/30` — contrast ~1.5:1 — **fails**
- `text-white/40` — contrast ~2.0:1 — **fails**
- `text-white/50` — contrast ~2.5:1 — **fails**
- `text-white/60` — contrast ~3.2:1 — **fails AA for body text**

These are used pervasively for labels, subtitles, metadata, and timestamps. While the ultra-muted aesthetic is intentional, secondary body text at `text-white/60` fails WCAG AA (4.5:1 required for normal text, 3:1 for large text).

---

## 4. Visual Polish

### 4.1 SyncTransition is Overly Long
**File:** `src/core/components/SyncTransition.tsx`

The transition takes ~1.5s (5 logs × 250ms + 300ms finish). While shorter than the documented 3.2s, it's still a mandatory blocking animation on every module exit. There's no skip/cancel button.

**Recommendation:** Add a "skip" option after 500ms, or reduce to 3 fast logs (~800ms total).

### 4.2 BootLoader Uses Hardcoded Indigo Theme
**File:** `src/core/components/BootLoader.tsx`

The boot animation is always indigo-themed (indigo dots, indigo spinner, indigo bars) regardless of which module is being loaded. If a user navigates to the Trainer (amber) module, they see an indigo loader.

### 4.3 TelemetryTicker Logs Are Misleading
**File:** `src/core/layout/ModuleLayout.tsx`, lines 28-31

Random fake system logs like `ENCRYPTING_PACKET_0xAF9...` and `RE-ROUTING_PACKET_0x441` cycle every 3 seconds. These are purely decorative but could confuse users into thinking real network activity is occurring.

### 4.4 Landing Page Feature Cards Don't Show All Modules
**File:** `src/modules/landing/LandingPage.tsx`, lines 9-46

Only 4 modules are featured (Agnes, Soma, Ledger, Titan). The 10-agent ecosystem is a key differentiator but only 40% of agents are showcased. Additionally, the feature card for Ledger describes it as "Financial planning" but the module manifest describes it as "Financial Planning Domain" — the DESIGN_SYSTEM.md describes Ledger as "Chief Medical Officer" / CMO synthesis, which is a completely different role.

### 4.5 Chat Bubble Inconsistency Between Themes
**File:** `src/core/components/ChatInterface.tsx`, lines 38-60

The `orange` theme uses squared chat bubbles with a left/right border accent:
```tsx
orange: {
  bubble: 'bg-white/[0.03] border-white/5 ... rounded-none border-l-2 border-orange-500/30',
  userBubble: '... rounded-none border-r-2 border-white/20',
}
```

While `indigo` and `cyan` use rounded bubbles (`rounded-2xl rounded-tl-sm`). DESIGN_SYSTEM.md §5.12 documents a single bubble style for all themes. The orange variant's squared design is undocumented.

---

## 5. Component Architecture

### 5.1 NexusChat Is a Thin Wrapper With Hidden Complexity
**File:** `src/core/components/NexusChat.tsx`

NexusChat wraps ChatInterface but:
- Adds streaming text assembly logic (transient stream message construction)
- Embeds an `UnifiedAuthModal` for quota exhaustion
- Adds retry logic by finding the last user message

This is reasonable abstraction, but the `ai` prop is loosely typed (`any` for messages, quota). A proper interface type would improve safety:

```tsx
ai: {
    messages: any[];  // Should be Message[]
    quota: any;       // Should be GuestQuota | undefined
}
```

### 5.2 ChatInterface Theme Constraint Creates Module Identity Loss
**File:** `src/core/components/ChatInterface.tsx`, `src/lib/module-manifest.ts`

The 3-color constraint (`indigo | orange | cyan`) forces 7 modules to use incorrect colors:

| Module | Own Color | Chat Color Used |
|--------|-----------|-----------------|
| Soma | Emerald | `indigo` (via default) |
| Atlas | Sky | `cyan` (close but not exact) |
| Scout | Lime | `indigo` (via default) |
| Forge | Rose | `indigo` (via default) |
| Pulse | Fuchsia | `indigo` (via default) |
| Orchestrator | Violet | `indigo` (close) |
| Bridge | Slate | N/A (no page) |

**Recommendation:** Extend `THEMES` in ChatInterface to support all 10 module colors, using the existing CSS custom properties.

### 5.3 UnifiedModulePage Has 4 Workspace Types With Layout Logic in JSX
**File:** `src/core/components/UnifiedModulePage.tsx`

The component handles 4 workspace types (`focus`, `lab`, `command`, `terminal`) with significant layout branching in the render method (lines 100-189). Each workspace type also layers a background image from `/assets/images/`.

**Recommendation:** Extract workspace layouts into separate components (`FocusWorkspace`, `LabWorkspace`, etc.) to reduce the cognitive complexity of UnifiedModulePage.

### 5.4 ModuleLayout Theme Colors Duplicated Across Multiple Components
The theme color mapping (`{ accent: 'text-{color}-400', glow: 'bg-{color}-500/10' }`) is independently defined in:
- `ModuleLayout.tsx` (10 colors)
- `NeuralModal.tsx` (5 colors — incomplete)
- `UnifiedAuthModal.tsx` (10 colors)
- `GuidedIntakeFrame.tsx` (10 colors)
- `ChatInterface.tsx` (3 colors)

**Recommendation:** Extract a single `getModuleThemeClasses(color: ModuleTheme)` utility function in `src/lib/` and import everywhere.

### 5.5 No Global Toast/Notification System
The application has:
- `NeuralLinkAlert` for inline chat errors
- `NeuralDraftPanel` for spine proposals
- `NexusRouteBanner` for routing suggestions

But no general-purpose toast/snackbar system for success confirmations, warnings, or transient notifications. When vault operations complete, profile saves succeed, or sessions end — there's no feedback mechanism beyond modal dialogs.

### 5.6 Atlas Page Calls Hooks Inside Render Callbacks
**File:** `src/modules/atlas/AtlasPage.tsx`, lines 52-59

```tsx
renderContent={({ profile, encryptionKey }) => {
  const { messages, setMessages, isProcessing, ... } = useModuleAI({ ... });
  useEffect(() => { ... }, [...]);
  useSpineEvent('BURNOUT_WARNING', ...);
```

React hooks are called inside the `renderContent` callback, which is a render prop. While this works because the callback is called during render (not conditionally), it violates the "hooks at the top level of a component" convention and can confuse linters and developers. Trainer and Therapy pages correctly extract this into a named sub-component (`TrainerContent`, `TherapyContent`).

---

## 6. Prioritized Recommendations

### P0 — Must Fix (Accessibility Blockers)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 1 | **Add focus trap + keyboard dismiss to modals** | `NeuralModal.tsx`, `UnifiedAuthModal.tsx` | Medium |
| 2 | **Connect labels to inputs with htmlFor/id** | `NeuralInput.tsx` | Low |
| 3 | **Add aria-live region for chat messages** | `ChatInterface.tsx` | Low |
| 4 | **Add role="dialog", aria-modal, aria-label to modals** | `NeuralModal.tsx`, `UnifiedAuthModal.tsx` | Low |
| 5 | **Add form error announcements** | `UnifiedAuthModal.tsx`, all forms | Low |
| 6 | **Increase NeuralButton min text size to 12px (sm) / 14px (md)** | `NeuralButton.tsx` | Low |
| 7 | **Add `reducedMotion="user"` to MotionConfig at App root** | `App.tsx` | Low |

### P1 — High Priority (Mobile & Design System)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 8 | **Show module title on mobile** | `ModuleLayout.tsx` | Low |
| 9 | **Make Trainer chat panel responsive (collapse below lg)** | `TrainerPage.tsx` | Medium |
| 10 | **Make NeuralDraftPanel responsive** | `NeuralDraftPanel.tsx` | Low |
| 11 | **Load Inter font and add to body font stack** | `index.html`, `index.css` | Low |
| 12 | **Fix components.json CSS path** | `components.json` | Trivial |
| 13 | **Fix ModuleLayout void color to #020205** | `ModuleLayout.tsx` | Trivial |
| 14 | **Remove light mode fallback from index.html** | `index.html` | Trivial |
| 15 | **Extend ChatInterface theme to all 10 module colors** | `ChatInterface.tsx`, `NexusChat.tsx` | Medium |
| 16 | **Make NeuralInput focus ring module-aware** | `NeuralInput.tsx` | Low |

### P2 — Medium Priority (Polish & Architecture)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 17 | **Extract theme color utility** | New file `src/lib/theme-utils.ts` | Medium |
| 18 | **Consolidate GlassCard + SurfaceCard** | `GlassCard.tsx`, `SurfaceCard.tsx` | Medium |
| 19 | **Add hover state to GlassCard** | `GlassCard.tsx` | Low |
| 20 | **Add footer slot to NeuralModal** | `NeuralModal.tsx` | Low |
| 21 | **Extract Atlas hooks into named component** | `AtlasPage.tsx` | Low |
| 22 | **Add global toast system** | New component | Medium |
| 23 | **Add skip button to SyncTransition** | `SyncTransition.tsx` | Low |
| 24 | **Make NeuralButton sizes match design system** | `NeuralButton.tsx` | Low |
| 25 | **Increase color contrast for secondary text to white/70 minimum** | Global | Medium |

### P3 — Nice to Have (Design System Completeness)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 26 | **Implement nerve endings** | New component | High |
| 27 | **Add NeuralInput error state support** | `NeuralInput.tsx` | Low |
| 28 | **Landing page: showcase all 10 agents** | `LandingPage.tsx` | Medium |
| 29 | **Fix Ledger description consistency** | `LandingPage.tsx`, `DESIGN_SYSTEM.md` | Trivial |
| 30 | **Unify orange chat bubble style** | `ChatInterface.tsx` | Low |
| 31 | **Module-aware BootLoader theme** | `BootLoader.tsx` | Low |
| 32 | **Extract workspace layouts from UnifiedModulePage** | `UnifiedModulePage.tsx` | Medium |

---

## 7. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Design System Fidelity** | 6/10 | Colors and layout structure are strong; typography, sizing, and component specs diverge significantly |
| **Accessibility** | 3/10 | `prefers-reduced-motion` CSS is good; nearly everything else (focus management, ARIA, contrast, keyboard nav) needs work |
| **Mobile Responsiveness** | 4/10 | Core layout adapts, but critical flows (Trainer, module titles, draft panel) break on small screens |
| **Animation Quality** | 7/10 | Purposeful, performant use of Framer Motion; good vendor chunking; lacks reduced-motion JS support |
| **Visual Consistency** | 7/10 | Strong glass-morphism aesthetic; consistent dark-first design; some component-level inconsistencies |
| **Component API Design** | 7/10 | Well-typed props, good abstractions (UnifiedModulePage, NexusChat); some loose typing and theme limitations |
| **Cross-cutting Patterns** | 6/10 | Good loading/empty states; missing toast system; good error boundary; no form validation UX beyond inline |

---

## 8. What's Done Well

1. **Modular Architecture:** `UnifiedModulePage` elegantly abstracts the module lifecycle (loading → guest gate → onboarding → content). All modules consistently use this pattern.

2. **Design Token Centralization:** CSS custom properties in `index.css` match the documented values. The `module-manifest.ts` is a single source of truth for module metadata.

3. **Chunking Strategy:** `vite.config.ts` manual chunks split Three.js, Firebase, Framer Motion, Markdown, Router, React, Lucide, and Radix into separate vendor bundles — excellent for caching.

4. **Loading & Empty States:** `EmptyState`, `Skeleton`, and `StatCard` (with `isLoading`/`isEmpty`/`isLocked` props) create consistent placeholder patterns across all dashboards.

5. **Cross-Module Communication:** The SpineEventBus → NeuralDraftPanel → NexusRouteBanner pipeline is well-architected for real-time cross-module proposals and routing.

6. **Dark-Only Commitment:** No light-mode code paths exist in React components. ThemeProvider correctly locks to `'dark'`.

7. **Lazy Loading:** All route-level pages use `React.lazy()` with a consistent `BootLoader` fallback.

8. **Test Coverage Foundation:** Core components (`GlassCard`, `EmptyState`, `ProtectedRoute`) have unit tests with Vitest.
