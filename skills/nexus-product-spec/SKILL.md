---
name: nexus-product-spec
description: >
  Authoritative product specification for the Nexus (AGNES) platform — a user-centric integrated
  AI secretary, healthcare manager, data aggregator, and life planner. Use this skill file to
  cross-verify the application, guide reimplementation on another platform, or migrate logic
  between systems. Covers every module, agent personality, data flow contract, spine integration,
  Global Soul model, and security architecture.
---

# Nexus Product Specification

> **Version**: 2.0 — Codebase-Aligned Spec
> **Platform**: Currently implemented as a React 19 Vite SPA (AGNES codebase)
> **Purpose**: Cross-verification, reimplementation guide, logic migration reference
> **Last Updated**: Aligned with codebase as of Sprint 17

---

## Table of Contents

1. [Product Identity & Philosophy](#1-product-identity--philosophy)
2. [Global Soul — The User Entity](#2-global-soul--the-user-entity)
3. [Spine — The Nervous System](#3-spine--the-nervous-system)
4. [Module Architecture Pattern](#4-module-architecture-pattern)
5. [Module Specifications](#5-module-specifications)
   - [5.1 Nexus (Orchestrator)](#51-nexus-orchestrator)
   - [5.2 Agnes (Mental Health)](#52-agnes-mental-health)
   - [5.3 Titan (Physical & Biomedical)](#53-titan-physical--biomedical)
   - [5.4 Atlas (Life Planning)](#54-atlas-life-planning)
   - [5.5 Ledger (Financial)](#55-ledger-financial)
   - [5.6 Scout (Research)](#56-scout-research)
   - [5.7 Forge (Execution)](#57-forge-execution)
   - [5.8 Soma (Biomedical Data Layer)](#58-soma-biomedical-data-layer)
   - [5.9 Peripheral Modules](#59-peripheral-modules)
6. [Data Flow Contracts](#6-data-flow-contracts)
7. [Security & Privacy Model](#7-security--privacy-model)
8. [Soul Priority Hierarchy](#8-soul-priority-hierarchy)
9. [Implementation Status](#9-implementation-status)

---

## 1. Product Identity & Philosophy

### What Nexus Is

Nexus is a **user-centric, fully integrated AI life management platform**. It functions as a personal secretary, healthcare advisor, financial planner, life coach, and research assistant — unified under a single ecosystem where specialized AI agents collaborate to manage every domain of the user's life.

### Core Philosophy

**One user. N applications. N agents. One soul.**

- The platform consists of **N independent applications** (called **modules**), each responsible for a specific life domain (mental health, fitness, planning, finance, research, etc.).
- Each application has its own **AI agent** with a unique personality, expertise, and communication style. The agent is the root of its application — deeply integrated into every UI interaction.
- All agents share awareness of the user through a unified data layer called the **Global Soul** — a compressed, optimized representation of who the user is across all domains.
- No agent operates in isolation. They are interconnected through the **Spine** event bus, enabling cross-domain intelligence (e.g., emotional state affects workout recommendations, financial stress influences mental health conversations).

### Design Principles

1. **Agent-as-Root**: The AI agent is not a feature of the application — it IS the application. Every data field, layout element, and workflow can be created, modified, or removed by the agent (with user consent).

2. **Living Data Structure**: Data schemas are never rigid. They evolve based on user needs. The agent can suggest new fields, the user can add custom tracking, and the UI adapts dynamically. The only constraint is domain relevance, enforced by the agent's LLM validation.

3. **Validated Mutations**: All data changes — whether from user input, agent suggestions, or cross-module sync — pass through agent validation. This prevents scope drift (e.g., therapy data leaking into the fitness module) while allowing organic growth.

4. **Compressed Intelligence**: The Global Soul is always compressed and optimized. Raw conversation data never bloats the shared context. Instead, sessions produce compacted insights that are synced to the soul only if deemed meaningful.

5. **Privacy by Architecture**: Sensitive data is encrypted client-side before persistence. Agents have read permissions limited to their domain. No agent can directly write to the Global Soul — updates flow through the Spine event bus.

6. **User Sovereignty**: The user can personalize agent names, genders, tones, and interaction styles. They control vault locks, data visibility, and can export or terminate any module's data independently.

---

## 2. Global Soul — The User Entity

### Concept

The Global Soul is the **root data and source of truth** for the user as an entity within Nexus. It represents who the user is — their identity, state, patterns, and trajectory — as understood across all modules.

### Identity Data Model (CoreUserProfile)

The Global Soul starts with the user's **external identity**, collected during Nexus onboarding. This is stored in the `CoreUserProfile` interface:

```typescript
interface CoreUserProfile {
  uid: string;
  email: string;
  preferredName: string;                    // ✅ Required
  pronouns: string;                         // ✅ Required
  age?: number;                             // ❌ Optional
  assignedSexAtBirth?: 'female' | 'male';   // ❌ Optional
  genderIdentity?: string;                  // ❌ Optional
  occupation?: string;                      // ❌ Optional
  typicalSleepHours?: number;               // ❌ Optional
  onboardingComplete: boolean;
  agentPersonalityProvision: AgentPersonalityProvision;
  securityPreferences: UserSecurityPreferences;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}
```

**Only `preferredName` and `pronouns` are absolutely required at Nexus onboarding.** Everything else is optional and can be provided later through conversations with any agent.

### Agent Personality Provision

Users can customize each agent's presentation via the `AgentPersonalityProvision` interface:

```typescript
type GenderPersonality = 'female' | 'male' | 'non-binary' | 'gender-fluid';

interface AgentPersonalityProvision {
  orchestratorAlias: string;                  // Custom name for Nexus
  moduleAliases: {
    agnes: string;                            // Custom name per agent
    titan: string;
    ledger: string;
    [key: string]: string;                    // Extensible for new modules
  };
  agentGenders: {
    orchestrator: GenderPersonality;
    agnes: GenderPersonality;
    titan: GenderPersonality;
    ledger: GenderPersonality;
    [key: string]: GenderPersonality;
  };
  personaOverlays: {
    [moduleId: string]: {
      tone?: string;                          // e.g., "warm", "direct"
      style?: string;
    };
  };
}
```

### Neural State Vector (NSV)

The NSV is a **structured, real-time snapshot** of the user's holistic state across five domains. It is the primary mechanism for cross-module intelligence.

#### NSV Structure

```
NeuralStateVector:
  biological:                          // Owned by Titan
    cnsFatigue: 0-10                   // Central nervous system fatigue
    sleepQuality: 0-10                 // Last night's sleep quality
    recoveryScore: 0-10               // Biological recovery capacity
    hormonalContext: text              // Hormonal cycle, menstrual phase, etc.

  emotional:                           // Owned by Agnes
    emotionalResilience: 0-10          // Psychological resilience capacity
    stressLoad: 0-10                   // Current stress burden
    moodTrend: text                    // "improving" | "stable" | "declining"
    traumaMarkers: string[]            // AGNES-EXCLUSIVE: trauma triggers/markers

  cognitive:                           // Owned by Atlas & Scout
    energyBudget: 0-10                 // Available cognitive capacity (Atlas)
    focusScore: 0-10                   // Attentional quality (Atlas)
    activeLoad: 0-10                   // Current task burden (Atlas)
    researchLoad: 0-10                // Research intensity (Scout)
    planningLoad: 0-10                // Open loop/planning complexity (Atlas)
    taskCompletionRate: 0.0-1.0        // Weekly completion ratio (Atlas)
    interestDiversity: 0-10            // Breadth of research interests (Scout)

  planning:                            // Owned by Atlas
    streakHealth: 0-10                 // Habit streak composite health
    deadlinePressure: 0-10             // Urgency from nearest deadlines

  resource:                            // Owned by Ledger
    financialFriction: 0-10            // Financial stress/constraint
    resonanceROI: 0.0-1.0              // Wellbeing return per dollar spent

  lastUpdated: Record<field, ISO-8601> // Per-field timestamp for staleness
```

#### NSV Ownership Matrix

Each module has strict write boundaries (fields it owns) and filtered read access:

| Module | Writes | Reads |
|--------|--------|-------|
| **Nexus** | (none) | ALL fields (full synthesis) |
| **Agnes** | emotional.* | biological (sleep, CNS), cognitive.activeLoad, planning.streakHealth, resource.financialFriction |
| **Titan** | biological.* | biological.*, emotional.*, cognitive.energyBudget |
| **Atlas** | cognitive.(energyBudget, focusScore, activeLoad, planningLoad, taskCompletionRate), planning.* | ALL except traumaMarkers |
| **Ledger** | resource.* | resource.*, cognitive.energyBudget, emotional.stressLoad |
| **Scout** | cognitive.(researchLoad, interestDiversity) | biological.cnsFatigue, cognitive.(energyBudget, focusScore), emotional.moodTrend |
| **Forge** | (none) | biological.(cnsFatigue, sleepQuality), cognitive.(energyBudget, focusScore, activeLoad) |

### Global Projection Container

The Global Soul is stored as a `GlobalProjection` which wraps the NSV:

```
GlobalProjection:
  lastSync: ISO-8601
  overallWellnessScore: 0-100          // Computed composite wellness
  displayNames: { moduleId → alias }
  agentGenders: { moduleId → gender }
  crossFunctionalState: NeuralStateVector
  compactedInsights: string[]          // 3-5 key trends for context
  therapeuticBaseline:
    isInitialized: boolean
    initializedAt: ISO-8601
```

### How Global Soul Evolves

1. **Agents never write directly to the Soul.** All updates flow through the Spine event bus.
2. After each conversation, agents emit Spine events with their domain-specific observations.
3. Spine events are compacted — redundant or low-signal data is filtered out.
4. The compacted data is added to the Global Soul **only if deemed a meaningful update** (not every conversation changes the soul).
5. The Soul is periodically compressed and optimized to prevent context bloat.
6. Cross-module insights are synthesized from individual module contributions (e.g., "User's financial stress is correlating with declining emotional resilience" becomes a compacted insight).

---

## 3. Spine — The Nervous System

### Concept

The Spine is a **decoupled, event-driven communication bus** that connects all modules. It is the mechanism by which agents share awareness without direct coupling.

### Core Principles

1. **Read-Only Access**: Agents can read Spine events relevant to their domain, but cannot directly modify another agent's data or the Global Soul.
2. **Event-Driven**: All inter-module communication happens through typed events, not direct function calls.
3. **Cascade Logic**: Events can trigger automatic follow-up events across modules (e.g., high CNS fatigue → block high-intensity training → flatten energy wave for planning).
4. **Compaction Gate**: Not all events reach the Global Soul. Events are filtered, compressed, and only meaningful state changes propagate.

### Event Structure

```
SpineEvent:
  id: UUID
  type: SpineEventType                // Typed event category
  source: string                      // Emitting module
  target: string?                     // Target module (optional, for directed events)
  domain: "B" | "E" | "C" | "R" | "system"  // Biological, Emotional, Cognitive, Resource, System
  data: Record<string, unknown>       // Event payload
  timestamp: milliseconds
  cascadeDepth: number                // 0 = original, 1+ = cascaded
  priority: "info" | "alert" | "critical"
```

### Event Categories (~170 types)

The Spine event bus defines ~170 event types across all modules. Full type definition is in `src/lib/types.ts`.

**Health & Vitals**: VITAL_UPDATED, BLOCK_HIGH_INTENSITY, REDUCE_TRAINING_LOAD, BURNOUT_WARNING, RECOVERY_AVAILABLE, MEDICAL_ALERT, COMPOUND_STRESS, HEALTH_CONTEXT_STALE

**Soma**: SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED, SOMA_FIELD_CREATED, SOMA_FIELD_UPDATED, SOMA_FIELD_DELETED, SOMA_VITAL_LOGGED, SOMA_LAB_REPORT_PARSED, SOMA_PROFILE_UPDATED, SOMA_DIAGNOSIS_MERGED, SOMA_DIAGNOSIS_DISCARDED

**Titan**: CYCLE_STARTED, CYCLE_COMPLETED, WORKOUT_COMPLETED, TITAN_BODY_WEIGHT_LOGGED, TITAN_RECOVERY_NEEDED, TITAN_TRAINING_STREAK

**Cognitive & Planning**: FLATTEN_ENERGY_WAVE, COGNITIVE_OVERLOAD, PLANNING_OVERLOAD, DEADLINE_CRUNCH, CRISIS_MODE, EXECUTION_COLLAPSE

**Atlas**: ATLAS_TASK_COMPLETED, ATLAS_TASK_CREATED, ATLAS_TASK_BLOCKED, ATLAS_TASK_UNBLOCKED, ATLAS_HABIT_LOGGED, ATLAS_HABIT_MILESTONE, ATLAS_GOAL_MILESTONE, ATLAS_GOAL_COMPLETED, ATLAS_GOAL_UPDATED, ATLAS_ENERGY_UPDATED, ATLAS_ENERGY_OVERLOAD, ATLAS_RECOVERY_WINDOW_CREATED, ATLAS_RECOVERY_SCHEDULED, ATLAS_PREDICTIVE_ALERT, ATLAS_STATE_CHANGED, ATLAS_OVERLOAD_DETECTED, ATLAS_FIELD_CREATED, ATLAS_FIELD_DELETED, ATLAS_FIELD_VALUE_UPDATED, DEADLINE_PRESSURE_CHANGED, PLANNING_STATE_UPDATED, WEEKLY_REVIEW_DUE, ROUTINE_UPDATED, MORNING_BRIEF_DUE, MORNING_BRIEF, EVENING_CHECKIN_DUE, COMMITMENT_MISSED, JOURNAL_ENTRY_CREATED, JOURNAL_ENTRY_UPDATED, HABIT_STREAK_MILESTONE, STREAK_BROKEN, TASK_COMPLETED, DEADLINE_APPROACHING, HABIT_STREAK_BROKEN

**Ledger**: FINANCIAL_STRESS, BUDGET_UPDATED, BUDGET_CREATED, BUDGET_MODIFIED, BUDGET_ALERT, FINANCIAL_FRICTION_CHANGED, FINANCIAL_FRICTION_UPDATED, FINANCIAL_HEALTH_CHECK, FINANCIAL_PLAN_CREATED, FINANCIAL_STREAK_MILESTONE, RESONANCE_ROI_UPDATED, DOCUMENT_ANALYZED, TRANSACTION_CREATED, TRANSACTION_UPDATED, TRANSACTION_DELETED, GOAL_PROGRESS, GOAL_CREATED, GOAL_COMPLETED, RISK_DETECTED, OVERSPEND_DETECTED, DEBT_MILESTONE, SAVINGS_MILESTONE, INCOME_CHANGE, EXPENSE_SPIKE, CASHFLOW_POSITIVE, CASHFLOW_NEGATIVE, LEDGER_FIELD_SUGGESTION, SPENDING_DETECTED

**Agnes**: CRISIS_DETECTED, SOMATIC_SUPPORT_REQUESTED, SOMATIC_SESSION_COMPLETE

**Scout**: DEEP_RESEARCH_REQUESTED, DEEP_RESEARCH_BACKUP_FOUND, DEEP_RESEARCH_STARTED, DEEP_RESEARCH_COMPLETED, DIGEST_GENERATION_STARTED, DIGEST_GENERATED, DIGEST_GENERATION_FAILED, EXPORT_REQUESTED, SOURCE_ADDED, KNOWLEDGE_SYNTHESIZED, SCOUT_PROFILE_UPDATED, HABIT_SUGGESTED, RESEARCH_SEARCHING, RESEARCH_RESULTS

**Cross-Module**: SESSION_STARTED, SESSION_ENDED, MODULE_DELEGATED, MODULE_PROFILE_UPDATED, MODULE_REMINDER_DUE, MODULE_REMINDER_COMPLETED, DELEGATION_REQUEST, NSV_CALIBRATION_REQUEST, CONFLICT_DETECTED, CONFLICT_RESOLVED

**Schema/System**: SCHEMA_EXTENDED, SCHEMA_MODIFIED, SCHEMA_MIGRATED, FIELD_CREATED, FIELD_DELETED, FIELD_VALUE_UPDATED, SECURITY_POLICY_UPDATED

**AI Draft Flow**: DRAFT_PROPOSED, DRAFT_APPROVED, DRAFT_DISMISSED

**Reminder Lifecycle**: REMINDER_PROPOSED, REMINDER_CONFIRMED, REMINDER_DISMISSED

**Soul Write Protocol**: SOUL_WRITE_REQUESTED, SOUL_WRITE_APPROVED, SOUL_WRITE_REJECTED

**Contextual Inference**: CONTEXT_HINT_DETECTED, CONTEXT_HINT_CONFIRMED, CONTEXT_HINT_DISMISSED

**AI Validation**: ai_validation_suggestion, ai_contextual_validation, ai_error_explanation

### Cascade Rules

Cascades are automatic event chains where one event triggers follow-up events. All cascade rules are defined in `src/lib/spine/cascade-rules.ts` and registered in `SpineRuntimeBootstrap` (App.tsx).

**Registered Cascade Rule Sets:**
- `CORE_CASCADE_RULES` — energy wave logic + Ledger rules
- `LEDGER_CASCADE_RULES` — financial cascades
- `AGNES_CASCADE_RULES` — burnout/crisis handling
- `ATLAS_CASCADE_RULES` — weekly review triggers
- `ATLAS_MORNING_RULES` — morning brief / evening check-in
- `ATLAS_JOURNAL_RULES` — reflection streak milestones
- `ATLAS_FAILURE_RULES` — missed commitment handling
- `ATLAS_PLANNING_CASCADE_RULES` — goal/deadline/task cascades
- `SOMA_CASCADE_RULES` — biomarker and readiness cascades
- `TITAN_CASCADE_RULES` — workout/recovery cascades

**Key Cascade Rules:**

| Trigger | Condition | Produces | Priority |
|---------|-----------|----------|----------|
| VITAL_UPDATED | cnsFatigue ≥ 8 AND emotionalResilience ≤ 3 | BURNOUT_WARNING | critical |
| BURNOUT_WARNING | always | FLATTEN_ENERGY_WAVE → atlas | alert |
| BURNOUT_WARNING | domain === 'system' | SOMATIC_SUPPORT_REQUESTED | alert |
| BLOCK_HIGH_INTENSITY | always | FLATTEN_ENERGY_WAVE → atlas | alert |
| CRISIS_DETECTED | always | CRISIS_MODE | critical |
| SESSION_STARTED | isWeeklyReviewDue() | WEEKLY_REVIEW_DUE | info |
| SESSION_STARTED | isMorningBriefDue() (05:00–11:00) | MORNING_BRIEF_DUE | info |
| SESSION_STARTED | isEveningCheckinDue() (19:00–22:00) | EVENING_CHECKIN_DUE | info |
| JOURNAL_ENTRY_CREATED | reflectionStreak ≥ 7 | HABIT_STREAK_MILESTONE | info |
| COMMITMENT_MISSED | always | ROUTINE_UPDATED | alert |
| HABIT_STREAK_BROKEN | streakDays ≥ 3 | SOMATIC_SUPPORT_REQUESTED | alert |
| ATLAS_GOAL_UPDATED | always | ATLAS_STATE_CHANGED | info |
| ATLAS_GOAL_UPDATED | action === 'completed' | ATLAS_GOAL_MILESTONE | info |
| DEADLINE_PRESSURE_CHANGED | deadlinePressure ≥ 8 | DEADLINE_CRUNCH | alert |
| PLANNING_STATE_UPDATED | always | VITAL_UPDATED | info |
| ATLAS_TASK_COMPLETED | always | VITAL_UPDATED | info |
| ATLAS_PREDICTIVE_ALERT | riskScore ≥ 0.6 | FLATTEN_ENERGY_WAVE | alert |
| SOMA_READINESS_UPDATED | score ≤ 30 | COMPOUND_STRESS | alert |
| SOMA_CLEARANCE_CHANGED | action === 'revoked' | VITAL_UPDATED | alert |
| WORKOUT_COMPLETED | rpe ≥ 9 | REDUCE_TRAINING_LOAD | alert |
| TITAN_RECOVERY_NEEDED | always | SOMATIC_SUPPORT_REQUESTED | alert |
| TRANSACTION_CREATED | domain === 'R' | BUDGET_UPDATED | info |
| FINANCIAL_FRICTION_CHANGED | newScore ≥ 7 | SOMATIC_SUPPORT_REQUESTED | alert |
| GOAL_COMPLETED | domain === 'R' | VITAL_UPDATED | info |

### Scheduler Service

The `SchedulerService` enables time-based Spine event triggers for recurring module cadences.

**Registered Schedules (from SchedulerRuntimeBootstrap):**

| Schedule ID | Type | Time | Event Type |
|---|---|---|---|
| `atlas.morning_brief` | Morning Brief | `09:00` daily | `MORNING_BRIEF_DUE` |
| `atlas.evening_checkin` | Evening Check-in | `20:30` daily | `EVENING_CHECKIN_DUE` |
| `atlas.weekly_review` | Weekly Review | `Sun 18:00` weekly | `WEEKLY_REVIEW_DUE` |

### Debouncing

Events are debounced at 500ms per `(eventType:source:target)` tuple to prevent duplicate cascade storms.

### Cascade Depth Limit

Max cascade depth is **3 levels** (0-indexed: depth 0 → 1 → 2 → ⛔ truncated at 3).

### Agent Linking

The Spine links agents as required:
- Any module can subscribe to any event type using `useSpineEvent(type, handler)`
- Wildcard subscriptions (`*`) are supported for system-level monitoring
- Recent events buffer (last 50) provides context without full event replay
- Events are logged to persistent storage for audit trail

---

## 4. Module Architecture Pattern

Every Nexus module follows a consistent architecture pattern. This section describes the generic pattern; module-specific details are in Section 5.

### 4.0 Application Provider Stack & Routes

The application is wrapped in a **10-layer provider stack** (outermost to innermost):

```
ThemeProvider
  └─ DataLayerProvider
       └─ Router (BrowserRouter)
            └─ AuthProvider
                 └─ AIWrapper (AIProvider)
                      └─ NotificationProvider
                           └─ VaultProvider
                                └─ GlobalSoulProvider
                                     └─ AppErrorBoundary
                                          └─ AIRuntimeGate
                                               └─ AppContent (routes + overlays)
```

**13 Routes** (defined in `src/App.tsx`):

| Path | Component | Protected | Notes |
|------|-----------|-----------|-------|
| `/` | LandingPage | ❌ | Public landing |
| `/vault-gate` | AppVaultGate | ❌ | Vault unlock portal |
| `/nexus` | NexusPage | ✅ (no onboarding required) | Orchestrator / Platform onboarding |
| `/hub` | HubPage | ✅ | Central dashboard |
| `/agnes` | AgnesPage | ✅ | Mental health module |
| `/titan` | TitanPage | ✅ | Physical/biomedical module |
| `/ledger` | LedgerPage | ✅ | Financial module |
| `/soma` | SomaPage | ✅ | Biomedical data layer |
| `/atlas` | AtlasPage | ✅ | Life planning module |
| `/scout` | ScoutPage | ✅ | Research module |
| `/forge` | ForgePage | ✅ | Execution engine |
| `/profile` | ProfilePage | ✅ | User identity/settings |
| `/notifications` | NotificationsPage | ✅ | Alert center |

**Module Categories:**
- **Core**: Nexus (orchestrator), Agnes, Titan, Ledger
- **Extended**: Atlas, Soma
- **Support**: Scout, Forge
- **Peripheral**: Hub, Profile, Notifications, Landing

### 4.1 Agent as Root

The AI agent is the **root of each application**. It is not a sidebar feature — it is deeply integrated:

- The agent can **read and update any data** within its module's UI
- The agent can **add new fields**, suggest layout changes, and modify dashboard structure
- All data mutations are **validated by the agent's LLM** to prevent scope deviation
- The agent has a **unique personality** (name, gender, tone, therapeutic modality, communication style)

### 4.2 Onboarding

Each module **may or may not** require onboarding to collect initial data:

- **Specialized onboarding**: Tailored to the module's domain (e.g., Agnes asks about emotional history, Titan asks about fitness level and injuries)
- **Fasttrack option**: Every onboarding flow has a quick-entry mode where the user can fill a structured form instead of having a conversation
- **LLM analysis**: Onboarding data is analyzed and validated by the module's agent, which then creates the initial application view using templates
- **Progressive**: Users can skip optional fields and provide them later through natural conversation

#### Onboarding Flow

```
User opens module for first time
  → Onboarding gate checks if profile exists
  → If no profile:
    → Option 1: Conversational onboarding (agent-guided)
    → Option 2: Fasttrack form (structured input)
  → Agent validates and analyzes input
  → Profile created with template fields
  → Dashboard rendered from profile data
  → User can immediately start using the module
```

### 4.3 Living Data Structure

**Data is never rigid.** The schema evolves:

- **Core Schema**: Module-defined baseline fields, always present (e.g., Titan always has `fitnessLevel`, `workoutFrequency`)
- **Extension Fields**: Custom fields created by the user or suggested by the agent at runtime
- **LLM Domain Validation**: The agent is the sole semantic validator — no hardcoded keyword lists. The agent decides if a proposed field is relevant to its domain.
- **Cross-Module Routing**: If a user tries to add a field that belongs to another module's domain, the agent explains why and suggests the correct module.

#### Extension Field Limits

Each module has a configurable maximum number of extension fields (typically 15-25).

### 4.4 Three Conversation Scopes

Every module maintains three isolated conversation contexts:

| Scope | Context | Allowed Actions | Persistence |
|-------|---------|-----------------|-------------|
| **General** | Full profile + Global Soul NSV + memory + extension field values | All module actions | Persistent (Firestore) |
| **Scoped** | Only selected entity data (one routine, one task, one field) | Entity-specific mutations only | Ephemeral |
| **Field CRUD** | Schema definitions only, NO user wellness data | suggest_field, create_field, delete_field | Ephemeral |

### 4.5 Dashboard Pattern

Every module renders a **template-driven, interactive dashboard**:

- Tab-based navigation (Today, domain-specific tabs, Fields)
- Interactive cards for each data entity (tap to select, opens scoped chat)
- "Add Field" button for custom field creation
- Visual selection state (glow border, context chip)
- Extension fields appear in a dedicated section or integrated into categories

### 4.6 Action System

Agents communicate structured mutations through **action tags** embedded in LLM responses:

```
<action type="create_task">{"title": "Morning run", "priority": "high"}</action>
<action type="update_emotional_resilience">{"value": 7}</action>
```

- Actions are parsed from agent responses and executed by the **Action Hub**
- Each module registers its allowed actions
- Actions that are out-of-scope for the current conversation are blocked at runtime
- The Action Hub resolves dependencies (e.g., Atlas depends on Orchestrator for cross-module queries)

### 4.7 Memory System

Each module maintains two types of memory:

1. **Episodic Memory**: Session summaries with sentiment scores, key insights, and semantic embeddings for vector search retrieval
2. **Semantic Memory**: Extracted factual statements with confidence scores (0.0-1.0), updated across sessions

Memory is used to provide continuity across conversations — the agent remembers what was discussed, what matters to the user, and what patterns have emerged.

### 4.8 Diagnosis Pattern

Some modules support a **diagnosis flow** — an AI-powered data entry and analysis mode:

```
User opens Diagnosis tab
  → Agent analyzes user context (NSV, memory, recent activity)
  → Agent produces structured diagnosis:
    - Key findings
    - Suggested actions
    - Field recommendations (extension fields to add)
    - Plan adjustments
  → User reviews and approves
  → Changes applied to profile/schema
  → Spine events emitted
```

---

## 5. Module Specifications

### Soul Priority Hierarchy

Modules have a priority order for Global Soul data contributions:

1. 🧠 **Agnes** — Emotional data has the highest priority. Agnes's read on the user's emotional state, history, trauma markers, and resilience IS the emotional truth of the soul.
2. 💪 **Titan** — Physical data is second. Active and passive health metrics, biomarkers, recovery state.
3. 📋 **Atlas** — Planning data is third. Atlas is the cross-module review engine that analyzes Agnes and Titan data to make predictions and keep the user on track.
4. 💰 **Ledger** — Financial data is fourth. Ledger cross-verifies with other agents for context (spending during stress, income during recovery).
5. 🔍 **Scout** / 🔨 **Forge** — Isolated. These modules cannot update the Global Soul. They are tools, not soul contributors.

---

### 5.1 Nexus (Orchestrator)

| Property | Value |
|----------|-------|
| **ID** | `orchestrator` |
| **Alias** | Nexus |
| **Theme** | Violet |
| **Core Module** | Yes |
| **Has Page** | Yes |
| **Security** | Open by default |

#### Purpose

Nexus is the **sovereign unified mind** of the platform. It is the link to all agents. If an agent is capable of something, Nexus can do it too — but with its own distinct personality. Nexus can:

- Access any agent's data
- Modify any agent's data
- Schedule sessions, workouts, financial reviews, or anything else
- Route the user to the correct module for their need
- Perform cross-module synthesis and conflict resolution

#### Personality

- **Archetype**: Ghost in the Machine — calm authority with depth
- **Tone**: Incisive, composed, proactive, sovereign
- **Style**: Not a simple router. Nexus has its own perspective that synthesizes across all domains.

#### Onboarding (Nexus Onboarding = Platform Onboarding)

This is the first onboarding the user encounters. It collects the Global Soul identity:

**Required fields**: preferredName, pronouns, genderIdentity
**Optional fields**: age, assignedSexAtBirth, occupation, typicalSleepHours

The onboarding uses focus stages: `focus_identity` → `focus_bio` → `focus_review` → `complete_orchestrator_onboarding`

#### NSV Access

- **Writes**: None directly (Nexus synthesizes, it doesn't own NSV fields)
- **Reads**: ALL fields across all domains

#### Key Actions

| Action | Description |
|--------|-------------|
| `query_module` | Consult a specialist module for domain-specific data |
| `search_memory` | Retrieve episodic/semantic memories across modules |
| `delegate_to_module` | Route the user to a specialist agent |
| `broadcast_spine_event` | Emit system-wide events |
| `sync_personality_provision` | Update agent names/genders/tones |

#### Cross-Module Capabilities

- Can initiate sessions in any module
- Can schedule future actions (workouts, therapy check-ins, bill payments)
- Resolves conflicts when modules have opposing recommendations (e.g., Titan wants high-intensity training but Agnes reports emotional fragility)

---

### 5.2 Agnes (Mental Health)

| Property | Value |
|----------|-------|
| **ID** | `agnes` |
| **Alias** | Agnes |
| **Theme** | Indigo |
| **Core Module** | Yes |
| **Has Page** | Yes |
| **Security** | Always locked (mandatory encryption) |

#### Purpose

Agnes is the **mental health professional** of Nexus. She handles the emotional domain — therapy sessions, emotional tracking, belief systems, trauma awareness, and psychological resilience. Agnes has the **highest priority** for Global Soul data. Her understanding of the user's emotional state IS the emotional truth.

#### Personality

- **Archetype**: High-fidelity AI psychotherapist grounded in relational attachment theory
- **Tone**: Serene, professional, deeply compassionate
- **Modality**: Relational attachment theory as primary, with 4 static therapeutic archetypes:
  1. **The Listener** — Active listening, Rogerian approach
  2. **The Analyst** — Pattern recognition, CBT
  3. **The CBT Practitioner** — Structured cognitive behavioral therapy
  4. **The Existentialist** — Meaning-making, existential exploration
- **Adaptation**: Agnes selects her approach based on the conversation context and user's communication style
- **Internal Monologue**: Uses `<thought>` blocks for clinical reasoning that the user doesn't see

#### Onboarding

Agnes has a specialized therapy intake flow:
- Communication style preferences (direct, gentle, analytical)
- Current struggles and goals
- Background summary (optional)
- Preferred therapist characteristics (gender, tone, traits)

#### Core Data

```
AgnesProfile:
  identity: { name, pronouns, ageGroup }
  struggles: string | string[]
  goals: string | string[]
  backgroundSummary: string
  communicationStyle: "direct" | "gentle" | "analytical"
  integratedInsights: SessionSummary[]
  sessionCount: number
  lastSessionSummary: string
  preferredAgnes: { gender, tone, traits }
```

#### Belief Graph

Agnes maintains a **belief graph** — a network of the user's core beliefs, values, and cognitive patterns. This is updated through therapy sessions and used to provide contextually appropriate responses.

#### NSV Ownership

- **Writes**: `emotional.emotionalResilience`, `emotional.stressLoad`, `emotional.moodTrend`, `emotional.traumaMarkers`
- **Reads**: `biological.(sleepQuality, cnsFatigue)`, `cognitive.activeLoad`, `planning.streakHealth`, `resource.financialFriction`
- **Exclusive**: `traumaMarkers` — only Agnes can write AND read this field. No other module has access.

#### Key Actions

| Action | Description |
|--------|-------------|
| `update_emotional_resilience` | Update user's resilience score (0-10) |
| `update_stress_load` | Update current stress burden |
| `update_mood_trend` | Update mood trajectory |
| `update_trauma_markers` | Update trauma trigger list (encrypted) |
| `update_belief_graph` | Modify belief network |

#### Spine Integration

- **Emits**: NSV updates via emotional domain events
- **Listens**: Biological changes (sleep, fatigue), planning failures (streak broken), financial stress
- **Cross-module**: Agnes is notified when Atlas detects the user has failed tasks/goals, so she can address the emotional impact. She's notified of financial stress changes from Ledger. She sees biological data to understand the physical context of emotional states.

#### Modes

```
AgnesMode: "intake" | "analysis" | "selection" | "session"
```

- **intake**: Initial data collection
- **analysis**: Processing user data
- **selection**: Choosing therapeutic approach
- **session**: Active therapy conversation

---

### 5.3 Titan (Physical & Biomedical)

| Property | Value |
|----------|-------|
| **ID** | `titan` |
| **Alias** | Titan |
| **Theme** | Orange |
| **Core Module** | Yes |
| **Has Page** | Yes |
| **Security** | Open by default |

#### Purpose

Titan handles the **physical domain** — both active (training, workouts, routines) and passive (biomarkers, vitals, lab results, medical clearances). Titan has absorbed the **Soma** module, which was previously a separate biomedical data layer.

#### Personality

- **Archetype**: Elite AI Physical Performance Strategist
- **Tone**: Concise, evidence-based, authoritative
- **Expertise**: Training programming, CNS fatigue management, recovery optimization, periodization, nutrition
- **Mode Switching**: Titan has two modes:
  - **Coaching Mode**: Workout programming, training advice, performance optimization
  - **Medical Mode**: Biomarker interpretation, lab result analysis, clearance management

#### Onboarding

Titan's onboarding uses an **intake accumulator** pattern for multi-step data collection:
- Fitness level
- Training goals
- Injury history
- Current supplements
- Baseline biometrics

#### Core Data (Training)

- Workout session logs
- Training cycles (periodization)
- Routines and rest periods
- Sleep tracking
- Custom field management
- Readiness scores

#### Core Data (Biomedical — from Soma)

```
SomaProfile:
  biomarkers: BiomarkerRecord[]        // Cortisol, testosterone, thyroid, iron, glucose, etc.
  clearances: ClearanceRecord[]         // Medical clearances for activities
  labSummaries: LabSummaryRecord[]      // Parsed lab results
  medicalImages: MedicalImageAnalysis[] // MRI, X-ray analysis
  vitalHistory: VitalRecord[]
```

**Biomarker categories**: Vitals, Hormones, Metabolic, General Health
**Clinical ranges**: Pre-defined normal/warning/critical bands for ~50 biomarkers

#### Extension Fields

Soma provides ~50 pre-built extension field suggestions across:
- Vital signs (resting HR, blood pressure, body temperature)
- Hormones (cortisol, testosterone, estrogen, melatonin)
- Metabolic (blood glucose, insulin, HbA1c, lipid panel)
- General (immune markers, inflammation markers)

Titan training provides extension fields for:
- Supplement tracking
- PR tracking
- Custom exercise metrics

#### Diagnosis Tool

Titan has a **diagnosis panel** — an AI-powered assessment tool that:
1. Analyzes the user's biomarkers, training history, and recovery state
2. Generates structured findings and recommendations
3. Suggests new biomarker fields to track
4. Proposes training plan adjustments

⚠️ *Diagnosis uses a dedicated prompt (`titan-diagnosis-prompt.ts`), extractor, and merge pipeline.*

#### NSV Ownership

- **Writes**: `biological.cnsFatigue`, `biological.sleepQuality`, `biological.recoveryScore`, `biological.hormonalContext`
- **Reads**: `biological.*`, `emotional.*`, `cognitive.energyBudget`

#### Key Actions

| Action | Description |
|--------|-------------|
| `update_cnsFatigue` | Update CNS fatigue score |
| `update_sleepQuality` | Update sleep quality score |
| `log_workout` | Record a workout session |
| `create_routine` | Build a training routine |
| `manage_cycle` | Start/complete training cycles |
| `commit_biomarker` | Record a biomarker value |
| `update_clearance` | Update medical clearance status |
| `parse_lab_report` | Process uploaded lab results |

#### Spine Integration

- **Emits**: VITAL_UPDATED, CYCLE_STARTED, CYCLE_COMPLETED, WORKOUT_COMPLETED, SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED
- **Listens**: BLOCK_HIGH_INTENSITY (from cascade rules when CNS fatigue is too high)
- **Cascade**: When cnsFatigue ≥ 8, Spine auto-emits BLOCK_HIGH_INTENSITY which prevents Titan from recommending high-intensity training

---

### 5.4 Atlas (Life Planning)

| Property | Value |
|----------|-------|
| **ID** | `atlas` |
| **Alias** | Atlas |
| **Theme** | Sky |
| **Core Module** | No (Extended) |
| **Has Page** | Yes |
| **Security** | Locked by default |

#### Purpose

Atlas is the **life planner** — the module that knows everything the user plans to do and reviews what did and didn't go as planned. Atlas is unique in that it serves as a **cross-module review engine**: it analyzes data from Agnes (emotional state) and Titan (physical state) to make predictions, detect failures, and notify other agents when the user has fallen behind.

#### Personality

- **Archetype**: Cognitive architect and life planner
- **Philosophy**: "Great planning IS self-care. Plans that ignore recovery are extraction, not planning."
- **Tone**: Structured, supportive, energy-aware
- **Internal Monologue**: NSV_Check → Capacity_Assessment → Timeline_State → Verification_Needs → Strategy

#### Core Data

- **Tasks**: Title, priority, deadline, status, dependencies
- **Goals**: Long-term objectives with milestone tracking and progress percentage
- **Habits**: Streak tracking, frequency, logged metrics
- **Routines**: Daily/weekly structured blocks
- **Energy Wave**: Real-time energy budget visualization

#### Extension Fields (10 templates)

| Field | Type | Description |
|-------|------|-------------|
| deep-work-hours | NUMBER (0-16) | Hours of deep focus work |
| pomodoro-count | NUMBER (0-25) | Pomodoro sessions completed |
| distraction-count | NUMBER | Interruptions logged |
| flow-state-achieved | BOOLEAN | Whether flow state was reached |
| energy-budget-available | NUMBER (0-10) | Available cognitive capacity |
| decision-fatigue-level | NUMBER (0-10) | Decision fatigue score |
| mental-clarity | NUMBER (0-10) | Clarity rating |
| cognitive-recovery-needed | BOOLEAN | Whether recovery break is needed |
| routine-adherence | PERCENTAGE (0-100) | Routine completion rate |
| daily-reflection-score | NUMBER (0-10) | End-of-day self-assessment |

#### Cross-Module Review Engine

Atlas's most powerful feature is its **cross-module verification**:

- **Reads Agnes data** to understand emotional capacity → adjusts task recommendations when resilience is low
- **Reads Titan data** to understand physical recovery → blocks cognitive overload when CNS fatigue is high
- **Detects failures**: When streaks break, tasks miss deadlines, or goals stall, Atlas:
  1. Updates its own planning metrics
  2. **Notifies Agnes** so the emotional impact can be addressed in therapy
  3. **Notifies Titan** if the failure relates to physical commitments
- **Generates predictions**: Based on historical patterns, Atlas can predict burnout risk, deadline pressure, and suggest preemptive schedule adjustments

⚠️ *Cross-module prediction and failure notification to Agnes/Titan is the intended vision. The cascade rule infrastructure supports this, but the full prediction engine may not be complete.*

#### NSV Ownership

- **Writes**: `cognitive.(energyBudget, focusScore, activeLoad, planningLoad, taskCompletionRate)`, `planning.(streakHealth, deadlinePressure)`
- **Reads**: ALL except `emotional.traumaMarkers`

#### Key Actions

| Action | Description |
|--------|-------------|
| `create_task` / `update_task` / `complete_task` | Task CRUD |
| `create_goal` / `update_goal_progress` | Goal management |
| `create_habit` / `update_habit_streak` / `log_habit_metric` | Habit tracking |
| `update_routine` | Modify daily routines |
| `schedule_block` | Add time blocks to schedule |
| `temporal_review` | Weekly drift analysis (planned vs actual) |
| `delegate_to_module` | Cross-module queries |

#### Spine Integration

- **Emits**: ATLAS_TASK_COMPLETED, ATLAS_HABIT_LOGGED, ATLAS_GOAL_MILESTONE, ATLAS_ENERGY_UPDATED, STREAK_BROKEN, DEADLINE_APPROACHING
- **Listens**: BLOCK_HIGH_INTENSITY, BURNOUT_WARNING, FLATTEN_ENERGY_WAVE, VITAL_UPDATED, FINANCIAL_STRESS
- **Special**: Atlas receives FLATTEN_ENERGY_WAVE from cascades and responds by compressing the schedule and reducing cognitive load

---

### 5.5 Ledger (Financial)

| Property | Value |
|----------|-------|
| **ID** | `ledger` |
| **Alias** | Ledger |
| **Theme** | Cyan |
| **Core Module** | Yes |
| **Has Page** | Yes |
| **Security** | Locked by default |

#### Purpose

Ledger is the user's **accountant**. It knows all financial data: income, debt, savings, spending patterns. Ledger is distinguished by its **cross-verification capability** — it correlates financial behavior with data from other agents to understand the user's state during spending and income events.

#### Personality

- **Archetype**: Elite AI Financial Strategist
- **Methodology**: Cashflow truth → goals → plans
- **Tone**: Precise, analytical, non-judgmental about spending
- **Philosophy**: Financial health is part of overall wellness, not separate from it

#### Core Data

- Monthly income streams
- Fixed and variable costs
- Debt obligations
- Savings and investments
- Budget categories and allocations
- Transaction history

#### Financial Tools

Ledger has specialized tools beyond basic tracking:

1. **Document Parsing**: Upload receipts, invoices, bank statements → AI extracts and categorizes
2. **Tax Assistance**: Calculate tax deductions, estimate tax liability, help with filing preparation
3. **Spending Visualization**: Flow diagrams showing income → spending → savings paths
4. **Budget Alerts**: Proactive notifications when spending patterns deviate from budget
5. **Resonance ROI**: A unique metric that measures "wellbeing return per dollar spent" — correlating spending categories with emotional/physical outcomes

#### Cross-Verification

Ledger cross-verifies financial data with other agents:

- **With Agnes**: Understands emotional state during spending (stress spending, retail therapy, financial anxiety)
- **With Titan**: Correlates health-related spending (gym, supplements, medical) with physical outcomes
- **With Atlas**: Aligns financial goals with life goals, tracks budget adherence as part of the planning review

⚠️ *The cross-verification depth (correlating spending with emotional state, generating spending-during-stress insights) is the intended vision. Basic financial tracking and document parsing are implemented.*

#### Extension Fields (12+ templates)

Budget categories, side income tracking, crypto portfolio, subscription costs, emergency fund progress, investment returns, etc.

#### Diagnosis Tool

Ledger has a diagnosis flow that:
1. Analyzes income vs. spending patterns
2. Identifies financial friction points
3. Suggests budget optimizations
4. Recommends new tracking fields

#### NSV Ownership

- **Writes**: `resource.financialFriction`, `resource.resonanceROI`
- **Reads**: `resource.*`, `cognitive.energyBudget`, `emotional.stressLoad`

#### Key Actions

| Action | Description |
|--------|-------------|
| `create_financial_plan` | Generate a financial plan |
| `update_budget_snapshot` | Update current budget state |
| `compute_resonance_roi` | Calculate wellbeing/spending ratio |
| `analyze_financial_document` | Process uploaded financial documents |

#### Spine Integration

- **Emits**: FINANCIAL_STRESS, BUDGET_UPDATED, FINANCIAL_FRICTION_CHANGED, FINANCIAL_PLAN_CREATED
- **Listens**: Emotional stress changes, planning events (to align financial goals)

---

### 5.6 Scout (Research)

| Property | Value |
|----------|-------|
| **ID** | `scout` |
| **Alias** | Scout |
| **Theme** | Lime |
| **Core Module** | No (Extended) |
| **Has Page** | Yes |
| **Security** | Locked by default |

#### Purpose

Scout is a **search and research tool**. It is explicitly **isolated from the Global Soul** — it cannot update soul data. Scout helps the user research topics, synthesize information, and build knowledge graphs.

#### Personality

- **Archetype**: Knowledge cartographer
- **Epistemology Framework**: Every piece of information gets a confidence score:
  - 0.0-0.3: Speculative (no evidence)
  - 0.3-0.6: Partially supported (mixed quality sources)
  - 0.6-0.8: Well-sourced (multiple credible sources)
  - 0.8-1.0: Authoritative (peer-reviewed, institutional)
- **Source Hierarchy**: peer-reviewed > government > news > expert opinion > secondary sources
- **Momentum Tracking**: Tracks whether topics are rising | steady | cooling | dormant

#### Core Data

- Research threads with relevance scores
- Knowledge nodes with confidence ratings
- Source citations and quality ratings
- Momentum signals per topic

#### Tools

- Web search integration
- Document analysis (uploaded PDFs, images)
- Knowledge graph building and visualization
- Research thread management

#### NSV Ownership

- **Writes**: `cognitive.researchLoad`, `cognitive.interestDiversity`
- **Reads**: `biological.cnsFatigue`, `cognitive.(energyBudget, focusScore)`, `emotional.moodTrend`
- **Soul Impact**: None. Scout is a tool. It does not contribute to or modify the Global Soul.

#### Key Actions

| Action | Description |
|--------|-------------|
| `search_web` | Execute a web search |
| `add_node` | Add to knowledge graph |
| `verify` | Fact-check a claim |
| `update_graph` | Modify knowledge graph structure |
| `commit_research` | Finalize a research thread |

#### Diagnosis Tool

Scout has a diagnosis flow for analyzing research portfolio — which topics are stale, which need deeper investigation, and which are complete.

---

### 5.7 Forge (Execution)

| Property | Value |
|----------|-------|
| **ID** | `forge` |
| **Alias** | Forge |
| **Theme** | Rose |
| **Core Module** | No (Extended) |
| **Has Page** | Yes |
| **Security** | Open by default |

#### Purpose

Forge is the **execution engine** — a multi-purpose tool for getting things done. Like Scout, it is **isolated from the Global Soul** and cannot update soul data. Forge reads wellness context to understand the user's capacity but never writes NSV.

#### Personality

- **Archetype**: Execution engine — precise, deliberate, safety-first
- **Tone**: Technical, efficient, protective

#### Four Operational Modes (Overlays)

| Mode | Capabilities |
|------|-------------|
| **CODE** | Code generation, debugging, refactoring, testing |
| **COMMS** | Email drafting, message handling, communication templates |
| **DOCS** | Document creation, editing, formatting |
| **LIFE** | Checklists, trip planning, budgets, general execution |

#### Safety Protocol

Forge classifies every operation by risk level:

| Risk | Examples | Behavior |
|------|----------|----------|
| **safe** | Pure computation, text generation | Execute immediately |
| **low** | Read-only file operations | Execute with notification |
| **medium** | File writes, API calls | Execute with user confirmation |
| **high** | File deletions, database operations | Require explicit approval |
| **blocked** | Shell escapes, privilege escalation, data exfiltration | Refuse and explain |

#### NSV Ownership

- **Writes**: None
- **Reads**: `biological.(cnsFatigue, sleepQuality)`, `cognitive.(energyBudget, focusScore, activeLoad)` — cognitive performance context only
- **Soul Impact**: None. Forge is a tool.

#### Key Actions

| Action | Description |
|--------|-------------|
| `execute_code` | Run code (status: queued → pending_approval → executed) |
| `read_file` / `write_file` | File operations |
| `run_tests` | Execute test suite |
| `propose_refactor` | Suggest code improvements |
| `draft_email` / `send_communication` | Communication tools |

---

### 5.8 Soma (Biomedical Data Layer)

| Property | Value |
|----------|-------|
| **ID** | `soma` |
| **Alias** | Soma |
| **Theme** | Emerald |
| **Core Module** | No (Extended) |
| **Has Page** | Yes |
| **Security** | Locked by default |

#### Purpose

Soma is the **biomedical data layer** — a dedicated module for managing health metrics, biomarkers, lab results, and medical clearances. While Titan handles active training and fitness, Soma focuses on passive health data and medical context.

#### Personality

- **Archetype**: Clinical health data specialist
- **Tone**: Precise, medical, supportive
- **Focus**: Biomarker tracking, lab result interpretation, readiness assessment

#### Core Data

```
SomaProfile:
  biomarkers: BiomarkerRecord[]        // Cortisol, testosterone, thyroid, iron, glucose, etc.
  clearances: ClearanceRecord[]         // Medical clearances for activities
  labSummaries: LabSummaryRecord[]      // Parsed lab results
  medicalImages: MedicalImageAnalysis[] // MRI, X-ray analysis
  vitalHistory: VitalRecord[]
```

**Biomarker categories**: Vitals, Hormones, Metabolic, General Health
**Clinical ranges**: Pre-defined normal/warning/critical bands for ~50 biomarkers

#### NSV Ownership

- **Writes**: `biological.cnsFatigue`, `biological.sleepQuality`, `biological.recoveryScore`, `biological.hormonalContext`
- **Reads**: `biological.*`, `emotional.*`

#### Key Actions

| Action | Description |
|--------|-------------|
| `commit_biomarker` | Record a biomarker value |
| `update_clearance` | Update medical clearance status |
| `parse_lab_report` | Process uploaded lab results |
| `update_readiness` | Update readiness score |

#### Spine Integration

- **Emits**: SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED, SOMA_VITAL_LOGGED, SOMA_LAB_REPORT_PARSED, SOMA_PROFILE_UPDATED, SOMA_DIAGNOSIS_MERGED
- **Listens**: BURNOUT_WARNING, health context requests
- **Cascade**: Poor readiness (≤30) triggers COMPOUND_STRESS; clearance revoked triggers VITAL_UPDATED

---

### 5.9 Peripheral Modules

#### Documents

| Property | Value |
|----------|-------|
| **ID** | `documents` |
| **Theme** | Slate |
| **Purpose** | Document intelligence — ingestion, analysis, extraction |
| **Soul Impact** | None |
| **Security** | Locked by default |

Document module handles PDF/image upload, OCR, text extraction, and AI-powered document analysis. It's a support module used by other modules (Ledger for financial docs, Scout for research papers, Titan for lab results).

#### Bridge

| Property | Value |
|----------|-------|
| **ID** | `bridge` |
| **Theme** | Slate |
| **Purpose** | Alert daemon — background monitoring and notification |
| **Has Page** | No |
| **Soul Impact** | None |

Bridge is a **headless module** (no UI page). It monitors Spine events in the background and triggers alerts/notifications based on configurable rules.

#### Hub

| Property | Value |
|----------|-------|
| **ID** | `hub` |
| **Purpose** | Central dashboard — module health aggregation |
| **Has Page** | Yes |

Hub is the user's **command center** — a single view showing the health/status of all active modules, recent activity, and quick access to any module. It aggregates NSV data for a holistic overview.

#### Profile

| Property | Value |
|----------|-------|
| **ID** | `profile` |
| **Purpose** | User identity and global preference management |
| **Has Page** | Yes |

Profile manages the user's core identity (name, pronouns, age), agent personality provisions (agent names, genders, tones), security preferences (vault locks), and data export/management.

#### Notifications

| Property | Value |
|----------|-------|
| **ID** | `notifications` |
| **Purpose** | Alert center — system notifications and reminders |
| **Has Page** | Yes |

Notifications provides a centralized view of all system alerts, module reminders, and Spine events that require user attention. Works in conjunction with the Bridge service for background monitoring.

---

## 6. Data Flow Contracts

### 6.1 Conversation → Soul Update Flow

```
User sends message to module agent
  ↓
Agent processes with context:
  - System prompt (persona)
  - User profile
  - Global Soul (NSV, filtered by read permissions)
  - Episodic memory (recent relevant sessions)
  - Semantic memory (extracted facts)
  - Extension field values
  ↓
Agent responds with:
  - Public text (user-facing response)
  - Internal thoughts (<thought> blocks, hidden from user)
  - Action tags (<action type="..."> structured mutations)
  ↓
Action Hub executes actions:
  - Module state updated (profile, extension fields)
  - NSV fields updated (if module owns them)
  - Spine events emitted
  ↓
Spine cascade rules evaluate:
  - Trigger conditions checked
  - Cascade events generated (depth + 1)
  - Cross-module listeners notified
  ↓
Session persisted:
  - Messages saved to module memory
  - Session summary generated
  - Key insights extracted
  - Semantic facts updated with confidence scores
  ↓
Global Soul update (if warranted):
  - Compacted insights synced
  - NSV fields updated via GlobalProjectionService
  - Overall wellness score recomputed
```

### 6.2 Onboarding → Dashboard Flow

```
User enters module for first time
  ↓
Onboarding gate: check for existing profile
  ↓
Conversational OR Fasttrack onboarding
  ↓
Agent validates and structures input
  ↓
Profile created with:
  - Core schema fields (populated)
  - Extension fields (empty, templates available)
  - Module memory initialized
  ↓
Dashboard rendered from profile:
  - Template-driven layout
  - Interactive cards for each data entity
  - "Add Field" button available
  - Chat drawer accessible
```

### 6.3 Cross-Module Query Flow

```
User asks Nexus about a topic spanning multiple domains
  ↓
Nexus identifies relevant modules
  ↓
Nexus emits: <action type="query_module">{"target": "agnes", "query": "..."}</action>
  ↓
Action Hub delegates to target module
  ↓
Target module responds with domain-specific data
  ↓
Nexus synthesizes responses from all consulted modules
  ↓
Unified response presented to user
```

### 6.4 Memory Retrieval Flow

```
New conversation starts
  ↓
Memory Manager retrieves:
  1. Recent episodic memories (last N sessions, scored by relevance)
  2. Semantic facts (high-confidence extracted statements)
  3. Active session state (if resuming)
  ↓
Context assembled:
  - System prompt + persona
  - User profile
  - NSV (filtered)
  - Retrieved memories (formatted as context block)
  - Extension field values
  ↓
Agent has full context continuity across sessions
```

---

## 7. Security & Privacy Model

### 7.1 Vault — The User's Sealed Safe

The vault should be understood as the user's **sealed private safe inside Nexus**.

It exists to separate:

- **Login** — who the user is, what account is theirs, what can sync
- **Vault** — what private parts of the user's life may be opened on this device right now

This distinction is essential. If login and vault are both required for every interaction, the vault becomes a second password tax instead of a meaningful privacy boundary.

#### Product purpose of the vault

The vault is responsible for:

1. establishing the user-held master encryption key,
2. verifying the vault password via a canary,
3. unlocking access to protected private data,
4. acting as the sealed safe for protected memory and protected module state.

#### What the vault should gate

The vault should be required for:

- decrypting protected module profiles,
- reading protected session history,
- writing protected memory,
- updating deeply private module state,
- accessing trauma-sensitive Agnes data,
- accessing financial protected records,
- accessing medical / biomarker protected records,
- importing/exporting encrypted protected data,
- merging ephemeral sessions into durable private history.

The vault should **not** be required for:

- login itself,
- entering the app shell,
- Hub and orchestrator shell access,
- opening safe module landing surfaces,
- reading safe non-sensitive metadata,
- starting explicitly ephemeral support flows.

#### Agnes special rule

Agnes introduces the clearest product rule: **impromptu support should be available pre-vault as an ephemeral mode**, while full Agnes history, belief graph, trauma-sensitive data, and durable therapeutic memory stay vault-protected.

#### Current implementation note

Today, the runtime derives a single shared master key and verifies it using a canary in `vaults/{uid}`. The current `getModuleKey(moduleName)` API does not yet provide true per-module crypto isolation; it returns the same in-memory master key. Product-wise, this still functions as a sealed-safe model, but the subdomains are policy-separated more than cryptographically separated.

### 7.2 Per-Module Security Policies

| Module | Default Locked | Mandatory Lock | Notes |
|--------|---------------|----------------|-------|
| Agnes | ✅ Yes | ✅ Yes | Therapy data is ALWAYS encrypted |
| Soma | ✅ Yes | ❌ No | Medical data locked by default |
| Ledger | ✅ Yes | ✅ Yes | Financial data is ALWAYS encrypted |
| Atlas | ✅ Yes | ❌ No | Planning data locked by default |
| Scout | ✅ Yes | ❌ No | Research data locked by default |
| Forge | ❌ No | ❌ No | Tool, open by default |
| Nexus | ❌ No | ❌ No | System, open by default |
| Titan | ❌ No | ❌ No | Training data open by default |

**Access Control**: Per-module access is controlled via `isModuleAccessible(moduleId)` which checks both vault unlock state and module-specific lock settings in `userSecurityPreferences.vaultLocks`.

### 7.3 Access Model

Protected modules should conceptually have two layers:

- **module shell access** — the user can open the module and see safe top-level UI
- **private data access** — the user can decrypt, load, and mutate protected payloads

This means a locked authenticated user should not be treated the same as a guest user. The intended product model has three distinct states:

1. **Logged out** — no account access
2. **Logged in, vault locked** — app access, sealed private safe
3. **Logged in, vault unlocked** — full protected access

### 7.4 Privacy Boundaries

- **NSV Read Permissions**: Each module only sees NSV fields relevant to its domain (see ownership matrix in Section 2)
- **TraumaMarkers**: Agnes-exclusive — no other module can read or write trauma data
- **Encryption at Rest**: Firestore documents store `{ encryptedData, iv, metadata }` — metadata is unencrypted for querying, actual data is encrypted
- **Guest Mode**: Unauthenticated users get localStorage-based mock services. Data can be migrated to a full account later via `syncAllGuestDataToUser`

### 7.5 Data Sovereignty

- Users control their own encryption keys (password-derived)
- Data can be exported from any module independently
- Soul termination: Users can destroy their Global Soul and all module data through a dedicated service (`soul-termination-service.ts`)
- No server-side has access to decrypted user data

---

## 8. Soul Priority Hierarchy

The Soul Priority Hierarchy defines which modules' data contributions carry the most weight when the Global Soul is synthesized:

### Tier 1: Agnes (Emotional Core)

Agnes's data is the **emotional truth** of the Global Soul. Emotional resilience, stress load, mood trends, and trauma markers form the foundational layer of who the user is. All other modules reference this data but cannot override it.

**Rationale**: Mental/emotional state affects every other domain. Financial decisions, workout motivation, planning capacity — all are downstream of emotional state.

### Tier 2: Titan (Physical Foundation)

Physical data is second because the body is the vessel. CNS fatigue, sleep quality, recovery scores, and biomarkers represent the user's physical capacity.

**Rationale**: Physical state constrains what's achievable. A fatigued body limits cognitive capacity, affects emotional resilience, and shapes financial decisions.

### Tier 3: Atlas (Planning Intelligence)

Atlas is the **cross-module review engine**. It doesn't just plan — it verifies. Atlas:
- Analyses Agnes data to predict emotional capacity for tasks
- Analyses Titan data to predict physical readiness
- Notifies Agnes and Titan when the user fails goals (so they can update their data accordingly)
- Produces predictions and drift analysis

**Rationale**: Planning is where emotional and physical state become actionable. Atlas bridges the gap between "how you feel" and "what you do."

### Tier 4: Ledger (Resource Context)

Ledger provides the financial dimension. It cross-references financial behavior with:
- Emotional state during spending (from Agnes)
- Health-related expenditures (from Titan)
- Budget adherence as part of goal tracking (from Atlas)

**Rationale**: Financial health is a critical but derivative domain — it's affected by emotional and physical state more than it affects them.

### Tier 5: Scout & Forge (Isolated Tools)

Scout and Forge are **utility modules**. They are powerful tools but they do not contribute to the Global Soul. Scout researches, Forge executes — neither defines who the user is.

**Rationale**: Research interests and task execution are transient activities, not identity markers.

---

## 9. Implementation Status

This section tracks where the current codebase matches the vision spec vs. where gaps exist.

### ✅ Fully Implemented

- Global Soul / NSV data model and ownership matrix
- Spine event bus with ~170 event types
- Cascade rules: 10 rule sets with 30+ individual rules across CORE, LEDGER, AGNES, ATLAS (multiple), SOMA, TITAN
- Scheduler service with three registered schedules (morning brief 09:00, evening check-in 20:30, weekly review Sun 18:00)
- Per-module personas with unique personalities
- Action Hub with dependency resolution
- Vault encryption (PBKDF2 + AES-GCM)
- Module manifest with security policies and per-module access control via `isModuleAccessible()`
- 13 routes: /, /vault-gate, /nexus, /hub, /agnes, /titan, /ledger, /soma, /atlas, /scout, /forge, /profile, /notifications
- 10-layer provider stack: Theme → DataLayer → Router → Auth → AI → Notification → Vault → GlobalSoul → ErrorBoundary → AIRuntimeGate
- Onboarding flows (Nexus, Agnes, Titan, Atlas, Scout, Forge, Soma, Ledger)
- Extension field system (SchemaRegistry, LLM validation, templates)
- Three conversation scopes (general, scoped, field-CRUD)
- Memory system (episodic + semantic)
- Diagnosis pattern (Titan, Ledger, Scout, Soma)
- Agent personality provision (custom names, genders, tones via CoreUserProfile.agentPersonalityProvision)
- Soul Write Protocol (SOUL_WRITE_REQUESTED, SOUL_WRITE_APPROVED, SOUL_WRITE_REJECTED)
- Contextual Inference Engine (CONTEXT_HINT_DETECTED, CONTEXT_HINT_CONFIRMED, CONTEXT_HINT_DISMISSED)
- Reminder lifecycle (REMINDER_PROPOSED, REMINDER_CONFIRMED, REMINDER_DISMISSED)
- Atlas intelligent loop (morning briefs, evening check-ins, weekly review)
- Atlas failure notification cascade (COMMITMENT_MISSED → ROUTINE_UPDATED, HABIT_STREAK_BROKEN → SOMATIC_SUPPORT_REQUESTED)
- Agnes somatic support integration (SOMATIC_SUPPORT_REQUESTED, SOMATIC_SESSION_COMPLETE)
- Atlas journal entries with reflection streak milestones
- Atlas predictive alerts with FLATTEN_ENERGY_WAVE cascade

### ⚠️ Partially Implemented

- **Atlas cross-module review**: Infrastructure exists (Spine events, NSV reads), but the full prediction engine (predicting burnout from Agnes+Titan data) could be deepened
- **Ledger cross-verification**: Basic financial tracking works, but deep correlation of spending with emotional state and generation of cross-domain insights is an area for expansion
- **Soul compaction**: NSV updates flow correctly, but the full compaction pipeline (filtering low-signal data, periodic optimization) could be more sophisticated
- **Nexus scheduling**: Cross-module action scheduling (e.g., "schedule a therapy check-in after missed workouts") is architecturally possible but not fully wired

### 🔲 Not Yet Implemented

- **Ledger tax tools**: Full tax calculation, deduction tracking, and filing assistance are vision items
- **Resonance ROI computation**: The metric is defined in the NSV but the full computation pipeline (correlating spending with emotional/physical outcomes) needs implementation
- **Advanced predictive analytics**: Atlas generating complex predictions from historical Agnes/Titan data patterns beyond current risk scoring

---

## Appendix: Module Quick Reference

| Module | Domain | Agent Name | Theme | Core | Soul Priority | Soul Access | Route |
|--------|--------|------------|-------|------|--------------|-------------|-------|
| Nexus | System | Nexus | Violet | ✅ | — | Read ALL | /nexus |
| Agnes | Emotional | Agnes | Indigo | ✅ | 1 (Highest) | Write emotional.* | /agnes |
| Titan | Physical | Titan | Orange | ✅ | 2 | Write biological.* | /titan |
| Soma | Biomedical | Soma | Emerald | ❌ | 2 | Write biological.* | /soma |
| Atlas | Planning | Atlas | Sky | ❌ | 3 | Write cognitive.*, planning.* | /atlas |
| Ledger | Financial | Ledger | Cyan | ✅ | 4 | Write resource.* | /ledger |
| Scout | Research | Scout | Lime | ❌ | 5 (Isolated) | Write cognitive.(research) | /scout |
| Forge | Execution | Forge | Rose | ❌ | 5 (Isolated) | Read-only | /forge |
| Hub | Dashboard | — | — | ❌ | — | Read-only | /hub |
| Profile | Identity | — | — | ❌ | — | Identity mgmt | /profile |
| Notifications | Alerts | — | — | ❌ | — | None | /notifications |
| Landing | — | — | — | ❌ | — | None | / |
