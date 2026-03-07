# AGNES — State Ownership Charter v1.1

> **Status:** RATIFIED — Binding for all module development  
> **Author:** Product Management (Milestone 2)  
> **Scope:** NSV ownership, cascade rules, data flow governance, conflict resolution, concurrency model  
> **Applies to:** Orchestrator, Agnes, Titan, Soma, Atlas, Scout, Ledger, Forge, Bridge  
> **Supersedes:** Implicit ownership in `nsv-ownership.ts` (which must be updated to match this document)  
> **Amendments (v1.1):** Added §2.3 Read Access Tiers, §2.4 Staleness Thresholds, §6.5 Cross-Domain Cascade Rules, §6.6 Cascade Priority, §7a Conflict Resolution, Laws 5a/5b Concurrency Model

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [NSV Ownership Matrix](#2-nsv-ownership-matrix)
3. [Atlas Expansion — Planner Metrics](#3-atlas-expansion--planner-metrics)
4. [Forge Separation — Cross-Product State](#4-forge-separation--cross-product-state)
5. [Scout Absorbing Pulse — Interest Domain](#5-scout-absorbing-pulse--interest-domain)
6. [Cascade Rule Review — New Rules](#6-cascade-rule-review--new-rules)
7. [Data Flow Principles](#7-data-flow-principles)
8. [Implementation Checklist](#8-implementation-checklist)
9. [Appendix: Migration from Current State](#appendix-migration-from-current-state)

---

## 1. Executive Summary

### The Problem

The NSV (Neural State Vector) is AGNES's nervous system — 4 domains, 14+ metrics, updated by 7+ modules in real-time. Without enforceable ownership rules, we risk:

- **Data races:** Two modules writing `cognitive.activeLoad` simultaneously
- **Phantom state:** A module reading stale data because another module overwrote it silently
- **Cascade storms:** Circular event chains when ownership boundaries are unclear
- **Regression traps:** Atlas expansion or Scout absorbing Pulse introduces new metrics with no ownership declaration

### The Solution

This charter establishes **three iron laws**:

1. **Single Writer Principle:** Every NSV field has exactly ONE module that can write to it. Period.
2. **Explicit Read Declaration:** Every module declares which foreign fields it reads and why.
3. **Orchestrator Override Protocol:** `sync_vitals` can write anywhere, but ONLY during calibration or system recovery — never during normal operation.

### Module Lineup (Post-Restructure)

| Module | Role | NSV Domain | Status |
|--------|------|------------|--------|
| **Orchestrator** | System router, cross-domain synthesis | `system` (no owned fields) | Active |
| **Agnes** | Emotional domain authority (therapist) | `emotional.*` | Active — Core |
| **Titan** | Physical performance domain | `biological.cns*`, `biological.sleep*` | Active — Core |
| **Soma** | Biological source of truth (medical) | `biological.recovery*`, `biological.hormonal*` | Active |
| **Atlas** | Cognitive planner (expanded from energy-only) | `cognitive.*` + NEW `planning.*` | **Expanding** |
| **Scout** | Research + Interest tracking (absorbs Pulse) | `cognitive.researchLoad` + NEW interest fields | **Expanding** |
| **Ledger** | Financial domain authority | `resource.*` | Active — Core |
| **Forge** | Technical extension (separating to own product) | **None in AGNES NSV** | **Separating** |
| **Bridge** | Alert routing daemon | None (read-only consumer) | Active — Daemon |
| ~~Pulse~~ | ~~Interest extension~~ | ~~None~~ | **REMOVED — absorbed into Scout** |

---

## 2. NSV Ownership Matrix

### 2.1 Complete Ownership Table

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                          NEURAL STATE VECTOR — OWNERSHIP MAP                                 │
│                                                                                              │
│  Legend:  (existing) = already implemented    (PROPOSED) = to be added by this charter        │
├────────────┬───────────────────────────────┬──────────┬──────────────────────────────────────┤
│ Domain     │ Field                         │ Owner    │ Product Justification                │
├────────────┼───────────────────────────────┼──────────┼──────────────────────────────────────┤
│            │ cnsFatigue (0-10)             │ TITAN    │ CNS fatigue is a training output.    │
│ BIOLOGICAL │ sleepQuality (0-10)           │ TITAN    │ Sleep directly impacts performance.  │
│ (B)        │ recoveryScore (0-10)          │ SOMA     │ Medical recovery = medical authority.│
│            │ hormonalContext (text)         │ SOMA     │ Hormonal data is clinical-grade.     │
├────────────┼───────────────────────────────┼──────────┼──────────────────────────────────────┤
│            │ emotionalResilience (0-10)    │ AGNES    │ Resilience is a therapeutic metric.  │
│ EMOTIONAL  │ stressLoad (0-10)             │ AGNES    │ Stress assessment = therapy domain.  │
│ (E)        │ moodTrend (text)              │ AGNES    │ Mood tracking is core therapy.       │
│            │ traumaMarkers (string[])      │ AGNES    │ Trauma data is clinically sensitive.  │
├────────────┼───────────────────────────────┼──────────┼──────────────────────────────────────┤
│            │ energyBudget (0-10)           │ ATLAS    │ Energy is a planning input.          │
│            │ focusScore (0-10)             │ ATLAS    │ Focus determines task capacity.      │
│ COGNITIVE  │ activeLoad (0-10)             │ ATLAS    │ Task load is Atlas's core output.    │
│ (C)        │ planningLoad (0-10)           │ ATLAS    │ (existing) Open-loop + planning      │
│            │                               │          │  complexity. >8 triggers compression.│
│            │ taskCompletionRate (0-1)      │ ATLAS    │ (existing) Rolling 7-day ratio of    │
│            │                               │          │  completed to scheduled tasks.       │
│            │ researchLoad (0-10)           │ SCOUT    │ Research intensity is Scout's domain.│
│            │ interestDiversity (0-10)      │ SCOUT    │ (PROPOSED) Breadth of active         │
│            │                               │          │  interests across knowledge domains. │
├────────────┼───────────────────────────────┼──────────┼──────────────────────────────────────┤
│            │ streakHealth (0-10)           │ ATLAS    │ (PROPOSED) Habit streak composite.   │
│ PLANNING   │ deadlinePressure (0-10)       │ ATLAS    │ (PROPOSED) Urgency of nearest        │
│ (P)        │                               │          │  deadlines.                          │
├────────────┼───────────────────────────────┼──────────┼──────────────────────────────────────┤
│ RESOURCE   │ financialFriction (0-10)      │ LEDGER   │ Financial stress = Ledger's domain.  │
│ (R)        │ resonanceROI (0-1)            │ LEDGER   │ Spending-to-wellness ratio.          │
└────────────┴───────────────────────────────┴──────────┴──────────────────────────────────────┘
```

> **Note on existing vs. proposed fields:**
> - `cognitive.planningLoad` and `cognitive.taskCompletionRate` already exist in the NSV type (`types.ts:90-92`) and are mapped to Atlas in `nsv-ownership.ts`. They serve as Atlas's current planning footprint within the cognitive domain.
> - The PROPOSED `planning.*` domain (with `streakHealth` and `deadlinePressure`) and `cognitive.interestDiversity` are NEW fields to be added. The implementation checklist in §8 details the exact code changes required.
> - The original planning metrics (`planAccuracy`, `activePlanCount`) from earlier drafts are SUPERSEDED by the existing `taskCompletionRate` and `planningLoad` fields respectively — no need to duplicate what already works.

### 2.2 Per-Module Ownership Cards

---

#### 🧠 AGNES (Emotional Domain Authority)

**Exclusive Writes:**
- `emotional.emotionalResilience` — Assessed via therapeutic dialogue; no other module has the clinical context to score this.
- `emotional.stressLoad` — Composite of life stressors surfaced in therapy sessions.
- `emotional.moodTrend` — Longitudinal mood trajectory derived from session sentiment analysis.
- `emotional.traumaMarkers` — Clinically sensitive identifiers; MUST be vault-locked.

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `biological.cnsFatigue` | Titan | High CNS fatigue contextualizes emotional exhaustion vs. physical exhaustion. |
| `biological.sleepQuality` | Titan | Sleep deprivation directly impacts emotional regulation. |
| `cognitive.activeLoad` | Atlas | Task overload causes stress — Agnes needs to distinguish task-stress from emotional-stress. |
| `resource.financialFriction` | Ledger | Financial anxiety is a top-3 therapy topic. Agnes needs financial context. |
| `planning.deadlinePressure` | Atlas | Deadline anxiety presents as stress; Agnes must know if stress is planning-driven. |

**NEVER Touches:**
- `biological.recoveryScore` — Medical data belongs to Soma.
- `cognitive.energyBudget` — Energy allocation is Atlas's domain.
- `resource.resonanceROI` — Financial metrics are Ledger's domain.

**Conflict Resolution:**
- If Agnes detects that `stressLoad` should be higher based on therapy, but Titan's `cnsFatigue` suggests physical origin → Agnes writes `stressLoad` as-is (emotional assessment), and documents the physical-stress hypothesis in session notes. The orchestrator synthesizes the full picture.

---

#### 🏋️ TITAN (Physical Performance Domain)

**Exclusive Writes:**
- `biological.cnsFatigue` — Derived from training load, perceived exertion, and recovery windows.
- `biological.sleepQuality` — Self-reported sleep score, validated against training readiness.

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `biological.recoveryScore` | Soma | Must respect medical clearance before prescribing intensity. |
| `biological.hormonalContext` | Soma | Hormonal phase affects training prescription (e.g., luteal phase adjustments). |
| `emotional.stressLoad` | Agnes | High emotional stress → reduce training volume (allostatic load). |
| `cognitive.activeLoad` | Atlas | High cognitive load = less capacity for complex training protocols. |

**NEVER Touches:**
- `emotional.*` — Titan is not qualified to assess emotional state.
- `biological.recoveryScore` — That's Soma's clinical judgment.
- `cognitive.energyBudget` — Energy allocation is Atlas's job.
- `planning.*` — Titan consumes plans, doesn't create them.

**Conflict Resolution:**
- If Titan's training session increases `cnsFatigue` above 8, Titan writes the value. The Spine cascade (`block-intensity`) auto-fires, blocking further high-intensity prescriptions. Titan does NOT need to check the cascade — the cascade enforces the constraint externally.

---

#### 💊 SOMA (Biological Source of Truth)

**Exclusive Writes:**
- `biological.recoveryScore` — Derived from biomarkers, lab results, wearable data, and medical context.
- `biological.hormonalContext` — Phase tracking, hormonal status, cycle context. Clinically sensitive.

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `biological.cnsFatigue` | Titan | Fatigue context for medical assessment (is recovery slow due to overtraining?). |
| `biological.sleepQuality` | Titan | Sleep data informs recovery projections. |
| `emotional.stressLoad` | Agnes | Chronic stress impacts biomarkers and recovery timelines. |

**NEVER Touches:**
- `biological.cnsFatigue` — Titan owns training-derived fatigue. Soma assesses *medical* recovery.
- `emotional.*` — Soma reports biology, not emotions.
- `cognitive.*` — Outside Soma's domain entirely.

**Conflict Resolution:**
- If Soma detects a medical concern (low recovery despite adequate rest), it emits `CLEARANCE_DENIED` via the Spine. This cascades to `BLOCK_HIGH_INTENSITY` → Titan and `FLATTEN_ENERGY_WAVE` → Atlas. Soma never directly writes to Titan's or Atlas's fields — it uses the event system.

**Special Authority:**
- Soma is the **only module** that can emit `CLEARANCE_DENIED` and `CLEARANCE_GRANTED`. This is a medical gate.

---

#### 🗺️ ATLAS (Cognitive Planner — EXPANDED)

**Exclusive Writes:**
- `cognitive.energyBudget` — How much cognitive energy is available for the day.
- `cognitive.focusScore` — Current focus capacity (self-reported + inferred from task switching).
- `cognitive.activeLoad` — Number/weight of active tasks. This is Atlas's PRIMARY output.
- `cognitive.planningLoad` — **(existing)** Open-loop count + planning complexity (0-10). Values ≥8 trigger plan compression.
- `cognitive.taskCompletionRate` — **(existing)** Rolling 7-day ratio of completed to scheduled tasks (0.0-1.0).
- `planning.streakHealth` — **(PROPOSED)** Composite health score of all active habit streaks (0-10).
- `planning.deadlinePressure` — **(PROPOSED)** Urgency composite based on approaching deadlines (0-10).

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `biological.cnsFatigue` | Titan | High fatigue → reduce planned cognitive load. |
| `biological.sleepQuality` | Titan | Poor sleep → lower energy budget and focus estimates. |
| `biological.recoveryScore` | Soma | Medical recovery state affects sustainable planning horizon. |
| `emotional.stressLoad` | Agnes | High stress → simplify plans, reduce commitments. |
| `emotional.emotionalResilience` | Agnes | Low resilience → avoid ambitious goal-setting. |
| `resource.financialFriction` | Ledger | High financial friction → factor financial tasks into planning. |
| `cognitive.researchLoad` | Scout | Research tasks compete for the same energy budget. Atlas factors this into `planningLoad` assessment. |

**NEVER Touches:**
- `emotional.*` — Atlas plans tasks, it doesn't assess feelings.
- `biological.*` — Atlas consumes biological data, never produces it.
- `resource.*` — Financial metrics belong to Ledger.
- `cognitive.researchLoad` — Scout owns its own load metric.

**Conflict Resolution:**
- Atlas and Scout both write to the `cognitive.*` domain. The boundary is clean:
  - Atlas owns `energyBudget`, `focusScore`, `activeLoad` (general cognitive capacity).
  - Scout owns `researchLoad` (research-specific intensity).
- If both update simultaneously, each writes only to its own fields. No conflict possible.
- If Atlas detects `activeLoad` + `researchLoad` > `energyBudget + 2`, the cascade rule fires `COGNITIVE_OVERLOAD` (see §6).

---

#### 🔍 SCOUT (Research + Interest Domain — EXPANDED)

**Exclusive Writes:**
- `cognitive.researchLoad` — Intensity of active research tasks (0-10).
- `cognitive.interestDiversity` — **NEW** — Breadth of active interests across domains (0-10). Measures cognitive exploration breadth.

**Module-Local State (NOT in NSV):**
- `interestMomentum` — Per-topic momentum (rising/steady/cooling). This is Scout's internal state, stored in `scout_knowledge` Firestore collection. **Rationale:** Momentum is per-topic, not a single scalar — it doesn't fit the NSV's scalar model. Scout exposes a summary via `interestDiversity` in the NSV.
- `topicGraph` — Nodes and edges of the interest/knowledge graph.
- `sourceProvenance` — Claim-to-source mappings from document uploads.

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `cognitive.energyBudget` | Atlas | Research requires cognitive energy — respect the budget. |
| `cognitive.focusScore` | Atlas | Low focus → surface easier/lighter research tasks. |
| `cognitive.activeLoad` | Atlas | High task load → deprioritize speculative research. |
| `emotional.stressLoad` | Agnes | High stress → avoid overwhelming with new information. |
| `planning.deadlinePressure` | Atlas | High deadline pressure → prioritize deadline-relevant research. |

**NEVER Touches:**
- `emotional.*` — Research doesn't assess feelings.
- `biological.*` — Scout has no biological context.
- `resource.*` — Financial data is irrelevant to research.
- `cognitive.energyBudget` / `cognitive.focusScore` / `cognitive.activeLoad` — Atlas's exclusive domain.
- `planning.*` — Scout reports research load, Atlas integrates it into plans.

**Conflict Resolution:**
- Scout writes `researchLoad` independently of Atlas. If research overloads cognition, Atlas detects it via its read of `researchLoad` and adjusts `energyBudget` or emits `COGNITIVE_OVERLOAD`. Scout does NOT directly modify Atlas's metrics.

---

#### 💰 LEDGER (Financial Domain Authority)

**Exclusive Writes:**
- `resource.financialFriction` — Composite of financial stress factors (debt load, cash flow anxiety, budget pressure).
- `resource.resonanceROI` — Ratio of spending-aligned-with-values to total spending (0-1 float).

**Shared Reads:**
| Field | From | Why |
|-------|------|-----|
| `emotional.stressLoad` | Agnes | Financial planning must account for emotional capacity. |
| `emotional.emotionalResilience` | Agnes | Low resilience → avoid confrontational financial conversations. |
| `cognitive.activeLoad` | Atlas | High task load → simplify financial recommendations. |
| `planning.deadlinePressure` | Atlas | Bill deadlines factor into planning pressure. |

**NEVER Touches:**
- `emotional.*` — Ledger doesn't diagnose emotional state.
- `biological.*` — Completely outside Ledger's domain.
- `cognitive.*` — Ledger doesn't assess cognitive capacity.
- `planning.*` — Ledger provides financial input; Atlas does the planning.

**Conflict Resolution:**
- Ledger is the sole authority on financial metrics. If `financialFriction ≥ 8`, the Spine cascade emits `FINANCIAL_STRESS` → orchestrator. No other module can lower `financialFriction` — only Ledger can, based on improved financial data.

---

#### 🌐 ORCHESTRATOR (System Router — No Owned Fields)

**Exclusive Writes:**
- **None during normal operation.**

**System Override: `sync_vitals`**
- CAN write to ANY field, but ONLY in these contexts:
  1. **Initial calibration** — First-time onboarding when modules haven't set their own values yet.
  2. **System recovery** — Restoring NSV from backup after data corruption.
  3. **Cross-module resolution** — When the orchestrator must reconcile conflicting signals (rare; logged and auditable).
- Every `sync_vitals` write MUST include a `reason` field in the payload for audit trail.
- `sync_vitals` writes MUST NOT override a module's value that was updated within the last 5 minutes (staleness check).

**Shared Reads:**
- ALL fields (orchestrator is the cross-domain synthesizer).

**NEVER Does:**
- Silently overwrite a module's recently-updated field.
- Use `sync_vitals` as a shortcut during normal module operation.

---

#### ⚙️ FORGE (Separating to Own Product)

**See §4 for full analysis.**

**Exclusive Writes to AGNES NSV:** None.  
**Shared Reads from AGNES NSV:** None directly.  
**Cross-product communication:** Via a defined API gateway (not NSV).

---

#### 🔔 BRIDGE (Alert Routing Daemon)

**Exclusive Writes:** None.  
**Shared Reads:** Subscribes to Spine events (especially `BURNOUT_WARNING`, `FINANCIAL_STRESS`, `MEDICAL_ALERT`).  
**Role:** Pure consumer — routes alerts to notification channels (WhatsApp, email, push). Never modifies state.

---

### 2.3 Read Access Tiers

Not all reads are created equal. Three tiers enforce privacy boundaries:

| Tier | Access Level | Fields | Rationale |
|------|-------------|--------|-----------|
| **OPEN** | Any module may read | `cnsFatigue`, `sleepQuality`, `recoveryScore`, `energyBudget`, `focusScore`, `activeLoad`, `researchLoad`, `moodTrend`, `stressLoad`, `emotionalResilience`, `financialFriction`, `interestDiversity` | General wellness signals needed for cross-domain synthesis. |
| **DOMAIN** | Same domain modules + Orchestrator only | `hormonalContext` (BIOLOGICAL — Titan + Soma + Orchestrator), `planningLoad` (COGNITIVE — Atlas + Orchestrator), `taskCompletionRate` (COGNITIVE — Atlas + Agnes + Orchestrator), `resonanceROI` (RESOURCE — Ledger + Orchestrator) | Sensitive domain-specific data. Leaking `hormonalContext` to Scout or Forge would be a privacy violation. |
| **RESTRICTED** | Orchestrator ONLY | `traumaMarkers` | **Hard privacy boundary — non-negotiable.** Trauma-related state is clinically sensitive. Only the Orchestrator reads it for safety cascade triggers (`BURNOUT_WARNING` when compounded with high CNS fatigue). No other module — not even Agnes's therapeutic sibling modules — may access another user's trauma data cross-module. Agnes writes it, Orchestrator reads it for system safety, period. |

**Enforcement:** Read tier validation should be added to `getMetricValue()` in `nsv-ownership.ts`. Calls from unauthorized modules return `null` with an `ACCESS_TIER_VIOLATION` log entry. Forge gets OPEN-tier access only (see §4).

### 2.4 Per-Field Staleness Thresholds

Modules reading foreign fields must account for data freshness. Stale data can trigger incorrect cascades or suppress needed ones.

| Field | Max Staleness | If Exceeded | Rationale |
|-------|--------------|-------------|-----------|
| `cnsFatigue` | 18h | Orchestrator sets to `UNKNOWN`; cascade evaluations treat as mid-range (5) | CNS state changes with training/sleep cycles — 18h covers one sleep cycle. |
| `sleepQuality` | 24h | Acceptable — sleep data arrives once daily | Natural daily rhythm. |
| `recoveryScore` | 24h | Orchestrator prompts Soma to re-evaluate | Recovery is slow-moving. |
| `hormonalContext` | 72h | Acceptable — hormonal context changes on multi-day cycles | Cycle phases last days, not hours. |
| `emotionalResilience` | 12h | Orchestrator prompts Agnes to re-evaluate | Resilience shifts with daily events. |
| `stressLoad` | 6h | Orchestrator prompts Agnes — stress changes fast | Most volatile emotional metric. |
| `moodTrend` | 12h | Acceptable — trends are slow-moving by definition | Trend ≠ momentary mood. |
| `energyBudget` | 4h | Atlas should recompute frequently; Orchestrator flags if stale | Energy fluctuates through the day. |
| `focusScore` | 2h | Readers use `energyBudget` as proxy | Most volatile cognitive metric. |
| `activeLoad` | 4h | Acceptable — task load changes with task completions | Tied to task state changes. |
| `planningLoad` | 24h | Acceptable — plans don't change hourly | Planning operates on daily cycles. |
| `taskCompletionRate` | 24h | Computed once daily | Rolling 7-day metric. |
| `researchLoad` | 12h | Acceptable | Research sessions are episodic. |
| `interestDiversity` | 48h | Acceptable — interests shift slowly | Curiosity is slow-moving. |
| `streakHealth` | 24h | Acceptable — streaks measured daily | Daily habit check. |
| `deadlinePressure` | 12h | Atlas recomputes as deadlines approach | Pressure increases as deadlines near. |
| `financialFriction` | 72h | Acceptable — financial state changes slowly | Budget data is weekly/monthly. |
| `resonanceROI` | 72h | Acceptable | Computed from spending patterns. |

**Implementation:** Each NSV field's `lastUpdated` timestamp is checked by consumers. If `Date.now() - lastUpdated > maxStaleness`, the consumer logs `STALE_READ_WARNING` and either uses a fallback or prompts the owning module.

### 2.5 Ownership Summary Matrix (Quick Reference)

```
FIELD                           WRITER      READERS                                      STATUS
──────────────────────────────────────────────────────────────────────────────────────────────────
biological.cnsFatigue           TITAN       Agnes, Atlas, Soma, Orchestrator              existing
biological.sleepQuality         TITAN       Agnes, Atlas, Soma, Orchestrator              existing
biological.recoveryScore        SOMA        Titan, Atlas, Orchestrator                    existing
biological.hormonalContext      SOMA        Titan, Orchestrator                           existing
emotional.emotionalResilience   AGNES       Atlas, Ledger, Orchestrator                   existing
emotional.stressLoad            AGNES       Titan, Atlas, Scout, Soma, Ledger, Orch.      existing
emotional.moodTrend             AGNES       Orchestrator                                  existing
emotional.traumaMarkers         AGNES       Orchestrator (vault-locked)                   existing
cognitive.energyBudget          ATLAS       Scout, Orchestrator                           existing
cognitive.focusScore            ATLAS       Scout, Orchestrator                           existing
cognitive.activeLoad            ATLAS       Agnes, Titan, Ledger, Scout, Orchestrator     existing
cognitive.planningLoad          ATLAS       Agnes, Orchestrator                           existing
cognitive.taskCompletionRate    ATLAS       Agnes, Orchestrator                           existing
cognitive.researchLoad          SCOUT       Atlas, Orchestrator                           existing
cognitive.interestDiversity     SCOUT       Atlas, Orchestrator                           PROPOSED
planning.streakHealth           ATLAS       Agnes, Orchestrator                           PROPOSED
planning.deadlinePressure       ATLAS       Agnes, Scout, Ledger, Orchestrator            PROPOSED
resource.financialFriction      LEDGER      Agnes, Atlas, Orchestrator                    existing
resource.resonanceROI           LEDGER      Orchestrator                                  existing
```

---

## 3. Atlas Expansion — Planner Metrics

### 3.1 The Problem Atlas Solves Now vs. What It Must Solve

**Current Atlas** (energy manager):
- Manages `energyBudget`, `focusScore`, `activeLoad`
- Receives `FLATTEN_ENERGY_WAVE` from cascades
- Purely reactive — flattens energy when told to

**Future Atlas** (cognitive planner):
- All of the above, PLUS:
- Tracks task completion, habit streaks, planning accuracy
- Proactively emits events when planning state demands attention
- Becomes the system's "executive function" — the prefrontal cortex of AGNES

### 3.2 New Metrics — Decision Record

| Metric | Type | Domain | Decision | Rationale |
|--------|------|--------|----------|-----------|
| `planningLoad` | number (0-10) | `cognitive.*` | ✅ ALREADY EXISTS | Open-loop count + planning complexity. Already implemented in `types.ts:90` and owned by Atlas in `nsv-ownership.ts`. Values ≥8 trigger plan compression in Atlas's persona. |
| `taskCompletionRate` | float (0-1) | `cognitive.*` | ✅ ALREADY EXISTS | Rolling 7-day completion ratio. Already implemented in `types.ts:92` and owned by Atlas. Clamped 0.0-1.0 in `core-handlers.ts`. |
| `streakHealth` | number (0-10) | `planning.*` | ✅ ADD (PROPOSED) | Composite of all active habit streaks. A broken streak triggers therapeutic check-in (cascade rule). Not yet implemented. |
| `deadlinePressure` | number (0-10) | `planning.*` | ✅ ADD (PROPOSED) | Urgency composite. Cascades need this for `DEADLINE_CRUNCH` events. Not yet implemented. |
| `interestDiversity` | number (0-10) | `cognitive.*` | ✅ ADD (PROPOSED) | Scout's breadth score for active interests. Needed for Atlas planning and Agnes therapeutic signals. Not yet implemented. |
| per-habit `streakDays` | per-habit int | — | ❌ KEEP MODULE-LOCAL | Per-habit data doesn't fit scalar NSV. `streakHealth` is the composite summary. Store in `atlas_profiles`. |

### 3.3 Why `planning.*` Is a New Domain (Not More `cognitive.*` Fields)

**Decision:** Create a new `planning` domain in the NSV for the PROPOSED `streakHealth` and `deadlinePressure` metrics.

**Context:** Atlas already owns 5 of 7 `cognitive.*` fields (`energyBudget`, `focusScore`, `activeLoad`, `planningLoad`, `taskCompletionRate`). The existing `planningLoad` and `taskCompletionRate` fields were correctly placed in `cognitive.*` because they describe cognitive planning *capacity* and *throughput*.

**Rationale for separating the new metrics:**
1. **Semantic clarity.** `streakHealth` and `deadlinePressure` are not cognitive capacities — they are behavioral/temporal state. Streak health measures habit consistency (behavior), and deadline pressure measures time urgency (temporal). These are qualitatively different from "how much focus do I have?"
2. **Cascade isolation.** Proposed cascade rules for `DEADLINE_CRUNCH` and `STREAK_BROKEN` (§6) should trigger on planning-domain changes without interfering with cognitive cascade conditions.
3. **Future-proofing.** If a goal-coaching module ever splits from Atlas, it inherits `planning.*` cleanly without disrupting the existing `cognitive.*` domain.
4. **Preventing domain bloat.** Adding 2 more fields would give Atlas 7 of 9 `cognitive.*` fields, making it a mega-domain.

**Alternative considered:** Keep everything in `cognitive.*`. Rejected because it conflates cognitive capacity with behavioral/temporal state, and because cascade rules would need more complex conditions to distinguish cognitive-capacity events from planning-state events.

### 3.4 Interaction with Existing Cascades

The existing cascade rules check `cnsFatigue` and `emotionalResilience` — they do NOT check `cognitive.*` directly. Adding `planning.*` introduces no conflict with existing rules. New cascade rules for `planning.*` are defined in §6.

---

## 4. Forge Separation — Cross-Product State

### 4.1 The Core Question

> "If Forge becomes a separate product, does it read/write AGNES's NSV?"

**Answer: NO.**

### 4.2 Rationale

Forge is a *technical productivity tool* (code execution, CLI, filesystem I/O). It operates on a fundamentally different concern axis than AGNES's wellness domains:

| Concern | AGNES | Forge |
|---------|-------|-------|
| Primary metric | Human wellness (biological, emotional, cognitive, financial) | Code quality, build status, execution output |
| State lifecycle | Persistent, slowly-evolving vitals | Ephemeral, per-session execution state |
| Privacy model | Vault-encrypted wellness data | Source code, potentially shared repos |
| User identity | Personal wellness profile | Developer profile (possibly multi-user/team) |

Putting Forge metrics into AGNES's NSV would:
- Pollute the wellness signal with productivity noise
- Create a dependency that prevents Forge from operating standalone
- Violate the Single Writer Principle (who owns "productivity" — Atlas or Forge?)

### 4.3 Cross-Product Architecture

```
┌─────────────────────────┐        ┌─────────────────────────┐
│       AGNES (Wellness)  │        │     FORGE (Technical)   │
│                         │        │                         │
│  NSV: B/E/C/P/R domains │        │  FSV: Forge State Vec   │
│  Spine Event Bus        │◄──────►│  (own state, own store) │
│  Global Soul (Firestore)│  API   │  Sessions (Firestore)   │
│                         │Gateway │                         │
└─────────────────────────┘        └─────────────────────────┘
```

**Cross-Product Communication Model:**

1. **AGNES → Forge:** Atlas can send a "context hint" via API gateway (e.g., "user has low energy, suggest lighter tasks"). This is a *suggestion*, not a state write.
2. **Forge → AGNES:** Forge can send a "session summary" event (e.g., "3-hour coding session completed"). Atlas can factor this into `cognitive.activeLoad` assessment. This is an *input signal*, not a direct NSV write.
3. **Shared identity:** Same Firebase Auth user, but separate Firestore collections (`global_souls` vs. `forge_state`).
4. **No shared NSV.** Forge has its own state vector (FSV) that is NOT part of AGNES's NSV schema.

### 4.4 Forge State Vector (FSV) — Separate Document

Forge's own state (stored in `forge_state/{uid}`):

```typescript
interface ForgeStateVector {
  sessionActive: boolean;
  lastExecutionStatus: 'success' | 'error' | 'timeout';
  recentLanguages: string[];
  executionCount24h: number;
  // Forge-specific, never leaks into AGNES NSV
}
```

### 4.5 Implementation Impact

**Files to modify:**
- `nsv-ownership.ts`: Remove `forge: []` entry (Forge is no longer an AGNES module).
- `module-manifest.ts`: Mark Forge as `isCore: false, hasPage: true` with `crossProduct: true` flag, OR remove entirely if Forge becomes a separate SPA.
- `core-handlers.ts`: Remove any Forge-specific action registrations from AGNES's ActionHub.

**Decision for now (MVP):** Forge remains in the module manifest as a "linked product" tile that deep-links to the Forge SPA. No NSV integration.

---

## 5. Scout Absorbing Pulse — Interest Domain

### 5.1 What Pulse Did

Pulse tracked:
- Topic interest maps (what the user is curious about)
- News synthesis (trending topics relevant to user interests)
- Interest momentum (rising/steady/cooling per topic)

Pulse had **zero NSV fields** (`pulse: []` in `nsv-ownership.ts`). All its state was module-local.

### 5.2 What Changes When Scout Absorbs Pulse

Scout's role expands from "research tool" to "research + interest intelligence layer":

| Capability | Before (Scout only) | After (Scout + Pulse) |
|------------|--------------------|-----------------------|
| Web search | ✅ Tavily integration | ✅ Unchanged |
| Document upload | ✅ PDF/CSV/TXT pipeline | ✅ Unchanged |
| Knowledge graph | ✅ `scout_knowledge` collection | ✅ Expanded with interest nodes |
| Research load tracking | ✅ `cognitive.researchLoad` | ✅ Unchanged |
| Interest mapping | ❌ | ✅ **NEW** — absorbed from Pulse |
| Topic momentum | ❌ | ✅ **NEW** — absorbed from Pulse |
| Interest diversity score | ❌ | ✅ **NEW** — `cognitive.interestDiversity` |

### 5.3 New Scout Metric: `cognitive.interestDiversity`

**Definition:** A 0-10 score measuring the breadth and balance of the user's active interests across knowledge domains.

- **0** = Hyper-focused on a single topic (tunnel vision)
- **5** = Healthy balance of 3-5 active interest areas
- **10** = Scattered across many topics with no depth (dilettante risk)

**Why this belongs in the NSV:**
- Atlas needs `interestDiversity` to plan balanced cognitive schedules (avoid tunnel vision OR scatter).
- Agnes can use extreme values (0 or 10) as therapeutic signals (obsessive focus or avoidance behavior).
- The orchestrator uses it for cross-domain synthesis.

**Why NOT a new domain:** Interest diversity is a cognitive metric — it measures cognitive breadth. It belongs alongside `researchLoad` in `cognitive.*`.

### 5.4 Interest Momentum — Stays Module-Local

**Decision:** `interestMomentum` (per-topic rising/steady/cooling) does NOT become an NSV field.

**Rationale:**
- Momentum is per-topic, not a single scalar. NSV fields are scalars or short strings.
- No other module needs per-topic momentum in real-time. The NSV-level summary (`interestDiversity`) is sufficient for cross-module coordination.
- Detailed momentum data stays in `scout_knowledge` collection as document fields.

### 5.5 Migration Checklist (Pulse → Scout)

- [ ] Merge `pulse_profiles` Firestore data into `scout_knowledge` (or create a `scout_interests` subcollection)
- [ ] Remove `pulse` from `MODULE_IDS` in `module-manifest.ts`
- [ ] Remove `pulse: []` from `NSV_OWNERSHIP` in `nsv-ownership.ts`
- [ ] Update Scout's persona prompt to include interest-tracking responsibilities
- [ ] Add `cognitive.interestDiversity` to `NSVMetricPath` type and `NSV_OWNERSHIP.scout`
- [ ] Add calibration prompt for `interestDiversity` to `NSV_CALIBRATION_PROMPTS`
- [ ] Redirect `/pulse` route to `/scout` (with deprecation notice for 1 release)

---

## 6. Cascade Rule Review — New Rules

### 6.1 Current Rules (7 — Unchanged)

| # | ID | Trigger | Condition | Output | Target |
|---|-----|---------|-----------|--------|--------|
| 1 | `burnout-warning` | `VITAL_UPDATED` | `cnsFatigue≥8 AND resilience≤3` | `BURNOUT_WARNING` | orchestrator |
| 2 | `block-intensity` | `VITAL_UPDATED` | `cnsFatigue≥8` | `BLOCK_HIGH_INTENSITY` | titan |
| 3 | `financial-stress` | `VITAL_UPDATED` | `financialFriction≥8` | `FINANCIAL_STRESS` | orchestrator |
| 4 | `clearance-block-training` | `CLEARANCE_DENIED` | Always | `BLOCK_HIGH_INTENSITY` | titan |
| 5 | `clearance-flatten-wave` | `CLEARANCE_DENIED` | Always | `FLATTEN_ENERGY_WAVE` | atlas |
| 6 | `burnout-flatten-wave` | `BURNOUT_WARNING` | Always | `FLATTEN_ENERGY_WAVE` | atlas |
| 7 | `intensity-flatten-wave` | `BLOCK_HIGH_INTENSITY` | Always | `FLATTEN_ENERGY_WAVE` | atlas |

### 6.2 New Rules (5 — Added for Planner Atlas & Scout Expansion)

| # | ID | Trigger | Condition | Output | Target | Rationale |
|---|-----|---------|-----------|--------|--------|-----------|
| 8 | `cognitive-overload` | `VITAL_UPDATED` | `activeLoad + researchLoad > energyBudget + 2` | `COGNITIVE_OVERLOAD` | orchestrator | When task + research load exceeds cognitive budget by a significant margin, alert the system. The +2 buffer prevents false alarms from minor fluctuations. |
| 9 | `deadline-crunch` | `VITAL_UPDATED` | `deadlinePressure≥8` | `DEADLINE_CRUNCH` | orchestrator | Approaching deadlines at critical pressure should alert orchestrator to potentially block non-essential module interactions. |
| 10 | `streak-broken` | `VITAL_UPDATED` | `streakHealth drops by ≥3 in a single update` | `STREAK_BROKEN` | agnes | A sudden streak collapse is a therapeutic signal — possible motivational crisis, life disruption, or avoidance. Agnes should check in. |
| 11 | `planning-overload` | `VITAL_UPDATED` | `planningLoad≥8 AND taskCompletionRate<0.4` | `PLANNING_OVERLOAD` | orchestrator | Too many open loops + low completion rate = over-commitment pattern. Orchestrator should synthesize and recommend plan compression. Uses existing `planningLoad` and `taskCompletionRate` fields. |
| 12 | `cognitive-overload-flatten` | `COGNITIVE_OVERLOAD` | Always | `FLATTEN_ENERGY_WAVE` | atlas | When cognitive overload is declared, Atlas must flatten its energy wave just like it does for burnout. |

### 6.3 New Spine Event Types Required

Add to `SpineEventType` in `src/lib/types.ts`:

```typescript
| 'COGNITIVE_OVERLOAD'    // Already exists in type but has no cascade rule — now it does
| 'DEADLINE_CRUNCH'       // NEW
| 'STREAK_BROKEN'         // NEW
| 'PLANNING_OVERLOAD'     // NEW
```

### 6.4 Atlas as Event EMITTER (Not Just Receiver)

**Current state:** Atlas only RECEIVES `FLATTEN_ENERGY_WAVE`. It never emits events.

**New capability:** Atlas SHOULD emit events because it is now a planner with state-change authority:

| Atlas Emits | When | Why |
|-------------|------|-----|
| `COGNITIVE_OVERLOAD` | `activeLoad + researchLoad > energyBudget + 2` | Atlas is the module that calculates cognitive capacity — it's the right emitter. (Alternatively, the cascade rule auto-fires on `VITAL_UPDATED`.) |
| `DEADLINE_CRUNCH` | `deadlinePressure` crosses 8 | Atlas owns deadline tracking. |
| `PLANNING_OVERLOAD` | `activePlanCount≥10 AND planAccuracy<0.4` | Atlas detects over-commitment. |

**Implementation choice:** These can be either:
1. **Cascade rules** that fire on `VITAL_UPDATED` when Atlas writes its planning fields (preferred — keeps event logic centralized in `cascade-rules.ts`), OR
2. **Direct Spine.emit()** calls from Atlas's action handlers (couples event logic to module code).

**Recommendation:** Use cascade rules (option 1). This maintains the existing pattern where all reactive logic lives in `cascade-rules.ts` and modules don't need to know about the event system.

### 6.5 Cross-Domain Compound Cascade Rules

The original 7 rules and the 5 new planner rules above are single-domain. But AGNES's power is cross-domain synthesis — the moments when biological, emotional, cognitive, AND financial stress compound are the most dangerous. These rules catch those compounding patterns:

| # | ID | Trigger | Condition | Output | Target | Rationale |
|---|-----|---------|-----------|--------|--------|-----------|
| 13 | `compound-stress` | `VITAL_UPDATED` | `financialFriction ≥ 8 AND stressLoad ≥ 7` | `COMPOUND_STRESS` | agnes, orchestrator | Financial + emotional stress compounding. Agnes should elevate session priority. Orchestrator may invoke Ledger for emergency budget review. Neither domain alone triggers this — only the combination. |
| 14 | `crisis-mode` | `BURNOUT_WARNING` | `financialFriction ≥ 6` | `CRISIS_MODE` | orchestrator | Burnout + financial pressure = crisis. Orchestrator enters protective mode: minimize all non-essential agent activity, surface only urgent items, suppress research and interest tracking. This is the system's emergency brake. |
| 15 | `execution-collapse` | `VITAL_UPDATED` | `taskCompletionRate ≤ 0.3 for 3+ consecutive days` | `EXECUTION_COLLAPSE` | agnes, orchestrator | Sustained failure to complete tasks erodes emotional resilience. Agnes needs to know (therapeutic intervention). Orchestrator needs to know (systemic triage). This rule requires temporal state — Atlas must track consecutive low-completion days as internal state and emit the signal. |

**New `SpineEventType` values for cross-domain rules:**
```typescript
| 'COMPOUND_STRESS'     // NEW — financial + emotional compounding
| 'CRISIS_MODE'         // NEW — burnout + financial = emergency brake
| 'EXECUTION_COLLAPSE'  // NEW — sustained task failure (temporal)
```

**Updated totals:** 15 cascade rules. 6 new `SpineEventType` values total (3 planner + 3 cross-domain).

### 6.6 Cascade Priority When Multiple Rules Fire Simultaneously

When a single `VITAL_UPDATED` event triggers multiple cascade rules, they are processed in **safety-priority order**:

1. **`CRISIS_MODE`** — overrides everything. System enters protective state.
2. **`BURNOUT_WARNING`** / **`COMPOUND_STRESS`** — high-severity wellness alerts.
3. **`BLOCK_HIGH_INTENSITY`** / **`PLANNING_OVERLOAD`** / **`EXECUTION_COLLAPSE`** — domain-level blocks.
4. **`FLATTEN_ENERGY_WAVE`** / **`COGNITIVE_OVERLOAD`** — adjustment signals.
5. **`FINANCIAL_STRESS`** / **`DEADLINE_CRUNCH`** / **`STREAK_BROKEN`** — informational alerts.

If two rules at the same priority fire, both are processed (they target different modules). The user can explicitly override any cascade below `CRISIS_MODE` with acknowledgment — logged and auditable, but does NOT suppress future evaluations.

### 6.7 Cascade Depth Safety

With 15 rules (7 existing + 5 planner + 3 cross-domain), verify no circular cascades:

```
VITAL_UPDATED → BURNOUT_WARNING → FLATTEN_ENERGY_WAVE (terminal)
                                → CRISIS_MODE (if financialFriction≥6) (terminal)
VITAL_UPDATED → BLOCK_HIGH_INTENSITY → FLATTEN_ENERGY_WAVE (terminal)
VITAL_UPDATED → FINANCIAL_STRESS (terminal)
VITAL_UPDATED → COGNITIVE_OVERLOAD → FLATTEN_ENERGY_WAVE (terminal)
VITAL_UPDATED → DEADLINE_CRUNCH (terminal)
VITAL_UPDATED → STREAK_BROKEN (terminal)
VITAL_UPDATED → PLANNING_OVERLOAD (terminal)
VITAL_UPDATED → COMPOUND_STRESS (terminal)
VITAL_UPDATED → EXECUTION_COLLAPSE (terminal)
CLEARANCE_DENIED → BLOCK_HIGH_INTENSITY → FLATTEN_ENERGY_WAVE (terminal)
CLEARANCE_DENIED → FLATTEN_ENERGY_WAVE (terminal)
BURNOUT_WARNING → FLATTEN_ENERGY_WAVE (terminal)
BURNOUT_WARNING → CRISIS_MODE (terminal)
```

**Maximum cascade depth:** 3 (unchanged). No circular paths exist. `FLATTEN_ENERGY_WAVE` and `CRISIS_MODE` are always terminal (no rules trigger on them). ✅ Safe.

---

## 7. Data Flow Principles

### 7.1 The Six Laws of NSV State

These are **non-negotiable** rules enforced at the code level.

---

#### Law 1: Single Writer Principle

> **A module MUST NOT write to any NSV field it does not exclusively own.**

- Enforced by: `NSV_OWNERSHIP` map in `nsv-ownership.ts` + validation in action handlers.
- If a module attempts to write a field it doesn't own, the write MUST be rejected with an error log.
- **Implementation:** Add ownership validation to `updateGlobalSoul()`:

```typescript
function validateOwnership(moduleId: ModuleId, patch: NeuralStateVectorPatch): boolean {
  const owned = NSV_OWNERSHIP[moduleId];
  for (const field of extractPatchFields(patch)) {
    if (!owned.includes(field)) {
      console.error(`[NSV] OWNERSHIP VIOLATION: ${moduleId} attempted to write ${field}`);
      return false;
    }
  }
  return true;
}
```

---

#### Law 2: Orchestrator Override Is Audited

> **`sync_vitals` CAN write to any field, but MUST include a `reason` and MUST NOT overwrite values updated within the last 5 minutes.**

- The `sync_vitals` handler already exists in `core-handlers.ts:408`. It must be augmented with:
  1. A mandatory `reason` field in the payload.
  2. A staleness check against `lastUpdated` timestamps.
  3. An audit log entry to `spine_events` with type `SYSTEM_OVERRIDE`.

---

#### Law 3: Reads Are Always Free

> **Any module MAY read any NSV field at any time.**

- Reads are non-destructive. No access control on reads.
- Reads should go through `getMetricValue()` in `nsv-ownership.ts` (already exists).
- Modules SHOULD declare their reads in their system prompt (for LLM context awareness) and in this charter (for human documentation).

---

#### Law 4: Updates Are Idempotent

> **Writing the same value twice MUST produce the same state as writing it once.**

- NSV updates use Firestore's `updateDoc` with `merge: true`. Writing `{ biological: { cnsFatigue: 7 } }` twice is identical to writing it once.
- `lastUpdated` timestamps SHOULD only advance if the value actually changed. Implementation:

```typescript
if (currentValue !== newValue) {
  patch.lastUpdated[field] = new Date().toISOString();
}
```

---

#### Law 5: No Write Locks — Last Writer Wins (With Timestamps)

> **There is no write-lock mechanism. If two modules write to DIFFERENT fields simultaneously, both succeed. If two modules write to the SAME field, the Single Writer Principle prevents this — only one module owns each field.**

- **Why no write locks?** Write locks add complexity, deadlock risk, and latency. The Single Writer Principle eliminates the need for locks by design — field-level ownership means write conflicts are structurally impossible during normal operation.
- **Edge case — `sync_vitals`:** The orchestrator's system override CAN conflict with a module's write. The 5-minute staleness check (Law 2) prevents this in practice. If a true race occurs, the module's write wins (more recent, more authoritative).
- **Firestore's role:** Firestore's `updateDoc` with nested field paths is atomic at the document level. Two simultaneous patches to different fields in the same document both succeed.

---

#### Law 5a: Snapshot Reads for Cascade Consistency

> **When a module begins a computation cycle that reads multiple foreign NSV fields, it MUST take a snapshot of all needed fields atomically and compute against that snapshot.**

- **Why:** A module might read `cnsFatigue = 5`, begin computing, then by the time it reads `stressLoad`, Titan has updated `cnsFatigue = 8`. The module now has an inconsistent view.
- **Resolution:** Firestore's `getDoc()` on `global_souls/{uid}` returns the entire document atomically. Modules should read the full NSV once, extract needed fields, compute, then write their own fields.
- **Staleness check on write:** If the snapshot is >30 seconds old when the module tries to write (e.g., due to slow LLM inference), re-snapshot and recompute. This prevents stale-read cascades.

---

#### Law 5b: Write Ordering and Cascade Atomicity

> **Writes to the NSV store are queued and processed sequentially. Each write + its triggered cascades are atomic — fully resolved before the next write is processed.**

- **Why:** If Atlas writes `planningLoad = 9` and Titan writes `cnsFatigue = 8` simultaneously, the cascade evaluator needs a consistent post-write state for each.
- **Resolution:** The NSV store processes writes in FIFO order. After each write, cascade rules are evaluated against the post-write state. All triggered cascades are resolved before the next queued write is processed.
- **Event ordering:** When the Orchestrator receives events from multiple modules, it processes them in logical timestamp order (Lamport timestamps on each event). If events are concurrent (same timestamp), domain priority breaks ties: **BIOLOGICAL > EMOTIONAL > COGNITIVE > RESOURCE** (biological events are processed first because physical safety is paramount).

---

#### Law 6: Spine Events Are Fire-and-Forget

> **A module that emits a Spine event MUST NOT depend on a response. Events are one-way signals.**

- Cascade rules are applied synchronously (within the same event loop tick) but the emitting module does not await them.
- Debounce (500ms per event type+source, already implemented) prevents cascade storms.
- Max cascade depth = 3 (already enforced in `spine-event-bus.ts:51`).

---

### 7.2 Data Race Prevention Strategy

```
┌──────────────────────────────────────────────────────────────────┐
│                    DATA RACE PREVENTION                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Race Type              Prevention Mechanism                     │
│  ──────────────────────────────────────────────────────           │
│  Two modules write      IMPOSSIBLE — Single Writer Principle     │
│  same field              (only one owner per field)              │
│                                                                  │
│  sync_vitals vs.        5-minute staleness check on sync_vitals │
│  module write            (module's recent write wins)            │
│                                                                  │
│  Two patches to same    Firestore atomic document update —       │
│  document, diff fields   both succeed (no conflict)              │
│                                                                  │
│  Cascade storm           500ms debounce + max depth 3            │
│  (event loop)            (already implemented)                   │
│                                                                  │
│  Stale read              lastUpdated timestamps per field —      │
│                          consumers can check freshness           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3 Cross-Module Communication Patterns

```
ALLOWED:
  Module → writes own NSV fields → triggers VITAL_UPDATED → cascade rules fire → 
  target modules read their Spine event → react by updating their OWN fields

  Example: Titan writes cnsFatigue=9 → VITAL_UPDATED → cascade: BLOCK_HIGH_INTENSITY → 
           Titan reads event, stops prescribing intensity (behavior change, not NSV write)
           → cascade: FLATTEN_ENERGY_WAVE → Atlas reads event, lowers its own energyBudget

FORBIDDEN:
  Module A → directly writes Module B's NSV field
  Module A → calls Module B's action handler to force a write
  Module A → uses sync_vitals to bypass ownership (only orchestrator, with audit)
```

---

## 7a. Conflict Resolution — Consolidated

This section consolidates all conflict scenarios into one decision framework. If you're asking "what happens when X conflicts with Y?" — the answer is here.

### 7a.1 Same-Field Write Conflicts (Structurally Impossible)

If two modules attempt to write the same NSV field, this is a **bug, not a feature.** The `validateOwnership()` gate (Law 1) rejects the unauthorized write with an `OWNERSHIP_VIOLATION` log entry. No conflict resolution needed because conflicts are prevented by design.

```
WRITE(field, value, writer_module) →
  IF ownership_table[field] ≠ writer_module →
    REJECT + log OWNERSHIP_VIOLATION
  ELSE →
    ACCEPT → evaluate cascades
```

### 7a.2 Derived-Value Disagreements (Semantic Conflicts)

Two modules may compute different values for the same *concept* (e.g., "stress"):

- Titan computes physical stress → `cnsFatigue = 7`
- Agnes computes emotional stress → `stressLoad = 4`
- User asks: "Am I stressed?"

**Resolution: The Orchestrator synthesizes.** It does NOT pick one number. It presents the multi-dimensional view:

> "Physically, yes — your CNS fatigue is elevated from yesterday's training. Emotionally, you're in a good place — stable mood and moderate resilience. Recommendation: rest physically, you're clear for cognitive work."

**No single unified "stress number."** The domain separation IS the feature. Collapsing multi-dimensional wellness into one number destroys signal.

### 7a.3 Cascade Conflicts (Contradictory Instructions)

Two cascade rules fire simultaneously with contradictory implications. Example: `COGNITIVE_OVERCOMMIT` fires (reduce load) at the same time the user requests adding a new task.

**Resolution: Safety cascades always win.** See §6.6 for the priority order:
1. `CRISIS_MODE` → overrides everything
2. `BURNOUT_WARNING` / `COMPOUND_STRESS` → overrides non-safety signals
3. Domain-level blocks → overrides new work intake
4. Adjustment signals → adjusts intensity of existing work
5. User-initiated actions → lowest priority when competing with safety

**The user CAN explicitly override** cascades below `CRISIS_MODE` with acknowledgment: "I know I'm overcommitted, add the task anyway." This override is logged, does NOT suppress future cascade evaluations, and increments an `override_count` that Agnes may reference in therapeutic sessions ("I notice you've overridden 4 safety warnings this week...").

### 7a.4 Stale Data Conflicts

Module A reads Module B's field, but Module B hasn't updated in a long time. See §2.4 for per-field staleness thresholds.

**Resolution:** The consumer module checks `lastUpdated` against the field's max staleness. If exceeded:
1. Log `STALE_READ_WARNING` with field name and age
2. Use the stale value but flag it as `{ value: X, stale: true }` in internal computations
3. Orchestrator prompts the owning module to re-evaluate (if the owning module is responsive)
4. If the owning module is unresponsive (crashed, offline), Orchestrator may use `sync_vitals` with `reason: 'MODULE_UNRESPONSIVE'` to set the field to a safe default (mid-range for numeric fields, `UNKNOWN` for enums)

### 7a.5 Cross-Module Influence (How Module A Affects Module B's Fields)

Module A determines that Module B's field should change. This is NOT a conflict — it's a communication pattern. **The answer is always indirect:**

```
ALLOWED:
  Titan detects elevated resting HR →
  Titan emits ELEVATED_RESTING_HR event to Spine →
  Orchestrator forwards context to Agnes: "Titan reports elevated HR" →
  Agnes re-evaluates stressLoad incorporating this biological signal →
  Agnes writes stressLoad = 7 (Agnes's own field, Agnes's own decision)

FORBIDDEN:
  Titan detects elevated resting HR →
  Titan writes stressLoad = 7   ← OWNERSHIP_VIOLATION, rejected
```

**The indirection is intentional.** Module A provides *input signals*. Module B makes *write decisions*. The Orchestrator is the message bus. This ensures every field value has a single, auditable author.

---

### Phase 1: NSV Schema Update (Must Do First)

- [ ] **`src/lib/types.ts`** — Add `planning` domain to `NeuralStateVector`:
  ```typescript
  planning: {
    streakHealth: number | null;       // 0-10
    deadlinePressure: number | null;   // 0-10
  };
  ```
  > Note: `planningLoad` and `taskCompletionRate` already exist in `cognitive.*` — no changes needed for those.
- [ ] **`src/lib/types.ts`** — Add `interestDiversity` to `cognitive` domain:
  ```typescript
  /** Scout-owned: breadth of active interests across knowledge domains (0-10). */
  interestDiversity?: number | null;
  ```
- [ ] **`src/lib/types.ts`** — Add new `SpineEventType` values: `'DEADLINE_CRUNCH' | 'STREAK_BROKEN' | 'PLANNING_OVERLOAD'`.
  > Note: `'COGNITIVE_OVERLOAD'` already exists in the type union.
- [ ] **`src/lib/types.ts`** — Update `NeuralStateVectorPatch` to include `planning?` key.
- [ ] **`src/lib/types.ts`** — Update `SpineEvent.domain` union: `'B' | 'E' | 'C' | 'P' | 'R' | 'system'`.

### Phase 2: Ownership Registry Update

- [ ] **`src/lib/services/nsv-ownership.ts`** — Update `NSVMetricPath` type with new fields:
  - Add `'cognitive.interestDiversity'`
  - Add `'planning.streakHealth'`
  - Add `'planning.deadlinePressure'`
- [ ] **`src/lib/services/nsv-ownership.ts`** — Update `NSV_OWNERSHIP` map:
  ```typescript
  atlas: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad',
          'cognitive.planningLoad', 'cognitive.taskCompletionRate',
          'planning.streakHealth', 'planning.deadlinePressure'],
  scout: ['cognitive.researchLoad', 'cognitive.interestDiversity'],
  pulse: REMOVE ENTIRELY,
  forge: REMOVE ENTIRELY (or keep as empty for backward compat until Forge separation),
  ```
  > Note: Atlas already owns `planningLoad` and `taskCompletionRate` — preserve those.
- [ ] **`src/lib/services/nsv-ownership.ts`** — Add calibration prompts for new fields.
- [ ] **`src/lib/services/nsv-ownership.ts`** — Add ownership validation function (Law 1 enforcement).

### Phase 3: Cascade Rules Update

- [ ] **`src/lib/spine/cascade-rules.ts`** — Add 5 new cascade rules (§6.2).
- [ ] **`src/lib/spine/cascade-rules.ts`** — Verify no circular cascade paths (§6.5).

### Phase 4: Action Handler Updates

- [ ] **`src/lib/actions/core-handlers.ts`** — Add Atlas planning action handlers:
  - `update_streak_health`
  - `update_deadline_pressure`
  > Note: `update_planning_load` and `update_task_completion_rate` handlers already exist.
- [ ] **`src/lib/actions/core-handlers.ts`** — Add Scout interest action handler:
  - `update_interest_diversity`
- [ ] **`src/lib/actions/core-handlers.ts`** — Augment `sync_vitals` with `reason` requirement and staleness check.
- [ ] **`src/lib/actions/core-handlers.ts`** — Add ownership validation gate to all `updateGlobalSoul` calls.

### Phase 5: Module Manifest & Pulse Removal

- [ ] **`src/lib/module-manifest.ts`** — Remove `pulse` from `MODULE_IDS` and `MODULE_MANIFEST`.
- [ ] **`src/lib/module-manifest.ts`** — Update `HUB_MODULE_ORDER` (remove `pulse`).
- [ ] **`src/modules/pulse/`** — Archive or delete the Pulse module directory.
- [ ] **Router config** — Redirect `/pulse` → `/scout`.

### Phase 6: Forge Separation

- [ ] **`src/lib/module-manifest.ts`** — Mark Forge with `crossProduct: true` or extract to separate SPA.
- [ ] **`src/lib/services/nsv-ownership.ts`** — Remove `forge: []` entry.
- [ ] **API gateway** — Define cross-product communication contract (see §4.3).

### Phase 7: Firestore Schema

- [ ] **`global_souls`** — Add `planning` sub-object to stored NSV documents.
- [ ] **`global_souls`** — Add `cognitive.interestDiversity` to stored NSV documents.
- [ ] **`firestore.rules`** — Add write validation for new `planning.*` fields.
- [ ] **Migration script** — Backfill existing users with `planning: { streakHealth: null, deadlinePressure: null }` and `cognitive.interestDiversity: null`.

---

## Appendix: Migration from Current State

### What Changes (Summary)

| Area | Current | After Charter |
|------|---------|---------------|
| NSV domains | 4 (B/E/C/R) | 5 (B/E/C/P/R) — new `planning` domain |
| Total NSV fields | 16 (14 original + `planningLoad` + `taskCompletionRate`) | 19 (+2 planning, +1 interestDiversity) |
| Modules with NSV ownership | 6 (Agnes, Titan, Soma, Atlas, Scout, Ledger) | 6 (same — but Atlas & Scout expanded) |
| Modules in manifest | 10 | 8 (remove Pulse, separate Forge) |
| Cascade rules | 7 | 15 (+5 planner, +3 cross-domain) |
| Spine event types | 16 | 22 (+6 new: DEADLINE_CRUNCH, STREAK_BROKEN, PLANNING_OVERLOAD, COMPOUND_STRESS, CRISIS_MODE, EXECUTION_COLLAPSE) |
| Ownership enforcement | Implicit (map exists, no validation) | **Enforced** (validation function, audit trail, read tiers) |
| Read access control | None (all reads open) | **3-tier** (OPEN / DOMAIN / RESTRICTED) |
| Staleness monitoring | None | **Per-field thresholds** with stale-read warnings |
| Concurrency model | Implicit Firestore atomicity | **Explicit** — snapshot reads, sequential write queue, Lamport timestamps |

### What Does NOT Change

- Core ownership assignments (Agnes→emotional, Titan→bio-training, Soma→bio-medical, Ledger→resource)
- Existing 7 cascade rules (untouched)
- Spine event bus architecture (debounce, max depth, logging)
- Firestore collection structure (additive changes only)
- Bridge daemon behavior (still read-only consumer)

### Breaking Changes

1. **Pulse removal** — Any code importing from `src/modules/pulse/` will break. `/pulse` route must redirect.
2. **NSV type expansion** — `NeuralStateVector` interface gains `planning` sub-object and `cognitive.interestDiversity`. All consumers must handle `planning: undefined` and `interestDiversity: undefined` gracefully during migration.
3. **Forge separation** — If Forge is extracted to a separate SPA, all in-app references break. The module manifest entry must be handled.
4. **New cascade rules** — 5 new cascade rules will fire on existing `VITAL_UPDATED` events. Modules receiving new event types (e.g., Agnes receiving `STREAK_BROKEN`) must have listeners registered.

---

> **This charter is the source of truth for state ownership in AGNES.**  
> Any module that violates these boundaries is a bug, not a feature.  
> Changes to ownership require a charter amendment reviewed by PM + Architecture.
> 
> **19 NSV fields. 8 modules. 15 cascade rules. 3 read tiers. Zero ambiguity.**

---

*Document version: 1.1 (amended with read tiers, staleness thresholds, cross-domain cascades, conflict resolution, concurrency model)*  
*Last updated: 2025-01-20*  
*Next review: After Atlas planner implementation is complete*
