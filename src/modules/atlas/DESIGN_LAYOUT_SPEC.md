# Atlas Energy & Planning — Design & Layout Specification

Complete design instructions, layout rules, component customization, and responsive behavior for the Atlas module. This document is the single source of truth for visual and structural implementation.

---

## 1. Design tokens

All spacing, typography, and layout in Atlas MUST use the following CSS custom properties. They are defined in `src/index.css` under `:root` and are size-intelligent (responsive via `clamp()` where noted).

### 1.1 Spacing

| Token | Value | Usage |
|-------|--------|--------|
| `--atlas-space-page-x` | `clamp(0.75rem, 4vw, 2rem)` | Horizontal padding of the page (left/right). Use for header, tab strip, content area, and any full-width container. |
| `--atlas-space-page-y` | `clamp(0.5rem, 2vw, 1.5rem)` | Vertical padding of the page (top/bottom). Use for header top, content area vertical padding. |
| `--atlas-space-section` | `clamp(0.75rem, 3vw, 1.5rem)` | Gap between major sections (e.g. between tab strip and content, between ViewSwitcher and content, between dashboard blocks). |
| `--atlas-space-block` | `clamp(0.5rem, 2vw, 1rem)` | Gap within a section (e.g. between title and status badge, between view tabs). |
| `--atlas-space-touch` | `2.75rem` | Minimum touch target height/width (~44px). Use for all interactive controls (buttons, tab buttons, icon buttons). |

**Rule:** Do not hard-code `px-4`, `p-8`, `gap-6` etc. for page-level layout. Use the tokens above (e.g. `padding: var(--atlas-space-page-x)` or `gap: var(--atlas-space-section)`).

### 1.2 Typography

| Token | Value | Usage |
|-------|--------|--------|
| `--atlas-type-label` | `0.6875rem` (11px) | Small caps labels, badges, metadata (e.g. "Cognitive Domain", status pill, date). |
| `--atlas-type-caption` | `0.75rem` (12px) | Secondary controls, captions, preference toggle label. |
| `--atlas-type-body` | `0.8125rem` (13px) | Body copy where a dedicated body size is needed. |
| `--atlas-type-subhead` | `0.9375rem` (15px) | Section titles within content (e.g. "Task Backlog", "Temporal Reviews"). |
| `--atlas-type-title` | `1.125rem` (18px) | Card titles, modal section titles. |
| `--atlas-type-hero` | `clamp(1.25rem, 4vw, 1.875rem)` | Module hero title ("Atlas Energy & Planning"). Responsive. |

**Text color tokens:**

| Token | Value | Usage |
|-------|--------|--------|
| `--atlas-text-primary` | `var(--text-primary)` | Primary headings, key values. |
| `--atlas-text-secondary` | `var(--text-secondary)` | Subtitle, labels, secondary info. Minimum contrast for body. |
| `--atlas-text-muted` | `var(--text-muted)` | Placeholders, disabled state, tertiary info. |

**Rule:** Subtitle and body text MUST use at least `--atlas-text-secondary` (or `text-white/60`) for accessibility. Do not use `text-white/40` or lower for body copy.

### 1.3 Radii & container

| Token | Value | Usage |
|-------|--------|--------|
| `--atlas-radius-card` | `var(--radius-card)` (1rem) | Cards, empty states, content blocks. |
| `--atlas-radius-pill` | `1.25rem` | Pills, toggle buttons, status badges. |
| `--atlas-container-max` | `90rem` (1440px) | Optional max width for content; use `max-w-[var(--atlas-container-max)] mx-auto` when centering wide content. |

### 1.4 Module accent

| Token | Value | Usage |
|-------|--------|--------|
| `--atlas` | `#0ea5e9` (sky-500) | Atlas primary accent: active tab, links, primary actions, focus rings. Use Tailwind `sky-*` or `var(--atlas)` consistently. |

---

## 2. Layout structure (placement)

Atlas is rendered inside `SingleAgentLayout`. The Atlas-specific layout is a single column with the following **vertical order**. No element may be reordered without updating this spec.

### 2.1 High-level stack (top to bottom)

1. **Shell: Reminders row** (AtlasPage)
   - **Placement:** Full width, top of Atlas content (above dashboard).
   - **Padding:** `padding-top: var(--atlas-space-block)`, horizontal `var(--atlas-space-page-x)`.
   - **Content:** `ModuleReminderEntry` (Reminders + Atlas notification panel), right-aligned, compact.
   - **Responsive:** No structural change; keep right-aligned at all widths.

2. **Optional: Post-onboarding welcome card**
   - **Placement:** Directly below reminders row, full width with page padding.
   - **Visibility:** Only when `profile.onboardingComplete && !hasSeenWelcome(uid)`.

3. **Dashboard root:** `EnhancedAtlasDashboard`
   - **Container:** `h-full flex flex-col overflow-hidden`.
   - **Children (in order):**
     - **Header** (see §2.2)
     - **Tab navigation** (see §2.3)
     - **View switcher** (only when `activeTab === 'dashboard'`) (see §2.4)
     - **Tab content area** (see §2.5)

### 2.2 Header

- **Placement:** First child of dashboard root. `flex-shrink-0`.
- **Layout:** Single row, `flex items-start justify-between gap-4`.
- **Padding:** `padding-left/right: var(--atlas-space-page-x)`, `padding-top: var(--atlas-space-page-y)`, `padding-bottom: var(--atlas-space-block)`.
- **Left block:**
  - **SectionHeader:** label = "Cognitive Domain", title = "Atlas Energy & Planning", subtitle = "Energy management, routines, and cross-module execution." Accent class: `text-sky-400`.
  - **Status badge:** Predictive state pill (Normal / Compressed / etc.). `self-start`, token label size, rounded pill. Must include dot (color from `predictiveDisplay.hex`) and `aria-label`.
- **Right block:** Preference mode toggle button (Structured / Conversational). Min height `var(--atlas-space-touch)`, pill radius, token caption size. Label text visible from `sm` up (`hidden sm:inline`).
- **Semantic:** Wrapped in `<header>`.

### 2.3 Tab navigation

- **Placement:** Below header. `flex-shrink-0`. Border bottom `border-white/5`.
- **Scroll:** Container has `overflow-x-auto`, `scrollPaddingLeft: var(--atlas-space-page-x)` so the first tab is not clipped when horizontal scrolling.
- **Inner wrapper:** `padding-left/right: var(--atlas-space-page-x)`, `padding-bottom: var(--atlas-space-section)`.
- **Component:** `NeuralTabGroup` with `themeColor="sky"`, variant `pill`. Tabs: Dashboard, Backlog, Routines & Habits, Journal, Analytics, Fields, Review. Badges: queued count on Backlog, dot on Review when weekly review pending.
- **Customization:** Tab labels use `text-[10px] md:text-[11px]`, `uppercase`, `whitespace-nowrap`, `shrink-0`. Do not reduce padding below touch target.

### 2.4 View switcher (Dashboard only)

- **Placement:** Only when `activeTab === 'dashboard'`. Between tab strip and content. `shrink-0`.
- **Padding:** `padding-left/right: var(--atlas-space-page-x)`, `padding-top: var(--atlas-space-section)`, `padding-bottom: var(--atlas-space-block)`.
- **Content:** `ViewSwitcher` — four options: Today, Week, Month, Focus. Inline-flex, horizontal scroll if needed. Active pill: `bg-emerald-500/10`. Min height per button 32px; prefer `var(--atlas-space-touch)` for touch.

### 2.5 Tab content area

- **Placement:** Fills remaining height. `flex-1 overflow-hidden flex`.
- **Structure:**
  - **Optional sidebar (structured mode only):** When `preferenceMode === 'structured'` and `activeTab === 'dashboard'` and `activeView !== 'focus'`. `aside`, `hidden md:flex`, `shrink-0`, `w-72`, `border-r border-white/5`. Padding `var(--atlas-space-section)`. Content: `QuickAddForm` (always open, no FAB).
  - **Main content:** Either Focus view (full-bleed) or scroll container (see below).

**Focus mode:** When `activeTab === 'dashboard'` and `activeView === 'focus'`, the main area is a single full-bleed `FocusView` (no padding). No sidebar.

**Normal content (all other states):** A single scrollable column:
- **Padding:** `padding: var(--atlas-space-page-y) var(--atlas-space-page-x)`.
- **Vertical gap:** `space-y-[var(--atlas-space-section)]` between top-level sections.
- **Overflow:** `overflow-y-auto`, `no-scrollbar`, `flex-1`.

---

## 3. Tab content layout (by tab)

### 3.1 Dashboard tab

- **View: Today**
  - Order: QuickCaptureBar → (optional MorningCheckIn) → PriorityInbox → (optional EveningCheckIn) → TodaysPlanCard → (optional Daily Intention) → AtlasAIPanel → Stat cards grid → Energy wave section → Task timeline → Today's habits → Active goals → Insights (GoalVelocityChart, HabitHeatmap).
  - **Stat cards:** Grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`, gap `gap-4`.
  - **Section headings:** Use a consistent section label style: `text-xs font-bold uppercase tracking-[0.12em] text-white/70` or token `--atlas-type-label` with `--atlas-text-secondary`.

- **View: Week**
  - WeekGrid (7 columns from `sm`), then optional DayTaskPanel when a day is selected.

- **View: Month**
  - MonthPlanner, then optional DayTaskPanel when a day is selected.

- **View: Focus**
  - Full-bleed FocusView only (no QuickCaptureBar, no sidebar).

### 3.2 Backlog tab

- **Placement:** Single column, same page padding and section gap as dashboard content.
- **Sections:** (1) "Task Backlog" — TaskManager. (2) Divider `border-t border-white/5`. (3) "Active Goals" — GoalTracker.
- **Headings:** `text-lg font-bold font-display text-white/90` for "Task Backlog" and "Active Goals".

### 3.3 Routines tab

- **Sections:** (1) "Weekly Routine Skeleton" — RoutineEditor. (2) "Habit Builder" — HabitBuilder.
- **Section label:** `text-xs font-bold text-white/70 uppercase tracking-[0.12em] font-display`.

### 3.4 Journal tab

- **Component:** `JournalTab` (owns its own sub-nav: Today / Free Write / History and content).
- **Internal padding:** Use `px-4 md:px-6` for Journal content; align with token philosophy by preferring `var(--atlas-space-page-x)` where possible.

### 3.5 Analytics tab

- **Component:** `AtlasAnalytics`. Grids: summary cards `grid-cols-2 md:grid-cols-3`, etc. Use token spacing for outer padding.

### 3.6 Fields tab

- **Component:** `FieldsTab`. Grid for field cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.

### 3.7 Review tab

- **Header row:** "Temporal Reviews" (left), "Run Weekly Review" button (right). Same section title style as Backlog.
- **Content:** If `profile.reviews.length > 0`, list of review cards (grid/list). Else: EmptyState with icon `History`, title "No reviews yet", description "Run your first weekly review using the button above to save a snapshot to this list."
- **Modal:** "Run Weekly Review" opens `WeeklyReviewModal`. Modal must include "Complete review & save" primary action that persists a review (via `onCompleteReview` → `temporal_review` action) and closes the modal.

---

## 4. Component customization rules

### 4.1 SectionHeader (core)

- **Label:** `text-[11px] sm:text-xs`, `font-semibold`, `uppercase`, `tracking-[0.15em]`, `font-display`. Accept `accentClassName` (e.g. `text-sky-400`).
- **Title:** `text-xl sm:text-2xl md:text-3xl`, `font-bold`, `uppercase`, `tracking-tight`, `text-white`, `font-display`.
- **Subtitle:** `text-[11px] sm:text-xs md:text-sm`, `text-white/60` (contrast), `max-w-xl`, `leading-relaxed`.
- **Do not** use subtitle below 60% opacity for accessibility.

### 4.2 EmptyState (core)

- **When to use which icon:** Use `Inbox` (or neutral/positive icon) for positive empty states (e.g. "Inbox clear"). Use `AlertCircle` only for warnings/errors. Use `History` for "No reviews yet."
- **Border:** Prefer solid border for static empty states; dashed only for actual drop targets.
- **Size:** `sm` (p-4, gap-2, text-xs), `md` (default), `lg` (p-8, gap-4, text-sm).

### 4.3 NeuralTabGroup (core)

- **Atlas usage:** `themeColor="sky"`, `variant="pill"`. Tab strip wrapper must provide `scrollPaddingLeft: var(--atlas-space-page-x)` so the first tab is visible when scrolling.
- **Tab button:** Min touch target, `whitespace-nowrap`, `shrink-0`. Do not clip labels.

### 4.4 ViewSwitcher (Atlas)

- **Style:** Inline-flex pills, active = `bg-emerald-500/10`, text `text-[10px] font-bold uppercase`. Min height 32px; recommend `var(--atlas-space-touch)` for primary view buttons.
- **Keyboard:** Full roving tabindex and Arrow/Home/End support.

### 4.5 QuickCaptureBar (Atlas)

- **Placement:** First content block on Dashboard (Today/Week/Month). Full width of content column. Left border accent: sky-500. Submit: square + button (sky).
- **Placeholder:** Keep short on small screens; long examples in tooltip or second line.

### 4.6 PriorityInbox (Atlas)

- **Empty state:** MUST use `icon={Inbox}` (not default AlertCircle). Title "Inbox clear", description "No queued tasks. Add something to work on."
- **Container:** Rounded card, border, token-compatible padding.

### 4.7 TodaysPlanCard (Atlas)

- **Energy display:** Single primary energy display (bar + value). Avoid repeating the same metric three times (bar + header + card); if multiple metrics, differentiate (e.g. "remaining" vs "budget").
- **Energy bar:** Use semantic colors (e.g. emerald / amber / rose by level). `role="meter"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.

### 4.8 Buttons (primary actions)

- **Touch target:** Min height/width `var(--atlas-space-touch)`.
- **Border radius:** Pill for toggle/secondary: `var(--atlas-radius-pill)`. Card-style for primary: `rounded-xl` or `var(--radius-button)`.
- **Consistency:** REMINDERS and Conversational (preference) buttons in header MUST share the same border weight and padding pattern.

### 4.9 Chat / FAB (SingleAgentLayout)

- **Position:** Fixed, bottom-right. Bottom offset: `calc(24px + moduleBottomBarHeight + env(safe-area-inset-bottom))`. Right: `right-4` mobile, `md:right-3 lg:right-6` desktop.
- **Atlas theme:** `themeColor="sky"`. FAB uses sky accent.
- **Primary action (e.g. QuickAdd):** When provided, rendered above the chat FAB on mobile; same bottom-right region.

---

## 5. Responsive design specification

### 5.1 Breakpoints (Tailwind defaults)

| Breakpoint | Min width | Atlas usage |
|------------|-----------|-------------|
| (default) | 0 | Mobile-first base. Single column, stacked layout, touch targets enforced. |
| `sm` | 640px | Show preference toggle label ("Structured" / "Conversational"). Some grids 2 columns. |
| `md` | 768px | **Layout breakpoint:** Show structured-mode sidebar (QuickAdd). Desktop chat layout. Many grids 2 cols. |
| `lg` | 1024px | Chat FAB shows "Chat Atlas" label. Some grids 3–4 columns. |
| `xl` | 1280px | Stat cards 4 columns. Fields grid 4 columns. |
| `2xl` | 1536px | Optional max container; no structural change required. |

**Mobile vs desktop (SingleAgentLayout):** `mobileBreakpoint = 768` (md). Below 768: chat is overlay/FAB. At or above 768: chat is sidebar.

### 5.2 Small (0–639px)

- **Header:** Title and subtitle may wrap. Status badge and preference button stay on one row with title block; preference label hidden (icon only).
- **Tabs:** Horizontal scroll with visible scroll padding so first tab is not clipped. Tab labels and icons only; no reduction in tap target.
- **View switcher:** Horizontal scroll if needed; all four options visible with min touch target.
- **Content:** Single column. No sidebar. Padding: `var(--atlas-space-page-x)` (min 0.75rem).
- **Grids:** Stat cards 1 column. Task/Goal/Backlog summary cards: 2 columns where used. Forms: stack inputs (1 column).
- **FAB/Chat:** Fixed bottom-right with safe-area inset. Primary action (QuickAdd) above chat FAB when provided. Reserve bottom padding so content is not hidden behind FAB (`pb-24` when FAB visible).

### 5.3 Medium (640px–767px)

- **Header:** Preference toggle label visible (`sm:inline`). Rest unchanged.
- **Grids:** 2 columns where specified (e.g. `sm:grid-cols-2`). Backlog metrics can use 2–3 columns.
- **Sidebar:** Still hidden (sidebar shows from `md`).
- **Chat:** Still overlay/FAB (until `md`).

### 5.4 Medium (768px–1023px) — Desktop start

- **Sidebar (structured mode):** Visible. Width 18rem (w-72). Border right, token padding.
- **Chat:** Becomes sidebar (not overlay). Content area no longer needs extra bottom padding for FAB when chat closed.
- **Grids:** Stat cards 2 columns (`md:grid-cols-2`). Backlog/TaskManager/Goals: 2–4 columns per component spec.
- **Focus view:** Padding can increase (e.g. `md:p-12`).

### 5.5 Large (1024px+)

- **Chat FAB (when collapsed):** Can show "Chat Atlas" label (`lg:flex`).
- **Stat cards:** 4 columns (`xl:grid-cols-4`).
- **Fields tab:** Up to 4 columns (`xl:grid-cols-4`).
- **Container (optional):** Content can be constrained to `max-w-[var(--atlas-container-max)]` with `mx-auto` if a max width is desired on very large screens.

### 5.6 Touch and accessibility

- **Minimum touch target:** 44px (2.75rem) for all interactive elements. Use `min-h-[var(--atlas-space-touch)]` and/or `min-w-[var(--atlas-space-touch)]` for buttons and tab controls.
- **Focus:** All interactive elements must have visible focus ring (e.g. `focus-visible:ring-2 focus-visible:ring-sky-500/50`). No `outline: none` without a ring.
- **Reduced motion:** Respect `prefers-reduced-motion` for tab pill and view switcher animations (use `useReducedMotion` and disable or shorten transitions).

---

## 6. Data and view linkage (no placeholders)

- **Dashboard:** All blocks (PriorityInbox, TodaysPlanCard, Energy wave, Task timeline, Habits, Goals, Insights) are driven by `profile` (tasks, habits, goals, energyWave, scheduledTasks, dailyIntentions) and `soul` (cognitive state). No mock data.
- **Backlog:** TaskManager and GoalTracker use `profile.tasks`, `profile.goals`; create/update/delete wired to ActionHub.
- **Routines:** RoutineEditor and HabitBuilder use `profile.routine`, `profile.habits`; all mutations via ActionHub.
- **Journal:** JournalTab uses journal service (load/save journal entries) and vault; no unlinked views.
- **Analytics:** AtlasAnalytics uses `profile` (tasks, habits, energyWave, etc.) for all charts and stats.
- **Fields:** FieldsTab uses `extensions` and `fieldValues`; add/delete field and AI suggestions wired.
- **Review:** List from `profile.reviews`. "Run Weekly Review" opens WeeklyReviewModal. "Complete review & save" in modal calls `onCompleteReview` → persists via `temporal_review` action → new item in `profile.reviews`. Empty state copy explains the CTA.

---

## 7. File reference

| Concern | File(s) |
|--------|---------|
| Design tokens (CSS) | `src/index.css` (:root) |
| Token constants / layout classes | `src/modules/atlas/atlas-tokens.ts` |
| Dashboard layout and tab content | `src/modules/atlas/components/EnhancedAtlasDashboard.tsx` |
| Page-level wrapper and reminders | `src/modules/atlas/AtlasPage.tsx` |
| Shell (chat, FAB, sidebar) | `src/core/layout/SingleAgentLayout.tsx` |
| Tabs (main nav) | `src/core/components/NeuralTabGroup.tsx` |
| View switcher (Today/Week/Month/Focus) | `src/modules/atlas/components/ViewSwitcher.tsx` |
| Section title block | `src/core/components/SectionHeader.tsx` |
| Empty states | `src/core/components/EmptyState.tsx` |
| Design audit (issues and fixes) | `src/modules/atlas/DESIGN_AUDIT.md` |

---

## 8. Changelog

- **Initial spec:** Design tokens, layout placement, component customization, responsive breakpoints, and data linkage documented. Aligns with implemented Atlas layout (token-based padding, scroll padding for tabs, Review tab and Weekly Review modal wired to `profile.reviews`).
