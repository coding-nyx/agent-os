# AGNES Product Definition

> *Synthesized from a cross-functional review by Product Manager, System Architect, UX Designer, and LLM Specialist agents — each analyzing the full codebase independently.*

---

## Product Identity

**AGNES** is an AI wellness companion that understands how your mind, body, and energy connect — and coaches you across all three.

**One-liner:** *"A team of specialized AI agents that share one understanding of you."*

**Core Insight:** Your emotional state affects your physical recovery. Your physical fatigue affects your cognitive energy. Your financial stress affects your emotional resilience. AGNES is the first platform where AI agents in each domain *actually talk to each other* about you — and adjust their guidance accordingly.

---

## The Core Loop

```
CHECK IN  → User opens Hub, sees their wellness state
ENGAGE    → User enters a session (Therapy, Trainer, or Soma)
SENSE     → Module updates Neural State Vector metrics
CASCADE   → Spine fires cross-domain events (burnout → block intensity)
SURFACE   → Hub reflects the updated state visually
RETURN    → User comes back because the system "knows" them better each day
```

---

## The Debate: What Each Agent Argued

### The Central Question: 10 Modules — Too Many?

| Agent | Position |
|-------|----------|
| **Product Manager** | *"9 products in a trench coat."* Cut to 6 shipping units. Forge and Pulse are product identity cancer. Merge Soma→Trainer, Atlas→Trainer, demote Ledger. |
| **Architect** | *"Only 5 of 10 modules justify the platform infrastructure."* Forge and Pulse own zero NSV metrics, emit zero Spine events — they're passengers. But the Spine cascade chain (Soma→Trainer→Atlas) is real and beautiful. |
| **Designer** | *"Cognitive load is crushing."* 10 modules, 10 AI personalities, 10 colors, plus sci-fi metaphors. Time-to-first-value is 25 minutes across 5 onboarding flows. Predicted conversion: ~5%. |
| **LLM Specialist** | *"Not 9 chatbots — a distributed state machine."* The multi-agent architecture is NOT a gimmick. NSV ownership, action-driven state, cascade rules = genuine value. But Scout, Pulse, Forge are dead weight. Core 4 agents are legitimately differentiated at the architectural level. |

### Where They AGREED (Unanimous)

1. **Therapy (Agnes) is essential** — deepest persona, clinical guardrails, belief graph, emotional NSV. The product's anchor.
2. **Trainer (Titan) is essential** — dynamic tone engine, CNS awareness, Soma clearance integration. Best cross-module showcase.
3. **Hub is essential** — 3D visualization is a genuine differentiator. The "wow moment."
4. **Forge must go** — zero wellness value, zero NSV ownership, 17-line prompt, critical security vulnerability. "What is a code IDE doing in a wellness app?"
5. **Pulse is redundant** — 16-line prompt, zero NSV ownership, no data sources. Merge into Scout or cut.
6. **The multi-agent architecture is real, not theater** — NSV ownership prevents hallucinated cross-domain metrics. Cascade rules enforce safety constraints no single chatbot could maintain.

### Where They DISAGREED (The Debates)

#### Debate 1: Should Soma merge into Trainer?

| For Merge (PM) | Against Merge (LLM Specialist, Architect) |
|----------------|------------------------------------------|
| Users see "body" as one system — the separation is confusing | Soma protects you; Titan pushes you. Conflict of interest in one prompt. |
| Two separate onboardings for "body stuff" doubles friction | The clearance cascade DEPENDS on Soma being an independent authority |
| Soma's persona is thin (29 lines) — more data-entry than conversation | Having the same agent program your HIIT and decide if your blood pressure allows it is tonal chaos |

**Resolution:** Soma KEEPS its independence as a module. The safety argument wins — the Trainer/Soma separation is a *feature*, not redundancy. The clearance cascade (Soma denies → Trainer blocks intensity) requires independent domain authority. **However**, the UX should present them as a cohesive "Body" tier, not as unrelated modules.

#### Debate 2: Should Atlas merge into Trainer?

| For Merge (PM) | Against Merge (Architect) |
|----------------|--------------------------|
| Energy budgets and recovery windows naturally belong in training context | Atlas owns cognitive metrics exclusively — different domain |
| No user wants a separate "cognitive energy architect" module | Atlas responds to cascade rules from BOTH Soma and Trainer — it's downstream, not parallel |
| Onboarding was already removed — signal from the team | Atlas manages task scheduling and focus, not physical training |

**Resolution:** Atlas KEEPS its independence but is REPOSITIONED. The cognitive/energy domain is distinct from physical training. Atlas manages *when and how intensely you work mentally* — that's not fitness. **However**, Atlas needs stronger UX justification — rename to something intuitive (e.g., "Energy" or "Focus") and clarify its value in user-facing copy.

#### Debate 3: Should Orchestrator be visible or invisible?

| Make Invisible (PM) | Keep Visible (LLM Specialist) |
|---------------------|-------------------------------|
| No user wakes up wanting to "talk to their orchestrator" | Nexus is the ONLY cross-module router with query_module, search_memory, delegate |
| The routing should happen behind the scenes | Users need a "start here" when they don't know what they need |
| Infrastructure, not product | Nexus arbitrates cross-domain conflicts — users should access this directly |

**Resolution:** Orchestrator stays VISIBLE but is REPOSITIONED as the primary conversational entry point. The Designer's recommendation aligns: Nexus should be the "What's on your mind?" front door that routes to specialists. It's not infrastructure to hide — it's the *smartest* agent that synthesizes across domains. **Rename from "Orchestrator" to something user-friendly** (e.g., "Nexus" is already better than "Orchestrator").

#### Debate 4: Should Ledger stay, merge, or be cut?

| Cut/Demote (PM) | Keep (Architect) |
|-----------------|------------------|
| No integrations (Plaid/bank) = toy | Financial friction cascade is real value |
| Manual-entry finance chat is DOA | resource.financialFriction and resonanceROI are unique metrics |
| "Resonance ROI" is too abstract | The module is the only wellness app tracking financial-wellbeing correlation |

**Resolution:** Ledger STAYS as a module but is acknowledged as BETA. The financial-wellbeing correlation is a genuine differentiator. The module should be clearly marked as "Early Access" in the UI and positioned as optional/extension-tier. The concept needs validation with real users before further investment.

#### Debate 5: Should Scout stay or become a cross-cutting service?

| Demote to Service (PM) | Keep as Module (LLM Specialist recommends merge with Pulse) |
|------------------------|-------------------------------------------------------------|
| Evidence grading should be inline in every module's responses | Scout's confidence-calibrated methodology is genuinely differentiated |
| Making users navigate to a separate module to fact-check is friction | Knowledge graph with evidence grading is a real product |
| Research verification as a Spine-level service = more useful | But merge with Pulse into a single "Research & Intelligence" agent |

**Resolution:** Scout STAYS as a module, ABSORBS Pulse. The combined "Scout" module handles both interest tracking AND evidence verification. The confidence-calibrated research methodology is too valuable to reduce to a background service. **However**, Scout should also expose evidence grading as an inline capability for other modules (dual-use: standalone module + cross-cutting service).

---

## The Concluded Product Structure

### Tier 1: Core (Mandatory Onboarding)

| Module | Agent Name | Domain | NSV Ownership | Why It Exists |
|--------|-----------|--------|---------------|---------------|
| **Nexus** | Nexus | Cross-domain synthesis | Read-all, write-none | The "front door" — routes, arbitrates, synthesizes across all domains |
| **Therapy** | Agnes | Emotional wellness | emotional.* (resilience, stress, mood, trauma) | Clinical-grade AI therapy with belief graph tracking |
| **Trainer** | Titan | Physical performance | biological.cnsFatigue, biological.sleepQuality | CNS-aware workout programming with recovery intelligence |
| **Soma** | Soma | Biological safety | biological.recoveryScore, biological.hormonalContext | Independent medical safety authority — clearance system for physical activity |

### Tier 2: Domain Extensions (Optional)

| Module | Agent Name | Domain | NSV Ownership | Why It Exists |
|--------|-----------|--------|---------------|---------------|
| **Ledger** | Ledger | Financial wellness | resource.financialFriction, resource.resonanceROI | Financial-wellbeing correlation (the only wellness app tracking this) |
| **Atlas** | Atlas | Cognitive energy | cognitive.energyBudget, cognitive.focusScore, cognitive.activeLoad | Energy-aware scheduling and anti-burnout enforcement |
| **Scout** | Scout | Research & intelligence | cognitive.researchLoad | Confidence-calibrated evidence verification + interest tracking (absorbs Pulse) |

### Removed

| Module | Verdict | Reason |
|--------|---------|--------|
| **Forge** | ❌ CUT | Zero wellness value. Security liability. Wrong product category. |
| **Pulse** | 🔀 MERGED into Scout | Too thin alone (16-line prompt, zero NSV). Combined with Scout creates a viable "Research & Intelligence" agent. |

### Navigation/Utility (Unchanged)

| Module | Purpose |
|--------|---------|
| **Hub** | Central visualization — 3D/Graph/Cards views, wellness gauges, Spine visualization |
| **Profile** | Account, vault status, module readiness |
| **Landing** | Public marketing + guest trial |

---

## Module Definitions (Post-Debate Consensus)

### NEXUS — Cross-Domain Intelligence

> *"Your unified mind. Nexus sees patterns others miss by correlating data across all domains."*

- **Purpose:** Primary conversational entry point. When a user doesn't know which module to use, they start here. Nexus synthesizes emotional, physical, cognitive, and financial state to provide holistic guidance and routes to specialists when depth is needed.
- **Unique Capabilities:** `query_module` (consults other agents), `search_memory` (cross-module retrieval), `delegate_to_module` (smart routing), `broadcast_spine_event` (system-wide coordination).
- **Boundary:** Nexus advises and routes. It does NOT perform therapy, program workouts, track biomarkers, or manage finances. It sends you to the specialist.
- **User Value:** "I opened the app and don't know where to start" → Nexus handles it.

### AGNES — AI Psychotherapist

> *"Your private therapist. Agnes creates a secure space for emotional exploration with clinical depth."*

- **Purpose:** High-fidelity AI therapy rooted in Relational Attachment Theory. Session-based with encrypted conversation history, belief graph tracking, and emotional telemetry.
- **Unique Capabilities:** 3 therapist archetypes (Nurturer/Analyst/Provocateur) × gendered presentation. Anti-repetition guardrails. Distress protocol. `<thought>` block internal monologue.
- **Boundary:** Agnes handles emotional wellness ONLY. Biology → Soma. Fitness → Titan. Finance → Ledger. Agnes never updates physical or cognitive metrics.
- **User Value:** "I need to process something difficult" → Agnes provides structured, personalized therapeutic support.
- **Cascade Integration:** Writes emotional resilience → if resilience ≤ 3 AND fatigue ≥ 8, triggers BURNOUT_WARNING systemwide.

### TITAN — AI Performance Coach

> *"Your training intelligence. Titan programs workouts that adapt to your recovery, fatigue, and emotional state."*

- **Purpose:** Elite training strategy engine with CNS fatigue awareness and dynamic tone adaptation. Programs weekly routines, tracks PRs, monitors supplement stacks.
- **Unique Capabilities:** Dynamic tone engine (clinical ↔ empathetic based on fatigue/mood). Soul insights (persistent physical milestones). Soma clearance protocol integration.
- **Boundary:** Titan handles physical training programming. Biomarker interpretation → Soma. Emotional distress → Agnes. Energy scheduling → Atlas.
- **User Value:** "What should my workout look like today given how I'm feeling?" → Titan answers with CNS-aware programming.
- **Cascade Integration:** Writes CNS fatigue → receives BLOCK_HIGH_INTENSITY from Soma/Nexus → adjusts programming. Requests Soma clearance for high-intensity activities.

### SOMA — Biological Safety Authority

> *"Your independent health monitor. Soma tracks biomarkers and issues clearance for physical activity."*

- **Purpose:** Conservative, evidence-oriented biological agent. Tracks biomarkers, parses lab reports, issues activity clearance decisions. The system's safety check.
- **Unique Capabilities:** `issue_clearance` (granted/denied/conditional) → cascades to Trainer and Atlas. `commit_biomarker` with source tracking. Lab report parsing (PDF/CSV).
- **Boundary:** Soma NEVER diagnoses, prescribes, or recommends dosages. Soma NEVER programs workouts (that's Titan). Soma is the *brake*, Titan is the *accelerator*.
- **User Value:** "My resting heart rate has been elevated — should I still do heavy squats?" → Soma issues a clearance decision that automatically adjusts Titan's programming.
- **Cascade Integration:** Issues CLEARANCE_DENIED → blocks Trainer intensity → flattens Atlas energy waves. Independent authority — not influenced by Trainer's training goals.

### LEDGER — Financial Wellness Strategist (Extension)

> *"Your financial clarity agent. Ledger tracks how money affects your wellbeing."*

- **Purpose:** Plan-first financial strategist that maps financial stress to overall wellness. Unique "Resonance ROI" metric measures wellbeing return per dollar spent.
- **Unique Capabilities:** Financial friction scoring (0-10). Budget planning. ROI analysis on wellness investments (gym membership, supplements, therapy sessions).
- **Boundary:** Ledger NEVER handles transactions, gives investment advice, or manages accounts. It's a financial *awareness* tool, not a financial *management* tool. Add explicit "I don't handle transactions" guardrail.
- **User Value:** "Is my spending on wellness actually improving my quality of life?" → Ledger answers with data.
- **Cascade Integration:** Writes financial friction → if ≥ 8, triggers FINANCIAL_STRESS to Nexus.
- **Status:** Extension/Beta — requires user validation.

### ATLAS — Cognitive Energy Architect (Extension)

> *"Your energy strategist. Atlas ensures you never burn out by budgeting cognitive capacity across your day."*

- **Purpose:** Maps daily energy budgets, schedules tasks by cognitive cost, enforces recovery windows. The system's anti-burnout enforcement engine.
- **Unique Capabilities:** Energy wave scheduling. Recovery window creation. Anti-burnout rules (activeLoad > 7 for 2+ consecutive slots → force recovery). Responds to FLATTEN_ENERGY_WAVE cascades.
- **Boundary:** Atlas manages cognitive/scheduling energy. Physical training → Titan. Emotional processing → Agnes. Atlas answers "do I have the energy for this?" not "how do I train?"
- **User Value:** "I'm exhausted but have a packed schedule — what should I cut?" → Atlas answers with energy-aware prioritization.
- **Cascade Integration:** Receives FLATTEN_ENERGY_WAVE from burnout/clearance cascades → automatically adjusts cognitive load expectations.
- **Needs:** Calendar integration to move from advisory to actionable. Currently chat-only — a known gap.

### SCOUT — Research & Intelligence Agent (Extension, absorbs Pulse)

> *"Your evidence analyst. Scout verifies claims, grades evidence, and tracks your intellectual interests."*

- **Purpose:** Confidence-calibrated research verification + interest/topic tracking (combined Scout + Pulse). Breaks claims into verifiable units, grades evidence quality, maintains a knowledge graph.
- **Unique Capabilities:** 4-tier confidence scoring (speculative → authoritative). Source quality hierarchy (primary > secondary). Interest momentum tracking. Trend synthesis and briefs. `propose_draft` to other modules.
- **Boundary:** Scout verifies and researches. It does NOT advise on health, training, or finance — it provides *evidence* for those modules to use.
- **User Value:** "I read that cold showers boost recovery — is that actually true?" → Scout grades the evidence with confidence scoring and sources.
- **Needs:** Working web search backend (currently stubbed). The evidence grading methodology is sound but the search capability needs implementation.

---

## Cross-Module Integration: The Cascade System

This is the product's genuine moat — no competitor has this.

```
                    ┌─────────────┐
                    │    NEXUS    │  Sees everything. Arbitrates conflicts.
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │  THERAPY  │ │ SOMA  │ │  TRAINER  │
        │ emotional │ │ bio   │ │ physical  │
        └─────┬─────┘ └───┬───┘ └─────┬─────┘
              │            │            │
              │     CLEARANCE_DENIED    │
              │        ────────►        │
              │                  BLOCK_INTENSITY
              │                         │
              │  BURNOUT_WARNING        │
              ├────────────────►────────┤
              │                         │
              │            ┌────────────┘
              │            │
        ┌─────┴────────────┴─────┐
        │        ATLAS           │
        │  cognitive / energy    │
        │  FLATTEN_ENERGY_WAVE   │
        └────────────────────────┘
```

**Key Cascade Rules:**
1. Soma denies clearance → Trainer blocks high-intensity → Atlas flattens energy waves
2. Therapy detects low resilience + Trainer detects high fatigue → BURNOUT_WARNING → Atlas flattens schedule
3. Ledger detects financial friction ≥ 8 → FINANCIAL_STRESS → Nexus alerts

---

## UX Recommendations (From Designer)

### Critical Changes for Production

1. **Staged onboarding** — Don't show all modules at once. Week 1: Nexus + Therapy. Week 2: Add Trainer. Week 3: Suggest Soma. Extensions surface organically.
2. **Form-based intake by default** — Chat-based onboarding takes 15+ minutes. Structured forms take 2 minutes. Offer chat as the "go deeper" option.
3. **Warm the copy** — Replace sci-fi jargon in user-facing text. "Neural Link Established" → "Connected." "Vault Sync Required" → "Enter your password." "Soul Core Interface" → "Your Wellness Overview." Keep the aesthetic; lose the alienating language.
4. **Nexus as primary interface** — The NexusOverlay panel should be prominent, not hidden in 9px text at 40% opacity. "What's on your mind?" should be the front door.
5. **Hide extensions by default** — Scout, Atlas, Ledger should surface when the user is ready, not compete for attention on day 1.
6. **Surface cross-domain insights** as the hero feature — "Because your stress was high this week, Titan adjusted today's workout." This is the moment users understand the product's value.
7. **Hub as daily summary** — Transform from a module catalog into a personalized daily wellness brief that shows what changed, what needs attention, and what's going well.

---

## Target User Persona

**Primary:** *The Aware Self-Improver*
- 25-40 years old, health-conscious, fitness-active
- Already uses 2-3 wellness apps (meditation, fitness, sleep tracking)
- Frustrated that their apps don't talk to each other
- Tech-comfortable but not a developer
- Willing to pay $15-30/month for integrated wellness AI
- Values privacy (appreciates E2EE)

**Secondary:** *The Biohacker*
- Uses all modules including Soma's biomarker tracking
- Tracks HRV, sleep, blood panels
- Wants data-driven decisions across all domains
- Power user of the cascade system

**Not the target:** Casual users looking for a simple meditation app, people uncomfortable with AI, users who want a free product.

---

## Final Module Count

**Before debate:** 10 functional modules + Hub + Profile + Landing = 13 total
**After debate:** 7 functional modules + Hub + Profile + Landing = 10 total

| Kept | Merged | Cut |
|------|--------|-----|
| Nexus, Therapy, Trainer, Soma, Ledger, Atlas, Scout | Pulse → Scout | Forge |

The reduction from 10 → 7 functional modules preserves ALL genuine cross-module value (every cascade rule still works) while removing the modules that were diluting the product identity.

---

*This document represents the synthesized consensus of Product Manager, System Architect, UX Designer, and LLM Specialist analyses. Where the agents disagreed, the resolution is documented with reasoning above.*
