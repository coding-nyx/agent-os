# Nexus Debug Mode — Reference Documentation

> **Audience:** AI agents and contributors modifying action handlers, Spine events, debug UI, or profile settings.  
> **Rule of thumb:** If you touch anything listed below, read the relevant section first.

---

## 1. Overview

Debug mode is **off by default** and persists across sessions via `localStorage` key `nexus_debug_mode`.

| Mode | `console.log` / `.debug` / `.info` | `console.warn` / `.error` |
|------|-------------------------------------|---------------------------|
| OFF  | **Silenced**                        | Always pass through        |
| ON   | Printed normally                    | Always pass through        |

The silencing is applied globally at boot (see §2 — `NexusLogger.init`). No component or module should attempt to re-enable raw `console.*` calls — use `NexusLogger` instead.

---

## 2. NexusLogger API

**File:** `src/lib/nexus-logger.ts`

### Lifecycle

```ts
NexusLogger.init(debugMode: boolean): void
```
- Call **once**, in `main.tsx`, **before** React mounts.
- Applies the global console silencing patch when `debugMode` is `false`.
- Reading `localStorage.getItem('nexus_debug_mode')` and passing the result is the caller's responsibility.

```ts
NexusLogger.setDebugMode(value: boolean): void
```
- Called by `useDebugMode` on every toggle — do not call this directly elsewhere.
- Re-applies or removes the console patch without a page reload.

### Structured Logging

```ts
NexusLogger.action(moduleId: string, type: string, payload: unknown): void
```
- Call **after every ActionHub handler** completes successfully.
- Pushes a timestamped record into the internal `actions` ring buffer.
- No-op when debug mode is off.

```ts
NexusLogger.spine(eventType: string, source: string, data: unknown): void
```
- Call **after every `Spine.emit()`**.  
- In practice the Spine bus already wires this automatically — do **not** add manual calls at the emit site unless the bus integration is bypassed.
- No-op when debug mode is off.

```ts
NexusLogger.warn(tag: string, message: string, data?: unknown): void
```
- For **recoverable** warnings (e.g., missing optional config, degraded-but-functional state).
- Only prints when debug mode is on.
- Does **not** buffer (use `NexusLogger.error` if you need buffering).

```ts
NexusLogger.error(tag: string, err: unknown): void
```
- For errors that always warrant attention.
- **Always prints** regardless of debug mode.
- **Always buffered** in the `errors` ring buffer.

### Buffer Accessors

```ts
NexusLogger.getRecentErrors(limit?: number):   ErrorRecord[]
NexusLogger.getRecentActions(limit?: number):  ActionRecord[]
NexusLogger.getRecentSpineEvents(limit?: number): SpineRecord[]
```
- Default `limit` is implementation-defined (typically 50).
- Used by `use-module-ai.ts` to populate `MessageDebugMeta` (see §5).

### Hard Rule

> **NEVER** call `console.log`, `console.warn`, or `console.error` directly inside action handlers or Spine-adjacent code. Use `NexusLogger.action`, `NexusLogger.spine`, `NexusLogger.warn`, or `NexusLogger.error` as appropriate.

---

## 3. `useDebugMode` Hook

**File:** `src/lib/hooks/use-debug-mode.ts`

### Return Shape

```ts
{
  debugMode:      boolean,
  toggleDebugMode: () => void,
  debugFlags:     DebugFlags,
  setDebugFlag:   (key: keyof DebugFlags, value: boolean) => void,
}
```

### `DebugFlags` Type

| Flag key        | Controls                                          |
|-----------------|---------------------------------------------------|
| `thinking`      | AI reasoning / chain-of-thought block             |
| `actionTags`    | Action tags extracted from the raw AI response    |
| `actionAsked`   | Action tags that were dispatched to ActionHub     |
| `dataUpdates`   | Data mutations triggered by actions               |
| `actionUpdates` | Executed action results shown in DebugThoughtPanel |
| `spineEvents`   | Spine events captured during the message lifecycle |

- All flags default to `true`.
- Stored as a JSON object under localStorage key `nexus_debug_flags`.

### Sync Behaviour

| Scenario          | Mechanism                              |
|-------------------|----------------------------------------|
| Cross-tab sync    | Native `storage` event on `window`     |
| Same-tab sync     | `nexus_debug_flags_changed` CustomEvent |

Both scenarios read from `localStorage` on the event and update React state, so all consumers stay consistent without a reload.

### Side Effect on Toggle

`toggleDebugMode` calls `NexusLogger.setDebugMode(next)` automatically — no caller needs to do this separately.

---

## 4. DebugThoughtPanel Component

**File:** `src/core/components/debug/DebugThoughtPanel.tsx`

### Render Conditions

- Rendered **automatically** above each AI assistant message inside `ChatInterface`.
- **Visible only when** both conditions are true:
  1. `debugMode === true`
  2. The message object has a populated `debugMeta` field (see §5)

### UX

- Displays as a **collapsible pill** in the UI.
- Click the pill header to expand/collapse the detail panel.

### Sections & Flag Gates

| Section name            | `DebugFlags` key gating it | Always shown? |
|-------------------------|----------------------------|---------------|
| Reasoning               | `thinking`                 | No            |
| Action Tags Extracted   | `actionTags`               | No            |
| Action Tags Dispatched  | `actionAsked`              | No            |
| Actions Executed        | `actionUpdates`            | No            |
| Spine Events            | `spineEvents`              | No            |
| API (latency, snippet)  | *(none)*                   | **Yes**       |

### Rule for New Sections

> Every new debug section added to `DebugThoughtPanel` **must**:
> 1. Have a corresponding key added to the `DebugFlags` type.
> 2. Be wrapped in a conditional that checks `debugFlags.<newKey>`.
> 3. Have its toggle exposed in the Profile Debug Mode card (see §7).

---

## 5. `MessageDebugMeta` Type

**File:** `src/lib/types.ts`

```ts
interface MessageDebugMeta {
  reasoning:             string | null;
  actionTagsExtracted:   string[];
  actionTagsDispatched:  string[];
  actionsExecuted:       ActionRecord[];
  apiLatencyMs:          number;
  apiRequestSnippet:     string;
  spineEvents:           SpineRecord[];
}
```

### Population

`use-module-ai.ts` is responsible for building `MessageDebugMeta` **per message**:

1. Record a timestamp before the API call → compute `apiLatencyMs` on response.
2. Capture `NexusLogger.getRecentActions()` snapshot after handler execution.
3. Capture `NexusLogger.getRecentSpineEvents()` snapshot after Spine activity settles.
4. Attach the completed object to the outgoing message only when `debugMode` is on — otherwise omit entirely (do not set `debugMeta: {}`).

---

## 6. ModuleLayout Integration

**File:** `src/core/layout/ModuleLayout.tsx`

### Header Subtext

| `debugMode` | Displayed subtext                     |
|-------------|---------------------------------------|
| OFF         | `"Link Stable // Secure Tunnel"`      |
| ON          | Active model name (e.g. `gpt-4o`)    |

### TelemetryTicker

| `debugMode` | Ticker content                                        |
|-------------|-------------------------------------------------------|
| OFF         | Aesthetic/fake ambient strings                        |
| ON          | Real-time NexusLogger spine events from the buffer    |

### Component Notes

- `ModelBadge` and `SoulActivityTag` exist as standalone components.
- They are **not rendered inside** the `ModuleLayout` header — model name surfaces via the subtext above.
- Do not add `ModelBadge` back to the header; it is intentionally separate.

---

## 7. Profile UI — SystemPanel

**File:** `src/modules/profile/components/SystemPanel.tsx`

### Debug Mode Card

```
[ Debug Mode ]  ●  OFF / ON
  └─ (when ON, expands to show:)
       ☑ Thinking / Reasoning
       ☑ Action Tags Extracted
       ☑ Action Tags Dispatched
       ☑ Data Updates
       ☑ Action Updates
       ☑ Spine Events
```

- The card contains the master on/off toggle.
- When toggled ON, it expands **inline** to reveal the 6 granular `DebugFlags` toggles.
- Each flag toggle calls `setDebugFlag(key, value)` from `useDebugMode`.

### What Is NOT Here

- **Module Security (per-module lock)** lives in `SecurityPanel`, not in this card and not in the `SystemCommandCenter` popover.
- Do not move or duplicate Security controls into `SystemPanel`.

---

## 8. Rules for Future Changes

Apply these rules unconditionally whenever the listed code paths are modified.

### New ActionHub Handler

```
✅ DO: Call NexusLogger.action(moduleId, actionType, payload) after handler executes.
❌ DON'T: Use console.log to trace action execution.
```

### New `Spine.emit()` Call

```
✅ DO: Verify the Spine bus already calls NexusLogger.spine() at the bus level.
❌ DON'T: Add a manual NexusLogger.spine() at the emit site unless bus-level wiring is absent.
```

### New Debug Section in `DebugThoughtPanel`

```
✅ DO:
  1. Add a new key to DebugFlags in src/lib/types.ts (or co-located type file).
  2. Gate the section behind debugFlags.<newKey> in DebugThoughtPanel.
  3. Expose the flag toggle in SystemPanel's Debug Mode card expansion.
❌ DON'T: Render a section unconditionally or gate it behind debugMode alone.
```

### New Debug UI in Profile

```
✅ DO: Follow the Debug Mode card expansion pattern (show controls inline when ON).
❌ DON'T: Add a new top-level debug card or scatter debug toggles across unrelated panels.
```

---

## Quick-Reference Cheatsheet

```
localStorage keys
  nexus_debug_mode          → "true" | "false"
  nexus_debug_flags         → JSON object (DebugFlags)

CustomEvents
  nexus_debug_flags_changed → fired same-tab when flags change

Entry point
  main.tsx                  → NexusLogger.init(debugMode)

Toggle owner
  useDebugMode.toggleDebugMode() → NexusLogger.setDebugMode(next)

Per-message debug data
  use-module-ai.ts          → builds MessageDebugMeta, attaches to message

Debug UI entry point
  SystemPanel.tsx           → Debug Mode card

Rendering gatekeeper
  DebugThoughtPanel.tsx     → checks debugMode && message.debugMeta
```
