# Titan Module — Design & Layout Specification

Complete design and layout specification for the Titan (Performance Domain) module: design tokens, **element placement and layout summary**, components, data contracts, and responsive behavior.

---

## 1. Overview

- **Module ID:** `titan`
- **Route:** `/titan`
- **Layout:** `SingleAgentLayout` (main content + optional agent sidebar; mobile = overlay chat)
- **Theme accent:** Orange (`themeColor="orange"`, `--titan: #f59e0b`)
- **Purpose:** Training plans, workout logging, readiness metrics, sleep/cardio/body composition, cycles, and custom fields — all wired to Titan agent and `TitanProfile`.

---

## 2. Complete Layout & Placement Summary

### 2.1 Page-level layout (vertical stack)

Titan content lives inside **SingleAgentLayout**. The main column is a single vertical flex column; the agent chat is a separate column (desktop) or overlay (mobile). All placement below refers to the **main content column** only.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. HEADER BLOCK (in flow)                                       │
│    Full width. Content padded px-4 sm:px-6 md:px-8.              │
│    SectionHeader: label left, title left, subtitle left;         │
│    optional action slot right.                                   │
├─────────────────────────────────────────────────────────────────┤
│ 2. TAB BAR (in flow)                                             │
│    Full width, border-b. Same horizontal padding as header.     │
│    Left: NeuralTabGroup (scrollable horizontally on small).     │
│    Right: Module controls (Reminders, Coach toggle).              │
│    < xl: controls below tabs (flex-col). ≥ xl: same row.         │
├─────────────────────────────────────────────────────────────────┤
│ 3. TAB PANEL (flex-1, scrollable)                                │
│    Fills remaining height. overflow-y-auto.                      │
│    Content padded pt-4 sm:pt-5 md:pt-6; training tab also       │
│    md:pb-[calc(5rem+env(safe-area-inset-bottom))].              │
│    All section content uses same horizontal padding as header.   │
├─────────────────────────────────────────────────────────────────┤
│ 4. FOOTER (training tab only, sticky bottom dock, shrink-0)       │
│    LogConfirmCard (when pending) then QuickLogBar.               │
│    Full width of main column. Bar: full width, no outer px on md+│
└─────────────────────────────────────────────────────────────────┘
```

- **Positioning:** Header (1) and tab bar (2) remain in document flow. The **tab panel (3)** scrolls. Footer (4) is a **sticky bottom dock within Titan's main column**, so quick logging stays reachable while training content scrolls underneath it.
- **Width:** Main column is `flex-1 min-w-0`; all content full width of that column. Horizontal padding applied to inner content only (`px-4 sm:px-6 md:px-8`).

---

### 2.2 Header block — element placement

| Element | Placement | Alignment | Width | Notes |
|--------|-----------|-----------|--------|--------|
| SectionHeader container | First child of padded div | — | 100% | `flex items-start justify-between gap-4` |
| Label ("Performance Domain") | Left | Start | Auto | Above title |
| Title ("Titan Strategy & Readiness") | Left | Start | Auto | Below label |
| Subtitle | Left | Start | max-w-xl | Below title |
| Action slot | Right | End | Auto | Optional; currently unused in Titan |

---

### 2.3 Tab bar — element placement

| Element | Placement | Alignment | Width | Notes |
|--------|-----------|-----------|--------|--------|
| Tabs container | Left (or full width when stacked) | Start | Flexible | `overflow-x-auto`, horizontal scroll on small |
| NeuralTabGroup | Inside tabs container | Start | min-content | Pills in a row |
| Divider | Between tabs and controls | — | w-px h-4 | Hidden on default, visible sm+ |
| Module controls wrapper | Right (or below tabs < xl) | End / self-start xl:self-auto | Auto | Reminders, Coach toggle, Zap icon |
| ModuleReminderEntry | First in controls | Start | Auto | "REMINDERS" button |
| "Logbook" / "Coach" label | After divider | Start | Auto | text-white/40 |
| NeuralToggle | After label | Start | Auto | Coach mode switch |
| Zap icon | After toggle | Start | w-3 h-3 | Indicator |

---

### 2.4 Training tab — content placement (top to bottom)

| Order | Section | Placement | Width | Alignment | Conditional |
|-------|---------|-----------|--------|-----------|--------------|
| 1 | Advisory banner | Full width, mx-4 sm:mx-6 md:mx-8 | Content area minus margin | Row: message left, close right | When advisoryBanner set |
| 2 | "This Week" label | Above calendar, same padding | 100% | Space-between (none here) | Always |
| 3 | TrainingCalendar | Below label | 100% | Block | Always |
| 4 | Session logger block | Full width, same padding | 100% | Block | When calendarSelectedRoutine set |
| 5 | SomaSnapshotWidget | Full width, same padding | 100% | Block | Always |
| 6 | ClearanceBanner | Full width, same margin as banner | 100% | Block | When clearance pending/denied |
| 7 | TitanReadiness (TitanDashboard) | Full width, no extra px | 100% | Block | Always |
| 8 | TitanRoutinePanel | Full width, same padding | 100% | Grid 1 col / lg:2 col | Always |
| 9 | WorkoutSessionLogger block | Full width, same padding | 100% | Block | When no calendar selection and routines.length > 0 |
| 10 | RoutineProgress block | Full width, same padding | 100% | Block | When routines.length > 0 |
| 11 | CustomFieldManager block | Full width, same padding | 100% | Block | When profile exists |
| 12 | Bottom spacer | Full width | 100% | Block, h-4 | Always (training) |
| 13 | LogConfirmCard | Inside sticky footer dock, above QuickLogBar | 100% | Block | When pendingLogEntries.length > 0 |
| 14 | QuickLogBar | Sticky bottom dock | 100% | Block | Always (training tab) |

---

### 2.5 TitanRoutinePanel — internal layout

- **Outer:** CSS Grid. **&lt; lg:** 1 column. **≥ lg:** 2 columns, equal width; gap-4 sm:gap-5 md:gap-6.
- **Column 1 (Weekly Plan):**
  - **Row 1:** Flex row. Left: PanelLabel ("Weekly Plan", metadata = "N days"). Right: NeuralButton "Add Day". Alignment: space-between.
  - **Row 2:** Vertical list of day rows. Each row: flex, left = day name + routine name (truncate), right = "N ex" + Log Session button + Edit icon + ChevronRight. Buttons right-aligned; fixed min width for Log Session (7.25rem).
- **Column 2 (Today's Protocol):**
  - **Row 1:** PanelLabel ("Today's Protocol", metadata = today weekday).
  - **Row 2:** Either empty state (centered text + "Request a session") or list of exercise rows. Each row: flex space-between; left = exercise name (truncate), right = sets×reps. Below list: "Edit today's routine" link (centered).

---

### 2.6 TrainingCalendar — internal layout

- **Container:** Single column. Padding p-3 sm:p-4 md:p-5.
- **Row 1 (week nav):** Flex, centered. Order: [Prev week button] [Week label + Today pill] [Next week button]. Buttons equal min size (2.5rem); label and pill in middle, can wrap.
- **Row 2 (7-day grid):** Grid 7 columns, gap-1.5 sm:gap-2. Each cell: vertical stack. Top: day label (e.g. "Mon") centered; then date number in circle (today = green fill); then day card (min-height 88px sm:100px). Inside card: either workout summary (name, sets, muscle chips) or "Rest" + Add button (centered).
- **Row 3 (weekly summary):** Border-top, mt-3 sm:mt-4 pt-3. Inline text: "This week: N workouts · M sets · Primary: …". Left-aligned, wrap.

---

### 2.7 QuickLogBar — internal layout

- **Outer wrapper:** Full width; always respects bottom safe-area inset. Inner has px-2 (mobile), md:px-0.
- **History chip (when focused, no input):** Positioned **above** the bar. **Mobile:** left-2 right-2 (full width minus 8px). **sm+:** centered (left-1/2 -translate-x-1/2). Max width min(280px, 100vw-2rem). Content: [Clock icon] [Reuse:] [truncated suggestion]. Chip is a single row, center-aligned content.
- **Bar tray:** Single flex row, full width. Border-top; no internal padding on tray itself.
- **Inner row (flex, gap-2 sm:gap-3):**
  - **Left:** Nexus button (Sparkles). 48×48px, rounded-2xl. **Hidden when viewport &lt; 380px.**
  - **Center:** Text input. flex-1 min-w-0, rounded-xl, min-height 44px (sm: 48px). Takes all remaining space.
  - **Right:** Action group (flex, shrink-0). When no input: Plus button (48×48). When input: Submit (ChevronUp) 48×48. When Plus expanded (and no input): [Cardio button 44×44] [Manual Log 44×44] [Plus 48×48]. Actions stay right-aligned; no wrap.
- **Keyboard behavior:** On mobile, the sticky footer dock should shift upward with the soft keyboard using `visualViewport` when available, while preserving hardware-keyboard `Enter` submission.

---

### 2.8 LogConfirmCard — placement

- Renders **above** QuickLogBar, same parent. In flow; slides up (AnimatePresence). Full width of main column. Card content: header (title, close), list of parsed entries, commit/edit/dismiss actions at bottom. Vertically stacked; no side-by-side with bar.

---

### 2.9 Progress tab — content placement

| Order | Section | Placement | Width | Alignment |
|-------|---------|-----------|--------|-----------|
| 1 | PRBoard | First in space-y | 100% | Section heading left; grid 2 cols sm:3 cols |
| 2 | ProgressTab | Below PRBoard | 100% | Block (or EmptyState centered) |
| 3 | BodyWeightTracker | Below ProgressTab | 100% | Header row space-between; content block |
| 4 | CardioLogger | Below BodyWeightTracker | 100% | Same pattern |

All inside one wrapper with `space-y-5 sm:space-y-6 md:space-y-8`.

---

### 2.10 Analytics tab — content placement

Single column. Four panels in order: Strength Progression, Muscle Volume, Training Heatmap, Recovery Trend. Each panel is a SurfaceCard; title row (icon + title) left-aligned; chart/content below. Vertical gap between panels: space-y-5 sm:space-y-6 md:space-y-8.

---

### 2.11 Cycles tab — content placement

Single column. CycleManager: list of cycle cards (full width, stacked). Each card: left = icon + name + meta; right = status icon. "New Cycle" button typically top-right of section. Modals (create/edit) center over content (fixed, z-modal).

---

### 2.12 Sleep tab — content placement

SleepTracker owns full-width layout. Order: PanelLabel + action buttons (Trends, Log Sleep) — row space-between; then metric grid (2 cols lg:4); then chart card; then recent entries list. All left-aligned blocks; buttons right-aligned in header.

---

### 2.13 PRBoard — internal layout

- Section heading: flex gap-2, icon + "PR Board" left.
- Grid: 2 columns (sm: 3). Each PR card fixed structure (title, value, sparkline). Empty slots: PlaceholderCard, same cell size, centered "Log more exercises to track PRs".

---

### 2.14 SingleAgentLayout (external) — Titan’s position

- **Desktop:** Main content (Titan) is the first flex child (`flex-1 min-w-0`). Agent sidebar is the second child (collapsible). Chat FAB fixed bottom-right, above module bar when present.
- **Mobile:** Main content full width; chat is overlay (drawer). FAB same bottom-right; Titan sets `hideGlobalFAB` true on training tab so only QuickLogBar shows at bottom.

---

## 3. Global Design Tokens (Titan-relevant)

### 3.1 Spacing (Tailwind + CSS variables)

| Token | Tailwind | CSS / px | Usage |
|-------|----------|----------|--------|
| **Content padding (horizontal)** | `px-4` → `sm:px-6` → `md:px-8` | 16px → 24px → 32px | Page/section gutters |
| **Content padding (vertical)** | `pt-4` / `pb-5` → `sm:pt-5` / `sm:pb-6` → `md:pt-6` / `md:pb-8` | 16–24px / 20–24px / 24–32px | Section top/bottom |
| **Section gap** | `space-y-5` → `sm:space-y-6` → `md:space-y-8` | 20px → 24px → 32px | Between major blocks |
| **Card inner** | `p-3` → `sm:p-4` → `md:p-5` or `p-4` → `sm:p-5` → `md:p-6` | 12–20px / 16–24px | SurfaceCard, panels |
| **Inline gap** | `gap-2` → `sm:gap-3` → `gap-4` | 8px → 12px → 16px | Buttons, row items |
| **List item** | `py-3`, `min-h-[2.75rem]` → `sm:min-h-[3rem]` | 44px min (touch) | Rows, list items |
| **Panel section gap** | — | `--panel-section-gap: 1.25rem` (20px) | Legacy; prefer `mb-3 sm:mb-4` |
| **Space scale** | — | `--space-xs` 0.5rem … `--space-xl` 2rem | When using CSS |

### 3.2 Typography

| Role | Tailwind | Size / weight | Usage |
|------|----------|---------------|--------|
| **Page title** | `text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-tight font-display text-white` | 20px → 24px → 30px | SectionHeader title |
| **Section label** | `text-[11px] sm:text-xs font-semibold uppercase tracking-[0.15em] font-display` | 11px → 12px | SectionHeader label, accent |
| **Subtitle** | `text-[11px] sm:text-xs md:text-sm text-white/50 leading-relaxed` | 11–14px | SectionHeader subtitle |
| **Panel label** | `text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] text-white/50` | 11–12px | PanelLabel |
| **Panel metadata** | `text-[11px] sm:text-xs uppercase tracking-wider text-white/40 tabular-nums` | 11–12px | PanelLabel metadata |
| **Body / row** | `text-[11px] sm:text-xs` or `text-xs sm:text-sm` | 11–14px | List rows, cards |
| **Caption / meta** | `text-[10px]` / `text-[9px]` | 9–10px | Chips, tags, axis labels |
| **Input** | `text-sm sm:text-[14px]` | 14px | Inputs, QuickLogBar |
| **Font stacks** | — | `--font-sans`, `--font-display`, `--font-mono` | Body, headings, code |

### 3.3 Color (Titan)

| Role | Tailwind / CSS | Hex / RGBA |
|------|----------------|------------|
| **Background** | `var(--void)`, `bg-black/5` | #020205, black/5% |
| **Surface card** | `surface-card`, `--surface-card-bg` | rgba(255,255,255,0.04), border 0.12 |
| **Accent (Titan)** | `text-orange-400`, `bg-orange-500/10`, `border-orange-500/20` | Orange-400/500 |
| **Text primary** | `text-white`, `text-white/90` | 90–100% white |
| **Text secondary** | `text-white/60`, `text-white/50` | 50–60% white |
| **Text muted** | `text-white/40`, `text-white/30` | 30–40% white |
| **Borders** | `border-white/10`, `border-white/5` | 5–10% white |
| **Success / today** | `text-emerald-400`, `bg-emerald-500` | Emerald |
| **Warning / advisory** | `bg-amber-500/10`, `border-amber-500/20`, `text-amber-300` | Amber |
| **Nexus (sparkle)** | `bg-indigo-500/10`, `text-indigo-400` | Indigo |

### 3.4 Radii

| Token | Tailwind | CSS | Usage |
|-------|----------|-----|--------|
| **Base** | `rounded-lg` | `--radius-base` 0.5rem | Buttons, small controls |
| **Button** | `rounded-button` | `--radius-button` 0.65rem | NeuralButton |
| **Card** | `rounded-xl`, `rounded-2xl` | `--radius-card` 1rem | Cards, panels |
| **Panel** | `rounded-2xl` | `--radius-card-strong` 1.3rem | Modals, large cards |
| **Pill** | `rounded-full` | — | Badges, Today pill |

### 3.5 Z-Index (layers)

| Layer | CSS variable | Value | Usage |
|-------|----------------|-------|--------|
| Base | `--z-base` | 0 | Default |
| Content | `--z-content` | 10 | Main content |
| Header | `--z-header` | 50 | Sticky headers |
| FAB / bar | `--z-fab` | 60 | QuickLogBar, Chat FAB |
| Overlay | `--z-overlay` | 70 | Backdrops |
| Modal | `--z-modal` | 80 | Modals, drawers |
| Toast | `--z-toast` | 90 | Toasts, banners |

### 3.6 Touch & accessibility

- **Minimum touch target:** `min-h-[2.25rem]` (36px) for small actions; `min-h-[2.75rem]` (44px) for list rows and primary controls.
- **Button heights:** NeuralButton `sm` = 36px (`h-9`), `md` = 40px; icon buttons often `min-w-[2.25rem] min-h-[2.25rem]` or `w-12 h-12` (48px).
- **QuickLogBar:** Input and primary buttons ≥ 44px height; safe area `pb-[env(safe-area-inset-bottom,0px)]` on `sm+` only (mobile can be `pb-0`).

---

## 4. Breakpoints & Responsive Strategy

Tailwind defaults (assumed):

| Breakpoint | Min width | Titan usage |
|------------|-----------|-------------|
| **Default** | &lt; 640px | Single column, stacked controls, reduced padding |
| **sm** | 640px | Slightly larger padding and type; some gaps increase |
| **md** | 768px | Content padding 32px; tab panel padding; QuickLogBar safe area |
| **lg** | 1024px | Weekly Plan grid 2 columns; some grids 2–4 cols |
| **xl** | 1280px | Tab bar and module controls single row (`xl:flex-row xl:items-center`) |

- **SingleAgentLayout** uses `mobileBreakpoint = 768`: below = mobile (chat overlay); above = split or full.
- **Titan-specific:** Training tab content gets `md:pb-[calc(5rem+env(safe-area-inset-bottom,0px))]` so content clears the QuickLogBar on desktop.

---

## 5. Page Structure (TitanPage)

### 5.1 Shell

- **Wrapper:** `flex flex-col h-full overflow-hidden`.
- **Header block:** `px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8 pb-3 sm:pb-4 md:pb-5`; contains `SectionHeader` (Performance Domain, Titan Strategy & Readiness).
- **Tab bar:** `px-4 sm:px-6 md:px-8 pb-3 sm:pb-4 md:pb-6 border-b border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4`; `NeuralTabGroup` (Training, Analytics, Progress, Sleep, Cycles) + module controls (Reminders, Coach toggle).
- **Tab panel:** `flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pt-4 sm:pt-5 md:pt-6`; when training tab active add `md:pb-[calc(5rem+env(safe-area-inset-bottom,0px))]`.
- **Footer (training only):** LogConfirmCard (when pending entries) + QuickLogBar; both inside same conditional block.

### 5.2 Section content padding (all tabs)

Consistent horizontal + vertical:

- **Horizontal:** `px-4 sm:px-6 md:px-8`.
- **Vertical:** Section wrappers use `pb-5 sm:pb-6 md:pb-8`, `pt-4 sm:pt-5` (or `pt-2 sm:pt-3` where needed); internal section spacing `space-y-5 sm:space-y-6 md:space-y-8` or `space-y-4 sm:space-y-5`.

---

## 6. Components & Elements

### 6.1 SectionHeader (core)

- **Layout:** `flex items-start justify-between gap-4`; left: `space-y-1 min-w-0`.
- **Label:** `text-[11px] sm:text-xs font-semibold uppercase tracking-[0.15em] font-display` + `accentClassName` (e.g. `text-orange-400`).
- **Title:** `text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-tight text-white font-display`.
- **Subtitle:** `text-[11px] sm:text-xs md:text-sm text-white/50 max-w-xl leading-relaxed`.
- **Data:** `label`, `title`, `subtitle`, optional `action`; no profile data.

---

### 6.2 PanelLabel (core)

- **Layout:** `flex items-center justify-between gap-2 min-h-[1.5rem] mb-3 sm:mb-4`.
- **Label:** `text-[11px] sm:text-xs font-bold uppercase tracking-[0.12em] text-white/50 leading-tight`.
- **Metadata:** `text-[11px] sm:text-xs uppercase tracking-wider text-white/40 tabular-nums shrink-0`.
- **Data:** `label: string`, `metadata?: string`.

---

### 6.3 NeuralTabGroup (core)

- **Theme:** `themeColor="orange"` for Titan.
- **Tokens:** Orange pill active state (`bg-orange-500/10`, `border-orange-500/20`), underline/badge orange.
- **Data:** `tabs: NeuralTabItem<TitanTab>[]` (id, label, icon, optional badge), `activeTab`, `onTabChange`.

---

### 6.4 Training tab — blocks (in order)

#### Advisory banner (conditional)

- **Layout:** `mx-4 sm:mx-6 md:mx-8 mb-3 sm:mb-4 flex items-start justify-between p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20`.
- **Copy:** `text-[11px] sm:text-xs text-amber-300 leading-relaxed`.
- **Data:** `advisoryBanner: string | null` (e.g. high-RPE warning).

#### This Week (calendar wrapper)

- **Padding:** `px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-2 sm:pt-3`.
- **Label:** `text-[11px] sm:text-xs font-bold text-white/40 uppercase tracking-wider`, "This Week".
- **Data:** Drives `TrainingCalendar` (see below).

#### Session logger (calendar-selected routine)

- **Padding:** `px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 pt-0`; label row `mb-2 sm:mb-3`.
- **Label:** `text-[11px] sm:text-xs text-white/40 uppercase tracking-wider font-bold truncate`.
- **Dismiss:** `text-[11px] sm:text-xs … min-h-[2.25rem] min-w-[2.25rem]`.
- **Data:** `calendarSelectedRoutine: Routine | null`; `WorkoutSessionLogger` gets routines, `recentSessions`, submit/commit from profile.

#### Soma snapshot

- **Wrapper:** `px-4 sm:px-6 md:px-8 mb-2 sm:mb-3`.
- **Data:** `clearanceStatus`, `lastBiomarkerDate` from Soma profile.

#### ClearanceBanner (conditional)

- **Class:** `mx-4 sm:mx-6 md:mx-8 mb-3 sm:mb-4`; internal `min-h-[2.75rem] sm:min-h-[3rem]`, `px-3 sm:px-4 py-3`, `rounded-xl`.
- **Data:** `status`: 'granted' | 'pending' | 'denied' from Soma clearances.

#### TitanReadiness (TitanDashboard)

- **Container:** `p-4 sm:p-5 md:p-6 bg-black/40 border-b border-white/5 backdrop-blur-xl space-y-4 sm:space-y-5`.
- **Header:** Label `text-[11px] sm:text-xs`, title `text-lg sm:text-xl md:text-2xl`, subtitle `text-[11px] sm:text-xs`; "Performance Coach", "Today's Readiness".
- **Data:** `soul: GlobalProjection | null`, `isLocked`, `onCalibrate`; metrics from soul; hormonal card when `profile?.assignedSexAtBirth === 'female'`.

#### TitanRoutinePanel

- **Outer:** `grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6 px-4 sm:px-6 md:px-8 pt-4 sm:pt-5 pb-5 sm:pb-6 md:pb-8 bg-black/40 border-b border-white/5 backdrop-blur-xl`.
- **Cards:** `SurfaceCard className="p-3 sm:p-4 md:p-5"`.
- **PanelLabel:** Standard spacing `mb-3 sm:mb-4` (from component).
- **Weekly Plan row:** `flex items-center gap-2 text-[11px] sm:text-xs px-3 sm:px-3.5 py-3 min-h-[2.75rem] sm:min-h-[3rem] rounded-xl`; today = `bg-orange-500/10 text-orange-300 font-bold`; Log Session button `min-w-[7.25rem]`.
- **Today's Protocol:** Same card padding; rest state `py-5 sm:py-6 space-y-3`, `text-[13px] sm:text-sm`; exercise rows `min-h-[2.75rem]`, `text-[11px] sm:text-xs`.
- **Data:** `routines: Routine[]` from profile; `onAnalyzeRoutine`, `onGeneratePlan`, `onImportRoutine`, `onSubmitForApproval`, `onStartSession` (agent or state).

#### WorkoutSessionLogger (when no calendar selection)

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 md:pb-6 pt-4 sm:pt-5`.
- **Data:** `routines`, `recentSessions` from profile; `onSubmitSession` = agent; `onDirectCommit` updates profile.

#### RoutineProgress

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-4 sm:pb-5 md:pb-6 pt-4 sm:pt-5`; internal `space-y-5 sm:space-y-6 md:space-y-8`.
- **Data:** `routines`, `workoutSessions ?? []` from profile.

#### CustomFieldManager

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-2 sm:pt-3`.
- **Data:** `currentValues={profile.nutrition || {}}`, `customFields={profile.customFields}`; `onAICreateMacros` = agent when not direct write.

#### Bottom spacer

- **Layout:** `h-4` (16px) before QuickLogBar for breathing room.

---

### 6.5 TrainingCalendar

- **Container:** `bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5`.
- **Week nav:** Buttons `min-h-[2.5rem] min-w-[2.5rem]`; label `text-[11px] sm:text-xs`; Today pill `text-[11px] sm:text-xs … min-h-[1.75rem]`.
- **Grid:** `grid grid-cols-7 gap-1.5 sm:gap-2`.
- **Day cell:** `min-h-[88px] sm:min-h-[100px] rounded-lg sm:rounded-xl p-2 sm:p-2.5`; Rest + button `min-h-[2.25rem] min-w-[2.25rem]` (w-9 h-9); day label `text-[9px] sm:text-[10px]`; workout name `text-[10px] sm:text-[11px]`.
- **Weekly summary:** `mt-3 sm:mt-4 pt-3 border-t`; text `text-[11px] sm:text-xs`.
- **Data:** `workoutLogs: TitanWorkoutLog[]`, `sessions?: WorkoutSession[]`, `onQuickLog?: (date: string) => void`.

---

### 6.6 QuickLogBar

- **Outer:** `w-full shrink-0 z-[var(--z-fab)] mt-auto`; mobile `pb-0`, `sm:pb-[env(safe-area-inset-bottom,0px)]`.
- **Inner wrapper:** `w-full relative px-2 md:px-0 overflow-hidden`.
- **Bar tray:** `flex items-center w-full … overflow-hidden bg-white/[0.08] backdrop-blur-2xl border-t border-white/10`; focused `border-orange-500/40 bg-white/[0.1]`.
- **Row:** `flex items-center gap-2 sm:gap-3 w-full py-2.5 px-2 sm:py-3 sm:px-4 min-w-0`.
- **Nexus button:** `min-w-[48px] min-h-[48px] w-12 h-12 rounded-2xl`; hidden `max-[380px]:hidden`.
- **Input:** `flex-1 min-w-0 … min-h-[44px] sm:min-h-[48px]`, `text-sm sm:text-[14px]`, `bg-black/20 border border-white/10 rounded-xl`, focus ring orange.
- **Actions:** Buttons `min-w-[44px] min-h-[44px]` or `min-w-[48px] min-h-[48px]`; Log Session primary `min-w-[7.25rem]` in Weekly Plan is separate.
- **History chip:** Above bar; `max-w-[min(280px,calc(100vw-2rem))]`; `min-h-[44px]`; `text-[11px]`.
- **Data:** `value`, `onChange`, `onSubmit`, `onManualLog`, `onCardioLog`, `recentSessions: WorkoutSession[]`, `disabled`.

---

### 6.7 LogConfirmCard

- **Position:** Inline above QuickLogBar; slide-up.
- **Data:** `entries: ParsedEntry[]`, `onCommit`, `onEdit`, `onDismiss`, `commitError`.

---

### 6.8 Progress tab

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-5 sm:space-y-6 md:space-y-8`.
- **PRBoard:** `personalRecords={Object.values(profile?.personalRecords ?? {})}`, `workoutLogs={profile?.workoutLogs ?? []}`.
- **ProgressTab:** `profile`, `encryptionKey`; uses `profile?.workoutSessions ?? []`, `profile?.personalRecords ?? {}`, `profile?.routines ?? []`.
- **BodyWeightTracker:** `bodyWeightLog={profile?.bodyWeightLog ?? []}`, `onAnalyze`, `directWriteMode`, `onDirectSave`.
- **CardioLogger:** `cardioLog={profile?.cardioLog ?? []}`, same agent/direct pattern; no extra horizontal padding (parent provides it).

---

### 6.9 Analytics tab

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-5 sm:space-y-6 md:space-y-8`.
- **Panels:** `SurfaceCard className="p-4 sm:p-5 md:p-6"`; title `text-[13px] sm:text-sm font-black uppercase tracking-wider`.
- **Data:** `profile` → `workoutSessions`, `sleepLog`, `personalRecords`; all charts from real data.

---

### 6.10 Cycles tab

- **Wrapper:** `px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5`.
- **CycleManager:** `cycles={profile?.cycles ?? []}`, `onSubmitForApproval={ai.handleSendMessage}`, `directWriteMode`, `onDirectCreate`, `onDirectDelete`.
- **Cards:** Cycle type/status from `CycleEntry`; no placeholder data.

---

### 6.11 Sleep tab

- **Wrapper:** `pb-5 sm:pb-6 md:pb-8` (SleepTracker has own `px-4 sm:px-6 md:px-8`).
- **SleepTracker:** Root `px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-4 sm:space-y-5`; metric grid `grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`; cards `p-3 sm:p-4 md:p-5`; entry rows `min-h-[2.75rem]`.
- **Data:** `sleepLog`, `onAnalyze`, `directWriteMode`, `onDirectSave`.

---

### 6.12 SurfaceCard (core)

- **Variants:** `surface-card` (default), `surface-card-strong`, `surface-inset`; optional `glow`.
- **Titan:** Typically default variant; padding overridden via `className="p-3 sm:p-4 md:p-5"` etc.

---

### 6.13 NeuralButton (core)

- **Sizes:** `sm` (h-9, px-4.5, text-[11px]), `md` (h-10, px-6), `lg`, `xl`.
- **Theme (Titan):** `themeColor="orange"` for primary actions.

---

### 6.14 PRBoard

- **Section:** `space-y-3`; heading `text-sm font-black … uppercase tracking-wider`.
- **Grid:** `grid-cols-2 sm:grid-cols-3 gap-3`; PR cards from `personalRecords`; empty slots filled with `PlaceholderCard` (dashed border, "Log more exercises to track PRs"), not fake data.
- **Data:** `personalRecords`, `workoutLogs`.

---

### 6.15 Other Titan components (summary)

- **RoutineProgress:** `space-y-5 sm:space-y-6 md:space-y-8`; cards `p-4 sm:p-5 md:p-6`; rows `min-h-[2.75rem]`; data from `routines`, `workoutSessions`.
- **BodyWeightTracker, CardioLogger, CustomFieldManager:** All use profile arrays/objects and agent or direct-write callbacks; responsive padding and typography aligned with tokens above.
- **SomaSnapshotWidget, ClearanceBanner:** Min heights and padding as in sections above; data from Soma/profile.
- **WorkoutSessionLogger, QuickLogDrawer, RoutineBuilder, CycleManager:** Use profile and agent; layout follows same spacing/type scale.

---

## 7. Data Structures (Titan)

### 7.1 Primary profile

- **TitanProfile** (see `@/lib/types`): `onboardingComplete`, `privacyLevel`, `trackingLevel`, `nutrition`, `activity`, `history`, `summary`, `routines`, `workoutSessions`, `workoutLogs`, `personalRecords`, `bodyWeightLog`, `cardioLog`, `sleepLog`, `cycles`, `customFields`, `directWriteMode`, plus medical/Soma mirrors.

### 7.2 Key types

- **Routine:** `id`, `name`, `exercises`, `rationale`, `weekday`, `timeframe`, `status`.
- **WorkoutSession:** `id`, `date`, `routineName`, `exercises`, `rpe`, `totalVolume`, etc.
- **TitanWorkoutLog:** `id`, `date`, `sets` (exerciseId, weight, reps).
- **PersonalRecord:** `exerciseName`, `e1RM`, `maxWeight`, `repsAtMax`, `achievedDate`, `sessionId`.
- **BodyWeightEntry, CardioSession, SleepEntry, CycleEntry, CustomField:** See `@/lib/types`.

### 7.3 Data flow

- **Load:** `subscribeTitanProfile` / `loadTitanProfile`; `normalizeTitanProfile` and `normalizeRoutines` on load/merge.
- **Agent:** `useModuleAI` → `ai.handleSendMessage` for analysis, routine submit, macros, etc.; actions in `titan/services/actions.ts` and parsing in `lib/actions/parsing-actions.ts` write to profile.
- **Direct write:** When `profile.directWriteMode` is true, session/body/cardio/sleep/cycle/custom-field writes go straight to profile from UI.

---

## 8. Responsive UI Summary

| Viewport | Behavior |
|----------|----------|
| **&lt; 640px** | Single column; `px-4`; smaller type; QuickLogBar no bottom safe area; Nexus button can hide below 380px; stacked tab bar and controls. |
| **640px (sm)** | `px-6`; slightly larger type and gaps; safe area on bar; more padding on cards. |
| **768px (md)** | `px-8`; tab panel bottom padding for bar; SingleAgentLayout treats as non-mobile (split/full). |
| **1024px (lg)** | Two-column Weekly Plan; 2–4 column metric grids where used. |
| **1280px (xl)** | Tab bar and module controls in one row. |

---

## 9. File Reference

| Area | Path |
|------|------|
| Page | `src/modules/titan/TitanPage.tsx` |
| Layout | `src/core/layout/SingleAgentLayout.tsx` |
| Tokens / globals | `src/index.css` |
| Types | `src/lib/types.ts` (TitanProfile, Routine, etc.) |
| Profile service | `src/modules/titan/services/titan-profile-service.ts` |
| Actions | `src/modules/titan/services/actions.ts` |
| Components | `src/modules/titan/components/*.tsx` |
| Core shared | `src/core/components/SectionHeader.tsx`, `PanelLabel.tsx`, `SurfaceCard.tsx`, `NeuralTabGroup.tsx`, `NeuralButton.tsx` |

---

*Document generated from the Titan module implementation. Keep in sync with code when changing layout or tokens.*
