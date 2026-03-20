# Sprint 18 — UI Consistency, Debug Infrastructure & Mobile UX Overhaul

## Sprint Goal
Eliminate UI inconsistencies, overflow/clipping bugs, z-index collisions, and placeholder pollution across all modules. Establish a global debug overlay for runtime observability. Redesign mobile UX for focused, spacious workflows.

## Phases
- **Phase 1:** Core modules (Agnes → Titan → Atlas → Ledger → Scout)
- **Phase 2:** Platform pages (Hub → Nexus → Notifications → Profile)
- **Phase 3:** Auth & entry (Landing → Guest → Boot states)
- **Cross-cutting:** Debug infrastructure, layout tokens, mobile patterns

## Work Item Index

### Cross-Cutting (execute first)
| ID | Title | Description |
|----|-------|-------------|
| WI-X.1 | Global Debug Infrastructure | Create `DebugActivityOverlay`, enhance `NexusLogger` observability, wire debug hooks across all services |
| WI-X.2 | Unified Layout Tokens & Container System | Standardize CSS variables, z-index enforcement, shared scroll/overflow utilities |
| WI-X.3 | Mobile-First Interaction Patterns | Bottom sheets, swipe gestures, touch targets, safe-area enforcement |
| WI-X.4 | Spine Event Debug Log | Full spine event logging, cascade chain visualization, event count badges |

### Phase 1 — Core Modules
| ID | Title | Description |
|----|-------|-------------|
| WI-1.1 | Agnes — Layout & Overflow | Fix all container overflow, z-index, text truncation in Agnes page and components |
| WI-1.2 | Agnes — Placeholder Cleanup | Remove/link unconnected placeholder text, mock metrics, dummy data |
| WI-1.3 | Agnes — Debug Overlay | Wire debug overlay to Agnes-specific events (somatic sessions, therapy state) |
| WI-1.4 | Agnes — Mobile UX | Spacious sanctuary mode, full-screen somatic exercises, thumb-reachable actions |
| WI-1.5 | Titan — Layout & Overflow | Fix overflow in 26+ components, calendar grid, workout logger, chart containers |
| WI-1.6 | Titan — Placeholder Cleanup | Audit SomaSnapshotWidget data connection, remove mock training data |
| WI-1.7 | Titan — Debug Overlay | Wire debug to workout logging, recovery plan actions, cycle management |
| WI-1.8 | Titan — Mobile UX | Responsive calendar, mobile quick-log, touch-friendly workout logger |
| WI-1.9 | Atlas — Layout & Overflow | Fix complex view system overflow (week/month/focus/timeline), dashboard cards |
| WI-1.10 | Atlas — Placeholder Cleanup | Remove unlinked energy predictions, mock habit streaks, dummy goals |
| WI-1.11 | Atlas — Debug Overlay | Wire debug to task CRUD, habit tracking, check-in flows |
| WI-1.12 | Atlas — Mobile UX | Mobile-first day planner, swipeable views, inline task management |
| WI-1.13 | Ledger — Layout & Overflow | Fix table/list overflow, chart containers, transaction manager scroll |
| WI-1.14 | Ledger — Placeholder Cleanup | Remove mock budget categories, connect financial charts to real data |
| WI-1.15 | Ledger — Debug Overlay | Wire debug to transaction parsing, receipt scan pipeline, budget calculations |
| WI-1.16 | Ledger — Mobile UX | Mobile transaction entry, responsive charts, touch-friendly budget planner |
| WI-1.17 | Scout — Layout & Overflow | Fix multi-pane research workspace, digest viewer, source library overflow |
| WI-1.18 | Scout — Placeholder Cleanup | Remove mock research briefs, connect knowledge graph to real nodes |
| WI-1.19 | Scout — Debug Overlay | Wire debug to deep research pipeline, document analysis, export operations |
| WI-1.20 | Scout — Mobile UX | Mobile research workspace, full-screen reading, source management |

### Phase 2 — Platform Pages
| ID | Title | Description |
|----|-------|-------------|
| WI-2.1 | Hub — Full Audit | Card grid overflow, 3D view containment, bottom dashboard scroll, z-index layers |
| WI-2.2 | Nexus — Full Audit | Dashboard cards, command palette, onboarding flow, vault nudge positioning |
| WI-2.3 | Notifications — Full Audit | List performance, card overflow, settings modals, empty states, mobile swipe |
| WI-2.4 | Profile — Full Audit | Form overflow, dropdown z-index, tab navigation, mobile keyboard handling |

### Phase 3 — Auth & Entry
| ID | Title | Description |
|----|-------|-------------|
| WI-3.1 | Landing Page Audit | Feature cards, auth modal, background effects, CTA sizing, mobile layout |
| WI-3.2 | Guest Mode Flow Audit | Guest banner, vault gate, protected route loading states |
| WI-3.3 | Boot / Loading States | Boot loader sizing, skeleton proportions, error boundary mobile layout |

## Execution Order
```
WI-X.1 (debug infra)
  → WI-X.2 (layout tokens)
    → WI-1.1–1.4 (Agnes)
      → WI-1.5–1.8 (Titan)
        → WI-1.9–1.12 (Atlas)
          → WI-1.13–1.16 (Ledger)
            → WI-1.17–1.20 (Scout)
              → WI-X.3 (consolidate mobile)
                → WI-2.1–2.4 (Platform)
                  → WI-3.1–3.3 (Auth)
                    → WI-X.4 (spine debug)
```

## Validation Protocol
- `npm run build` after each work item
- `npm run test` for any file with existing tests
- Visual verification at breakpoints: 320px, 375px, 768px, 1024px, 1440px

## Key Constraints
- No structural changes to `src/llm-engine/*`
- Preserve module theme colors from `MODULE_MANIFEST`
- Use existing z-index layer contract (`--z-base` through `--z-toast`)
- Extend existing debug system (`useDebugMode`, `DebugFlags`, `NexusLogger`), don't replace
- Don't refactor large page files — audit and fix in-place
