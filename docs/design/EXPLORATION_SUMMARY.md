# AGNES Codebase Exploration: Spending-Emotion Correlation & Behavioral Analysis

## 1. LEDGER MODULE — DEFINITION & PURPOSE

**Primary Files:**
- `/src/modules/ledger/personas.ts` — Agent personality (Elite AI Financial Strategist)
- `/skills/nexus-product-spec/modules/ledger.md` — Product definition
- `/src/modules/ledger/services/resonance-roi-service.ts` — ROI computation (wellbeing return per dollar)
- `/src/modules/ledger/services/ledger-intake-service.ts` — Profile persistence

**Core Metrics Ledger Owns (NSV - Neural State Vector):**
- `resource.financialFriction` (0-10: financial stress index) — **WRITES**
- `resource.resonanceROI` (0-1: wellbeing ROI) — **WRITES**
- Reads: `emotional.stressLoad`, `cognitive.energyBudget` (for decision-quality calibration)

**Key Actions:**
- `create_financial_plan`, `update_budget_snapshot`, `compute_resonance_roi`
- `analyze_financial_document`, `update_financial_friction`
- `log_transaction_summary`, field CRUD operations

---

## 2. ACTIONHUB HOOKS & INTEGRATION POINTS

**Central Hub:** `/src/lib/actions/action-hub.ts`

**How Ledger Integrates:**
1. **Reads NSV** → `context.getLatestNSV()` retrieves `stressLoad`, `emotionalResilience`, `energyBudget`
2. **Writes NSV** → `context.updateGlobalSoul(patch)` updates `financialFriction` + `resonanceROI`
3. **Broadcasts Events** → `context.emitSpineEvent(type, payload)` triggers cascades
4. **LLM Delegation** → `context.sendMessage(content, context)` for semantic analysis

**Ledger Registration:**
- File: `/src/modules/ledger/services/actions.ts`
- Pattern: `ActionHub.registerMultiple('ledger', { handler_name: handlerFn })`
- Spine Events Emitted: `BUDGET_UPDATED`, `FINANCIAL_FRICTION_CHANGED`, `RESONANCE_ROI_UPDATED`, `FINANCIAL_PLAN_CREATED`, `DOCUMENT_ANALYZED`

---

## 3. EMOTIONAL/BIOLOGICAL INPUTS TO LEDGER

**NSV Type Definitions:** `/src/lib/types.ts` (NeuralStateVector interface)

**What Ledger Receives (NSV_READ_PERMISSIONS):** `/src/lib/services/nsv-ownership.ts`
```
ledger reads:
  - resource.financialFriction (primary)
  - resource.resonanceROI (primary)
  - cognitive.energyBudget (decision fatigue signal)
  - emotional.stressLoad ← EMOTION-SPENDING LINK
```

**NSV Structure (Biomarkers/Signals Available Across Modules):**
```
biological: cnsFatigue (0-10), sleepQuality (0-10), recoveryScore, hormonalContext
emotional: emotionalResilience (0-10), stressLoad (0-10), moodTrend, traumaMarkers
cognitive: energyBudget (0-10), focusScore, activeLoad, planningLoad, taskCompletionRate
planning: streakHealth, deadlinePressure
resource: financialFriction, resonanceROI ← Ledger domain
```

---

## 4. EMOTION-SPENDING CORRELATION REFERENCES IN CODE

**Core References:** `/src/lib/services/nsv-prompt-fragments.ts`

**Detected Patterns:**
```
stressLoad ≥ 7 → Acknowledge stress-spending pattern risk. Gently surface:
  "High stress periods can affect financial decisions — let's look at the last week together."
  Ask about impulse purchases or financial avoidance behaviour.

financialFriction ≥ 8 AND emotionalResilience ≤ 4 → DUAL-DOMAIN CRISIS.
  (Signals that financial + emotional distress are co-occurring)
```

**Cross-Module Context:**
- **Agnes (therapist)** READS `resource.financialFriction` as therapy entry point
- **Atlas (planner)** READS `resource.financialFriction` (adds ~2pts hidden cognitive load)
- **Ledger** READS `emotional.stressLoad` to contextualize spending patterns
- **Nexus (orchestrator)** detects correlations and surfaces them proactively

**Important Note from Product Spec:**
> "Cross-verification depth (correlating spending with emotional state, generating spending-during-stress insights) is **VISION** — basic financial tracking and document parsing are implemented."

---

## 5. FEATURE FLAGS & TOGGLES PATTERN

**No Traditional Feature Flag System Found**

Instead, uses:
1. **Module Unlock Gates** — Vault-based security (see `LedgerDashboard.tsx`)
   - "Unlock Ledger to view financial telemetry."
2. **NSV Threshold Gates** — Behavioral conditions in prompts (`nsv-prompt-fragments.ts`)
   - `cnsFatigue ≥ 9 → CRISIS mode`
   - `stressLoad ≥ 7 → INTERVENTION`
3. **Remote Config Infrastructure** — Available but unused
   - File: `/remoteconfig.template.json` (currently empty)
   - Backend: Firebase Remote Config API available

**Recommended Pattern for New Features:**
```typescript
// Check user consent + NSV state + remote config
const emotionalSpendingAnalysisEnabled = 
  remoteConfig.getBoolean('ledger_emotional_spending_enabled') &&
  userProfile.dataConsent.spending_analysis &&
  nsv.emotional.stressLoad !== null &&
  nsv.resource.financialFriction !== null;
```

---

## 6. METRICS & ANALYTICS PATTERNS

**Event Infrastructure:** `/src/lib/spine/spine-event-bus.ts`

**Spine Event Structure:**
```typescript
interface SpineEvent {
  id: string;
  type: SpineEventType;
  source: string;                    // 'ledger', 'agnes', etc.
  domain: 'E'|'B'|'C'|'R'|'P';      // Emotional, Biological, Cognitive, Resource, Planning
  priority: 'info'|'alert'|'critical';
  cascadeDepth: number;
  timestamp: number;
  payload: Record<string, unknown>;
}
```

**Event Persistence:**
- All events logged to Firestore (audit trail + analytics)
- Cascade rules trigger cross-module reactions
- Example: `FINANCIAL_STRESS` → condition check → emit `DUAL_DOMAIN_CRISIS` to Nexus

**Session-Level Telemetry:** `/src/lib/types.ts` (ModuleMemoryEnvelope)
```typescript
interface SessionEventSummary {
  summary: string;
  keyInsights: string[];
  sentiment: number;        // Emotional valence
  tokenUsage: number;       // LLM cost
  embedding?: number[];     // Semantic vector for retrieval
}
```

**Component-Level Telemetry:**
- `AgnesTelemetryHeader.tsx` — emotional session summaries
- `BiomarkerDashboard.tsx` — vital sign telemetry
- `LedgerDashboard.tsx` — financial snapshots
- `TelemetryTicker()` in `/src/core/layout/ModuleLayout.tsx` (UI display only)

---

## 7. RECOMMENDED DESIGN DOC LOCATION

**Best Path:** `/home/pacman/Projects/agnes/docs/design/`

**Directory Structure:**
```
/docs/
├── design/                                    ← NEW DOCS HERE
│   └── (create: SPENDING_EMOTION_CORRELATION_DESIGN.md)
├── product/
│   └── NEXUS_PRODUCT_DEFINITION.md
├── ANALYSIS_SUMMARY.md
├── CONFORMANCE_ANALYSIS.md
└── SOMA_IDENTITY_EXPLORATION.md
```

**Suggested Structure for Design Doc:**
1. **Problem Statement** — spending-emotion correlation use cases
2. **Data Model** — NSV fields to capture, extension fields
3. **Analysis Engine** — algorithms for detecting patterns
4. **LLM Integration** — prompt patterns, action tags
5. **UI/UX** — dashboard, insights, recommendations
6. **API/Hooks** — ActionHub calls, Spine events
7. **Analytics** — what to log, how to measure effectiveness
8. **Privacy/Consent** — user control over emotion-spending correlation

---

## KEY FILES REFERENCE TABLE

| Component | Path |
|-----------|------|
| **Ledger Module** | `/src/modules/ledger/` |
| Persona Definition | `/src/modules/ledger/personas.ts` |
| ROI Computation | `/src/modules/ledger/services/resonance-roi-service.ts` |
| ActionHub Integration | `/src/modules/ledger/services/actions.ts` |
| Dashboard UI | `/src/modules/ledger/components/LedgerDashboard.tsx` |
| Diagnosis (Doc Analysis) | `/src/modules/ledger/diagnosis/ledger-diagnosis-spec.ts` |
| **NSV/State Model** | `/src/lib/types.ts` |
| NSV Ownership Matrix | `/src/lib/services/nsv-ownership.ts` |
| NSV Prompt Rules | `/src/lib/services/nsv-prompt-fragments.ts` |
| **ActionHub Core** | `/src/lib/actions/action-hub.ts` |
| **Spine Events** | `/src/lib/spine/spine-event-bus.ts` |
| **Product Definition** | `/skills/nexus-product-spec/modules/ledger.md` |

