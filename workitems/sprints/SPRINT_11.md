# SPRINT 11 — Ledger Sprint 2: Intelligence & Shell Unification

**Status:** COMPLETED  
**Objective:** Elevate Ledger from a functional data tracker to an intelligent financial command centre. Unify the fragmented Dashboard/Workspace UX into a single coherent shell, complete the savings projection model, implement tax strategy tracking, and activate the cross-module intelligence layer that correlates spending with wellness.

**Follows from:** Ledger Sprint 0 (build fixes, type model, aggregation service) + Ledger Sprint 1 (budget actuals, AI actions, debt strategist, smart alerts, spending trends, income sources, auto-categorization).

**Sprint 10 (Platform Core) starts after this sprint closes.**

---

## Items

### S2-L-001 — Unified Ledger Shell (P0)
**Goal:** Replace the two-tab `dashboard | workspace` structure with a single 5-tab shell. Eliminates the mental model split — users no longer switch between "Dashboard" and "Workspace" to see vs. do.

**New tab structure in `LedgerPage.tsx`:**
```
Overview  |  Transactions  |  Budget  |  Goals  |  Fields
```

- **Overview** — current `LedgerDashboard` content: stat cards, alert banners, cashflow chart, spending trends, debt snapshot
- **Transactions** — current `TransactionManager` tab from Workspace
- **Budget** — current `BudgetPlanner` tab from Workspace
- **Goals** — current `GoalTracker` + `DebtStrategist` tabs from Workspace
- **Fields** — current `FieldsTab` from Workspace (income sources, custom fields)

**Scope:**
- Refactor `LedgerPage.tsx`: replace `LedgerMainTab = 'dashboard' | 'workspace'` with `LedgerTab = 'overview' | 'transactions' | 'budget' | 'goals' | 'fields'`
- Inline the content of `LedgerDashboard` and `LedgerWorkspace` tabs directly into `LedgerPage` tab bodies (or keep components but render them as tab content, not nested tab groups)
- `LedgerWorkspace.tsx` nested tab group is absorbed — remove its internal tab chrome; it becomes a pure layout wrapper or is dissolved entirely
- Keep all existing props/handlers intact; just flatten the nav hierarchy
- `LedgerDashboard.tsx` and `LedgerWorkspace.tsx` remain as component files for now — don't delete them; just restructure how they're mounted

**Acceptance:** Single top-level tab bar, no nested tabs. Build passes.

---

### S2-L-002 — Savings Goal Projections (P1)
**Goal:** Complete the "Debt & Savings Modeling" backlog item. Debt payoff is done (DebtStrategist). Now add savings projection: given current `monthlyContribution` and `currentAmount`, project when each goal will be reached.

**Scope:**
- Add `computeSavingsProjection(goal: FinancialGoal): SavingsProjection` to `ledger-aggregation-service.ts`
  ```ts
  interface SavingsProjection {
    goalId: string;
    monthsToTarget: number | null;   // null if monthlyContribution = 0
    projectedCompletionDate: string | null;
    onTrack: boolean;                // true if projection hits before targetDate
    monthlyRequired: number;         // contribution needed to hit targetDate
    surplusOrDeficit: number;        // positive = ahead, negative = behind
  }
  ```
- Add a `SavingsProjectionCard` to `GoalTracker.tsx` — shows projected completion date, on-track badge, and monthly required vs actual contribution per goal
- If `targetDate` is set and the user is off-track, surface as a `goal_stale` alert (already wired in `evaluateAlerts`)

**Acceptance:** Each goal card in GoalTracker shows projection data. Build passes.

---

### S2-L-003 — Tax Strategy & Deduction Tracker (P1)
**Goal:** Help users understand their tax position and track deductible spending throughout the year.

**Scope:**
- Add `TaxCategory` values already defined in `ledger-intake-service.ts` as the categorization backbone
- Create `src/modules/ledger/components/TaxTracker.tsx`:
  - Summary: estimated taxable income, estimated deductions, estimated tax liability (simplified: income × effective rate bracket)
  - Deduction breakdown: list transactions tagged with `taxCategory` grouped by category (mortgage_interest, charitable, medical, business_expense, etc.) with totals
  - Tax year selector (current year default)
  - "Tag transactions" CTA: links to Transactions tab with tax category filter pre-applied
  - Disclaimer: "Estimates only — consult a tax professional"
- Add `computeTaxSummary(transactions, profile, taxYear)` to `ledger-aggregation-service.ts`
  - Taxable income = sum of income transactions for year
  - Deductions = sum of expense transactions with a `taxCategory` set
  - Effective rate: simple bracket lookup (10/12/22/24/32/35/37% US brackets as default, overrideable)
  - Returns: `{ taxableIncome, totalDeductions, estimatedTax, effectiveRate, deductionsByCategory }`
- Mount `TaxTracker` as a sub-section within the **Overview** tab (collapsible panel, collapsed by default) OR as a dedicated tab — designer's call based on content volume

**Acceptance:** Tax summary renders with real transaction data. Build passes.

---

### S2-L-004 — Cross-Verification Engine (P1)
**Goal:** Correlate encrypted spending events with Spine-reported wellness shifts. Surface insights like "your spending increases 23% during high-stress weeks."

**Scope:**
- `src/modules/ledger/services/ledger-cross-verification-engine.ts` already exists — read it first
- Implement `correlateSpendingWithWellness(transactions, spineEvents, globalSoul)`:
  - Group transactions by week
  - For each week, pull NSV stress/fatigue/mood proxies from `globalSoul.biological` + `globalSoul.emotional`
  - Compute Pearson correlation coefficient between weekly spend and stress score
  - Identify "stress spending weeks" (spend > 1.5× median AND stress > 0.6)
  - Return: `{ correlationScore, stressSpendingWeeks, averageSpendHighStress, averageSpendLowStress, insight: string }`
- Add `BehavioralInsightsPanel.tsx` already exists in components — wire it to real correlation data
- Emit Spine `RISK_DETECTED` with `priority: 'alert'` when correlation score > 0.7
- Surface the insight string in the Overview tab below smart alerts

**Acceptance:** BehavioralInsightsPanel shows real correlation. Build passes.

---

### S2-L-005 — Ledger Schema Hardening (P2)
**Goal:** Replace keyword-based field validation with LLM-driven semantic validation for custom fields.

**Scope:**
- Read `src/modules/ledger/actions/ledger-field-actions.ts` — find where keyword validation currently runs
- Replace with a call to the AI engine: `validateFieldValue(fieldName, value, moduleContext)` — sends a single structured prompt asking "Is this a valid value for {field}? Reply with {valid: bool, correctedValue?: string, reason?: string}"
- Cache validation results in `sessionStorage` for the same `(field, value)` pair to avoid redundant calls
- Fallback to keyword validation if AI call fails (graceful degradation)
- Module context for Ledger: "strict numeric validation for amounts, flexible text for descriptions, ISO dates for date fields"

**Acceptance:** Custom field validation uses LLM for semantic check with keyword fallback. Build passes.

---

## Dependency Order

```
S2-L-001 (Shell)     — start first, unblocks mental model for all others
S2-L-002 (Savings)   — parallel with S2-L-003, S2-L-004
S2-L-003 (Tax)       — parallel, mounts in Overview after S2-L-001
S2-L-004 (Cross-Verify) — parallel, reads existing engine file
S2-L-005 (Schema)    — last, lowest risk
```

---

## Out of Scope
- Document Intelligence / Receipt parsing (depends on Sprint 10 S10-003 shared lib)
- Direct tax filing integration
- Investment portfolio tracking
