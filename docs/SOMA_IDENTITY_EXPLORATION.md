# Soma Identity Decision: Context Exploration Summary

**Date:** March 9, 2025  
**Status:** Foundation research for S1-012 decision doc  
**Scope:** Merge vs. Separate decision for Soma identity within Nexus  

---

## EXECUTIVE SUMMARY

**Current State:** Soma is in a **transitional hybrid state** — fully absorbed into Titan UI but maintaining separate data ownership.

**Decision Required:** Clarify whether Soma should be:
- **OPTION A (Current Path):** Permanently merged into Titan as "Health State Layer" with separate data
- **OPTION B:** Extracted as independent clinical authority with distinct UI presence
- **OPTION C:** Formalized as delegated service layer with strict agent-to-agent handshake

---

## KEY FINDINGS

### 1. **Product Vision & Design** 

#### From `/docs/product/NEXUS_PRODUCT_DEFINITION.md` (§ 9.4):
- **Soma's Conceptual Role:** "Biomedical layer, delegated from Titan" (Sovereign Logic, Shared UI)
- **Soma is the authority for clinical state:** "operates as a background intelligence layer that Titan delegates to for health reasoning"
- **Data vs. UI Separation:** "Soma is the state of the body while Titan is the action of the body. Even when hosted within the Titan UI, Soma remains the exclusive 'Write' owner of the biomedical profile"
- **Strategic Distinction (Line 1587):** "Distinct Soma identity | Health-state module separate from Titan | High (Data-Level) / Shared (UI)"

**Implication:** Product vision explicitly calls for Soma as a **sovereign data authority** but pragmatically allows **UI consolidation** with Titan.

---

### 2. **Current Implementation Status**

#### Soma Profile System (Separate Data Ownership) ✅
- **File:** `/src/modules/soma/types.ts` (Lines 1-78)
- **Details:**
  - Independent `SomaProfile` interface with own Firestore collection (`soma_profiles`)
  - Full E2EE encryption via `SomaProfileService`
  - Read-only cross-module snapshot: `SomaHealthSnapshot` (intentionally strict subset)
  - Explicit ownership model: Soma writes, others read with redaction

```typescript
// SomaProfile owns:
- knownConditions, medications, allergies
- biomarkers (BiomarkerRecord[])
- labSummaries (LabSummaryRecord[])
- clearances (ClearanceRecord[])
- medicalImageAnalyses (MedicalImageAnalysis[])
```

#### TitanProfile Absorption (Dual-Write Phase) ⚠️
- **File:** `/src/lib/types.ts` (Lines 514-531)
- **Current State:** All Soma fields marked `@deprecated` and duplicated in TitanProfile:
  ```typescript
  // --- Absorbed from SomaProfile ---
  /** @deprecated Moving to SomaProfile — dual-write phase */
  knownConditions: string[];
  medications: string[];
  // ... etc
  ```
- **Rationale:** Allows gradual migration without breaking existing reads
- **Problem:** Creates cognitive/data duplication; violates single-write ownership

#### UI Consolidation (Titan Shell) ✅
- **Location:** Soma functionality accessed within Titan UI, not as separate route
- **Components:**
  - `/src/modules/soma/components/SomaDashboard.tsx` — Main UI
  - `/src/modules/soma/components/SomaViewSwitcher.tsx` — Tab navigation
  - Embedded in Titan's medical mode (not standalone module ID route)
- **Note:** `/src/modules/soma/` directory exists but SomaPage is minimal

---

### 3. **Spine & Cross-Domain Context**

#### Soma Spine Events (Active) ✅
- From `/src/lib/types.ts` (Lines 213, 223):
  - `SOMA_BIOMARKER_COMMITTED`
  - `SOMA_READINESS_UPDATED`
  - `SOMA_CLEARANCE_CHANGED`
  - `SOMA_VITAL_LOGGED`
  - `SOMA_LAB_REPORT_PARSED`
  - `SOMA_PROFILE_UPDATED`

#### Cascade Rules (Soma → Other Domains) ✅
- From `/src/lib/spine/cascade-rules.ts`:
  - High biomarker concern → emotional alerts (Agnes)
  - Poor recovery (Soma) → activity restrictions (Titan)
  - Lab abnormalities → energy-wave adjustments (Atlas)

---

### 4. **Conformance Analysis (from `/docs/CONFORMANCE_ANALYSIS.md`)**

#### Status Rating: **PARTIAL (6.5/10)**

**Strengths:**
- ✅ SomaProfile type and separate data ownership documented
- ✅ Soma-profile-service with full encryption
- ✅ Soma-field-templates for extensibility
- ✅ Integration with Titan workflows

**Gaps:**
- ❌ **Distinct Soma route/module presence missing** — No independent `/soma` route
- ❌ **Independent persona lacking** — Soma has no distinct agent voice
- ❌ **Clinical-grade biomarker UI incomplete** — Limited visualization depth
- ❌ **Separate realm from training logic** — UI fusion obscures domain boundary

**Risk:** "Future reimplementation must either fully merge or fully separate; current hybrid state adds cognitive load."

---

### 5. **Sprint Planning & Backlog Context**

#### Sprint 1, Item S1-012 ✅
- **Title:** "Soma identity decision note"
- **Deliverable:** Decision document (merge vs separate) with guardrails, data ownership, and migration implications
- **Priority:** Phase 2 (after Atlas, Ledger, Orchestrator)
- **Effort:** Low (decision doc), but alignment has strategic impact

#### Backlog Item 9 (Vision Alignment) 📋
- **Title:** "Soma/Titan Data-Level Delegation (Architectural)"
- **Tasks:**
  1. Implement service-level handshake where Titan delegates clinical reasoning to Soma Agent
  2. Ensure all biomarker/clearance mutations processed by Soma Agent validation before commit
  3. Titan becomes "consumer" of Soma readiness data (Read-Only)
- **Implication:** Backlog is designed for **Option C (Delegated Service Layer)**, not full merge

---

## DECISION FRAMEWORK

### Option A: Permanent Merge (Soma → Titan)
**Pros:**
- Simplifies module boundary (one module, one persona)
- Reduces context switching for users
- Eliminates dual-write complexity

**Cons:**
- ❌ Violates product vision ("Distinct Soma identity")
- ❌ Loses separation for future clinical domain specialization
- ❌ Merges "state of body" (Soma) with "action of body" (Titan)
- ❌ Non-athletes confused by training-focused Titan persona

**Evidence Against:** Product Definition explicitly calls this out as a design choice (§1587, High Priority).

---

### Option B: Full Extraction (Separate Route & Persona)
**Pros:**
- ✅ Honors product vision fully
- ✅ Enables distinct clinical agent persona
- ✅ Supports non-athlete users (medical tracking without training focus)
- ✅ Clear data sovereignty

**Cons:**
- ❌ UI complexity for users who use both (context switching)
- ❌ Requires distinct onboarding flow
- ❌ Coordination overhead between two modules
- ❌ Highest implementation effort

**Current Barrier:** UI is consolidated in Titan; extracting requires full redesign.

---

### Option C: Formalized Delegation (Recommended Path) ✅
**Architecture:** Soma as **Agent-to-Agent Delegated Service Layer**
- Titan UI remains consolidated ("Shared UI")
- Soma owns all biomarker/clearance data writes (SomaProfile collection)
- Titan Agent calls Soma Agent for clinical reasoning (via Spine + ActionHub)
- Read-only snapshot pattern enforces data boundaries

**Pros:**
- ✅ Honors product vision ("Data-Level / Shared UI")
- ✅ Minimal UI disruption
- ✅ Clear agent roles: Titan = activity coach, Soma = clinical authority
- ✅ Already have infrastructure: Spine events, ActionHub delegation, SomaHealthSnapshot
- ✅ Aligns with backlog item 9 ("Data-Level Delegation")
- ✅ Supports future extraction without data migration

**Cons:**
- ❌ Requires explicit handshake implementation
- ❌ Ongoing coordination needed between agents

**Evidence:** Backlog explicitly plans this architecture (Item 9, "Data-Level Delegation").

---

## DETAILED DECISION MATRIX

| Criterion | Option A (Merge) | Option B (Extract) | Option C (Delegate) |
|-----------|-----------------|-------------------|-------------------|
| **Product Vision Alignment** | ❌ Low (violates 1587) | ✅ High | ✅✅ High (explicit) |
| **Current State Match** | ⚠️ Partial | ⚠️ Inverse | ✅ Exact fit |
| **Implementation Effort** | ✅ Low | ❌❌ High | ✅ Medium |
| **User Experience** | ✅ Unified | ❌ Fragmented | ✅ Unified + Sovereign |
| **Data Ownership Clarity** | ❌ Blurred | ✅ Clear | ✅ Clear |
| **Future Extensibility** | ❌ Locked in | ✅ Open | ✅ Open |
| **Non-Athlete Support** | ❌ Poor | ✅ Good | ⚠️ Through Soma persona |
| **Backlog Alignment** | ❌ Contradicts | ⚠️ Contradicts | ✅✅ Exact match |

---

## RECOMMENDATION: **Option C (Formalized Delegation)**

### Rationale
1. **Already Half-Built:** SomaProfile collection, SomaHealthSnapshot, SomaProfileService exist
2. **Backlog Designed For It:** Item 9 explicitly plans agent-to-agent handshake
3. **Product Vision Match:** Matches "High (Data-Level) / Shared (UI)" exactly
4. **Reversible:** Can extract to independent route later without data loss
5. **Operational:** Minimal immediate disruption, clear path forward

### Implementation Roadmap

#### Phase 1 (Immediate — S1-012 Decision + Foundation)
- [ ] Finalize decision document (Option C)
- [ ] Remove `@deprecated` markers; commit to SomaProfile ownership
- [ ] Document data boundary contract in module manifest
- [ ] Create `SomaServiceLevelAgreement` doc (what Titan can/cannot do)

#### Phase 2 (Sprint 2-3 — Agent Integration)
- [ ] Implement Soma Agent persona (`/src/modules/soma/personas.ts`)
- [ ] Add Soma-specific actions to ActionHub: `evaluate_biomarkers`, `assess_clearance`, etc.
- [ ] Create Soma Agent handler that validates clinical mutations before write
- [ ] Wire Titan → Soma delegation via Orchestrator (tool-calling to Soma Agent)

#### Phase 3 (Sprint 4+ — UI Specialization)
- [ ] If demand arises: Add optional `/soma` route for medical-only users
- [ ] Improve biomarker visualization (clinical-grade charts)
- [ ] Implement medical image analysis UI
- [ ] Add lab report parsing agent

---

## KEY FILES & REFERENCES

### Core Soma Infrastructure
| Path | Lines | Purpose |
|------|-------|---------|
| `/src/modules/soma/types.ts` | 1-78 | SomaProfile definition + snapshots |
| `/src/modules/soma/services/soma-profile-service.ts` | 1-195 | E2EE persistence layer |
| `/src/modules/soma/services/soma-data-service.ts` | ⚠️ TODO | Data aggregation service |
| `/src/lib/types.ts` | 337-531 | TitanProfile with deprecated fields |

### Cross-Domain Integration
| Path | Lines | Purpose |
|------|-------|---------|
| `/src/lib/spine/spine-event-bus.ts` | — | Soma Spine event definitions |
| `/src/lib/spine/cascade-rules.ts` | ~85 | Soma cascade logic |
| `/src/lib/services/nsv-ownership.ts` | — | NSV permission matrix (Soma writes) |
| `/src/modules/soma/field-templates.ts` | — | Extensible biomarker templates |

### Documentation
| Path | Purpose |
|------|---------|
| `/docs/product/NEXUS_PRODUCT_DEFINITION.md` | § 9.4 (Soma conceptual definition) |
| `/docs/CONFORMANCE_ANALYSIS.md` | § 3 (Soma gap analysis) |
| `/skills/nexus-product-spec/modules/soma.md` | Module spec (absorption note) |
| `/skills/nexus-product-spec/modules/titan.md` | Titan spec + Soma integration |
| `/workitems/backlog/BACKLOG.md` | Item 9 (Data-Level Delegation) |

---

## OPEN QUESTIONS FOR DECISION DOC

1. **Non-Athlete Personas:** Should Soma support medical-only tracking for users not interested in training?
2. **Agent Communication:** Should Titan→Soma delegation use Spine events or direct ActionHub calls?
3. **UI Extraction Timeline:** If Option C now, when/if extract to independent route? (6mo, 1yr, never?)
4. **Data Migration:** How to handle existing TitanProfile biomarker fields during transition?
5. **Onboarding Split:** Should medical onboarding be optional/separate from training onboarding?

---

## CONCLUSION

**Soma's identity is NOT lost. It is in the correct transitional state for Option C (Formalized Delegation).**

The codebase has already made the structural choice to separate data ownership while consolidating UI. The backlog is designed to deepen that pattern into an explicit agent-to-agent contract. The decision is whether to formalize and finish it, or to merge/extract.

**Recommendation:** Formalize Option C. It honors vision, minimizes disruption, and leaves future evolution open.
