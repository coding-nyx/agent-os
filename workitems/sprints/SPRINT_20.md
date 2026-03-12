# Sprint 20 — Mobile-First Polish & Re-render Isolation

**Status:** Planning  
**Seeded:** 2026-03-12  
**Focus:** Two interlocked concerns: (1) eliminate unnecessary re-renders that cause UI jank, input focus loss, and modal closures; (2) make every surface genuinely mobile-first.

---

## Background & Audit Findings

A full codebase audit was performed across all module pages, core layout, shared components, and data subscription hooks. Two root-cause families were identified.

### Family A — Re-render Cascade from Data Subscriptions

Every Firestore subscription currently creates a new JS object on each write and passes it directly to `setState`. Without equality guards, this triggers a React re-render of every component subscribed to that context or store, **including open modals, active text inputs, and streaming chat windows**.

**Identified hot paths (in order of blast radius):**

| # | Location | Trigger | Blast Radius |
|---|---|---|---|
| A1 | `global-soul-context.tsx:97-115` | `subscribeToDocument('global_souls')` fires `setGlobalSoul(newObj)` on every NSV write | Entire app — GlobalSoulProvider wraps everything |
| A2 | `use-module-profile.ts:84-98` | `subscribeProfile` calls `setProfile(nextProfile)` on every module Firestore write | All children of active `UnifiedModulePage` |
| A3 | `auth-context.tsx:78-115` | Profile subscription fires `setProfile(p)` without equality check | Entire AuthContext subtree |
| A4 | `use-module-profile.ts:40-44` | `useSpineEvent('MODULE_PROFILE_UPDATED')` → `setRefreshNonce(n+1)` → re-inits full subscription | Subscription teardown + remount during active session |
| A5 | `global-soul-context.tsx:131,154` | `enhanceContext`/`enhanceContextForModule` useCallback deps include `globalSoul` — recreated on every NSV tick | All AI hooks holding reference to these functions |
| A6 | `ModuleLayout.tsx:40-79` | `TelemetryTicker` setInterval `setLog` every 3s | Isolated (own component), low severity |

**Consequence of A1 (most critical):** When Atlas saves a task, or Titan logs a workout, the AI writes to `global_souls`. This fires the `subscribeToDocument` listener, calls `setGlobalSoul` with a new object reference → Zustand sees a change → every module page, modal, and input field that reads from `useGlobalSoul()` re-renders. Open NeuralModals close. Chat inputs lose focus. Form state resets.

### Family B — Mobile UX Deficiencies

| # | Location | Issue |
|---|---|---|
| B1 | `ModuleLayout.tsx:166` | `h-screen` doesn't account for mobile browser chrome → content clipped or overflows |
| B2 | `GlobalFAB.tsx`, `NexusOverlay.tsx`, `ModuleLayout.tsx` header | No `safe-area-inset` padding → elements hidden behind iPhone notch / home indicator |
| B3 | `ChatInterface.tsx:635` | `text-sm` (14px) on textarea below `sm` breakpoint → iOS zooms viewport on focus |
| B4 | `ChatInterface.tsx:628-638` | `textarea` missing `inputMode="text"` and `enterKeyHint="send"` → wrong mobile keyboard |
| B5 | Multiple | Touch targets under 44×44px: Security Protocol button, Clear Session button, modal close X, many icon buttons |
| B6 | `NeuralModal.tsx:76` | `max-h-[calc(100vh-2rem)]` — modal clips behind keyboard on mobile; static `100vh` doesn't account for keyboard height |
| B7 | `GlobalFAB.tsx` | Hover-expand label uses `onHoverStart`/`onHoverEnd` — never triggers on touch; mobile users can't see "Consult Nexus" |
| B8 | Multiple containers | `overflow-y-auto` without `overscroll-contain` — scroll chains to body on iOS (bouncy background) |
| B9 | `ChatInterface.tsx:387` | Message list keyed by array index `key={i}` — forces remount of all messages below any insert |
| B10 | `ChatInterface.tsx:421,441` | `new Date().toLocaleTimeString()` called inline in render — regenerates on every re-render; timestamps change |
| B11 | `ModuleLayout.tsx:187` | Sticky header has no `padding-top: env(safe-area-inset-top)` for notch devices |
| B12 | `SingleAgentLayout.tsx` mobile overlay | `fixed inset-0` chat overlay doesn't apply `safe-area-inset-bottom/top` |
| B13 | Multiple | `backdrop-blur-xl` on many simultaneously-rendered elements causes GPU overload on mid-range mobile; should be `backdrop-blur-md` in non-critical panels |

---

## Sprint Items

### P0 — Re-render Isolation (Ship-Blocker)

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-001 | GlobalSoul subscription — deep equality guard before `setGlobalSoul` | `global-soul-context.tsx` | Pending |
| S20-002 | Module profile subscription — equality guard before `setProfile` | `use-module-profile.ts` | Pending |
| S20-003 | AuthContext — equality guard before `setProfile` | `auth-context.tsx` | Pending |
| S20-004 | `MODULE_PROFILE_UPDATED` Spine event — fetch-and-merge instead of nonce re-init | `use-module-profile.ts` | Pending |
| S20-005 | Granular GlobalSoul selectors — expose field-level Zustand selectors to prevent full-store re-renders | `global-soul-context.tsx`, `ui-store.ts` | Pending |

### P0 — Mobile Viewport & Safe Area

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-006 | Replace `h-screen`/`100vh` with `h-[100dvh]` throughout | `ModuleLayout.tsx`, `index.css`, module pages | Pending |
| S20-007 | Safe-area-inset for all fixed/sticky UI | `GlobalFAB.tsx`, `ModuleLayout.tsx` header, `NexusOverlay.tsx`, `SingleAgentLayout.tsx` mobile overlay | Pending |

### P1 — Chat Input Mobile

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-008 | Fix textarea font-size → 16px minimum (iOS zoom prevention) | `ChatInterface.tsx` | Pending |
| S20-009 | Add `inputMode="text"` + `enterKeyHint="send"` to chat textarea | `ChatInterface.tsx` | Pending |
| S20-010 | Audit all module form inputs for `inputMode` / `type` / `enterKeyHint` | `QuickLogBar.tsx`, `NeuralInput.tsx`, onboarding forms | Pending |

### P1 — Touch Targets

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-011 | Enforce min 44×44px on all interactive elements (audit pass) | `ModuleLayout.tsx`, `ChatInterface.tsx`, `NeuralModal.tsx`, `GlobalFAB.tsx`, all module headers | Pending |
| S20-012 | GlobalFAB — replace hover-expand with tap-to-expand label on mobile | `GlobalFAB.tsx` | Pending |

### P1 — Modal & Overlay Mobile Fixes

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-013 | NeuralModal — use `100dvh`, `overscroll-contain`, keyboard-aware layout | `NeuralModal.tsx` | Pending |
| S20-014 | Fix scroll chaining on iOS — add `overscroll-contain` to all overflow containers | `ChatInterface.tsx`, `NexusOverlay.tsx`, `SingleAgentLayout.tsx`, module tab panels | Pending |

### P2 — Rendering Correctness

| ID | Title | File(s) | Status |
|---|---|---|---|
| S20-015 | Message list — use stable message IDs as keys, not array index | `ChatInterface.tsx` | Pending |
| S20-016 | Message timestamps — capture at message-receive time, not render time | `ChatInterface.tsx` | Pending |
| S20-017 | Reduce `backdrop-blur-xl` stacking on mobile — audit and downgrade non-critical | `ModuleLayout.tsx`, `GlobalFAB.tsx`, `NexusOverlay.tsx` | Pending |

---

## Implementation Notes

### S20-001 — How to implement GlobalSoul equality guard

```ts
// In global-soul-context.tsx subscribeToDocument callback:
import { isEqual } from 'lodash-es'; // or fast-deep-equal

(record) => {
  if (!record) { setGlobalSoul(null); setIsLoading(false); return; }
  const next = { ...record, crossFunctionalState: normalizeNSV(record.crossFunctionalState) };
  setGlobalSoul(prev => isEqual(prev, next) ? prev : next);  // skip if unchanged
  setIsLoading(false);
}
```

If lodash is too heavy, use `fast-deep-equal` (600b gzip) or a custom NSV field diff.

### S20-002 — Module profile equality guard

```ts
// In use-module-profile.ts subscribeProfile callback:
const unsub = subscribeProfileRef.current({ ... }, (nextProfile) => {
  if (!mounted) return;
  setProfile(prev => isEqual(prev, nextProfile) ? prev : nextProfile); // skip if unchanged
  ...
});
```

### S20-004 — MODULE_PROFILE_UPDATED fetch-and-merge

Instead of `setRefreshNonce(n+1)` (which re-runs the full init effect and tears down the subscription), perform a one-shot re-fetch and merge:

```ts
useSpineEvent('MODULE_PROFILE_UPDATED', useCallback(async (event) => {
  if (event.data?.moduleId !== moduleId) return;
  const key = isUnlocked ? await getModuleKey(moduleId) : null;
  const fresh = await refreshProfileRef.current({ userId: user.uid, encryptionKey: key });
  if (fresh) setProfile(prev => isEqual(prev, fresh) ? prev : fresh);
}, [moduleId, isUnlocked, getModuleKey, user?.uid]));
```

### S20-005 — Granular GlobalSoul selectors

Add per-domain selectors so only components that care about e.g. `biological.*` re-render when biological NSV changes:

```ts
// New hooks in global-soul-context.tsx:
export const useGlobalSoulBiological = () => useGlobalSoulStore(s => s.globalSoul?.crossFunctionalState?.biological);
export const useGlobalSoulCognitive = () => useGlobalSoulStore(s => s.globalSoul?.crossFunctionalState?.cognitive);
export const useGlobalSoulPlanning = () => useGlobalSoulStore(s => s.globalSoul?.crossFunctionalState?.planning);
export const useGlobalSoulResource = () => useGlobalSoulStore(s => s.globalSoul?.crossFunctionalState?.resource);
export const useGlobalSoulEmotional = () => useGlobalSoulStore(s => s.globalSoul?.crossFunctionalState?.emotional);
```

With Zustand, these selectors only trigger re-renders when their specific slice changes.

### S20-006 — dvh

```css
/* index.css or tailwind theme extension */
.h-dvh { height: 100dvh; }
/* ModuleLayout: change h-screen → h-dvh */
```

Or add `100dvh` to Tailwind config:
```js
// tailwind.config.ts
extend: { height: { dvh: '100dvh', svh: '100svh' } }
```

### S20-007 — Safe area insets

```tsx
// GlobalFAB anchor:
style={{ bottom: `calc(${fabBottom}px + env(safe-area-inset-bottom, 0px))` }}

// ModuleLayout header:
className="sticky top-0 pt-[env(safe-area-inset-top,0px)] ..."

// NexusOverlay slide-in panel:
className="fixed inset-y-0 right-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] ..."
```

### S20-008 — Textarea font size

```tsx
// ChatInterface.tsx
className="... text-base ..."  // was: text-sm sm:text-base (14px below sm = iOS zoom)
```

### S20-013 — NeuralModal keyboard-aware

```tsx
// NeuralModal.tsx
className="fixed inset-0 z-[modal] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
// Inner content:
className="... max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-2rem)] rounded-b-none sm:rounded-modal ..."
```

On mobile, modals slide up from bottom (sheet pattern) instead of center-scaling.

---

## Dependencies

- S20-005 can be started after S20-001 (needs the store to be stable first)
- S20-012 can be combined with S20-007 in the same PR (same file)
- S20-013 and S20-014 are independent
- All P0 items should ship together as a single "stability" release before P1/P2

---

## PM Audit Log

| Task ID | Description | Status | Completed |
|---------|-------------|--------|-----------|
| pm-audit | Titan & Atlas vendor-readiness audit — cross-module wiring, LLM completeness, Spine/NSV, validation authority, bloat | ✅ Done | 2025-07-16 |
| atlas-pm-audit | Atlas module deep-dive vendor-readiness audit — 21 files, 25 components, feature completeness map, 4 CRITICAL / 5 HIGH / 7 MEDIUM gaps, Sprint 18 execution plan | ✅ Done | 2025-07-17 |

Full audit output:
- Combined Titan+Atlas: [`/workitems/AUDIT-TITAN-ATLAS-VENDOR-READINESS.md`](../AUDIT-TITAN-ATLAS-VENDOR-READINESS.md)
- Atlas deep-dive: [`/workitems/AUDIT-ATLAS-DEEP-DIVE.md`](../AUDIT-ATLAS-DEEP-DIVE.md)

---

## Out of Scope (Backlog)

- Full streaming isolation (move `streamingText` into a Zustand atom so only the chat component re-renders during streaming) — deferred to S21
- Virtual list for chat messages (only relevant at 500+ message threads) — deferred to S21
- Service Worker / offline PWA shell — deferred
- Haptic feedback on mobile actions — deferred
