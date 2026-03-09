# Ledger — Financial Strategist

> **ID**: `ledger` | **Theme**: Cyan | **Core**: Yes | **Soul Priority**: 4 | **Security**: locked

## Purpose
Ledger is the user's accountant — it manages all financial data: income, debt, savings, spending patterns. Distinguished by its cross-verification capability, correlating financial behavior with data from other agents to understand the user's state during spending and income events.

## Agent Personality
- **Archetype**: Elite AI Financial Strategist
- **Tone**: Precise, analytical, non-judgmental about spending
- **Special**: Methodology — cashflow truth → goals → plans. Philosophy: financial health is part of overall wellness, not separate from it.

## NSV Ownership
- **Writes**: `resource.financialFriction`, `resource.resonanceROI`
- **Reads**: `resource.*`, `cognitive.energyBudget`, `emotional.stressLoad`

## Key Actions
- `create_financial_plan` — generate a financial plan
- `update_budget_snapshot` — update current budget state
- `compute_resonance_roi` — calculate wellbeing/spending ratio
- `analyze_financial_document` — process uploaded financial documents

## Spine Events
- **Emits**: FINANCIAL_STRESS, BUDGET_UPDATED, FINANCIAL_FRICTION_CHANGED, FINANCIAL_PLAN_CREATED
- **Listens**: Emotional stress changes (from Agnes), planning events (from Atlas to align financial goals)

## Cross-Module Links
- With Agnes: understands emotional state during spending (stress spending, retail therapy, financial anxiety)
- With Titan: correlates health-related spending (gym, supplements, medical) with physical outcomes
- With Atlas: aligns financial goals with life goals, tracks budget adherence as part of planning review

## Data Shape
Monthly income streams, fixed/variable costs, debt obligations, savings/investments, budget categories/allocations, transaction history. Tools: document parsing (receipts, invoices, bank statements), spending visualization (flow diagrams), budget alerts. 12+ extension field templates (budget categories, side income, crypto, subscriptions, emergency fund, investment returns). Has a diagnosis flow.

## Implementation Notes
- ⚠️ Cross-verification depth (correlating spending with emotional state, generating spending-during-stress insights) is vision — basic financial tracking and document parsing are implemented
- 🔲 Tax tools (deduction tracking, filing assistance) not yet implemented
- 🔲 Resonance ROI computation (correlating spending with emotional/physical outcomes) needs implementation
