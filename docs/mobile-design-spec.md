# Agnes App — Mobile & Tablet Design Guide

A prescriptive guide for designing and implementing screens, components, and interactions on mobile (< 768px) and tablet (768–1024px) viewports.

---

## Table of Contents

1. Design Principles
2. Viewport & Breakpoints
3. Spacing, Touch Targets & Density
4. Typography
5. Color & Surface
6. Navigation
7. Layout Patterns
8. Component Design
9. Forms & Inputs
10. Overlays, Modals & Bottom Sheets
11. Module Screen Patterns
12. Chat & AI Interaction
13. Gestures
14. Keyboard & Input Behavior
15. Performance
16. Verification

---

## 1. Design Principles

**One zone at a time.**
A mobile screen holds one primary zone: either content or chat — never both simultaneously. Secondary panels (sidebars, rails, auxiliary dashboards) are hidden by default and accessed via overlay or a dedicated trigger.

**Thumb-first layout.**
Primary actions live in the lower third of the screen. Navigation triggers are reachable with a thumb. Destructive or secondary actions are further away — top-right or inside menus.

**Immersive void.**
The dark void background (`#020205`) and glassmorphic surface system are foundational to the Agnes aesthetic and apply at every viewport. Glass surfaces may use a reduced blur radius on mobile (16px vs 20px) to preserve frame rate, but the visual language is unchanged.

**Progressive disclosure.**
Dense information is collapsed by default and revealed on demand. Dashboards show key metrics; detail lives behind a tap. Long forms use step-by-step flows rather than one long scroll.

**No surprises.**
Every tap has a clear visual response. Destructive actions require confirmation. The user always knows where they are and how to go back.

---

## 2. Viewport & Breakpoints

### Breakpoints
| Range | Tailwind prefix | Target |
|---|---|---|
| 0–639px | (base) | Phone portrait — primary mobile target |
| 640–767px | `sm:` | Phone landscape / small phone |
| 768–1023px | `md:` | Tablet portrait |
| 1024px+ | `lg:` | Desktop / tablet landscape |

### Viewport Rules
- Use `100dvh` (dynamic viewport height) for full-screen containers. This correctly accounts for the shrinking viewport when the virtual keyboard is open on iOS.
- Apply `env(safe-area-inset-*)` padding on all four edges of the root layout to respect notches and home indicators.
- Disable body overscroll: `overscroll-behavior: none` keeps the immersive feel.
- Do not use `100vh` for full-screen layouts — it does not account for the iOS browser chrome.

---

## 3. Spacing, Touch Targets & Density

### Touch Target Minimums
| Element | Minimum size |
|---|---|
| Primary buttons | 48 × 48px (`h-12`) |
| Secondary buttons | 44 × 44px (`h-11`) |
| Icon-only buttons | 44 × 44px (`h-11 w-11`) |
| Toggle switches | 44px tall wrapper around the track |
| Tab items | 44px tall |
| List rows | 52px tall (`min-h-[52px]`) |
| Notification rows | 64px tall |
| FABs | 56 × 56px (`h-14 w-14`) |

When a visual element is smaller than its tap target (e.g. a 36px icon button), expand the tap area using negative margin (`-m-1`) or an invisible padding layer without changing the visual size.

### Spacing Scale
- Screen edge padding: `px-4` (16px) on all content
- Section gaps: `gap-4` (16px) between cards, `gap-3` (12px) in dense grids
- Card internal padding: `p-4` (16px); `p-6` for hero cards
- Stacked form fields: `gap-3` between fields

### Grid Density
- Default mobile grid: `grid-cols-1`
- Compact stat cards: `grid-cols-2`
- Never use more than 2 columns on phone portrait unless cells are very small (e.g. habit heatmap)

---

## 4. Typography

### Type Scale
| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero heading | `text-4xl` (36px) | Black | Scale up at `sm:text-5xl`, `md:text-7xl` |
| Page title | `text-2xl` (24px) | Bold | Module and section names |
| Section heading | `text-base` (16px) | Semibold | Scale up at `sm:text-xl` |
| Panel heading | `text-base` (16px) | Medium | |
| Body | `text-sm` (14px) | Regular | Primary reading size |
| Secondary / meta | `text-[13px]` | Regular | Timestamps, subtitles |
| Labels / caps | `text-[11px]` | Semibold + uppercase | Field labels, stat labels |
| Micro / decorative | `text-[10px]` | Regular | Chip text, decorative only |

### Input Font Size Rule
All `<input>`, `<textarea>`, and `<select>` elements must render at **16px minimum on mobile**. This prevents iOS Safari from auto-zooming the viewport when a field is focused.

Use `text-base` on mobile and `sm:text-sm` to revert to 14px on larger screens:
```
className="text-base sm:text-sm"
```

This applies to every form field in every module without exception.

---

## 5. Color & Surface

### Background
- Page background: `#020205` (the void)
- No colored backgrounds on mobile — all color comes from accent glows, borders, and surface overlays

### Glass Surfaces
Three surface levels used throughout:

| Level | Treatment | Use case |
|---|---|---|
| `surface-card` | `bg-white/[0.03]` + `backdrop-blur(20px)` + `border border-white/[0.06]` | Standard cards, panels |
| `surface-card-strong` | `bg-white/[0.05]` + `backdrop-blur(16px)` + `border border-white/[0.08]` | Modals, overlays, drawers. Use blur(16px) on mobile instead of 20px. |
| `surface-inset` | `bg-black/20` + inner shadow | Input backgrounds, nested sections |

Do not stack more than 5 composited blur layers simultaneously on a single screen — this exceeds the mobile GPU compositing budget and causes frame drops.

### Module Accent Colors
Each module has a defined accent color applied to borders, glows, and highlights. These are set as CSS variables and must not be changed. The accent is applied subtly — as a border glow or icon color, not as a background fill.

### State Colors
| State | Color |
|---|---|
| Primary action | Cyan (`--color-cyan`) |
| Success / complete | Green |
| Warning | Amber |
| Danger / destructive | Red |
| Inactive / disabled | `text-white/30`, `border-white/10` |

---

## 6. Navigation

### Primary Navigation: Global FAB
The Global FAB (floating action button) is the primary navigation entry point on mobile.

- Position: fixed, bottom-left, above the module footer bar and safe area
- Size: 56 × 56px
- Opens a speed-dial of module icons
- Speed-dial labels are truncated at `max-w-[calc(100vw-80px)]` to prevent overflow
- When open, a full-screen backdrop blocks background interaction

### Secondary Navigation: Module Tab Bar
Each module exposes its sections via a horizontal tab bar.

- Tabs scroll horizontally with `overflow-x-auto` and no visible scrollbar
- A fade gradient on the right edge signals that more tabs exist off-screen
- Each tab is at least 44px tall
- Active tab uses the module accent color

### In-Module Back Navigation
A back button in the module header returns the user to the Hub. It is always present and always navigates to `/hub`.

### What Is Hidden on Mobile
| Element | Visibility |
|---|---|
| Left sidebar / rail | Hidden — accessible only on desktop |
| Right sidebar / rail | Hidden — accessible only on desktop |
| Header subtitle row | Hidden below `sm:` |
| Telemetry ticker | Hidden below `sm:` |
| Security protocol controls | Hidden below `lg:` |

---

## 7. Layout Patterns

### Single Column Scroll
The default mobile layout. Content flows top to bottom in a single column. The header is sticky at the top. A module footer bar (if present) is sticky at the bottom.

```
[Sticky header — ~52px]
[Scrollable content area — flex-1]
[Sticky module footer — visible when present]
```

### Content + Chat (Single Agent Layout)
Used in modules with an AI assistant (Agnes, Titan, Soma, Ledger, Scout, Forge, Nexus).

On mobile:
- The content area fills the full screen
- The chat is accessed via a FAB (bottom-right, 56 × 56px)
- Tapping the FAB opens a full-screen chat overlay that slides up from the bottom
- The overlay has a close button (top-right, 44 × 44px tap area) and an `X` label
- The content area is not visible while the chat overlay is open

On tablet (768px+):
- The chat panel docks as a fixed-width (360px) right column
- Content occupies the remaining width

### Dashboard + Tabs
Used in data-heavy modules (Titan, Atlas, Ledger, Soma).

```
[Header]
[Dashboard summary — compact, 2-column stat grid]
[Tab bar — horizontal scroll]
[Tab content — scrollable]
[Module footer bar]
```

The dashboard summary is always visible above the tab bar — it provides at-a-glance status without switching tabs.

### Full-Screen Immersive
Used for focus states (Atlas Focus, Agnes Somatic, Agnes Session).

```
[Absolute background layer — 3D environment or gradient]
[Centered content — z-20, px-4]
[Fixed bottom controls — above safe area]
```

No header visible in this layout. Navigation is via a close/exit button within the content.

### Accordion Disclosure
Used when a section has optional depth (DailyBrief, settings panels, nested form fields).

- Collapsed state: title row with a chevron, min-h-[52px]
- Expanded state: content slides in below, `max-height` CSS transition
- Never use a modal to show content that fits in an accordion

---

## 8. Component Design

### Buttons

**Size guide:**
| Size | Height | When to use |
|---|---|---|
| `sm` | 36px visual / 44px tap | Dense UI, secondary in a row with larger button |
| `md` | 40px | Default secondary action |
| `lg` | 48px | Primary CTA on a card or form |
| `xl` | 52px | Hero CTA, auth submit |
| Icon-only | 44 × 44px | Toolbar icons, header actions |

Full-width buttons (`w-full`) are preferred for primary CTAs within forms and cards on mobile. Inline buttons (auto-width) are used for paired or grouped actions.

Never place two full-width buttons side by side on mobile — stack them vertically with `gap-3`.

### Input Fields
- Height: 48px (`h-12`)
- Font size: 16px on mobile (`text-base`)
- Label: 11px uppercase semibold, above the field
- Placeholder: descriptive but brief (mobile screens have less horizontal space)
- Error message: below the field, 13px, red

### Textarea
- Min height: 100px
- Font size: 16px on mobile (`text-base`)
- `resize-none` — the field auto-expands up to a max of ~160px, then scrolls internally

### Toggle
- Use the medium size variant on mobile (larger pill, easier to tap)
- Always wrap the toggle and its label in a container that is at least 44px tall
- Label appears to the right of the toggle track

### Dropdown / Select
- Dropdown panel: `max-h-[60vh] overflow-y-auto` — never clips off-screen
- Each item: at least 44px tall
- On iOS, Radix Select does not use the native picker — the custom panel appears above or below the trigger

### Tab Group
- Tab bar: `overflow-x-auto` horizontal scroll, no visible scrollbar
- Right-edge fade gradient signals overflow: a `w-8` gradient overlay on the right edge fades to the background color
- Each tab: at least 44px tall, `min-w-fit`

### Cards
- Border radius: `rounded-2xl` (module-defined radius token)
- Padding: `p-4`
- Tap feedback: subtle `active:scale-[0.98]` or `active:brightness-110` transition (200ms)
- Cards that open a detail view show a right-facing chevron or the cursor changes on hover

### Stat Cards (compact metrics)
- 2-column grid on mobile
- Value: `text-2xl font-black`
- Label: `text-[10px]` uppercase
- Padding: `p-4`

### Progress Ring
- Size: 80px on mobile (down from 120px on desktop)
- SVG must have a `viewBox` and fill its container responsively

### Empty State
- Centered, full-width
- Icon: 48px
- Title: `text-base font-semibold`
- Description: `text-sm text-white/50`
- Action button: `h-10` minimum

---

## 9. Forms & Inputs

### Layout
All forms use a single-column layout on mobile. Never use a multi-column form grid on phone portrait.

### Field Order
Most important / most-used fields come first. Optional fields come last. On multi-step forms, each step contains 1–3 fields maximum.

### Input Modes
Apply the correct `inputmode` attribute to every field to show the right virtual keyboard:

| Field type | inputmode |
|---|---|
| Weight, distance, price | `decimal` |
| Heart rate, reps, sets, age | `numeric` |
| Search, name, text | `text` |
| Email | `email` |
| OTP / PIN | `numeric` + `pattern="[0-9]*"` |
| Date (custom picker) | `none` |

### Autocomplete
| Field | autocomplete value |
|---|---|
| Full name | `name` |
| Email | `email` |
| Current password | `current-password` |
| New password | `new-password` |
| Health, financial, private fields | `off` |

### Range Sliders
- Track height: 24px (`h-6`) — makes the thumb easy to grab on touch
- Full width of the form container
- Show current value as a label that updates as the thumb moves

### Date & Time Inputs
- Use native `<input type="date">` and `<input type="time">` at 16px font size on mobile — the native picker is accessible and works well on both iOS and Android
- If a custom picker is used, it must be at least as accessible as the native one

### Multi-Step Forms
- Show a progress indicator at the top (pill steps or numbered dots)
- Each step fills the available height; overflow scrolls within the step
- Navigation: "Back" (ghost button) and "Continue" (primary button, full-width) at the bottom

### Drag-and-Drop Upload
On mobile, drag-and-drop is not available. Replace upload zones with a tap-to-upload button that opens the system file picker or camera:
```html
<input type="file" accept="image/*" capture="environment" />
```
Show a dashed-border card with a centered upload icon and label ("Tap to upload").

---

## 10. Overlays, Modals & Bottom Sheets

### Modal Behavior on Mobile
On screens below 640px, modals do not appear centered on screen — they appear as **bottom sheets**.

Bottom sheet rules:
- Anchored to the bottom edge: `position: fixed; inset-x: 0; bottom: 0`
- Top corners rounded: `rounded-t-3xl`
- Max height: `90dvh`
- Bottom padding: `env(safe-area-inset-bottom, 0px)` to clear the home indicator
- Entrance animation: slides up from `y: 100%` to `y: 0`
- Dismiss: drag down, tap backdrop, or tap the close button

On 640px and above, modals appear centered with the standard size variants.

### Drag Handle
Add a drag handle (a short rounded bar) at the top of every bottom sheet: `w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-2`.

### Bottom Sheet Sizes
| Content | Max height |
|---|---|
| Confirmation dialogs | `auto` (content-driven, ≤ 50dvh) |
| Form sheets | `90dvh` with internal scroll |
| Full-screen overlays | `100dvh` (used for chat, search) |

### Confirmation Dialogs on Mobile
- Appear as a bottom sheet
- Title: `text-base font-semibold`
- Description: `text-sm text-white/60`
- Actions: stacked vertically, full-width buttons
  - Destructive action: top, danger variant (`h-12`)
  - Cancel: below, ghost variant (`h-12`)

### Auth Modal
The authentication modal follows the bottom sheet pattern on mobile.

| State | Layout |
|---|---|
| Identity choice | Two stacked choice cards, `h-16` each, full-width |
| Login | Email field + password field + submit button (`h-14`, full-width) |
| Register | Same as login + confirm password field |
| Verify (OTP) | 6 cells in a row, `h-14` per cell, `gap-2`, `inputmode="numeric"` |
| Vault handshake | Centered progress ring + status label |

### Toast Notifications
- Position: top of screen, `top: calc(env(safe-area-inset-top) + 8px)`
- Width: full screen edge-to-edge (`left-4 right-4`)
- Dismiss: tap the toast or it auto-dismisses after ~4 seconds
- Stack: newest on top, up to 3 visible at once

---

## 11. Module Screen Patterns

### Hub
- Default view on mobile: card grid (`grid-cols-2 gap-3`)
- Each module card shows the module icon, name, and a brief status indicator
- The 3D network view is only available on tablet and desktop — auto-downgrade to cards on mobile
- System status gauges (NSV fields) are displayed below the card grid in a single-column layout

### Agnes (Wellness / Therapy)
**Selecting state:**
- Full-screen background environment (3D or gradient fallback)
- Centered hero content: heading, subtitle chip, session type cards in a single column
- Each session card is a glass card with a title, description, and a primary CTA button (`h-12`)
- Session history is hidden by default; accessible via a settings/history icon that opens a bottom sheet

**Session state:**
- Full-screen chat overlay (Single Agent Layout pattern)
- Content panels (belief graph, mood tracker) are visible beneath the chat FAB when the overlay is closed
- The chat overlay fills the entire screen with message history and a compose bar

**Somatic state:**
- Full-screen immersive layout
- Breathing/grounding exercises centered in the viewport
- Controls fixed at the bottom above the safe area

### Titan (Training & Health)
**Header area:**
- Readiness score and key biological signals in a 2-column stat grid
- Always visible at the top, above the tab bar

**Tab content:**
- Training: routine cards in a single-column list; workout logger with full-width exercise rows
- Sleep: time picker (native), quality slider (full-width), notes textarea, full-width submit
- Recovery: score ring (80px), checkins with toggle rows, bottom sheet for recovery plan
- Cycles: phase selector as pill tabs, symptom toggles in a 2-column grid
- Biomarkers: weight chart (7-day condensed), single-column input form

**Quick log bar (module footer):**
- Fixed at the bottom of the screen, above the safe area
- Text input (`text-base`, 16px) with a shortened placeholder on mobile
- Icon buttons at 40 × 40px
- Suggestion chip appears above the bar when the AI offers one
- Quick log drawer (full-screen bottom sheet) for detailed structured entry

### Atlas (Planning)
**Focus view:**
- Full-screen immersive layout
- Active task displayed in large text (`text-2xl`)
- Timer display: `text-6xl`
- Action buttons fixed at the bottom (`h-14`)

**Month planner:**
- Full-width calendar
- Day cells: `min-h-[48px]`, tap to open a bottom sheet with that day's tasks

**Task rows:**
- `min-h-[56px]` per row
- Complete: tap the circle icon (`h-11 w-11`)
- More actions: long-press or swipe-left to reveal an action row

### Soma (Medical)
- Readiness score ring (100px) centered at the top
- Status grid: `grid-cols-2` stat cards
- All entry forms: single-column, `h-12` inputs, `text-base` font
- Document upload: tap-to-upload (no drag-and-drop)
- Camera capture: native file input with `capture="environment"`

### Ledger (Finance)
- Summary stat cards: `grid-cols-2`
- Transaction list: `min-h-[56px]` rows with swipe actions
- Amount: right-aligned `text-base`
- Quick log panel in the module footer (same pattern as Titan QuickLogBar)
- Filter bar: horizontal scrollable pill row above the transaction list

### Scout (Research)
- Research artifacts: single-column card list
- Evidence source badges: horizontal scroll row
- Signal canvas: `h-[200px]` on mobile, `h-[300px]` on tablet; min 44px per bubble
- Export dialog: bottom sheet with format options

### Forge (Code & Comms)
- Mode selector: horizontal pill row, `overflow-x-auto`
- Code editor: monospace `text-base` textarea, line numbers hidden on mobile, full-width run button below
- Output panel: below the editor, `min-h-[100px]`
- Other modes (comms, docs, life): use the Single Agent Layout chat overlay pattern

### Profile
- Single-column layout for all four tabs
- Avatar: centered, 80 × 80px, tap to change
- All inputs: `h-12`, `text-base`
- Save/submit: full-width primary button (`h-12`)

### Notifications
- Filter pills: horizontal scroll row (`All / Unread / Critical`)
- Notification rows: `min-h-[64px]`, left priority indicator bar
- Reminder settings: accordion rows per module

---

## 12. Chat & AI Interaction

### Chat Overlay Layout
```
[Overlay header — module name + close button]
[Message list — flex-1, overflow-y-auto]
[Compose bar — sticky bottom-0 within the overlay]
```

The compose bar uses `position: sticky; bottom: 0` within the overlay's scroll container. Do not use `position: fixed` for the compose bar — fixed elements do not move with the virtual keyboard on iOS.

### Message Bubbles
| Role | Max width | Alignment |
|---|---|---|
| User | 85% of container | Right |
| AI | 92% of container | Left |

Code blocks inside messages: `overflow-x-auto` horizontal scroll.

### Compose Bar
- Textarea: `text-base` (16px), `resize-none`, auto-expands to ~3 lines maximum before scrolling internally
- Send button: `h-11 w-11`
- Camera/attachment icon (where present): `h-11 w-11`

### AI Action Confirmation
When the AI validates a user action (e.g. logging a workout), a confirmation card appears inline in the chat:
- Full-width within the chat overlay
- Approve button: `h-12` primary
- Dismiss: `h-10` ghost

Confirmation dialogs triggered by AI actions use the bottom sheet pattern (see Section 10).

### Streaming
AI responses stream in token by token. The message bubble expands naturally. A typing indicator (three dots) appears while the first tokens arrive.

---

## 13. Gestures

| Gesture | Action |
|---|---|
| Swipe right on task row | Mark complete |
| Swipe right on notification | Dismiss |
| Swipe left on task or notification | Reveal action buttons (defer, delete) |
| Drag bottom sheet down | Dismiss the sheet |
| Long press on task card | Open context menu |
| Long press on calendar cell | Add event / log |
| Pinch on graph/canvas | Zoom |
| Tap outside modal backdrop | Dismiss modal |

### Haptic Feedback
Use `navigator.vibrate(10)` (a 10ms pulse) on:
- Destructive action confirmation (delete, danger)
- Successful form submit

Do not vibrate on every tap — reserve haptics for meaningful moments.

---

## 14. Keyboard & Input Behavior

### Virtual Keyboard
When the virtual keyboard opens, the visible viewport shrinks. Always use `100dvh` (dynamic viewport height) for full-screen containers — this adjusts automatically.

The compose bar in chat and the submit button in forms must remain visible above the keyboard. Achieve this with `position: sticky; bottom: 0` on the compose/submit area inside a scrollable container.

Listen to `window.visualViewport.resize` to reposition any elements that must track the visible viewport boundary:
```js
window.visualViewport?.addEventListener('resize', () => {
  // update position of floating elements
});
```

### Autocorrect & Autocapitalize
| Field type | Settings |
|---|---|
| Username, code, numeric | `autocorrect="off" autocapitalize="none"` |
| Natural language chat input | `autocorrect="on" autocapitalize="sentences"` |
| Name fields | `autocapitalize="words"` |
| Email | `autocapitalize="none"` |

---

## 15. Performance

### Backdrop Blur Budget
Each element with `backdrop-filter: blur()` creates a composited GPU layer. On mobile, limit simultaneous blurred layers to **5 maximum**. Use `backdrop-blur-xl` (16px) instead of `backdrop-blur-2xl` (24px) on mobile for the strongest surfaces.

### Particle / 3D Effects
3D environments (Agnes, Hub) reduce their particle count on mobile. Use `isMobile` (`window.innerWidth < 768`) to halve particle count. If WebGL is unavailable, render a CSS radial gradient fallback matching the 3D color scheme.

### Background Processing
Pause background agent loops and scheduled services when the app is hidden:
```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) service.pause();
  else service.resume();
});
```

### Animation Duration
Page transitions and sheet entrance animations use `200ms` on mobile (vs `400–500ms` on desktop). Faster transitions feel more responsive on touch.

All animations respect `prefers-reduced-motion`: if set, replace motion with an immediate opacity transition.

### Lazy Loading
- Module pages: lazy-loaded via `React.lazy()`
- 3D environments: lazy-loaded separately (large Three.js bundle)
- Images: `loading="lazy"` + `decoding="async"`

---

## 16. Verification

Before shipping any screen or component:

1. **375px viewport test.** View the screen at 375px width. Verify: no horizontal overflow, no text below 11px, tab bar scrollable, header shows only mobile elements.

2. **iOS auto-zoom test.** Tap any input field. The viewport must not zoom. All inputs must be at 16px on mobile.

3. **Touch target audit.** Tap every interactive element. No element should require precise aiming. Nothing smaller than 44 × 44px.

4. **Keyboard visibility test.** Open any form with an input near the bottom of the screen. Focus the input. The submit button or compose bar must remain visible above the keyboard.

5. **Bottom sheet test.** Trigger every modal, confirm dialog, and auth modal. Verify: slides up from the bottom, has a drag handle, dismisses on drag-down and backdrop tap.

6. **Chat overlay test.** Open the chat overlay in each module. Verify: full-screen, message list scrolls, compose bar stays above keyboard, close button is reachable.

7. **FAB clearance test.** On modules with a footer bar (e.g. Titan QuickLogBar), verify the FAB sits above the bar. Verify the chat FAB is not visible when the chat overlay is open.

8. **Tablet test at 768px.** Verify the chat panel docks at the right. Verify the header subtitle row becomes visible.

9. **TypeScript check.** Run `npx tsc --noEmit` after all changes.
