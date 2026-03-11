# Nexus Master Playbook

Status: Strategic + operational reference  
Audience: Founders, product, design, engineering, growth, GTM  
Complements: `NEXUS_PRODUCT_DEFINITION.md`, `NEXUS_SYSTEM_DEFINITION.md`

---

## 1) What Nexus Is (Market-Level Definition)

Nexus is a personal operating system powered by specialized AI agents that manage the core domains of life in one coordinated runtime.

Category framing:
- AI Life Operating System (not “chatbot app”)
- Modular multi-agent platform (not one generic assistant)
- State-aware decision system (not static productivity tool)

Core promise:
- one user model,
- many specialist agents,
- one coordinated nervous system (Spine),
- one shared but permissioned state model (Global Soul / NSV),
- always-on adaptive interaction layer (alive UI).

---

## 2) Marketing Summary (Whole Product)

### 2.1 One-line
Nexus turns fragmented life management into one adaptive, private, multi-agent operating system.

### 2.2 Value proposition
- Replaces disconnected apps with a coordinated agent stack.
- Converts passive tracking into active, domain-aware guidance.
- Preserves privacy through vault encryption and bounded context sharing.
- Gives users one command surface with specialist depth behind it.

### 2.3 Differentiation
- Domain-specialist agents with explicit authority boundaries.
- Shared state intelligence through NSV, not isolated chat history.
- Event-driven cross-module coordination via Spine.
- Action execution guardrails (`ActionHub`) between model output and real writes.
- Live operational UX (toasts, routing, draft review, pulse visualization), not static pages.

---

## 3) Product Suite (Sub-Products)

Nexus is a suite composed of these sub-products:

### Nexus Orchestrator
- Tagline: “Your sovereign command layer.”
- Primary value: cross-domain synthesis, delegation, decision orchestration.
- Use when: user asks broad, ambiguous, or multi-domain questions.

### Agnes (Emotional)
- Tagline: “Emotional clarity and therapeutic continuity.”
- Primary value: emotional processing, resilience tracking, therapeutic reflection.
- Use when: stress, emotional overwhelm, relational patterns, coping support.

### Titan (Physical Performance)
- Tagline: “Training intelligence grounded in readiness.”
- Primary value: routines, workouts, progression, recovery-aware coaching.
- Use when: fitness execution, physical plan adaptation, performance logs.

### Soma (Biomarker / Medical Context)
- Tagline: “Biomedical state and clearance awareness.”
- Primary value: biomarker and clinical context that informs readiness decisions.
- Use when: health metrics, safety flags, physiological context.

### Ledger (Financial)
- Tagline: “Resource intelligence with behavioral awareness.”
- Primary value: budgeting, transactions, goals, financial-friction awareness.
- Use when: money planning, spend behavior, debt/savings tradeoffs.

### Atlas (Cognitive + Planning)
- Tagline: “Execution architecture for real life constraints.”
- Primary value: tasks, planning load, schedule adaptation, review loops.
- Use when: planning under stress/energy constraints, goal execution.

### Scout (Research)
- Tagline: “Signal over noise.”
- Primary value: search/research synthesis, information relevance.
- Use when: external knowledge gathering and source synthesis.

### Forge (Execution Utility)
- Tagline: “From decision to execution.”
- Primary value: technical/admin execution workflows.
- Use when: concrete output or operational execution is needed.

### Hub (Overview)
- Tagline: “System-wide glance.”
- Primary value: aggregated module state and quick navigation.

### Profile (Identity + Security)
- Tagline: “Identity, security, and system preferences.”
- Primary value: personalization, vault/security posture, settings.

---

## 4) Target Users and Jobs-to-Be-Done

Primary user archetype:
- high-cognitive-load individual managing emotional, physical, financial, and planning demands simultaneously.

Core JTBD:
- “Help me decide what to do next based on my real state, not an idealized plan.”
- “Keep continuity across life domains so I do not repeat context in every app.”
- “Protect sensitive data while still using AI deeply.”
- “Turn intent into execution with minimal friction.”

Secondary archetypes:
- health/fitness-focused users needing emotional + physical coordination,
- operators/builders needing planning + execution + stress-aware prioritization,
- recovery-focused users needing safety-aware pacing.

---

## 5) Messaging Framework (GTM)

### 5.1 Positioning statement
For people managing complex lives across health, planning, finance, and emotional load, Nexus is an AI life operating system that coordinates specialist agents around a shared user state so every recommendation is context-aware, actionable, and private.

### 5.2 Message pillars
- Unified intelligence: one system, many specialist agents.
- State-aware decisions: recommendations adapt to real-time cross-domain state.
- Trust by design: vault + policy boundaries + action guardrails.
- Actionable by default: insights tied to execution pathways.

### 5.3 Elevator pitch variants
- Consumer: “Nexus is your personal command center for mind, body, money, and execution.”
- Technical: “Nexus is a modular, event-driven multi-agent platform with bounded authority and encrypted persistence.”
- Enterprise-adjacent coaching/health: “Nexus combines therapeutic continuity, readiness-aware planning, and financial behavior intelligence in one privacy-first runtime.”

---

## 6) Product Logic Narrative (How Users Experience It)

1. User enters Nexus through a module or Orchestrator.
2. Runtime resolves identity, security state, and module access.
3. Conversation starts in module-specific AI context with filtered shared state.
4. Model responses stream live, with action tags parsed.
5. Allowed actions execute through guarded app-layer handlers.
6. Profile/NSV/state changes emit Spine events.
7. Alive UI surfaces these events as prompts, drafts, and alerts.
8. User can accept delegation/routing or stay in current module.
9. Session history persists; long-term memory consolidates over time.

Result:
- continuous adaptive experience across sub-products without breaking module boundaries.

---

## 7) Alive UI as Product Feature (Not Decoration)

Alive UI is a strategic product layer that turns Nexus into a living system:
- `NexusOverlay`: direct orchestration anywhere in app.
- `SpineOverlay`: visual domain pulse of live system activity.
- `SpineToastProvider`: high-severity system feedback.
- `NeuralDraftPanel`: “propose before commit” governance.
- `NexusRouteBanner`: assisted module routing/continuation.
- `NexusChat`: streaming-centric command conversation interface.

Marketing interpretation:
- Nexus “feels alive” because cross-domain state and actions are continuously visible and negotiable.

---

## 8) Competitive Contrast (Strategic)

Against generic chat assistants:
- Nexus has specialist modules and bounded authorities.

Against productivity suites:
- Nexus includes emotional/biological/financial state coupling.

Against wellness trackers:
- Nexus provides cross-domain orchestration and execution logic.

Against single-purpose coaching apps:
- Nexus links multiple life domains with shared state and events.

---

## 9) North-Star Outcomes and KPIs

North-star concept:
- “Coordinated life execution quality” per active user.

Suggested KPI families:
- Engagement: weekly active modules per user, cross-module session continuity.
- Execution: plan completion rate, habit adherence, reduction in overdue critical tasks.
- Wellness-state alignment: recommendation acceptance under high stress/fatigue scenarios.
- Financial behavior: budgeting consistency, reduced financial-friction spikes.
- Trust/security: vault adoption rate, encrypted-session usage, auth-to-vault completion.
- System quality: action success rate, stream interruption recovery rate, event propagation latency.

---

## 10) Higher-Level Developer Instruction Plan

This is the high-level operational plan for building Nexus as a coherent product system.

### 10.1 Architectural laws
- Keep module logic inside module boundaries.
- Treat `llm-engine` as runtime boundary; do not move app side effects into engine.
- Route all app writes through `NexusDataLayer`.
- Use `ActionHub` for all model-initiated side effects.
- Enforce NSV ownership/read-permission policies.
- Use Spine/Handoff for cross-module coordination.

### 10.2 Delivery model
- Platform track: runtime, data layer, security, spine, AI quality.
- Module tracks: Agnes, Titan, Ledger, Atlas, Scout, Forge, Soma.
- Integration track: cross-module contracts, alive UI, orchestration behavior.

### 10.3 Planning horizons
- Horizon 1: reliability and trust primitives.
- Horizon 2: module depth and workflow quality.
- Horizon 3: adaptive intelligence loops and predictive coordination.

### 10.4 Required quality gates
- Build must pass.
- Type integrity must pass.
- Module-level smoke tests for changed flows.
- Security-sensitive changes must include vault/auth regression checks.
- AI/action changes must include guardrail tests and fallback behavior checks.

### 10.5 Change governance
- Every feature proposal includes:
- user outcome,
- module ownership,
- NSV impact,
- Spine event impact,
- action handler impact,
- persistence impact,
- rollback strategy.

### 10.6 Documentation operating rules
- Product truth: `docs/product/*`
- Runtime truth: `docs/architecture/*`
- Module strategy truth: per-module strategy docs
- Work execution truth: `workitems/sprints/*` + `workitems/backlog/BACKLOG.md`

---

## 11) High-Level Engineering Roadmap Template

Use this template for each sprint:
- Theme and user problem.
- Modules/services impacted.
- Contract changes (types, actions, events, schema).
- Security and privacy impact.
- Quality gates.
- Migration/backfill notes.
- KPI hypothesis and measurement plan.

Use this template for each major refactor:
- Why now.
- Boundary being protected.
- Risks and blast radius.
- Rollout plan (incremental slices).
- Compatibility layer strategy.
- Success criteria.

---

## 12) Practical Team Operating Instructions

For product:
- define feature outcomes in user-language first, then map to modules.

For design:
- preserve module identity while keeping shared shell consistency.

For engineering:
- implement smallest safe vertical slice through module + platform contracts.

For QA:
- validate both single-module behavior and cross-module cascades.

For growth/marketing:
- communicate suite value and specialist-agent differentiation, not “another AI chatbot.”

---

## 13) Launch-Ready Narrative (External-Facing Draft)

Nexus is the first AI life operating system built around specialist agents that actually coordinate. Instead of forcing your emotional life, health, finances, planning, and execution into disconnected tools, Nexus keeps one private, evolving understanding of your real state and routes you to the right domain intelligence at the right moment. It is adaptive, action-oriented, and privacy-first by architecture.

Sub-product positioning:
- Agnes for emotional clarity,
- Titan for performance readiness,
- Soma for biomedical grounding,
- Ledger for financial behavior intelligence,
- Atlas for execution planning,
- Scout for research signal,
- Forge for operational execution,
- all coordinated by Nexus.

---

## 14) Canonical References

- Product system definition: `docs/product/NEXUS_SYSTEM_DEFINITION.md`
- Product vision and architecture baseline: `docs/product/NEXUS_PRODUCT_DEFINITION.md`
- Runtime boundary details: `docs/architecture/llm-entrypoint-runtime.md`
- Work execution: `workitems/sprints/SPRINT_14.md`, `workitems/backlog/BACKLOG.md`

---

## 15) Expanded Product Surface Map (More Comprehensive)

This section clarifies Nexus as a complete product stack with reusable surfaces.

### 15.1 Experience layers
- Layer A: Brand + narrative layer (positioning, trust, specialist framing)
- Layer B: Interaction layer (chat, dashboards, overlays, route prompts, drafts)
- Layer C: Decision layer (module prompts, action tags, routing, recommendations)
- Layer D: State layer (profiles, NSV, memory, security policies)
- Layer E: Infrastructure layer (data adapter, auth adapter, model transport, event bus)

### 15.2 Product capabilities by maturity class
- Foundational: auth, vault, module routing, module chat, persistence, eventing
- Differentiating: NSV-aware behavior, cross-module delegation, alive UI orchestration
- Strategic: predictive loops, authority-gated soul writes, reusable multi-runtime core

### 15.3 Sub-product packaging model
- Core Suite: Orchestrator + Agnes + Titan + Ledger
- Intelligence Suite: Atlas + Scout
- Execution Suite: Forge
- Platform Surfaces: Hub + Profile + Bridge
- Clinical-adjacent surface: Soma

---

## 16) Decoupling and Portability Section (Write Once, Reuse Across KMP/JS/Native)

This section defines what must remain uncoupled so logic can be reused across runtimes (Web JS/TS, KMP, native wrappers).

### 16.1 Portability principle
- Domain logic should be platform-agnostic and framework-agnostic.
- UI frameworks should be replaceable shells.
- Infrastructure providers should be pluggable adapters.

### 16.2 What must NOT be tightly coupled
- Business/domain rules must not depend on React components.
- Action decision logic must not depend on Firebase SDK types.
- NSV ownership/read-permission policy must not depend on UI state stores.
- Spine event contracts must not depend on browser-only APIs.
- Prompt assembly contracts must not depend on specific rendering components.
- Memory consolidation rules must not depend on localStorage/sessionStorage directly.
- Security policy decisions must not depend on routing/UI code.

### 16.3 Reusable core candidates (write once)
- Type contracts:
  - profile contracts
  - NSV contracts
  - Spine event contracts
  - action contracts
- Pure policy engines:
  - NSV ownership + read filtering logic
  - routing intent heuristics
  - field/schema validation rules
  - consolidation thresholds and summarization policy
- Domain services (adapter-driven):
  - module profile orchestration rules
  - memory ranking and retrieval policies
  - cross-module conflict resolution policies
  - recommendation scoring logic
- Deterministic formatters/parsers:
  - action tag parsing rules
  - state formatting for prompts
  - document classification primitives

### 16.4 Keep platform-specific (do not force into shared core)
- React components and CSS/Tailwind styling
- Framer motion animation layer
- Router wiring and navigation transitions
- Browser storage implementations
- Firebase-specific transport concerns
- Web-specific camera/media capture components

### 16.5 Adapter boundaries required for KMP/JS portability
- `DataAdapter`:
  - get/set/update/query/subscribe/batch contracts
- `AuthAdapter`:
  - current user/session, login/logout, token refresh
- `SecureKeyAdapter`:
  - derive/store/unlock key material (Keychain/Keystore/WebCrypto bridge)
- `LLMTransportAdapter`:
  - send/stream request abstraction
- `EventBusAdapter`:
  - publish/subscribe, persistence policy hooks
- `Clock/TimerAdapter`:
  - scheduling, debounce, timeout controls
- `StorageAdapter`:
  - session/local fallback abstraction

### 16.6 Shared-core package target structure (recommended)
- `nexus-core-types`
- `nexus-core-policy`
- `nexus-core-events`
- `nexus-core-actions`
- `nexus-core-memory`
- `nexus-core-security`
- `nexus-platform-web` (React/Firebase/web adapters)
- `nexus-platform-kmp` (Kotlin multiplatform adapters)
- `nexus-platform-native` (iOS/Android wrappers around shared core)

### 16.7 Anti-coupling checklist for every PR
- Does this change add business logic into UI components?
- Does this change import platform SDK directly into policy/domain files?
- Can this rule execute with an in-memory adapter and no browser APIs?
- Are contracts expressed in shared types instead of framework objects?
- Is side-effect execution isolated behind adapters/interfaces?
- Could the same logic run unchanged in a KMP module?

### 16.8 Migration sequence (high-level)
- Phase 1: Extract shared type contracts from app/runtime files.
- Phase 2: Extract pure policy and deterministic logic into shared core.
- Phase 3: Define adapter interfaces and implement web adapters.
- Phase 4: Add KMP/native adapters with compatibility tests.
- Phase 5: Move module orchestration services to shared core where deterministic.
- Phase 6: Keep UI composition runtime-specific while reusing shared logic.

### 16.9 Success criteria for “write once” readiness
- 70%+ of non-UI business logic runs with in-memory adapters only.
- NSV + Spine + ActionHub policy tests run without browser/Firebase dependencies.
- Module orchestration flows produce identical outputs across web and non-web test harnesses.
- Porting a module to a new shell requires adapter wiring, not domain-rule rewrite.
