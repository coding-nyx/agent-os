# Decision: Soma Identity — Merge vs. Separation

**Decision Date:** 2024-XX-XX  
**Owner:** TPM (Orchestrator Nexus)  
**Related Work:** Sprint1-012  
**Context Sources:** `/docs/product/NEXUS_PRODUCT_DEFINITION.md` (§9.4), `/workitems/backlog/BACKLOG.md` (Item 9), `/src/modules/soma/types.ts`, `/src/modules/soma/services/soma-profile-service.ts`, `/src/lib/types.ts`

## 1) Core Problem
Soma’s biomedical identity is partially separated (own E2EE `SomaProfile` + Spine events) but still presented through Titan’s UI with deprecated dual-write fields in `TitanProfile`. We must decide whether to merge Soma back into Titan or formalize its separation to avoid data-ownership ambiguity, duplicated biomarker fields, and unclear guardrails for clinical authority.

## 2) Options Evaluated

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| A) Full Merge | Collapse Soma into Titan; single profile, single agent for biomedical + action domains. | Simplifies routing; fewer collections. | Violates product vision (§9.4 “Data-level / Shared UI”); weakens clinical authority separation; increases risk of unintended action on biomedical data; expensive to undo. |
| B) Full Extraction | Standalone Soma persona, routes, UI, and datastore; Titan invokes via API/Spine. | Maximum isolation and clarity; aligns with long-term vision. | Higher near-term effort; UX fragmentation; requires new navigation and auth surface. |
| C) Formalized Delegation (Hybrid Separation) — **Recommended** | Keep shared UI shell via Titan, but enforce Soma data ownership and authority via delegation. Titan displays read-only `SomaHealthSnapshot`; Soma Agent handles clinical reasoning and writes `SomaProfile`. | Aligns with §9.4 (“Data-level / Shared UI”); minimal UX disruption; preserves E2EE ownership; reduces dual-write risk; reuses existing events. | Requires strict guardrails and migration to remove legacy dual-writes; needs clear contract for read-only views. |

## 3) Recommendation
Adopt **Option C: Formalized Delegation** — maintain shared UI entry via Titan but enforce Soma as the sole owner and actor on biomedical data. Titan can read snapshot data for display and coordination, but cannot mutate Soma-owned fields.

## 4) Guardrails (must-have)
- **Data ownership:** `SomaProfile` is system-of-record for biomedical data; `TitanProfile` must not store or mutate Soma fields after migration.
- **Access:** Titan reads Soma data only via a read-only `SomaHealthSnapshot` (or equivalent DTO). No write methods exposed.
- **Authority boundaries:** Clinical reasoning, recommendations, and any biomarker-derived actions are executed by Soma Agent; Titan may orchestrate but not override.
- **E2EE enforcement:** Preserve existing E2EE for `SomaProfile`; no copying decrypted data into Titan state.
- **Spine/Event hygiene:** Use `SOMA_*` events for updates; prohibit mixed-domain events that carry mutable Soma payloads into Titan handlers.
- **Auditability:** Log delegation calls (Titan → Soma) with intent and outcome; no biomedical payloads in logs.

## 5) Data Ownership Model
- **Source of truth:** `SomaProfile` (Firestore, E2EE) — all biomarkers, vitals, clinical notes.
- **Readable surface:** `SomaHealthSnapshot` (derived, read-only) exposed to Titan for UI and coordination.
- **Deprecated fields:** Biomarker fields currently in `TitanProfile` (`/src/lib/types.ts`, lines ~514-531) are legacy and must be removed post-migration.

## 6) Migration Plan (phased)
**Phase 0: Freeze & Audit**
- Freeze creation of new Soma-related fields in `TitanProfile`; mark as immutable in code and lint rules.
- Inventory consumers of deprecated fields in Titan UI/logic.

**Phase 1: Snapshot & Delegation Contracts**
- Define and implement read-only `SomaHealthSnapshot` contract (scope: display and coordination only).
- Route all clinical reasoning and write paths through Soma Agent (Spine/ActionHub); block Titan writes.

**Phase 2: Dual-Write Deletion**
- Remove Soma biomarker fields from `TitanProfile` types and persistence.
- Backfill any Titan consumers to read from `SomaHealthSnapshot`.

**Phase 3: Hard Guardrails & Observability**
- Add enforcement: Titan attempts to write Soma domains fail fast with explicit errors.
- Add delegation call audit logs (intent + outcome, no biomedical payload).

**Phase 4: Cleanup & UX Confirmation**
- Retire any feature flags gating the delegation pathway.
- Validate UX parity for shared UI; confirm Soma data surfaces remain E2EE-compliant.

## 7) Risk & Mitigations
- **Risk:** Titan code still writes to deprecated fields.  
  **Mitigation:** Lint/runtime guards + removal in Phase 2.
- **Risk:** Snapshot staleness.  
  **Mitigation:** Event-driven refresh on `SOMA_*` events; define freshness SLA.
- **Risk:** Log leakage of biomedical data.  
  **Mitigation:** Payload scrubbing; log only metadata for delegation calls.

## 8) Success Criteria / Acceptance
- No writable biomedical fields remain in `TitanProfile`.
- All Titan displays of Soma data sourced from read-only snapshot API.
- All clinical reasoning and biomarker writes executed by Soma Agent via delegation.
- E2EE remains intact for Soma data; no decrypted copies in Titan state or logs.
- Delegation calls are auditable without exposing biomedical payloads.

## 9) Open Questions
- Do we need a dedicated Soma UI route/persona in near term, or is shared UI sufficient for Sprint 1? (current recommendation: defer)
- Freshness guarantees: what SLA is acceptable for `SomaHealthSnapshot` updates?
- Do any third-party integrations require Titan to act on Soma data, and how will delegation be represented externally?
