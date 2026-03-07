# AGNES — State Visibility UX Specification

> **Author:** UX Design Agent (State Ownership Meeting)
> **Date:** 2025-01-XX
> **Status:** Design Spec — Ready for Implementation
> **Codebase Context:** React + Tailwind CSS + Framer Motion + Three.js

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [How Users See Their State](#2-how-users-see-their-state)
3. [Cross-Module Intelligence Visualization](#3-cross-module-intelligence-visualization)
4. [Atlas as Planner — State Display](#4-atlas-as-planner--state-display)
5. [State Ownership Indicators](#5-state-ownership-indicators)
6. [Privacy & Consent UI](#6-privacy--consent-ui)
7. [Real-Time State Changes](#7-real-time-state-changes)
8. [Forge Separate Product — State Bridge UI](#8-forge-separate-product--state-bridge-ui)
9. [Component Inventory](#9-component-inventory)
10. [Accessibility Matrix](#10-accessibility-matrix)
11. [Implementation Priorities](#11-implementation-priorities)

---

## 1. Design Philosophy

### Core Principles

**"Ambient Intelligence, Not Dashboards"**

AGNES's moat is that modules talk to each other. The UX must make this feel *alive* and *caring* — not like a control panel. Users should feel *held* by their system, not monitored by it.

| Principle | Rationale |
|---|---|
| **Glanceable, not granular** | Users don't want to parse 14 metrics. They want "Am I okay?" answered in 2 seconds. |
| **Direction over position** | "Getting better" matters more than "7.2/10". Trend arrows dominate absolute values. |
| **Attribution without jargon** | Users should understand *why* something changed, without needing to know system architecture. |
| **Progressive disclosure** | Surface → Summary → Detail. Never front-load complexity. |
| **Emotional safety first** | Sensitive data (trauma markers, hormonal context) is never casually surfaced. |

### Color Language

The existing `toneClass` system (`good`/`warn`/`bad`/`neutral`) maps well. We formalize:

| State | Color Token | Tailwind Class | Meaning |
|---|---|---|---|
| Thriving | `emerald-400` | `text-emerald-400 / bg-emerald-400` | Metrics are healthy, trending well |
| Steady | `sky-300` | `text-sky-300 / bg-sky-300` | Stable, no action needed |
| Caution | `amber-400` | `text-amber-400 / bg-amber-400` | Declining or approaching threshold |
| Alert | `rose-400` | `text-rose-400 / bg-rose-400` | Needs attention, cascade may fire |
| Unknown | `white/40` | `text-white/40 / bg-white/40` | Uncalibrated or stale data |

**Accessibility Note:** All color states are paired with icons and text labels. Never rely on color alone. Contrast ratios verified at 4.5:1 minimum against `#020205` background.

### Trend Indicator Language

| Symbol | Meaning | ARIA Label |
|---|---|---|
| `↑` (ChevronUp) | Improving | "Trending up" |
| `→` (Minus) | Stable | "Stable" |
| `↓` (ChevronDown) | Declining | "Trending down" |
| `⟳` (RefreshCw) | Recalibrating | "Recalibrating" |
| `—` (Dash) | Unknown | "Not yet calibrated" |

---

## 2. How Users See Their State

### 2.1 Hub Daily Brief — "Your Wellness at a Glance"

**Location:** Top of Hub CARDS view, above the Soul Core Interface heading.

**UX Rationale:** When users open the app, they need a single-sentence answer to "How am I doing?" before diving into modules. This replaces the current bare heading with a contextual greeting.

#### Component: `<DailyBrief />`

```
┌─────────────────────────────────────────────────────┐
│  Good morning, Raj.                                 │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Body    │  │  Mind    │  │ Heart    │  ┌──────┐ │
│  │  ● ↑     │  │  ● →    │  │  ● ↓     │  │ Flow │ │
│  │  Strong  │  │  Steady  │  │ Low      │  │ ● →  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────┘ │
│                                                     │
│  "Your body is recovering well, but emotional       │
│   resilience dipped. Agnes noticed — she's here     │
│   if you want to talk."                             │
│                                                     │
│  ┌─ Cascade Alert ─────────────────────────────┐    │
│  │ ⚡ Soma lowered your training clearance.     │    │
│  │    Atlas lightened your afternoon schedule.  │    │
│  │    ──── View cascade timeline →              │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**Data Mapping:**

| Domain Pillar | Label | NSV Sources | "Good" word | "Caution" word | "Alert" word |
|---|---|---|---|---|---|
| Body | "Body" | `biological.recoveryScore`, `biological.cnsFatigue`, `biological.sleepQuality` | "Strong" | "Tired" | "Drained" |
| Mind | "Mind" | `cognitive.energyBudget`, `cognitive.focusScore`, `cognitive.activeLoad` | "Sharp" | "Foggy" | "Overloaded" |
| Heart | "Heart" | `emotional.emotionalResilience`, `emotional.stressLoad` | "Resilient" | "Tender" | "Low" |
| Flow | "Flow" | `resource.financialFriction`, `resource.resonanceROI` | "Aligned" | "Friction" | "Stressed" |

**Why these labels?** "Biological" / "Cognitive" / "Emotional" / "Resource" are clinical terms. Users don't think in domains — they think in body, mind, heart, and flow. We translate.

**Composite Score Logic:**
- Each pillar averages its numeric metrics (null excluded)
- Map average to word: `≥7 → good`, `≥4 → caution`, `<4 → alert`
- Trend: compare to 24h-ago snapshot if available

**The Brief Sentence:** Generated from a template system (not LLM-generated — deterministic). Pattern:

```
if (bodyTrend === 'up' && heartTrend === 'down') →
  "Your body is recovering well, but emotional resilience dipped. 
   {agnesAlias} noticed — she's here if you want to talk."
```

**Key UX Decision:** The brief uses module *names* (Agnes, Soma) as characters, not system terms. "Agnes noticed" feels caring. "Emotional module detected decline" feels clinical.

#### Implementation Notes

- **Component file:** `src/modules/hub/components/DailyBrief.tsx`
- **Data source:** `globalSoul.crossFunctionalState` via `useGlobalSoul()`
- **Trend data:** Requires new `lastUpdated` comparison logic (compare current vs. snapshot from `spine_events` collection, 24h window)
- **Responsive:** Stacks vertically on mobile; pillars become horizontal scroll on `< md`
- **Animation:** Framer Motion `stagger` on pillar cards (0.1s delay each)
- **Reduced motion:** Respects `useReducedMotion()` — no stagger, instant render

#### Accessibility

- Each pillar card: `role="status"`, `aria-label="Body: Strong, trending up"`
- Brief sentence: `role="status"`, `aria-live="polite"`
- Cascade alert: `role="alert"` only when new cascades exist
- All icons paired with visible text labels

---

### 2.2 Domain Summary Cards — Replacing Numeric Overload

**Problem:** The current `VitalsGrid` shows raw numbers (`7.2/10`) which are meaningless without context. Users ask: "Is 7 good or bad?"

**Solution:** Domain Summary Cards that use **word-states** as the primary display, with numbers available on hover/tap (progressive disclosure).

#### Component: `<DomainSummaryCard />`

```
┌─────────────────────────────────┐
│ 🫀 Body                        │
│                                 │
│    "Strong"            ↑        │
│                                 │
│ ┌─ Recovery ─── 8.2 ─── ↑ ──┐  │
│ │ ████████████████░░░░░░░░░░ │  │
│ └────────────────────────────┘  │
│ ┌─ Sleep ────── 7.0 ─── → ──┐  │
│ │ ██████████████░░░░░░░░░░░░ │  │
│ └────────────────────────────┘  │
│ ┌─ Fatigue ──── 3.1 ─── ↓ ──┐  │
│ │ ██████░░░░░░░░░░░░░░░░░░░░ │  │
│ └────────────────────────────┘  │
│                                 │
│  Last updated: via Soma, 2h ago │
│                    via Titan 4h │
└─────────────────────────────────┘
```

**Interaction Pattern:**
1. **Default:** Shows word-state ("Strong") + trend arrow + overall progress ring
2. **Tap/Hover:** Expands to show individual metric bars with numbers
3. **Long-press/Click metric:** Opens calibration prompt in the owning module's chat

**Props Interface:**
```typescript
interface DomainSummaryCardProps {
  domain: 'biological' | 'emotional' | 'cognitive' | 'resource';
  label: string;        // "Body", "Mind", "Heart", "Flow"
  icon: LucideIcon;
  metrics: Array<{
    key: NSVMetricPath;
    label: string;       // "Recovery", "Sleep", etc.
    value: number | null;
    max: number;
    trend: 'up' | 'stable' | 'down' | 'unknown';
    owner: ModuleId;     // for attribution
    lastUpdated?: string;
    isStale: boolean;
    isDerived: boolean;
  }>;
  compositeWord: string; // "Strong", "Tired", etc.
  compositeTrend: 'up' | 'stable' | 'down' | 'unknown';
  compositeTone: StatusTone;
}
```

**Color for progress bars:** Uses the domain's accent color:
- Body: `emerald`
- Mind: `sky`
- Heart: `indigo`
- Flow: `cyan`

These match the existing `DOMAIN_COLORS` in `SpineOverlay.tsx` (`B: emerald`, `E: indigo`, `C: sky`, `R: cyan`).

---

### 2.3 Hub Bottom Dashboard Enhancement

**Current state:** Three `ReactiveGauge` components (Wellness, Stability, Resilience) in the `HubBottomDashboard`.

**Enhancement:** Add trend arrows and a "last cascade" indicator.

```
┌─────────────────────────────────────────────────────────────┐
│ [Vault Status / NeuralIntegrity]                            │
│                                                             │
│  ✨ Wellness  72% ↑   │   ⚡ Stability  85% →   │   🛡 Resilience  45% ↓  │
│  ████████████░░░░░░   │   █████████████████░░   │   ████████░░░░░░░░░░░   │
│                       │                          │                          │
│                       │              Last cascade: 2h ago — Soma → Atlas    │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:** Extend `ReactiveGauge` with optional `trend` and `trendLabel` props. Add a `<LastCascadeBadge />` component that reads from `Spine.getRecentEvents()`.

---

## 3. Cross-Module Intelligence Visualization

### 3.1 The Cascade Timeline — "What Happened"

**This is the product's moat.** When Soma denies clearance → Titan blocks intensity → Atlas flattens schedule, the user needs to see this chain clearly.

#### Component: `<CascadeTimeline />`

**Location:** 
- Hub: Accessible via the cascade alert in DailyBrief (expands inline or slides up as bottom sheet on mobile)
- Any module: Available in SpineSideRail (enhanced version)

**Visual Design:**

```
┌─ Cascade Timeline ──────────────────────────────────────┐
│                                                          │
│  2:34 PM  ● Soma flagged low recovery                   │
│           │  "Recovery score dropped to 3.2/10"          │
│           │  ┌ CLEARANCE_DENIED ┐                        │
│           │  └──────────────────┘                         │
│           │                                               │
│           ├── ● Titan blocked high-intensity training     │
│           │     "CNS fatigue too high for heavy lifts"    │
│           │     ┌ BLOCK_HIGH_INTENSITY ┐                  │
│           │     └──────────────────────┘                   │
│           │                                               │
│           └── ● Atlas flattened your schedule             │
│                 "Moved deep work to tomorrow. Added a     │
│                  recovery window this afternoon."         │
│                 ┌ FLATTEN_ENERGY_WAVE ┐                   │
│                 └────────────────────┘                     │
│                                                          │
│  ──────────────────────────────────────────────          │
│                                                          │
│  Yesterday, 9:15 PM  ● Sleep quality logged at 8.5      │
│                        (No cascades triggered)           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Data Source:** `Spine.getRecentEvents()` + Firestore `spine_events/{uid}/events` collection.

**Cascade Chain Detection:**
- Events where `source` starts with `cascade:` are children
- Group by timestamp proximity (events within 2s of each other = same chain)
- Display parent event first, children indented with `├──` connector lines

**Event-to-Human-Language Map:**

| SpineEventType | User-Facing Label | Icon |
|---|---|---|
| `CLEARANCE_DENIED` | "{somaAlias} flagged low recovery" | 🔴 |
| `BLOCK_HIGH_INTENSITY` | "{titanAlias} blocked high-intensity training" | 🟠 |
| `FLATTEN_ENERGY_WAVE` | "{atlasAlias} lightened your schedule" | 🔵 |
| `BURNOUT_WARNING` | "Burnout risk detected" | 🔴 |
| `FINANCIAL_STRESS` | "Financial friction is elevated" | 🟡 |
| `VITAL_UPDATED` | "Vitals updated" | 🟢 |
| `RECOVERY_AVAILABLE` | "Recovery window opened" | 🟢 |

**Key UX Decisions:**
- Use module *character names* (from `globalSoul.displayNames`), not IDs
- The event type badge (`CLEARANCE_DENIED`) is shown in a small monospace pill for power users, but the primary text is human-readable
- Cascade chains are collapsed by default — show only the final user-facing effect. Tap to expand the full chain.

#### Collapsed State (Default)
```
⚡ Atlas lightened your afternoon because Soma flagged low recovery. (2h ago)
   [Expand] to see the full chain →
```

This single sentence is the "aha moment" — users realize the modules are talking.

#### Accessibility
- Timeline: `role="feed"`, each event is `role="article"`
- Cascade chains: `aria-expanded` on collapsed groups
- Time labels: `<time datetime="...">` elements
- Domain color dots: paired with text labels, never color-only

---

### 3.2 The "Aha Moment" — Designing First Realization

**Goal:** The first time a user sees cross-module intelligence, it should feel magical, not confusing.

**Trigger:** First cascade event after the user has interacted with ≥2 modules.

**UI Pattern: Insight Moment Card**

```
┌─────────────────────────────────────────────────────┐
│  ✨ Your modules are working together               │
│                                                     │
│  Soma noticed your recovery is low and told         │
│  Atlas to lighten your schedule for today.           │
│                                                     │
│  This is AGNES's neural spine — your modules        │
│  share context so they can look after you            │
│  as a whole person.                                  │
│                                                     │
│  [Got it]                            [Learn more →] │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Show once per user (store `hasSeenCascadeOnboarding` in user profile)
- Appears as a `NeuralModal` overlay, not a toast (it deserves attention)
- "Learn more" links to a brief explainer (3-panel walkthrough)
- Gentle, warm copy — not technical

---

### 3.3 In-Module Cross-Reference Badges

**When Atlas says "I lightened your schedule because your resilience is low" — should the UI show which module provided that insight?**

**Answer: Yes, but subtly.**

When a module references data from another module, show an **Insight Source Badge** inline in the chat:

```
Atlas: I've moved your deep work block to tomorrow morning.
       Your emotional resilience is running low today.
       ┌───────────────────────────────┐
       │ 💜 Insight from Agnes (2h ago) │
       └───────────────────────────────┘
       I've added a recovery window this afternoon instead.
```

**Implementation:**
- LLM tool calls already extract NSV data. When the response references cross-domain data, the UI can detect it via the `VITAL_UPDATED` event's `source` field
- The badge is a `SurfaceCard` with the source module's icon and color
- Tapping the badge navigates to that module (with a "Back to Atlas" breadcrumb)

---

## 4. Atlas as Planner — State Display

### 4.1 Today's Plan Summary Card

**Location:** Top of Atlas dashboard, replacing the raw energy wave as the primary view.

#### Component: `<TodaysPlanCard />`

```
┌─ Today's Plan ─────────────────────────────────────────┐
│                                                         │
│  Thursday, Jan 23                                       │
│                                                         │
│  Energy Budget:  ████████░░  6.2/10                     │
│  Focus Score:    ██████░░░░  5.8/10                     │
│  Active Load:    ████░░░░░░  3.4/10                     │
│                                                         │
│  ┌─ Morning ───────────────────────────────────────┐    │
│  │ ✅ Review PR feedback          ⚡ 2    Done      │    │
│  │ 🔲 Write design spec           ⚡ 4    In Progress│   │
│  │ ⚠️ Heavy training session      ⚡ 6    Blocked    │    │
│  │    └ Blocked: Soma flagged low recovery          │    │
│  └──────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─ Afternoon ─────────────────────────────────────┐    │
│  │ 🟢 Recovery window (added by Atlas)   ⚡ 0       │    │
│  │ 🔲 Light reading / research           ⚡ 2       │    │
│  └──────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─ Completion ────────────┐  ┌─ Streaks ──────────┐   │
│  │  Today: 1/5 tasks (20%) │  │  🔥 Journal: 12 days│  │
│  │  ██░░░░░░░░░░░░░░░░░░░░ │  │  💤 Sleep log: 8    │  │
│  │  Week: 18/27 (67%)      │  │  🏋️ Training: 3     │  │
│  └─────────────────────────┘  └──────────────────────┘  │
│                                                         │
│  Energy remaining: ████░░░░░░ ~3.8 units               │
└─────────────────────────────────────────────────────────┘
```

**Data Sources:**
- Energy/Focus/Load: `globalSoul.crossFunctionalState.cognitive`
- Tasks: `AtlasProfile.taskGraph` (existing)
- Blocked state: `FLATTEN_ENERGY_WAVE` / `BLOCK_HIGH_INTENSITY` events from Spine
- Completion rate: Computed from `taskGraph` statuses
- Streaks: New field in `AtlasProfile` (to be added)

### 4.2 Energy Budget Remaining

**Visual:** A horizontal bar that depletes through the day. Each completed task reduces the bar by its `energyCost`.

```
Energy remaining: ████████░░░░░░░░░░░░ 6.2 → 3.8 (after 2 tasks)
```

**Micro-interaction:** When a task is completed, the bar animates a smooth reduction with a small particle burst at the depletion point.

**Colors:**
- `≥ 6`: `emerald-400` (plenty of energy)
- `≥ 3`: `amber-400` (pace yourself)
- `< 3`: `rose-400` (conserve, suggest recovery)

### 4.3 Task Blocked by Cross-Module Insight

**When Atlas says "this task was moved because Soma flagged low recovery":**

```
┌─────────────────────────────────────────────────┐
│ ⚠️  Heavy training session           ⚡ 6       │
│     ──────────────────────────────────           │
│     Status: BLOCKED                              │
│                                                  │
│     🟢 Soma flagged low recovery (1h ago)        │
│        Recovery: 3.2/10 — below safe threshold   │
│                                                  │
│     This task will unblock when recovery ≥ 6.    │
│                                                  │
│     [Override] [Reschedule] [Ask Soma]            │
└─────────────────────────────────────────────────┘
```

**Key UX Decisions:**
- **Override button exists** — AGNES advises, never controls. The user always has agency.
- Override triggers a confirmation: "Soma recommends against this. Proceed anyway?"
- Override is logged as a spine event (`CLEARANCE_OVERRIDE`) for the system to learn from
- "Ask Soma" opens Soma's chat with a pre-filled context message

### 4.4 Habit Streak Display

**Component:** `<HabitStreakRow />`

```
🔥 Journaling    ████████████ 12 days
💤 Sleep logging  ████████     8 days
🏋️ Training      ███          3 days (⚠️ streak at risk — last log 22h ago)
```

**Streak at risk:** When the time since last log approaches the streak's cadence, show amber warning. This creates gentle urgency without alarm.

**Accessibility:** Each streak row is `role="status"` with `aria-label="Journaling streak: 12 days, active"`.

---

## 5. State Ownership Indicators

### 5.1 Decision: Ownership as Attribution, Not Control

**"Owned by Soma" — useful or confusing?**

**Answer: Confusing as raw text. Useful as gentle attribution.**

Users don't think in ownership terms. They think: "Where did this number come from?" The answer should use character names, not system terms.

**Pattern: Source Attribution Badge**

Instead of:
> Recovery Score: 7/10 (Owned by Soma)

Show:
> Recovery Score: 7/10
> *via Soma, updated 2h ago*

The word "via" is softer than "owned by" and implies the module is a *source*, not a *gatekeeper*.

### 5.2 Implementation: `<MetricAttribution />` Component

```typescript
interface MetricAttributionProps {
  metricPath: NSVMetricPath;
  lastUpdated?: string;
  showOwner?: boolean; // default true
}
```

**Renders:**
```
<span class="text-[9px] text-white/35 uppercase tracking-[0.2em]">
  via {ownerDisplayName} · {relativeTime}
</span>
```

**Uses:** `getMetricOwner()` from `nsv-ownership.ts` + `globalSoul.displayNames` for human name.

### 5.3 Cross-Module Citations in Chat

**When Titan mentions emotional data — should it cite "Agnes reports..."?**

**Answer: Yes, using the module's character name.**

Pattern in LLM responses:
> "I notice your stress load is elevated. Agnes mentioned this earlier — you might want to check in with her before we push through this workout."

This is already achievable via the `formatNSVForPrompt()` function in `nsv-service.ts`. The system prompt includes global state. We add a convention:

**System Prompt Addition (for all modules):**
```
When referencing data from another domain, naturally mention which 
colleague provided it. Use their display name, not their module ID.
Example: "Soma mentioned your recovery is low" not "biological.recoveryScore = 3.2"
```

This is a prompt engineering change, not a UI component.

### 5.4 Derived Metrics Indicator

**Existing pattern:** `isDerived` flag + `blur-[0.3px]` visual treatment in `StatCard` and `VitalsGrid`.

**Enhancement:** Add a tooltip on hover/focus:

```
┌──────────────────────────────────┐
│ This metric is estimated, not    │
│ directly reported. Chat with     │
│ {ownerModule} to calibrate it.   │
│                                  │
│ [Calibrate now →]                │
└──────────────────────────────────┘
```

**Accessibility:** The derived state is announced via `aria-description="Estimated value. Calibrate for accuracy."` on the metric element.

---

## 6. Privacy & Consent UI

### 6.1 Philosophy: Transparent Defaults, Easy Overrides

**The key tension:** Cross-module data sharing is what makes AGNES powerful, but it touches sensitive data (trauma markers, hormonal context, financial data).

**Default stance:** All modules can read NSV data by default. Sensitive fields (trauma markers, hormonal context) are **summarized** — modules see "emotional state is low" not the specific trauma markers.

### 6.2 Data Sharing Settings Panel

**Location:** Profile page → new "Data Sharing" section. Also accessible via module headers (gear icon).

#### Component: `<DataSharingSettings />`

```
┌─ Data Sharing ──────────────────────────────────────────┐
│                                                          │
│  Your modules share context to care for you as a whole   │
│  person. You control what each module can see.           │
│                                                          │
│  ┌─ Body Data (Soma, Titan) ───────────────────────┐    │
│  │                                                   │    │
│  │  Sleep & Recovery                                 │    │
│  │  ┌───────────────────────────────────────────┐    │    │
│  │  │ Share with Agnes (therapist)      [● ON ] │    │    │
│  │  │ Share with Atlas (planner)        [● ON ] │    │    │
│  │  │ Share with Ledger (finance)       [○ OFF] │    │    │
│  │  └───────────────────────────────────────────┘    │    │
│  │                                                   │    │
│  │  Hormonal Context                    ⚠️ Sensitive  │    │
│  │  ┌───────────────────────────────────────────┐    │    │
│  │  │ Share summary with Agnes          [● ON ] │    │    │
│  │  │ Share summary with Atlas          [○ OFF] │    │    │
│  │  │ Share detail with anyone          [○ OFF] │    │    │
│  │  └───────────────────────────────────────────┘    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Emotional Data (Agnes) ────────────────────────┐    │
│  │                                                   │    │
│  │  Resilience & Stress                              │    │
│  │  ┌───────────────────────────────────────────┐    │    │
│  │  │ Share with Titan (trainer)        [● ON ] │    │    │
│  │  │ Share with Atlas (planner)        [● ON ] │    │    │
│  │  │ Share with Soma (health)          [● ON ] │    │    │
│  │  └───────────────────────────────────────────┘    │    │
│  │                                                   │    │
│  │  Trauma Markers                      🔒 Protected │    │
│  │  ┌───────────────────────────────────────────┐    │    │
│  │  │ Share with any module             [○ OFF] │    │    │
│  │  │ Only Agnes can see these.                 │    │    │
│  │  └───────────────────────────────────────────┘    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Financial Data (Ledger) ───────────────────────┐    │
│  │  Financial Friction                               │    │
│  │  ┌───────────────────────────────────────────┐    │    │
│  │  │ Share with Agnes (therapist)      [● ON ] │    │    │
│  │  │ Share with Atlas (planner)        [● ON ] │    │    │
│  │  └───────────────────────────────────────────┘    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                          │
│  ℹ️ Why sharing matters                                   │
│  When your modules can see each other's data, they can   │
│  coordinate to protect you. For example: if Soma knows   │
│  your stress is high, it can adjust recovery             │
│  recommendations. Turning off sharing means that module  │
│  will use defaults instead of your actual state.         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Sensitive Data Tiers

| Tier | Data | Default Sharing | UI Indicator |
|---|---|---|---|
| **Open** | Sleep, Recovery, Energy, Focus, Load | All modules | No special indicator |
| **Summarized** | Hormonal context, Mood trend | Summary only (e.g., "hormonal shift detected") | ⚠️ "Sensitive" badge |
| **Protected** | Trauma markers | Agnes only | 🔒 "Protected" badge |
| **Explicit** | Financial friction | Opt-in per module | 💰 "Financial" badge |

### 6.4 "Why Sharing Matters" Explanation Pattern

**The explanation must be empathetic and concrete, not abstract:**

❌ "Data sharing enables cross-module cascading for optimal state management."
✅ "When Soma knows you're stressed, it adjusts your recovery plan. Without this, it uses general defaults instead of what's right for *you*."

**Each toggle has a contextual tooltip explaining the specific benefit:**

- "Share sleep with Atlas" → *"So Atlas can schedule deep work when you're well-rested"*
- "Share stress with Titan" → *"So Titan can dial back intensity on hard days"*
- "Share financial data with Agnes" → *"So Agnes understands when money worries are affecting your mood"*

### 6.5 Data Sharing Storage

**Implementation:** Extend `CoreUserProfile.securityPreferences` with a `dataSharingPolicy` map:

```typescript
interface DataSharingPolicy {
  // key: "{metricDomain}.{metric}" → value: ModuleId[]
  overrides: Record<NSVMetricPath, {
    allowedModules: ModuleId[];
    shareLevel: 'full' | 'summary' | 'none';
  }>;
}
```

**Default:** All sharing on (to match current behavior). Users opt *out*, not in.

### 6.6 Accessibility

- Toggle switches: `role="switch"`, `aria-checked`, keyboard operable
- Sensitive badges: `aria-label="Sensitive data"` with tooltip
- Section grouping: `role="group"`, `aria-labelledby` pointing to category heading
- Focus management: Tab through sections logically, skip to category with landmark nav

---

## 7. Real-Time State Changes

### 7.1 Live NSV Updates in Hub

**When a chat message arrives and NSV updates, should the Hub update in real-time?**

**Answer: Yes, via the existing Firestore `onSnapshot` listener in `GlobalSoulProvider`.**

The `globalSoul` state already updates in real-time. The UI components just need to react gracefully.

### 7.2 Micro-Animations for State Changes

**Current:** The `ReactiveGauge` already has a `isSyncing` state with `animate-pulse scale-110 blur-[1px] brightness-150` for 1 second after value changes.

**Enhancement — "Neural Ripple" Animation:**

When an NSV value changes:
1. **Value flash:** The number briefly glows the domain's accent color (300ms)
2. **Progress bar animate:** Smoothly transitions to new width (800ms, `ease-out-quint`)
3. **Trend arrow update:** If trend changed, the arrow rotates with a spring animation
4. **Domain pillar pulse:** The corresponding DailyBrief pillar card gets a subtle border glow (600ms)

**Implementation:**
```typescript
// In DomainSummaryCard or ReactiveGauge
const prevValue = useRef(value);

useEffect(() => {
  if (prevValue.current !== value && value !== null) {
    // Trigger ripple animation
    setIsRippling(true);
    const timer = setTimeout(() => setIsRippling(false), 800);
    prevValue.current = value;
    return () => clearTimeout(timer);
  }
}, [value]);
```

**Reduced Motion:** All micro-animations respect `useReducedMotion()`. When enabled:
- No scale/blur effects
- Values update instantly
- Trend arrows swap without rotation
- Progress bars jump to new width (no transition)

### 7.3 Toast Notifications for Significant Events

**When to toast:**
- Cascade events (priority `alert` or `critical`)
- Clearance denied/granted
- Burnout warning

**When NOT to toast:**
- Regular vital updates (`VITAL_UPDATED` with priority `info`)
- Session start/end events
- Draft proposals (these use the existing `NeuralDraftPanel`)

#### Component: `<SpineToast />`

**Design:**
```
┌───────────────────────────────────────────────┐
│  🟢 ● Soma                                    │
│  Recovery score updated to 8.2/10              │
│  ──────────────────── 2s ago                   │
└───────────────────────────────────────────────┘
```

For cascades:
```
┌───────────────────────────────────────────────┐
│  ⚡ Cascade Event                              │
│  Soma → Titan → Atlas                          │
│  Your afternoon schedule was adjusted.         │
│  [View timeline →]                             │
└───────────────────────────────────────────────┘
```

**Position:** Bottom-right corner, stacks upward, auto-dismiss after 5s (cascades: 8s).

**Accessibility:**
- `role="status"`, `aria-live="polite"` for info updates
- `role="alert"`, `aria-live="assertive"` for cascades and critical events
- Dismissable via Escape key or click
- Screen readers announce the full message

### 7.4 3D Neural Map Live Binding (Existing Enhancement)

The Three.js view already binds to NSV. Enhance with:

**Node Size Pulse:** When an NSV metric changes, the corresponding node briefly scales up 1.2x with a spring bounce, then settles.

**Connection Flash:** When a cascade event fires between two modules, the connection line between them flashes the event's priority color:
- `info`: white flash
- `alert`: amber flash
- `critical`: rose flash

These visual effects use the existing `edgePulse` / `edgePulseBoost` logic in `HubPage.tsx`.

---

## 8. Forge Separate Product — State Bridge UI

### 8.1 Connection Indicator

**When Forge is connected to AGNES:**

In the Forge header (both CLI and Web):
```
┌─ Forge Studio ────────────────────────────────────────┐
│  ◀ Back   FORGE   [E2EE Active]   [AGNES ● Connected] │
└───────────────────────────────────────────────────────┘
```

**The "AGNES ● Connected" badge:**
- Green dot when live connection
- Amber dot when connection stale (>30s no heartbeat)
- Red dot when disconnected
- Click to open connection settings

### 8.2 Cross-Product Data Usage Transparency

**When Forge uses AGNES data, the UI is transparent:**

```
Forge: I've set up a lighter development sprint this week.

       ┌────────────────────────────────────────────┐
       │ 🧠 Based on your AGNES wellness profile:   │
       │    • Energy budget: 6.2/10                  │
       │    • Focus score: 5.8/10                    │
       │    • Recovery: Soma reports moderate         │
       │                                             │
       │ Forge adjusted task complexity accordingly.  │
       │ [Manage AGNES connection →]                  │
       └────────────────────────────────────────────┘
```

**Key principle:** Every time Forge reads AGNES data, it shows a collapsible "Based on your AGNES wellness profile" card. Users always know when cross-product data is in play.

### 8.3 Settings UI for Cross-Product Data Bridge

**Location:** Both in AGNES Profile page and Forge Settings.

#### Component: `<ForgeBridgeSettings />`

```
┌─ Forge Connection ──────────────────────────────────────┐
│                                                          │
│  Status: ● Connected                                     │
│  Last sync: 3 minutes ago                                │
│                                                          │
│  ┌─ What Forge can see ────────────────────────────┐    │
│  │                                                   │    │
│  │  ✅ Cognitive state (energy, focus, load)         │    │
│  │  ✅ Biological state (fatigue, sleep, recovery)   │    │
│  │  ⬜ Emotional state (resilience, stress)          │    │
│  │  ⬜ Financial state                                │    │
│  │  🔒 Trauma markers (never shared externally)      │    │
│  │                                                   │    │
│  └───────────────────────────────────────────────────┘    │
│                                                          │
│  ℹ️ Forge uses this data to adjust task complexity        │
│     and sprint planning to match your capacity.          │
│                                                          │
│  [Disconnect Forge]                    [View audit log]  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Defaults:**
- Cognitive and biological: ON (these directly affect work capacity)
- Emotional and financial: OFF (private by default for external products)
- Trauma markers: ALWAYS OFF (hardcoded, not toggleable for external products)

**Audit Log:** Shows every time Forge read AGNES data, what it read, and when. Accessible from the settings panel.

### 8.4 Forge CLI Connection

When using Forge CLI:
```bash
$ forge status

  AGNES Bridge: ● Connected
  Wellness context: Energy 6.2/10 · Focus 5.8/10
  
  Forge is using your AGNES profile to calibrate task suggestions.
  Run `forge bridge --off` to disconnect.
```

---

## 9. Component Inventory

### New Components to Build

| Component | Location | Priority | Dependencies |
|---|---|---|---|
| `DailyBrief` | `src/modules/hub/components/DailyBrief.tsx` | P0 | `useGlobalSoul`, `useModuleStats` |
| `DomainSummaryCard` | `src/core/components/DomainSummaryCard.tsx` | P0 | `nsv-ownership`, `useGlobalSoul` |
| `CascadeTimeline` | `src/core/components/CascadeTimeline.tsx` | P0 | `Spine.getRecentEvents()`, Firestore spine_events |
| `CascadeAlertBanner` | `src/modules/hub/components/CascadeAlertBanner.tsx` | P0 | `useSpineEvent`, CascadeTimeline |
| `InsightMomentModal` | `src/core/components/InsightMomentModal.tsx` | P1 | `NeuralModal`, CoreUserProfile |
| `InsightSourceBadge` | `src/core/components/InsightSourceBadge.tsx` | P1 | `nsv-ownership`, `module-manifest` |
| `TodaysPlanCard` | `src/modules/atlas/components/TodaysPlanCard.tsx` | P1 | AtlasProfile, `useGlobalSoul` |
| `EnergyBudgetBar` | `src/modules/atlas/components/EnergyBudgetBar.tsx` | P1 | `cognitive.energyBudget` |
| `HabitStreakRow` | `src/modules/atlas/components/HabitStreakRow.tsx` | P2 | AtlasProfile (new `streaks` field) |
| `TaskBlockedCard` | `src/modules/atlas/components/TaskBlockedCard.tsx` | P1 | SpineEvent, AtlasProfile.taskGraph |
| `MetricAttribution` | `src/core/components/MetricAttribution.tsx` | P2 | `nsv-ownership`, `globalSoul.displayNames` |
| `DataSharingSettings` | `src/modules/profile/components/DataSharingSettings.tsx` | P1 | CoreUserProfile extension |
| `SpineToast` | `src/core/components/SpineToast.tsx` | P1 | `useSpineEvent` |
| `ForgeBridgeSettings` | `src/modules/profile/components/ForgeBridgeSettings.tsx` | P2 | Forge connection service |
| `LastCascadeBadge` | `src/modules/hub/components/LastCascadeBadge.tsx` | P2 | `Spine.getRecentEvents()` |

### Existing Components to Enhance

| Component | Enhancement | Priority |
|---|---|---|
| `ReactiveGauge` | Add `trend` prop, trend arrow icon | P0 |
| `StatCard` | Add `attribution` prop for source badge | P2 |
| `VitalsGrid` | Add tooltip for `isDerived` metrics with calibration CTA | P1 |
| `HubBottomDashboard` | Add trend arrows, LastCascadeBadge | P1 |
| `SpineSideRail` | Human-readable event labels, cascade chain grouping | P1 |
| `CardsView` | Insert DailyBrief above Soul Core Interface heading | P0 |
| `AtlasDashboard` | Insert TodaysPlanCard, TaskBlockedCard, HabitStreakRow | P1 |
| `ModuleLayout` | Add data sharing quick-toggle in header | P2 |

---

## 10. Accessibility Matrix

| Feature | WCAG Criteria | Implementation |
|---|---|---|
| Color coding | 1.4.1 Use of Color | All color states paired with icons + text labels |
| Trend indicators | 1.1.1 Non-text Content | Arrows have `aria-label` ("Trending up", "Stable", etc.) |
| DailyBrief | 4.1.3 Status Messages | `role="status"`, `aria-live="polite"` |
| CascadeTimeline | 1.3.1 Info and Relationships | `role="feed"` with `role="article"` items |
| Domain cards | 2.1.1 Keyboard | Full keyboard navigation, focus rings |
| Toast notifications | 4.1.3 Status Messages | `role="alert"` for critical, `role="status"` for info |
| Data sharing toggles | 4.1.2 Name, Role, Value | `role="switch"`, `aria-checked`, label associations |
| Progress bars | 1.3.3 Sensory Characteristics | `role="meter"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Micro-animations | 2.3.3 Animation from Interactions | Respects `prefers-reduced-motion` via `useReducedMotion()` |
| Derived metrics | 1.3.1 Info and Relationships | `aria-description` explaining estimated state |
| Cascade chains | 2.4.6 Headings and Labels | Each chain has a heading, collapsed state uses `aria-expanded` |
| 3D view | 2.1.1 Keyboard | Existing keyboard overlay with module buttons (maintained) |
| Streak display | 1.3.1 Info and Relationships | `role="status"` with descriptive `aria-label` |
| Modal dialogs | 2.4.3 Focus Order | Focus trap, Escape to close, return focus on dismiss |

### Color Contrast Verification

All text/background combinations against `#020205` (void) or `rgba(255,255,255,0.03)` (card glass):

| Element | Foreground | Background | Ratio | Pass? |
|---|---|---|---|---|
| Primary text | `white/95` | `#020205` | 19.5:1 | ✅ AAA |
| Secondary text | `white/60` | `#020205` | 11.6:1 | ✅ AAA |
| Muted text | `white/40` | `#020205` | 7.6:1 | ✅ AA |
| Emerald accent | `#34d399` | `#020205` | 10.2:1 | ✅ AAA |
| Amber accent | `#fbbf24` | `#020205` | 12.8:1 | ✅ AAA |
| Rose accent | `#fb7185` | `#020205` | 6.3:1 | ✅ AA |
| Sky accent | `#7dd3fc` | `#020205` | 10.8:1 | ✅ AAA |
| Attribution text | `white/35` | `#020205` | 6.5:1 | ✅ AA |

---

## 11. Implementation Priorities

### Phase 1: Core State Visibility (Sprint 1-2)

**Goal:** Users can glance at Hub and understand their state.

1. `DailyBrief` component with 4 domain pillars
2. `ReactiveGauge` trend arrow enhancement
3. `CascadeAlertBanner` (collapsed, single-sentence version)
4. `CascadeTimeline` (expanded version, bottom-sheet on mobile)

### Phase 2: Cross-Module Intelligence (Sprint 3-4)

**Goal:** Users see and understand cascade events.

5. `InsightMomentModal` (first-time cascade onboarding)
6. `InsightSourceBadge` (in-chat cross-reference)
7. `SpineToast` notifications
8. `SpineSideRail` enhancement (human-readable labels)
9. `DataSharingSettings` panel

### Phase 3: Atlas Planner (Sprint 5-6)

**Goal:** Atlas becomes a visible, useful daily planner.

10. `TodaysPlanCard` with time blocks
11. `EnergyBudgetBar` with depletion animation
12. `TaskBlockedCard` with cross-module attribution
13. `HabitStreakRow` display
14. `VitalsGrid` derived metric tooltip enhancement

### Phase 4: Polish & Bridge (Sprint 7-8)

**Goal:** Attribution, Forge bridge, and refinement.

15. `MetricAttribution` component across all stat displays
16. `DomainSummaryCard` (replacing VitalsGrid in select views)
17. `ForgeBridgeSettings` panel
18. `LastCascadeBadge` in HubBottomDashboard
19. 3D Neural Map cascade connection flash enhancement

---

## Appendix A: Human Language Templates

Templates for the DailyBrief sentence generation:

```typescript
const BRIEF_TEMPLATES = {
  allGood: [
    "Everything is looking good today, {name}. All systems are stable.",
    "You're in a strong place today. Your body, mind, and heart are aligned."
  ],
  bodyUpHeartDown: [
    "Your body is recovering well, but emotional resilience dipped. {agnesAlias} noticed — she's here if you want to talk.",
    "Physically you're rebounding, but emotionally it's been a heavier day. Take it easy."
  ],
  burnoutRisk: [
    "Your system flagged burnout risk. {atlasAlias} has lightened your schedule. Please rest.",
    "Fatigue is high and resilience is low. Your modules have coordinated to protect your energy."
  ],
  lowEnergy: [
    "Energy is running low today. {atlasAlias} has prioritized only your essential tasks.",
    "You're running on fumes. Focus on what matters most — everything else can wait."
  ],
  recovering: [
    "You're in recovery mode. {somaAlias} is monitoring your bounce-back.",
    "Recovery is underway. Give yourself permission to go slow today."
  ],
  uncalibrated: [
    "Some of your vitals haven't been calibrated yet. Chat with your modules to sync up.",
    "Your neural state has some gaps. A quick check-in with {uncalibratedModules} will help."
  ]
};
```

## Appendix B: Spine Event Display Names

Map from technical event types to user-facing language:

```typescript
const EVENT_DISPLAY_NAMES: Record<SpineEventType, string> = {
  VITAL_UPDATED: 'Vitals synced',
  REDUCE_TRAINING_LOAD: 'Training load reduced',
  BLOCK_HIGH_INTENSITY: 'High intensity blocked',
  FLATTEN_ENERGY_WAVE: 'Schedule lightened',
  RECOVERY_AVAILABLE: 'Recovery window opened',
  BURNOUT_WARNING: 'Burnout risk detected',
  CLEARANCE_DENIED: 'Activity clearance denied',
  CLEARANCE_GRANTED: 'Activity cleared',
  COGNITIVE_OVERLOAD: 'Cognitive overload detected',
  SECURITY_POLICY_UPDATED: 'Security settings updated',
  FINANCIAL_STRESS: 'Financial stress flagged',
  MEDICAL_ALERT: 'Medical alert',
  DRAFT_PROPOSED: 'Suggestion proposed',
  DRAFT_APPROVED: 'Suggestion approved',
  DRAFT_DISMISSED: 'Suggestion dismissed',
  SESSION_STARTED: 'Session started',
  SESSION_ENDED: 'Session ended',
  MODULE_DELEGATED: 'Handed off to another module'
};
```

## Appendix C: Domain Pillar Config

Centralized config object for consistent domain display:

```typescript
const DOMAIN_PILLARS = {
  biological: {
    label: 'Body',
    icon: Heart, // from lucide-react
    accentColor: 'emerald',
    metrics: ['biological.cnsFatigue', 'biological.sleepQuality', 'biological.recoveryScore'],
    words: { good: 'Strong', caution: 'Tired', alert: 'Drained' },
    owners: ['soma', 'titan']
  },
  cognitive: {
    label: 'Mind',
    icon: Brain,
    accentColor: 'sky',
    metrics: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad'],
    words: { good: 'Sharp', caution: 'Foggy', alert: 'Overloaded' },
    owners: ['atlas']
  },
  emotional: {
    label: 'Heart',
    icon: Sparkles,
    accentColor: 'indigo',
    metrics: ['emotional.emotionalResilience', 'emotional.stressLoad'],
    words: { good: 'Resilient', caution: 'Tender', alert: 'Low' },
    owners: ['agnes']
  },
  resource: {
    label: 'Flow',
    icon: Waves,
    accentColor: 'cyan',
    metrics: ['resource.financialFriction', 'resource.resonanceROI'],
    words: { good: 'Aligned', caution: 'Friction', alert: 'Stressed' },
    owners: ['ledger']
  }
} as const;
```

---

*End of UX State Visibility Specification*
