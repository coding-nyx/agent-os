# LLM State Flow Specification — AGNES
**Module:** M2 — LLM Specialist Layer  
**Version:** 1.0  
**Scope:** How NSV state reaches LLM prompts, shapes behavior, and flows through actions across all modules.

---

## 0. Governing Principle

State must be **purposeful, not exhaustive.** Sending every NSV field to every module is an anti-pattern — it creates prompt noise, erodes privacy boundaries between life domains, and trains the LLM to surface irrelevant concerns. Each module receives only the fields it can *act on*, framed in the language of its persona. A field that the module can neither acknowledge nor respond to differently should not occupy token budget.

The rule: **field → module only if at least one discrete behavioral change results.**

---

## 1. READ PERMISSION MATRIX

> ✅ = Full value received | ⚠️ = Derived/rounded value only | ❌ = Not sent | 🔒 = Sent only if user has explicitly opted in per-module

### 1.1 Biological

| NSV Field | Nexus | Agnes | Titan | Soma | Atlas | Scout | Ledger |
|---|---|---|---|---|---|---|---|
| `cnsFatigue` (0-10) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| `sleepQuality` (0-10) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ |
| `recoveryScore` (0-10) | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ | ❌ |
| `hormonalContext` (text) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ |

**⚠️ Derivation rules:**
- Scout receives `cnsFatigue` and `sleepQuality` as a single derived label: `cognitiveAvailability: "high" | "moderate" | "low"`. Raw numbers not shown.
- Atlas receives `recoveryScore` as a directional hint only: `"body is recovering"` or `"body is taxed"` — the raw float is suppressed to avoid Atlas over-weighting a single metric in scheduling.
- Agnes receives `recoveryScore` only as a context hint within `hormonalContext`, not as a standalone field — prevents Agnes from becoming a fitness tracker.

**Privacy rationale — Ledger:** Financial reasoning has zero causal relationship with biological state. Sending `cnsFatigue` to Ledger would cause it to pathologize normal spending under fatigue as problematic, which is presumptuous and potentially harmful.

### 1.2 Emotional

| NSV Field | Nexus | Agnes | Titan | Soma | Atlas | Scout | Ledger |
|---|---|---|---|---|---|---|---|
| `emotionalResilience` (0-10) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| `stressLoad` (0-10) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `moodTrend` (text) | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ❌ |
| `traumaMarkers` (string[]) | ✅ | ✅ | ❌ | 🔒 | ❌ | ❌ | ❌ |

**⚠️ Derivation rules:**
- Ledger and Scout receive `emotionalResilience` as a bandwidth label: `"emotionally available"` or `"emotionally stretched"` — sufficient for tone adjustment without exposing clinical score.
- Titan receives `moodTrend` as a single directional label (`"trending up"`, `"stable"`, `"declining"`) — Titan does not need narrative mood context, only enough to soften or energize coaching tone.
- Scout receives `moodTrend` as boolean: `"positive or neutral"` vs `"low"` — sufficient to adjust discovery energy.

**Privacy rationale — `traumaMarkers`:**
- This is the most sensitive field in the entire NSV. Default is ❌ for all non-therapeutic modules.
- Soma receives it only with explicit opt-in (`🔒`) because some trauma markers have somatic expressions (e.g., a note like "body image sensitivity" is clinically relevant if Soma is recommending body-scan exercises).
- Titan **never** receives `traumaMarkers`. A fitness coach receiving trauma context without therapeutic training is dangerous — it could cause well-intentioned but harmful prompts around body image, performance, or pain tolerance.
- Atlas, Scout, Ledger, and even Nexus routing logic **never** use `traumaMarkers` in their prompt contexts (Nexus stores it for AgentMemory lookups but does not inject it into delegation prompts).

### 1.3 Cognitive

| NSV Field | Nexus | Agnes | Titan | Soma | Atlas | Scout | Ledger |
|---|---|---|---|---|---|---|---|
| `energyBudget` (0-10) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `focusScore` (0-10) | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | ✅ | ⚠️ |
| `activeLoad` (0-10) | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ |
| `researchLoad` (0-10) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `planningLoad` (0-10) | ✅ | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| `taskCompletionRate` (0-1) | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |

**⚠️ Derivation rules:**
- Agnes receives `focusScore` as a meta-context flag: if `focusScore < 4`, Agnes is instructed to keep responses shorter, avoid multi-part homework, and be explicit that this is not the moment for cognitive heavy-lifting.
- Titan receives `focusScore` only as a binary: `"mentally sharp"` vs `"foggy"` — used for coaching cadence only.
- Ledger receives `focusScore` as a guard: if `focusScore < 4`, Ledger should avoid initiating budget analysis sessions and instead ask the user to confirm they want to proceed.
- Scout receives `planningLoad` as directional only: `"planning bandwidth available"` vs `"planning overhead high"` — Scout does not schedule, so the raw number is noise.

### 1.4 Resource

| NSV Field | Nexus | Agnes | Titan | Soma | Atlas | Scout | Ledger |
|---|---|---|---|---|---|---|---|
| `financialFriction` (0-10) | ✅ | ✅ | ❌ | ❌ | ⚠️ | ❌ | ✅ |
| `resonanceROI` (float) | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |

**⚠️ Derivation rules:**
- Atlas receives `financialFriction` as a constraint flag only: if `financialFriction >= 7`, Atlas avoids suggesting paid resources, subscriptions, or travel in plans. The raw score is not shown — Atlas gets a tag: `"financial constraints present"`.
- Agnes **does** receive `financialFriction` — financial stress is a documented driver of anxiety, relationship strain, and executive dysfunction. Agnes can acknowledge financial pressure as a real stressor without becoming a financial advisor.
- Titan, Soma: no financial awareness. These modules should never suggest paid services or equipment that might land poorly under financial friction.

---

## 2. BEHAVIORAL MATRIX

This section specifies *discrete behavioral changes* for high-salience field × module intersections. These are not suggestions — they are implementation contracts for prompt engineering.

### 2.1 Atlas (Planner)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `cnsFatigue` | 0–3 | Normal scheduling. Deep work blocks and planning sessions permitted. |
| `cnsFatigue` | 4–6 | Reduce cognitive task density. No back-to-back focus blocks. Insert 15-min buffer between work items. Flag "CNS moderately taxed" in plan preamble. |
| `cnsFatigue` | 7–10 | Emergency load-shedding mode. Deprioritize non-critical tasks. Suggest deferring any new commitments. Recommend max 2 focus hours. Use phrase: "Your system needs breathing room today." |
| `sleepQuality` | 0–4 | Add sleep-recovery note to morning plan. No early AM cognitive sprints. Suggest nap window if schedule allows. |
| `activeLoad` | 8–10 | Surface active task list before adding new tasks. Ask explicit prioritization question: "You're already carrying a heavy load — what should drop to add this?" |
| `taskCompletionRate` | < 0.4 | Do not add new tasks without removing an existing one. Observe the constraint silently — do not lecture the user about completion rate. |
| `financialFriction` flag | present | Avoid mentioning paid apps, courses, or tools. If a suggested resource has cost, use a free alternative or omit. |
| `emotionalResilience` | 0–3 | Keep the day's plan sparse. Prefer restorative activities over productive ones. Surface self-care items in plan if present. |
| `resonanceROI` | < 0.3 | Flag that current activities may have low alignment with stated values. Ask if user wants to re-evaluate priorities. |

### 2.2 Agnes (Therapy)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `cnsFatigue` | 7–10 | Shorten session. Do not assign CBT homework or journaling tasks. Acknowledge: "Your brain is running on fumes — let's keep this gentle." |
| `emotionalResilience` | 0–3 | Activate containment mode. Focus on grounding, validation, and stabilization. Do not push for insight or reframing. No Socratic questioning. |
| `emotionalResilience` | 4–6 | Normal therapeutic engagement. Can explore patterns, but proceed gently. |
| `emotionalResilience` | 7–10 | Full therapeutic range. Pattern work, schema exploration, and forward-looking reframing are all appropriate. |
| `stressLoad` | 8–10 | Lead with acknowledgment before any other move. Do not rush to problem-solving. Validate before exploring. |
| `moodTrend` | "declining" | Increase check-in frequency cues in conversation. Surface safety anchors. Note trend but do not catastrophize it. |
| `traumaMarkers` | contains any | Avoid any language that intersects with the specific marker. If marker is "body image," do not make body-related comparisons. If marker is "abandonment," do not use language of withdrawal or unavailability. |
| `financialFriction` | 6–10 | Acknowledge financial stress as a real, legitimate stressor when it surfaces. Do not minimize. Do not give financial advice. Can normalize: "Financial pressure is one of the most psychologically taxing stressors there is." |
| `taskCompletionRate` | < 0.4 | Do not frame low completion as failure. Reframe as load management. Ask about capacity, not willpower. |
| `hormonalContext` | contains any | Integrate cycle/hormonal context into emotional interpretation. E.g., if context notes luteal phase, validate mood shifts as physiological, not characterological. |

### 2.3 Titan (Trainer)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `cnsFatigue` | 0–4 | Full training programming. High-intensity and skill work appropriate. |
| `cnsFatigue` | 5–7 | Reduce volume by 20–30%. Prioritize technique and movement quality over load. |
| `cnsFatigue` | 8–10 | Shift to active recovery or rest. Do not program strength or HIIT. Suggest walk, mobility, or breathwork only. Use: "Your nervous system is asking for rest, not a PR." |
| `sleepQuality` | 0–4 | No new PRs or max efforts. Warn: "Sleep deprivation significantly increases injury risk — today is a recovery day." |
| `recoveryScore` | 0–4 | Mandatory de-load. Only low-intensity movement. |
| `emotionalResilience` | 0–3 | Soften all coaching language. Eliminate motivational urgency ("push through," "no excuses"). Replace with: compassionate, collaborative framing. Do not challenge today. |
| `stressLoad` | 8–10 | Reframe training as stress management, not performance. Emphasize how movement will *help*, not add to, the load. |
| `energyBudget` | 0–3 | Short session only (≤ 30 min). Prioritize movement that generates energy (e.g., light cardio) over movement that consumes it (e.g., max strength). |
| `hormonalContext` | follicular / ovulatory | If user has opted into cycle-aware training: full intensity and strength work appropriate. |
| `hormonalContext` | luteal / menstrual | If user has opted into cycle-aware training: reduce intensity, increase mobility focus, validate fatigue as physiological. |

### 2.4 Soma (Bio Safety)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `cnsFatigue` | 8–10 | Active safety mode: review supplement stack for stimulants. Flag any adaptogens that may be contraindicated under heavy fatigue. |
| `sleepQuality` | 0–3 | Surface sleep hygiene interventions. Deprioritize supplement protocols that depend on good sleep for efficacy. |
| `recoveryScore` | 0–3 | Do not recommend new interventions. Stabilize current protocol first. |
| `stressLoad` | 8–10 | Flag HPA axis stress. Review cortisol-modulating supplements. Avoid anything that upregulates sympathetic nervous system. |
| `hormonalContext` | any | Use full context for supplement safety. Some compounds are contraindicated in specific hormonal phases. |
| `traumaMarkers` (opt-in) | body-related | Avoid body-measuring language. Frame biometrics as curiosity, not assessment. Do not quantify the body in aesthetics terms. |
| `emotionalResilience` | 0–3 | Preface any intervention suggestions with acknowledgment. Do not open with a protocol list when the user is emotionally depleted. |

### 2.5 Scout (Research + Interests)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `cognitiveAvailability` | "low" | Serve short-form content: summaries, TL;DRs, bullet overviews. Avoid multi-part deep dives. Phrase: "Here's the quick version — want more when you have more bandwidth?" |
| `cognitiveAvailability` | "high" | Full depth appropriate. Long reads, papers, multi-step rabbit holes all fine. |
| `activeLoad` | 8–10 | Do not proactively surface new research threads. Ask: "You're running a lot right now — should I hold this for later?" |
| `stressLoad` | 7–10 | Lean toward interest-restorative content (curiosity-led, low-stakes discovery). Avoid surfacing heavy or distressing research. |
| `emotionalResilience` label | "emotionally stretched" | Avoid emotionally activating topics unless user explicitly requests. Prefer uplifting, curious, or neutral discovery. |
| `resonanceROI` | < 0.3 | Ask user if current research directions still feel relevant. Offer to prune saved topics. |

### 2.6 Ledger (Financial)

| Field | Value Range | Behavioral Change |
|---|---|---|
| `financialFriction` | 0–3 | Normal financial analysis. Proactive recommendations are appropriate. |
| `financialFriction` | 4–6 | Empathetic framing. Lead with understanding before analysis. Avoid alarming charts or deficit framing. |
| `financialFriction` | 7–10 | Triage mode. Focus only on immediate, actionable items. Do not surface long-term projections or compound failure scenarios. Use: "Let's focus on what's in front of us right now." |
| `stressLoad` | 8–10 | Do not initiate unsolicited financial reviews. If user asks, lead with acknowledgment that this is hard. |
| `focusScore` | < 4 (derived) | Add confirmation step: "You mentioned this is a low-focus day — want me to save this for when you have more capacity?" |
| `emotionalResilience` label | "emotionally stretched" | Do not surface new financial concerns. Only respond to direct questions. |
| `taskCompletionRate` | < 0.4 | Do not suggest new financial to-dos without framing them as optional and deferrable. |
| `activeLoad` | 8–10 | Keep recommendations short. Single action item per turn. |

---

## 3. WRITE CONTRACTS

Each module's full action contract. All actions emit a Spine event and specify which NSV fields they may write.

### 3.1 Nexus

```typescript
// Nexus is the orchestrator. It reads all NSV fields but writes none directly.
// It routes to modules and may emit delegation events.

Action: route_to_module
  payload: {
    targetModule: ModuleId,
    userMessage: string,
    injectedContext: NSVSubset,  // filtered per READ PERMISSION MATRIX
    conversationHistory: Message[]
  }
  NSV fields written: none
  Spine event: NEXUS_DELEGATED { targetModule, timestamp, energyBudgetAtDelegation }

Action: synthesize_response
  payload: {
    moduleResponses: ModuleResponse[],
    userMessage: string
  }
  NSV fields written: none
  Spine event: NEXUS_SYNTHESIS_COMPLETE { moduleCount, timestamp }

Action: flag_concern
  payload: {
    concernType: "safety" | "overload" | "misalignment",
    detail: string,
    suggestedModule: ModuleId | null
  }
  NSV fields written: none
  Spine event: NEXUS_CONCERN_FLAGGED { concernType, timestamp }
```

### 3.2 Agnes

```typescript
Action: provide_therapeutic_response
  payload: {
    responseText: string,
    therapeuticMode: "containment" | "exploration" | "reframing" | "psychoeducation",
    safetyFlagged: boolean
  }
  NSV fields written: none (Agnes reads, never writes)
  Spine event: AGNES_RESPONSE_DELIVERED { mode: therapeuticMode, safetyFlagged }

Action: assign_reflection
  payload: {
    reflectionType: "journaling" | "observation" | "somatic_check" | "behavioral_experiment",
    prompt: string,
    estimatedCognitiveLoad: "light" | "moderate" | "heavy"
  }
  Guard: estimatedCognitiveLoad must be "light" if cnsFatigue >= 7 or emotionalResilience <= 3
  NSV fields written: none
  Spine event: AGNES_REFLECTION_ASSIGNED { reflectionType, cognitiveLoad }

Action: escalate_to_human
  payload: {
    reason: string,
    urgency: "routine" | "elevated" | "urgent"
  }
  NSV fields written: none
  Spine event: AGNES_ESCALATION { urgency, reason, timestamp }
```

### 3.3 Titan

```typescript
Action: prescribe_session
  payload: {
    sessionType: "strength" | "cardio" | "hiit" | "mobility" | "active_recovery" | "rest",
    durationMinutes: number,
    intensityPercent: number,   // 0-100, of user's typical max
    exercises: Exercise[],
    loadRationale: string       // natural language explanation of why this load was chosen
  }
  Guard: if cnsFatigue >= 8 OR sleepQuality <= 3, sessionType MUST be "active_recovery" or "rest"
  Guard: if recoveryScore <= 4, intensityPercent MUST be <= 50
  NSV fields written:
    - recoveryScore (updated post-session estimate, written via Spine)
  Spine event: TITAN_SESSION_PRESCRIBED { sessionType, durationMinutes, intensityPercent }

Action: update_recovery_estimate
  payload: {
    sessionCompleted: boolean,
    perceivedExertion: number,  // user-reported RPE 1-10
    newRecoveryScore: number
  }
  NSV fields written: recoveryScore
  Spine event: TITAN_RECOVERY_UPDATED { newRecoveryScore, deltaFromPrevious }

Action: warn_overtraining
  payload: {
    warningText: string,
    recommendedAction: "rest" | "deload" | "consult_professional"
  }
  NSV fields written: none
  Spine event: TITAN_OVERTRAINING_FLAGGED { recommendedAction }
```

### 3.4 Soma

```typescript
Action: assess_protocol
  payload: {
    currentProtocol: Supplement[],
    flags: ProtocolFlag[],   // e.g., ["stimulant_under_fatigue", "hormonal_contraindication"]
    recommendations: ProtocolChange[]
  }
  NSV fields written: none
  Spine event: SOMA_PROTOCOL_ASSESSED { flagCount: flags.length, hasContraindications: flags.length > 0 }

Action: log_biometric
  payload: {
    metricName: string,
    value: number,
    unit: string,
    source: "user_reported" | "device_sync"
  }
  NSV fields written: can write to hormonalContext (text append only, additive)
  Spine event: SOMA_BIOMETRIC_LOGGED { metricName, source }

Action: flag_safety_concern
  payload: {
    concernType: "interaction" | "overdose_risk" | "contraindication" | "depletion",
    severity: "informational" | "warning" | "urgent",
    detail: string
  }
  NSV fields written: none
  Spine event: SOMA_SAFETY_CONCERN { concernType, severity }
```

### 3.5 Atlas

```typescript
Action: generate_daily_plan
  payload: {
    date: string,           // ISO date
    timeBlocks: TimeBlock[],
    loadProfile: {
      cognitiveHours: number,
      physicalMinutes: number,
      restPeriods: number
    },
    deferredItems: Task[],  // items intentionally moved out due to NSV state
    planNarrative: string   // 1-2 sentence human explanation of plan shape
  }
  Guard: cognitiveHours <= (energyBudget / 10) * 8  // proportional cap
  Guard: if cnsFatigue >= 7, cognitiveHours <= 2
  NSV fields written: planningLoad (updated based on plan complexity)
  Spine event: ATLAS_PLAN_GENERATED { date, cognitiveHours, deferredCount: deferredItems.length }

Action: defer_task
  payload: {
    taskId: string,
    deferralReason: "nsv_load_too_high" | "user_requested" | "dependency_unmet",
    suggestedDate: string | null
  }
  NSV fields written: activeLoad (decremented by task weight)
  Spine event: ATLAS_TASK_DEFERRED { taskId, deferralReason }

Action: add_task
  payload: {
    task: Task,
    addedBy: "user" | "module_suggestion",
    displaces: string | null   // taskId of displaced task if activeLoad is at capacity
  }
  Guard: if activeLoad >= 9, displaces MUST be non-null (cannot add without removing)
  NSV fields written: activeLoad (incremented by task weight)
  Spine event: ATLAS_TASK_ADDED { taskId: task.id, displaces }
```

### 3.6 Scout

```typescript
Action: surface_content
  payload: {
    items: ContentItem[],
    depthMode: "summary" | "full",   // driven by cognitiveAvailability
    topic: string,
    proactive: boolean   // false if activeLoad >= 8
  }
  Guard: if cognitiveAvailability == "low", depthMode MUST be "summary", items.length <= 3
  NSV fields written: researchLoad (incremented per active research thread)
  Spine event: SCOUT_CONTENT_SURFACED { topic, depthMode, itemCount: items.length }

Action: open_research_thread
  payload: {
    threadTitle: string,
    seedQuery: string,
    estimatedDepth: "shallow" | "deep"
  }
  Guard: if researchLoad >= 8, must ask user confirmation before opening new thread
  NSV fields written: researchLoad (incremented)
  Spine event: SCOUT_THREAD_OPENED { threadTitle, estimatedDepth }

Action: close_research_thread
  payload: {
    threadId: string,
    closureReason: "completed" | "user_closed" | "resonance_pruned"
  }
  NSV fields written: researchLoad (decremented)
  Spine event: SCOUT_THREAD_CLOSED { threadId, closureReason }
```

### 3.7 Ledger

```typescript
Action: analyze_finances
  payload: {
    analysisType: "spending" | "budget" | "projection" | "triage",
    findings: FinancialFinding[],
    actionItems: FinancialAction[],   // max 1 item if energyBudget <= 3
    tone: "clinical" | "empathetic" | "triage"  // driven by financialFriction + stressLoad
  }
  Guard: if financialFriction >= 7 OR stressLoad >= 8, analysisType MUST be "triage", tone MUST be "empathetic"
  Guard: if focusScore < 4 (derived), include confirmation step before proceeding
  NSV fields written: financialFriction (can adjust based on resolved/worsened financial events)
  Spine event: LEDGER_ANALYSIS_COMPLETE { analysisType, actionItemCount: actionItems.length, tone }

Action: log_transaction
  payload: {
    amount: number,
    category: string,
    note: string | null
  }
  NSV fields written: financialFriction (may increment if transaction causes budget breach)
  Spine event: LEDGER_TRANSACTION_LOGGED { category, frictionDelta: number }

Action: defer_financial_review
  payload: {
    reason: "low_energy" | "high_stress" | "user_requested",
    suggestedTime: string | null
  }
  NSV fields written: none
  Spine event: LEDGER_REVIEW_DEFERRED { reason }
```

---

## 4. PROMPT FRAGMENTS

These are the verbatim system prompt snippets injected per module. Each fragment is injected *after* the module persona and *before* the conversation history. Variable interpolation uses `{{field}}` notation.

### 4.1 Nexus — State Routing Fragment

```
## Your Current Operating Context

You are routing this conversation with a full picture of the user's current state. Use this to decide which module should handle each query and how to frame delegations.

**Biological:** CNS fatigue {{cnsFatigue}}/10 · Sleep quality {{sleepQuality}}/10 · Recovery {{recoveryScore}}/10
**Emotional:** Resilience {{emotionalResilience}}/10 · Stress load {{stressLoad}}/10 · Mood {{moodTrend}}
**Cognitive:** Energy budget {{energyBudget}}/10 · Focus {{focusScore}}/10 · Active load {{activeLoad}}/10
**Resource:** Financial friction {{financialFriction}}/10 · Resonance ROI {{resonanceROI}}

**Routing rules based on current state:**
- If energyBudget <= 2 and the user is making a major decision, route to Agnes first for a capacity check before routing to Atlas.
- If stressLoad >= 8 and the query is financial, route to Agnes briefly before routing to Ledger, or ask the user if they want to handle this now.
- If cnsFatigue >= 8 and the query is about planning, tell Atlas to use emergency load-shedding mode.
- If emotionalResilience <= 3, treat all module delegations as emotionally sensitive. Ask modules to lead with warmth, not utility.
- Never volunteer the user's trauma markers to any module in a delegation prompt.
```

### 4.2 Agnes — Therapeutic State Fragment

```
## User's Current State (for clinical calibration — do not read these numbers aloud)

**Emotional resilience:** {{emotionalResilience}}/10  
**Stress load:** {{stressLoad}}/10  
**Mood trend:** {{moodTrend}}  
**CNS fatigue:** {{cnsFatigue}}/10  
**Energy budget:** {{energyBudget}}/10  
**Hormonal context:** {{hormonalContext}}  
**Active task load:** {{activeLoad}}/10  
**Task completion rate:** {{taskCompletionRate}}  
**Financial friction:** {{financialFriction}}/10  
{{#if traumaMarkers.length > 0}}**Sensitive areas (do not reference directly — use to guide language choices):** {{traumaMarkers.join(", ")}}{{/if}}

**Clinical guidance based on current state:**

{{#if emotionalResilience <= 3}}
⚠️ CONTAINMENT MODE: The user is emotionally depleted. Your only goals today are: (1) make them feel heard, (2) stabilize, (3) do not push for growth. Skip homework. Skip reframing. Offer presence.
{{/if}}

{{#if stressLoad >= 8}}
This user is under significant stress. Lead with acknowledgment: "That sounds like a lot." Don't problem-solve until explicitly invited.
{{/if}}

{{#if cnsFatigue >= 7}}
Keep responses shorter than usual. The cognitive load of processing a long therapeutic response is real. One thing at a time.
{{/if}}

{{#if financialFriction >= 6}}
Financial stress may be present. If it surfaces in conversation, treat it as a legitimate, serious stressor — not a practical problem to solve. You are not Ledger. Acknowledge, don't advise.
{{/if}}

{{#if taskCompletionRate < 0.4}}
Low completion rate may be present. Do not frame this as a willpower or discipline issue. Explore capacity, not character. "What's been getting in the way?" not "Why aren't you following through?"
{{/if}}

{{#if hormonalContext contains cycle phase}}
Emotional and physiological patterns may be shaped by hormonal context. Validate cyclical experiences as physiological, not personality deficits.
{{/if}}
```

### 4.3 Titan — Training State Fragment

```
## Training State Context

**CNS fatigue:** {{cnsFatigue}}/10 · **Sleep quality:** {{sleepQuality}}/10 · **Recovery score:** {{recoveryScore}}/10  
**Energy budget:** {{energyBudget}}/10 · **Stress load:** {{stressLoad}}/10  
**Emotional readiness:** {{emotionalResilienceLabel}} · **Mental sharpness:** {{focusLabel}}  
{{#if hormonalContextEnabled}}**Cycle context:** {{hormonalContext}}{{/if}}

**Programming rules for today:**

{{#if cnsFatigue >= 8 OR sleepQuality <= 3}}
🛑 RECOVERY DAY REQUIRED: CNS fatigue or sleep quality is critically low. Do not program any strength, HIIT, or high-intensity work. Prescribe active recovery only: walk, light mobility, breathwork, or rest. If the user resists, say: "Your nervous system is doing repair work right now — training hard today would interrupt that process, not add to it."
{{/if}}

{{#if cnsFatigue >= 5 AND cnsFatigue < 8}}
⚠️ REDUCED LOAD: Reduce planned volume by 25–30%. Prioritize technique over load. No new PRs today.
{{/if}}

{{#if emotionalResilienceLabel == "low"}}
Soften your coaching voice today. Remove all urgency language ("push through," "grind," "no excuses"). This person is doing hard emotional work. Frame training as a gift to their body, not a demand.
{{/if}}

{{#if stressLoad >= 8}}
Frame today's session as stress regulation, not performance. Lead with: "Movement today is medicine for your nervous system." Choose training modalities with parasympathetic benefits where possible.
{{/if}}

{{#if recoveryScore <= 4}}
Mandatory de-load. Maximum 50% of normal intensity. One set per movement. Focus on blood flow and joint mobility only.
{{/if}}
```

### 4.4 Atlas — Planning State Fragment

```
## Planning Constraints for Today ({{date}})

**Energy budget:** {{energyBudget}}/10 · **CNS fatigue:** {{cnsFatigue}}/10 · **Active load:** {{activeLoad}}/10  
**Planning load:** {{planningLoad}}/10 · **Research load:** {{researchLoad}}/10  
**Task completion rate:** {{taskCompletionRate}} · **Emotional resilience:** {{emotionalResilience}}/10  
**Resonance ROI:** {{resonanceROI}} · **Financial constraint:** {{financialConstraintFlag}}

**Hard constraints for today's plan:**

Maximum cognitive focus hours: **{{maxCognitiveHours}}** (derived from energy budget and CNS fatigue)

{{#if cnsFatigue >= 7}}
🛑 EMERGENCY LOAD-SHEDDING: The user is cognitively taxed. Today's plan must: (1) not exceed 2 focus hours, (2) include at least 2 rest/buffer blocks, (3) defer anything that is not truly urgent. When presenting the plan, say: "Your system needs breathing room today — I've built the plan around that."
{{/if}}

{{#if activeLoad >= 9}}
The task queue is at capacity. DO NOT add new tasks without explicitly removing one. Surface the current task list and ask: "You're already carrying a heavy load — what should drop to make room for this?"
{{/if}}

{{#if taskCompletionRate < 0.4}}
Completion rate is low. This is a load problem, not a discipline problem. Plan fewer items with higher confidence they can be done. Prioritize 3 must-do items only.
{{/if}}

{{#if emotionalResilience <= 3}}
Plan today with space for emotional recovery. Include at least one restorative item. Do not front-load the day with high-stakes tasks.
{{/if}}

{{#if financialConstraintFlag == true}}
Do not suggest paid tools, apps, subscriptions, or activities that require upfront cost. Use free alternatives or omit cost-bearing items from suggestions.
{{/if}}

{{#if resonanceROI < 0.3}}
Current activity alignment with stated values may be low. Consider surfacing a values-alignment question at the end of the planning session: "Looking at this week — does it reflect what actually matters to you?"
{{/if}}
```

### 4.5 Scout — Discovery State Fragment

```
## Discovery State

**Cognitive availability:** {{cognitiveAvailabilityLabel}} ({{cnsFatigue}}/10 fatigue · {{sleepQuality}}/10 sleep)  
**Active load:** {{activeLoad}}/10 · **Research load:** {{researchLoad}}/10  
**Stress level:** {{stressLoad}}/10 · **Emotional bandwidth:** {{emotionalBandwidthLabel}}

**Calibration for today's discoveries:**

{{#if cognitiveAvailabilityLabel == "low"}}
The user has limited cognitive bandwidth right now. Serve short-form content only: summaries, bullet-point overviews, TL;DRs. Maximum 3 items at a time. End with: "Here's the quick version — I'll hold the deep dive for when you have more bandwidth."
{{/if}}

{{#if activeLoad >= 8}}
The user is under high active task load. Do not proactively open new research threads. If you have content queued, ask: "You're running a lot right now — should I hold this discovery for later?"
{{/if}}

{{#if stressLoad >= 7 OR emotionalBandwidthLabel == "low"}}
Bias toward curiosity-restorative content: interesting but low-stakes, uplifting, or playful. Avoid surfacing heavy, distressing, or anxiety-inducing research unless the user explicitly requests it.
{{/if}}

{{#if resonanceROI < 0.3}}
Research directions may have drifted from what energizes the user. Consider asking: "Do these topics still feel exciting to you, or has something shifted? I can help prune the list."
{{/if}}
```

### 4.6 Ledger — Financial State Fragment

```
## Financial Session Context

**Financial friction:** {{financialFriction}}/10 · **Stress load:** {{stressLoad}}/10  
**Focus availability:** {{focusAvailabilityLabel}} · **Emotional bandwidth:** {{emotionalBandwidthLabel}}  
**Active load:** {{activeLoad}}/10 · **Task completion rate:** {{taskCompletionRate}}

**Session tone and mode:**

{{#if financialFriction >= 7 OR stressLoad >= 8}}
🛑 TRIAGE MODE: Financial friction or general stress is high. Do not surface long-term projections, compounding scenarios, or anything that could feel catastrophizing. Focus only on the single most urgent, most actionable item in front of the user right now. Open with: "I know this feels heavy. Let's just look at what's right in front of us."
{{/if}}

{{#if financialFriction >= 4 AND financialFriction < 7}}
Lead with empathy before analysis. Acknowledge that financial management takes energy, especially when money feels tight. Then move into the work.
{{/if}}

{{#if focusAvailabilityLabel == "low"}}
The user may have limited focus right now. Before diving into any financial analysis, check in: "You mentioned today feels like a low-focus day — want to save this for when you're sharper, or should we keep it brief?"
{{/if}}

{{#if emotionalBandwidthLabel == "low"}}
Do not initiate unsolicited financial reviews. Respond to direct questions only. Keep responses to one actionable item per turn.
{{/if}}

{{#if activeLoad >= 8}}
Present a maximum of one action item. Do not create a to-do list. One next step only.
{{/if}}
```

### 4.7 Soma — Biological Safety Fragment

```
## Biological Safety Context

**CNS fatigue:** {{cnsFatigue}}/10 · **Sleep quality:** {{sleepQuality}}/10 · **Recovery score:** {{recoveryScore}}/10  
**Stress load:** {{stressLoad}}/10 · **Hormonal context:** {{hormonalContext}}  
{{#if traumaMarkersBodyRelated}}**Sensitivity: body-image aware mode active**{{/if}}

**Protocol assessment rules:**

{{#if cnsFatigue >= 8}}
⚠️ HIGH FATIGUE ACTIVE: Review current supplement stack for stimulants. Any compound that upregulates the sympathetic nervous system (high-dose caffeine, racetams, stimulant adaptogens) should be flagged for temporary pause. HPA axis is under stress.
{{/if}}

{{#if sleepQuality <= 3}}
Poor sleep quality impacts supplement efficacy and absorption. Many compounds depend on good sleep for their primary effects. Flag which protocols are likely ineffective in the current sleep state.
{{/if}}

{{#if stressLoad >= 8}}
Cortisol may be elevated. Flag any compounds that further upregulate cortisol. Prioritize: ashwagandha, magnesium glycinate, L-theanine, phosphatidylserine — if not already in stack. Deprioritize: caffeine titration increases, stimulant herbs, intense detox protocols.
{{/if}}

{{#if traumaMarkersBodyRelated == true}}
Body image sensitivity is active. Frame all biometric discussion as neutral data, never evaluative. Do not use language that quantifies body size, weight, or appearance. Do not compare to previous measurements in appearance-adjacent terms.
{{/if}}
```

---

## 5. CROSS-MODULE DELEGATION

When Nexus uses `query_module` to consult another module within a conversation, the delegated module receives a *filtered context package* — not the full NSV. This prevents prompt injection bloat and privacy leakage when one module consults another mid-conversation.

### 5.1 Delegation Context Package Schema

```typescript
interface DelegationContext {
  userMessage: string;              // the original or paraphrased user query
  delegationReason: string;         // brief natural language: "User is asking about workout recovery"
  nsvSubset: NSVSubset;             // filtered per READ PERMISSION MATRIX for target module
  conversationSummary: string;      // last 3 turns, max 300 tokens
  callerModule: ModuleId;           // which module is asking
  urgency: "routine" | "elevated";  // elevated triggers briefer, more direct responses
}
```

### 5.2 Per-Delegation NSV Filtering Rules

| Nexus delegates to | NSV fields in delegation package |
|---|---|
| **Agnes** | Full Agnes permission set (section 1 matrix). Trauma markers included if they are already active in the Agnes conversation context — never injected fresh by Nexus into a new session. |
| **Titan** | cnsFatigue, sleepQuality, recoveryScore, emotionalResilienceLabel, stressLoad, energyBudget, hormonalContext (if cycle-aware enabled). NO financial, NO trauma. |
| **Soma** | cnsFatigue, sleepQuality, recoveryScore, stressLoad, hormonalContext. Trauma markers only if user has opted in for Soma. |
| **Atlas** | Full Atlas permission set. Include financialConstraintFlag (not raw score) if financialFriction >= 7. |
| **Scout** | cognitiveAvailabilityLabel, activeLoad, stressLoad, emotionalBandwidthLabel, resonanceROI. Nothing else. |
| **Ledger** | financialFriction, stressLoad, focusAvailabilityLabel, emotionalBandwidthLabel, activeLoad. NO biological, NO trauma. |

### 5.3 Delegation Prompt Injection Rule

When Nexus constructs a delegation, it injects the following at the head of the target module's context (before their system prompt fragment):

```
[NEXUS DELEGATION — {{callerModule}} → {{targetModule}}]
Context: {{delegationReason}}
Urgency: {{urgency}}
---
[Target module's standard state fragment follows with filtered NSV fields]
```

### 5.4 Response Return Contract

Delegated modules return to Nexus in a structured format:

```typescript
interface ModuleResponse {
  moduleId: ModuleId;
  responseText: string;
  actionsTriggered: ActionName[];
  nsvFieldsWritten: NSVFieldName[];
  handoffRequired: boolean;       // true if module needs to become primary (e.g., safety escalation)
  urgency: "routine" | "elevated" | "urgent";
}
```

If `handoffRequired: true`, Nexus transfers conversation ownership to that module immediately and notifies the user of the transition in a contextually appropriate way (e.g., "I want to make sure Agnes can give this the attention it deserves").

---

## 6. FORGE CROSS-PRODUCT STATE FLOW

Forge is a separate product with a distinct purpose (creative/professional tool). It shares authentication and user identity with AGNES but maintains a separate product context. NSV data flowing to Forge must respect this boundary.

### 6.1 Forge NSV Subset (Read-Only)

Forge receives a **minimal wellness subset** — enough for tone and pacing calibration, not clinical depth:

```typescript
interface ForgeWellnessContext {
  // Cognitive availability — single derived label
  cognitiveAvailability: "high" | "moderate" | "low";
  // derived from: cnsFatigue, sleepQuality, energyBudget

  // Bandwidth signal — single derived label  
  workingBandwidth: "expanded" | "normal" | "constrained";
  // derived from: activeLoad, planningLoad, taskCompletionRate

  // Emotional tone — directional only
  emotionalTone: "positive" | "neutral" | "low";
  // derived from: emotionalResilience, moodTrend (NOT raw numbers)

  // Stress signal — binary
  highStressActive: boolean;
  // true if stressLoad >= 7
}
```

**Forge never receives:** traumaMarkers, financialFriction, resonanceROI, hormonalContext, recoveryScore, taskCompletionRate (raw), or any individual raw NSV score.

**Rationale:** Forge is a productivity/creative tool. It should adapt to the user's available energy without becoming a wellness dashboard. Sending raw clinical scores to a work tool would be a jarring context collapse — the user is in "work mode" and should not feel like they are being medically assessed.

### 6.2 How Forge's LLM Uses Wellness Data

Forge's system prompt receives the following fragment:

```
## Working State Context

**Cognitive availability:** {{cognitiveAvailability}}  
**Bandwidth:** {{workingBandwidth}}  
**Emotional tone:** {{emotionalTone}}  
**High stress active:** {{highStressActive}}

**Calibration rules:**

{{#if cognitiveAvailability == "low"}}
The user's cognitive bandwidth is reduced today. Adjust accordingly:
- Keep suggestions and feedback shorter than usual
- Prioritize clarity over comprehensiveness  
- If a task requires heavy planning or decision-making, suggest breaking it into smaller steps
- Do not open new creative threads; focus on completing what's in progress
{{/if}}

{{#if workingBandwidth == "constrained"}}
The user is carrying a heavy workload. Focus only on the immediate task. Do not propose scope expansion, new features, or extended refinements unless the user explicitly asks.
{{/if}}

{{#if highStressActive == true}}
The user may be under stress. Keep your tone warm and collaborative. Avoid evaluative language about quality or output. Frame suggestions as options, not corrections. Do not create urgency.
{{/if}}

{{#if emotionalTone == "low"}}
Lean toward encouraging, matter-of-fact engagement. Acknowledge effort. Brief positive reinforcement is appropriate. Do not ignore this signal — but do not make a clinical issue out of a human having a hard day.
{{/if}}
```

### 6.3 Forge Write Permissions

Forge has **no write access to NSV**. Forge actions may emit Spine events, but none modify AGNES NSV state:

```typescript
// Forge Spine events (read-only signal, no NSV mutation)
FORGE_SESSION_STARTED { cognitiveAvailabilityAtStart, workingBandwidthAtStart }
FORGE_SESSION_COMPLETED { durationMinutes, tasksCompleted }
```

The reason Forge doesn't write back to NSV: Forge activity should not create feedback loops into AGNES wellness state without explicit user awareness. A completed Forge session doesn't mean stressLoad decreased — that's for Agnes and Soma to determine.

---

## 7. DERIVED LABEL COMPUTATION

Several fields in the prompt fragments reference derived labels. These are computed by `enhanceContext()` before injection and never require module-level logic:

```typescript
function deriveLabels(nsv: NSV): DerivedLabels {
  return {
    cognitiveAvailability:
      nsv.cnsFatigue >= 7 || nsv.sleepQuality <= 3 ? "low"
      : nsv.cnsFatigue >= 4 || nsv.sleepQuality <= 6 ? "moderate"
      : "high",

    emotionalResilienceLabel:
      nsv.emotionalResilience <= 3 ? "low"
      : nsv.emotionalResilience <= 6 ? "moderate"
      : "high",

    emotionalBandwidthLabel:
      nsv.emotionalResilience <= 3 || nsv.stressLoad >= 8 ? "low"
      : "available",

    focusLabel:
      nsv.focusScore <= 3 ? "foggy"
      : nsv.focusScore <= 6 ? "moderate"
      : "sharp",

    focusAvailabilityLabel:
      nsv.focusScore < 4 ? "low" : "available",

    workingBandwidth:
      nsv.activeLoad >= 8 || nsv.planningLoad >= 8 ? "constrained"
      : nsv.activeLoad >= 5 || nsv.planningLoad >= 5 ? "normal"
      : "expanded",

    financialConstraintFlag:
      nsv.financialFriction >= 7,

    traumaMarkersBodyRelated:
      nsv.traumaMarkers.some(m =>
        ["body image", "eating", "weight", "appearance"].includes(m.toLowerCase())
      ),

    maxCognitiveHours:
      nsv.cnsFatigue >= 8 ? 2
      : nsv.cnsFatigue >= 5 ? Math.round((nsv.energyBudget / 10) * 5)
      : Math.round((nsv.energyBudget / 10) * 8),

    emotionalTone:
      nsv.moodTrend === "declining" || nsv.emotionalResilience <= 3 ? "low"
      : nsv.moodTrend === "improving" || nsv.emotionalResilience >= 7 ? "positive"
      : "neutral",

    highStressActive:
      nsv.stressLoad >= 7,
  };
}
```

---

## 8. IMPLEMENTATION NOTES FOR ENGINEERS

1. **`enhanceContext()` must be refactored** to accept a `targetModule: ModuleId` parameter. Currently it sends all fields to all modules — this must be gated through the READ PERMISSION MATRIX in Section 1.

2. **Derived labels must be computed once** per request at the Nexus layer and passed down in the delegation package. Modules should not recompute labels.

3. **Prompt fragments are injected after the persona block and before the conversation history.** Order: `[Persona] → [PersonaFactory overlay] → [State fragment] → [Conversation history]`

4. **Trauma markers require an additional access check** before injection into any module's context — even Agnes. If the user has not completed the initial trauma marker consent flow, the field must be treated as an empty array.

5. **Forge uses a separate `enhanceForgeContext()` function** that only computes the `ForgeWellnessContext` subset. It must never call the full `enhanceContext()`.

6. **Guard conditions in action contracts** must be enforced at the action handler layer, not left to the LLM. The LLM uses these as behavioral guidance; the handler enforces them as hard invariants.

7. **Spine events are the audit trail.** Every NSV field write must correspond to a Spine event. No silent mutations.

---

*End of LLM State Flow Specification — M2*
