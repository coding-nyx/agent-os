# Sprint 19 — Full Backlog Seed

**Status:** Planning
**Seeded:** 2026-03-11

All open backlog items seeded for triage and prioritization. Not all items are in-scope for a single sprint — this is the master list to draw from.

---

## Core Platform
| ID | Item | Priority |
|---|---|---|
| s19-core-01 | Data Layer Decoupling | Medium |

## Agnes (Therapy)
| ID | Item | Priority |
|---|---|---|
| s19-agnes-01 | Agnes Module Review & Refinement | Medium |
| s19-agnes-02 | Somatic Therapy | High | `s19-agnes-02-design` ✅ done |
| s19-agnes-03 | Belief Graph Visualization | Low |

## Titan (Physical)
| ID | Item | Priority |
|---|---|---|
| s19-titan-01 | Physical Sovereign Architecture | High |
| s19-titan-02 | Soma Tab Cleanup | High | ✅ done |
| s19-titan-03 | Titan Fast Logging UX | High | ✅ done |
| s19-titan-03-design | ✅ Titan Fast Logging UX — Design Spec | done |
| s19-titan-03-impl | ✅ Titan Fast Logging UX — Wire Up Implementation | done |
| s19-titan-04 | BUG: View Soma hard reload | P0 Bug | ✅ done |
| s19-titan-05 | Titan Onboarding Simplification | Medium — blocked on s19-soma-02 |
| s19-titan-06 | Routine Builder Integration | Medium |
| s19-titan-07 | Custom Fields in LLM Context | Medium |

## Soma (Health & Medical)
| ID | Item | Priority |
|---|---|---|
| s19-soma-01 | Soma Module Review & Refinement | High | ✅ done |
| s19-soma-02 | Hormonal & Menstrual Cycle Tracking | High |
| s19-soma-03 | Titan Onboarding Cleanup | Medium — blocked on s19-soma-02 |
| s19-soma-04 | Biomarker Intelligence | Medium |
| s19-soma-05 | Medical Clearance Flows | Medium |

## Ledger (Financial)
| ID | Item | Priority |
|---|---|---|
| s19-ledger-01 | Ledger Cross-Verification Engine | Medium |
| s19-ledger-02 | Ledger Document Intelligence | Medium |
| s19-ledger-03 | Ledger Debt & Savings Modeling | High |
| s19-ledger-04 | Unified Ledger Shell | High | ✅ done |
| s19-ledger-05 | Ledger Schema Hardening | Medium |

## Atlas (Planning)
| ID | Item | Priority |
|---|---|---|
| s19-atlas-01 | Atlas Sprint A — The Intelligent Loop | High |
| s19-atlas-02 | Atlas Sprint B — Power User & Memory | Medium |
| s19-atlas-03 | Energy Wave Charting | Low |
| s19-atlas-04 | Task Graph Architecture | Low |
| s19-atlas-05 | Atlas Failure Notification Loop | Medium |

## Scout (Research)
| ID | Item | Priority |
|---|---|---|
| s19-scout-01 | Scout Module Review & Refinement | High |
| s19-scout-02 | Scout Search Proxy Service | High |
| s19-scout-03 | Information Firewall | Low |
| s19-scout-04 | Evidence Source Verification | Low |

## Forge (Execution)
| ID | Item | Priority |
|---|---|---|
| s19-forge-01 | Forge Module Review & Refinement | High — ✅ PM Strategy Review done → `docs/product/FORGE_PRODUCT_STRATEGY_REVIEW.md` |
| s19-forge-02 | Life Ops Pivot | Medium |
| s19-forge-03 | Nexus-Link Bridge | Low |

## Global / Platform
| ID | Item | Priority |
|---|---|---|
| s19-platform-01 | Contextual Inference Engine | High | `s19-platform-01-arch` ✅ done |
| s19-platform-02 | Dynamic Field System Expansion | Medium |
| s19-platform-03 | Global Soul Writing Protocol | Medium |
| s19-platform-04 | Document Intelligence Shared Library | Medium |
| s19-platform-05 | AI Validation Enhancements | Low |
| s19-platform-06 | Systemic Tech Debt | Medium |

## Icebox
| ID | Item |
|---|---|
| s19-ice-01 | Medical Image Analysis |
| s19-ice-02 | Ledger Tax Strategy & Deduction Tracker |
| s19-ice-03 | Architecture & Portability Guide |

---

## Dependencies
- `s19-soma-03` (Titan Onboarding Cleanup) → blocked on `s19-soma-02` (Soma Hormonal Tracking)
- `s19-titan-05` (Titan Onboarding Simplification) → blocked on `s19-soma-02` (Soma Hormonal Tracking)
