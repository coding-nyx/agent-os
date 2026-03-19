# Spine Indicator Line System — Audit & Design Spec

**Status:** Pre-implementation spec — no code has been changed  
**Files in scope:** `SpineOverlay.tsx`, `ChatInterface.tsx`, `App.tsx`, `SingleAgentLayout.tsx`  
**Author:** UI/UX Architect (Nexus)  
**Sprint:** Post-17 / Spine Positioning Pass

---

## 1. Audit Findings

### 1.1 SpineOverlay.tsx — Positioning Logic

#### Split Layout — `calc(clamp(320px, 32vw, 520px) + 24px)`

The math is geometrically correct but has two embedded bugs:

| Viewport | Sidebar width (32vw clamped) | Spine center from right | Spine x from left | Content right edge | Gap |
|---|---|---|---|---|---|
| 1024px | 327.7px | 355.7px | 668.3px | 696.3px | ✅ 28px inside content |
| 1440px | 460.8px | 488.8px | 951.2px | 979.2px | ✅ 28px inside content |
| 1700px | 520px (clamped) | 548px | 1152px | 1180px | ✅ 28px inside content |

The spine consistently lands 28px inside the content area from the sidebar's left edge. The collapse handle button (`w-6`, centered on sidebar left border, projecting 12px into content) has a safe 12px clearance from the spine. **The absolute pixel math is correct.**

**Bug A — Framer Motion cannot interpolate `calc(clamp())` ↔ `rem` strings.**  
Line 48: `animate={{ right: rightOffset }}` where `rightOffset` is either
`'calc(clamp(320px, 32vw, 520px) + 24px)'` or `'2.5rem'`. Framer Motion treats
these as opaque strings and **snaps** between them instead of tweening. The
`spring` transition on `right` is silently a no-op for these values — the line
jumps position when the sidebar opens or collapses.

**Bug B — hardcoded sidebar width.**  
The `clamp(320px, 32vw, 520px)` is duplicated from `SingleAgentLayout.tsx`
line 51 (the `chatWidth` default). If any module passes a non-default
`chatWidth` (e.g., a wider financial panel), the spine drifts off-position.
There is no shared constant or CSS variable bridging the two.

**Bug C — `2.5rem` (40px) for non-split layout is arbitrary.**  
When the sidebar is collapsed, the line sits 40px from the viewport right edge.
At 1024px viewport this is fine, but at 320–768px (where the component is still
`hidden`) it is moot. For intermediate tablets (768–1023px) that never see
`lg:flex`, no spine appears at all.

---

#### Non-Split Layout — `right: 2.5rem`

The value resolves to 40px. This is acceptable but slightly too far from a
conventional scrollbar zone (usually 15–17px). Reducing to `1.5rem` (24px)
keeps the spine outside typical scrollbar overlap while appearing crisper
against the right chrome. No other issues.

---

### 1.2 Mobile Breakpoint (< 1024px) — Complete Gap

```tsx
// SpineOverlay.tsx line 47
className="fixed inset-y-0 z-[var(--z-overlay)] pointer-events-none hidden lg:flex items-center"
```

The `hidden lg:flex` completely removes spine feedback on all mobile and tablet
viewports. During a mobile chat session (the full-screen portal overlay in
`SingleAgentLayout.tsx` lines 261–316), Spine events fire normally but have
zero visual representation. Users receive no sense of background agent activity
on the most common device class.

---

### 1.3 ChatInterface.tsx — Bubble Spine Inconsistency

Themes object (lines 62–143):

```
orange  → bubble: '...rounded-none border-l-2 border-orange-500/30'
          userBubble: '...rounded-none border-r-2 border-white/20'
ALL others → bubble: '...rounded-2xl rounded-tl-sm'  (no spine border)
             userBubble: '...rounded-2xl rounded-tr-sm' (no spine border)
```

Orange is the only theme with `rounded-none` **and** explicit left/right
border-spine lines. This is a one-off design decision that breaks system
uniformity in two ways:

1. The `rounded-none` on orange makes bubbles look sharp/angular while every
   other theme uses `rounded-2xl` — a jarring inconsistency in a glassmorphic UI.
2. The `border-l-2`/`border-r-2` spine concept is sound and connects to the
   spine system's identity, but applying it only to orange means no other module
   has this visual signal.

**Root cause:** Orange (Agnes — the primary agent) likely received this treatment
as a one-off design choice. It was never propagated to the system.

---

### 1.4 App.tsx — Mount Point

```tsx
// App.tsx line 90
<SpineOverlay />
```

The component receives no props — it is entirely self-contained via the
`useActiveLayout()` store. This is the correct architecture. No issues here,
but the store dependency creates the tight coupling to the hardcoded sidebar
width noted in Bug B above.

---

## 2. Proposed Fixes

### Fix 1 — Resolve Framer Motion Animation Bug (SpineOverlay.tsx)

**Problem:** `animate={{ right: 'calc(...)' }}` can't spring-tween.

**Solution:** Separate the right-position CSS from Framer Motion entirely.
Use a native CSS `transition` on `right`, driven by a class swap or inline style.
Framer Motion retains control of `opacity` and scale effects only.

```tsx
// SpineOverlay.tsx — REPLACE lines 43–49

// Compute rightOffset identically to before, but apply via style + CSS transition
const rightOffset =
  activeLayout === 'split'
    ? 'calc(var(--spine-sidebar-width, clamp(320px, 32vw, 520px)) + 24px)'
    : '1.5rem';   // ← tightened from 2.5rem → 1.5rem

return (
  <motion.div
    className="fixed inset-y-0 z-[var(--z-overlay)] pointer-events-none hidden lg:flex items-center"
    style={{ right: rightOffset, transition: 'right 0.45s cubic-bezier(0.32, 0, 0.67, 0)' }}
    animate={{ opacity: isHub ? 0 : 1 }}   // ← only opacity in Framer now
    transition={{ duration: 0.4 }}
  >
```

The `transition: right 0.45s` lets the browser resolve and interpolate the
`calc()` values natively. The easing `cubic-bezier(0.32, 0, 0.67, 0)` matches
the sidebar spring's deceleration profile so they visually track together.

---

### Fix 2 — Share Sidebar Width via CSS Custom Property (SingleAgentLayout.tsx)

**Problem:** The spine hardcodes `clamp(320px, 32vw, 520px)` — no single source
of truth.

**Solution:** Write the resolved width as a CSS custom property on the layout
root, which SpineOverlay reads via `var(--spine-sidebar-width)`.

```tsx
// SingleAgentLayout.tsx — REPLACE line 140

return (
  <div
    className="h-full flex overflow-hidden relative"
    style={{ '--spine-sidebar-width': isChatCollapsed ? '0px' : chatWidth } as React.CSSProperties}
  >
```

Now SpineOverlay references `var(--spine-sidebar-width, clamp(320px, 32vw, 520px))`
(the fallback handles pages that don't use SingleAgentLayout). When the sidebar
collapses, the CSS var becomes `0px` and the spine smoothly transitions to
`calc(0px + 24px)` = 24px from right — which gracefully matches the
`'1.5rem'` full-mode fallback. If the gap is visible between the two values at
collapse, clamp the minimum:

```tsx
// SpineOverlay.tsx — rightOffset computation (updated)
const rightOffset =
  activeLayout === 'split'
    ? 'calc(var(--spine-sidebar-width, clamp(320px, 32vw, 520px)) + 24px)'
    : '1.5rem';
```

---

### Fix 3 — Mobile Spine Micro-Indicator

**Problem:** Zero spine feedback on mobile.

**Design decision:** Do NOT add a vertical line on mobile — there is no
persistent chrome edge to anchor it to, and the full-screen chat overlay
already uses the full viewport. Instead, add a **horizontal pulse bar** pinned
to the TOP of the mobile chat overlay header, matching the header's theme color.

This lives inside `SingleAgentLayout.tsx` in the mobile overlay header
(lines 272–292) — not inside SpineOverlay — because the SpineOverlay
architecture is desktop-only and adding a mobile path there risks scope creep.

#### New component: `SpineMobileBar`

```tsx
// NEW FILE: src/core/components/SpineMobileBar.tsx

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';

const DOMAIN_COLORS: Record<SpineEvent['domain'], string> = {
  B: '#34d399',   // emerald-400
  E: '#818cf8',   // indigo-400
  C: '#38bdf8',   // sky-400
  R: '#22d3ee',   // cyan-400
  system: '#a78bfa' // violet-400
};

interface SpineMobileBarProps {
  /** Pass the module's accent hex so the bar blends with the chat theme */
  accentColor?: string;
}

export function SpineMobileBar({ accentColor }: SpineMobileBarProps) {
  const [lastPulse, setLastPulse] = useState<SpineEvent | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    return Spine.on('*', (event) => {
      setLastPulse(event);
      setActive(true);
      const t = window.setTimeout(() => setActive(false), 1800);
      return () => window.clearTimeout(t);
    });
  }, []);

  const color = lastPulse
    ? DOMAIN_COLORS[lastPulse.domain] ?? accentColor ?? '#ffffff40'
    : accentColor ?? '#ffffff20';

  return (
    // Sits in the chat overlay header row — absolute, full width, 2px tall, bottom of header
    <AnimatePresence>
      {active && (
        <motion.div
          key="spine-bar"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ scaleX: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-[2px] origin-left pointer-events-none"
          style={{ background: `linear-gradient(to right, ${color}40, ${color}, ${color}40)` }}
        />
      )}
    </AnimatePresence>
  );
}
```

#### Integration — SingleAgentLayout.tsx mobile overlay header

```tsx
// SingleAgentLayout.tsx — UPDATE lines 272–292

// Add import at top:
// import { SpineMobileBar } from '@/core/components/SpineMobileBar';

// THEME_ACCENT_HEX map (add near themeClasses definition ~line 119):
const THEME_ACCENT_HEX: Record<NeuralThemeColor, string> = {
  lime: '#a3e635', sky: '#38bdf8', orange: '#fb923c', cyan: '#22d3ee',
  purple: '#c084fc', rose: '#fb7185', amber: '#fbbf24', indigo: '#818cf8',
  emerald: '#34d399', white: '#ffffff'
};

// Replace the mobile header div (lines 272–292):
<div
  className={cn(
    "relative flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b",
    currentTheme.sidebarBorder
  )}
>
  {/* Spine pulse bar — 2px line at the bottom of the header */}
  <SpineMobileBar accentColor={THEME_ACCENT_HEX[themeColor]} />

  <div className="flex items-center gap-3">
    <div className={cn("w-2 h-2 rounded-full animate-pulse",
      themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
    )} />
    <span className={cn("font-bold text-xs uppercase tracking-[0.12em] font-display", currentTheme.btnText)}>
      {agentName} Resonance
    </span>
  </div>
  <button
    onClick={() => toggleChat(true)}
    className={cn(
      "p-2 rounded-xl border transition-all",
      currentTheme.btnBg, currentTheme.btnBorder, currentTheme.btnText
    )}
    aria-label="Close chat"
  >
    <X size={18} />
  </button>
</div>
```

**UX rationale:** The 2px bar sweeps left-to-right on each Spine event. It's
unobtrusive, uses zero vertical space, and anchors to an already-visible
element rather than floating freely. The `origin-left` scaleX animation implies
"signal received" without the metaphor of a vertical column (which has no
spatial meaning on a full-screen modal). `aria-hidden="true"` keeps it out of
screen-reader trees.

---

### Fix 4 — Narrow Viewport Repositioning (768–1023px)

On tablets, the spine is `hidden`. There is no good home for the vertical
desktop spine at this width. The sidebar doesn't exist in desktop split mode —
the chat is always an overlay. Apply the `SpineMobileBar` solution from Fix 3
here too: since `SingleAgentLayout` already uses the same mobile-portal path
for `window.innerWidth < mobileBreakpoint` (default 1024px), tablets already
get the mobile overlay and thus get the `SpineMobileBar` automatically.
No additional work needed for 768–1023px.

If a future module sets `mobileBreakpoint={768}`, it would show the desktop
spine at 768–1023px with the split layout. In that case Fix 1 and Fix 2
together ensure the spine is correctly positioned.

---

### Fix 5 — Chat Bubble Spine Consistency (ChatInterface.tsx)

**Decision:** Apply a subtle, unified left spine line to ALL AI bubble themes.
**Remove** the `rounded-none` from orange (it breaks the glassmorphic language
of the system). Keep the border-l concept but unify it.

**Design:** Each theme gets `border-l-[1.5px]` in the theme's accent color at
20% opacity. User bubbles get no border-spine (user speech has no "system
spine" quality). Orange retains its thematic left border but returns to rounded.

```tsx
// ChatInterface.tsx — REPLACE the entire THEMES object (lines 62–143)

const THEMES = {
  indigo: {
    bubble: 'bg-white/[0.03] border-white/5 text-indigo-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-indigo-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-indigo-400',
    glow: 'shadow-xl shadow-indigo-500/10',
    bgGlow: 'bg-indigo-500/30',
    btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
  },
  orange: {
    // Keep orange's spine stronger (it was the original intentional design)
    // but restore rounded corners for glassmorphic consistency
    bubble: 'bg-white/[0.03] border-white/5 text-orange-50 rounded-2xl rounded-tl-sm border-l-2 border-l-orange-500/30',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-orange-400',
    glow: 'shadow-xl shadow-orange-500/10',
    bgGlow: 'bg-orange-500/30',
    btn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20'
  },
  cyan: {
    bubble: 'bg-white/[0.03] border-white/5 text-cyan-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-cyan-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-cyan-400',
    glow: 'shadow-xl shadow-cyan-500/10',
    bgGlow: 'bg-cyan-500/30',
    btn: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20'
  },
  violet: {
    bubble: 'bg-white/[0.03] border-white/5 text-violet-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-violet-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-violet-400',
    glow: 'shadow-xl shadow-violet-500/10',
    bgGlow: 'bg-violet-500/30',
    btn: 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20'
  },
  emerald: {
    bubble: 'bg-white/[0.03] border-white/5 text-emerald-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-emerald-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-emerald-400',
    glow: 'shadow-xl shadow-emerald-500/10',
    bgGlow: 'bg-emerald-500/30',
    btn: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
  },
  sky: {
    bubble: 'bg-white/[0.03] border-white/5 text-sky-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-sky-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-sky-400',
    glow: 'shadow-xl shadow-sky-500/10',
    bgGlow: 'bg-sky-500/30',
    btn: 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
  },
  lime: {
    bubble: 'bg-white/[0.03] border-white/5 text-lime-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-lime-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-lime-400',
    glow: 'shadow-xl shadow-lime-500/10',
    bgGlow: 'bg-lime-500/30',
    btn: 'bg-lime-600 hover:bg-lime-500 shadow-lime-500/20'
  },
  rose: {
    bubble: 'bg-white/[0.03] border-white/5 text-rose-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-rose-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-rose-400',
    glow: 'shadow-xl shadow-rose-500/10',
    bgGlow: 'bg-rose-500/30',
    btn: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
  },
  fuchsia: {
    bubble: 'bg-white/[0.03] border-white/5 text-fuchsia-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-fuchsia-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-fuchsia-400',
    glow: 'shadow-xl shadow-fuchsia-500/10',
    bgGlow: 'bg-fuchsia-500/30',
    btn: 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-500/20'
  },
  slate: {
    bubble: 'bg-white/[0.03] border-white/5 text-slate-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-slate-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-slate-400',
    glow: 'shadow-xl shadow-slate-500/10',
    bgGlow: 'bg-slate-500/30',
    btn: 'bg-slate-600 hover:bg-slate-500 shadow-slate-500/20'
  }
};
```

**Key changes:**
- Orange: `rounded-none` removed → `rounded-2xl rounded-tl-sm`. `border-l-2`
  retained (stronger spine, intentional design marker for the primary agent).
  `border-r-2` on `userBubble` removed — user bubbles should not have right
  spine borders in any theme.
- All others: `border-l-[1.5px] border-l-{color}/20` added. At 1.5px and 20%
  opacity this is a whisper-level marker — visible in context, invisible when
  not looking for it. WCAG contrast is not a concern here as it's decorative.
- `border-l-[1.5px]` requires Tailwind's arbitrary value syntax — this already
  works in all Tailwind v3+ setups with JIT.

---

### Fix 6 — Preference Toggle

#### Where it lives

**Option A — In-line on SpineOverlay itself (recommended):**
Show a ghost toggle button that appears when the user hovers the spine line.
Clicking it persists the `spineVisible` preference to `localStorage` and to the
`ui-store`. The button is visually a tiny circular icon (the `Activity` icon
from lucide) that appears to the left of the spine line.

This keeps the control contextual — the user discovers the toggle by
interacting with the element they want to control. It avoids polluting the
Profile settings page with low-priority UI chrome.

**Option B — Profile settings page:**
A single toggle row in the Appearance section. Lower discoverability but
correct for users who want a "set and forget" preference.

**Recommendation:** Implement both — the in-line hover toggle is the primary
path; Profile settings carries the same state.

#### State management

```ts
// Add to src/lib/stores/ui-store.ts (alongside useActiveLayout)

// In the store slice:
spineVisible: localStorage.getItem('spineVisible') !== 'false',  // default ON
setSpineVisible: (v: boolean) => {
  localStorage.setItem('spineVisible', String(v));
  set({ spineVisible: v });
}

// Selector hooks:
export const useSpineVisible = () => useUIStore((s) => s.spineVisible);
export const useSetSpineVisible = () => useUIStore((s) => s.setSpineVisible);
```

#### SpineOverlay toggle button

```tsx
// SpineOverlay.tsx — add inside the h-[70vh] w-2 container,
// AFTER the AnimatePresence pulse block (after line 80)

// Add imports:
// import { Activity } from 'lucide-react';
// import { useSpineVisible, useSetSpineVisible } from '@/lib/stores/ui-store';

// In component body, add:
const spineVisible = useSpineVisible();
const setSpineVisible = useSetSpineVisible();
const [hovered, setHovered] = useState(false);

// Wrap the outer motion.div with pointer-events-auto on hover:
// Change className on line 47:
className="fixed inset-y-0 z-[var(--z-overlay)] pointer-events-none hidden lg:flex items-center group/spine"

// Add after the existing inner container (after line 81, before </motion.div>):
<button
  // Re-enable pointer events on just this button
  className={cn(
    "pointer-events-auto absolute -left-6 top-1/2 -translate-y-1/2",
    "w-5 h-5 rounded-full flex items-center justify-center",
    "border border-white/10 bg-black/40 backdrop-blur-sm",
    "opacity-0 group-hover/spine:opacity-100 transition-opacity duration-300",
    "focus:opacity-100 focus-visible:ring-1 focus-visible:ring-white/30"
  )}
  onClick={() => setSpineVisible(!spineVisible)}
  aria-label={spineVisible ? 'Hide spine indicator' : 'Show spine indicator'}
  title={spineVisible ? 'Hide spine indicator' : 'Show spine indicator'}
>
  <Activity
    className={cn(
      "w-2.5 h-2.5 transition-colors",
      spineVisible ? "text-white/40" : "text-white/15"
    )}
  />
</button>
```

Then gate the spine body on `spineVisible`:

```tsx
// SpineOverlay.tsx — wrap inner content (lines 51–81)

<div className="relative h-[70vh] w-2">
  {spineVisible && (
    <>
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2
                      bg-gradient-to-b from-white/5 via-white/20 to-white/5" />
      {spineTicks.map((tick) => (
        <div
          key={tick}
          className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white/10"
          style={{ top: `${(tick / (spineTicks.length - 1)) * 100}%` }}
        />
      ))}
      <AnimatePresence>
        {pulses.map((pulse, index) => {
          const color = DOMAIN_COLORS[pulse.domain] || 'bg-white/30';
          return (
            <motion.div
              key={pulse.uiId}
              initial={{ opacity: 0, scale: 0.5, y: 0 }}
              animate={{ opacity: 1, scale: 1.2, y: 0 }}
              exit={{ opacity: 0, scale: 2.2 }}
              className={`absolute left-1/2 -translate-x-1/2 rounded-full ${color}`}
              style={{
                width: 10 + index * 1.5,
                height: 10 + index * 1.5,
                top: `${20 + (index * 12) % 60}%`,
                boxShadow: '0 0 24px rgba(255,255,255,0.2)'
              }}
            />
          );
        })}
      </AnimatePresence>
    </>
  )}
  {/* Toggle button always visible on hover regardless of spineVisible state */}
  <button ... />
</div>
```

**Accessibility:** The toggle button is `pointer-events-auto` but the parent
container remains `pointer-events-none`, so no tap targets are accidentally
blocked by the overlay. The button has `aria-label` for screen readers, and
`focus-visible` ring for keyboard navigation.

---

## 3. Summary of All Changes

| File | Lines affected | Change |
|------|---------------|--------|
| `SpineOverlay.tsx` | 43, 47–49 | Move `right` out of Framer, use CSS transition; reference `--spine-sidebar-width` var; reduce non-split offset to `1.5rem` |
| `SpineOverlay.tsx` | 51–81 | Gate body on `spineVisible`; add toggle button |
| `SpineOverlay.tsx` | top | Add `useSpineVisible`, `useSetSpineVisible`, `Activity` imports |
| `SingleAgentLayout.tsx` | 140 | Set `--spine-sidebar-width` CSS var on layout root |
| `SingleAgentLayout.tsx` | ~119 | Add `THEME_ACCENT_HEX` map |
| `SingleAgentLayout.tsx` | 272–292 | Add `relative` to mobile header, mount `SpineMobileBar` |
| `ChatInterface.tsx` | 62–143 | Unify THEMES — add `border-l-[1.5px]` to all AI bubbles; remove `rounded-none` from orange; remove `border-r-2` from orange userBubble |
| `src/lib/stores/ui-store.ts` | TBD | Add `spineVisible` + `setSpineVisible` |
| `src/core/components/SpineMobileBar.tsx` | NEW | Mobile horizontal pulse bar component |

---

## 4. What Is NOT Changed

- `App.tsx` — no changes required; mount point is correct
- SpineOverlay's `inset-y-0` / `h-[70vh]` sizing — correct as-is
- Tick interval positions (0/20/40/60/80/100%) — correct
- Pulse stacking logic (`slice(0, 8)`, 2400ms decay) — correct
- Hub route hiding — correct (`isHub` opacity: 0)
- Mobile breakpoint value (1024px) — matches `mobileBreakpoint` default

---

## 5. Visual Diff Summary

```
BEFORE                               AFTER
─────────────────────────────────────────────────────────────────────
SpineOverlay right (split):          same calc, CSS-transitioned (not snapped)
SpineOverlay right (full):   2.5rem  → 1.5rem  (tighter to chrome edge)
SpineOverlay sidebar width:  hardcoded clamp → CSS var (single source of truth)
Mobile spine:                none    → 2px sweep bar in chat header
Bubble border (orange):      rounded-none + border-l-2 + border-r-2
                                     → rounded-2xl + border-l-2 (no border-r)
Bubble border (others):      none    → border-l-[1.5px] at 20% opacity
Spine toggle:                none    → hover ghost button on overlay
                                       + spineVisible state in ui-store
```
