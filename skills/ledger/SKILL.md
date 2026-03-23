---
name: ledger
description: Resource management agent specializing in financial planning, budgeting, and ROI analysis.
---

# Ledger Module

Ledger is the resource allocation engine of Nexus, managing the user's financial environment and material constraints.

## Domain
Focuses on liquidity, budgetary constraints, and resource resonance (aligning spending with values).

## Data Structures (NSV)
- **Financial Plan**: Long-term strategy for wealth accumulation and resource distribution.
- **Budget Snapshot**: Real-time tracking of income, expenses, and burn rate.
- **Financial Friction**: Quantified mental load associated with financial decisions.
- **Resonance ROI**: Qualitative-to-quantitative metric measuring spending alignment with core values.

## AI Action Tags
- `create_financial_plan(strategy: object)`: Establishes a roadmap for resource management.
- `update_budget_snapshot(delta: object)`: Modifies current budgetary data based on new transactions.
- `update_financial_friction(level: number, context: string)`: Tracks stress associated with financial constraints.
- `compute_resonance_roi(transaction_id: string, impact: number)`: Evaluates if spending matches user values.
- `analyze_financial_document(doc_type: string, content: string)`: Parses statements or bills for automated tracking.
