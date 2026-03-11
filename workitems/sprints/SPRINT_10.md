# SPRINT 10 — Platform Core: Architecture Hardening & Developer Experience

**Status:** PLANNED  
**Objective:** Harden the Nexus platform layer — vendor-agnostic data, authoritative soul writes, shared document intelligence, developer visibility, and a clean codebase. These items are prerequisites for all module teams; nothing scales cleanly until this layer is solid.

**Follows from:** Sprint 9 (Atlas Intelligent Loop). Parallels any ongoing module work.

**Strategic context:** See `workitems/backlog/BACKLOG.md` §1 (Core Platform & Spine) and §8 (Global AI & Systemic Enhancements).

---

## Items

### S10-001 — Data Layer Decoupling (P0)
**Goal:** Make Nexus vendor-agnostic. Any module importing Firebase SDK directly breaks the abstraction boundary.

**Scope:**
- Audit all `src/modules/*` and `src/lib/*` for direct `firebase/firestore` imports; route them through `NexusDataLayer`
- Implement `InMemoryDataProvider` (test/offline stub) conforming to the full `NexusDataLayer` interface
- Refactor Cloud Functions (`functions/`) to separate trigger scaffolding from business logic (trigger → service call pattern)
- Add a DI guard: throw at startup if any module bypasses the data layer in non-test environments

**Acceptance criteria:**
- Zero direct `firebase/firestore` imports outside `src/lib/firebase.ts` and the data layer provider
- `InMemoryDataProvider` passes a parity test suite covering all `NexusDataLayer` methods
- Build passes

---

### S10-002 — Global Soul Writing Protocol (P0)
**Goal:** Prevent rogue NSV writes. All chat-driven schema changes must be validated by the domain-authoritative agent before commit.

**Scope:**
- Define `SoulWriteRequest` type: `{ moduleId, field, value, requestedBy, reason }`
- `GlobalProjectionService.updateCrossFunctionalState()` gains an optional `validateWith?: moduleId` param
- When set, the write is queued to `pending_soul_writes/{uid}` and a Spine `SOUL_WRITE_REQUESTED` event is emitted to the domain owner
- Domain owner module's action handler either approves (commits) or rejects (discards + emits `SOUL_WRITE_REJECTED`)
- Scout and Forge remain NSV read-only — any write attempt from these modules throws immediately

**Acceptance criteria:**
- Scout/Forge NSV write attempts are caught at the ActionHub level with a descriptive error
- A write from Agnes to `cognitive.*` passes through the validation queue
- Build passes

---

### S10-003 — Document Intelligence Shared Library (P1)
**Goal:** Formalize the Documents module as a reusable platform service so Ledger (receipts), Soma (lab reports), and Atlas (reference docs) don't each build their own parser.

**Scope:**
- Create `src/lib/services/document-intelligence-service.ts` with a unified `parseDocument(file, hints)` API
- Accepts PDF/image files, returns structured `DocumentParseResult`: `{ type, fields: Record<string, string>, rawText, confidence }`
- `hints`: `{ domain: 'receipt' | 'invoice' | 'lab_report' | 'general', moduleId }`
- Ledger's existing document parsing code migrates to call this service
- Expose via `useDocumentIntelligence()` hook for components

**Acceptance criteria:**
- `parseDocument` handles PDF (via existing `pdfjs-dist` chunk) and image files
- Ledger receipt upload flow uses the shared service (no duplicate parsing logic)
- Build passes

---

### S10-004 — Debug Mode Developer Overlay (P1)
**Goal:** Surfaces internal runtime state across all chat interfaces when enabled. Zero cost when off.

**Scope:**
- `useDebugMode()` hook — reads/writes `localStorage['nexus_debug_mode']`; reactive via custom event
- Profile view — "Developer" collapsible section with Debug Mode toggle switch
- `ModelBadge.tsx` — live pill in chat header showing active model name; alternates with connection status
- `DebugThoughtPanel.tsx` — collapsible chip above each AI message bubble:
  - Raw reasoning / scratchpad (from `message.debugMeta.reasoning`)
  - Action tags extracted, dispatched, and executed
  - API call snippet (first 500 chars of request body + status + latency)
- `SoulActivityTag.tsx` — pulsing tag right of module title showing last Spine event (3 s TTL) and Soul active/idle state
- `ChatMessage` type gains optional `debugMeta?: { reasoning?: string; actionTagsExtracted?: ActionTag[]; actionTagsDispatched?: string[]; actionsExecuted?: string[]; apiLatencyMs?: number; apiRequestSnippet?: string }`
- LLM engine populates `debugMeta` only when `isDebugMode()` returns true
- All debug subtrees guarded by `if (!debugMode) return null`
- Amber/yellow accent palette for all debug chrome

**Acceptance criteria:**
- Toggle in profile persists across page reloads
- Thought panel visible on AI messages when debug on; invisible when off
- No performance regression (Lighthouse score unchanged) when debug is off
- Build passes

---

### S10-005 — AI Validation Enhancements (P1)
**Goal:** Replace keyword-based field validation with richer, learning-aware validation.

**Scope:**
- Batch field validation: validate all fields in a profile update in a single LLM call rather than one-by-one
- Feedback loop: when a user corrects an AI-validated field, store the correction in `validation_feedback/{uid}` and include recent corrections in the next validation prompt
- Module-specific validator personas: Ledger validator is stricter on numeric formats; Agnes validator is more tolerant on freeform emotional language

**Acceptance criteria:**
- Single LLM call validates a full profile patch
- Corrections stored and surfaced in subsequent prompts
- Build passes

---

### S10-006 — Data Portability v2 (P2)
**Goal:** Users can export and restore all their data; backups happen automatically.

**Scope:**
- Scheduled Firestore backup: Cloud Function runs nightly, writes a compressed JSON snapshot to `backups/{uid}/{date}.json.gz` in Cloud Storage
- Manual export: "Export All Data" button in Profile → downloads the same JSON format
- Import/restore: profile settings page accepts a `.json` or `.json.gz` and intelligently merges (field-level: newer timestamp wins)
- Export format: `{ version, exportedAt, modules: { agnes, titan, ledger, soma, atlas, scout, forge }, globalSoul, vault_metadata }`

**Acceptance criteria:**
- Export + re-import round-trip produces identical profile state
- Vault-encrypted fields remain encrypted in the export (no plaintext secrets)
- Build passes

---

### S10-007 — Systemic Tech Debt (P2)
**Goal:** Clean codebase before scaling further.

**Scope:**
- **Hygiene pass:** Remove dead/duplicated code paths identified in prior sprints; normalize service/hook naming conventions; prune stale `TODO`/`console.log` across active modules
- **Titan hook fix:** Resolve conditional hook behaviour in `TitanPage.tsx` greeting logic (rules-of-hooks violation)
- **Titan ARIA fix:** Fix tab panel `id` / `aria-controls` mismatch in `TitanPage.tsx`
- **Chunk audit:** Review Vite manual chunks — ensure `vendor-gpt`, `vendor-pdf`, `vendor` remain non-overlapping and deterministic

**Acceptance criteria:**
- `npm run lint` exits 0
- No rules-of-hooks violations in TitanPage
- ARIA attributes pass axe-core audit
- Build passes

---

### S10-008 — Contextual Inference Engine (P1)
**Goal:** Any AI agent detects when the user casually implies a data change, cross-verifies against the target module's profile, and surfaces a non-blocking reconciliation toast — without the user opening a form.

**Scope:**
- Add `CONTEXT_HINT_DETECTED`, `CONTEXT_HINT_CONFIRMED`, `CONTEXT_HINT_DISMISSED` to `SpineEventType` + display labels
- New action tag `detect_data_hint` (silent, available in all 5 core module system prompts + personas):
  ```xml
  <action type="detect_data_hint">{"module":"titan","field":"weeklyWorkouts","inferredValue":3,"confidence":0.82,"rawQuote":"been working out 3 days","sentiment":"neutral"}</action>
  ```
  Fires only when confidence ≥ 0.75 and value is concrete. Silent — does not alter the visible reply.
- `src/lib/services/context-inference-service.ts`: `verifyHintAgainstProfile(hint, userId)` — reads target module profile, compares inferred vs stored value, returns `HintVerificationResult`. Rate-limited to 2 popups per module per session via `sessionStorage`.
- `src/lib/hooks/use-cross-module-hint-listener.ts`: subscribes to `CONTEXT_HINT_DETECTED` Spine events; manages queue of ≤2 pending hints (FIFO, deduplicated by `module+field`); exposes `{ activeHint, dismissHint, confirmHint }`.
- `src/core/components/DataSyncToast.tsx`: floating card above chat input (Framer Motion slide-up), module-accent dot, 3 actions (Update / Ignore / Ask [Module]), 10s auto-dismiss with progress bar. On confirm: dispatches `update_field` to target module's ActionHub.
- Wire `DataSyncToast` into `ModuleLayout.tsx`
- Agnes-domain hints (emotion, life events) never show a popup — silently update NSV `emotional.*` or fire `DELEGATION_REQUEST`
- Scout/Forge: can emit `detect_data_hint` but cannot execute the write (read-only enforcement)
- Register `detect_data_hint` handler in `ActionHub` — routes to `context-inference-service`

**Acceptance criteria:**
- "I've been working out 3 days" in any chat fires `detect_data_hint`, cross-verifies against Titan, and (if discrepant) surfaces the toast
- Toast auto-dismisses at 10s; confirming updates the target profile
- Agnes-path hints never show a popup
- Scout/Forge write attempts are blocked at ActionHub
- Build passes

---

## Dependency Order

```
S10-001 (Data Layer)    ──►  S10-003 (Doc Intelligence)
S10-002 (Soul Protocol) ──►  S10-005 (AI Validation)
S10-001 (Data Layer)    ──►  S10-008 (Contextual Inference)
S10-004 (Debug Mode)    — independent
S10-006 (Portability)   — independent
S10-007 (Tech Debt)     — independent
```

S10-001 should land first as it changes import patterns across the codebase.  
S10-002 and S10-004 can run in parallel with S10-001.

---

## Out of Scope (parked for later)
- Module-level feature work (Agnes, Titan, Ledger, Scout, Forge feature sprints)
- Atlas Failure Notification Loop (Sprint 11)
- Nexus-Link Bridge (future)
