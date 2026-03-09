# Ledger Behavioral Analysis: Spending–Emotion Correlation (Design)

## 1) Core User Problem
- Users experience financial behaviors (impulse spending, avoidance of bills, variability in discretionary spend) that correlate with emotional and biological states (stress load, sleep quality, cognitive energy). Today, Ledger captures budgets/goals and parses statements, but it does not turn those cross-state patterns into timely interventions.
- Goal: Detect and surface spend–emotion correlations and convert them into actionable, low-friction guidance that respects user consent and state safety.

## 2) Current State (Reference)
- **Ledger data model:** `LedgerIntakeProfile` stores income, fixed/variable expenses, debt, savings goals, plans, and document-analysis metadata (`ledger-intake-service.ts`). No persistent transaction store; statement parsing enriches expenses and metadata.
- **Actions (ActionHub) already registered (`ledger/actions`, `lib/actions/action-hub.ts`):**
  - `update_budget_snapshot`, `create_financial_plan`, `log_transaction_summary`, `analyze_financial_document`, `update_financial_friction`, `compute_resonance_roi`, field CRUD.
  - NSV writes via `updateGlobalSoul` for `financialFriction`/`resonanceROI`; Spine events emitted for financial stress/plan changes.
- **NSV signals available (`lib/types.ts`, `nsv-prompt-fragments.ts`):**
  - Emotional: `stressLoad`, `emotionalResilience`, `moodTrend`, `traumaMarkers`
  - Biological: `cnsFatigue`, `sleepQuality`, `recoveryScore`, `hormonalContext`
  - Cognitive: `energyBudget`, `focusScore`, `activeLoad`, `planningLoad`
  - Resource: `financialFriction`, `resonanceROI` (Ledger-owned outputs)
- **Telemetry/Eventing:** `Spine` bus logs events (alerts/critical) to Firestore; cascades allowed. No dedicated analytics pipeline beyond Spine logging.
- **Feature flags:** No active flags; `remoteconfig.template.json` is empty. Gating today is implicit (module access + NSV thresholds in prompts).

## 3) Scope & Phasing
- **MVP (this sprint):**
  - Derive lightweight behavioral features from existing inputs (budget snapshot, document-analysis summaries, transaction summaries provided inline) without adding a full transaction datastore.
  - Detect and surface 2–3 high-signal correlations (stress-driven spikes, sleep-degraded decision windows, avoidance of obligations).
  - Emit actionable guidance (one next action + one follow-up), update NSV resource signals, and broadcast Spine events for cross-module coordination.
  - Respect consent + safety: explicit toggle + state gating.
- **Out of scope (future):**
  - Building a full transaction warehouse or per-transaction timeline UI.
  - External bank connectors.
  - Longitudinal ML models; stick to deterministic heuristics first.

## 4) Data Inputs
- **Financial inputs (existing):**
  - Budget/expense/debt/savings from `LedgerIntakeProfile`.
  - Statement-derived summaries from `analyze_financial_document` payloads (period label, transaction count, categorized expenses).
  - Ad-hoc `log_transaction_summary` text (LLM-produced summaries).
- **State inputs (from `ActionContext.getLatestNSV` and prompt injection):**
  - Emotional: `stressLoad`, `emotionalResilience`, `moodTrend`
  - Biological: `sleepQuality`, `cnsFatigue`, `recoveryScore`, `hormonalContext`
  - Cognitive: `energyBudget`, `activeLoad`
- **User-provided context:** Recent goals/plan state, document analysis periods (for aligning time windows).

## 5) Proposed Features (MVP)
1) **Correlation Heuristics (deterministic)**
   - **Stress-driven spend spike:** If `stressLoad >= 7` and variable spend growth > X% vs prior period (from latest document analysis summary), flag risk of stress spending.
   - **Sleep/energy decision risk:** If `sleepQuality <= 4` or `cnsFatigue >= 8` and discretionary spend within last period > threshold share of income, recommend deferring complex financial decisions.
   - **Obligation avoidance:** If debt minimums or fixed bills rise (>10%) while `emotionalResilience <= 3`, flag avoidance risk.
   - **Resonance ROI degradation:** If computed ROI < 0.4 with rising friction, suggest reallocation audit.

2) **Actionable Response**
   - Output: one prioritized next action (e.g., “lock discretionary at $X for 7 days”, “set minimum autopay”, “create micro-buffer transfer”) plus a short explanation.
   - Use existing actions: `update_financial_friction`, `compute_resonance_roi`, `log_transaction_summary`.
   - Emit Spine events for cross-module awareness (`FINANCIAL_FRICTION_CHANGED`, `FINANCIAL_STRESS`).

3) **Cross-Module Coordination**
   - If `financialFriction >= 8` and `emotionalResilience <= 4` → emit `FINANCIAL_STRESS` (priority `critical`, domain `R`) for Orchestrator/Nexus to consult Agnes/Atlas.
   - Provide Atlas hint to reduce `activeLoad` by 1–2 when friction high (leveraging existing NSV consumption in Atlas prompts).

## 6) ActionHub Hooks & Contracts
- **Inputs via `ActionContext`:**
  - `payload` (financial summaries), `getLatestNSV` (state snapshot), `updateGlobalSoul` (write NSV resource metrics), `emitSpineEvent`, `delegateToModule`.
- **Actions to leverage (no new wiring required for MVP):**
  - `update_financial_friction` → write correlation-adjusted friction score (0–10) with short analysis.
  - `compute_resonance_roi` → recompute ROI alongside updated friction.
  - `log_transaction_summary` → persist a short “behavioral note” describing the correlation detected and the intervention applied.
  - `analyze_financial_document` → source for recent period spend split; reuse `periodLabel`/`transactionCount` to anchor comparisons.
- **Optional future actions (design placeholder, not implemented now):**
  - `flag_behavioral_pattern` (would store derived features) if a store for per-period features is added.

## 7) Controls, Gating, and Consent
- **Feature flag:** Add Remote Config boolean `ledger_behavioral_analysis_enabled` (default: false). Require true AND user consent to activate heuristics.
- **Consent:** UI/LLM prompt must confirm: “May I analyze spending patterns against your current state signals to tailor guidance?” If declined, skip analysis and avoid NSV writes.
- **Safety gating:** If `emotionalResilience <= 2` or `stressLoad >= 9`, limit to validation + single low-effort action; avoid complex recommendations.
- **Data minimization:** Use period summaries; do not store raw transactions in MVP.

## 8) Metrics & Telemetry
- **Eventing (Spine → Firestore):**
  - `FINANCIAL_FRICTION_CHANGED` (already emitted) — include `correlationBasis: ["stress_load", "sleep_quality"]`.
  - `FINANCIAL_STRESS` (alert/critical) when dual-domain risk detected.
  - Optional new event (future): `SPENDING_EMOTION_CORRELATED` (domain `R`, priority `info`) to log detection without raising alerts.
- **Product KPIs (MVP):**
  - Detection rate (% sessions where a correlation heuristic triggers).
  - User acceptance rate of suggested action (% of sessions where user confirms/does not decline).
  - Friction delta over 14 days post-intervention.
  - ROI delta post-intervention.
- **Quality guardrails:**
  - Cap to 1 correlation notice per session unless friction worsens by ≥1.5 points.
  - Do not surface correlations if NSV data is older than 24h (stale signal).

## 9) User Stories (MVP) with Acceptance Criteria
1) **Stress-driven spend detection**
   - **Given** Ledger has a recent document analysis with variable spend higher than the prior period **and** NSV shows `stressLoad >= 7`
   - **When** the user opens a Ledger session in general mode
   - **Then** Ledger surfaces a single stress-spend insight, emits `update_financial_friction` with a score + short rationale, and logs a `log_transaction_summary` note tied to the period.

2) **Sleep/energy decision risk**
   - **Given** NSV shows `sleepQuality <= 4` or `cnsFatigue >= 8` **and** discretionary spend share exceeds a configurable threshold
   - **When** Ledger produces recommendations
   - **Then** it simplifies to one decision, avoids complex option trees, and emits a Spine event only if friction crosses 7+.

3) **Dual-domain escalation**
   - **Given** `financialFriction >= 8` **and** `emotionalResilience <= 4`
   - **When** Ledger finishes the assessment
   - **Then** it emits `FINANCIAL_STRESS` (priority `critical`) with `domain: "R"` and pings Atlas/Agnes via Nexus delegation (per NSV prompt rules) without exposing raw NSV numbers to the user.

4) **Consent enforcement**
   - **Given** behavioral analysis is flag-enabled
   - **When** the user has not consented to cross-state analysis
   - **Then** Ledger asks for consent once, skips NSV-driven correlations if declined, and does not write NSV/Spine events from correlations.

5) **Staleness guard**
   - **Given** the latest NSV snapshot is older than 24h
   - **When** Ledger is about to run correlations
   - **Then** it refrains from correlation-based recommendations and instead requests a fresh check-in.

## 10) Implementation Notes (for Dev/QA)
- **Data handling:** Use existing `LedgerIntakeProfile` + `analyze_financial_document` payload for period-over-period comparisons; avoid new persistence tables in MVP.
- **Computation placement:** House heuristics in Ledger service layer (e.g., extend `ledger/services`) and call from the Ledger module entry flow after loading profile + NSV snapshot.
- **ActionHub usage:** Reuse existing actions; no schema changes required. Ensure `ActionContext.getLatestNSV` is wired when executing Ledger actions in chat runtime.
- **Testing:** Mock NSV states and payloads in unit tests; verify Spine emissions are debounced (Spine bus already debounces by type/source).
- **UX copy:** Insight phrasing must avoid raw NSV numbers; map to qualitative statements (per NSV prompt fragments).

## 11) Open Questions / Risks
- Do we need to persist per-period derived features for trendlines, or is on-the-fly compute sufficient for now?
- What is the threshold for “variable spend growth” without raw transaction history? (Proposal: use latest document analysis deltas; if unavailable, skip insight.)
- Should we introduce a lightweight transaction sample store for the last N records to improve precision, or keep summaries only?
- Consent UX location: chat prompt vs. settings toggle — align with privacy policy.

---
Status: ✅ Done
