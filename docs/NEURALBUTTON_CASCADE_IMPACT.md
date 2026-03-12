# NeuralButton Redesign — Full Cascade Impact Analysis

> **Scope:** Every component and module in the Agnes/Nexus codebase audited against the shift from
> solid opaque fills + `font-bold uppercase tracking-[0.15em]` → glass tints + `font-medium tracking-[0.04em]` natural case.
>
> **Signal convention used throughout:**
> 🔴 Critical — ships broken  
> 🟠 High — ships inconsistent, user-facing friction  
> 🟡 Medium — coherence debt, noticeable to an attentive user  
> 🟢 Low — minor polish gap

---

## 1. Typography Cascade

The old button typography (`uppercase tracking-[0.15em] font-bold`) was a *signature register* — other elements
used it, but buttons matched it so they felt *at home* in the system. Now that buttons have moved to
`font-medium tracking-[0.04em]` natural case, that signature register is still live everywhere else, and every
element using it will now read as **more "button-like" than actual buttons.**

### 🔴 Exact tracking match — these will be indistinguishable from old buttons

| Component | Exact classes | Problem |
|---|---|---|
| `SectionHeader.tsx:25` | `text-[11px] font-semibold uppercase tracking-[0.15em]` | **Identical tracking to old button.** Section label now screams at old-button volume while actual buttons whisper. |
| `NeuralModal.tsx:101` | `text-[10px] uppercase font-semibold tracking-[0.15em]` | Modal subtitle is typographically louder than modal action buttons. |
| `InsightSourceBadge.tsx:72` | `text-[10px] font-bold uppercase tracking-[0.15em]` | Renders as `<button>` when `onClick` is set. Looks more like an old button than a new one. |
| `ModuleLayout.tsx:202` | `tracking-[0.08em] sm:tracking-[0.15em] uppercase font-bold` | The module name in the header *peaks* at old-button tracking on `sm:` viewports. |
| `LandingPage.tsx:127` | `uppercase tracking-[0.1em] sm:tracking-[0.15em]` | Feature card subtitles. Grows to old-button tracking on larger screens. |

### 🟠 Near-match tracking — these will compete visually

| Component | Classes | Problem |
|---|---|---|
| `NeuralTabGroup.tsx:206` | `font-bold uppercase tracking-[0.08em] md:tracking-[0.12em]` | Tabs are **bold + uppercase + 3× the button tracking**. After the redesign tabs look more like "buttons" than buttons. This is arguably the most dissonant pairing in the app. |
| `ProgressRow.tsx:36` | `uppercase tracking-[0.12em] text-[9px] font-semibold` | Metric row labels — present in TitanReadiness, LedgerDashboard, SomaDashboard. Now more visually prominent than action buttons on the same page. |
| `StatCard.tsx:39` | `text-[9px] uppercase tracking-[0.3em] font-semibold` | `tracking-[0.3em]` is 7.5× the new button tracking. Stat labels scream; buttons murmur. Exact opposite of the intended hierarchy. |
| `PanelLabel.tsx:28` | `text-chip text-white/50 tracking-[0.25em]` | Panel section labels at `tracking-[0.25em]` — 6× button tracking. |
| `GuidedIntakeFrame.tsx:59` | `font-black italic uppercase tracking-widest` | Onboarding frame title. `tracking-widest` = Tailwind's `0.1em` but `font-black` = 900 weight. Screams during the most sensitive UX moment in the app. |
| `GlobalFAB.tsx:155` | `font-bold uppercase tracking-[0.12em]` | FAB speed-dial labels — every action label uses old-button register. |
| `DataSyncToast.tsx:106` | `font-bold uppercase tracking-widest` | Toast header. |
| `HubPage CardsView.tsx:95` | `font-black uppercase tracking-[0.6em]` | `tracking-[0.6em]` — the single most aggressive tracking value in the codebase. The Hub section divider between module cards is now the **loudest text element on any screen in the app**. |
| `NeuralInput.tsx:22` | `font-semibold uppercase tracking-[0.1em]` | Form input labels are 2.5× the new button tracking. The label shouts; the submit button whispers. Inverted emphasis hierarchy in every form. |
| `GuestModePanel.tsx:61` | `uppercase tracking-[0.12em] font-semibold` | Limitation list items. *Body text* in uppercase bold tracking — not a header. |

### 🟡 Minor tracking — not dangerous, but contributes to system-wide noise

- `ChatInterface.tsx:197` — Action chip labels: `font-semibold uppercase tracking-wider`
- `ChatInterface.tsx:508` — Scroll-to-bottom button: `font-semibold uppercase tracking-[0.1em]`
- `HubControls.tsx:101` — ReactiveGauge labels: `uppercase font-bold tracking-wider`
- `TitanReadiness.tsx:80` — "Performance Coach" label: `font-bold uppercase tracking-[0.12em]`
- `LandingPage.tsx:85` — Hero badge: `uppercase tracking-[0.1em] sm:tracking-[0.15em]`

### The core problem stated plainly

Before the redesign, every uppercase-bold-tracked element in the UI was *at least* as loud as a button — which was fine because buttons had their **fill color** as the primary differentiator, not their typography. Now that buttons have surrendered their fill, *typography is the only dimension left* to signal "I am a CTA." And we just made buttons quieter in every typographic dimension simultaneously. Every other element that kept the old type register now outshouts the buttons.

---

## 2. Surface Hierarchy Collapse

The old depth stack from front to back was clear:
```
Button (solid fill, bloom shadow) → Card (glass) → Background (#0a0a0f)
```

The new stack is:
```
Button (glass 8-15%) ≈ Card (glass 3-6%) ≈ Background (#0a0a0f)
```

### 🔴 Opacity overlap — buttons and cards are indistinguishable at rest

| Component | Background | Button primary bg |
|---|---|---|
| `GlassCard.tsx:20` | `bg-white/[0.03]` | `bg-{color}/[0.08]` |
| `SurfaceCard` (`surface-card` class) | `bg-white/[0.04]` (from `index.css:--surface-card-bg`) | `bg-{color}/[0.08]` |
| `SurfaceCard` (`strong` variant) | `bg-white/[0.06]` | Overlaps NeuralButton hover state `bg-{color}/[0.15]` |
| `NeuralModal.tsx:89` header | `bg-{color}/10 border-{color}/20` | **Identical** to NeuralButton primary rest state |
| `GuidedIntakeFrame.tsx:48` | `bg-black/40 border-white/10` | Different tone — black vs. tint. Acceptable. |

The `NeuralModal` header is the worst offender: it already uses `bg-indigo-500/10 border-indigo-500/20` (exactly matching the new primary button rest state). A `NeuralButton` primary placed inside a `NeuralModal` renders against a surface with the **same glass tint** — the button visually disappears into its container.

### 🟠 Hover state collision — cards with hover look more interactive than buttons

- `GlassCard` with `glow={true}`: `shadow-[0_0_40px_rgba(99,102,241,0.2)]` — this card glow bloom (20% opacity, 40px) is stronger than the new button depth shadow (7%, 16px). A glowing card now looks more "primary action" than a primary button.
- `ModuleCard` in HubPage: `hover:bg-white/[0.05]` — same as NeuralButton ghost hover state. Hub module cards now have the *same hover affordance* as ghost buttons.
- `ChatInterface` attachment drawer items: `bg-white/5 border border-white/5 hover:bg-white/10` — these render as static tiles but their hover state exactly matches NeuralButton ghost hover.

### 🟡 Depth signal confusion on modals

`NeuralModal` uses `bg-[#05050a]` for the modal body (nearly void-black) with `border-white/10`. When a primary NeuralButton is placed in the modal footer, the button's glass tint sits against a near-black surface — this is actually fine contrast-wise, **but** the modal header (`bg-{color}/10`) looks more elevated than the action button. The affordance hierarchy within the modal is inverted: decoration looks interactive, interactive looks decorative.

---

## 3. Color Accent Consistency

### 🔴 NeuralTabGroup active pill is now identical to NeuralButton primary

`NeuralTabGroup.tsx` active pill: `bg-{color}/10 border-{color}/20`  
`NeuralButton` primary rest: `bg-{color}/[0.08] border-{color}/25`

These are within 2 percentage points of each other. A tab row and a row of buttons are now **visually the same element type**. This is critical because every module uses a `NeuralTabGroup` directly above content areas that contain `NeuralButton` actions.

### 🟠 ChatInterface THEMES `bgGlow` dominates after button desaturation

`ChatInterface.tsx:67` — each theme has `bgGlow: 'bg-{color}/30'`. This is a 30%-opacity focus-state bloom behind the textarea. With buttons now at 8% fill, the blur bloom around the input area is **3.75× the opacity of any button**. The glow from *typing* outweighs the glow from *submitting*. The visual hierarchy of "where to look" is inverted in the chat pane.

### 🟠 Module header accents now compete with buttons for color ownership

`ModuleLayout.tsx:202` header title uses `text-{color}-400` (e.g. `text-indigo-400` for Agnes). `NeuralButton` primary text is `text-indigo-300`. The module title is *one stop darker* than the button text, making them feel like the same UI family — navigation chrome and interactive elements share a color register.

### 🟡 LandingPage hero badge and feature card subtitles

`LandingPage.tsx:85` badge: `border-violet-500/30 bg-violet-500/10 text-violet-200` — this is structurally the same as a NeuralButton primary with `themeColor='indigo'`. The marketing badge and the primary CTA button are the same shape, same border, same fill, now the same type weight. The badge reads as "another button."

### 🟡 `InsightSourceBadge` is module-colored but unstyled as interactive

When `onClick` is provided it renders as a `<button>`. At rest it uses `border-white/10 bg-white/[0.03]` — no color accent. When it becomes interactive, it gets `hover:bg-white/[0.06] hover:border-white/15`. This is weaker hover state than the new `NeuralButton ghost` variant. An interactive badge is visually softer than an intentionally non-interactive ghost button.

---

## 4. Interactive Affordance Signals

The old solid button created a clear "interactable" mental model through fill alone. The glass button shifts the affordance signal to **border + cursor + motion** — but only if those signals are not shared by non-interactive elements.

### 🔴 These non-interactive elements now look tappable

| Element | Why it looks like a button now |
|---|---|
| `GlassCard` with border | `border-white/10`, rounded, glass tint — all three button affordance signals present |
| `SurfaceCard` base variant | Same |
| `NeuralModal` header tile | `bg-{color}/10 border-{color}/20 rounded-panel` — has the accent color, the border, the rounding |
| Stat tiles in TitanReadiness | `SurfaceCard`-wrapped metrics with accent text — look like button cards |
| Feature cards in LandingPage | `rounded-2xl border border-white/10 bg-white/[0.03]` — same glass language as a large NeuralButton secondary |

### 🟠 These interactive elements no longer look tappable

| Element | Why affordance is now lost |
|---|---|
| `NeuralButton` primary on `GlassCard` background | Button fill ≈ card fill. The button disappears into the container. |
| `NeuralButton` primary in `NeuralModal` header | Header bg ≈ button bg (both ~10%). |
| `GuestModePanel` "Authenticate Identity" `size="lg"` | Large glass button on a `SurfaceCard` `strong` variant. Very low contrast between the two surfaces. |
| Empty state CTAs | `EmptyState` container is `border-dashed border-white/15` — a dashed glass container. The CTA button inside has the same surface treatment. |

### 🟡 Hover-state over-extension from non-interactive elements

`ModuleCard` in Hub (`motion.button`) has `whileHover={{ y: -6, scale: 1.02 }}` — a strong 3D lift animation. `NeuralButton` has `whileHover={{ scale: 1.01 }}` — a barely-perceptible 1% scale. Hub module cards now *feel more interactive* through motion than the actual buttons inside those modules.

---

## 5. Onboarding Flow Analysis

### 🔴 GuestModePanel — authentication CTA at risk

**Components:** `GuestModePanel.tsx`, used in `OrchestratorPage`, and any module's guest path.

The primary CTA is:
```tsx
<NeuralButton size="lg" className="w-full" onClick={() => setShowAuth(true)}>
  <Shield className="w-4 h-4" /> Authenticate Identity
</NeuralButton>
```

This is `size="lg"` with default `themeColor="indigo"`. Rendered inside a `SurfaceCard variant="strong"` (`bg-white/[0.06]`). The button fill at rest is `bg-indigo-500/[0.08]` — which is *less opaque* than the card it sits inside. The card outweighs the button. A first-time user in guest mode is supposed to authenticate here. This CTA is now the least visually prominent element on the card.

### 🔴 ModuleLayout vault lock screen — single CTA disappears into card

```tsx
<NeuralButton size="xl" className="w-full" onClick={() => setShowAuth(true)}>
  Unlock {title} Vault
</NeuralButton>
```

This button renders inside a `rounded-card border border-white/10 bg-white/[0.02]` container. The card and the button now share near-identical surface language. On a screen whose *entire purpose* is to prompt vault unlock, the CTA has the visual weight of a card decoration.

### 🔴 LandingPage hero CTA — marketing conversion point

```tsx
<NeuralButton size="lg" className="w-full sm:w-auto" onClick={goHub}>
  Enter Neural Hub <ArrowRight className="w-4 h-4" />
</NeuralButton>
```

Background: `bg-violet-600/12` radial bloom at the top. The button is `themeColor="indigo"` by default (indigo is the closest hue to violet). A glass indigo button against a violet-tinted background has approximately 6-8% effective opacity delta — essentially invisible to someone not specifically looking for a button. This is the *first button a new user ever sees* on the product.

### 🟠 Agnes Onboarding (`GuidedIntakeFrame`)

The onboarding frame does not use traditional "Next/Continue" buttons — it uses conversational chat. The CTA is the ChatInterface send button, which **retains its solid fill** (`bg-indigo-600`). The onboarding frame itself, however, uses `font-black italic uppercase tracking-widest` for the title — visually heavier than every NeuralButton in the same screen. The heading shouts; the chat submit confirms. This is actually acceptable, but incongruous.

### 🟠 Titan / Ledger / Atlas Onboarding

All three use `GuidedIntakeFrame` + `NexusChat` — same chat-based onboarding. Same analysis as Agnes above. Safe for the send action. Risky for any module-specific NeuralButton CTAs within the intake flow (e.g., Titan's "Complete Calibration" type submit action).

### 🟡 Atlas / Ledger post-onboarding empty state flows

These modules drop into empty-state screens with a single `EmptyState` action prop after onboarding. See Section 7 below.

---

## 6. Form States

### 🟠 Form label typography inverts the emphasis hierarchy

**`NeuralInput.tsx:22`:**
```
label: text-[11px] font-semibold uppercase tracking-[0.1em]
input: bg-black/40 border-white/10 (correct — dark and distinct)
button (primary): font-medium tracking-[0.04em] bg-{color}/[0.08]
```

The label is visually louder than the submit button in every form in the app. A user scanning a form reads: *Label (shouts) → Field (clear) → Submit (whispers)*. The perceived action hierarchy is: label > field > submit. It should be: field ≥ submit > label.

### 🟡 Input vs. button surface distinction

Input: `bg-black/40 border-white/10` — this is specifically **black-tinted** (not color-tinted), distinct from the button's color-tinted glass. This distinction holds. However, on focus: `border-indigo-500/50 ring-1 ring-indigo-500/20` — the focused input now has a *stronger* colored border signal than the primary button at rest (`border-indigo-400/25`). A focused input reads as the primary interactive element, not the submit button.

### 🟡 Cancel button (ghost variant) vs. focused input

NeuralButton ghost: `bg-transparent hover:bg-white/[0.05] border-transparent hover:border-white/[0.08] text-white/45`
Focused NeuralInput: `border-indigo-500/50 ring-1 ring-indigo-500/20`

A focused input has more visual presence than a ghost button sitting next to a primary button in a modal footer. The visual ordering reads: input > primary ≈ cancel — when it should be: primary > input > cancel.

---

## 7. Empty States

### 🟠 Empty state CTAs are buried in their own container

**`EmptyState.tsx`:**
```tsx
<div className="surface-card border-dashed border-white/15 ...">
  <div className="bg-white/5 border border-white/10">  {/* icon container */}
  <div>{action}</div>  {/* CTA — a NeuralButton primary */}
```

The outer container is a dashed glass card. The inner icon wrapper is a glass tile. The action button is a glass NeuralButton primary. Three layers of glass. On a `#010103` background the stacking is:

```
Background (void) → Empty state card (3-4%) → Icon tile (5%) → Action button (8-15%)
```

The opacity steps are too small — 2-4% deltas are imperceptible at normal viewing distances. The CTA does not visually *escape* its container.

### 🟡 Dashed border confuses the container's purpose

`border-dashed border-white/15` on the empty state container is the only dashed-border element in the system. It correctly signals "this area is empty/unfilled." But after the button change, the container and the glass button inside it look like the same *family* of element. The button should visually break out of the container rather than blend into it.

---

## 8. Components Requiring Complementary Redesign

### 🔴 `ChatInterface.tsx` — Send Button

**Location:** Lines 61-141 `THEMES` object, Line 640 `theme.btn` usage.

```tsx
// Current (SOLID — not using NeuralButton):
btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
// ...
<button className={cn("w-11 h-11 rounded-2xl ... shadow-xl", theme.btn)}>
  <Send className="w-5 h-5 text-white" />
</button>
```

This is a **raw HTML `<button>`** using a separate `THEMES` map that is completely disconnected from the NeuralButton system. After the redesign, this is the **only solid-fill interactive element in the entire application.** Every module's primary action sits in this chat panel. This split system — where the most-used interactive element ignores the design system — was survivable when everything was solid. Now it's a glaring inconsistency.

**Decision required:** Either (a) keep the send button solid and formally document it as a *deliberate exception* for contextual dominance (chat send buttons are typically solid even in glass-heavy interfaces), or (b) migrate ChatInterface to use `NeuralButton` and accept a softer send affordance. Option (a) is defensible UX reasoning. Option (b) creates consistency but weakens the primary chat action.

**Also note:** The "Retransmit" button at Line 550 overrides the glass system with `className="bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20"` — this caller override breaks the glass contract by forcing a solid fill back onto a NeuralButton.

### 🔴 `NeuralTabGroup.tsx` — Must change to match new button register

**Current:** `font-bold uppercase tracking-[0.08em] md:tracking-[0.12em]`  
**Problem:** Active tabs look more like old buttons than new buttons. Tabs and primary actions read as the same element type.

**Required change:** Move to `font-medium` natural case, reduce tracking to ≤ `0.05em`. The active pill differentiation should carry through background fill (the `bg-{color}/10 border-{color}/20` pill) not typography. This is a behavioral change — tab labels must become sentence-case.

Also: The active pill's `blur-md` glow element inside the pill (`opacity-20 blur-md` on the `underline` div) is a vestigial bloom. At 20% opacity and `blur: 12px`, it's similar to the old button glow. Remove or reduce to maintain the depth-only shadow convention.

### 🟠 `SectionHeader.tsx` — Label register must change

**Current label:** `text-[11px] font-semibold uppercase tracking-[0.15em]`  
**Problem:** Exact old-button tracking. Section labels now read with more CTA energy than actual buttons.

**Options:**
1. Drop the label to `font-medium tracking-[0.06em]` natural case — creates clear hierarchy below buttons
2. Keep uppercase but drop to `tracking-[0.08em]` and `font-medium` — maintains "label" feel, reduces competition
3. Switch label to a colored accent line (`border-l-2 border-{accentColor} pl-3`) instead of text tracking — differentiates through shape, not typography

The `title` (H2 uppercase bold) is fine — it's sized differently enough to not compete. The `label` (caption above title) is the problem.

### 🟠 `NeuralInput.tsx` — Label typography and focus ring

**Change 1:** Drop label from `font-semibold uppercase tracking-[0.1em]` → `font-medium tracking-[0.04em]` or sentence case `font-medium tracking-[0.02em]`. Form labels should be quieter than submit buttons, not louder.

**Change 2:** Focus ring `border-indigo-500/50 ring-1 ring-indigo-500/20` currently signals more strongly than button primary border `border-indigo-400/25`. Options: (a) reduce focus ring to `border-indigo-400/30 ring-1 ring-indigo-400/10`, or (b) adopt per-module theming via prop so the input focuses in the same hue as the surrounding buttons.

**Change 3:** The `icon` prop hardcodes `group-focus-within:text-indigo-400` — will not adapt to non-indigo modules. Should use a `themeColor` prop or CSS variable.

### 🟠 Form footers (all `NeuralModal` children)

Every modal in the app ends with a Cancel + Primary footer. With glass buttons, this pattern needs a consistent footer wrapper that gives the primary action a higher surface (e.g., `border-t border-white/5 bg-black/20 px-8 py-5`) so the buttons render against a slightly darker container than the modal body. Without this, primary + cancel collapse into the modal's glass surface.

### 🟡 `GlobalFAB.tsx` — Anchor button and labels

Anchor button: `bg-white/[0.04] border-white/[0.08]` — already glass language, consistent with NeuralButton secondary. ✓

Speed-dial item buttons: `bg-{color}/15 hover:bg-{color}/25 border-{color}/20` — slightly more opaque than NeuralButton primary (15% vs 8%). This is fine — the FAB is elevated (z-60) above all content so slightly stronger fill is warranted.

Speed-dial label pills: `font-bold uppercase tracking-[0.12em]` — these tooltip labels use old-button register. Change to `font-medium tracking-[0.04em]` natural case.

### 🟡 `InsightSourceBadge.tsx` — Interactive affordance

When `onClick` is set, the badge becomes a `<button>`. Its hover state (`hover:bg-white/[0.06] hover:border-white/15`) is weaker than NeuralButton ghost hover (`hover:bg-white/[0.05] hover:border-white/[0.08]`). It also lacks `cursor-pointer` explicitly. It has a `focus:ring-2 focus:ring-white/20` but that's the only interactive signal.

Required: Add `cursor-pointer` when `onClick` exists. Increase hover state to match ghost variant. Change typography from `font-bold uppercase tracking-[0.15em]` to match the new button register — these badges share exact old-button tracking.

### 🟡 `DataSyncToast.tsx` — Raw button implementations

The three action buttons (Update, Ignore, Ask Module) are raw `<button>` elements, not NeuralButton. They predate the design system.

- "Update": `bg-white/10 border border-white/15` — 2.5× more opaque than NeuralButton secondary. Reads as the old button style.
- "Ignore": `text-white/50 hover:text-white/80 hover:bg-white/5` — similar to NeuralButton ghost. OK.
- "Ask Module": `text-white/50 hover:bg-white/5` — OK.

The "Update" button should be migrated to `<NeuralButton size="sm" variant="primary">` or at minimum dropped to `bg-white/[0.05]` to match the new system.

### 🟡 `HubViewSwitcher` — Custom tab implementation

Active state: `bg-white/15 text-white shadow-sm` — 15% white fill, more opaque than NeuralButton primary (8%). The Hub view switcher appears more interactive than buttons inside individual module views. Not critical since it's a structural nav element, but the opacity step should be harmonized.

### 🟢 `GlassCard.tsx` + `SurfaceCard.tsx` — De-affordance required

Neither card should respond to hover with visual feedback unless the caller explicitly makes them interactive. Currently `GlassCard` has no hover state, but callers routinely wrap them in `motion.div` with hover animations. The concern is surface-level — no code change needed in the components themselves, but a design guideline should be established: **glass cards do not respond to hover unless they are `<button>` elements.**

---

## 9. Module-by-Module: What Will Look Wrong Right Now

### Landing Page (`LandingPage.tsx`)

🔴 **Hero CTA invisible**: `NeuralButton size="lg"` "Enter Neural Hub" is the primary conversion point. Glass indigo against the `bg-violet-600/12` radial bloom = near-invisible. This is the one place in the app where a solid or semi-solid fill is unambiguously justified by UX. The button needs `size="lg"` + elevated treatment (e.g., `bg-indigo-500/20 border-indigo-400/40` at rest) or a special `hero` variant.

🟠 **Ghost vs. primary hierarchy lost**: "Sign In" (ghost) and "Get Started" (primary) in the nav use the same `themeColor="indigo"`. Ghost text is `text-white/45`; primary text is `text-indigo-300`. At small sizes in the nav, these look like two secondary buttons. The primary CTA advantage over ghost is now only the border (ghost has transparent border) — which is a 2px difference.

🟡 **Feature card subtitles look like buttons**: `uppercase tracking-[0.1em] sm:tracking-[0.15em]` text that grows to old-button tracking. The "Psychoagnes module" subtitle of the Agnes card will look like a button label.

---

### Hub (`HubPage.tsx`, `CardsView.tsx`, `HubControls.tsx`)

🔴 **`NeuralButton` "Sync Now" overrides glass**: `HubBottomDashboard` passes `className="bg-amber-600 hover:bg-amber-500 shrink-0"` to `NeuralButton` — a direct solid-fill override. This bypasses the glass system. After the redesign, this button is the second solid-fill button in the app (after ChatInterface send). Inconsistent with every other button in Hub.

🟠 **ModuleCard is more interactive-looking than any NeuralButton**: `motion.button` with `whileHover={{ y: -6, scale: 1.02 }}`, `bg-black/60 border-white/20`. The 6px lift animation and 20% border are more assertive signals than NeuralButton's `scale: 1.01` and 25% border. The container navigation elements feel more "tappable" than the action buttons.

🟡 **`tracking-[0.6em]` section divider**: "SOUL CORE INTERFACE" label. The single most aggressively tracked element in the codebase. Contrast this with buttons at `tracking-[0.04em]` — a 15× difference. The decorative label is the visual anchor of the Hub page; the action buttons are noise.

🟡 **HubViewSwitcher active state too opaque**: `bg-white/15` active vs `bg-indigo-500/[0.08]` NeuralButton primary. The view switcher buttons are 87% more opaque than module action buttons.

---

### Agnes (`AgnesPage.tsx`, `AgnesOnboarding.tsx`)

🟠 **Header title at old-button tracking**: `tracking-[0.15em] uppercase` at `sm:` size. The "AGNES" module title visually registers as the most button-like text element on the page because it uses identical tracking to the old button system.

🟠 **Somatic session picker buttons**: The `SomaticSessionPicker` component (not audited in full) likely has exercise type selector buttons. In a therapy context, unclear affordance on session-type selectors is a UX safety concern — users may not realize they're selecting a session type vs. reading a label.

🟡 **GuidedIntakeFrame `font-black italic uppercase tracking-widest`**: Onboarding heading is the typographically loudest element in the intake flow. Combined with glass chat buttons, the tone feels interrogative rather than welcoming. Reduce to `font-bold` natural case.

---

### Titan (`TitanPage.tsx`, `TitanReadiness.tsx`)

🔴 **NeuralTabGroup is bolder than all action buttons**: Tabs use `font-bold uppercase tracking-[0.12em]`. The Training / Progress / Cycles / Sleep tabs are the most visually assertive text in the module. All NeuralButton CTAs below them (workout log, add routine, etc.) are softer in every typographic dimension. Navigation reads louder than action.

🟠 **QuickLogBar inline submit**: The `QuickLogBar` component is an inline NL input + submit. The submit button (likely a NeuralButton) is submitting raw workout data. Glass buttons on a narrow bar make the submit easy to miss, particularly on mobile where target area is already constrained.

🟡 **"Performance Coach" label `font-bold uppercase tracking-[0.12em] text-orange-400`**: This is a section label, not a button, but it uses the same color+tracking as the old button register. Reads as "tap here to get coaching" which it is not.

---

### Soma (`SomaPage.tsx`, `SomaDashboard`)

🟠 **Medical context + glass buttons = low urgency signal**: Soma is a health biomarker tracking module. "Log Vitals," "Add Reading," "Update Biomarker" are actions where missed taps have data integrity consequences. Glass buttons communicate *optional / exploratory* — the wrong register for health data entry. Soma-specific buttons should be considered for elevated treatment (stronger border opacity: 35-40% rather than 25%).

🟡 **VitalsGrid stat tiles look like tappable cards**: If VitalsGrid wraps metrics in SurfaceCard-style containers with hover states, they'll now match glass button visual weight. Not audited in full but the pattern is consistent across modules.

---

### Ledger (`LedgerPage.tsx`, `LedgerDashboard.tsx`)

🔴 **`StatCard.tsx` label tracking-[0.3em] creates extreme hierarchy inversion**: Every Ledger stat (Monthly Income, Total Expenses, Net Balance) has a label at `tracking-[0.3em]` — 7.5× the new button tracking. The labels for numbers are typographically dominant over the CTA buttons to add transactions, update budgets, etc. Financial data labels scream; financial action buttons whisper.

🟠 **`SectionHeader` label throughout LedgerDashboard**: Multiple `SectionHeader` calls with `label` prop at `tracking-[0.15em]`. "INCOME & EXPENSES," "BUDGET OVERVIEW" etc. look more like button labels than the buttons themselves.

🟡 **Cognitive load + glass buttons**: Ledger is the highest cognitive-load module (financial data, budgets, debt). Subtle buttons increase task friction for data entry. Add Transaction, New Goal, Update Budget — these should be the easiest-to-find elements when a user returns to log a transaction.

---

### Atlas (`AtlasPage.tsx`)

🟡 **Task/habit list inline actions**: Add/complete/reschedule inline buttons in task rows will be nearly invisible. In a planning module where users scan long lists, the action density per row is high and glass buttons can look like metadata rather than affordances.

🟡 **`QuickAddForm` submit button**: Form-level submit for quick task add. Fine in isolation but the form label (uppercase bold) > submit button (glass quiet) is the same issue as Section 6.

---

### Scout (`ScoutPage.tsx`)

🟡 **Lime theme is the safest color for this change**: Lime at 300 on `#0a0a0f` has high perceived luminosity. Glass lime buttons remain legible where indigo/orange/cyan buttons may struggle. Scout is relatively safe.

🟡 **Research result action buttons**: "Save Research," "Export," "Add to Report" type inline buttons in result cards. These are secondary actions so glass is appropriate, but they need sufficient padding to hit 44px touch targets.

---

### Forge (`ForgePage.tsx`)

🟠 **Mode selector is a button row masquerading as a tab group**: `FORGE_MODES` (Code / Comms / Docs / Life) uses NeuralButton per mode. After the redesign, four `NeuralButton` primaries in a row with themeColor `orange` look like four equal-weight actions, not a mode selector. The active mode is indistinguishable from inactive modes — both are glass.

This should be migrated to `NeuralTabGroup variant="pill"` with `themeColor="orange"`. The current button-as-tab pattern looked fine with solid fills (active = solid, inactive = ghost). With glass, all four states converge.

🟡 **Code execution "Run" button**: Running code should feel urgent/definitive. Orange glass button is calm — which is appropriate for Forge's "tools workspace" feel, but the distinction between Run, Test, and Debug type actions is now entirely on label text alone.

---

### Orchestrator (`OrchestratorPage.tsx`)

🟡 **`GuestModePanel` primary CTA**: Covered in Section 5. Auth CTAs must be more assertive.

🟡 **Chat-first interface means button exposure is low**: Orchestrator is primarily a `NexusDashboard` + chat page. Button surface area is minimal. Low risk here.

---

### Profile

Not fully audited, but profile pages universally have:
- "Save Changes" type primary buttons — glass saves look like editable areas, not confirmations
- "Delete Account" type danger buttons — `NeuralButton variant="danger"` at `bg-rose-500/[0.06]` may not read as sufficiently alarming

---

## 10. Recommended Redesign Priorities

These are ordered by user-facing visual impact and shipping risk. The first four are **blockers for a coherent product release.**

---

### P0 — Must ship with the button redesign

#### 1. 🔴 ChatInterface send button — resolve the split system

**File:** `src/core/components/ChatInterface.tsx` (THEMES object, line 61-141)

Either:
- **Option A (recommended):** Migrate to `NeuralButton` and give the send button a deliberate `size="md"` solid exception: document in a code comment that the send button retains `bg-{color}-500` fill as the single justified exception because chat send is the highest-frequency action in the UI and glass would reduce discoverability at rest.
- **Option B:** Keep as-is but align the raw button styles to look intentionally different — add `font-semibold` and a `Send` label next to the icon to make the solid fill feel architectural rather than like a mistake.

Remove the `className="bg-amber-600 hover:bg-amber-500"` override on the Retransmit NeuralButton (line 550) — replace with `themeColor="amber"` to keep it in the glass system.

#### 2. 🔴 NeuralTabGroup typography update

**File:** `src/core/components/NeuralTabGroup.tsx` (line 206)

```tsx
// Current
'font-bold uppercase tracking-[0.08em] md:tracking-[0.12em]'
// Change to
'font-medium tracking-[0.04em]'  // natural case; labels in prop stay as-is
```

Also remove the vestigial `blur-md` glow inside the active pill (the `absolute inset-0 rounded-xl opacity-20 blur-md` div at line 249). It's a bloom residue from the old design system.

#### 3. 🔴 LandingPage hero CTA elevated treatment

**File:** `src/modules/landing/LandingPage.tsx` (line 98-105)

The primary marketing CTA needs a dedicated treatment. Options:
```tsx
// Option A: Elevated glass — double the opacity at rest, remove themeColor default
<NeuralButton 
  size="lg" 
  className="w-full sm:w-auto bg-indigo-500/20 border-indigo-400/40 hover:bg-indigo-500/30" 
  onClick={goHub}
>

// Option B: Introduce a 'hero' size variant in NeuralButton
// SIZE_STYLES: hero: 'h-14 px-10 text-lg gap-2.5'
// + a dedicated hero fill in THEME_STYLES at 20%/28% instead of 8%/15%
```

Option B is the architecturally clean path — add `size="hero"` with elevated opacity tokens for primary marketing CTAs only.

#### 4. 🟠 SectionHeader label register

**File:** `src/core/components/SectionHeader.tsx` (line 25)

```tsx
// Current
'text-[11px] font-semibold uppercase tracking-[0.15em]'
// Change to (keeps uppercase for structural differentiation, drops tracking+weight)
'text-[11px] font-medium uppercase tracking-[0.06em]'
```

This single change fixes the section label across every module simultaneously.

---

### P1 — Ship within one sprint after buttons

#### 5. 🟠 NeuralInput label and focus ring

**File:** `src/core/components/NeuralInput.tsx`

```tsx
// Label: current
'text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50'
// Label: change to
'text-[11px] sm:text-xs font-medium tracking-[0.04em] text-white/50'
// (or uppercase tracking-[0.05em] if you want to keep label/button distinction)

// Focus ring: current
'focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'
// Reduce to not overpower primary button border
'focus:border-indigo-400/35 focus:ring-1 focus:ring-indigo-400/10'
```

Add a `themeColor` prop to NeuralInput so focus color adapts per module.

#### 6. 🟠 GuestModePanel / vault lock CTAs — elevated treatment

**Files:** `src/core/components/GuestModePanel.tsx`, `src/core/layout/ModuleLayout.tsx`

These are authentication-critical single CTAs. They should render at elevated glass opacity:
```tsx
// These specific NeuralButtons need className overrides or a new 'prominent' size
className="bg-indigo-500/20 border-indigo-400/40 hover:bg-indigo-500/30 hover:border-indigo-400/55"
```

Or alternatively: introduce `prominence="elevated"` prop on NeuralButton that bumps fill to 20%/28%.

#### 7. 🟠 EmptyState CTA contrast

**File:** `src/core/components/EmptyState.tsx`

Add a visual separator that lifts the action area above the container surface:
```tsx
// Add to the action wrapper
{action && (
  <div className="mt-2 pt-4 border-t border-white/5 w-full flex justify-center">
    {action}
  </div>
)}
```

This creates a thin `border-t` that gives the button a visual "stage" to stand on.

#### 8. 🟡 StatCard label tracking normalization

**File:** `src/core/components/StatCard.tsx` (line 39)

```tsx
// Current
'text-[9px] uppercase tracking-[0.3em] text-white/40 font-semibold'
// Change to
'text-[9px] uppercase tracking-[0.12em] text-white/40 font-medium'
```

`tracking-[0.3em]` is architectural overkill that creates the widest visual discrepancy in the tracking hierarchy. `0.12em` is still legibly a "label," markedly different from button `0.04em`, but not louder than everything else.

---

### P2 — Polish sprint

#### 9. 🟡 Forge mode selector → NeuralTabGroup

**File:** `src/modules/forge/ForgePage.tsx` — replace button-row mode selector with `<NeuralTabGroup themeColor="orange">`.

#### 10. 🟡 DataSyncToast "Update" button

**File:** `src/core/components/DataSyncToast.tsx` (line 135)

Migrate to `<NeuralButton size="sm" variant="primary" themeColor="white">Update</NeuralButton>` or reduce from `bg-white/10` to `bg-white/[0.05]` to match NeuralButton secondary.

#### 11. 🟡 NeuralModal footer pattern

Establish a standard modal footer wrapper in `NeuralModal`:
```tsx
// Add optional footer prop that renders with elevated contrast
{footer && (
  <div className="shrink-0 px-5 sm:px-8 py-4 border-t border-white/5 bg-black/20 flex items-center justify-end gap-3">
    {footer}
  </div>
)}
```

This ensures every Cancel + Primary pair renders against a slightly darker surface, giving the primary button contrast to stand on.

#### 12. 🟡 GlobalFAB speed-dial label typography

**File:** `src/core/components/GlobalFAB.tsx` (line 155)

Drop `font-bold uppercase tracking-[0.12em]` → `font-medium tracking-[0.04em]` on FAB tooltip labels.

#### 13. 🟡 HubViewSwitcher active state opacity

**File:** `src/modules/hub/components/HubControls.tsx` (line 63)

```tsx
// Current active
'bg-white/15 text-white shadow-sm'
// Reduce to match NeuralButton secondary hover state
'bg-white/[0.08] text-white'
```

---

## Summary Table

| Priority | Component | File | Specific Change |
|---|---|---|---|
| P0 | ChatInterface send button | `ChatInterface.tsx:640` | Solid fill exception documented or NeuralButton migration |
| P0 | NeuralTabGroup typography | `NeuralTabGroup.tsx:206` | `font-bold uppercase` → `font-medium` natural case |
| P0 | Landing hero CTA | `LandingPage.tsx:98` | Elevated glass opacity or new `size="hero"` |
| P0 | SectionHeader label | `SectionHeader.tsx:25` | `tracking-[0.15em]` → `tracking-[0.06em]` |
| P1 | NeuralInput label | `NeuralInput.tsx:22` | Lowercase, `font-medium`, reduced tracking |
| P1 | NeuralInput focus ring | `NeuralInput.tsx:37` | Reduce to not overpower button border |
| P1 | GuestModePanel CTA | `GuestModePanel.tsx:67` | Elevated fill treatment |
| P1 | Vault lock CTA | `ModuleLayout.tsx:282` | Elevated fill treatment |
| P1 | EmptyState CTA lift | `EmptyState.tsx:41` | Border-t separator above action |
| P1 | StatCard tracking | `StatCard.tsx:39` | `tracking-[0.3em]` → `tracking-[0.12em]` |
| P2 | Forge mode selector | `ForgePage.tsx` | Migrate to NeuralTabGroup |
| P2 | DataSyncToast buttons | `DataSyncToast.tsx:135` | Migrate Update to NeuralButton |
| P2 | NeuralModal footer | `NeuralModal.tsx` | Add footer prop with dark container |
| P2 | GlobalFAB labels | `GlobalFAB.tsx:155` | Reduce to font-medium natural case |
| P2 | HubViewSwitcher active | `HubControls.tsx:63` | `bg-white/15` → `bg-white/[0.08]` |
| P2 | InsightSourceBadge | `InsightSourceBadge.tsx:72` | cursor-pointer, stronger hover when interactive |
| P2 | NeuralTabGroup glow | `NeuralTabGroup.tsx:249` | Remove vestigial blur-md pill glow |

---

*Analysis based on full source audit of `/src/core/components/`, `/src/core/layout/`, `/src/modules/` and `/src/index.css` as of this sprint. Component names and line numbers reference the repository state at audit time.*
