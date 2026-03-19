# Atlas Energy & Planning — Design Audit (30+ Issues)

Based on analysis of the Atlas UI across Dashboard, Backlog, Journal, Review, and mobile views. Issues are grouped by category and linked to components where applicable.

---

## 1. Layout & Truncation

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 1 | **Tab label truncation** — First tab shows "SHBOARD" (Dashboard cut off) on narrow viewports. | `NeuralTabGroup`: `overflow-x-auto` with no `min-width` or scroll padding; tabs can start at left edge. | Add `scroll-padding-left` so first tab isn’t clipped; consider `min-w-0` + `flex-shrink-0` on tab items or scroll-to-active behavior. |
| 2 | **Header status text truncated** — "NEURAL_RESONANCE_RECEI.." in the top bar is unreadable. | `ModelBadge` / system status in layout; fixed width or ellipsis. | Use full label on hover/tooltip; or shorten to "LINKED" / "ACTIVE" and move technical label to a debug/settings panel. |
| 3 | **Alignment inconsistency** — "Temporal Reviews" section header doesn’t align with the dashed container below. | Review tab content in `EnhancedAtlasDashboard`; different padding/margin on title vs container. | Use shared horizontal padding (e.g. same `px-*` or container) for section title and content block. |
| 4 | **Metric card grid misalignment** — Backlog summary cards (Total, Active, Blocked, Done, Energy) have inconsistent spacing; "Blocked" card is wider and sits alone. | `TaskManager` or Backlog tab metric layout. | Use a consistent grid (e.g. CSS Grid with equal columns) and equal card widths; avoid mixing flex with ad-hoc widths. |
| 5 | **Search/filter bar width inconsistency** — Search bar and "All Tasks" / "Priority" dropdowns have varying widths. | Backlog tab controls in `TaskManager`. | Standardize control widths or use a defined grid (e.g. search flex-1, filters fixed width). |

---

## 2. Typography & Readability

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 6 | **Secondary text too small** — Date ("THURSDAY, MAR 19"), section labels, and captions use very small font sizes. | `TodaysPlanCard`, `SectionHeader`, and shared typography. | Ensure body/secondary text is at least 12–13px; reserve 10–11px only for non-essential metadata with sufficient contrast. |
| 7 | **Inconsistent capitalization** — Mix of ALL CAPS ("COGNITIVE DOMAIN", "REMINDERS"), Title Case ("Atlas Energy & Planning"), and sentence case ("Energy management...", "Save Entry"). | `SectionHeader` (uppercase), various buttons and labels. | Define a style guide: e.g. section labels = small caps or uppercase; primary actions = sentence case; avoid random mixing. |
| 8 | **Low-contrast gray on dark background** — Subtitle and many labels use mid-to-dark gray on black, failing WCAG contrast. | `text-white/50`, `text-white/40` in `SectionHeader` and cards. | Raise to at least `text-white/60` for body and `text-white/70` for labels; verify 4.5:1 (or 3:1 for large text). |
| 9 | **Background pattern vs legibility** — Neural/root pattern behind content can compete with small text. | Global layout or Atlas-specific background. | Reduce pattern opacity, or confine it to non-content areas; ensure text zones have solid or high-contrast overlay. |
| 10 | **Numeric inconsistency** — Energy shown as "10.0/10" in one place and "10" in the Energy card; decimals used inconsistently. | `TodaysPlanCard` (EnergyBudgetBar) vs stat cards. | Use one format (e.g. one decimal when fractional, else integer) and the same across energy displays. |

---

## 3. Color & Semantics

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 11 | **Confusing status color logic** — Yellow/amber for "ENGINE_ACTIVE" and "CONNECTED" (often implies caution); blue for "Normal"; green for "SECURE_NODE". | `ModelBadge`, status pills, `predictiveDisplay`. | Align semantics: e.g. green = good/connected, amber = warning, blue = neutral; document in a small design token table. |
| 12 | **Energy bar overshadows task UI** — The energy progress bar is the most dominant element on the dashboard, pushing task management to a secondary role. | `TodaysPlanCard` / `EnergyBudgetBar`. | Reduce visual weight (e.g. thinner bar, or move to sidebar/collapsible); keep task capture and inbox as primary focus. |
| 13 | **Accent color inconsistency** — Cyan/teal for nav, neon green for energy, purple for journal selection, amber for status. | Multiple components and theme tokens. | Limit to 2–3 primary accents (e.g. sky for primary actions, amber for warnings, emerald for success) and reuse consistently. |
| 14 | **"Save Entry" button too dominant** — Single bright emerald button creates an unbalanced focal point on the Journal screen. | `JournalEntryEditor` primary submit. | Slightly reduce saturation or use outline style so it doesn’t overpower mood/energy/gratitude inputs. |

---

## 4. Empty States & Affordances

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 15 | **Alert icon for positive empty state** — "Inbox clear" uses `AlertCircle` (warning style), which suggests a problem rather than success. | `EmptyState` default icon in `PriorityInbox`. | Use a neutral or positive icon (e.g. `Inbox`, `CheckCircle2`, or custom "empty inbox") for empty-inbox state. |
| 16 | **Dashed border implies drag-and-drop** — Large dashed containers for inbox and review empty states suggest drop zones. | `EmptyState` uses `border-dashed`; no drag-drop. | Use solid border for static empty states; reserve dashed only for actual drop targets. |
| 17 | **Inconsistent data-entry patterns** — Gratitude uses "+ Add what you're grateful for" (link); Blockers uses a large text area. | `JournalEntryEditor`: gratitude vs blockers. | Unify pattern: either both expandable fields or both inline text areas, with consistent primary action style. |
| 18 | **Two different "+" buttons** — One in the quick-capture bar (cyan square) and one as a green FAB on mobile; different styles and positions. | `QuickCaptureBar` and layout FAB / `QuickAddForm`. | Use one primary "add" entry point per view, or make the two clearly different (e.g. "Quick add" vs "Full form") with distinct labels. |
| 19 | **Redundant energy display** — "ENERGY REMAINING" header plus progress bar plus "ENERGY" card repeats the same metric three times. | `TodaysPlanCard`: EnergyBudgetBar + stat cards. | Show one primary energy display (e.g. bar + single number); move detailed breakdown to a secondary row or tooltip. |

---

## 5. Navigation & Information Architecture

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 20 | **"Focus" mixed with time ranges** — Today / Week / Month / Focus in the same row; Focus is a mode, not a timeframe. | `ViewSwitcher`: `today` \| `week` \| `month` \| `focus`. | Separate time-based views from mode (e.g. "Focus" as a toggle or separate entry) to avoid categorical confusion. |
| 21 | **Active tab clickable area unclear** — Heavy fill on active tab; other tabs have no clear separator, so boundaries feel ambiguous. | `NeuralTabGroup` pill variant. | Add subtle dividers or increase padding so each tab has a clear hit area; ensure focus ring is visible. |
| 22 | **Review tab icon doesn’t convey "review"** — Vertical line/dots icon (`GitCommitVertical`) is abstract. | `EnhancedAtlasDashboard` tabs config. | Use an icon that suggests reflection or checklist (e.g. `ClipboardList`, `RotateCcw`, or `FileCheck`). |
| 23 | **Technobabble in header** — "NEURAL_RESONANCE" and similar terms obscure actual status (e.g. "connected" or "synced"). | Layout / `ModelBadge` or system status. | Prefer user-facing labels; move technical names to debug/settings or remove. |
| 24 | **Redundant bell icons** — Notification bell in top bar and "REMINDERS" button with bell in sub-header. | `SingleAgentLayout` / header and `ModuleReminderEntry`. | Differentiate (e.g. notifications vs reminders) with different icons or a single combined "Alerts & reminders" control. |

---

## 6. Components & Consistency

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 25 | **REMINDERS vs Conversational button style** — Different border weight and treatment for the two header buttons. | Atlas header: `ModuleReminderEntry` and preference-mode toggle. | Use the same component or shared variant (e.g. same border, padding, and hover state) for both. |
| 26 | **FAB position inconsistent** — Chat FAB offset from corner; position varies across breakpoints. | `SingleAgentLayout` or global FAB. | Use consistent inset (e.g. 1rem from bottom and right) and ensure it doesn’t overlap key content. |
| 27 | **Selection state inconsistency** — Journal: solid purple fill for "Today" tab; purple border only for Mood/Energy cards. | `JournalTab` sub-nav vs mood/energy selectors. | Use one selection pattern (e.g. filled background for selected, or outline for all) across the Journal view. |
| 28 | **Icon style mix** — Hollow vs solid icons used without a clear rule. | Various Lucide icons across Atlas. | Standardize (e.g. outline for nav, solid for active state) and document in a small icon guideline. |
| 29 | **Header button size/padding inconsistency** — Back arrow, notification bell, and profile dropdown have different hit areas. | Top bar in `SingleAgentLayout` or shell. | Use a single size class for icon buttons (e.g. 40px touch target) and consistent padding. |

---

## 7. Mobile & Responsive

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 30 | **Tab bar cut off on mobile** — First tab partially hidden; scroll may not be obvious. | `NeuralTabGroup` with `overflow-x-auto` and no scroll hint. | Ensure first tab is visible by default (scroll padding or "scroll into view" for active tab); consider a gradient fade to suggest scroll. |
| 31 | **Bottom bar partially cut off** — Streaks section and/or FAB area truncated at bottom on small screens. | Main content + sticky/fixed footer or FAB. | Reserve safe area (padding-bottom) for FAB and ensure main content scrolls above it; avoid content under the FAB. |
| 32 | **Small touch targets** — Mood and energy cards, sub-tabs, and small icons may be below 44px. | `JournalEntryEditor` mood/energy selectors; small icon buttons. | Enforce minimum 44×44px (or 40px) for interactive elements; increase padding on pills and cards. |
| 33 | **Dense header on mobile** — Title, description, status, REMINDERS, and Conversational in a small space. | Atlas header section. | Stack or collapse on small viewports (e.g. hide subtitle or move Reminders/Conversational into a menu). |

---

## 8. Accessibility & UX Polish

| # | Issue | Location / Cause | Recommendation |
|---|--------|------------------|----------------|
| 34 | **Empty state instruction clarity** — "Click 'Run Weekly Review' above" assumes desktop; less clear on touch. | Review tab empty state in `EnhancedAtlasDashboard`. | Use device-agnostic copy: "Run your first weekly review using the button above." |
| 35 | **Dead space in dashboard** — Large empty containers (inbox, streaks) with little guidance when empty. | `PriorityInbox`, streaks in `TodaysPlanCard` or dashboard. | Add short tips or examples (e.g. "Try: call dentist Friday") in empty areas to encourage first action. |
| 36 | **Placeholder length** — Long placeholder in quick capture may wrap or truncate on small screens. | `QuickCaptureBar`: "Capture a task or habit... (e.g. 'call dentist Friday' or 'run every weekday')". | Shorten to one short example or move examples to a tooltip/second line. |

---

## Summary

- **Layout & Truncation:** 5 (1–5)  
- **Typography & Readability:** 5 (6–10)  
- **Color & Semantics:** 4 (11–14)  
- **Empty States & Affordances:** 5 (15–19)  
- **Navigation & IA:** 5 (20–24)  
- **Components & Consistency:** 5 (25–29)  
- **Mobile & Responsive:** 4 (30–33)  
- **Accessibility & UX Polish:** 3 (34–36)  

**Total: 36 issues.** Prioritize truncation (1–2), contrast (8), empty-state icon (15), and mobile tab/scroll (30–31) for quick impact; then align colors, navigation semantics, and component consistency.
