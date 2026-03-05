# AGNES Integrated Plan (Plan B)

## Application Summary
AGNES is a unified multi-agent wellness platform with one orchestrator (`Agnes`) and specialized modules (`Therapy`, `Trainer`, `Ledger`, and future modules). The platform supports two user modes:

1. Guest mode: users can explore modules from the home page and run limited trial sessions with strict per-session token limits.
2. Logged-in mode: users start with orchestrator onboarding, build a persistent base context (identity, pronouns, preferences, baseline profile), and then use specialized modules that personalize behavior using shared base context.

Core design principles:

- Unified design language and navigation across all modules.
- Strict module boundaries (module logic remains in each module).
- Shared base context for consistent addressing and personalization.
- Persistent memory model: active session state + session summaries + compacted global projection.
- `llm-engine` treated as an external API boundary.

## Personality Provision (Agent Naming and Behavior Contracts)

### Default Agent Names
1. Orchestrator default name: `Agnes`.
2. Therapy specialist default name: `Agnes`.
3. Trainer specialist default name: `Titan`.
4. Medical specialist default name: `Ledger`.
5. Future modules must ship with a default themed name via module registry metadata.

### Default Gender Provision
1. Default gender personality for all agents is `female`.
2. User can set each agent personality gender to:
- `female`
- `male`
- `non-binary`
- `gender-fluid`
3. Gender selection changes personality framing and presentation style, not role scope or safety constraints.

### Personality Core vs Customization
1. Each agent has immutable core behavior:
- respectful identity handling
- non-judgmental interaction
- safety-first response framing
2. Each agent has customizable overlay behavior:
- display name/alias
- gender personality profile
- tone preference
- communication style intensity
3. Customization never overrides safety constraints or core role scope.

### Global Personality Provision Schema
1. Add `agentPersonalityProvision` under `users/{uid}`:
- `orchestratorAlias: string` (default `Agnes`)
- `moduleAliases: { therapy: string; trainer: string; ledger: string; [futureModuleId: string]: string }`
- `moduleGenderProfiles: { orchestrator: 'female' | 'male' | 'non-binary' | 'gender-fluid'; therapy: 'female' | 'male' | 'non-binary' | 'gender-fluid'; trainer: 'female' | 'male' | 'non-binary' | 'gender-fluid'; ledger: 'female' | 'male' | 'non-binary' | 'gender-fluid'; [futureModuleId: string]: 'female' | 'male' | 'non-binary' | 'gender-fluid' }`
- `personaOverlays: { [moduleId: string]: { tone?: string; style?: string } }`
2. Add `displayNames` projection copy in `global_souls.baseContextProjection` for read-optimized module access.
3. Add `agentGenders` projection copy in `global_souls.baseContextProjection` for read-optimized module access.

### Rename and Gender Propagation Flow
1. User updates orchestrator alias and/or any module gender profile in orchestrator settings.
2. Save immediately to `users/{uid}.agentPersonalityProvision`.
3. Sync projected copies to `global_souls.baseContextProjection.displayNames` and `global_souls.baseContextProjection.agentGenders`.
4. Reflect updated alias and gender everywhere without waiting for re-onboarding:
- home greeting and CTA text
- hub title chips and pod labels
- module headers/subheaders where orchestrator is referenced
- chat `agentName` labels and assistant intro messages
- prompt context injection for all modules
5. Active sessions use new alias/gender personality on next assistant response.
6. Historical records are not rewritten; display layer resolves latest alias at render time.
7. Fallback rules:
- if alias is empty/invalid, automatically revert to `Agnes` for orchestrator and therapy, `Titan` for trainer, `Ledger` for medical.
- if gender is missing/invalid, automatically revert to `female`.

## End-to-End Application Flow

### 1. Guest Flow
1. User lands on `/` home page and sees module showcase cards (Therapy, Trainer, Ledger, etc.).
2. User clicks `Try` on any module.
3. Guest trial starts with visible token meter and usage countdown.
4. During trial:
- Chat continues while token quota remains.
- Context persists only for current session/tab.
5. When token limit is exhausted:
- Input is hard-locked.
- Login/Register modal appears.
- User must authenticate to continue and keep persistent memory.
6. If user leaves without login, guest context is purged.

### 2. Logged-In Flow
1. User authenticates and unlocks vault.
2. System checks `core onboarding` completion.
3. If incomplete, user is redirected to `/orchestrator`.
4. Agnes orchestrator onboarding (chat + structured form) collects:
- preferred name
- pronouns
- age
- assigned sex at birth
- gender identity
- AGNES naming preference + agent personality gender settings
5. Optional deep intake branch:
- if user opts in, Agnes asks short module-aware baseline questions.
6. Core profile is saved as persistent base context.
7. User is redirected to `/hub`.

### 3. Hub Flow
1. Hub displays profile summary + module pods/cards.
2. Hub defaults to adaptive view:
- 3D pods on capable desktop
- 2D cards on mobile/low-capability
3. User can toggle 2D/3D; preference persists.
4. User enters any module; each module reads base context and applies module-specific behavior.

### 4. Therapy Flow
1. First-time therapy onboarding collects therapy-specific context:
- reconfirmed name/pronouns
- triggers
- reason for therapy
- additional notes
2. User proceeds to therapist customization:
- therapist gender preference
- tone/style preference
- therapist core remains: empathetic, patient, non-judgmental; stern only when needed
3. Session starts and remains resumable across devices until explicit end.
4. Session can end via button or user intent (`bye`, `end session`).
5. End-session modal shows summary and asks whether to remember.
6. If remember = yes:
- compacted summary added to therapy memory
- latest snapshot overwritten
- projection pushed to global context
7. If remember = no:
- session closes with minimal event record only.

### 5. Trainer Flow
1. User selects onboarding mode:
- `basic`: non-intrusive intake
- `complete`: full intake including sensitive topics
2. Trainer reconciles known base profile fields and updates if user confirms changes.
3. Intake includes nutrition, sleep, stress, supplements, activity, goals, history.
4. Post-onboarding dashboard includes:
- persistent trainer chat
- meal logging from natural language
- routine tracking (weekly + highly detailed today)
- multi-session-per-day support
- intensity guidance, PR suggestion, supplement nudges
- menstrual context display when biologically relevant
5. Session memory follows same active-session + snapshot + event model.

### 6. Ledger Flow
1. Ledger onboarding collects medical baseline and concern profile.
2. Ledger dashboard + chat provides physician-style responses.
3. Persistent emergency warning banner is always visible.
4. Ledger synthesizes cross-module indicators and produces cautious, compassionate guidance.
5. Session memory follows active-session + snapshot + event model.

### 7. Global Memory and Context Flow
1. Orchestrator core profile is the identity source of truth.
2. Therapy/Trainer/Ledger read base identity and addressing preferences.
3. Module outputs are compacted and projected into global context.
4. Global context supports cross-module personalization and trend interpretation.
5. Nothing is fully forgotten unless user explicitly runs a full reset/purge action.

### 8. Context Optimization, Memory Safeguards, and Hallucination Safeguards
1. Context optimization policy:
- hierarchical assembly order: core profile -> module profile -> latest snapshot -> relevant event summaries -> active session tail
- token budgeting with strict priority tiers (critical identity/safety first, then task-relevant history)
- compaction pipeline keeps key facts stable and prunes repetitive low-value turns
- prompt context injection must include only relevant module projections (avoid cross-module noise)
2. Memory-loss safeguards:
- write-ahead event logging before any snapshot/projection overwrite
- atomic update contract: event append -> snapshot write -> projection update -> commit marker
- session checkpoints during active chat to prevent loss on refresh/crash/disconnect
- overwrite protection for latest snapshot (requires valid session/version id)
3. Hallucination safeguards:
- source-of-truth grounding to stored profile/projection data; do not invent missing user facts
- unknown-data behavior: explicitly say data is missing and ask targeted follow-up
- schema validation for all action tags before persistence
- module scope guardrails (therapy does not fabricate trainer metrics, ledger does not claim diagnoses as certainty)
- high-risk response policy: include safety escalation language and emergency guidance where applicable
4. Backup and recovery provision:
- encrypted periodic backups for user core + module memory envelopes + global projections
- pre-compaction restore points retained before each major compaction cycle
- recovery path can rebuild latest state from event log + latest valid backup
- backup metadata includes timestamp, schemaVersion, checksum, and restore status

---

## Comprehensive Implementation Plan

## Phase 1: Core Platform Contracts and Data Model
1. Add `schemaVersion: 2` in user/global/module documents (in-place mutation).
2. Define new TypeScript contracts:
- `CoreUserProfile`
- `ModuleDefinition`
- `ModuleMemoryEnvelope`
- `ActiveSessionState`
- `SessionEventSummary`
- `GlobalProjection`
- `AgentPersonalityProvision`
- `AgentDisplayNames`
3. Add centralized module registry for route metadata, module status, capabilities, onboarding requirements.
4. Add shared services:
- `core-profile-service`
- `module-memory-service`
- `global-projection-service`
- `guest-quota-service`
- `agent-personality-service`
5. Update Firestore rules for `ledger_profiles` and new metadata fields.

## Phase 2: Routing, Guards, and Shell Unification
1. Finalize routes: `/`, `/orchestrator`, `/hub`, `/therapy`, `/trainer`, `/ledger`.
2. Implement route guards:
- logged-in + onboarding incomplete -> `/orchestrator`
- guest -> allowed limited module trial
- exhausted guest quota -> hard lock + auth gate
3. Normalize shared shell components:
- `ModuleLayout`
- `ChatInterface`
- modal patterns
- onboarding scaffolds
4. Apply unified design tokens and consistent visual language.

## Phase 3: Orchestrator Complete Implementation
1. Create orchestrator module with chat+form hybrid intake UI.
2. Implement intake state machine:
- identity capture
- optional deep intake decision
- module-aware follow-up prompts
- review/confirm/edit
3. Add agent naming settings in orchestrator profile step:
- show defaults (`Agnes` for orchestrator and therapy, `Titan`, `Ledger`)
- allow user override for orchestrator alias and optional module aliases
4. Add per-agent gender personality settings:
- default all to `female`
- allow user selection (`female`, `male`, `non-binary`, `gender-fluid`)
5. Implement instant rename and gender propagation pipeline to hub and all modules.
6. Persist completed base profile and onboarding state in `users/{uid}`.
7. Update global projection and memory index, then redirect to hub with visual profile representation.

## Phase 4: Therapy Complete Implementation
1. Replace current therapy onboarding with full v2 sequence.
2. Add therapist customization layer after intake.
3. Add session lifecycle manager:
- resume active sessions across devices
- explicit end handling
- end-session summary flow
- remember toggle behavior
4. Store:
- `activeSession`
- `latestSessionSnapshot`
- immutable `sessionEvents[]`
5. Push remembered summaries to global projection.

## Phase 5: Trainer Complete Implementation
1. Finalize basic/complete onboarding paths.
2. Implement intake reconciler with orchestrator base profile.
3. Add structured trainer profile persistence for nutrition/activity/history/biological data.
4. Add meal logging parser and macro update pipeline.
5. Expand routine model for non-linear, multi-session days.
6. Implement today vs weekly detailed dashboards.
7. Add remember flow and session memory parity with therapy.

## Phase 6: Ledger Complete Implementation
1. Add dedicated `ledger_profiles` service and onboarding flow.
2. Implement physician-style chat context contract.
3. Add always-visible emergency disclaimer across ledger UI.
4. Implement diagnostic dashboard cards and cross-module anomaly synthesis.
5. Add session persistence and memory envelope parity.

## Phase 7: Guest Trial Enforcement and Conversion
1. Replace passive integrity meter with enforced quota service.
2. Record usage on each turn (user + assistant).
3. Hard lock when exhausted and open auth modal.
4. Keep transcript read-only post-lock.
5. Purge guest data on session end/tab close/logout.

## Phase 8: AI Integration Standardization (Without Engine Refactor)
1. Add app-layer AI gateway wrapper around `useAI`:
- context assembly
- action-tag parsing
- module memory write-through
- quota accounting hooks
2. Keep `llm-engine` internal structure untouched.
3. Ensure all modules consume same wrapper contract.

## Phase 9: Security, Compliance, and Reset Semantics
1. Ensure sensitive module payloads remain encrypted.
2. Keep only non-sensitive metadata unencrypted.
3. Implement explicit user reset/purge workflow:
- users
- global_souls
- therapist_profiles
- ai_trainers
- ledger_profiles
4. Add defensive guards to prevent accidental plaintext writes.

## Phase 10: Reliability, Safeguards, and Backup
1. Implement context assembly policy service with token-tier budgeting and relevance filtering.
2. Add memory transaction pipeline with commit markers and rollback on partial failure.
3. Add action-tag schema validators and persistence guards for malformed updates.
4. Add hallucination safety middleware:
- fact-grounding checks against persisted profile/projection
- unknown-data fallback response behavior
- risk-level classifier for medical/mental high-risk responses
5. Add encrypted backup scheduler and restore utilities:
- periodic backup creation
- pre-compaction restore point generation
- deterministic restore validation checks

## Phase 11: Validation and Release Hardening
1. Functional test matrix:
- guest entry and lock
- orchestrator required onboarding
- module onboarding completeness
- active session resume cross-device
- end-session remember/no-remember behavior
- identity consistency across modules
2. Security test matrix:
- Firestore owner-only access
- reset/purge coverage
- encrypted payload integrity
3. Build and regression:
- `npm run build`
- full route smoke tests
- UI consistency verification

---

## Public API / Interface Additions
1. `CoreUserProfile` interface for base identity and addressing.
2. `GlobalProjection` interface for compacted cross-module context.
3. `ModuleSessionState` and `SessionEventSummary` for durable session handling.
4. `ModuleRegistryEntry` for unified module discovery and rendering.
5. Service interfaces for quota, profile, and memory orchestration.
6. `AgentPersonalityProvision` for default names, aliases, and persona overlays.
7. `AgentDisplayNames` projection contract for fast render-time name resolution.
8. `AgentGenderProfiles` contract for per-agent personality gender configuration.
9. `ContextAssemblyPolicy` for context tiering and token-budget selection.
10. `MemoryCommitRecord` for atomic memory writes and rollback-safe checkpoints.
11. `HallucinationGuardResult` for grounding/uncertainty/risk evaluation.
12. `BackupManifest` for encrypted backup metadata and restore status.

## Acceptance Criteria
1. New users cannot access module dashboards without completing orchestrator onboarding.
2. Guests can try modules directly from home and are hard-gated after quota exhaustion.
3. Therapy, Trainer, and Ledger each have complete onboarding + dashboard + persistent chat flows.
4. Session resume works across devices until explicit end.
5. Identity/personalization consistency is preserved across all modules.
6. End-session memory behavior is correct (remember/no remember).
7. Unified design language is consistent across home, hub, and modules.
8. Build passes successfully with strict TypeScript.
9. User can rename orchestrator from `Agnes` and the new alias is reflected across home, hub, module headers, chats, and prompt contexts.
10. Default module names (`Agnes`, `Titan`, `Ledger`) are applied when no custom alias exists (therapy uses `Agnes`).
11. User can set each agent personality gender (female/male/non-binary/gender-fluid), and changes are reflected in prompts and UI labels everywhere.
12. No silent memory loss on refresh/network interruption; active session restores from last valid checkpoint.
13. Hallucination guard behavior is observable: missing data is declared, fabricated facts are blocked from persistence.
14. Backup restore can reconstruct valid user state after simulated corruption or partial write failure.

## Implementation Defaults (Locked)
1. Plan strategy: full integrated Plan B.
2. Data migration: in-place mutation with schema v2 fields.
3. Sharing policy: global allow-all across modules.
4. Sensitive trainer flow: mode-level consent (`basic` vs `complete`).
5. Guest policy: hard lock + login gate after limit.
6. Hub default: adaptive 2D/3D with persisted override.
7. Memory policy: active session + immutable events + latest snapshot + global compaction.
8. Agent personality gender default: `female` for orchestrator, therapy, trainer, and ledger unless user changes it.
9. Backup policy default: encrypted periodic backups enabled for logged-in users, with restore points before compaction.
