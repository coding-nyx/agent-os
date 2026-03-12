# Titan Fast Logging UX — Design Specification
### Work Item: `s19-titan-03-design`

**Author:** UI/UX Design Agent (Orchestrator Nexus)  
**Date:** 2026-03-14  
**Status:** FINAL  
**Scope:** `QuickLogBar.tsx`, `LogConfirmCard.tsx`, quick-fill from history, inline PR detection  
**Target:** Full workout (3–4 exercises) logged in < 30 seconds, zero form-field touches

---

## 0. Design Rationale

### The Core Problem
The existing `QuickLogDrawer` is a right-side slide-in drawer that logs **one set at a time** with three separate form fields (exercise name, weight, reps). For a power user doing a 4-exercise session, that is:

- 4 drawer opens (tap calendar → "+" button)
- 4 × 3 field interactions = 12 form field taps
- 4 save taps + 4 drawer-close taps

**Minimum = ~20 deliberate interactions per workout.** A 30-second target demands collapsing this to:

1. Tap the always-visible `QuickLogBar` (1 interaction)
2. Type `"3x5 squat @100, 3x8 bench @80, 3x10 lat pulldown @55"` (1 natural-language burst)
3. Review the parsed confirm card (0 interactions — eyes only)
4. Tap `✓ Log it` (1 interaction)

**Total = 3 deliberate interactions + ~10 seconds of typing.** This is the target architecture.

### Why Natural Language?
Power fitness users already speak in "3x5 squat at 100kg." This format is cognitively loaded into muscle memory. A structured form forces a **translation step** (thought → form fields) that breaks flow. Accepting the natural language directly removes that friction.

### Why Inline Confirmation (Not Modal)?
The existing `WorkoutSessionLogger` uses a `NeuralModal`. For a fast-log flow where the user is mid-workout, modals break context:
- They occlude the training tab layout
- They require a dedicated close gesture
- They imply "big decision" rather than "quick commit"

The `LogConfirmCard` must be **inline and swipeable** — it appears as a card within the page flow, reinforcing the message "this is a small thing, you can dismiss it easily."

---

## 1. QuickLogBar Component

### 1.1 Visual Anatomy

```
╔══════════════════════════════════════════════════════════════════╗
║  [⚡]  3x5 squat @100kg, 3x8 bench @80kg▌                [→]   ║
║  ─────────────────────────────────────────────────────────────  ║
║  💡 Last session: squat 3×5 @97.5kg · bench 3×8 @77.5kg        ║
╚══════════════════════════════════════════════════════════════════╝
```

**Anatomy (bottom-up, mobile-first):**

| Layer | Element | Description |
|---|---|---|
| Container | `fixed bottom-0` bar | Glass panel pinned to viewport bottom |
| Row 1 | Icon + Input + Submit | Primary interactive strip |
| Row 2 (conditional) | History suggestion chip | Appears when first exercise keyword is recognized |

### 1.2 Container Positioning & Layout

**Positioning:**
```
fixed bottom-0 left-0 right-0 z-30
```

The bar sits **below** the tab content and **above** the system navigation safe area. It must be thumb-reachable on all phone sizes — this is non-negotiable for a workout context (the user is often standing, holding a phone one-handed).

**Safe area handling:**
```
pb-[env(safe-area-inset-bottom)]
```
This prevents the bar from rendering beneath the iOS home indicator or Android gesture bar.

**Visual treatment:**
```
bg-[#0c0c10]/90 backdrop-blur-2xl
border-t border-orange-500/15
shadow-[0_-8px_40px_rgba(0,0,0,0.5)]
```
The top border in orange/amber traces the module's identity color. The upward shadow (`0_-8px_40px`) creates a sense of the bar "floating" above the content without a hard edge.

**Content padding:**
```
px-4 pt-3 pb-3
```

### 1.3 Input Field

The input is a **full-width text input**, not `NeuralInput` (which is too tall and includes a label). This is a custom inline input that inherits the spirit of NeuralInput but is tuned for speed.

**Input element classes:**
```
flex-1 bg-transparent text-sm text-white placeholder:text-white/30
focus:outline-none caret-orange-400 min-h-[44px]
```

**Placeholder text (cycling, 3s interval with CSS animation):**
- `"3x5 squat @100kg, 3x8 bench @80kg…"` ← default
- `"bench 3x8 80kg · ohp 3x10 60kg…"` ← alt format hint
- `"Format: SETSxREPS exercise @WEIGHT"` ← format guide

The placeholder should softly rotate to educate new users on the format while not cluttering the UI for power users.

**Leading icon:**
```jsx
<div className="mr-3 shrink-0 w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
  <Zap className="w-3.5 h-3.5 text-orange-400" />
</div>
```

**Submit button (right side):**
```jsx
<button
  aria-label="Parse and preview workout log"
  className="ml-3 shrink-0 w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30
             flex items-center justify-center text-orange-400
             hover:bg-orange-500/30 active:scale-95
             transition-all duration-150
             disabled:opacity-30"
>
  <ChevronUp className="w-4 h-4" />
</button>
```

The `ChevronUp` icon (pointing upward) signals "send upward into the screen," matching the visual direction of the LogConfirmCard that will appear above it.

### 1.4 Keyboard Behavior

| Key | Action |
|---|---|
| `Enter` | Trigger parse → show LogConfirmCard |
| `Escape` | Clear input / blur |
| `↑` (arrow up) | Navigate to most recent history suggestion |
| `Tab` | Accept ghost-text suggestion |

On mobile: the virtual keyboard's `Go`/`Return` key should be mapped to submit. Use `inputMode="search"` or `enterKeyHint="go"` on the input to render the correct soft key label.

### 1.5 Interaction States

| State | Visual Change |
|---|---|
| **Idle** | Normal opacity, orange caret, placeholder text |
| **Focused** | `ring-1 ring-orange-500/30` on the bar container, suggestion chip appears |
| **Has valid input** | Submit button brightens: `bg-orange-500/35` |
| **Parsing** | Submit button shows `Loader2` spinner |
| **Error** | Input gets `border-b border-rose-500/50`; inline error below input row |

### 1.6 Full Component Classes Reference

```tsx
// Bar container
"fixed bottom-0 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom)]"
"bg-[#0c0c10]/90 backdrop-blur-2xl"
"border-t border-orange-500/15"
"shadow-[0_-8px_40px_rgba(0,0,0,0.5)]"

// Inner wrapper
"px-4 pt-3 pb-3 flex flex-col gap-1.5"

// Input row
"flex items-center gap-2"

// Input element
"flex-1 bg-transparent text-sm text-white/90"
"placeholder:text-white/25 caret-orange-400"
"focus:outline-none min-h-[44px] py-0"

// Submit button (idle)
"w-9 h-9 rounded-xl"
"bg-orange-500/15 border border-orange-500/25 text-orange-400"
"hover:bg-orange-500/30 active:scale-95 transition-all duration-150"

// Submit button (has input)
"bg-orange-500/25 border-orange-500/35 text-orange-300"
"shadow-[0_0_12px_rgba(249,115,22,0.25)]"
```

---

## 2. Natural Language Parser — Design Contract

The `QuickLogBar` drives a client-side parser. This section defines the parsing contract the component relies on.

### 2.1 Input Grammar

```
input    ::= entry ("," entry)*
entry    ::= (setspec WS)? exercise (WS setspec)? (WS weight)?
           | setspec WS exercise WS weight
setspec  ::= NUMBER "x" NUMBER           // e.g. "3x5"
exercise ::= WORD+                       // e.g. "squat", "bench press", "lat pulldown"
weight   ::= "@"? NUMBER unit?
unit     ::= "kg" | "lbs" | "lb"
NUMBER   ::= [0-9]+ ("." [0-9]+)?
```

**Accepted format variations (all must parse):**

| Input | Parsed as |
|---|---|
| `3x5 squat @100kg` | sets:3, reps:5, exercise:"squat", weight:100, unit:kg |
| `squat 3x5 100` | same |
| `bench 3×8 80kg` | sets:3, reps:8, exercise:"bench", weight:80, unit:kg |
| `3x10 lat pulldown @55` | sets:3, reps:10, exercise:"lat pulldown", weight:55 |
| `5x5 squat` | sets:5, reps:5, exercise:"squat", weight:undefined |
| `squat` | sets:1, reps:undefined, exercise:"squat", weight:undefined |
| `3x5 squat @100, 3x8 bench @80` | two entries |

**Normalize exercise names against `EXERCISE_LIBRARY` aliases:**
- `"bench"` → resolves to `bench_press` (id) → `"Barbell Bench Press"` (display)
- `"squat"` → resolves to `squat` (id) → `"Barbell Back Squat"` (display)
- `"lat pulldown"` → resolves to `lat_pulldown`
- Unresolved names are kept verbatim and flagged as `isNew: true`

### 2.2 ParsedEntry Type

```typescript
export interface ParsedEntry {
  raw: string;             // original substring, e.g. "3x5 squat @100kg"
  exerciseName: string;    // display name, normalized or raw if unresolved
  exerciseId: string | null; // null if not in library
  sets: number;            // default: 1
  reps: number | null;     // null if not specified
  weight: number | null;   // null if not specified (bodyweight)
  unit: 'kg' | 'lbs';     // default: 'kg'
  isNew: boolean;          // true if not found in library or history
  parseConfidence: 'high' | 'medium' | 'low'; // high=all fields, medium=missing weight/reps, low=name only
}
```

### 2.3 Error Cases

| Input | `parseConfidence` | Error message |
|---|---|---|
| `"squat"` alone | `medium` | No error — show with placeholders |
| `"asdfjkl 3x5"` | `low` | "Couldn't recognize 'asdfjkl'" |
| `"3x5 @100"` | `low` | "Missing exercise name" |
| Empty string | — | Submit button is disabled |
| All entries low confidence | — | Show parse warning banner in card |

---

## 3. LogConfirmCard Component

### 3.1 Design Principle: Zero-Friction Commit

The confirm card exists purely as a **sanity check gate.** The user has already expressed intent in the QuickLogBar. The card should:
1. Present the parsed interpretation in < 1 second
2. Make the primary CTA (`✓ Log it`) prominent and thumb-reachable
3. Get out of the way immediately on commit or swipe-dismiss

**This component is NEVER a modal.** It renders inline in the Training tab, above the `QuickLogBar`, sliding up from beneath the screen.

### 3.2 Visual Anatomy

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ Ready to log · Today, Mar 14             [✕ dismiss] │
│──────────────────────────────────────────────────────────│
│  ▸  Barbell Back Squat      3 sets × 5     100.0 kg     │
│     [Last: 3×5 @97.5kg ↑]            [🏆 New PR e1RM]  │
│──────────────────────────────────────────────────────────│
│  ▸  Barbell Bench Press     3 sets × 8      80.0 kg     │
│     [Last: 3×8 @77.5kg ↑]                               │
│──────────────────────────────────────────────────────────│
│  ▸  Lat Pulldown            3 sets × 10     55.0 kg     │
│     [Last: 3×10 @52.5kg ↑]                              │
│──────────────────────────────────────────────────────────│
│                                                          │
│  [  ✓ Log it  ]              [ ✏ Edit ]                 │
└──────────────────────────────────────────────────────────┘
```

### 3.3 Animation & Swipe Behavior

**Entry animation (slide-up from bottom):**
```tsx
initial={{ y: '100%', opacity: 0 }}
animate={{ y: 0, opacity: 1 }}
exit={{ y: '100%', opacity: 0 }}
transition={{ type: 'spring', damping: 28, stiffness: 280 }}
```

**Swipe-to-dismiss:**
```tsx
drag="y"
dragConstraints={{ top: 0 }}      // can only drag downward
dragElastic={0.1}
onDragEnd={(_, info) => {
  if (info.offset.y > 80) onDismiss();  // 80px threshold
}}
```

Adding a horizontal swipe-left for dismiss is NOT recommended. Vertical drag is more natural for a bottom-anchored card and avoids conflict with horizontal scrolling of the entry list.

**Position:**
```
fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-4 right-4 z-20
```
The `72px` offset lifts the card just above the `QuickLogBar` (which is approximately 64px tall + padding). The `4px` horizontal inset creates breathing room from screen edges.

### 3.4 Container Classes

```tsx
// Card wrapper
"rounded-2xl overflow-hidden"
"bg-[#0c0c10]/95 backdrop-blur-2xl"
"border border-orange-500/20"
"shadow-[0_-4px_40px_rgba(0,0,0,0.6),0_0_1px_rgba(249,115,22,0.15)]"
"max-h-[60vh] flex flex-col"
```

The `max-h-[60vh]` cap ensures that even a 6-exercise session doesn't push the card off-screen. The entry list scrolls internally.

### 3.5 Card Header

```tsx
<div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
  <div className="flex items-center gap-2.5">
    <div className="w-6 h-6 rounded-lg bg-orange-500/15 border border-orange-500/20 flex items-center justify-center">
      <Zap className="w-3 h-3 text-orange-400" />
    </div>
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400/80">
        Ready to log
      </p>
      <p className="text-[10px] text-white/35 leading-none">
        {formattedDate}  ·  {entryCount} exercise{entryCount !== 1 ? 's' : ''}
      </p>
    </div>
  </div>
  <button
    aria-label="Dismiss log preview"
    onClick={onDismiss}
    className="w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
  >
    <X className="w-3.5 h-3.5" />
  </button>
</div>
```

### 3.6 Entry Row Design

Each `ParsedEntry` renders as a row. The row has two sub-rows:
- **Primary row:** Exercise name + set spec + weight
- **Secondary row (conditional):** History ghost chip + PR badge

```tsx
// Entry row container
"px-4 py-3 border-b border-white/[0.04] last:border-b-0"

// Primary row
"flex items-center justify-between gap-3"

// Exercise name
"text-sm font-semibold text-white/85 flex-1 truncate"

// Set pill (e.g. "3 × 5")
"text-xs font-bold text-white/60 tabular-nums shrink-0"
// Render as: `${sets} × ${reps}`
// Color code: sets in white/60, "×" in orange/40, reps in white/60

// Weight value
"text-sm font-bold text-white/90 tabular-nums shrink-0"
"min-w-[60px] text-right"

// Weight unit
"text-[10px] text-white/40 ml-0.5"

// isNew badge (unresolved exercise)
"text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
"bg-amber-500/15 text-amber-400 border border-amber-500/20"
// content: "NEW"
```

**Secondary row (history + PR):**
```tsx
// Secondary row container
"flex items-center gap-2 mt-1"

// History ghost chip
"text-[10px] text-white/30 flex items-center gap-1"
// content: "↑ Last: 3×5 @97.5kg" — shown when history exists

// PR badge — ONLY when new weight > stored e1RM
"flex items-center gap-1 px-1.5 py-0.5 rounded-full"
"bg-amber-500/15 border border-amber-400/25 text-amber-300"
"text-[10px] font-bold uppercase tracking-wider"
// content: <Trophy className="w-2.5 h-2.5" /> "New PR"
```

### 3.7 Low-Confidence Warning Banner

When one or more entries have `parseConfidence === 'low'`:

```tsx
<div className="mx-4 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
  <p className="text-[11px] text-amber-300/80 leading-snug">
    Some entries couldn't be fully parsed. Review before logging.
  </p>
</div>
```

### 3.8 Footer Actions

```tsx
// Footer container
"px-4 pb-4 pt-3 flex items-center gap-3 border-t border-white/[0.06] shrink-0"

// Primary CTA — Log it
<NeuralButton
  themeColor="orange"
  size="md"
  className="flex-1"
  onClick={onCommit}
  disabled={isCommitting}
  loading={isCommitting}
>
  <Check className="w-3.5 h-3.5 mr-1" />
  {isCommitting ? 'Saving…' : '✓ Log it'}
</NeuralButton>

// Secondary CTA — Edit (opens QuickLogBar pre-filled with original text)
<NeuralButton
  variant="ghost"
  size="md"
  className="shrink-0"
  onClick={onEdit}
>
  <Pencil className="w-3.5 h-3.5 mr-1" />
  Edit
</NeuralButton>
```

The footer uses a `flex-1` primary button to maximize tap target size. The `Edit` button is ghost and narrower — users who got it right don't need to see this prominently.

---

## 4. Quick-Fill from History

### 4.1 Design Decision: Two-Layer Suggestion

History surfacing uses **two complementary patterns** that don't compete:

1. **Suggestion chip below the input** (passive, persistent)
2. **Ghost text in the input** (active, appears during typing)

These target different moments:
- The chip appears when the user **first focuses** the bar, showing what they logged last time
- Ghost text appears **while typing** once an exercise is recognized

### 4.2 History Suggestion Chip

**Trigger:** Bar receives focus AND history data exists (≥ 1 recent session)

**Visual:**
```tsx
// Chip container — animates in below the input row
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 4 }}
  transition={{ duration: 0.15 }}
  className="flex items-center gap-2 px-1 pb-1"
>
  <Clock className="w-3 h-3 text-white/25 shrink-0" />
  <p className="text-[11px] text-white/30">Last session:</p>
  <button
    onClick={handleAcceptLastSession}
    className="text-[11px] text-orange-400/70 hover:text-orange-400
               font-semibold truncate max-w-[240px]
               underline decoration-dotted underline-offset-2
               transition-colors"
    aria-label="Pre-fill with last session"
  >
    {lastSessionSummary}  {/* "3x5 squat @97.5kg, 3x8 bench @77.5kg" */}
  </button>
  <span className="text-[10px] text-white/20 ml-1">
    {relativeDate}  {/* "3 days ago" */}
  </span>
</motion.div>
```

**Behavior on tap:** Populates the input with the exact text string from last session, using the user's own previous format. No reformatting, no disruption. The user can then adjust weights by editing inline.

**`lastSessionSummary` construction:**
- Pull the most recent `WorkoutLog` from the profile
- Reconstruct the natural-language format: `${set.weight}kg ${exercise} ${sets}x${reps}`
- Cap the displayed summary at 60 chars with `…` if longer
- Show full summary in a `title` attribute for tooltip

### 4.3 Ghost Text (Inline Suggestion)

Ghost text is an **overlay technique** — not a browser `placeholder`, but a secondary `<span>` rendered beneath the input value with `pointer-events-none`. This gives us full control over styling.

**Trigger:** When the user types 3+ characters that match an exercise alias, look up their last logged weight for that exercise and inject a ghost suggestion.

**Example:**
- User types: `3x5 squ`
- Ghost text renders: `~~3x5 squ~~at @97.5kg` (the remaining predicted text in `text-white/20`)

**Tab to accept:** Pressing `Tab` accepts the ghost text (appends the prediction to the current input value).

**Implementation note:** Ghost text requires a custom input wrapper with the input text and ghost text in an absolutely-positioned overlay. The font family and size must be identical (both `font-mono` or both `font-sans` at the same `text-sm`). A discrepancy causes visible misalignment.

```tsx
// Ghost text implementation pattern:
<div className="relative flex-1">
  {/* Real input — transparent background, value visible */}
  <input
    className="relative z-10 w-full bg-transparent text-white/90 text-sm ..."
    value={inputValue}
    onChange={...}
  />
  {/* Ghost overlay — exact same font metrics */}
  {ghostSuffix && (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center pointer-events-none
                 text-sm text-white/90 whitespace-pre overflow-hidden"
    >
      {/* Render user-typed portion in transparent, ghost in muted white */}
      <span className="opacity-0">{inputValue}</span>
      <span className="text-white/20">{ghostSuffix}</span>
    </div>
  )}
</div>
```

---

## 5. PR Detection Inline

### 5.1 When PR Detection Runs

PR detection runs **during parse**, not after save. This means the confirm card already shows the PR badge before the user taps "Log it." The emotional reward is front-loaded — the user sees the PR when reviewing, not as an afterthought after the save has completed.

**Algorithm:**
```typescript
// During parseEntries():
for (const entry of parsed) {
  if (entry.exerciseId && entry.weight && entry.reps) {
    const candidate_e1RM = calculateE1RM(entry.weight, entry.reps);
    const existing_e1RM = getBestE1RM(personalRecords, entry.exerciseId);
    entry.isPR = existing_e1RM === null || candidate_e1RM > existing_e1RM;
    entry.prDelta = existing_e1RM ? candidate_e1RM - existing_e1RM : null;
  }
}
```

### 5.2 PR Badge in LogConfirmCard

The PR badge appears inline in the entry row's secondary line, to the right of the history chip:

```tsx
{entry.isPR && (
  <motion.div
    initial={{ scale: 0.7, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', damping: 15, delay: 0.15 }}
    className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0
               bg-amber-500/15 border border-amber-400/25"
    aria-label={`New personal record${entry.prDelta ? ` — e1RM up ${entry.prDelta.toFixed(1)}kg` : ''}`}
  >
    <Trophy className="w-2.5 h-2.5 text-amber-400" />
    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
      New PR
    </span>
    {entry.prDelta !== null && (
      <span className="text-[9px] text-amber-400/60 ml-0.5">
        +{entry.prDelta.toFixed(1)}
      </span>
    )}
  </motion.div>
)}
```

The spring animation on the badge (`delay: 0.15`) staggers it so it "pops" in slightly after the row has appeared — drawing the eye without being distracting.

### 5.3 Post-Save PR Toast

After the commit succeeds **and** at least one PR was detected, emit a `SpineToast` (or equivalent surface notification — see `SpineToast.tsx`):

```
🏆  New PR: Barbell Back Squat — e1RM 117.5 kg
```

**Toast styling:**
```
bg-amber-500/15 border border-amber-500/25 text-amber-300
```

Duration: `4000ms` — longer than a typical info toast because it's a reward moment.

### 5.4 PR Detection Race Condition Handling

**Race condition scenario:** The PR data in `personalRecords` is loaded from Firestore. If the user logs very quickly (< 500ms after page load), `personalRecords` may be `null` or an empty array, causing false PR detections (everything looks like a new PR because there are no stored records to compare against).

**Mitigation:**
1. **Loading gate:** If `personalRecords` is `undefined` (not yet loaded), skip PR badge computation and show no badge. Do not show a false negative (`isPR: false`) — simply withhold the badge.
2. **Null check:** `getBestE1RM([], exerciseId)` returns `null` → `isPR = true`. This is the correct behavior for a genuinely new exercise with no history.
3. **Post-commit reconciliation:** After `onCommit` resolves, re-evaluate PR status with the freshly-written data. If the page-load profile had stale data, the `TitanPage` PR board will self-correct via its Firestore subscription.

```typescript
// Safe PR check during parse:
function isPRCandidate(
  entry: ParsedEntry,
  personalRecords: PersonalRecord[] | undefined,
): boolean {
  // Records not yet loaded — can't determine, withhold badge
  if (personalRecords === undefined) return false;
  if (!entry.exerciseId || !entry.weight || !entry.reps) return false;
  const candidate = calculateE1RM(entry.weight, entry.reps);
  const best = getBestE1RM(personalRecords, entry.exerciseId);
  return best === null || candidate > best;
}
```

---

## 6. Interaction Flows

### 6.1 Happy Path — Full Workout Log (< 30s)

```
User is on Training tab
         │
         ▼
QuickLogBar is visible at bottom of screen (persistent, idle)
         │
         ▼ [tap QuickLogBar / tap input]
Input focused → virtual keyboard opens
History suggestion chip slides in below input
         │
         ▼ [user types: "3x5 squat @100, 3x8 bench @80, 3x10 lat pulldown @55"]
Ghost text assists for each recognized exercise
         │
         ▼ [user taps → button OR presses Enter/Go]
Parser runs (< 50ms client-side)
LogConfirmCard slides up from bottom
Entries rendered with history chips + PR badge (if applicable)
         │
         ▼ [user scans card — looks correct]
User taps [✓ Log it]
         │
         ▼
isCommitting = true → NeuralButton shows spinner
         │
         ▼
onCommit() called → TitanPage writes to Firestore
(same QuickLogRecord path as existing QuickLogDrawer)
         │
         ▼
LogConfirmCard slides down (exit animation)
QuickLogBar input clears
         │
         ▼ (if PR detected)
SpineToast fires: "🏆 New PR: Barbell Back Squat — e1RM 117.5 kg"
         │
         ▼
Training tab updates with new session in calendar
```

**Target time: 8–15 seconds for 3 exercises from tap to save confirmation.**

### 6.2 Error Path — Unparseable Input

```
User types: "asjdfkl 3x5 @100"
         │
         ▼ [presses Enter]
Parser runs, returns 1 entry with parseConfidence = 'low'
         │
         ▼
LogConfirmCard slides up showing:
  ⚠ Some entries couldn't be fully parsed. Review before logging.
  Row: "asjdfkl" · 3×5 · 100kg · [NEW] badge
         │
         ▼ [user taps Edit]
LogConfirmCard slides down
QuickLogBar re-focused with original text for inline correction
         │
         OR
         ▼ [user taps ✓ Log it anyway]
Entry saved as free-text exercise (exerciseId: null, exerciseName: "asjdfkl")
→ falls into WorkoutSession free-text path (same as existing QuickLogDrawer free-text)
```

### 6.3 Error Path — Empty Input

```
User taps submit with empty input
         │
         ▼
Input shakes animation (keyframe: translate-x ±4px × 2 cycles)
Brief error message inline: "Type an exercise to log, e.g. 3x5 squat @100kg"
Auto-clears after 2 seconds
No confirm card appears
```

**Shake keyframe (CSS):**
```css
@keyframes quicklog-shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-4px); }
  40%       { transform: translateX(4px); }
  60%       { transform: translateX(-3px); }
  80%       { transform: translateX(3px); }
}
```

### 6.4 Error Path — Commit Failure (Firestore error)

```
User taps [✓ Log it]
         │
         ▼
onCommit() rejects
         │
         ▼
isCommitting = false
Footer shows inline error:
  ✕ Save failed · [Retry]
```

The card **stays open** on failure — do not dismiss. Dismissing on failure would lose the user's parsed data and force them to retype.

```tsx
// Error state in footer
{commitError && (
  <div className="w-full px-4 pb-2 flex items-center justify-between">
    <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
      <AlertCircle className="w-3 h-3" />
      Save failed
    </p>
    <button
      onClick={onCommit}
      className="text-[11px] text-orange-400 font-semibold hover:text-orange-300 transition-colors"
    >
      Retry
    </button>
  </div>
)}
```

### 6.5 Edge Case — One Entry Partially Parsed

If input is `"3x5 squat @100, bench"` (second entry missing weight and reps):

- Entry 1: `parseConfidence: 'high'` → renders normally
- Entry 2: `parseConfidence: 'medium'` → renders with `—` for weight and reps
  - Secondary row shows history chip if available: "Last: 3×8 @77.5kg → tap to fill"
  - Inline `[+]` icon on the weight/reps cells → tapping opens a micro-edit inline (not a full modal)

**Micro-edit inline for partial entries:**
```tsx
// Renders in-place when entry has missing fields
<button
  aria-label="Fill in sets and reps"
  className="text-[10px] text-orange-400/70 hover:text-orange-400 font-medium
             flex items-center gap-1 transition-colors"
  onClick={() => setEditingEntryIndex(i)}
>
  <Plus className="w-3 h-3" />
  Fill in
</button>
```

Tapping shows a compact inline row of tiny `<input>` fields for sets, reps, weight. These are `type="number"` with `inputMode="decimal"`, minimum `h-7`, inside the card row itself.

---

## 7. Visual Hierarchy Notes

### 7.1 Typography Scale

| Element | Classes | Rationale |
|---|---|---|
| Card section label ("Ready to log") | `text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400/80` | Matches existing Titan label hierarchy |
| Date/subtitle | `text-[10px] text-white/35` | Clearly secondary, never competes with data |
| Exercise name | `text-sm font-semibold text-white/85` | Primary data — should be scannable at a glance |
| Set spec "3 × 5" | `text-xs font-bold text-white/60` | Supporting data |
| Weight value | `text-sm font-bold text-white/90` | Equal weight to exercise name — both are primary |
| Weight unit "kg" | `text-[10px] text-white/40` | Context, not content |
| History chip | `text-[11px] text-white/30` | Clearly passive/secondary |
| PR badge | `text-[10px] font-bold uppercase tracking-wider text-amber-300` | Attention-drawing but not alarming |

### 7.2 Color Role Map

| Color | Role |
|---|---|
| `orange-400 / orange-500` | Titan identity, interactive elements, active state |
| `amber-300 / amber-400` | PR achievement, history suggestions |
| `white/85–90` | Primary data values |
| `white/40–60` | Supporting data, units |
| `white/25–35` | Metadata, labels, ghost text |
| `rose-400` | Error states |
| `emerald-400` | (Reserved for future positive trend indicators) |

### 7.3 Spacing Rhythm

The card uses an `8px` base grid consistent with the rest of the module:
- Row padding: `py-3 px-4` (12px/16px)
- Gap between secondary items: `gap-2` (8px)
- Card border radius: `rounded-2xl` (1.25rem — matching `--radius-xl`)
- Input height: minimum `44px` (WCAG 2.5.5 touch target)

---

## 8. Integration with Existing TitanPage

### 8.1 State Additions to TitanPage/TitanContent

```typescript
// Add to TitanContent state:
const [quickLogInput, setQuickLogInput] = useState('');
const [parsedEntries, setParsedEntries] = useState<ParsedEntry[] | null>(null);
const [isQuickLogConfirming, setIsQuickLogConfirming] = useState(false);
const [quickLogCommitError, setQuickLogCommitError] = useState<string | null>(null);
```

### 8.2 Render Location

The `QuickLogBar` and `LogConfirmCard` should be rendered **outside** the scrollable tab content, as siblings inside `TitanContent`'s root layout wrapper. They are viewport-fixed and must not participate in the tab scroll layout.

```tsx
// In TitanContent render:
return (
  <div className="relative min-h-screen">
    {/* Existing tab layout */}
    <div className="pb-24"> {/* Bottom padding to prevent QuickLogBar overlap */}
      {/* ... tab content ... */}
    </div>

    {/* Fast-log layer — always rendered, always accessible */}
    <AnimatePresence>
      {isQuickLogConfirming && parsedEntries && (
        <LogConfirmCard
          entries={parsedEntries}
          personalRecords={Object.values(profile?.personalRecords ?? {})}
          recentSessions={profile?.workoutSessions ?? []}
          onCommit={handleQuickLogCommit}
          onEdit={handleQuickLogEdit}
          onDismiss={() => {
            setIsQuickLogConfirming(false);
            setParsedEntries(null);
          }}
          commitError={quickLogCommitError}
        />
      )}
    </AnimatePresence>

    <QuickLogBar
      value={quickLogInput}
      onChange={setQuickLogInput}
      onSubmit={handleQuickLogParse}
      recentSessions={profile?.workoutSessions ?? []}
      disabled={isQuickLogConfirming}  // blur bar while card is open
    />
  </div>
);
```

### 8.3 Commit Handler

The commit handler reuses the **existing `handleQuickLogCommit` path** in `TitanPage`. Each `ParsedEntry` that has a resolved `exerciseId` is converted to a `QuickLogRecord`. Entries without a resolved ID fall back to the `WorkoutSession` free-text path.

For multi-entry commits (3–4 exercises), the handler should batch them into a **single `WorkoutSession`** with multiple `exercises` entries, rather than calling `onCommit` once per entry. This:
- Produces a coherent session entry in the calendar
- Avoids N separate Firestore writes
- Allows PR tracking to run once over the whole session

### 8.4 Training Tab Content Padding

The Training tab content area must add bottom padding equal to the `QuickLogBar` height to prevent the last calendar row or session card from being hidden beneath the bar:

```
pb-24  // 96px — enough for QuickLogBar + safe area
```

---

## 9. Accessibility (WCAG AA)

| Requirement | Implementation |
|---|---|
| Minimum touch target 44×44px | Input `min-h-[44px]`, all buttons `min-w-[44px] min-h-[44px]` or icon buttons with padding to 44px effective tap area |
| Focus indicators | `focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:outline-none` on all interactive elements |
| Announce PR detection | PR badge has `aria-label="New personal record — e1RM up X kg"` |
| Confirm card ARIA | `role="region" aria-label="Workout log preview"` on LogConfirmCard container |
| Swipe dismiss accessible | X button in header provides non-gesture dismiss; swipe is enhancement only |
| Error announcement | Error states use `role="alert"` so screen readers announce them immediately |
| Ghost text hidden | `aria-hidden="true"` on ghost text overlay |
| Input labeling | `<label>` or `aria-label="Log exercises, e.g. 3x5 squat at 100kg"` on the QuickLogBar input |
| Color contrast | All text colors maintain ≥ 4.5:1 on `#0c0c10` background — verified by design token constraints |

---

## 10. Component File Map

```
src/modules/titan/components/
├── QuickLogBar.tsx           ← NEW — persistent bottom input bar
├── LogConfirmCard.tsx        ← NEW — inline swipeable confirm card
├── QuickLogDrawer.tsx        ← EXISTING — single-set drawer (retain for calendar tap flow)
└── ...

src/modules/titan/utils/
├── quick-log-parser.ts       ← NEW — NLP parser for "3x5 squat @100kg" format
├── e1rm.ts                   ← EXISTING — calculateE1RM, getBestE1RM (used in parser)
└── ...
```

### Coexistence with QuickLogDrawer

The `QuickLogDrawer` (single-set, calendar tap) remains in place. The two components serve different contexts:

| Context | Component |
|---|---|
| Tapping `+` on a specific calendar date | `QuickLogDrawer` — date-targeted, single-set, structured |
| Fast multi-exercise session log | `QuickLogBar` → `LogConfirmCard` — natural language, any date (defaults today) |

Both commit through the same `TitanPage.handleQuickLogCommit` handler.

---

## 11. Open Questions for Engineering

1. **Unit persistence:** Should the unit preference (kg vs lbs) be stored in `TitanProfile`? Currently only the `QuickLogDrawer` has a `kg/lbs` label but no stored preference. The parser should default to `kg` and accept explicit `lbs`/`lb` suffixes.

2. **Multi-set vs single-set writes:** The existing `QuickLogRecord` type carries a single `{ weight, reps }` — it models one set. For the `QuickLogBar`, should each "3x5 squat" expand into 3 identical `WorkoutSet` entries, or be stored as a single set with `sets: 3`? **Recommendation:** Store as a `WorkoutSession` with 3 identical sets to preserve e1RM sparkline data granularity.

3. **Undo / soft delete:** After committing, show a temporary "Undo" toast for 5 seconds. This is a grace window for accidental taps.

4. **Voice input:** The natural language format is voice-friendly. A future `<Mic>` button in the `QuickLogBar` could route to `navigator.mediaDevices.getUserMedia` → Web Speech API → fill input. This is deferred but the parser contract supports it.

5. **Offline support:** The commit path currently requires Firestore. For gym environments with poor connectivity, consider: (a) `localStorage` staging buffer (pattern already established in `WorkoutSessionLogger`), (b) IndexedDB offline queue, (c) optimistic UI with retry.

---

## 12. Non-Goals (Out of Scope for s19-titan-03)

- **Live session timer** — tracked separately as enhancement to `WorkoutSessionLogger`
- **Rest period auto-detection** — belongs in `RestPeriodCalculator.tsx`
- **Nutrition logging via QuickLogBar** — Soma module owns nutrition; do not conflate
- **RPE capture in QuickLogBar** — RPE belongs in the full session logger for deliberate annotation
- **Routine auto-population** — "Start today's routine" is a separate UX path from fast-log

---

*Design spec complete. Implementation may begin after engineering review of §11 open questions.*
