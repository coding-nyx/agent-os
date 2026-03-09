# Atlas Predictive Review & Energy-Wave Flattening Service

## 1. Objective & User Problem
- **Problem**: Users spike their cognitive/physical load (deadlines, fragmented plans, poor recovery) and get late burnout warnings. Atlas currently reacts to cascade events but lacks forward-looking predictions and automated flattening of “energy waves.”
- **Goal (Sprint S1-009)**: Design a predictive service that monitors NSV + task graph + recovery windows to (a) forecast overload/burnout risk and (b) pre-emptively flatten energy waves via task/recovery adjustments and cross-module nudges.

## 2. Scope (MVP)
- **In scope**: Risk state machine, signals & thresholds, prediction cadence, outputs/API surface (Spine + service methods), success metrics, risks/guardrails.
- **Out of scope**: Model training code, UI polish beyond existing EnergyWave overlay, long-term storage implementation (spec only).

## 3. Inputs
- **NSV Signals (read-only for Atlas)**  
  - Cognitive/planning: `energyBudget`, `focusScore`, `activeLoad`, `planningLoad`, `taskCompletionRate`, `deadlinePressure`, `streakHealth`  
  - Biological (Titan): `sleepQuality`, `cnsFatigue`, `hrvScore`, `restfulness`  
  - Emotional (Agnes): `emotionalResilience`, `stressLevel`  
  - Resource (Ledger): optional financial stress flag
- **Task Graph** (`AtlasTaskNode`): `energyCost (0-10)`, `status`, dependencies → used to compute scheduled/queued load and to propose deferrals.
- **Recovery Windows** (`RecoveryWindow`): planned/active windows and overlap checks → used to guard schedule modifications and to extend windows.
- **Historical windows (design requirement)**: rolling 14-day aggregates of key NSV fields + task completion rate for trend-aware predictions (not implemented yet; storage layer TBD).

## 4. State Machine (Predictive Risk)
- **States**: `HEALTHY` → `AT_RISK` → `ALERT` → `CRISIS` (absorbing until manual clear or resilience rebound).  
- **Entry Conditions (evaluated per cadence)**:  
  - **HEALTHY**: default; <2 warning signals.  
  - **AT_RISK (Yellow)**: ≥2 warning signals OR 1 critical.  
  - **ALERT (Orange)**: ≥3 warning signals OR any “compound” pattern (e.g., `planningLoad ≥8` AND `deadlinePressure ≥8`).  
  - **CRISIS (Red)**: cascade already emitted `CRISIS_MODE` or `BURNOUT_WARNING`, or 4+ signals including any biological + emotional + planning combo.  
- **Exit/Downgrade**: requires 2 consecutive evaluations below thresholds AND no open cascade alerts for that tier.  
- **Signals & Thresholds (initial)**:  
  - `planningLoad ≥ 8` (critical)  
  - `deadlinePressure ≥ 8` (critical)  
  - `cnsFatigue ≥ 8` (critical)  
  - `emotionalResilience ≤ 3` (critical)  
  - `energyBudget < 0.4` (warning)  
  - `focusScore < 0.5` (warning)  
  - `taskCompletionRate < 0.6` over trailing 7 days (warning)  
  - `sleepQuality < 5` (warning)  
  - `streakHealth < 5` (warning)  
  - `activeLoad > energyBudget * 1.2` (warning)
- **Actions by State**:  
  - **HEALTHY**: no-op; optional micro-optimizations.  
  - **AT_RISK**: propose minor deferrals; reinforce recovery windows; soft notifications.  
  - **ALERT**: trigger `FLATTEN_ENERGY_WAVE`; defer non-critical tasks; extend recovery windows (+0.5–1 day); delegate candidates; notify Agnes/Titan for support/rest.  
  - **CRISIS**: hard block high-intensity tasks; enforce recovery windows; emit `CRISIS_MODE` continuation; escalate to Agnes/Titan; lock new commitments.

## 5. Cadence & Evaluation
- **Cadence**: run every 2 hours or on significant event deltas (Spine: NSV update, deadline crunch, burnout warning, biomarker commit).  
- **Lookbacks**:  
  - Short: last 24h NSV deltas (fatigue spikes, sleep drop).  
  - Medium: trailing 7-day completion rate and planningLoad average.  
  - Long: trailing 14-day energyBudget vs. activeLoad trend (design requirement; needs storage).

## 6. Outputs & Effects
- **Risk Assessment Object** (persisted in Atlas profile):  
  ```ts
  {
    state: 'HEALTHY' | 'AT_RISK' | 'ALERT' | 'CRISIS',
    signals: [{ name, value, threshold, severity }],
    confidence: 0-1,
    recommendedUntil: ISOString, // next evaluation or recovery end
    generatedAt: ISOString
  }
  ```
- **Energy-Wave Flattening Plan**: list of actions (`defer`, `delegate`, `extend_recovery`, `reduce_scope`, `block_high_intensity`) with target task IDs or window IDs and rationale.
- **Spine Events**:  
  - Emitted: `FLATTEN_ENERGY_WAVE`, `ATLAS_PREDICTIVE_ALERT`, `ATLAS_RISK_STATE_CHANGED`, optional `DELEGATION_REQUEST`, `RECOVERY_EXTENDED`.  
  - Consumed: `BURNOUT_WARNING`, `PLANNING_OVERLOAD`, `DEADLINE_CRUNCH`, `BLOCK_HIGH_INTENSITY`, `SOMA_BIOMARKER_COMMITTED`, `VITAL_UPDATED`.
- **UI Hooks**: extend existing `EnergyWaveChart` overlay with predicted flattened window and recommended recovery blocks (no code in this spec).

## 7. API Surface (proposed)
- **Service**: `AtlasPredictiveService`
  - `evaluateRisk(context): RiskAssessment`  
    - Inputs: NSV snapshot, task graph, recovery windows, historical aggregates.  
  - `generateFlatteningPlan(assessment): FlatteningPlan`  
    - Inputs: RiskAssessment + task graph + recovery windows.  
  - `applyPlan(plan): SpineEvent[]`  
    - Outputs: Spine events to emit (no direct mutations).  
  - `recordOutcome(assessment, plan, result): void`  
    - Stores success/failure for metric tracking.  
  - `getCurrentState(): RiskAssessment` (cached/latest).
- **Spine Integration**: subscribe to NSV updates, cascade alerts, and task changes; emit state changes and flattening directives.
- **Data Contract Notes**: historical aggregates stored per day: `{ date, avgPlanningLoad, avgEnergyBudget, completionRate, avgSleepQuality, avgFocusScore }`.

## 8. Success Metrics (MVP)
- **Predictive quality**: ≥20% lift in early detection (Alert/At-Risk) before burnout cascade vs. baseline month.  
- **Action effectiveness**: ≥15% reduction in high-intensity task collisions with recovery windows; ≥10% improvement in trailing 7-day `taskCompletionRate` after flattening.  
- **User safety**: <5% false “Crisis” rate (downgrades within 24h without incident).  
- **Engagement**: ≥30% of alerts lead to at least one accepted flattening action.

## 9. Risks & Mitigations
- **False positives / alert fatigue** → start conservative thresholds; require multi-signal concurrence; cool-downs between alerts.  
- **Data gaps (no history yet)** → backfill with last known snapshot; degrade gracefully to point-in-time thresholds.  
- **Conflicting module actions** (Agnes/Titan/Atlas) → Spine priority: `CRISIS > ALERT > AT_RISK`; only one active flattening plan at a time.  
- **Task graph staleness** → require freshness check (<15m) before applying plans; otherwise request re-sync.  
- **Over-extension of recovery** → cap auto-extensions to +24h in 7d unless user confirms.

## 10. Phase Plan
- **Phase 1 (MVP)**: Implement service scaffolding, state machine thresholds, point-in-time evaluation, Spine emit/consume, plan generator with defer/extend/delegate actions, persistence of RiskAssessment.  
- **Phase 2**: Add 14d historical aggregates + trend features; adaptive thresholds; UI overlays for task/recovery.  
- **Phase 3**: Personalization (user baselines), contextual patterns (day-of-week fatigue), A/B metric loops.

## 11. Open Questions
- Do we require user consent for auto-delegation, or only suggest?  
- How to prioritize which tasks to defer (deadline proximity vs. energy cost vs. strategic value)?  
- What is the SLG/SLO for evaluation latency after key Spine events?
