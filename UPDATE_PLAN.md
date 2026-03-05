# NYX NEURAL ARCHITECTURE — MASTER REWRITE PLAN (v3.0)

## Problem Statement

AGNES has a **prompt-stuffing architecture** with no real orchestration, no memory retrieval, and no reactive cross-module communication. The "orchestrator" is just another chat. Cross-module data is 3 numbers in Firestore. Past session history is stored but never retrieved. Zero RAG.

---

## COMPLETE MODULE ROSTER (10 Agents)

### Core SoT Modules (Domain Authorities — own their data)
| # | Module | Persona | NSV Domain | Data Owned |
|---|--------|---------|------------|------------|
| 1 | **Orchestrator** | **Nyx** | System | CoreProfile, GlobalSoul, module routing, cascade rules |
| 2 | **Therapy** | **Agnes** | [E]motional | Resilience, therapeutic baseline, belief graph, trauma markers |
| 3 | **Trainer** | **Titan** | [B]+[E] | Routines, PRs, RPE, workout history, CNS fatigue |
| 4 | **Soma** | **Soma** | [B]iological | Bloodwork, DNA, labs, HRV, hormones, sleep, medical history |
| 5 | **Ledger** | **Dr. Ledger** | [R]esource | Financial friction, spending-wellness, Resonance ROI |
| 6 | **Atlas** | **Atlas** | [C]ognitive | Energy waves, schedules, task graph, recovery windows |

### Cognitive Extensions (Specialized Tools)
| # | Module | Persona | Purpose |
|---|--------|---------|---------|
| 7 | **Scout** | **Scout** | Research graph, fact-checking, medical/technical vetting |
| 8 | **Forge** | **Forge** | Coding agent, nyx-link local daemon, filesystem execution |
| 9 | **Pulse** | **Pulse** | Interest observer, physics-based bubble map, news synthesis |
| 10 | **Bridge** | (daemon) | Alert routing: WhatsApp, Email, push notifications |

---

## THE GENERATION PIPELINE (How LLM Calls Work)

### Current Flow (What Exists Now)
```
User message
  → useModuleAI.handleSendMessage(content)
  → PersonaFactory.generateSystemPrompt()     // Layer 2: identity sync
  → enhanceContext()                           // Layer 3: 3 vitals numbers
  → Agent.chat()
    → MemoryManager.buildContext()             // slice last 30 msgs
    → Agent.formatSystemPrompt()              // Layer 4: empty memory
    → Orchestrator.sendMessage()              // POST openrouter.ai
      → tool_call loop (max 5)
      → stream SSE chunks
  → parse <action> tags
  → SchemaGuard (MODULE_ACTION_REGISTRY)
  → batch vitals → Firestore
  → strip tags → display
```

### New Flow (The Rewrite)
```
User message
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 0: NYX INTENT CLASSIFICATION                               │
│                                                                 │
│ Nyx receives ALL messages first (via GlobalNyxTrigger or route) │
│ Quick LLM call with MODULE_MANIFEST:                            │
│   "Classify intent. Route to: therapy|trainer|soma|atlas|       │
│    ledger|scout|forge|pulse|self"                               │
│                                                                 │
│ Tool calls available to Nyx:                                    │
│   delegate_to_module(moduleId, context, instruction)            │
│   query_module(moduleId, question)    // silent cross-query     │
│   broadcast_spine_event(event)        // trigger cascade        │
│   propose_draft(moduleId, proposal)   // Ghost UI suggestion    │
│   search_memory(query, modules[])     // RAG retrieval          │
│                                                                 │
│ If intent = self → Nyx responds directly                        │
│ If intent = module → delegate with enriched context             │
│ If intent = multi → parallel fan-out to modules, merge results  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: RAG RETRIEVAL (Before Prompt Assembly)                  │
│                                                                 │
│ EmbeddingService.embed(userMessage + last 3 msgs)               │
│   → query vector: float[]                                       │
│                                                                 │
│ MemoryStore.search(queryVector, {                               │
│   modules: [targetModule],      // scope to relevant module     │
│   topK: 5,                      // top 5 similar sessions       │
│   recencyBias: 0.3,             // blend relevance + recency    │
│   maxTokens: 2000               // cap retrieval budget         │
│ })                                                              │
│   → RetrievedMemory[] = [                                       │
│       { sessionDate, summary, relevanceScore, keyInsights[] },  │
│       ...                                                       │
│     ]                                                           │
│                                                                 │
│ SemanticMemory.getFacts(targetModule)                            │
│   → StableFact[] = [                                            │
│       { fact: "User has chronic shoulder injury", confidence },  │
│       { fact: "User prefers direct communication", confidence },│
│       ...                                                       │
│     ]                                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: PROMPT ASSEMBLY (5 Layers, expanded from current 4)     │
│                                                                 │
│ Layer 1: MODULE BASE PERSONA                                    │
│ ┌─────────────────────────────────────────────────────────┐     │
│ │ therapy  → AGNES_PERSONA + buildTherapySessionPrompt()  │     │
│ │            (identity, struggles, goals, therapist prefs) │     │
│ │ trainer  → TITAN_PERSONA + buildTrainerSessionPrompt()  │     │
│ │            (nutrition, activity, routines, PRs)          │     │
│ │ soma     → SOMA_PERSONA + buildSomaSessionPrompt()      │     │
│ │            (biomarkers, lab history, medical alerts)     │     │
│ │ atlas    → ATLAS_PERSONA + buildAtlasSessionPrompt()    │     │
│ │            (energy wave state, schedule, task graph)     │     │
│ │ ledger   → LEDGER_PERSONA + financial context           │     │
│ │ scout    → SCOUT_PERSONA + research graph context       │     │
│ │ forge    → FORGE_PERSONA + workspace context            │     │
│ │ pulse    → PULSE_PERSONA + interest map state           │     │
│ └─────────────────────────────────────────────────────────┘     │
│                                                                 │
│ Layer 2: IDENTITY SYNC (PersonaFactory — exists today)          │
│ ┌─────────────────────────────────────────────────────────┐     │
│ │ [IDENTITY_SYNC]                                         │     │
│ │ Agent name, gender personality, user name/pronouns      │     │
│ │ [BIOLOGICAL_CONTEXT] if applicable                      │     │
│ └─────────────────────────────────────────────────────────┘     │
│                                                                 │
│ Layer 3: NEURAL STATE VECTOR (expanded from 3 numbers)          │
│ ┌─────────────────────────────────────────────────────────┐     │
│ │ [GLOBAL NEURAL STATE]                                   │     │
│ │ Biological [B]:                                         │     │
│ │   CNS Fatigue: 3/10, Sleep: 7/10, HRV: 65ms           │     │
│ │   Recovery Score: 8/10, Hormonal: luteal phase          │     │
│ │ Emotional [E]:                                          │     │
│ │   Resilience: 7/10, Stress: 4/10, Mood: improving      │     │
│ │ Cognitive [C]:                                          │     │
│ │   Energy Budget: 6/10, Focus: 7/10, Active Load: 3     │     │
│ │ Resource [R]:                                           │     │
│ │   Financial Friction: 2/10, Resonance ROI: 0.8         │     │
│ │                                                         │     │
│ │ ACTIVE SPINE EVENTS:                                    │     │
│ │ - [2min ago] Trainer: CNS fatigue elevated to 7         │     │
│ │ - [1hr ago] Therapy: Breakthrough session on boundaries │     │
│ │                                                         │     │
│ │ CROSS-MODULE ALERTS:                                    │     │
│ │ - ⚠ BURNOUT_RISK: cnsFatigue>7 + resilience<4          │     │
│ │ - ⚠ SOMA_CLEARANCE: high_intensity BLOCKED              │     │
│ └─────────────────────────────────────────────────────────┘     │
│                                                                 │
│ Layer 4: RETRIEVED MEMORY (NEW — currently empty)               │
│ ┌─────────────────────────────────────────────────────────┐     │
│ │ [RECALLED CONTEXT]                                      │     │
│ │ RELEVANT PAST SESSIONS:                                 │     │
│ │ - [Mar 1, Therapy] User discussed childhood abandonment │     │
│ │   pattern. Breakthrough on self-worth narrative.        │     │
│ │ - [Feb 28, Trainer] Set squat PR at 140kg. CNS was at  │     │
│ │   recovery 9/10. Reported feeling "unstoppable."        │     │
│ │                                                         │     │
│ │ STABLE FACTS (Semantic Memory):                         │     │
│ │ - User has chronic right shoulder impingement           │     │
│ │ - User prefers direct, analytical communication        │     │
│ │ - User works night shifts (affects sleep/cortisol)      │     │
│ └─────────────────────────────────────────────────────────┘     │
│                                                                 │
│ Layer 5: ENGINE WRAPPING (MemoryManager — exists today)         │
│ ┌─────────────────────────────────────────────────────────┐     │
│ │ [MEMORY CONTEXT] — now populated, not empty             │     │
│ │ Sliding window: last 30 messages                        │     │
│ │ Token count tracking                                    │     │
│ │ Consolidation trigger at 80% of context limit           │     │
│ └─────────────────────────────────────────────────────────┘     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: LLM CALL (Enhanced Engine)                              │
│                                                                 │
│ Model Selection (per module):                                   │
│   Core SoT modules → S_REASONING tier (deepseek, o1, etc.)     │
│   Scout research   → A_STANDARD tier (fast, factual)            │
│   Forge coding     → S_REASONING tier (code-optimized)          │
│   Nyx routing      → B_ECONOMY tier (fast classification)       │
│                                                                 │
│ Tool Call Expansion (per module):                                │
│   therapy:  [update_soul_resilience, request_biometric,         │
│              update_belief_graph, compact_session_soul]          │
│   trainer:  [update_cns_fatigue, update_sleep_quality,          │
│              update_routine, request_soma_clearance]             │
│   soma:     [commit_biomarker, parse_lab_report,                │
│              issue_clearance, update_biological_state]           │
│   atlas:    [update_energy_wave, flatten_schedule,               │
│              create_recovery_window, update_task_graph]          │
│   ledger:   [update_financial_friction, compute_resonance_roi,  │
│              flag_neural_gap, request_diagnostic_sync]           │
│   scout:    [add_knowledge_node, verify_claim,                  │
│              search_web, update_research_graph]                  │
│   forge:    [execute_code, read_file, write_file,               │
│              nyx_link_command]                                   │
│   pulse:    [update_interest_map, track_topic,                  │
│              synthesize_trends]                                  │
│                                                                 │
│ Streaming → SSE chunks → onChunk callback → UI                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: RESPONSE PROCESSING (Enhanced)                          │
│                                                                 │
│ 4a. Parse <action> and <tool_call> tags                         │
│ 4b. SchemaGuard: validate against MODULE_ACTION_REGISTRY        │
│ 4c. Ghost UI Check: if action = propose_draft → show as draft   │
│     ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐               │
│     ┆ NeuralDraft: dashed border, 50% opacity  ┆               │
│     ┆ [✓ Approve]  [✗ Dismiss]  [✎ Edit]       ┆               │
│     └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘               │
│ 4d. Approved actions → SpineEventBus.emit()                     │
│ 4e. Cascade rules fire (debounced, max depth 3)                 │
│ 4f. NSV atomic update → Firestore (onSnapshot → all modules)    │
│ 4g. Strip tags → display clean publicText                       │
│ 4h. Auto-save session → active_sessions                         │
│ 4i. If context > 80% → trigger consolidation:                   │
│     → summarize old messages via LLM                            │
│     → extract key facts → embed → store in episodic memory      │
│     → compact sliding window                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## STATE ARCHITECTURE

### Neural State Vector (NSV) — The Shared Bus

```typescript
// src/lib/types/neural-state-vector.ts
interface NeuralStateVector {
  // [B]iological — PRIMARY: Soma, SECONDARY: Trainer
  biological: {
    cnsFatigue: number;           // 0-10, written by Trainer (→ Soma in Phase 3)
    sleepQuality: number;         // 0-10, written by Trainer (→ Soma in Phase 3)
    hormonalContext: string;      // written by Soma
    hrvBaseline: number;          // written by Soma
    recoveryScore: number;        // written by Soma (composite)
    biomarkerAlerts: string[];    // written by Soma ("low iron", "high cortisol")
  };
  // [E]motional — PRIMARY: Therapy
  emotional: {
    resilience: number;           // 0-10, written by Therapy (existing)
    stressLevel: number;          // 0-10, written by Therapy
    moodTrend: 'improving' | 'stable' | 'declining';
    activeTraumaMarkers: string[];  // written by Therapy
  };
  // [C]ognitive — PRIMARY: Atlas, SECONDARY: Scout
  cognitive: {
    energyBudget: number;         // 0-10, written by Atlas
    focusCapacity: number;        // 0-10, written by Atlas
    activeLoad: number;           // task count, written by Atlas
    researchLoad: number;         // active research threads, written by Scout
  };
  // [R]esource — PRIMARY: Ledger
  resource: {
    financialFriction: number;    // 0-10, written by Ledger
    resonanceROI: number;         // wellness-per-dollar, written by Ledger
    budgetStatus: 'surplus' | 'balanced' | 'deficit';
  };
}

// Each NSV field has metadata
interface NSVField {
  value: number | string;
  writtenBy: string;              // module that last wrote
  writtenAt: number;              // timestamp
  confidence: number;             // 0-1, how certain the module is
  source: 'ai_inference' | 'user_input' | 'parsed_data' | 'cascade';
}
```

### State Flow Diagram (Complete)

```
                    ┌───────────────────────────────────┐
                    │           USER INPUT               │
                    │  (text, file upload, interaction)   │
                    └────────────────┬──────────────────┘
                                     │
                    ┌────────────────▼──────────────────┐
                    │         NYX (Intent Router)        │
                    │  classify → route → delegate       │
                    └──┬──┬──┬──┬──┬──┬──┬──┬──┬───────┘
                       │  │  │  │  │  │  │  │  │
         ┌─────────────┘  │  │  │  │  │  │  │  └─────────────┐
         ▼                ▼  │  │  │  │  │  ▼                 ▼
    ┌─────────┐    ┌─────────┐│  │  │  │  │┌─────────┐  ┌─────────┐
    │ Therapy │    │ Trainer ││  │  │  │  ││  Forge  │  │  Bridge │
    │ (Agnes) │    │ (Titan) ││  │  │  │  ││         │  │ (daemon)│
    └────┬────┘    └────┬────┘│  │  │  │  │└────┬────┘  └────┬────┘
         │              │     │  │  │  │  │     │            │
         │              │     ▼  │  │  ▼  │     │            │
         │              │  ┌─────┐│  │┌─────┐   │            │
         │              │  │Soma ││  ││Scout│   │            │
         │              │  └──┬──┘│  │└──┬──┘   │            │
         │              │     │   ▼  │   │      │            │
         │              │     │┌─────┐   │      │            │
         │              │     ││Atlas│   │      │            │
         │              │     │└──┬──┘   │      │            │
         │              │     │   │  ┌───┘      │            │
         │              │     │   │  │  ┌───────┘            │
         │              │     │   │  │  │                    │
         ▼              ▼     ▼   ▼  ▼  ▼                    │
    ┌─────────────────────────────────────────────────────┐   │
    │              SPINE EVENT BUS                         │   │
    │  SpineEvent { type, source, target, domain,         │   │
    │               data, timestamp, cascadeDepth }       │   │
    │                                                     │   │
    │  CASCADE RULES ENGINE:                              │   │
    │  ┌───────────────────────────────────────────────┐  │   │
    │  │ IF emotional.resilience < 3                    │  │   │
    │  │   → EMIT REDUCE_TRAINING_LOAD → Trainer       │  │   │
    │  │   → EMIT FLATTEN_ENERGY_WAVE → Atlas          │  │   │
    │  │                                               │  │   │
    │  │ IF biological.cnsFatigue > 7                   │  │   │
    │  │   → EMIT BLOCK_HIGH_INTENSITY → Trainer       │  │   │
    │  │   → EMIT FLATTEN_ENERGY_WAVE → Atlas          │  │   │
    │  │   → EMIT BURNOUT_WARNING → Nyx (surface)  ───────→ Bridge
    │  │                                               │  │   │
    │  │ IF biological.recoveryScore > 8               │  │   │
    │  │   → EMIT RECOVERY_AVAILABLE → Trainer, Atlas  │  │   │
    │  │                                               │  │   │
    │  │ IF soma.clearance('high_intensity') = false    │  │   │
    │  │   → EMIT CLEARANCE_DENIED → Trainer           │  │   │
    │  │                                               │  │   │
    │  │ IF cognitive.activeLoad > 8                    │  │   │
    │  │   → EMIT COGNITIVE_OVERLOAD → Atlas, Nyx      │  │   │
    │  │                                               │  │   │
    │  │ IF resource.budgetStatus = 'deficit'           │  │   │
    │  │   → EMIT FINANCIAL_STRESS → Therapy, Nyx      │  │   │
    │  │                                               │  │   │
    │  │ GUARDS: cascadeDepth < 3, debounce 500ms      │  │   │
    │  └───────────────────────────────────────────────┘  │   │
    └─────────────────────────┬───────────────────────────┘   │
                              │                               │
                              ▼                               │
    ┌─────────────────────────────────────────────────────┐   │
    │          NEURAL STATE VECTOR (Firestore)             │   │
    │          global_souls/{uid}                           │   │
    │                                                     │   │
    │  onSnapshot() → real-time sync to all modules       │   │
    │  Every write → SpineEventBus.emit(VITAL_UPDATED)    │   │
    └─────────────────────────┬───────────────────────────┘   │
                              │                               │
                              ▼                               │
    ┌─────────────────────────────────────────────────────┐   │
    │              MEMORY LAYER (RAG)                       │   │
    │                                                     │   │
    │  Tier 1: Working Memory (current session, 30 msgs)  │   │
    │  Tier 2: Episodic Memory (embedded session summaries)│   │
    │  Tier 3: Semantic Memory (stable facts, patterns)    │   │
    └─────────────────────────────────────────────────────┘   │
                                                              │
    ┌─────────────────────────────────────────────────────┐   │
    │              BRIDGE (Alert Daemon)                    │◄──┘
    │  Receives BURNOUT_WARNING, CLEARANCE_DENIED, etc.    │
    │  Routes to: WhatsApp, Email, push notification       │
    │  User configurable: which events → which channel     │
    └─────────────────────────────────────────────────────┘
```

---

## EACH MODULE IN DETAIL

### 1. NYX (Orchestrator) — The Nervous System

**Current**: Just a chat with a persona. Registered actions have no handlers.
**New**: True intent router + system coordinator.

```
ROLE: Receives all user messages. Classifies intent. Delegates.
      Manages system-level operations (profile, vault, soul).
      Surfaces cross-module alerts and burnout warnings.
      
TOOLS:
  delegate_to_module(moduleId, context, instruction)
    → Routes user message to specialist module with enriched context
    → Can do background delegation (user stays in Nyx, module processes silently)
    
  query_module(moduleId, question)
    → Silent cross-query. E.g., Nyx asks Soma: "Is user recovered enough for HIIT?"
    → Returns answer without switching UI
    
  broadcast_spine_event(event)
    → Manually trigger cascade (e.g., user says "I'm burnt out")
    
  propose_draft(moduleId, proposal)
    → Ghost UI: "Titan suggests deload week. Approve?"
    
  search_memory(query, modules[], topK)
    → RAG query across episodic + semantic memory

STATE WRITES: CoreProfile, GlobalSoul metadata (displayNames, agentGenders)
STATE READS: Full NSV, all module statuses, spine event history
FIRESTORE: users/{uid}, global_souls/{uid}
```

### 2. AGNES (Therapy) — Emotional Domain [E]

**Current**: Functional. Writes emotionalResilience. Has archetypes (Nurturer/Analyst/Provocateur).
**Upgrade**: Add Belief Graph data model, write more E fields.

```
ROLE: AI psychotherapist. Attachment theory + psychodynamics.
      3 clinical archetypes with gender postures.

TOOLS:
  update_soul_resilience(score, reason)     // existing
  update_stress_level(score, context)       // NEW
  update_mood_trend(trend, evidence)        // NEW
  update_belief_graph(node, connections)    // NEW: persistent psych map
  compact_session_soul(insights)            // NEW: extract session learnings
  request_biometric(metric, reason)         // existing

STATE WRITES: emotional.resilience, emotional.stressLevel, emotional.moodTrend,
              emotional.activeTraumaMarkers, therapeuticBaseline, beliefGraph
STATE READS: biological.cnsFatigue, biological.sleepQuality, biological.hormonalContext
FIRESTORE: therapist_profiles/{uid} (E2EE), belief_graphs/{uid} (E2EE)
CLEARANCE: None needed (Therapy is always available)
```

### 3. TITAN (Trainer) — Performance Domain [B/E]

**Current**: Functional. Writes cnsFatigue, sleepQuality. Has routines and PR tracking.
**Upgrade**: Add Soma clearance check before high-intensity work.

```
ROLE: Elite AI trainer. Sports science + systems thinking.
      Dynamic tone based on CNS/mood.

TOOLS:
  update_cns_fatigue(score, reason)            // existing
  update_sleep_quality(score, reason)          // existing
  update_trainer_profile(partialProfile)       // existing
  update_routine(routines[])                   // existing
  request_soma_clearance(activityType)         // NEW: asks Soma before HIIT
  log_pr(exercise, weight, reps, date)         // NEW: structured PR tracking
  request_atlas_energy_check()                 // NEW: check energy budget

STATE WRITES: biological.cnsFatigue, biological.sleepQuality, trainerProfile.routines
STATE READS: biological.recoveryScore (from Soma), emotional.resilience (from Therapy),
             cognitive.energyBudget (from Atlas)
FIRESTORE: ai_trainers/{uid} (E2EE), training_logs/{uid} (E2EE)
CLEARANCE: Requests biological clearance from Soma for high-intensity work
```

### 4. SOMA — Biological Source of Truth [B]

**New module.** Takes over biological data ownership from Trainer.

```
ROLE: The Physician. Parses lab reports, tracks biomarkers, 
      maintains medical history. Issues biological clearances.
      Human-in-the-Loop for all data commits.

TOOLS:
  parse_lab_report(fileContent, fileType)
    → LLM extracts structured biomarkers from PDF/CSV text
    → Returns parsed data as Ghost UI draft (user must approve)
    
  commit_biomarker(type, value, unit, date, source)
    → Stores verified biomarker to soma profile
    
  issue_clearance(activityType, cleared, reason)
    → Other modules query this: "Can user do HIIT?"
    → Returns { cleared: bool, reason: string, constraints?: string[] }
    
  update_biological_state(updates)
    → Write to NSV biological domain
    
  flag_medical_alert(alert)
    → "Low iron trend detected" → SpineEventBus → Nyx surfaces it

DATA MODEL:
  SomaProfile {
    biomarkers: BiomarkerRecord[]    // { type, value, unit, date, source, normalRange }
    labReports: ParsedReport[]       // { fields[], rawText, parseDate }
    medicalHistory: {
      conditions: string[]
      medications: string[]
      allergies: string[]
    }
    biometricStreams: {
      sleep: SleepRecord[]
      hrv: HRVRecord[]
      weight: WeightRecord[]
    }
    clearanceCache: {
      [activityType]: { cleared, reason, expiresAt }
    }
  }

STATE WRITES: biological.* (ALL biological fields — this is the SoT)
STATE READS: emotional.stressLevel (stress affects biomarkers),
             cognitive.activeLoad (cognitive load affects recovery)
FIRESTORE: soma_profiles/{uid} (E2EE)
CLEARANCE: None needed (Soma IS the clearance authority)
```

### 5. DR. LEDGER — Resource Domain [R]

**Current**: Read-only. Synthesizes gaps from vitals but can't write back. Dead actions.
**Upgrade**: Full write capability. Financial-wellness correlation.

```
ROLE: Chief Medical Officer + Resource Physician.
      Cross-references spending with wellness outcomes.
      Identifies "Financial Friction" — spending that degrades wellness.

TOOLS:
  update_financial_friction(score, analysis)     // NEW
  compute_resonance_roi(data)                    // NEW: wellness-per-dollar
  flag_neural_gap(gap)                           // FIXED (was dead action)
  request_diagnostic_sync(modules[])             // FIXED (was dead action)
  log_expense(amount, category, wellnessImpact)  // NEW

DATA MODEL:
  LedgerProfile {
    expenses: ExpenseRecord[]
    financialFriction: number
    resonanceROI: number
    neuralGaps: NeuralGap[]     // { type, severity, affectedModules, recommendation }
    correlations: Correlation[] // { spending_category, wellness_metric, direction, strength }
  }

STATE WRITES: resource.financialFriction, resource.resonanceROI, resource.budgetStatus
STATE READS: ALL NSV domains (needs full picture for correlation)
FIRESTORE: ai_ledgers/{uid} (E2EE)
```

### 6. ATLAS — Cognitive Domain [C]

**New module.** Energy-based scheduling, not time-based.

```
ROLE: Energy Architect. Non-linear temporal planning.
      "Canyons" = depletion tasks, "Swells" = recovery periods.
      Auto-flattens schedule when fatigue detected.

TOOLS:
  update_energy_wave(wave)
    → Set the user's energy wave (array of canyon/swell segments)
    
  flatten_schedule(reason)
    → Emergency: convert all canyons to swells when burnout detected
    → Triggered by CASCADE RULE or manual
    
  create_recovery_window(duration, position)
    → Insert swell (recovery) into the wave
    
  update_task_graph(tasks)
    → Add/modify/remove tasks with dependencies and energy costs
    
  request_bridge_alert(message, channel, urgency)
    → Send alert via Bridge daemon (WhatsApp/Email)

DATA MODEL:
  AtlasProfile {
    energyWave: EnergySegment[]  // { type: 'canyon'|'swell', duration, intensity, tasks[] }
    taskGraph: {
      nodes: Task[]              // { id, title, energyCost, deadline?, dependencies[] }
      edges: Dependency[]
    }
    schedule: ScheduleEvent[]
    recoveryWindows: RecoveryWindow[]
  }

STATE WRITES: cognitive.energyBudget, cognitive.focusCapacity, cognitive.activeLoad
STATE READS: biological.cnsFatigue, biological.recoveryScore, emotional.resilience
FIRESTORE: atlas_profiles/{uid} (E2EE)
CASCADE LISTENER: FLATTEN_ENERGY_WAVE, RECOVERY_AVAILABLE, COGNITIVE_OVERLOAD
```

### 7. SCOUT — Knowledge Extension

**New module.** Research assistant + fact-checker.

```
ROLE: Persistent research graph. Fact-checks claims.
      Medical/technical vetting. Citation tracking.

TOOLS:
  add_knowledge_node(topic, summary, sources[], confidence)
  verify_claim(claim)
    → Returns { verdict: 'confirmed'|'disputed'|'unverifiable', sources[], reasoning }
  search_web(query)                // if web access available
  update_research_graph(updates)
  query_knowledge(topic)           // other modules can ask Scout questions

DATA MODEL:
  ScoutKnowledge {
    nodes: KnowledgeNode[]        // { topic, summary, sources[], confidence, lastVerified }
    edges: KnowledgeEdge[]        // { from, to, relationship, strength }
    factChecks: FactCheck[]       // { claim, verdict, sources[], timestamp }
    researchThreads: Thread[]     // active research topics being tracked
  }

STATE WRITES: cognitive.researchLoad
STATE READS: all NSV (to understand what to proactively research)
FIRESTORE: scout_knowledge/{uid} (E2EE)
```

### 8. FORGE — Technical Extension

**New module.** Coding agent with local filesystem access via nyx-link daemon.

```
ROLE: Standalone technical workspace. Code generation, debugging,
      project management. Uses nyx-link for local execution.

TOOLS:
  execute_code(language, code)       // sandbox or via nyx-link
  read_file(path)                    // via nyx-link daemon
  write_file(path, content)          // via nyx-link daemon
  nyx_link_command(command)          // arbitrary local command
  search_codebase(query, scope)      // semantic code search

ARCHITECTURE:
  nyx-link is a LOCAL DAEMON (separate process, not in SPA):
  ┌─────────────┐     WebSocket      ┌──────────────┐
  │ AGNES SPA   │ ◄─────────────────► │ nyx-link     │
  │ (browser)   │                     │ (local node) │
  │ Forge module│                     │ fs access    │
  └─────────────┘                     │ shell exec   │
                                      └──────────────┘

STATE WRITES: none (isolated technical workspace)
STATE READS: CoreProfile (user preferences)
FIRESTORE: forge_sessions/{uid} (workspace state, NOT E2EE — code isn't personal health data)
```

### 9. PULSE — Interest Extension

**New module.** Physics-based interest tracking over time.

```
ROLE: The Hype Observer. Maps evolving user interests.
      Physics-based bubble visualization.
      News synthesis integration.

TOOLS:
  update_interest_map(interests[])
    → { topic, intensity, velocity, connections[] }
  track_topic(topic, source)
  synthesize_trends()
    → Analyze interest velocity: which topics are accelerating/decaying?
  suggest_content(interests[])
    → Based on interest map, suggest research topics for Scout

DATA MODEL:
  PulseProfile {
    interestMap: InterestBubble[]   // { topic, intensity: 0-1, velocity, lastMentioned }
    trendHistory: TrendSnapshot[]   // periodic snapshots of the interest map
    newsDigest: DigestItem[]        // synthesized news relevant to interests
  }

VISUALIZATION: Physics-based bubble map
  - Bubbles grow/shrink based on mention frequency
  - Bubbles attract/repel based on topic similarity
  - Velocity shown as trail/streak
  - Built with: Canvas 2D or Three.js (leveraging existing R3F)

STATE WRITES: none (informational only)
STATE READS: all conversation history (to detect interest patterns)
FIRESTORE: pulse_profiles/{uid}
```

### 10. BRIDGE — Alert Daemon

**Not a chat module.** Background service that routes alerts.

```
ROLE: Notification routing daemon. Receives spine events
      flagged as ALERT priority. Delivers via external channels.

IMPLEMENTATION: Firebase Cloud Function (not SPA module)
  - Listens to Firestore trigger on spine_events/{uid}
  - Filters by priority: 'alert' | 'critical'
  - Routes to configured channels:
    - WhatsApp (via Twilio/Meta API)
    - Email (via SendGrid/Firebase Extensions)
    - Push notification (via FCM)
  - User configures: which events → which channels
  
CONFIG:
  bridge_config/{uid} {
    channels: {
      whatsapp: { enabled, phone },
      email: { enabled, address },
      push: { enabled, fcmToken }
    },
    rules: [
      { eventType: 'BURNOUT_WARNING', channels: ['push', 'email'] },
      { eventType: 'CLEARANCE_DENIED', channels: ['push'] },
      { eventType: 'ATLAS_FLATTEN', channels: ['whatsapp'] }
    ]
  }

FIRESTORE: bridge_config/{uid}, spine_events/{uid} (event log)
```

---

## MEMORY IMPLEMENTATION (3-Tier RAG)

### Tier 1: Working Memory (exists, just fix it)
```
Current: messages[] in useState, last 30 sent to LLM
Fix: 
  - Wire MemoryManager.needsConsolidation() (currently uncalled stub)
  - When > 80% token limit: summarize old messages via LLM call
  - Extract key facts → push to Tier 2
  - Keep sliding window of recent messages
```

### Tier 2: Episodic Memory (new)
```
On session close ("Merge & Close"):
  1. LLM generates 2-3 sentence summary (existing code)
  2. LLM extracts structured insights:
     { theme, emotions[], breakthroughs[], decisions[], 
       factsLearned[], questionsRaised[] }
  3. EmbeddingService.embed(summary) → float[]
  4. Store: module_memory/{uid}_{moduleId}.eventHistory[] += {
       summary, insights, embedding, date, moduleId
     }

On session start:
  1. EmbeddingService.embed(last 3 user messages or "session start" query)
  2. For each doc in module_memory/{uid}_{moduleId}:
     → cosine_similarity(query_embedding, event.embedding)
  3. Top-5 by score → inject as insights[] in ConversationContext
  4. These populate Layer 4 [RECALLED CONTEXT] in the prompt

Storage: Firestore module_memory/{uid}_{moduleId}
  eventHistory: [{
    summary: string,
    insights: StructuredInsights,
    embedding: number[],        // float array stored as Firestore array
    date: string,
    relevanceDecay: number      // decreases over time
  }]
```

### Tier 3: Semantic Memory (new)
```
Long-term stable facts that persist across sessions:
  - "User has chronic shoulder injury" (from Trainer)
  - "User works night shifts" (from Orchestrator onboarding)
  - "User's mother was emotionally absent" (from Therapy)
  - "User's squat PR is 140kg" (from Trainer)

Stored as:
  semantic_memory/{uid} {
    facts: [{
      fact: string,
      confidence: 0-1,
      source: moduleId,
      firstMentioned: date,
      lastConfirmed: date,
      contradictedBy?: string   // if a newer fact supersedes
    }],
    patterns: [{
      pattern: string,          // "User's sleep degrades before work deadlines"
      evidence: string[],       // session references
      strength: 0-1
    }]
  }

Updated by:
  - Session close → LLM extracts new stable facts
  - Contradiction detection: if new fact conflicts with existing,
    mark old as contradicted, store new with higher confidence
  - Periodic consolidation: merge similar facts, strengthen patterns
```

### Embedding Service Implementation
```typescript
// src/lib/services/embedding-service.ts
// Uses @google/generative-ai (already in package.json)

import { GoogleGenerativeAI } from '@google/generative-ai';

class EmbeddingService {
  private model;
  
  constructor(apiKey: string) {
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  }
  
  async embed(text: string): Promise<number[]> {
    const result = await this.model.embedContent(text);
    return result.embedding.values;
  }
  
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  async search(query: string, documents: EpisodicMemory[]): Promise<RankedResult[]> {
    const queryEmb = await this.embed(query);
    return documents
      .map(doc => ({
        ...doc,
        score: this.cosineSimilarity(queryEmb, doc.embedding) * doc.relevanceDecay
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}
```

---

## SPINE EVENT BUS IMPLEMENTATION

```typescript
// src/lib/spine/spine-event-bus.ts

type SpineEventType =
  | 'VITAL_UPDATED'          // any NSV field changed
  | 'REDUCE_TRAINING_LOAD'   // cascade: resilience < 3
  | 'BLOCK_HIGH_INTENSITY'   // cascade: cnsFatigue > 7
  | 'FLATTEN_ENERGY_WAVE'    // cascade: fatigue + low resilience
  | 'RECOVERY_AVAILABLE'     // cascade: recovery > 8
  | 'BURNOUT_WARNING'        // cascade: compound stress
  | 'CLEARANCE_DENIED'       // soma blocked an activity
  | 'CLEARANCE_GRANTED'      // soma approved an activity
  | 'COGNITIVE_OVERLOAD'     // cascade: activeLoad > 8
  | 'FINANCIAL_STRESS'       // cascade: budget deficit
  | 'MEDICAL_ALERT'          // soma flagged a biomarker
  | 'DRAFT_PROPOSED'         // Ghost UI: module proposes a change
  | 'DRAFT_APPROVED'         // user approved a draft
  | 'DRAFT_DISMISSED'        // user dismissed a draft
  | 'SESSION_STARTED'        // module session began
  | 'SESSION_ENDED'          // module session committed
  | 'MODULE_DELEGATED';      // Nyx routed a message to a module

interface SpineEvent {
  id: string;
  type: SpineEventType;
  source: string;           // moduleId that emitted
  target?: string;          // specific moduleId, or undefined = broadcast
  domain: 'B' | 'E' | 'C' | 'R' | 'system';
  data: Record<string, any>;
  timestamp: number;
  cascadeDepth: number;     // incremented on each cascade hop
  priority: 'info' | 'alert' | 'critical';
}

class SpineEventBus {
  private listeners = new Map<string, Set<(e: SpineEvent) => void>>();
  private cascadeRules: CascadeRule[] = [];
  private recentEvents: SpineEvent[] = [];       // last 50 for dedup
  private debounceTimers = new Map<string, number>();
  
  emit(event: SpineEvent): void {
    // Dedup: same type+source within 500ms = skip
    const key = `${event.type}:${event.source}`;
    if (this.debounceTimers.has(key)) return;
    this.debounceTimers.set(key, window.setTimeout(() => 
      this.debounceTimers.delete(key), 500));
    
    // Notify listeners
    const typeListeners = this.listeners.get(event.type) || new Set();
    const allListeners = this.listeners.get('*') || new Set();
    [...typeListeners, ...allListeners].forEach(cb => cb(event));
    
    // Store for history
    this.recentEvents = [event, ...this.recentEvents].slice(0, 50);
    
    // Fire cascade rules (if depth allows)
    if (event.cascadeDepth < 3) {
      this.cascadeRules
        .filter(rule => rule.trigger.type === event.type)
        .filter(rule => rule.trigger.condition(event, currentNSV))
        .forEach(rule => {
          const cascaded = rule.effect.transform(event, currentNSV);
          this.emit({
            ...cascaded,
            cascadeDepth: event.cascadeDepth + 1,
            source: `cascade:${event.source}`,
          });
        });
    }
    
    // Log to Firestore for Bridge daemon (alert priority only)
    if (event.priority !== 'info') {
      addDoc(collection(db, `spine_events/${uid}`), event);
    }
  }
  
  on(type: string | '*', cb: (e: SpineEvent) => void): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }
  
  getRecentEvents(filter?: { type?: string; source?: string }): SpineEvent[] {
    return this.recentEvents.filter(e =>
      (!filter?.type || e.type === filter.type) &&
      (!filter?.source || e.source === filter.source)
    );
  }
}

// React hook for modules
function useSpineEvent(type: string, handler: (e: SpineEvent) => void) {
  useEffect(() => {
    const unsub = Spine.on(type, handler);
    return unsub;
  }, [type, handler]);
}

export const Spine = new SpineEventBus();
```

---

## FIRESTORE COLLECTIONS MAP (Complete)

```
EXISTING:
  users/{uid}                        ← CoreProfileService (Orchestrator)
  global_souls/{uid}                 ← GlobalProjectionService → becomes NSV
  vaults/{uid}                       ← VaultProvider (encryption)
  therapist_profiles/{uid}           ← TherapyProfileService (E2EE)
  ai_trainers/{uid}                  ← TrainerProfileService (E2EE)
  ai_ledgers/{uid}                   ← LedgerIntakeService (E2EE)
  module_memory/{uid}_{moduleId}     ← ModuleMemoryService (sessions)
  active_sessions/{uid}_{moduleId}   ← ModuleMemoryService (live chat)

NEW:
  soma_profiles/{uid}                ← SomaProfileService (E2EE)
  atlas_profiles/{uid}               ← AtlasProfileService (E2EE)
  scout_knowledge/{uid}              ← ScoutKnowledgeService (E2EE)
  forge_sessions/{uid}               ← ForgeSessionService (not E2EE)
  pulse_profiles/{uid}               ← PulseProfileService
  semantic_memory/{uid}              ← SemanticMemoryService (E2EE)
  spine_events/{uid}                 ← SpineEventLog (for Bridge)
  bridge_config/{uid}                ← BridgeConfigService
  belief_graphs/{uid}                ← TherapyBeliefGraphService (E2EE)
  training_logs/{uid}                ← TrainerLogService (E2EE)
```

---

## IMPLEMENTATION PHASES (Revised — All Modules Included)

### Phase 1: Foundation (Parallel Tracks)
```
Track A: SpineEventBus + cascade rules (~2 days)
Track B: NSV type system [B,E,C,R] + Firestore schema (~1 day)
Track C: Embedding service (Google GenAI) (~1 day)
Track D: Session summarization (activate stubs) (~1 day)
Track E: Firestore onSnapshot migration (~1 day, needs Track A)
Track F: RAG retrieval pipeline (~2 days, needs Track C + D)
```

### Phase 2: Real Orchestration
```
- Nyx intent router with MODULE_MANIFEST
- delegate_to_module / query_module / broadcast_spine_event tools
- Ghost UI: NeuralDraft component + approval flow
- Fix dead orchestrator + ledger actions
```

### Phase 3: Soma Module
```
- Full scaffold: SomaPage, SomaOnboarding, SomaProfileService, SOMA_PERSONA
- PDF/CSV upload → LLM parsing → Ghost UI draft → commit
- Biomarker data model + trend analysis
- Biological Clearance API
- Migrate biological NSV ownership from Trainer → Soma
```

### Phase 4: Atlas Module
```
- Full scaffold: AtlasPage, AtlasOnboarding, AtlasProfileService, ATLAS_PERSONA
- Energy Wave data model (canyon/swell segments)
- Energy Wave visualization (SVG/Canvas)
- Auto-flatten on fatigue cascade event
- Task graph with energy costs + dependencies
```

### Phase 5: Scout + Forge
```
Scout:
  - ScoutPage, ScoutOnboarding, ScoutKnowledgeService, SCOUT_PERSONA
  - Knowledge graph data model
  - verify_claim API for other modules
  - Web search integration (if available)

Forge:
  - ForgePage, ForgeService, FORGE_PERSONA
  - nyx-link daemon specification (Node.js local process)
  - WebSocket bridge between SPA and nyx-link
  - Code execution sandbox
```

### Phase 6: Pulse + Bridge + Integrations
```
Pulse:
  - PulsePage, PulseProfileService, PULSE_PERSONA
  - Interest bubble physics engine (Canvas 2D)
  - News synthesis integration

Bridge:
  - Firebase Cloud Function for alert routing
  - WhatsApp/Email/Push channel configuration
  - User-configurable event→channel rules

Integrations:
  - Ledger full write capability
  - Therapy Belief Graph visualization
  - Trainer ↔ Soma clearance handshake
  - Atlas ↔ Soma/Trainer fatigue cascade
  - Cross-module Resonance ROI
```

### Phase 7: Visual Spine + Polish
```
- SpineOverlay in App.tsx (CSS/SVG, persists across routes)
- Hub 3D spine (TubeGeometry connecting FloatingPods)
- SpineSideRail in ModuleLayout
- Pulse animations tied to SpineEventBus
- Ambient breathing animation (idle state)
- 2D→3D spine handoff on Hub enter/exit
```

---

## CROSS-MODULE INTERACTION MATRIX

```
              WRITES TO →
READ FROM ↓   | Bio[B] | Emo[E] | Cog[C] | Res[R] | Spine Events
──────────────┼────────┼────────┼────────┼────────┼──────────────
Orchestrator  │   -    │   -    │   -    │   -    │ DELEGATE, BROADCAST
Therapy       │   -    │  ✅   │   -    │   -    │ RESILIENCE_CHANGE
Trainer       │  ✅   │   -    │   -    │   -    │ FATIGUE_CHANGE
Soma          │  ✅   │   -    │   -    │   -    │ CLEARANCE, MED_ALERT
Ledger        │   -    │   -    │   -    │  ✅   │ NEURAL_GAP
Atlas         │   -    │   -    │  ✅   │   -    │ WAVE_FLATTEN
Scout         │   -    │   -    │  ✅   │   -    │ FACT_CHECK
Forge         │   -    │   -    │   -    │   -    │ (isolated)
Pulse         │   -    │   -    │   -    │   -    │ (informational)
Bridge        │   -    │   -    │   -    │   -    │ ALERT_SENT
```

---

## TECH DECISIONS

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding provider | Google GenAI (`@google/generative-ai` installed) | Zero new deps |
| Vector storage | Firestore + client-side cosine similarity | E2EE, no vector DB at user scale |
| Event bus | Custom SpineEventBus (~100 LOC) | No library, React lifecycle aware |
| Real-time sync | Firestore `onSnapshot` | Drop-in for `getDoc` |
| Visual spine | CSS/SVG global + Three.js in Hub | Lightweight + premium hybrid |
| Ghost UI | NeuralDraft component + Framer Motion | Consistent with existing patterns |
| Forge bridge | WebSocket to local nyx-link daemon | Separate process, not in SPA |
| Bridge alerts | Firebase Cloud Functions | Server-side, can access external APIs |
| State management | React Context + SpineEventBus | No unnecessary Zustand migration |
| New module pattern | Same as existing: Page + Onboarding + Service + Persona | Consistency |
