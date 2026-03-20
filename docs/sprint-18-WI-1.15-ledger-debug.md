# WI-1.15 — Ledger: Debug Overlay Integration

## Type
Module Integration / Debug

## Module
`src/modules/ledger/`

## Events to Log

| Event | Category | When |
|-------|----------|------|
| Ledger profile loaded | `profile` | Subscription callback |
| Ledger profile saved | `profile` | Save call |
| Transaction created/updated/deleted | `profile` | Transaction CRUD |
| Budget category modified | `profile` | Budget change |
| Financial goal update | `profile` | Goal CRUD |
| Debt item modified | `profile` | Debt CRUD |
| Receipt scan initiated | `upload` | Image capture start |
| Receipt analysis complete | `upload` | Vision API response |
| Document pipeline stage | `upload` | Each pipeline stage |
| Budget actuals computed | `ai` | `computeBudgetActuals` call |
| Resonance ROI computed | `ai` | `computeResonanceROI` call |
| Cross-verify triggered | `ai` | `useLedgerCrossVerify` execution |
| Transaction matched to category | `ai` | `matchCategoryToTransaction` |

## Depends On
- WI-X.1

## Acceptance Criteria
- [ ] All Ledger CRUD operations visible
- [ ] Receipt scan pipeline stages visible
- [ ] Computed metrics (actuals, ROI) logged
