# Nexus / Agnes — Button Placement & Interaction Design Specification

**Status:** Canonical — v1.0  
**Authors:** Front-End Architect (Orchestrator Nexus)  
**Applies to:** All modules — Atlas, Titan, Scout, Soma, Ledger, Agnes, Forge  
**Components covered:** `NeuralButton` (primary / secondary / ghost / danger), link-buttons, `ConfirmDialog`, `GlobalFAB`, `CollapsibleAIPanel`, `ChatInterface`, `EmptyState`, `SectionHeader`

---

## Preamble — Design Philosophy

Buttons in Nexus/Agnes are **part of the surface, not furniture on top of it.** The glassmorphism palette (near-black `#0a0a0f`, glass fills at 4–15 % opacity, colored borders at 25–40 % opacity) means that visual hierarchy is achieved through *spatial grammar* — proximity, density, and positional convention — rather than contrast fills. This makes consistent placement rules more important here than in any opaque-surface system.

Three cognitive constraints govern every decision below:

1. **Fitts's Law** — Targets close to current pointer/thumb position or close to content edges are acquired faster. Always place the primary action where the user's eye or thumb already rests after completing a task.
2. **Reading gravity** — Western reading order ends at the bottom-right. The "do the main thing" position is bottom-right in forms, top-right in section headers. Both are correct in their contexts; the rule is that they must never coexist on the same page region.
3. **Emotional safety for sensitive modules** — Agnes (AI therapy) and Soma (health) carry heightened emotional stakes. Button density, button intensity (variant choice), and confirmation patterns must be dialed down in those modules. A "Delete session" button that's the same visual weight as a "Save note" button is a UX failure in a clinical context.

---

## 1. Primary Action Placement

### Recommendation

**Primary CTAs live in one of three canonical positions, never anywhere else:**

| Context | Position | Rationale |
|---|---|---|
| Section / tab header (list views, dashboards) | Top-right of `SectionHeader`, `action` prop | Fitts's Law — user scans title then immediately reaches right |
| Form / multi-step wizard | Bottom-right of the form container, right-aligned | Western reading gravity, mirrors OS dialog conventions |
| Empty state (zero-content view) | Horizontally centered, below the description text | User's eye is already centered; no competing content to escape |

**There is no fourth position.** If you find yourself wanting a fourth, you have a scope problem — split the view.

### Current state / gap

`SectionHeader` already accepts an `action` prop that renders top-right. This is correct and should be the only way primary actions appear in header regions. **Do not** place a `NeuralButton variant="primary"` inline within body text or inside a card's content area — those are `ghost` territory (see §2).

### Module-specific notes

- **Atlas (planning):** The one exception to "one primary CTA per view" is the `QuickAddForm` — it is a *persistent* primary action that survives tab changes. It correctly uses the `GlobalFAB` channel (see §9). Its internal form footer must still follow the bottom-right rule.
- **Agnes (therapy):** There is no primary CTA in the session view by design. The only primary action is "Send message," which belongs to the chat input (see §8). Do not add "Save session" or "End session" primary buttons to the therapy canvas — they break clinical immersion.
- **Ledger (finance):** Primary CTA for transaction entry is bottom-right of the add-transaction form, labeled with a concrete verb: **"Log Transaction"**, not "Submit" or "Save."

### Copy rule for primary button labels

Use **verb + noun** pattern: "Add Task," "Log Transaction," "Start Session," "Create Goal." Never use: "Submit," "OK," "Done," "Save" (unless the action is a literal file save). The label must communicate what the system will do, not what the user is doing.

---

## 2. Secondary / Ghost Placement — Proximity Rules

### Recommendation

**Secondary and ghost buttons must always be spatially subordinate to their associated primary button.** The proximity rule is:

- **In form footers:** Cancel (secondary) sits to the *left* of the primary button, in the same `flex` row, with a `gap-3` (12px) between them. Never above, never below, never in a separate container.
- **In section headers:** Secondary filters, sort controls, and "Edit" actions go in the same `action` slot as the primary, in a `flex items-center gap-2` group — secondary left, primary right.
- **In cards:** Secondary actions (Edit, Defer, View Details) appear in the expanded drawer or on hover, positioned below the primary complete/check action. Never in the same visual row as the primary unless using icon-only ghost buttons (see §5).
- **Ghost buttons** are for the third tier: "Clear," "Reset," "View raw," "See all." They live at the trailing edge of their container — bottom of a list, end of a toolbar row — and use `size="sm"` exclusively to signal low stakes.

### Spatial hierarchy diagram

```
[ Ghost: "See all" ]          [ Secondary: "Cancel" ]  [ Primary: "Save Goal" ]
  ↑ trailing content end          ↑ adjacent left           ↑ rightmost, dominant
```

The eye reads left-to-right, so left = low stakes, right = commitment. This is a universal Western UX convention and it is non-negotiable for Nexus.

### Variant rules

| Action tier | Variant | When to deviate |
|---|---|---|
| Primary module action | `primary` + module `themeColor` | Never |
| Secondary / alternative path | `secondary` | Never use `primary` for Cancel |
| Tertiary / low-stakes | `ghost` | Use for icon-only toolbar controls |
| Destructive confirmation | `danger` | Only in `ConfirmDialog` footer or after explicit user initiation |

---

## 3. Link Buttons — Definitive Classification

This is currently ad-hoc and must be standardized. The following decision tree is canonical:

### Decision tree

```
Is the action navigating to a different route or external URL?
  ├─ Yes → use a plain <a> or <Link> (React Router), never a button
  └─ No — Is the action performing a state mutation (add, delete, send, toggle)?
       ├─ Yes → use NeuralButton (ghost, secondary, primary, or danger)
       └─ No — Is it a soft nav within the same page (tab switch, section reveal)?
            ├─ Yes — with clear UI affordance → NeuralTabGroup or ghost NeuralButton
            └─ Yes — inline in prose text → link-style span (see below)
```

### The four link-button contexts

**1. Inline in body text / prose** (e.g., "Learn more about how Atlas prioritizes tasks")  
→ Use a `<button>` with `className="text-{themeColor}-400 hover:text-{themeColor}-300 underline-offset-2 hover:underline transition-colors"`. Never a `NeuralButton` — the glass border is inappropriate inline.

**2. "See all / View more" trailing links** (end of a section's content list)  
→ `NeuralButton variant="ghost" size="sm"` with a trailing `ArrowRight` icon. Right-aligned or centered depending on the section layout. Copy: "See all tasks →" or "View full history →". Do not use plain anchor styling here — this is a data-filter operation, not navigation.

**3. Breadcrumb / back navigation within onboarding flows**  
→ Plain `<button>` styled identically to the inline prose pattern above, but with a leading `ChevronLeft` icon at 12px. Always left-aligned. Never `NeuralButton` — breadcrumbs must recede visually.

**4. Sidebar / module-switcher nav items**  
→ These are already handled by `ModuleSwitcherPopover` and `NeuralTabGroup`. Do not use `NeuralButton` inside navigation — it creates false affordance competition.

### Anti-patterns to eliminate

- `NeuralButton variant="ghost"` used for same-tab navigation (replace with `NeuralTabGroup`)
- Plain `<a href="#">` used for state-mutating actions (replace with `<button>`)
- `NeuralButton` used inside prose paragraphs (replace with inline button styling)
- "Click here" as button copy (always replace with a verb that describes the outcome)

---

## 4. Form Footers — Canonical Pattern

### Recommendation

**All form footers in Nexus/Agnes follow a single layout:**

```
Mobile (< 768px):
┌─────────────────────────────────────────────┐
│  [ Primary Action — full width ]            │
│  [ Cancel — full width, below primary ]     │
└─────────────────────────────────────────────┘

Desktop (≥ 768px):
┌─────────────────────────────────────────────┐
│                 [ Cancel ]  [ Primary CTA ] │
└─────────────────────────────────────────────┘
```

**Tailwind implementation:**

```tsx
// Form footer — use this exact structure everywhere
<div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 mt-4 border-t border-white/5">
  <NeuralButton
    variant="secondary"
    size="md"
    onClick={onCancel}
    className="sm:w-auto w-full"
  >
    Cancel
  </NeuralButton>
  <NeuralButton
    variant="primary"
    size="md"
    themeColor={moduleThemeColor}
    type="submit"
    loading={isSubmitting}
    className="sm:w-auto w-full"
  >
    {submitLabel}
  </NeuralButton>
</div>
```

**Why `flex-col-reverse`?** On mobile, the primary action must appear at the top of the stack (closer to the thumb zone at the bottom of the screen when the user scrolls the form into view, and the most recently consumed content before the CTA). `flex-col-reverse` achieves "Cancel below Primary" in DOM order while preserving the correct visual reading flow (Primary first visually = first tap target when form is complete).

### Rules

1. **Never center-align** form action buttons. Right-alignment signals "this dialog has a resolution."
2. **Never use `size="lg"` or `size="xl"`** in modal footers — the modal container constrains it sufficiently. `size="md"` is the maximum.
3. **Never combine three primary-tier buttons** in a single footer. If you need "Save Draft" + "Publish" + "Cancel," that's three actions — promote one to primary, demote one to ghost, keep Cancel as secondary.
4. **Onboarding multi-step flows:** The "Next" / "Continue" button should be `size="lg"` and full-width because it is the *only* meaningful action in a single-task context.

### Current gap: `ConfirmDialog`

`ConfirmDialog.tsx` currently uses `flex gap-3` with `flex-1` on both buttons (equal width, side-by-side). This is acceptable but must be updated to follow the hierarchy:

```
[ Cancel (secondary, flex-1) ]  [ Confirm (danger/default, flex-1) ]
```

The current implementation correctly places Cancel left and Confirm right. ✅  
Gap: it uses raw `<button>` elements with hardcoded classes instead of `NeuralButton`. This should be migrated but is not blocking.

---

## 5. Card & List Item Actions

### Recommendation

**Three-tier visibility model:**

| Tier | Always visible | On hover (desktop) | On expand/select |
|---|---|---|---|
| Primary card action | ✅ Yes (checkbox, complete, toggle) | — | — |
| Secondary card actions | ❌ No | ✅ Yes (Edit, Defer, Pin) | ✅ Yes |
| Destructive actions | ❌ No | ❌ No | ✅ Yes only (after expand) |

### Current state analysis

`TaskCard.tsx` implements this correctly for completion: the checkbox is always visible. However, **Edit and Delete are not yet on TaskCard** — when added, they must follow:

- **Edit:** Ghost icon button, `size="sm"`, `Pencil` icon, hover-reveal only. Appears in the expanded details panel.
- **Delete / Remove:** `NeuralButton variant="danger" size="sm"` with label "Remove Task," revealed only in expanded state. Must be visually separated from Edit by a `w-px h-4 bg-white/10` divider.
- **Both actions:** Appear in a `flex items-center gap-2` row at the bottom of the expanded panel, right-aligned.

### Icon-only vs. labeled

| Situation | Use icon-only | Use labeled |
|---|---|---|
| Space < 280px card width | ✅ | — |
| Action is universal (Complete = ✓, Delete = trash) | ✅ with `aria-label` | — |
| Action is ambiguous ("Edit what exactly?") | — | ✅ |
| Destructive actions anywhere | — | ✅ **Always label destructive** |

**Destructive actions must never be icon-only, even in compact layouts.** The cognitive cost of accidentally deleting data is too high. Minimum: `size="sm"` danger button with a short label.

### Goal cards (GoalTracker), Habit cards (HabitTracker)

Follow the same three-tier model. **Module-specific note for Agnes:** Session cards (past therapy conversations) must not expose a "Delete session" action at the card level. Deletion is accessed only via a dedicated "Manage sessions" settings panel — it is intentionally buried to prevent impulsive deletion of therapeutic progress data.

---

## 6. Empty States — Single CTA Pattern

### Recommendation

`EmptyState.tsx` already has a correct structural foundation with the `action` prop. Standardize on this exact pattern:

```tsx
<EmptyState
  title="No tasks scheduled"
  description="Add your first task to start building today's focus plan."
  icon={CheckSquare}
  size="lg"
  action={
    <NeuralButton
      variant="primary"
      size="md"
      themeColor={moduleThemeColor}
      onClick={onAddFirst}
    >
      <Plus className="w-4 h-4" />
      Add First Task
    </NeuralButton>
  }
/>
```

**Rules:**

1. **One CTA only.** Empty states are not the place for "or you can import data" secondary options. One path, clearly labeled.
2. **Size `md`**, never `lg` or `xl`. The empty state container already provides the visual breathing room — a large button inside it creates hierarchy confusion.
3. **Copy pattern:** Verb + noun that matches what will appear. "Add First Task" → a task appears. "Start Session" → a session starts. Never "Get Started" (vague) or "Create" (unpaired noun).
4. **Module-specific for Agnes:** Empty state inside the therapy session view should *not* have a CTA button. The `description` alone should invite the user to speak. A button creates clinical distance. The AI panel's chat input is the implicit CTA.
5. **Module-specific for Soma:** Health metrics empty states may have two states — "No data connected" (primary CTA: "Connect Device") and "No manual entries" (ghost CTA: "Log Manually"). The primary path (device) leads left, the ghost path (manual) leads right.

---

## 7. Destructive Actions (Danger Variant) — Placement Rules

### Recommendation

**The `danger` variant (`NeuralButton variant="danger"`) has strict placement rules. These are non-negotiable.**

#### Rule 1: Physical separation

A danger button must have a minimum of **24px visual separation** from any non-danger action in the same UI region. Implement this with `gap-6` in flex containers or a `w-px h-5 bg-white/10` divider when space is tight. The goal is that the user cannot mis-tap a danger button when aiming for a nearby safe action.

#### Rule 2: Confirmation is always `ConfirmDialog`, never inline

Use the existing `ConfirmDialog` component for all destructive actions. **Do not build inline "Are you sure?" toggle patterns** — they add complexity, break screen readers, and are harder to dismiss on mobile. The `ConfirmDialog` is already built, accessible (Radix Dialog), and correct. Use it.

```tsx
// Correct pattern
<NeuralButton
  variant="danger"
  size="sm"
  onClick={() => setConfirmOpen(true)}
>
  Delete Goal
</NeuralButton>

<ConfirmDialog
  isOpen={confirmOpen}
  onClose={() => setConfirmOpen(false)}
  onConfirm={handleDeleteGoal}
  title="Delete this goal?"
  description="This removes all associated milestones and progress data. This cannot be undone."
  confirmLabel="Delete Goal"
  cancelLabel="Keep Goal"
  variant="danger"
/>
```

#### Rule 3: Danger button labels

- **Always use the full consequence verb:** "Delete Goal," "Remove Transaction," "End Session," "Clear History" — never "Delete," "Remove," "Yes," or "Confirm."
- **`ConfirmDialog.confirmLabel` must repeat the button label exactly.** Users read "Delete Goal" on the trigger, then see "Delete Goal" in the dialog confirm — it's unambiguous.

#### Rule 4: Placement in different surfaces

| Surface | Placement of danger button |
|---|---|
| Card expanded state | Bottom of expanded panel, right-aligned, after a divider |
| Form / settings panel | Bottom of section, below a `border-t border-rose-500/10` separator |
| Toolbar / header | Never in a header toolbar. Always in a dedicated settings/actions area. |
| `ConfirmDialog` footer | Right side (standard form footer pattern), `flex-1` |
| Mobile | Full-width danger button at absolute bottom of scrollable panel, 48px minimum height |

#### Module-specific: Agnes

"Delete session" must be placed in a dedicated "Session Management" section, behind at minimum one navigational step. It must never appear in the primary session UI or in any list of sessions without first entering a "manage" mode. The `ConfirmDialog` description for session deletion must acknowledge the therapeutic context: *"Deleting this session removes your conversation history. Your progress and insights from this session will not be recoverable."*

---

## 8. AI Chat Panel — Input Bar Anatomy

### Recommendation

The `ChatInterface.tsx` input bar is currently near-correct. Canonicalize its anatomy:

```
┌─────────────────────────────────────────────────────────┐
│  [+]  [ Textarea — flex-1                           ] [→] │
└─────────────────────────────────────────────────────────┘
  ↑        ↑ aria-label="Type your message"             ↑
  Attach   min-height 44px, max-height 160px          Send
  (ghost)  Enter=submit, Shift+Enter=newline         (primary themed)
```

#### Send button

- **Position:** Right-aligned inside the input bar, vertically centered to the textarea.
- **Size:** 44×44px minimum (`w-11 h-11`). Currently implemented correctly.
- **Variant:** Not `NeuralButton` — this is a deliberate exception. The send button uses a solid themed fill (`bg-{themeColor}-600`) rather than the glass NeuralButton pattern because: (1) it needs to be unmissable as the input bar's terminal action, (2) it sits inside a darkened container where glass-on-glass would lose contrast. **Do not convert the send button to NeuralButton.**
- **Disabled state:** `disabled:opacity-20` when input is empty or AI is processing. No pulsing, no color shift — just reduced opacity.
- **Loading state:** When `isProcessing` is true, swap the `Send` icon for `Loader2 animate-spin`. Do not disable the button while streaming — allow message cancellation in a future sprint.

#### Attach / Plus button

- **Position:** Left side of the input bar. Only rendered when `canUploadDocs || renderCustomActions`.
- **State when drawer open:** Rotate 45° (currently implemented). Keep this — it signals "close" without a label.
- **`aria-label`:** Must be dynamic: `isDrawerOpen ? "Close attachment menu" : "Open attachment menu"`. Currently missing — this is an accessibility gap to fix.

#### Secondary actions (Clear History, keyboard shortcut hint)

- **Clear History (`onClearHistory`):** Currently top-right of the chat panel, correctly implemented as a ghost-style button with `Trash2` icon. Keep. **Do not move this to inside the input bar** — it operates on the whole conversation, not the current message.
- **Keyboard shortcut (⌘K):** The `<kbd>` pill in the `CollapsibleAIPanel` trigger and header is correct. Replicate it in the `ChatInterface` input bar footer row for discoverability: `"Enter to send · Shift+Enter for newline"`. This is informational, not a button.

#### Agnes-specific: input bar tone

For the Agnes module (`isAgnes === true`), the input bar footer status line should read `"Your words are private. E2EE."` instead of the current `"{themeColor}_LINK"` technical string. The clinical interface must speak in plain language.

---

## 9. Floating / Sticky Actions — When Each Pattern Is Appropriate

### Decision framework

```
Is the action relevant to the entire module session (not a single piece of content)?
  └─ Yes → GlobalFAB (already implemented) or CollapsibleAIPanel trigger

Is the action a primary creation action that persists across tab changes?
  └─ Yes → Register in GlobalFAB via fabActions (UIStore)

Is the action context-specific to the current tab/list content?
  └─ Yes → Inline button in SectionHeader action prop

Is the page scrollable and the primary action is always needed regardless of scroll position?
  └─ Yes → Sticky footer bar (mobile only), or sticky SectionHeader (desktop)

Is there only one meaningful action on the entire page?
  └─ Yes → Centered inline button (not floating), e.g. onboarding "Continue" buttons
```

### Module-specific recommendations

| Module | Floating/sticky pattern | Rationale |
|---|---|---|
| **Atlas** | `GlobalFAB` with "Add Task/Habit/Goal" dial items | Creation is frequent, cross-tab |
| **Titan** | Mobile sticky footer for "Log Workout" on the active workout tab | Logging is thumb-zone work |
| **Scout** | No FAB. "New Research" in section header. | Research is deliberate, not impulsive |
| **Soma** | No FAB. All logging initiated from metric tiles. | Logging flows from data, not impulse |
| **Ledger** | Mobile sticky footer "Add Transaction" | Financial entry is frequent on mobile |
| **Agnes** | No FAB on session canvas. `CollapsibleAIPanel` trigger is the only persistent UI. | Therapy requires full focus mode |
| **Forge** | `GlobalFAB` with "New Life Event," "Add Document" | Life ops creation is varied, cross-tab |

### GlobalFAB positioning — current implementation analysis

`GlobalFAB.tsx` correctly positions at `bottom-4 left-4` and floats above module bottom bars via `moduleBottomBarHeight`. **One change required:** The Nexus/Sparkles action should be at the bottom of the speed-dial (closest to the thumb / anchor), not the top. The rationale: global Nexus consultation is the *most common* action — place it where the thumb naturally rests after opening the dial. Module-specific actions (which are contextual) go above it.

This reverses the current stagger order:
- **Current:** Nexus first (top), module actions after (bottom, closer to anchor)
- **Required:** Module actions first (top), Nexus last (bottom, closest to anchor / thumb)

---

## 10. Touch Targets & Mobile — Absolute Minimums

### Minimum size rules (non-negotiable, WCAG 2.5.5)

| Target type | Minimum tap size | Implementation |
|---|---|---|
| Any interactive button | 44×44px | `min-w-[44px] min-h-[44px]` |
| Icon-only button (ghost) | 44×44px | Use padding to expand: `p-2.5` on a 24px icon = 44px tap area |
| Inline text link-button | 44px height | Add `py-2` to inline buttons in lists |
| Card row with tappable area | Full card width × min 48px height | `min-h-[48px]` on card root |
| `NeuralButton size="sm"` | h-9 = 36px **⚠️** | **Requires `min-h-[44px]` override on mobile** |

**The `sm` size (h-9, 36px) violates WCAG 2.5.5 on touch devices.** The fix:

```tsx
// Apply to any sm-sized button rendered in a mobile context
<NeuralButton
  variant="ghost"
  size="sm"
  className="sm:h-9 h-11" // 44px on mobile, 36px on desktop
>
  See all
</NeuralButton>
```

Or, add a `touch` size to `NeuralButton`'s `SIZE_STYLES`:

```ts
// Proposed addition to SIZE_STYLES in NeuralButton.tsx
touch: 'h-11 px-4.5 text-[11px] gap-1', // 44px — mobile-explicit size
```

### Thumb zone placement (mobile)

The human thumb comfortably reaches the bottom 40% of a mobile screen. Map the most common actions accordingly:

```
Screen zones (mobile portrait):
┌─────────────────────────┐
│  TOP — awkward zone      │  ← Module header (back button, title) — navigation only
│  System nav, labels      │
├─────────────────────────┤
│  MIDDLE — neutral zone   │  ← Content cards, list items, read-only data
│  Content area            │
├─────────────────────────┤
│  BOTTOM — thumb zone     │  ← Primary CTAs, form submit, send button, sticky footer
│  ★ Best for actions      │  ← GlobalFAB (bottom-left, easier for right-handed users)
└─────────────────────────┘
```

**GlobalFAB is currently `bottom-4 left-4`.** This is correct for right-handed thumb reach on phones. The CollapsibleAIPanel trigger (`bottom-6 right-6`) is on the opposite side — acceptable because it is a dedicated AI toggle that users consciously seek, not a frequent creation action.

### Mobile-specific layout overrides

1. **Form footers:** `flex-col-reverse` with full-width buttons (see §4). Already specified.
2. **Card actions:** On mobile, always-visible single action (the primary one, e.g., complete checkbox) + an overflow `⋯` button that opens a bottom sheet with secondary/danger actions. Never rely on hover-reveal on touch devices.
3. **`ConfirmDialog`:** Already centered at `top-1/2 left-1/2 -translate`. On mobile, pin to bottom: add `sm:top-1/2 top-auto sm:translate-y-[-50%] translate-y-0 bottom-0 rounded-b-none` for a bottom sheet variant.
4. **`CollapsibleAIPanel`:** Already full-width on mobile. The close button `X` is at `top-4 right-4` — this is above the thumb zone on mobile. Add a swipe-down-to-close gesture via `drag` direction `y` in Framer Motion to supplement the button.

---

## Appendix A — Component Quick Reference

| Component | Primary location | Variant | Size | Notes |
|---|---|---|---|---|
| Module section CTA | `SectionHeader` `action` prop | `primary` + theme | `md` | One per section max |
| Form submit | Form footer, right | `primary` + theme | `md` | `type="submit"` |
| Form cancel | Form footer, left of submit | `secondary` | `md` | `type="button"` |
| Empty state CTA | `EmptyState` `action` prop | `primary` + theme | `md` | One CTA only |
| Card: complete / check | Always visible, left of title | Custom checkbox | 20×20px | Part of card anatomy |
| Card: edit | Hover-reveal, expanded panel | `ghost` | `sm` | With `Pencil` icon |
| Card: delete | Expanded panel, after divider | `danger` | `sm` | Always labeled |
| Destructive confirm | `ConfirmDialog` footer, right | `danger` (dialog custom) | `md` | Full consequence label |
| Danger trigger | Inline, after separation | `danger` | `sm` or `md` | Opens `ConfirmDialog` |
| "See all" / "View more" | Trailing end of section | `ghost` | `sm` | `ArrowRight` icon |
| Inline text action | Prose context | Custom (not NeuralButton) | `auto` | Underline on hover |
| Chat send | Input bar, right | Solid themed (not NeuralButton) | 44×44px | `type="submit"` |
| Chat attach | Input bar, left | Bare icon button | 44×44px | Only if doc-capable |
| GlobalFAB anchor | `bottom-4 left-4` | Speed-dial (FAB system) | 56×56px | Global Nexus access |
| AI panel trigger | `bottom-6 right-6` | Solid themed pill | Auto | Pulse ring |
| Onboarding "Next" | Bottom, centered / full-width | `primary` + theme | `lg` | Single path |

---

## Appendix B — Accessibility Checklist per Button Context

Every button implementation must satisfy:

- [ ] `aria-label` on any icon-only button (no visible text)
- [ ] `aria-busy={true}` on loading state (already on `NeuralButton`)
- [ ] `aria-disabled` synced with visual disabled state
- [ ] `aria-expanded` on toggles (drawer open, card expanded) — see `TaskCard.tsx` for correct usage
- [ ] `aria-haspopup="dialog"` on danger trigger buttons that open `ConfirmDialog`
- [ ] `type="button"` on all non-submit buttons inside `<form>` elements (prevents accidental submission)
- [ ] `type="submit"` on all form submit buttons (allows Enter-key submission)
- [ ] Focus ring visible — `focus-visible:ring-2 focus-visible:ring-offset-2` (already in `NeuralButton`)
- [ ] Minimum 44×44px touch target on mobile (enforce via `className` override for `size="sm"`)
- [ ] Color is never the *only* differentiator — danger buttons must also differ in label, not just color

---

## Appendix C — Anti-Patterns Index

The following patterns exist in the current codebase or are commonly introduced in new code. They are prohibited:

| Anti-pattern | Found in | Correct replacement |
|---|---|---|
| Raw `<button>` with hardcoded Tailwind classes in `ConfirmDialog` footer | `ConfirmDialog.tsx` L113–125 | Migrate to `NeuralButton` (lower priority) |
| `{themeColor}_LINK` technical string in chat footer | `ChatInterface.tsx` L655 | Plain language per module (Agnes: "Private · E2EE") |
| Missing `aria-label` on attach/Plus button | `ChatInterface.tsx` L619 | Add dynamic label based on `isDrawerOpen` |
| Nexus dial item closest to anchor (hardest thumb reach) | `GlobalFAB.tsx` L74–86 | Reverse order: module actions top, Nexus bottom |
| `size="sm"` (36px) used without mobile height override | Various | `className="sm:h-9 h-11"` on mobile touch targets |
| "Submit" / "Save" / "OK" as button copy | Various onboarding forms | Verb + noun: "Create Account," "Save Profile" |
| Danger button in module header toolbar | — (preventive) | Move to settings/actions panel, never in header |
| Three primary-tier buttons in single form footer | — (preventive) | Maximum: 1 primary + 1 secondary + 1 ghost |
| Inline "Are you sure?" toggle replacing `ConfirmDialog` | — (preventive) | Always use `ConfirmDialog` for destructive confirmation |
| `NeuralButton` inside navigation / tab bars | — (preventive) | Use `NeuralTabGroup` for tabs, `<Link>` for nav |

---

*This document is the single source of truth for button placement in Nexus/Agnes. Any deviation requires an explicit architectural decision record (ADR) in `docs/architecture/`. Last updated: Sprint 17 baseline.*
