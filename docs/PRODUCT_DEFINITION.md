# AGNES Product Definition v2

> *Synthesized from two cross-functional meetings with 8 specialist agents (Product Manager, System Architect, UX Designer, LLM Specialist). Updated with Atlas planner expansion, Forge separation, Pulse removal, and state ownership charter.*

---

## Product Identity

**AGNES** is an AI wellness companion that understands how your mind, body, and energy connect — and coaches you across all three.

**One-liner:** *"A team of specialized AI agents that share one understanding of you."*

**Companion Product:** **Forge by AGNES** — A separate AI productivity tool for code, documents, communications, and life tasks. Connected via a read-only "Soul Bridge."

---

## The Core Loop

```
CHECK IN  → User opens Hub, sees their wellness state (Body/Mind/Heart/Flow pillars)
ENGAGE    → User enters a session (Therapy, Trainer, Planner, or other module)
SENSE     → Module updates Neural State Vector metrics
CASCADE   → Spine fires cross-domain events (burnout → block intensity → flatten schedule)
SURFACE   → Hub reflects the updated state; cascade events shown in human language
RETURN    → User comes back because the system "knows" them better each day
```

---

## Product Structure (Post-Meeting 2 Consensus)

### AGNES — Wellness Platform

#### Tier 1: Core (Primary Experience)

| Module | Agent | Domain | Purpose |
|--------|-------|--------|---------|
| **Nexus** | Nexus | Cross-domain | Front door — routes, arbitrates, synthesizes across all domains |
| **Therapy** | Agnes | Emotional | Clinical-grade AI therapy with belief graph and 19 archetypes |
| **Trainer** | Titan | Physical | CNS-aware workout programming with recovery intelligence |
| **Soma** | Soma | Biological safety | Independent medical safety authority — clearance system |
| **Atlas** | Atlas | Planning & cognitive | **Energy-aware life planner** — tasks, goals, habits, schedule |

#### Tier 2: Extensions (Optional)

| Module | Agent | Domain | Purpose |
|--------|-------|--------|---------|
| **Ledger** | Ledger | Financial | Financial-wellbeing correlation tracking |
| **Scout** | Scout | Research | Evidence verification + interest tracking (absorbed Pulse) |

#### Navigation/Utility

| Module | Purpose |
|--------|---------|
| **Hub** | Central visualization — 3D/Graph/Cards + Daily Brief + cascade timeline |
| **Profile** | Account, vault, module settings, data sharing preferences |
| **Landing** | Public marketing + guest trial |

### Forge — Separate Product

| Mode | Purpose |
|------|---------|
| **Code** | Cloud code execution, debugging, refactoring |
| **Comms** | Email drafting, message composition, reply suggestions |
| **Docs** | Document creation, editing, formatting for export |
| **Life** | Checklists, trip planning, event budgets, life admin |

### Removed

| Module | Verdict | Reason |
|--------|---------|--------|
| **Forge** | 🔀 SEPARATED | Becomes its own product — zero wellness value inside AGNES |
| **Pulse** | ❌ CUT | 16-line prompt, zero NSV ownership. Concepts absorbed into Scout |

---

## Module Definitions (Revised)

### NEXUS — Cross-Domain Intelligence

> *"Your unified mind. Nexus sees patterns others miss."*

- **Purpose:** Primary conversational entry point. Routes to specialists. Synthesizes cross-domain insights.
- **Actions:** `query_module`, `search_memory`, `delegate_to_module`, `broadcast_spine_event`, `sync_vitals`
- **NSV:** Reads all domains. Writes via `sync_vitals` only (emergency/init/correction with audit trail).
- **Boundary:** Advises and routes. Does NOT perform therapy, program workouts, track biomarkers, or plan tasks.

### AGNES — AI Psychotherapist

> *"Your private therapist. Agnes creates a secure space for emotional exploration."*

- **Purpose:** High-fidelity AI therapy. 19 archetypes × gendered presentation. Belief graph tracking.
- **Actions:** `update_emotional_resilience`, `update_stress_load`, `update_mood_trend`, `update_trauma_markers`, `update_emotional_state`, `update_belief_graph`
- **NSV Writes:** `emotional.*` (resilience, stress, mood, trauma) — EXCLUSIVE
- **NSV Reads:** All biological + cognitive (for holistic awareness). Financial = derived label only. Trauma markers = NEVER shared out.
- **Guardrails:** Anti-repetition, distress protocol, `<thought>` internal monologue, clinical archetypes

### TITAN — AI Performance Coach

> *"Your training intelligence. Titan programs workouts that adapt to your recovery and emotional state."*

- **Purpose:** Elite training with CNS fatigue awareness and dynamic tone adaptation.
- **Actions:** `update_cns_fatigue`, `update_sleep_quality`, `request_soma_clearance`, `generate_routine`, `log_session`
- **NSV Writes:** `biological.cnsFatigue`, `biological.sleepQuality` — EXCLUSIVE
- **NSV Reads:** All emotional (adjusts tone), Soma clearance (blocks intensity), Atlas energy (respects schedule)
- **Cascade:** Writes cnsFatigue → if ≥8 triggers BLOCK_HIGH_INTENSITY. Receives CLEARANCE_DENIED from Soma.

### SOMA — Biological Safety Authority

> *"Your independent health monitor. Soma tracks biomarkers and issues clearance."*

- **Purpose:** Conservative, evidence-oriented. Tracks biomarkers, parses lab reports, issues clearance decisions.
- **Actions:** `update_recovery_score`, `update_hormonal_context`, `issue_clearance`, `commit_biomarker`, `sync_vitals`
- **NSV Writes:** `biological.recoveryScore`, `biological.hormonalContext` — EXCLUSIVE
- **NSV Reads:** Biological domain (full), emotional summary (derived), cognitive (for clearance context)
- **Cascade:** Issues CLEARANCE_DENIED → blocks Trainer intensity → flattens Atlas energy waves
- **Boundary:** NEVER diagnoses, prescribes, or recommends dosages. The brake, not the accelerator.

### ATLAS — Energy-Aware Life Planner ⭐ REDESIGNED

> *"Your planning intelligence. Atlas builds schedules that respect your body, mind, and energy."*

**The Key Differentiator:** Atlas is the only planner on Earth that reads a live Neural State Vector before touching the schedule. Notion doesn't know you're exhausted. Todoist doesn't know your CNS fatigue is 8. Atlas does.

- **Purpose:** Life/task planning with biological and emotional awareness. Tasks, goals, habits, energy waves, recovery windows, weekly reviews.
- **Persona:** 183-line system prompt with 5-section `<thought>` block (NSV_Check → Capacity_Assessment → Planning_Constraints → Task_Priority_Stack → Strategy: ONE move)

**Data Model:**
```
AtlasProfile:
  energyWave: EnergyWavePoint[]     // 48 time slots
  recoveryWindows: RecoveryWindow[] // Non-negotiable rest blocks
  taskGraph: AtlasTaskNode[]        // Up to 500 tasks (was 100)
  goals: AtlasGoal[]                // Up to 25 goals
  projects: AtlasProject[]          // Up to 50 projects
  habits: AtlasHabit[]              // Up to 30 habits
  weeklyReviews: WeeklyReviewSnapshot[] // Up to 52
```

**Actions (20 total):**
- Task: `create_task`, `update_task`, `complete_task`, `move_task`, `prioritize`
- Goals: `create_goal`, `update_goal_progress`, `set_deadline`
- Habits: `create_habit`, `update_habit_streak`, `pause_habit`
- Schedule: `daily_plan`, `weekly_review`, `schedule_block`
- Energy: `update_energy_wave`, `flatten_schedule`, `create_recovery_window`
- Cross-module: `delegate_to_module`, `request_nsv_calibration`

**NSV Writes:** `cognitive.energyBudget`, `cognitive.focusScore`, `cognitive.activeLoad`, `cognitive.planningLoad`, `cognitive.taskCompletionRate` — EXCLUSIVE

**NSV Reads (Behavioral Matrix):**
| Signal | Atlas Response |
|--------|---------------|
| `cnsFatigue ≥ 7` | Emergency load-shedding, max 2 focus hours, energyCost ceiling = 3 |
| `emotionalResilience < 4` | Reduce load, add buffer blocks, prioritize completions over new work |
| `hormonalContext = "luteal"` | Admin/creative work only; no launches or irreversible decisions |
| `financialFriction > 8` | Revenue-generating tasks become priority-1 |
| `taskCompletionRate < 0.5` | Plan is wrong, not the person — trigger recalibration |

**New Cascade Rules:**
- `planningLoad ≥ 8` → PLANNING_OVERLOAD → orchestrator (alert)
- `DEADLINE_APPROACHING` (< 24h) → FLATTEN_ENERGY_WAVE to self (focus mode)
- `HABIT_STREAK_BROKEN` (≥ 7 day streak) → emotional check-in via Agnes

**14 Guardrails (key ones):**
- NEVER contradict Soma clearance
- NEVER therapize — route emotional distress to Agnes
- NEVER write to other modules' NSV fields
- NEVER overwhelm — ONE planning decision per response
- Recovery windows are NON-NEGOTIABLE

**UX (Designer consensus):**
- Split-view: interactive planner (left) + chat (right)
- Energy Ribbon: SVG strip showing energy terrain across the day
- Task Timeline: tasks placed on energy map with color-coded energy costs
- 3 views: Today (default), Week (7-day grid), Focus (zen mode)
- Dual task creation: chat-native + QuickAdd form
- Cascade signals as banners with source module color + Undo
- Mobile: Tab-separated planner and chat

### LEDGER — Financial Wellness Strategist (Extension)

> *"Your financial clarity agent. Tracks how money affects your wellbeing."*

- **Actions:** `update_financial_friction`, `update_resonance_roi`, `compute_resonance_roi`
- **NSV Writes:** `resource.financialFriction`, `resource.resonanceROI` — EXCLUSIVE
- **NSV Reads:** Emotional summary (derived), biological (NEVER — prevents pathologizing normal behavior)
- **Status:** Extension/Beta — requires user validation

### SCOUT — Research & Intelligence Agent (Extension, absorbed Pulse)

> *"Your evidence analyst. Verifies claims, grades evidence, tracks intellectual interests."*

- **Purpose:** Confidence-calibrated research + interest/topic momentum tracking (absorbed from Pulse).
- **Actions:** `add_knowledge_node`, `verify_claim`, `search_web`, `update_research_graph`, `track_research_thread`, `update_research_interests`, `synthesize_research_trends`
- **NSV Writes:** `cognitive.researchLoad` — EXCLUSIVE
- **NSV Reads:** All cognitive (for research load context), emotional summary (derived)
- **Interest Momentum:** Per-topic data (rising/steady/cooling/dormant) stays module-local, not in NSV
- **Persona:** 120-line system prompt with confidence calibration, source quality hierarchy, and synthesis protocol

---

## Forge by AGNES — Separate Product

### Product Brief

**What:** An AI productivity assistant for code, communications, documents, and life tasks.
**Who:** Developers, knowledge workers, anyone who needs AI-assisted task completion.
**Differentiator:** Connected to AGNES wellness data via Soul Bridge — adapts assistance based on your energy and stress levels.

### Architecture

- **Same Firebase Auth** (SSO with AGNES), separate Firestore collections
- **Soul Bridge:** Read-only Cloud Function returns filtered NSV subset (cognitive + resource labels only — no biological/emotional raw scores)
- **Forge NEVER writes to AGNES NSV** — fully unidirectional
- **One master persona + 4 contextual overlays** (Code/Comms/Docs/Life)
- **5-layer safety for code execution:** Persona-level risk classification → pattern blocklist → approval gate → audit trail → sandbox (Cloud Run Jobs, not Node.js vm)

### Wellness Context in Forge
```
stressLoad > 7:           "High stress — want to start with something smaller?"
cnsFatigue > 7:           Step-by-step breakdowns, smaller chunks
emotionalResilience < 4:  More structured output, fewer open-ended questions
financialFriction > 6:    On proposals: offer urgency-tone options
```

### Launch Order
1. **Comms + Docs** modes first (zero security risk)
2. **Code execution** after security audit (sandbox migration)
3. **Life helpers** after product validation
4. **Tax/legal** deferred until legal review

### Business Model (PM recommendation)
- AGNES Core: $15/month
- Forge standalone: $12/month
- AGNES + Forge bundle: $25/month

---

## Cross-Module Integration: The Cascade System

```
                    ┌─────────────┐
                    │    NEXUS    │  Sees everything. Arbitrates conflicts.
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
   │  THERAPY   │    │   SOMA    │    │  TRAINER   │
   │ emotional  │    │ bio safety│    │ physical   │
   └─────┬──────┘    └─────┬─────┘    └─────┬─────┘
         │                 │                 │
         │          CLEARANCE_DENIED         │
         │             ────────►             │
         │                            BLOCK_INTENSITY
         │                                   │
         │  BURNOUT_WARNING                  │
         ├─────────────────►─────────────────┤
         │                                   │
         │                 ┌─────────────────┘
         │                 │
   ┌─────┴─────────────────┴─────┐
   │           ATLAS             │
   │    planning / cognitive     │
   │    FLATTEN_ENERGY_WAVE      │
   │    PLANNING_OVERLOAD        │
   │    DEADLINE_APPROACHING     │
   │    HABIT_STREAK_BROKEN      │
   └─────────────┬───────────────┘
                 │
         ┌───────┴───────┐
         │               │
   ┌─────┴─────┐   ┌────┴────┐
   │  LEDGER   │   │  SCOUT  │
   │ resource  │   │research │
   └───────────┘   └─────────┘
```

**Cascade Rules (12 total):**

| # | Trigger | Condition | → Event | → Target | Priority |
|---|---------|-----------|---------|----------|----------|
| 1 | VITAL_UPDATED | cnsFatigue≥8 AND resilience≤3 | BURNOUT_WARNING | orchestrator | critical |
| 2 | VITAL_UPDATED | cnsFatigue≥8 | BLOCK_HIGH_INTENSITY | titan | alert |
| 3 | VITAL_UPDATED | financialFriction≥8 | FINANCIAL_STRESS | orchestrator | alert |
| 4 | CLEARANCE_DENIED | always | BLOCK_HIGH_INTENSITY | titan | alert |
| 5 | CLEARANCE_DENIED | always | FLATTEN_ENERGY_WAVE | atlas | alert |
| 6 | BURNOUT_WARNING | always | FLATTEN_ENERGY_WAVE | atlas | alert |
| 7 | BLOCK_HIGH_INTENSITY | always | FLATTEN_ENERGY_WAVE | atlas | alert |
| 8 | VITAL_UPDATED | planningLoad≥8 | PLANNING_OVERLOAD | orchestrator | alert |
| 9 | DEADLINE_APPROACHING | <24h remaining | FLATTEN_ENERGY_WAVE | atlas | alert |
| 10 | HABIT_STREAK_BROKEN | streak≥7 days | (emotional check) | agnes | info |
| 11 | PLANNING_OVERLOAD | always | FLATTEN_ENERGY_WAVE | atlas | alert |
| 12 | COMPOUND_STRESS | cnsFatigue≥7 AND stress≥7 AND friction≥7 | CRISIS_MODE | orchestrator | critical |

---

## State Ownership Charter (Summary)

### Three Iron Laws
1. **Single Writer Principle:** Each NSV field has exactly ONE module that can write it. No exceptions except `sync_vitals`.
2. **Explicit Reads:** Modules declare what they read. Not all modules see all data (privacy boundaries).
3. **Orchestrator Override Protocol:** `sync_vitals` requires a reason enum and 5-minute staleness check.

### NSV Ownership Matrix

```
BIOLOGICAL (B):
  Titan  [EXCLUSIVE]:  cnsFatigue (0-10), sleepQuality (0-10)
  Soma   [EXCLUSIVE]:  recoveryScore (0-10), hormonalContext (text)

EMOTIONAL (E):
  Agnes  [EXCLUSIVE]:  emotionalResilience (0-10), stressLoad (0-10),
                       moodTrend (text), traumaMarkers (string[])

COGNITIVE (C):
  Atlas  [EXCLUSIVE]:  energyBudget (0-10), focusScore (0-10), activeLoad (0-10),
                       planningLoad (0-10), taskCompletionRate (0-1.0)
  Scout  [EXCLUSIVE]:  researchLoad (0-10)

PLANNING (P) — New domain:
  Atlas  [EXCLUSIVE]:  streakHealth (0-10), deadlinePressure (0-10)

RESOURCE (R):
  Ledger [EXCLUSIVE]:  financialFriction (0-10), resonanceROI (float)
```

### Read Permission Matrix (Privacy)

| Field | Agnes | Titan | Soma | Atlas | Scout | Ledger | Nexus |
|-------|-------|-------|------|-------|-------|--------|-------|
| cnsFatigue | ✅ | ✅ own | ✅ | ✅ | ❌ | ❌ | ✅ |
| sleepQuality | ✅ | ✅ own | ✅ | ✅ | ❌ | ❌ | ✅ |
| recoveryScore | ⚠️ derived | ✅ | ✅ own | ✅ | ❌ | ❌ | ✅ |
| hormonalContext | ⚠️ derived | ✅ | ✅ own | ✅ | ❌ | ❌ | ✅ |
| emotionalResilience | ✅ own | ⚠️ derived | ⚠️ derived | ✅ | ❌ | ❌ | ✅ |
| stressLoad | ✅ own | ⚠️ derived | ❌ | ✅ | ❌ | ❌ | ✅ |
| traumaMarkers | ✅ own | ❌ | 🔒 opt-in | ❌ | ❌ | ❌ | ✅ |
| moodTrend | ✅ own | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| energyBudget | ❌ | ✅ | ❌ | ✅ own | ✅ | ❌ | ✅ |
| focusScore | ❌ | ❌ | ❌ | ✅ own | ✅ | ❌ | ✅ |
| activeLoad | ❌ | ❌ | ❌ | ✅ own | ❌ | ❌ | ✅ |
| planningLoad | ❌ | ❌ | ❌ | ✅ own | ❌ | ❌ | ✅ |
| taskCompletionRate | ❌ | ❌ | ❌ | ✅ own | ❌ | ❌ | ✅ |
| financialFriction | ⚠️ derived | ❌ | ❌ | ✅ | ❌ | ✅ own | ✅ |
| resonanceROI | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ own | ✅ |
| researchLoad | ❌ | ❌ | ❌ | ❌ | ✅ own | ❌ | ✅ |

**Legend:** ✅ = full value, ⚠️ = derived label only, 🔒 = requires user opt-in, ❌ = not sent

### Ownership Enforcement
- **Runtime validation gate** in ActionHub between `dispatch()` and `updateGlobalSoul()`
- `FIELD_TO_OWNER` reverse index map — O(1) lookups
- Rejects entire write if ANY field isn't owned by calling module
- `sync_vitals` requires reason enum + staleness check

### Concurrency Model
- **Field-level last-write-wins** (Single Writer Principle prevents conflicts by design)
- NOT Firestore transactions (unnecessary latency)
- Sequential action processing within a single LLM response
- Optimistic local UI updates

---

## UX Recommendations (Designer Consensus)

### State Visibility
1. **"Body/Mind/Heart/Flow" not "Biological/Cognitive/Emotional/Resource"** — human language, not clinical
2. **Word-states over numbers** — "Strong", "Tired", "Drained" as primary display. Numbers on progressive disclosure
3. **Attribution as "via X"** — "via Soma, 2h ago" not "Owned by Soma"
4. **Cascade collapse pattern** — single-sentence summary by default, expandable to full chain

### New Components Built
- **DailyBrief** — 4-pillar wellness summary in Hub
- **CascadeTimeline** — human-readable cascade chain display
- **TodaysPlanCard** — Atlas daily planner with energy budget bar
- **SpineToast** — toast notifications for significant Spine events
- **TrendArrow** — trend indicator (↑↓→) with semantic colors
- **MetricAttribution** — "via Soma · 2h ago" attribution badges
- **InsightSourceBadge** — in-chat cross-module insight attribution
- **DataSharingSettings** — privacy/consent panel with per-module toggles

### Critical UX Changes
1. **Staged onboarding** — Week 1: Nexus + Therapy. Week 2: Trainer. Week 3: Soma. Extensions surface organically
2. **Form-based intake by default** — Chat intake as "go deeper" option
3. **Warm the copy** — "Neural Link Established" → "Connected"
4. **Nexus as primary interface** — "What's on your mind?" front door
5. **Atlas split-view** — Interactive planner (Energy Ribbon + Task Timeline) + chat
6. **Surface cascade insights as hero feature** — "Titan adjusted your workout because Agnes detected high stress"
7. **Override always possible** — AGNES advises, never gatekeeps

---

## Target User Personas

**Primary:** *The Aware Self-Improver* (25-40, health-conscious, uses 2-3 wellness apps, frustrated they don't talk to each other, $15-30/month)

**Secondary:** *The Biohacker* (uses all modules including Soma biomarkers, tracks HRV/sleep/blood panels, power user of cascade system)

**Forge User:** *The Knowledge Worker* (developer or professional who wants AI productivity tools that understand their energy levels)

---

## Implementation Priority

### Phase 1: Clean Up (Sprint 2)
- Remove Pulse module (8 files delete, ~32 files edit)
- Separate Forge from AGNES module grid
- Fix Forge security (authenticate Cloud Function)
- Data migration: Pulse interests → Scout knowledge nodes

### Phase 2: Atlas Planner (Sprint 3-4)
- Expand AtlasProfile with goals, projects, habits
- Implement 20 new action handlers
- Build planner UI (Energy Ribbon, Task Timeline, QuickAdd)
- Add new cascade rules (PLANNING_OVERLOAD, DEADLINE_APPROACHING, HABIT_STREAK_BROKEN)
- Implement NSV ownership enforcement in ActionHub

### Phase 3: Forge Separation (Sprint 5-6)
- Monorepo restructure (packages/shared, packages/agnes, packages/forge)
- Soul Bridge Cloud Function
- Code execution sandbox (Cloud Run Jobs)
- Forge Comms + Docs modes

### Phase 4: Deepen Core (Sprint 7+)
- RAG/semantic memory for Therapy
- Wearable integration for Trainer (Apple Health)
- Calendar integration for Atlas (iCal import → Google OAuth)
- `enhanceContext()` refactor to accept `targetModule` for privacy-filtered NSV

---

## Reference Documents

| Document | Location | Content |
|----------|----------|---------|
| Position Paper M1 | `docs/POSITION_PAPER_M1.md` | PM analysis: Atlas/Forge/Pulse |
| UX State Visibility Spec | `docs/ux-state-visibility-spec.md` | Full component specs for state display |
| Architecture Spec M1 | `docs/architecture/ARCH_SPEC_M1.md` | Atlas/Forge/Pulse architecture |
| Architecture Spec (detailed) | `plans/architecture-spec-atlas-forge-pulse.md` | 55KB detailed architecture |
| LLM Architecture Spec | `plans/LLM_ARCHITECTURE_SPEC.md` | Persona redesigns, action systems |
| LLM State Flow Spec | `plans/LLM_STATE_FLOW_SPEC.md` | Read/write permissions, behavioral matrix, prompt fragments |
| State Ownership Charter | `plans/STATE_OWNERSHIP_CHARTER.md` | NSV ownership rules, cascade rules, concurrency |
| State Flow Architecture | `plans/STATE_FLOW_ARCHITECTURE.md` | Technical state flow, enforcement, Forge bridge |

---

*This document represents the synthesized consensus of all specialist agents across two cross-functional meetings.*
