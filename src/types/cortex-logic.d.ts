/**
 * TypeScript declarations shim for the cortex-logic KMP JS module.
 * Mirrors the @JsExport surface from cortex-logic/src/jsMain.
 *
 * This file enables IDE type-checking and TS compilation before the KMP build
 * runs. Once `./gradlew :cortex-logic:jsProductionLibraryDistribution` has
 * been run, the generated cortex-logic.d.ts in the build output takes over.
 */
declare module '@cortex-logic' {
  // ─── CancellableTask ─────────────────────────────────────────────────────

  /**
   * JS-exportable handle that wraps a Kotlin coroutine Job.
   * Allows TypeScript callers to cancel in-flight KMP operations.
   */
  export class CancellableTask {
    /** Whether the coroutine is still running. */
    readonly isActive: boolean;
    /** Whether the coroutine was cancelled. */
    readonly isCancelled: boolean;
    /** Whether the coroutine has completed (successfully or exceptionally). */
    readonly isCompleted: boolean;
    /** Request cooperative cancellation of the coroutine. Safe to call multiple times. */
    cancel(): void;
  }

  // ─── LlmSanitizer ────────────────────────────────────────────────────────

  export interface SanitizedResult {
    readonly publicText: string;
    readonly internalThoughts: string | null;
    readonly isThinking: boolean;
    readonly isActing: boolean;
    readonly currentActionType: string | null;
  }

  export interface ExtractedMutation {
    readonly vector: string;
    readonly delta: number;
  }

  export class LlmSanitizerJs {
    sanitize(content: string, retainSpacings?: boolean): SanitizedResult;
    parseMutations(content: string): ExtractedMutation[];
    sanitizeJsonPayload(content: string): string;
    stripPartialLeadingTag(text: string): string;
    stripMutationTags(content: string): string;
    stripProviderControlTokens(content: string): string;
    isProviderControlOnly(content: string): boolean;
    stripTechnicalFiller(text: string): string;
  }

  // ─── PersonaFactory ───────────────────────────────────────────────────────

  export class UserIdentityJs {
    constructor(
      name: string,
      pronouns: string,
      bio?: string | null,
      assignedSexAtBirth?: string | null,
      orchestratorAlias?: string,
      agentGender?: string,
      displayNamesJson?: string,
      agentGendersJson?: string
    );
    readonly name: string;
    readonly pronouns: string;
    readonly bio: string | null;
    readonly assignedSexAtBirth: string | null;
    readonly orchestratorAlias: string;
    readonly agentGender: string;
    readonly displayNamesJson: string;
    readonly agentGendersJson: string;
  }

  /**
   * JS-safe wrapper for NeuralStateVector.
   * Accepts the NSV as a JSON string and deserialises it on the Kotlin side,
   * avoiding the need to pass Maps or nested Kotlin types across the JS boundary.
   *
   * Usage:
   *   const nsv = new NeuralStateVectorJs(JSON.stringify(globalProjection.crossFunctionalState))
   */
  export class NeuralStateVectorJs {
    constructor(nsvJson?: string);
  }

   export class PersonaPromptCatalogJs {
    /**
     * Returns the base system prompt for the given module, or null if no
     * persona is registered for that module ID.
     */
    promptFor(moduleId: string): string | null;

    /**
     * Returns the returning-user welcome message for the orchestrator.
     */
    orchestratorWelcome(name: string): string;
  }

  export class PersonaFactoryJs {
    assemble(
      moduleId: string,
      identity: UserIdentityJs,
      nsv: NeuralStateVectorJs | null,
      longTermSummary?: string | null
    ): string;
    assembleWithContext(
      moduleId: string,
      identity: UserIdentityJs,
      nsv: NeuralStateVectorJs | null,
      moduleContextJson: string,
      longTermSummary?: string | null
    ): string;
  }

  // ─── TitanPromptBuilder ─────────────────────────────────────────────────

  export class TitanPromptBuilderJs {
    /**
     * Build the system prompt for Titan's medical diagnosis mode.
     * @param profileJson   Optional JSON-encoded TrainerProfile. Pass null for no-profile fallback.
     * @param contextPolicy `"with-context"` or `"isolated"` (default).
     */
    buildDiagnosisPrompt(profileJson?: string | null, contextPolicy?: string): string;

    /**
     * Build the onboarding system prompt for Titan intake.
     * @param privacyLevel       `"complete"` or `"basic"` / `"standard"`.
     * @param userName           User's preferred name (from Nyx handoff).
     * @param pronouns           User's pronouns.
     * @param occupation         User's occupation.
     * @param typicalSleepHours  Typical sleep hours.
     */
    buildOnboardingPrompt(
      privacyLevel?: string,
      userName?: string | null,
      pronouns?: string | null,
      occupation?: string | null,
      typicalSleepHours?: number | null
    ): string;
  }

  // ─── CognitiveEngine (full JS bridge) ────────────────────────────────────

  export interface StreamChunkJs {
    readonly delta: string;
    readonly isThinking: boolean;
    readonly isActing: boolean;
    readonly currentActionType: string | null;
  }

  export interface FinalResponseJs {
    readonly content: string;
    readonly thoughts: string | null;
    readonly actionsJson: string;
    readonly mutationsJson: string;
  }

  export class CognitiveEngineJs {
    init(
      openrouterKey?: string,
      geminiKey?: string,
      grokKey?: string,
      preferredModel?: string,
      isMockMode?: boolean
    ): void;
    initWithCredentialStore(
      store: CredentialStoreJs,
      preferredModel: string,
      isMockMode: boolean,
      onReady: () => void,
      onError: (err: string) => void
    ): CancellableTask;
    reinitFromCredentialStore(
      preferredModel: string,
      onReady: () => void,
      onError: (err: string) => void
    ): void;
    clearCredentials(): void;
    chat(
      moduleId: string,
      userMessage: string,
      historyJson: string,
      identity: UserIdentityJs,
      /** Optional JSON-encoded NeuralStateVector for richer persona prompts. Pass '{}' or omit for defaults. */
      nsvJson: string,
      /** Optional JSON-encoded GlobalSoul for condensed neural state. Pass '{}' or omit to fall back to NSV. */
      globalSoulJson: string,
      onChunk: (chunk: StreamChunkJs) => void,
      onComplete: (final: FinalResponseJs) => void,
      onError: (error: string) => void
    ): CancellableTask;
    chatWithContext(
      moduleId: string,
      userMessage: string,
      historyJson: string,
      systemPrompt: string,
      memoryContextJson: string,
      longTermSummary: string,
      onChunk: (chunk: StreamChunkJs) => void,
      onComplete: (final: FinalResponseJs) => void,
      onError: (error: string) => void
    ): CancellableTask;
    /**
     * Full-orchestration streaming — KMP runs PersonaFactory (with NSV injection),
     * calls jsRetrieveMemory once to fetch memory context, then streams the response.
     *
     * moduleContextJson may include:
     *   "baseRole"      — module-specific persona string (overrides KMP default)
     *   "timeContext"   — formatted time block for temporal awareness
     *   "progressBlock" — session progress summary (optional)
     */
    chatWithMemory(
      moduleId: string,
      userMessage: string,
      historyJson: string,
      identity: UserIdentityJs,
      nsvJson: string,
      globalSoulJson: string,
      moduleContextJson: string,
      longTermSummary: string,
      jsRetrieveMemory: (
        query: string,
        onComplete: (facts: string[]) => void,
        onError: (err: string) => void,
      ) => void,
      onChunk: (chunk: StreamChunkJs) => void,
      onComplete: (final: FinalResponseJs) => void,
      onError: (error: string) => void,
    ): CancellableTask;
    generateText(
      prompt: string,
      systemPrompt: string | null,
      onComplete: (text: string) => void,
      onError: (error: string) => void
    ): CancellableTask;
    analyzeImage(
      imageDataUrl: string,
      prompt: string,
      systemPrompt: string,
      onComplete: (text: string) => void,
      onError: (error: string) => void
    ): CancellableTask;
  }

  // ─── NexusSynthesisService ────────────────────────────────────────────────

  // ─── CommandIntelligenceService ──────────────────────────────────────────

  export class CommandIntelligenceServiceJs {
    /**
     * Parse a raw user input and return a JSON-serialized ParsedCommandEnvelope.
     * @param rawInput The raw user input text.
     * @param sourceModuleId The originating module (e.g. "agnes").
     * @param nowIso ISO 8601 date string for "now" (e.g. "2024-01-15"). Pass "" for current date.
     * @param timezone IANA timezone string (e.g. "America/New_York"). Pass "" for UTC.
     */
    parse(rawInput: string, sourceModuleId: string, nowIso?: string, timezone?: string): string;
    parseWithLlm(
      rawInput: string,
      sourceModuleId: string,
      nowIso: string,
      timezone: string,
      generateJson: ((prompt: string, systemPrompt: string, onComplete: (text: string) => void, onError: (err: string) => void) => void) | null,
      onComplete: (envelopeJson: string) => void,
      onError: (err: string) => void
    ): CancellableTask;
  }

  export class NexusSynthesisServiceJs {
    constructor(onEvent: (type: string, dataJson: string) => void);
    /**
     * Returns JSON array of conflict result objects:
     * `[{id, title, severity, suggestedResolution, detectedAt, affectedModulesJson}, ...]`
     */
    detectConflicts(nsvJson: string): string;
    /** Whether the given serialized conflict object should be shown to the user. */
    shouldSurface(conflictJson: string): boolean;
    /** Record that the conflict was shown; emits CONFLICT_DETECTED via onEvent. */
    markSurfaced(conflictJson: string): void;
    /** Record the user's resolution; emits CONFLICT_RESOLVED via onEvent. */
    resolveConflict(conflictId: string, resolution: 'proceed' | 'defer' | 'reroute'): void;
  }

  // ─── SpecVectorCalculator ─────────────────────────────────────────────────

  export class SpecVectorSnapshotJs {
    readonly resilience: number | undefined;
    readonly bandwidth: number | undefined;
    readonly vitality: number | undefined;
    readonly output: number | undefined;
    readonly friction: number | undefined;
  }

  export class SpecVectorBreakdownEntryJs {
    readonly key: string;
    readonly value: number;
  }

  export class SpecVectorBreakdownJs {
    /** "resilience" | "bandwidth" | "vitality" | "output" | "friction" */
    readonly vector: string;
    readonly value: number | undefined;
    readonly inputs: SpecVectorBreakdownEntryJs[];
    readonly notes: string[];
  }

  export class SpecVectorCalculatorJs {
    getSnapshot(nsv: NeuralStateVectorJs): SpecVectorSnapshotJs;
    getBreakdown(nsv: NeuralStateVectorJs): SpecVectorBreakdownJs[];
    selectResilience(nsv: NeuralStateVectorJs): number | undefined;
    selectBandwidth(nsv: NeuralStateVectorJs): number | undefined;
    selectVitality(nsv: NeuralStateVectorJs): number | undefined;
    selectOutput(nsv: NeuralStateVectorJs): number | undefined;
    selectFriction(nsv: NeuralStateVectorJs): number | undefined;
  }

  // ─── InteractionGate ─────────────────────────────────────────────────────

  export class InteractionDecisionJs {
    /** "routing" | "planning" | "routine" */
    readonly kind: string;
    /** "visible_proposal" | "silent_execute" | "silent_delegate" | "defer" | "blocked" */
    readonly mode: string;
    /** "manual_level" | "low_confidence" | "explicit_gate" | "high_risk" | "conflict"
     *  "silent_unavailable" | "auto_routing" | "auto_execution" | "ghost_mode" */
    readonly reason: string;
    readonly confidence: number;
    /** "standard" | "silent" */
    readonly historyMode: string;
    readonly shouldPersistDraft: boolean;
    readonly shouldNotifyUser: boolean;
    readonly shouldRenderHudSignal: boolean;
  }

  export class InteractionGateJs {
    /**
     * Evaluate an interaction candidate against the active autopilot level.
     * Pass confidence as -1 to use the kind-specific default.
     */
    evaluate(
      autopilotLevel: number,
      kind: string,
      sourceModuleId: string,
      confidence: number,
      requiresApproval: boolean,
      highRisk: boolean,
      hasConflict: boolean,
      canAutoDispatch: boolean,
    ): InteractionDecisionJs;
  }

  // ─── RuntimeSemanticsBuilder ──────────────────────────────────────────────

  export class RuntimeSemanticsJs {
    readonly autopilotLevel: number;
    /** "manual_lock" | "proposal_first" | "guided_assist" | "conditional_autonomy"
     *  "supervised_autonomy" | "ghost" */
    readonly autonomy: string;
    /** "manual_review" | "proposal_review" | "high_risk_review" | "incident_review"
     *  "analysis_only" | "visible_execution" | "silent_execution" | "ephemeral_preview" */
    readonly disposition: string;
    /** "standard" | "silent_audit" | "none" */
    readonly historyDestination: string;
    readonly willPersistHistory: boolean;
    readonly shouldNotifyUser: boolean;
  }

  export class RuntimeSemanticsBuilderJs {
    /**
     * Build full runtime semantics for a specific action dispatch context.
     * @param historyMode    "standard" | "silent"
     * @param dispatchStatus "approved" | "awaiting_approval" | "analysis_only" | "blocked" | "ephemeral"
     */
    build(
      autopilotLevel: number,
      historyMode: string,
      dispatchStatus: string,
      highRisk: boolean,
    ): RuntimeSemanticsJs;
    /** Returns the autonomy label string for a given autopilot level. */
    deriveAutonomy(autopilotLevel: number): string;
    /** Maps dispatchStatus → executionStatus string. */
    deriveExecutionStatus(dispatchStatus: string): string;
    /** Returns ApprovalRequirement JSON for a given dispatchStatus. */
    defaultApprovalRequirement(dispatchStatus: string): string;
    /** Returns notice prefix for the given runtime disposition, or null. */
    getNoticePrefix(disposition: string): string | null;
  }

  // ─── TitanNsvUpdater ────────────────────────────────────────────────────────

  export class WorkoutNSVPatchJs {
    readonly cnsFatigue: number;
    readonly recoveryScore: number;
    readonly energyBudget: number;
    readonly focusScore: number;
  }

  export class SleepNSVPatchJs {
    readonly sleepQuality: number;
    readonly energyBudget: number;
    readonly focusScore: number;
  }

  export class TitanNsvUpdaterJs {
    computeWorkoutPatch(
      rpe: number,
      totalVolumeKg: number,
      hoursElapsed: number,
      existingCnsFatigue: number,
      existingRecoveryScore: number,
    ): WorkoutNSVPatchJs;
    computeSleepPatch(durationHours: number, qualityRating: number): SleepNSVPatchJs;
  }

  // ─── E1rmService ────────────────────────────────────────────────────────────

  export class E1rmServiceJs {
    calculateE1RM(weight: number, reps: number): number;
    computeSessionPRs(setsJson: string, existingPRsJson: string): string;
    getBestE1RM(recordsJson: string, exerciseId: string): number;
  }

  // ─── AtlasComputeUtils ──────────────────────────────────────────────────────

  export class AtlasComputeUtilsJs {
    parseBoundedScore(value: number | null | undefined, fallback?: number): number;
    sanitizeTitle(raw: string | null | undefined, defaultValue: string, maxLength?: number): string;
    calculateActiveLoad(tasksJson: string): number;
    calculateDeadlinePressure(tasksJson: string, nowMs: number): number;
    deriveNsvTone(
      stressLoad?: number,
      cnsFatigue?: number,
      emotionalResilience?: number,
      moodTrend?: number,
      energyBudget?: number,
      focusScore?: number,
    ): string;
    getJournalPrompt(toneKey: string): string;
    getJournalForward(toneKey: string): string;
  }

  // ─── HabitEnergyMatcher ─────────────────────────────────────────────────────

  export class HabitEnergyMatcherJs {
    matchHabitsToEnergySlots(habitsJson: string, energyWaveJson: string): string;
  }

  // ─── NsvOwnershipService ────────────────────────────────────────────────────

  export class NsvOwnershipServiceJs {
    ownsMetric(moduleId: string, metric: string): boolean;
    getWritableMetrics(moduleId: string): string[];
    getReadableMetrics(moduleId: string): string[];
    getMetricOwner(metric: string): string;
    getMetricOwners(metric: string): string[];
    isExclusiveOwner(moduleId: string, metric: string): boolean;
    filterNsvForModule(nsvJson: string, moduleId: string): string;
    isMetricStale(lastUpdated: string | null | undefined, thresholdDays: number, nowMs: number): boolean;
    getCoOwnedMetricsInPatch(moduleId: string, patchJson: string): string[];
    filterWritePatch(moduleId: string, patchJson: string): string;
    getDerivedMetrics(): string[];
    getCalibrationPrompt(metric: string): string;
    buildCalibrationPrompt(moduleId: string): string;
  }

  // ─── NsvService ─────────────────────────────────────────────────────────────

  export class NsvServiceJs {
    createDefault(): string;
    normalize(nsvJson: string): string;
    merge(baseJson: string, updatesJson: string): string;
    formatForPrompt(nsvJson: string): string;
    formatForModulePrompt(nsvJson: string, allowedPathsJson: string): string;
    formatForAtlasPlanner(nsvJson: string): string;
    mergePatches(baseJson: string, updatesJson: string): string;
  }

  // ─── GlobalProjectionService ─────────────────────────────────────────────────

  export class GlobalProjectionServiceJs {
    computeOverallWellness(nsvJson: string): number;
    buildNSVUpdatePayload(patchJson: string, timestamp: string): string;
  }

  // ─── BeliefGraphService ──────────────────────────────────────────────────────

  /**
   * JS/TS facade for belief-graph domain operations.
   * Wraps BeliefGraphCompactionService (normalize, compact, merge) and
   * BeliefTriggerEvaluator (threshold evaluation, triggering-node lookup).
   * All belief graphs cross the boundary as JSON strings.
   */
  export class BeliefGraphServiceJs {
    /** Normalize a belief graph: clamp intensity, trim labels, default missing fields. */
    normalizeGraph(graphJson: string): string;
    /** Compact a belief graph using exact-label dedup + heuristic semantic merge (synchronous). */
    compactGraph(graphJson: string, maxNodes?: number): string;
    /**
     * Compact with optional LLM-assisted semantic merge (async).
     * @param generateJsonFn TS callback: `(requestJson, onResult, onError) => void`.
     */
    compactGraphWithLlm(
      graphJson: string,
      maxNodes: number,
      generateJsonFn: (requestJson: string, onResult: (json: string) => void, onError: (err: string) => void) => void,
      onComplete: (graphJson: string) => void,
      onError: (err: string) => void,
    ): CancellableTask;
    /** Merge two belief graphs (existing + proposal) with exact-label dedup. Capped to 80 nodes. */
    mergeGraphs(currentGraphJson: string, proposalGraphJson: string): string;
    /**
     * Evaluate whether the belief graph crosses the Agnes session invitation threshold.
     * @param emotionalResilience Resilience score (0–10), or -1 if unknown.
     * @param stressLoad Stress score (0–10), or -1 if unknown.
     * @returns JSON-encoded InvitationDecision.
     */
    evaluateInvitationThreshold(graphJson: string, emotionalResilience?: number, stressLoad?: number): string;
    /**
     * Filter a belief graph to the nodes that triggered the invitation.
     * @param triggeringBeliefsJson JSON array of label strings.
     * @returns JSON array of matching BeliefNode objects.
     */
    getTriggeringNodes(graphJson: string, triggeringBeliefsJson: string): string;
  }

  // ─── AgnesGravityEngine ──────────────────────────────────────────────────────

  export class AgnesGravityEngineJs {
    calculateGravity(text: string, sentimentScore: number): number;
  }

  // ─── DocumentFieldExtractor ──────────────────────────────────────────────────

  export class DocumentFieldExtractorJs {
    extractReceiptFields(text: string): string;
    extractInvoiceFields(text: string): string;
    extractLabReportFields(text: string): string;
    extractGeneralFields(text: string): string;
    buildExtractionPrompt(domain: string, rawText: string, currency?: string | null, locale?: string | null): string;
  }

  // ─── OnboardingValidation ────────────────────────────────────────────────────

  export class OnboardingValidationJs {
    resolvePath(objectJson: string, path: string): string | null;
    isMissingValue(valueJson: string | null | undefined): boolean;
    parseValidationResponse(sanitized: string): string | null;
    createValidationPrompt(moduleId: string, objective: string, requiredFields: string[], payloadJson: string): string;
  }

  // ─── CrossVerificationService ───────────────────────────────────────────────

  export class CrossVerificationServiceJs {
    computeFinancialFriction(profileJson: string): number;
    verifyCoherence(profileJson: string): string;
    computeNsvFinancialPatch(profileJson: string): string;
    /** Returns JSON: { resonanceROI: number, financialFriction: number, frictionTier: string, analysis: string } */
    computeResonanceROI(profileJson: string): string;
    /** Returns TaxCategory: "deductible" | "non-deductible" | "partial" | "unknown" */
    categorizeTax(expenseJson: string): string;
    calculateBehavioralROI(itemJson: string, usageFrequency: number): number;
    estimateUsageFrequency(itemJson: string): number;
    /** Returns JSON array of DebtPayoffPlan objects (snowball strategy). */
    planDebtSnowball(debtsJson: string, extraBudget: number): string;
    /** Returns JSON SavingsProjection with base/optimistic/pessimistic confidence bands. */
    projectSavingsGoal(goalJson: string): string;
    /** Returns JSON: { estimatedLiability: number, nextDeadline: string } */
    estimateQuarterlyTax(monthlyIncome: number, monthlyDeductibles: number): string;
    /** Returns JSON array of { fieldId, current, suggested, reason } optimization hints. */
    suggestTaxOptimizations(expensesJson: string): string;
    /** Returns JSON LedgerAnalysisSummary (orchestrates all of the above). */
    analyzeProfile(profileJson: string, savingsContributionsJson: string): string;
  }

  // ─── AtlasPlanningEngine ────────────────────────────────────────────────────

  export class AtlasPlanningEngineJs {
    /** Returns JSON DependencyGraph (adjacency as plain object, not Map). */
    buildDependencyGraph(tasksJson: string): string;
    /** Returns JSON array of GoalVelocity objects. */
    computeGoalVelocities(goalsJson: string, tasksJson: string, nowIso: string): string;
    /** Returns JSON array of DailyLoadForecast objects. */
    forecastLoad(profileJson: string, nsvJson: string, daysAhead: number, nowIso: string): string;
    /** Returns JSON ConflictReport. */
    detectConflicts(profileJson: string, daysAhead: number, nowIso: string): string;
    /** Returns JSON TaskBreakdownSuggestion. */
    suggestTaskBreakdown(taskJson: string): string;
    /** Returns JSON HistoricalPatterns. */
    computeHistoricalPatterns(profileJson: string, nowIso: string): string;
  }

  // ─── BlueprintEngine ────────────────────────────────────────────────────────

  export class BlueprintEngineJs {
    /** Calculate daily capacity [0.1, 1.0] from a partial NSV JSON. */
    calculateCapacity(nsvJson: string): number;
    /** Returns true if the sum of weights exceeds capacity. */
    isOverloaded(weightsJson: string, capacity: number): boolean;
    /** Returns JSON array of task objects to defer. */
    getTasksToDefer(tasksJson: string, capacity: number): string;
  }

  // ─── AtlasPredictiveEngine ──────────────────────────────────────────────────

  export class AtlasPredictiveEngineJs {
    /** Effective energy budget with biological/emotional/resource modifiers, clamped [0, 10]. */
    computeEffectiveEnergyBudget(nsvJson: string): number;
    /** Safe planning threshold (80% of effective energy budget). */
    getSafePlanningThreshold(nsvJson: string): number;
    /** True if totalEnergyCost exceeds safe planning threshold. */
    isOverloaded(totalEnergyCost: number, nsvJson: string): boolean;
    /** Burnout trajectory score 0–10 from NSV history array (newest first). */
    computeBurnoutTrajectoryScore(nsvHistoryJson: string): number;
    /** Transition risk 0.0–1.0 based on aggregate delta of load metrics. */
    computeTransitionRisk(currentNsvJson: string, previousNsvJson: string): number;
    /** Returns JSON: { nextState, newCleanCount, isBurnout, emitOverload } */
    evaluateNextState(currentState: string, nsvJson: string, consecutiveClearCount: number): string;
    /** Returns JSON FlatteningPlan (day0 −20 %, redistribute to days 1–3). */
    flattenEnergyWave(energyWaveJson: string, reason: string): string;
  }

  // ─── AtlasBlueprintService (Phase C) ──────────────────────────────────────

  export class AtlasBlueprintServiceJs {
    /** Returns "structured" | "unstructured" based on confidence threshold (≥0.7 → structured). */
    inferIngestionMode(confidence: number): string;
    /** Returns JSON CapacityProjection: { capacity, headroom, overflowTasks, summary }. */
    projectCapacityBlueprint(blueprintJson: string, capacityPct: number): string;
    /** Returns JSON AtlasReviewBlueprint. profile and soul may be serialised null. */
    computeReviewBlueprint(profileJson: string, soulJson: string, nowIso: string): string;
    /** Returns JSON AtlasCapacityBlueprint, or the string "null" when profile is null. */
    computeQuickSnapshot(profileJson: string, soulJson: string): string;
    /** Returns JSON DailyCapacityEstimate: { totalCapacity, committedEnergy, availableEnergy, dayOfWeek }. */
    computeDailyCapacity(profileJson: string, soulJson: string, targetDate: string): string;
    /** Weighted deadline pressure score 0–10 from tasks and goals arrays. */
    computeDeadlinePressureScore(tasksJson: string, goalsJson: string, taskCompletionRate: number): number;
  }

  // ─── TitanClearanceEngine (Phase A) ──────────────────────────────────────

  export class TitanClearanceEngineJs {
    /** Returns JSON ClearanceReport: { score, cleared, vetoReason?, consequence?, warnings[] }. */
    evaluate(nsvJson: string): string;
  }

  // ─── MedicalClearanceEvaluator ───────────────────────────────────────────

  export class MedicalClearanceEvaluatorJs {
    /** Returns JSON ClearanceRecord: { id, activity, status, reason, issuedAt }. */
    evaluate(profileJson: string, activity: string): string;
    isActivitySafe(profileJson: string, activity: string): boolean;
    /** Returns JSON ClearanceRecord or "null" if the profile has no clearances. */
    getLatestClearance(profileJson: string): string;
  }

  // ─── EmbeddingUtils ──────────────────────────────────────────────────────

  export class EmbeddingUtilsJs {
    /** Cosine similarity between two embedding vectors supplied as JSON arrays. */
    cosineSimilarity(aJson: string, bJson: string): number;
    /** BM25-inspired keyword score: fraction of query tokens (len > 2) found in claim. */
    computeKeywordScore(claim: string, query: string): number;
    /** Removes near-duplicate results sharing > overlapThreshold word overlap (input sorted by score desc). */
    deduplicateTextResults(resultsJson: string, overlapThreshold: number): string;
    /** True when inferred value meaningfully differs from stored (null stored → always true). */
    evaluateDiscrepancy(inferredJson: string, storedJson: string): boolean;
    /** Returns JSON-serialised value at dot-notation path, or "null" when any segment is missing. */
    resolveFieldPath(objJson: string, path: string): string;
  }

  // ─── AliveEntityUtils ────────────────────────────────────────────────────

  export class AliveEntityUtilsJs {
    /** Normalises an AliveEntitySeed: trim label, lowercase/dedup/sort tags, default timestamps. */
    normalize(entityJson: string): string;
    /** De-duplicates by id (provenance priority wins), sorts by updatedAt desc. */
    dedupeAndSort(entitiesJson: string): string;
    /** Filters by optional module list, groups into byModule buckets, collects tags. */
    buildRuntimeContext(entitiesJson: string, moduleFilterJson: string, limitPerModule: number): string;
  }

  // ─── RetirementCalculator ───────────────────────────────────────────────────

  export class RetirementCalculatorJs {
    project(planJson: string, currentYear: number): string;
    requiredMonthlyContribution(planJson: string): number;
  }

  // ─── NotificationContentResolver ──────────────────────────────────────────

  /**
   * Single source of truth for mapping Spine event types + payload data to
   * user-facing notification content (title & body).
   */
  export class NotificationContentResolverJs {
    /**
     * Resolve notification content for a Spine event.
     *
     * @param eventType The Spine event type (e.g. `"BURNOUT_WARNING"`).
     * @param dataJson  JSON-encoded data map.
     * @returns JSON string `{"title":"...","body":"..."}`, or `null` if the event
     *          type is not a user-facing notification type.
     */
    resolve(eventType: string, dataJson: string): string | null;
  }

  // ─── PrecedenceResolver ─────────────────────────────────────────────────────

  export class PrecedenceResolverJs {
    evaluate(source: string, mutationVectorsJson: string, currentlyRequiresApproval: boolean): boolean;
    clear(): void;
  }

  // ─── ProgressiveOverloadEngine ──────────────────────────────────────────────

  export class VolumeLandmarksJs {
    readonly mev: number;
    readonly mav: number;
    readonly mrv: number;
  }

  export class AcwrResultJs {
    readonly acuteLoad: number;
    readonly chronicLoad: number;
    readonly ratio: number;
    readonly riskZone: string;
  }

  export class ProgressionRecommendationJs {
    readonly tier: string;
    readonly reason: string;
    readonly suggestedWeight: number | undefined;
    readonly suggestedReps: number | undefined;
    readonly weightIncrement: number;
    readonly currentE1rm: number | undefined;
  }

  export class ProgressiveOverloadEngineJs {
    epley(weight: number, reps: number): number;
    brzycki(weight: number, reps: number): number;
    landmarksFor(muscleGroup: string): VolumeLandmarksJs;
    getAllLandmarks(): string;
    computeAcwr(sessionLoadsJson: string): AcwrResultJs;
    recommend(
      avgRpe: number,
      e1rmTrendJson: string,
      completedSets: number,
      targetSets: number,
      currentWeight: number,
      currentReps: number,
      acwr?: number,
      unit?: string,
    ): ProgressionRecommendationJs;
  }

  // ─── Orchestration Intelligence (v1.5.1) ─────────────────────────────────

  export class OrchestrationContractsJs {
    isAutopilotLevel(level: unknown): boolean;
    isPrimaryAgentId(id: string): boolean;
    getAgentPrecedenceRank(agentId: string): number;
    compareAgentPrecedence(a: string, b: string): number;
    compareMasterThreadTurns(a: string, b: string): number;
    compareMasterThreadMessages(a: string, b: string): number;
    toSpecPriority(source: string): number;
    normalizeSpecSource(source: string): string;
    adaptSpineEventToSpec(eventJson: string, optionsJson?: string): string;
    serializeSpecSpineEvent(specJson: string): string;
    getPrimaryAgentPrecedence(): string[];
    getMasterThreadAuthorPrecedence(): string[];
  }

  export class AutopilotActionPolicyServiceJs {
    isAllowed(actionType: string, autopilotLevel: number): boolean;
    getThreshold(actionType: string): number | null;
  }

  export class OrchestrationOperatingModeServiceJs {
    derive(
      autopilotLevel: number,
      historyMode: string,
      autonomy: string | null,
      isGuest: boolean,
      awaitingApprovalCount: number,
      failedCount: number,
      escalatedCount: number,
    ): string;
  }

  export class OrchestrationPolicyServiceJs {
    sortProposals(proposalsJson: string): string;
    resolveWinningProposal(proposalsJson: string): string;
    getExecutionPolicy(...args: unknown[]): string;
  }

  export class SoulAuthorityServiceJs {
    canWrite(moduleId: string, metric: string): boolean;
    getAuthoritativeModule(metric: string): string;
    auditPatch(moduleId: string, patchJson: string): string;
  }

  export class ContextBudgeterJs {
    truncateText(text: string, maxChars: number): string;
    composeBoundedContext(
      title: string,
      identityLinesJson: string,
      nsvBlock: string | null,
      insightLinesJson: string | null,
      extensionBlock: string | null,
      maxChars: number,
      minNsvChars: number,
    ): string;
  }

  export class OrchestrationPerformanceServiceJs {
    recordCacheHit(domain: string): void;
    recordCacheMiss(domain: string): void;
    recordComputation(domain: string, durationMs: number): void;
    getMetrics(domain: string): string;
    getAllMetrics(): string;
    reset(): void;
  }

  export class OrchestrationRolloutServiceJs {
    recordParsedCommand(requiresClarification: boolean): void;
    recordRoutingDecision(reason: string): void;
    recordPlanningAttempt(built: boolean): void;
    recordRuntimeSummary(runtimeSummaryJson: string): void;
    getSnapshot(): string;
  }

  export class OrchestrationExecutionUtilsJs {
    classifyFailureCode(errorMessage: string): string;
    nextFailureStatus(currentStatus: string, retryCount: number): string;
    getRetryBackoffMs(retryCount: number): number;
  }

  export class OrchestrationHistoryUtilsJs {
    generateAutonomyExplanation(metadataJson: string): string;
    shouldRouteToSilentHistory(historyMode: string, executionStatus: string, historyDestination: string): boolean;
    getAssistantMessageChannel(historyMode: string, executionStatus: string, historyDestination: string): string;
    buildSilentHistoryEntry(moduleId: string, metadataJson: string, suppressedMessagesJson: string): string;
  }

  export class OrchestrationPersistenceUtilsJs {
    getProposalCollectionPath(userId: string): string;
    getProposalsCollectionPath(userId: string): string;
    getExecutionCollectionPath(userId: string): string;
    getExecutionsCollectionPath(userId: string): string;
    getExecutionFailureCollectionPath(userId: string): string;
    getThreadCollectionPath(userId: string): string;
    getRuntimeCollectionPath(userId: string): string;
    toFirestoreSafeJson(json: string): string;
    sanitizeRuntimeSummary(summaryJson: string): string;
    toProposalRecord(moduleIdOrProposalJson: string, metadataJsonOrNowMs: string | number, storedAt?: string): string;
    toExecutionRecord(moduleIdOrExecutionJson: string, metadataJsonOrNowMs: string | number, storedAt?: string): string;
  }

  export class OrchestrationCommandCenterServiceJs {
    buildSnapshot(actionsJson: string, failuresJson: string, silentHistoryJson: string, queueLimit: number): string;
  }

  export class NexusActionDispatchServiceJs {
    canDispatchDeterministically(moduleId: string, actionType: string): boolean;
    getDeterministicActions(moduleId: string): string[];
  }

  export class NexusRoutingServiceJs {
    classifyIntent(message: string): string;
    classifyIntentFromParsedCommand(parsedCommandJson: string | null | undefined): string;
    classifyIntentWithContext(message: string, parsedCommandJson: string | null | undefined): string;
    buildRouterPrompt(): string;
    parseRoutingResponse(raw: string): string;
    getRoute(moduleId: string): string;
  }

  export class NexusActionPlannerServiceJs {
    buildNode(intentJson: string, registryActionType: string | null | undefined, targetModuleId: string, supportingModuleIdsJson: string): string;
    shouldEnrichWithScout(intentType: string, targetModuleId: string, currentSupportingJson: string): boolean;
    isDraftActionType(actionType: string): boolean;
  }

  export class NexusDispatchExecutionServiceJs {
    detectDependencyCycles(dispatchPlanJson: string): string[];
    buildExecutionSummary(packetJson: string, resultsJson: string): string;
    buildRetryPacket(packetJson: string, resultsJson: string): string | null;
    buildExecutionId(planId: string, nodeId: string): string;
    getRetryParentPlanId(packetJson: string): string | null;
    buildExecutionArtifacts(packetJson: string, resultsJson: string, timestamp: string, retryPacketJson: string | null | undefined, retryPrompt: string | null | undefined): string;
  }

  export class OrchestrationActionGateServiceJs {
    inferMutatesState(actionType: string): boolean;
    inferHighRisk(actionType: string): boolean;
    isNsvReadOnlyModule(moduleId: string): boolean;
    isNsvWriteActionType(actionType: string): boolean;
    clampConfidence(value: number): number;
    buildProposalCardStatus(dispatchStatus: string): string;
    buildExecutionStatus(dispatchStatus: string): string;
    sanitizeIdToken(value: string, maxLength: number): string;
    evaluate(inputJson: string, actionLabel: string): string;
  }

  // ─── Agent System (v1.5.1) ───────────────────────────────────────────────

  export class ActionCapabilityResolverJs {
    resolve(actionType: string): string[];
  }

  export class AgentRegistryJs {
    listProviders(): string;
    getProviderByModule(moduleId: string): string;
    registerProvider(providerJson: string): void;
    getCapabilitiesForModule(moduleId: string): string[];
    getProvidersForCapability(capability: string, preferredModuleIdsJson?: string | null): string;
    resolveProvidersForCapabilities(capabilitiesJson: string, preferredModuleIdsJson?: string | null): string;
    resolvePrimaryProvider(capabilitiesJson: string, preferredModuleIdsJson?: string | null): string;
    resolveActionAlias(moduleId: string, actionType: string): string;
  }

  // ─── Spine Flow Contracts (v1.5.1) ───────────────────────────────────────

  export class FlowContractsJs {
    createFlowMeta(source: string, flowId?: string | null): string;
    deriveReadinessLevel(score: number | null): string | null;
    resolveReadinessScore(dataJson?: string | null): string | number | null;
    isCriticalReadiness(dataJson?: string | null): boolean;
    isPhysicalCommitmentMissed(eventJsonOrDomain: string, dataJson?: string | null): boolean;
    isDelegationCompletionSignal(eventJsonOrEventType: string, dataJson?: string | null): boolean;
    parseDelegationTarget(eventJson: string): string | null;
  }

  // ─── Session Arc (v1.5.1) ────────────────────────────────────────────────

  export class SessionArcJs {
    computeSessionProgressJson(
      exchangeCount: number,
      sessionStartedAtMs: number,
      mode: string,
      nowMs?: number,
    ): string;
    buildSessionProgressBlock(progressJson: string, mode: string): string | null;
    getSessionExchangeTarget(mode: string): number;
  }

  // ─── Ledger Aggregation Suite (v1.5.1) ───────────────────────────────────

  export class LedgerAggregationUtilsJs {
    round2(value: number): number;
    epochMsToYearMonth(nowMs: number): string;
    monthsAgo(n: number, nowMs: number): string;
    getMonthBounds(month: string): string;
    filterByPeriod(transactionsJson: string, start: string, end: string): string;
    toYearMonth(isoDate: string): string;
    calculateDailyBurnRate(transactionsJson: string, nowMs: number): number;
    calculateTransactionFriction(amount: number, resonanceScore: number, dailyBurnRate: number): number;
    calculateRunway(liquidity: number, avgDailyBurn: number, confidenceInterval: number): number;
  }

  export class AccountAggregationJs {
    computeAccountSummary(accountsJson: string): string;
    computeNetLiquidAssets(accountsJson: string): number;
    computeTotalBalance(accountsJson: string): number;
    getDefaultAccount(accountsJson: string): string;
    computeTotalDebtFromItems(debtItemsJson: string): number;
  }

  export class NetWorthAggregationJs {
    computeCurrentNetWorth(accountsJson: string, debtItemsJson: string): string;
    computeNetWorthTrend(historyJson: string): string;
    buildNetWorthSnapshot(accountsJson: string, debtItemsJson: string, nowMs: number, note?: string | null): string;
  }

  export class PortfolioAggregationJs {
    computePortfolioSummary(investmentsJson: string): string;
    buildPortfolioSnapshot(investmentsJson: string, nowMs: number, note?: string | null): string;
    getTopHoldings(investmentsJson: string, n: number): string;
    recomputeInvestment(investmentJson: string, nowMs: number): string;
  }

  export class TransactionAggregationJs {
    computeMonthlyTotals(transactionsJson: string, months?: number, nowMs?: number): string;
    computeCategorySpend(transactionsJson: string, periodStart?: string | null, periodEnd?: string | null, nowMs?: number): string;
    getSpendingTrend(transactionsJson: string, nowMs: number): string;
    computeCategoryTrends(transactionsJson: string, topN?: number, nowMs?: number, months?: number): string;
    computeIncomeBreakdown(transactionsJson: string, nowMs: number, periodStart?: string | null, periodEnd?: string | null): string;
    matchCategoryToTransaction(description: string, category: string, categoriesJson: string): string | null;
  }

  export class BudgetAggregationJs {
    computeBudgetActuals(
      transactionsJson: string,
      budgetCategoriesJson: string,
      nowMsOrStart?: number | string | null,
      periodStartOrEnd?: string | null,
      periodEndOrNow?: string | null,
    ): string;
  }

  export class TaxAggregationJs {
    computeTaxBreakdown(profileJson: string, taxYear: number): string;
    buildTaxYearSummary(profileJson: string, taxYear: number, nowMs: number): string;
  }

  export class SubscriptionAggregationJs {
    toMonthlyEquivalent(amount: number, cycle: string): number;
    toAnnualEquivalent(amount: number, cycle: string): number;
    computeSubscriptionSummary(subscriptionsJson: string): string;
    getExpiringTrials(subscriptionsJson: string, nowMs: number, withinDays?: number): string;
    getUpcomingRenewals(subscriptionsJson: string, nowMs: number, withinDays?: number): string;
  }

  export class CreditAggregationJs {
    computeCreditTrend(historyJson: string): string;
    getCreditRating(score: number): string;
    getImprovementTips(score: number, profileJson?: string | null): string;
  }

  export class ForecastAggregationJs {
    computeCashFlowForecast(recurringOrProfileJson: string, startingBalanceOrNowMs: number, horizonOrMonths?: number, nowMs?: number): string;
    summarizeForecastByMonth(forecastJson: string): string;
  }

  export class InsuranceAggregationJs {
    computeInsuranceSummary(policiesJson: string): string;
    getUpcomingRenewals(policiesJson: string, withinDays?: number, nowMs?: number): string;
    detectCoverageGaps(policiesJson: string): string;
  }

  export class CalendarAggregationJs {
    buildCalendarEvents(profileJson: string, yearOrNowMs: number, monthOrDaysAhead?: number, nowMs?: number): string;
  }

  export class DashboardAggregationJs {
    computeDashboardMetrics(transactionsJson: string, totalDebt: number, accountsJson: string, nowMs: number): string;
    computeRunwayProjection(profileJson: string | null, nowMs: number): string;
    computeDebtPayoffSchedule(debtItemsJson: string, strategy: string, extraMonthlyPayment?: number): string;
    evaluateAlerts(
      profileJson: string | null,
      budgetWithActualsJson: string,
      metricsOrIncome: string | number,
      currentMonthExpensesOrNowMs?: number,
      currentMonthNet?: number,
      nowMs?: number,
    ): string;
    computeSavingsProjection(goalJson: string, nowMs: number): string;
  }

  // ─── Titan Data (v1.5.1) ─────────────────────────────────────────────────

  export class ExerciseLibraryJs {
    findExercise(query: string): string | null;
    searchExercises(query: string, limit?: number): string;
  }

  export class RecoveryTemplatesJs {
    getRecoveryTemplate(type: string, bodyRegion?: string | null): string;
    getRecoveryLabel(type: string): string | null;
  }

  export class QuickLogParserJs {
    parseQuickLogInput(input: string): string;
    annotatePRs(entriesJson: string, personalRecordsJson: string | null): string;
    buildHistorySuggestion(recentSessionsJson: string, maxLength?: number): string | null;
  }

  // ─── Soma Field Templates (v1.5.1) ──────────────────────────────────────

  export class SomaFieldTemplatesJs {
    getClinicalRange(fieldId: string): string | null;
    evaluateBiomarkerStatus(fieldId: string, value: number): string;
  }

  // ─── CredentialStore (v1.5.0) ─────────────────────────────────────────────

  /**
   * Secure credential store that resolves API keys through encrypted JS callbacks.
   * Implements ApiKeyProvider internally — keys are fetched from the host's
   * encrypted storage on demand and cached in KMP memory.
   */
  export class CredentialStoreJs {
    constructor(
      jsGetEncrypted: (key: string, onComplete: (value: string | null) => void, onError: (err: string) => void) => void,
      jsSetEncrypted: (key: string, value: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsDeleteKey: (key: string, onComplete: () => void, onError: (err: string) => void) => void,
    );
    storeKey(provider: string, key: string, onComplete: () => void, onError: (err: string) => void): void;
    deleteKey(provider: string, onComplete: () => void, onError: (err: string) => void): void;
    clearCredentials(): void;
    clearAll(onComplete: () => void, onError: (err: string) => void): void;
    hasAnyKey(onComplete: (has: boolean) => void, onError: (err: string) => void): void;
  }

  // ─── GuestQuotaService ──────────────────────────────────────────────────

  /** Pure guest quota computation — Agnes holds state, KMP handles the increment logic. */
  export class GuestQuotaServiceJs {
    constructor();
    /** Returns default quota JSON string (0 turns used). */
    getDefault(): string;
    /** Increments the turn count from currentJson and returns updated quota JSON. */
    computeNext(currentJson: string): string;
    /** Returns true when guest has turns remaining. */
    canProceed(currentJson: string): boolean;
    getMaxTurns(): number;
  }

  // ─── ActionHub (v1.5.0) ──────────────────────────────────────────────────

  /** Available once the KMP build includes ActionHubJs.kt. */
export class ActionHubJs {
    constructor(
      jsGetDocument: (collection: string, id: string, onComplete: (json: string | null) => void, onError: (err: string) => void) => void,
      jsSetDocument: (collection: string, id: string, dataJson: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsUpdateDocument: (collection: string, id: string, updatesJson: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsDeleteDocument: (collection: string, id: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsBatchWrite: (operationsJson: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsUpdateNsv: (patchJson: string, onComplete: () => void, onError: (err: string) => void) => void,
      jsEmitSpineEvent: (eventJson: string) => void,
      jsVaultEncrypt?: ((plaintext: string, keyIgnored: string, onComplete: (envelopeJson: string) => void, onError: (err: string) => void) => void) | null,
      jsVaultDecrypt?: ((envelopeJson: string, keyIgnored: string, onComplete: (plaintext: string) => void, onError: (err: string) => void) => void) | null,
    );
    /**
     * Execute an action. Calls `onComplete(true)` if a handler was found and executed,
     * `onComplete(false)` if no handler is registered (TS side should fall through).
     * Calls `onError(message)` if the handler threw.
     */
    execute(
      moduleId: string,
      actionType: string,
      payloadJson: string,
      userId: string | null,
      onComplete: (handled: boolean) => void,
      onError: (err: string) => void,
    ): CancellableTask;
  }

  // ─── LedgerAutomationEngine ──────────────────────────────────────────────

  /**
   * Unified automation service facade (cortex-logic 2.0.0+).
   * Single entry point for evaluation, CRUD, and observation, backed by
   * an injectable storage adapter.
   *
   * Constructor parameters are six JS callback pairs wrapping async storage:
   *   jsLoadRules / jsSaveRules   — persist List<AutomationRule> as JSON
   *   jsLoadStates / jsSaveStates — persist Map<ruleId, AutomationState> as JSON
   *   jsLoadSchedules / jsSaveSchedules — persist List<ScheduleDefinition>
   *
   * All async methods return a CancellableTask so callers can abort in-flight
   * operations (e.g. on component unmount).
   */
  export class AutomationServiceJs {
    constructor(
      jsLoadRules: (onComplete: (json: string) => void, onError: (msg: string) => void) => void,
      jsSaveRules: (rulesJson: string, onComplete: () => void, onError: (msg: string) => void) => void,
      jsLoadStates: (onComplete: (json: string) => void, onError: (msg: string) => void) => void,
      jsSaveStates: (statesJson: string, onComplete: () => void, onError: (msg: string) => void) => void,
      jsLoadSchedules: (onComplete: (json: string) => void, onError: (msg: string) => void) => void,
      jsSaveSchedules: (schedulesJson: string, onComplete: () => void, onError: (msg: string) => void) => void,
    );
    /** Evaluate all enabled rules against the profile. Persists Suggested states. */
    evaluate(profileJson: string, onComplete: (suggestionsJson: string) => void, onError: (msg: string) => void): CancellableTask;
    /** Parse and apply an LLM action command. Single mutation path for all CRUD. */
    apply(actionId: string, payloadJson: string, onComplete: () => void, onError: (msg: string) => void): CancellableTask;
    /** Subscribe to suggestion updates. Emits on every storage-visible change. */
    observeSuggestions(onNext: (suggestionsJson: string) => void): CancellableTask;
    /** Returns a JSON array of action IDs supported by this service. */
    supportedActionIds(): string;
    /** Start the daily 00:05 evaluation runner. */
    startRunner(getProfileJson: () => string): void;
    /** Stop the runner and deregister the scheduler. */
    stopRunner(): void;
    /** Trigger an immediate evaluation (call on window focus / app resume). */
    poke(): void;
  }

  // ─── RecurringBillEngine ─────────────────────────────────────────────────

  /**
   * Processes recurring bill rules — advancing due dates, auto-posting
   * transactions, and computing upcoming bills. UUIDs for new Transaction
   * objects are generated in jsMain via Web Crypto.
   */
  export class RecurringBillEngineJs {
    /**
     * Advance a YYYY-MM-DD date string by one recurrence period.
     * @param dateStr   YYYY-MM-DD source date.
     * @param frequency One of: daily | weekly | biweekly | monthly | quarterly | yearly.
     * @returns         YYYY-MM-DD result date.
     */
    advanceByFrequency(dateStr: string, frequency: string): string;
    /**
     * Compute the next due date for a rule after a reference date.
     * @param ruleJson JSON RecurringRule.
     * @param fromIso  YYYY-MM-DD reference date (uses today when null).
     * @returns        YYYY-MM-DD string.
     */
    computeNextDueDate(ruleJson: string, fromIso: string | null | undefined): string;
    /**
     * Return all active rules whose nextDueDate is today or in the past.
     * @param rulesJson JSON array of RecurringRule.
     * @param todayIso  YYYY-MM-DD reference date.
     * @returns         JSON array of RecurringRule objects.
     */
    computeDueRules(rulesJson: string, todayIso: string): string;
    /**
     * Return active rules due within the next [days] days (inclusive of today).
     * Result is sorted ascending by due date and includes a dueDateFormatted field.
     * @param rulesJson JSON array of RecurringRule.
     * @param todayIso  YYYY-MM-DD reference date.
     * @param days      Lookahead window in days.
     * @returns         JSON array of RecurringRule objects annotated with dueDateFormatted.
     */
    computeUpcomingBills(rulesJson: string, todayIso: string, days: number): string;
    /**
     * Process all due recurring rules for auto-posting.
     * Rules with autoPost=true are posted; autoPost=false rules are returned as pending.
     * @param rulesJson   JSON array of RecurringRule.
     * @param profileJson JSON LedgerIntakeProfile.
     * @param todayIso    YYYY-MM-DD reference date.
     * @returns           JSON: { updatedProfile, autoPosted: Transaction[], pendingRules: RecurringRule[] }
     */
    postDueTransactions(rulesJson: string, profileJson: string, todayIso: string): string;
    /**
     * Post a single pending rule once (user-confirmed). Advances its nextDueDate.
     * @param ruleJson    JSON RecurringRule.
     * @param profileJson JSON LedgerIntakeProfile.
     * @param todayIso    YYYY-MM-DD reference date.
     * @returns           JSON: { updatedProfile, transaction: Transaction }
     */
    postSingleRule(ruleJson: string, profileJson: string, todayIso: string): string;
    /**
     * Skip the next occurrence of a rule — advances nextDueDate without posting.
     * @param ruleJson    JSON RecurringRule.
     * @param profileJson JSON LedgerIntakeProfile.
     * @returns           JSON string of the updated LedgerIntakeProfile.
     */
    skipNextOccurrence(ruleJson: string, profileJson: string): string;
  }

  // ─── RagChunkingService ───────────────────────────────────────────────────

  export class RagChunkingServiceJs {
    /**
     * Split text into overlapping chunks for RAG ingestion.
     * @param text         Raw document text.
     * @param chunkSize    Target chunk size in characters (default 2000).
     * @param chunkOverlap Overlap between adjacent chunks in characters (default 400).
     * @param minChunkSize Minimum chunk size; shorter fragments are merged (default 200).
     * @returns JSON array: `[{ index: number, text: string, startChar: number, endChar: number }]`
     */
    chunkText(text: string, chunkSize?: number, chunkOverlap?: number, minChunkSize?: number): string;
  }
}
