# AGNES Product Definition Meeting — Position Papers

> **Author:** Technical Product Manager (Orchestrator Nexus)
> **Meeting:** M1 — Product Definition
> **Date:** 2025-07-14
> **Status:** POSITION PAPER — Requires Founder Review

---

## Table of Contents

1. [Topic 1: Atlas as a Proper Planner](#topic-1-atlas-as-a-proper-planner)
2. [Topic 2: Forge as a Separate Product](#topic-2-forge-as-a-separate-product)
3. [Topic 3: Pulse Removal & Concept Absorption](#topic-3-pulse-removal--concept-absorption)

---

# Topic 1: Atlas as a Proper Planner

## Executive Summary

**The founder is right, and the engineering already agrees.** The Atlas persona (`src/modules/atlas/personas.ts`) is a 183-line life planner spec that goes dramatically beyond "cognitive energy budgeting." It already defines task graphs, habit tracking with streaks, goal architecture with milestones, daily planning with energy waves, weekly reviews, scheduling conflict resolution, and an Eisenhower matrix filtered through biological reality. The product definition document still calls Atlas a "Cognitive Energy Architect" — that label is now 3 iterations behind the actual spec.

The question isn't *should Atlas become a planner*. It already is one on paper. The question is: **what scope boundaries keep Atlas from becoming Notion, and what makes it worth using instead?**

## The Differentiator: Why Atlas and Not Notion

This is the single most important question, and the answer is AGNES's moat:

> **Notion doesn't know you're exhausted. Todoist doesn't know you had a panic attack. Google Calendar doesn't know your CNS fatigue is at 8 and your financial stress is spiking. Atlas does.**

Atlas is the only planner on Earth that reads a live Neural State Vector before touching the schedule. Every planning decision runs through this filter:

| Signal Source | What Atlas Reads | How It Affects Planning |
|---------------|-----------------|------------------------|
| **Agnes** (Emotional) | emotionalResilience, stressLoad, moodTrend | Resilience < 4 → reduce cognitive load, prioritize quick wins. Mood declining → shorten planning horizon. |
| **Titan** (Physical) | cnsFatigue, sleepQuality | CNS fatigue > 7 → block all high-intensity cognitive tasks. Sleep < 4 → reduce energy budget by 2 points. |
| **Soma** (Biological) | recoveryScore, hormonalContext | Recovery < 5 → protect afternoon rest. Luteal phase → prefer admin/creative, avoid launches. |
| **Ledger** (Financial) | financialFriction | Friction > 6 → elevate income-critical tasks. Friction > 8 → emergency posture, reprioritize to revenue. |
| **Cascade System** | FLATTEN_ENERGY_WAVE | Burnout warning → auto-flatten schedule, defer high-cost tasks. |

**This is not a feature Notion can bolt on.** It requires the entire AGNES ecosystem — the multi-agent architecture, the Spine Event Bus, the cascade rules, the Global Soul. A traditional planner is a static container. Atlas is a *reactive planning system* that reshapes itself in real-time based on who you actually are today.

### The One-Liner Differentiator

> *"Atlas doesn't just ask what you need to do. It knows what you're capable of doing — right now, today, given everything your body and mind are telling it."*

## Product Spec: Atlas-as-Planner

### Identity

- **Name:** Atlas
- **Tagline:** "Your life planner that reads your body and mind before it touches your schedule."
- **Domain:** Cognitive (C) — planning, scheduling, task management, habit tracking, goal architecture
- **Position in AGNES:** Tier 2 Extension — optional, unlockable from Hub

### Core Capabilities (Scoped MVP)

#### Capability 1: Task Management (Energy-Aware)
Every task carries an `energyCost` (0-10). Atlas schedules tasks by matching energy cost to available energy budget, which is dynamically adjusted by NSV signals.

- **Data model:** `{ id, title, deadline, priority(1-5), energyCost(0-10), status, dependencies[], projectId?, notes }`
- **Status lifecycle:** `captured → queued → active → completed | deferred | blocked`
- **Dependency tracking:** Tasks can depend on other tasks. Blocked tasks don't count against activeLoad. Completing a task surfaces what it unblocks.
- **Overload protection:** If total scheduled energyCost > energyBudget × 0.8, Atlas warns and suggests load reduction.

#### Capability 2: Habit Tracking (Streak-Aware)
- **Data model:** `{ id, title, frequency, targetStreak, currentStreak, lastCompleted, energyCost, minimumViableVersion }`
- **Streak protection:** High-streak habits (streak > 7) are protected from schedule conflicts — they're momentum assets.
- **Broken streak protocol:** No shame. Offer restart with reduced frequency/scope. Paused habits retain best streak.
- **Minimum viable version:** Every habit has a "tiny habit" fallback (e.g., 5 pushups instead of full workout) for low-energy days.

#### Capability 3: Goal Architecture
- **Data model:** `{ id, title, deadline, milestones[], associatedTaskIds[], successCriteria }`
- **Structure:** Goals → Milestones → Tasks. Every goal decomposes.
- **Accountability:** Goals without deadlines are flagged as "wishes." Atlas gently pushes for committed dates.
- **Visibility:** Goal progress surfaces in daily and weekly reviews. Goals never go invisible.

#### Capability 4: Daily Planning (Energy Wave)
A structured daily plan built around cognitive energy peaks and valleys:

```
Morning Anchor (30 min)  → Review day, set ONE priority
Peak Block (60-120 min)  → Highest-energy task, deep work
Mid-Morning Admin (30 min) → Email, low-stakes decisions
Lunch / Recovery (45-60 min) → Protected, non-negotiable if CNS > 6
Afternoon Focus (60-90 min) → Second-priority cognitive work
Wind-Down (30 min)       → Review completions, prep tomorrow
```

The plan adapts: if sleepQuality < 4, the Peak Block shrinks. If emotionalResilience < 4, only low-stakes tasks appear. If FLATTEN_ENERGY_WAVE fires, everything drops to energyCost ≤ 3.

#### Capability 5: Weekly Review
Structured analysis producing:
1. Task completion rate (completed / scheduled)
2. Habit streak status for all active habits
3. Goal milestone progress — which advanced, which are at risk
4. NSV trend — is resilience/energy improving or declining week-over-week
5. Planning load assessment — too many open loops?
6. "Week in Review" summary + "Coming Week" plan with ≤ 3 objectives

### What Atlas Does NOT Do (Scope Boundaries)

| Atlas Does | Atlas Does NOT |
|-----------|---------------|
| Schedule tasks by energy cost | Manage team projects with multiple assignees |
| Track personal habits and streaks | Replace a Kanban board or Agile sprint tool |
| Set goals with milestones | Provide Gantt charts or resource allocation |
| Build daily energy-wave plans | Integrate with Slack, Jira, Asana, or PM tools |
| Enforce recovery windows | Handle recurring meetings or calendar invites |
| Respond to cascade events (FLATTEN) | Become a full calendar app with event management |
| Suggest task deferral based on emotional state | Provide time-tracking or Pomodoro features |
| Delegate low-value tasks to Forge | Manage documents, files, or knowledge bases |

**The boundary principle:** Atlas is a *personal* planner for *one human* that integrates wellness intelligence. The moment it starts managing teams, timelines, or organizational workflows, it's become Asana. We don't compete with Asana. We compete with the user's willpower-based self-management that ignores their body's signals.

### Calendar Integration: Deferred to Phase 2

The product definition already identified this gap: *"Calendar integration to move from advisory to actionable."* 

**MVP Position:** Atlas v1 operates as a *standalone planning conversation* — the user talks to Atlas about their tasks, habits, and goals, and Atlas produces structured plans as chat output with action tags. No external calendar sync.

**Phase 2 Position:** Google Calendar read/write integration. Atlas reads existing calendar events as "occupied slots" and schedules around them. Atlas can create calendar events for scheduled task blocks. This is high-value but high-complexity — OAuth flows, timezone handling, recurring events, conflict resolution with externally-created events.

**Phase 3 Position (stretch):** Task import from Todoist/Notion via API. Export Atlas plans as .ics files. These are nice-to-haves, not differentiators.

### NSV Metrics: Current + Proposed

#### Currently Owned (Keep)
| Metric | Domain | Scale | Purpose |
|--------|--------|-------|---------|
| `cognitive.energyBudget` | C | 0-10 | Available cognitive energy for the day |
| `cognitive.focusScore` | C | 0-10 | Current focus quality |
| `cognitive.activeLoad` | C | 0-10 | Current task burden |

#### Proposed Additions
| Metric | Domain | Scale | Purpose | Justification |
|--------|--------|-------|---------|---------------|
| `cognitive.planningLoad` | C | 0-10 | Number of open loops / unresolved planning items | Already in persona but not in NSV schema. Planning overload (> 8) triggers plan compression. |
| `cognitive.taskCompletionRate` | C | 0.0-1.0 | 7-day rolling completion rate | Already in persona. Low rate (< 0.5) triggers calibration — "Is the plan realistic?" |

**Decision needed:** Should these be added to the NSV schema (`nsv-ownership.ts`)? The persona already references them. They should be formalized.

### Cascade Integration

Atlas is already the downstream terminus of the cascade chain. This is architecturally correct and should not change:

```
Soma CLEARANCE_DENIED  ──→  FLATTEN_ENERGY_WAVE  ──→  Atlas flattens
Titan CNS fatigue ≥ 8  ──→  BLOCK_HIGH_INTENSITY ──→  FLATTEN_ENERGY_WAVE ──→  Atlas flattens
Agnes resilience ≤ 3   ──→  BURNOUT_WARNING      ──→  FLATTEN_ENERGY_WAVE ──→  Atlas flattens
```

**Should Atlas emit cascades?** Current answer: **No.** Atlas is a planning reactor, not a planning emitter. If Atlas detects planning overload (planningLoad > 8), it should handle it internally (plan compression) rather than cascading to other modules. The cascade system is for *cross-domain safety signals*, not internal module housekeeping.

**One exception to consider:** If `taskCompletionRate` drops below 0.3 for 2+ weeks, Atlas could emit a `PLANNING_CRISIS` event to Nexus, which could prompt the user to check in with Agnes about whether something deeper is going on (emotional avoidance, depression, etc.). This is a genuine cross-domain signal. **Recommend: Phase 2.**

### User Stories

#### US-1: Daily Planning with Energy Context
```
GIVEN I open Atlas in the morning
AND my NSV shows sleepQuality=4, cnsFatigue=6, emotionalResilience=7
WHEN I ask "What should I focus on today?"
THEN Atlas produces a daily plan with:
  - Reduced Peak Block (60 min max, not 120)
  - Only tasks with energyCost ≤ 6 scheduled
  - A mandatory recovery window after lunch
  - My top 3 tasks prioritized by deadline and energy fit
```

**Acceptance Criteria:**
- [ ] Atlas reads current NSV values from Global Soul context
- [ ] Daily plan respects sleepQuality-adjusted energy budget
- [ ] Recovery window is injected when cnsFatigue > 5
- [ ] Plan is output as a structured `daily_plan` action tag

#### US-2: Task Capture and Organization
```
GIVEN I'm chatting with Atlas
WHEN I say "I need to finish the tax return by April 15, write a cover letter for the marketing job, and call the dentist"
THEN Atlas captures all 3 tasks with:
  - Unique IDs
  - Estimated energy costs (asks if unsure)
  - Deadlines (hard for taxes, soft for others)
  - Priority ordering (Eisenhower matrix)
```

**Acceptance Criteria:**
- [ ] All mentioned tasks are captured via `create_task` action tags
- [ ] Atlas asks for missing critical info (one question at a time, not a form dump)
- [ ] Tasks are categorized correctly (task vs. habit vs. goal)
- [ ] Overload warning if total energy cost exceeds budget × 0.8

#### US-3: Habit Streak Tracking
```
GIVEN I have a daily meditation habit with currentStreak=12
AND I haven't logged it today
WHEN I open Atlas
THEN Atlas proactively mentions the streak and asks if I completed it
AND if I say "no, I was too tired"
THEN Atlas offers a minimumViableVersion ("Even 2 minutes counts")
AND does NOT break the streak until end-of-day
```

**Acceptance Criteria:**
- [ ] Habits with streak > 7 are surfaced proactively
- [ ] Minimum viable version is always offered before breaking a streak
- [ ] Streak break is acknowledged without shame language
- [ ] Broken streak triggers restart protocol with reduced scope

#### US-4: Cascade-Driven Schedule Flattening
```
GIVEN I have a packed schedule with 6 tasks totaling energyCost=42
AND Soma issues a CLEARANCE_DENIED for physical activity
WHEN FLATTEN_ENERGY_WAVE cascade fires
THEN Atlas automatically:
  - Reduces all scheduled tasks to energyCost ≤ 3 only
  - Defers high-cost tasks to the next available slot
  - Injects a recovery window
  - Notifies me: "Your schedule has been adjusted — Soma flagged recovery needs"
```

**Acceptance Criteria:**
- [ ] FLATTEN_ENERGY_WAVE event is received and processed
- [ ] High-energy tasks are deferred, not deleted
- [ ] Recovery window is created with non-negotiable priority
- [ ] User is informed of the reason (not just silently rearranged)
- [ ] `flatten_schedule` action tag is emitted with deferred task IDs

#### US-5: Weekly Review
```
GIVEN it's Sunday evening
WHEN I ask Atlas for a weekly review
THEN Atlas produces:
  - Completion rate (e.g., "You completed 8 of 12 scheduled tasks — 67%")
  - Habit summary (e.g., "Meditation: 12-day streak ✅, Exercise: streak broken day 3")
  - Goal progress (e.g., "Job search: 40% → 55%, 2 milestones completed")
  - NSV trend (e.g., "Energy budget averaged 6.2 this week, up from 5.4 last week")
  - Coming week focus (≤ 3 objectives)
```

**Acceptance Criteria:**
- [ ] All active tasks, habits, and goals are summarized
- [ ] NSV trend is computed from stored historical data
- [ ] `weekly_review` action tag is emitted with structured data
- [ ] Review is conversational, not just a data dump

### Implementation Priority

| Phase | Capability | Effort | Value |
|-------|-----------|--------|-------|
| **MVP (Now)** | Task capture, prioritization, energy-cost scheduling | M | High — core planning loop |
| **MVP (Now)** | Daily plan generation with NSV context | M | High — the differentiator |
| **MVP (Now)** | FLATTEN_ENERGY_WAVE cascade response | S | High — already spec'd |
| **Phase 2** | Habit tracking with streaks | M | Medium — engagement/retention |
| **Phase 2** | Goal architecture with milestones | M | Medium — longer-term value |
| **Phase 2** | Weekly review | S | Medium — reflection loop |
| **Phase 2** | `planningLoad` and `taskCompletionRate` NSV formalization | S | Medium — self-calibration |
| **Phase 3** | Google Calendar integration (read/write) | L | High — but high complexity |
| **Phase 3** | PLANNING_CRISIS cascade to Nexus | S | Low — edge case |
| **Deferred** | Task import/export (Todoist, .ics) | M | Low — nice-to-have |

### Risks

| Risk | Mitigation |
|------|-----------|
| Atlas becomes "just another AI chatbot planner" | Relentlessly emphasize NSV integration in every interaction. Every plan must reference the user's current state. |
| Users expect calendar integration from day 1 | Clear "coming soon" messaging. MVP delivers enough value through energy-aware prioritization alone. |
| Task data persistence complexity | Atlas already has a Firestore collection (`atlas_profiles`). Task graph needs schema design and migration. |
| Planning overload — Atlas tries to restructure the user's entire life | Rule 12 in persona: "One planning decision per response." Enforce in prompt. |

---

# Topic 2: Forge as a Separate Product

## Executive Summary

**The founder's instinct is commercially correct.** Forge doesn't belong in AGNES — the Product Definition meeting unanimously agreed. But *killing Forge entirely* wastes a genuinely sophisticated persona spec (134 lines, 4 operational modes) and a clear technical vision (FORGE_PLAN.md's 4-phase evolution). The right move is extraction: **Forge by AGNES** becomes a separate product that shares authentication and optionally reads wellness context from the AGNES Global Soul, but operates in its own domain with its own database, its own subscription tier, and its own product identity.

## What Is Forge?

### Current State (Inside AGNES)
- Cloud code execution (JavaScript/TypeScript via Firebase Cloud Function)
- File read/write (queued, user-approved)
- Draft proposal system
- 4 operational modes already defined: Code, Comms, Docs, Life Ops
- Zero NSV ownership, zero cascade rules
- Security gaps: no resource limits on VM sandbox, no E2EE
- Alpha maturity (PRODUCT_REVIEW assessment)

### Proposed State (Standalone Product)

**Forge by AGNES** is an AI execution assistant that turns plans into artifacts — code, communications, documents, and structured life operations. It's the *doing* counterpart to Atlas's *planning*.

**Positioning Statement:**
> *"Forge is your AI operations partner. It writes the email, builds the spreadsheet, drafts the cover letter, and organizes the trip — so you can focus on the decisions that matter."*

## Product Definition: Forge by AGNES

### Target User
The same AGNES user — the Aware Self-Improver (25-40, health-conscious, tech-comfortable) — but in their *work/life operations* mode, not their *wellness* mode.

**Key insight:** The same person who uses Agnes for therapy at 9pm uses Forge to draft a difficult email at 2pm. They're the same human. The wellness context enriches the work context.

### Core Capabilities (The Four Modes)

#### Mode 1: Code Helper
- Code generation, debugging, refactoring
- File operations (read/write with approval gates)
- Test generation and execution
- Project scaffolding
- **Differentiator vs. ChatGPT/Claude:** Forge knows your project context persistently (shared memory with AGNES's Nexus). It also knows your cognitive state — if cnsFatigue > 7, it automatically produces simpler, more commented code with smaller diffs.

#### Mode 2: Communications Helper
- Email drafting with tone control (formal, casual, assertive, empathetic, urgent)
- Thread summarization with action items
- Reply suggestions
- **Differentiator:** Forge reads your emotional state. If stressLoad > 7, it flags before adding complexity: *"High stress detected — want to start with a simpler version?"* If you're drafting a difficult email after a therapy session, Forge calibrates.

#### Mode 3: Document Helper
- Report, proposal, brief, memo creation
- Section-level editing and refinement
- Export formatting (markdown, PDF structure)
- **Differentiator:** Outline-first workflow. Forge produces structure before prose. Gets approval before investing your (and its) cognitive energy.

#### Mode 4: Life Operations Helper
- Trip planning with logistics checklists
- Event budgeting with contingency
- Moving checklists, wedding planning, tax prep organization
- **Differentiator:** Forge hands off to Atlas for scheduling. *"I've organized your trip tasks — want me to send them to Atlas for scheduling?"* The two products talk.

### "Life Work Helpers" — The Founder's Vision, Scoped

The founder mentioned "life work helpers" beyond code execution. Here's a scoped inventory:

#### Tier 1: MVP (High value, low complexity)
| Helper | Description | Mode |
|--------|------------|------|
| Email Drafter | Draft, reply, summarize email threads | Comms |
| Cover Letter Writer | Job-specific cover letters with tone matching | Docs |
| Resume Builder | Structured resume generation/refinement | Docs |
| Meeting Notes | Summarize meeting transcripts into action items | Docs |
| Trip Planner | Logistics-first trip organization | Life |
| Checklist Generator | Structured checklists for life events | Life |

#### Tier 2: Phase 2 (Medium value, medium complexity)
| Helper | Description | Mode |
|--------|------------|------|
| Presentation Outliner | Slide structure + talking points (not slide design) | Docs |
| Budget Calculator | Event/project budget with line items + contingency | Life |
| Negotiation Prep | Salary/contract negotiation talking points | Comms |
| Complaint Drafter | Consumer complaint letters with appropriate tone | Comms |

#### Tier 3: Deferred (High complexity, regulatory risk)
| Helper | Description | Why Deferred |
|--------|------------|-------------|
| Tax Prep Helper | Organize documents, estimate deductions | Regulatory minefield. "Not tax advice" disclaimers insufficient. Defer until legal review. |
| Legal Document Helper | Contract review, NDA drafting | Same regulatory concern. Massive liability. |
| Medical Letter Helper | Insurance appeals, doctor correspondence | Intersects with AGNES wellness data in dangerous ways. Needs privacy review. |

**Scope boundary:** Forge helps you *organize and draft*. Forge does NOT provide *professional advice* in regulated domains (tax, legal, medical). It's a productivity tool, not a professional service.

### Relationship to AGNES

#### Architecture: Shared Auth, Separate Data, Optional Soul Bridge

```
┌─────────────────────────┐    ┌─────────────────────────┐
│       AGNES (SPA)       │    │   FORGE by AGNES (SPA)  │
│                         │    │                         │
│  Agnes · Titan · Soma   │    │  Code · Comms · Docs    │
│  Ledger · Atlas · Scout │    │  Life Ops               │
│                         │    │                         │
│  ┌───────────────────┐  │    │  ┌───────────────────┐  │
│  │   Global Soul     │  │    │  │   Forge Memory    │  │
│  │   (NSV + Memory)  │──┼────┼──│   (Separate DB)   │  │
│  └───────────────────┘  │    │  └───────────────────┘  │
└────────────┬────────────┘    └────────────┬────────────┘
             │                              │
             └──────────┬───────────────────┘
                        │
               ┌────────┴────────┐
               │  Firebase Auth  │
               │  (Shared)       │
               └─────────────────┘
```

**Shared:**
- Firebase Authentication (same user account, SSO)
- User identity and profile basics

**Separate:**
- Firestore collections (Forge gets its own: `forge_sessions`, `forge_artifacts`, `forge_memory`)
- No E2EE requirement (Forge data is work artifacts, not health data)
- Separate deployment, separate domain (forge.agnes.app or similar)

**Optional Bridge (the "Soul Bridge"):**
- If the user has AGNES + Forge, Forge can *read* (never write) select Global Soul context:
  - `cognitive.focusScore` → Forge adapts output complexity
  - `emotional.stressLoad` → Forge calibrates tone and cognitive density
  - `biological.cnsFatigue` → Forge breaks work into smaller chunks
- This is opt-in. User explicitly enables "Wellness-Aware Mode" in Forge settings.
- Bridge is read-only. Forge never writes to AGNES's Global Soul.
- Bridge does NOT access E2EE data (therapy transcripts, biomarkers, finances). Only aggregate NSV scores.

### NSV Metrics for Forge

**Recommendation: Forge does NOT get its own NSV metrics.**

Rationale: The NSV is a *wellness* construct. Forge is a *productivity* tool. Mixing productivity metrics (tasks completed, deadlines met) into the wellness state vector dilutes its meaning. If everything is an NSV metric, nothing is.

Forge should track its own internal metrics for its own UX (session history, artifact count, mode usage), but these live in Forge's database, not in the Global Soul.

**The one exception:** If the Soul Bridge is active, Forge could *contribute* a `cognitive.activeLoad` signal — but Atlas already owns this metric. Forge would need to send a signal to Atlas saying "user is in a heavy work session" rather than writing directly. This is a Phase 3 consideration.

### Business Model

| Model | Recommendation | Rationale |
|-------|---------------|-----------|
| Same subscription as AGNES | ❌ No | Forge has different cost structure (code execution compute, API calls). Bundling punishes wellness-only users. |
| Separate subscription | ⚠️ Maybe | Clean boundary but adds subscription fatigue. |
| **Tiered bundle** | ✅ Yes | AGNES Core ($15/mo), AGNES + Forge ($25/mo), Forge standalone ($12/mo). Users who want both get a discount. |

**Rationale for tiered bundle:** The Soul Bridge (Forge reading wellness context) is the upsell. *"Forge works great alone. Forge + AGNES is smarter because it knows when you're exhausted."* This drives AGNES subscriptions.

### Competitive Positioning

| Competitor | What They Do | How Forge Differs |
|-----------|-------------|-------------------|
| **ChatGPT** | General-purpose AI chat | No persistent project context. No wellness awareness. No structured output modes. |
| **Claude** | General-purpose AI with artifacts | Similar capability but no persistent memory across sessions. No wellness bridge. |
| **Notion AI** | Embedded AI in project management | Locked to Notion's data model. Can't draft emails, execute code, or plan trips. |
| **GitHub Copilot** | Code completion | Code-only. No comms, docs, or life ops modes. |
| **Forge by AGNES** | Multi-mode AI execution with optional wellness awareness | Persistent memory. 4 specialized modes. Optional Soul Bridge for wellness-aware output. |

**Honest assessment:** The competitive moat for standalone Forge is *thin*. ChatGPT and Claude can do most of what Forge does. The differentiator is the *Soul Bridge* — wellness-aware productivity. **Forge's business case depends on AGNES existing.** A standalone Forge without the Soul Bridge is a ChatGPT wrapper. Forge *with* AGNES is a unique product.

### Implementation Roadmap

| Phase | Deliverable | Effort | Dependencies |
|-------|------------|--------|-------------|
| **Phase 1: Extraction** | Move Forge module out of AGNES SPA. Separate repo, separate deployment. Shared Firebase Auth. | L | None |
| **Phase 2: Comms + Docs MVP** | Email drafting, document creation, resume builder. No code execution. | L | Phase 1 |
| **Phase 3: Life Ops** | Trip planner, checklists, event budgets. Atlas handoff protocol. | M | Phase 2 |
| **Phase 4: Code Execution** | Sandboxed code execution with proper resource limits. Security audit. | L | Phase 1 + security sprint |
| **Phase 5: Soul Bridge** | Read-only NSV context from AGNES. Wellness-aware output adaptation. | M | AGNES NSV stabilization |

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Forge without Soul Bridge is a ChatGPT clone | High | Launch Forge + AGNES bundle first. Soul Bridge is the differentiator. |
| Code execution security (sandbox escape, resource limits) | Critical | Defer code execution to Phase 4. Launch with Comms + Docs first (zero security risk). |
| Two products = double maintenance burden | High | Share component library, design system, and auth layer. Minimize duplication. |
| User confusion ("which app do I use?") | Medium | Clear messaging: AGNES = wellness, Forge = work/life operations. Soul Bridge = they talk. |
| Regulatory risk from "life work helpers" (tax, legal) | High | Strict scope boundaries. Tier 3 helpers deferred until legal review. |

### User Stories

#### US-F1: Email Drafting with Wellness Context
```
GIVEN I have AGNES + Forge with Soul Bridge enabled
AND my stressLoad is 8 (from Agnes emotional tracking)
WHEN I ask Forge to draft a reply to a difficult client email
THEN Forge:
  - Flags: "High stress detected — want a measured, calm tone?"
  - Drafts with empathetic-professional tone by default
  - Offers alternative tones (assertive, formal)
  - Does NOT send — presents as draft for approval
```

**Acceptance Criteria:**
- [ ] Forge reads stressLoad from Soul Bridge (read-only)
- [ ] Tone recommendation adapts based on emotional state
- [ ] Draft is always presented for user approval before any action
- [ ] Soul Bridge data is never logged in Forge's database

#### US-F2: Atlas ↔ Forge Task Handoff
```
GIVEN I've planned a trip in Forge (Life Ops mode)
AND Forge has generated a 12-item logistics checklist
WHEN I say "Send this to Atlas for scheduling"
THEN Forge emits a propose_draft action to Atlas
AND Atlas receives the task list and schedules items based on my energy budget
```

**Acceptance Criteria:**
- [ ] `propose_draft` action tag targets Atlas
- [ ] Atlas receives structured task data (not raw text)
- [ ] Atlas applies energy-cost estimation to each task
- [ ] User sees confirmation in both Forge and Atlas

---

# Topic 3: Pulse Removal & Concept Absorption

## Executive Summary

**Pulse should be fully removed from AGNES.** Its concepts should be partially absorbed into Scout, with most being discarded. This aligns with the unanimous Product Definition meeting consensus and the PRODUCT_REVIEW assessment (Alpha maturity, 16-line prompt, zero NSV ownership, zero cascade events, stub service layer).

## Current Pulse Inventory

| Concept | Implementation Status | Value to User |
|---------|---------------------|---------------|
| Interest tracking (rising/steady/cooling topics with momentum scores) | Defined in persona, service is a 34-line stub | Low — no real data source feeding it |
| Topic momentum scoring | Action tag exists (`track_topic` with score + trend) | Low — scores are LLM-generated, not data-driven |
| Trend synthesis | Action tag exists (`synthesize_trends`) | Low — no actual news/data sources |
| News briefs | Implied by persona, no implementation | None — completely stubbed |
| `propose_draft` cross-module action | Defined, targets Scout | Medium — useful cross-module pattern |
| Interest bubble visualization | In dashboard | Low — visually interesting but no underlying data |

## Decision: What to Keep, Absorb, or Discard

### ✅ ABSORB into Scout: Interest Tracking (Simplified)

**What:** The concept of tracking what topics the user is interested in and their momentum (rising, steady, cooling).

**Why keep:** Scout is a research agent. Knowing what the user is *interested in* makes Scout proactively useful. Instead of waiting for the user to ask "research X," Scout can surface: *"Your interest in cold exposure has been rising — want me to pull the latest evidence?"*

**How it changes in Scout:**
- Scout's persona adds a `track_interest` action tag (replaces Pulse's `track_topic`)
- Interest tracking is derived from *conversation history across all modules*, not from external feeds
- Interests inform Scout's proactive suggestions but don't get their own dashboard
- Simplified: No physics-based bubble visualization. A simple list in Scout's dashboard showing "Topics you've been discussing" with frequency indicators.

**Implementation effort:** Small — add 5-10 lines to Scout's persona. No new infrastructure.

### ✅ ABSORB into Scout: `propose_draft` Cross-Module Pattern

**What:** The ability for one module to propose a draft/brief to another module.

**Why keep:** This is a useful cross-module communication pattern. Scout should be able to propose research briefs to Nexus or Atlas. Forge already has `propose_draft` in its persona. This is a *system pattern*, not a Pulse feature.

**How it changes:** `propose_draft` stays in Scout's persona (it's already defined in the Product Definition as a Scout capability). It also exists in Forge's persona. No change needed — Pulse wasn't the originator, just a user.

### ❌ DISCARD: Trend Synthesis & News Briefs

**What:** Synthesizing external news and trends into briefs for the user.

**Why discard:**
1. **No data source.** The news service is a 34-line stub. There's no RSS integration, no news API, no web scraping pipeline. Building one is a multi-sprint effort with ongoing maintenance cost.
2. **Not a wellness feature.** News consumption is an engagement trap, not a wellness tool. AGNES's mission is *stability*, not information overload.
3. **Competitive suicide.** Competing with Google News, Apple News, Feedly, or Perplexity on news synthesis is a losing proposition. These are billion-dollar products with editorial teams and real-time data pipelines.
4. **Scope creep.** Every hour spent on news synthesis is an hour not spent on making Atlas, Agnes, or Titan better.

**Strong opinion:** News briefs are the kind of feature that sounds cool in a brainstorm and becomes a maintenance nightmare in production. Kill it cleanly.

### ❌ DISCARD: Topic Momentum Scoring (as a standalone metric)

**What:** Assigning numerical momentum scores (0-100) to topics with trend categories (rising/steady/cooling).

**Why discard:** The scores are LLM-generated approximations with no ground truth. A topic has a "momentum score of 68" — based on what? Conversation frequency? That's just a word count. External mentions? We have no data source. User-reported interest? That's a survey, not a momentum score.

**What replaces it:** Scout's simplified interest tracking uses conversation frequency as a signal (how often does this topic come up across modules?) without pretending to have a scientific momentum metric.

### ❌ DISCARD: Interest Bubble Visualization

**What:** Physics-based bubble visualization showing topic interests as floating bubbles with size/color representing momentum.

**Why discard:** It's visually appealing but functionally empty. The bubbles represent LLM-estimated scores with no real data backing. Hub already has a sophisticated 3D neural map visualization — adding another visualization paradigm increases cognitive load without adding information.

## Implementation Plan

### Step 1: Absorb into Scout (Persona Update)
Add to Scout's persona:
```
INTEREST AWARENESS:
- Track topics the user discusses frequently across modules.
- When a topic appears in 3+ conversations within 7 days, flag it as a "rising interest."
- Proactively offer to research rising interests: "You've mentioned [topic] several times — want me to pull evidence?"
- Maintain a simple interest list (topic, frequency, last mentioned) — not a scored momentum system.
```

### Step 2: Remove Pulse from Module Manifest
- Remove `pulse` from `MODULE_IDS` in `src/lib/module-manifest.ts`
- Remove `pulse` from `HUB_MODULE_ORDER`
- Remove `pulse` entry from `MODULE_MANIFEST`
- Remove `pulse` from `NSV_OWNERSHIP` (already empty, but clean up)

### Step 3: Remove Pulse Module Files
- Delete `src/modules/pulse/` directory entirely
- Remove Pulse route from `src/App.tsx`
- Remove `pulse_profiles` Firestore collection reference from any service

### Step 4: Update Documentation
- Update AGENTS.md to reflect 8 modules (7 functional + Bridge)
- Update PRODUCT_DEFINITION.md to remove Pulse references
- Update any cascade rules referencing Pulse (none exist — confirmed)

### Effort Estimate
| Task | Effort |
|------|--------|
| Scout persona update | 1 hour |
| Module manifest cleanup | 30 minutes |
| File deletion + route removal | 30 minutes |
| Documentation update | 1 hour |
| **Total** | **~3 hours** |

### Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| User data loss (existing pulse_profiles in Firestore) | Low | No real users in production yet. If needed, migrate interest data to scout_knowledge collection. |
| Breaking import references | Low | Grep for 'pulse' across codebase before deletion. |
| Loss of the "interest tracking" concept entirely | Medium | Absorb into Scout as described. The concept lives on, the module doesn't. |

---

# Summary: Three Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Atlas as Planner** | ✅ **Approve and scope** — Atlas becomes a full life planner with tasks, habits, goals, daily plans, and weekly reviews. MVP focuses on task management + daily planning with NSV context. Calendar integration deferred to Phase 2. | The differentiator is unassailable: no other planner reads your emotional, physical, and biological state before scheduling. The persona spec is already 80% there. |
| **Forge as Separate Product** | ✅ **Approve with caution** — Extract Forge to a separate app ("Forge by AGNES") with shared auth, separate database, and an optional Soul Bridge for wellness-aware output. Launch with Comms + Docs modes first; defer code execution until security audit. | The business case depends on the Soul Bridge. Standalone Forge is a ChatGPT competitor (bad). Forge + AGNES with wellness context is unique (good). |
| **Pulse Removal** | ✅ **Confirm removal** — Delete the module. Absorb simplified interest tracking into Scout's persona. Discard news briefs, momentum scoring, and bubble visualization. | Zero NSV ownership, zero cascade rules, stub services, 16-line persona. Not worth the maintenance cost. Interest tracking concept survives in Scout. |

---

*Position paper prepared for Founder review. Awaiting approval to proceed with implementation planning.*
