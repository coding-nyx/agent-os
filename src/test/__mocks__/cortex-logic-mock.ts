/**
 * Test mock for @cortex-logic KMP bridge.
 * Provides lightweight stubs for all 69 @JsExport classes so vitest can
 * load any file that imports from '@cortex-logic' without the full KMP runtime.
 *
 * Method signatures match the real KMP classes. JSON-returning methods emit
 * minimal valid shapes; boolean methods return conservative defaults.
 *
 * Individual tests can still override specific classes via vi.mock().
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const j = JSON.stringify;

function defaultOrchestrationMetadata() {
  return {
    executionMode: 'autonomous' as const,
    historyMode: 'standard' as const,
    mutatesState: false,
    patientScope: 'USER',
    dispatchStatus: 'dispatched',
    approvalRequirement: { required: false, reason: '' },
    runtime: {
      disposition: 'standard',
      noticePrefix: '',
      summary: '',
    },
    proposal: {
      id: 'mock-proposal-id',
      createdAt: new Date().toISOString(),
    },
    proposalCard: { title: '', summary: '' },
    execution: {
      id: 'mock-execution-id',
      source: 'nexus',
      status: 'completed',
      executedAt: new Date().toISOString(),
    },
    activeThreadId: null,
    failure: null,
  };
}

// ─── Orchestration Services ─────────────────────────────────────────────────

export class OrchestrationActionGateServiceJs {
  evaluate(_inputJson: string, _actionType: string) {
    return j({ shouldDispatch: true, metadata: defaultOrchestrationMetadata() });
  }
  isNsvReadOnlyModule(_moduleId: string) { return false; }
  isNsvWriteActionType(_actionType: string) { return false; }
  inferMutatesState(_actionType: string) { return false; }
}

export class OrchestrationPolicyServiceJs {
  sortProposals(proposalsJson: string) { return proposalsJson; }
  resolveWinningProposal(proposalsJson: string) {
    const arr = JSON.parse(proposalsJson);
    return arr.length > 0 ? j(arr[0]) : null;
  }
  getExecutionPolicy(_level: number, _proposalJson: string, _conflict: boolean, _highRisk: boolean) {
    return j({
      requiresApproval: { required: false, reason: '' },
      executionMode: 'autonomous',
      historyMode: 'standard',
      canMutateState: true,
    });
  }
}

export class OrchestrationCommandCenterServiceJs {
  buildSnapshot(_actionsJson: string, _failuresJson: string, _silentJson: string, _limit: number) {
    return j({ totalActions: 0, recentActions: [], recentFailures: [], silentHistory: [] });
  }
}

export class OrchestrationExecutionUtilsJs {
  classifyFailureCode(_serialized: string) { return 'unknown'; }
  nextFailureStatus(_code: string, _retryCount: number) { return 'failed'; }
  getRetryBackoffMs(_retryCount: number) { return 1000; }
  createResumableSnapshot(_type: string, _contextJson: string, _metadataJson: string) { return j({}); }
  recordFailure(_uid: string, _json: string) { return ''; }
  recordMissingHandlerFailure(_uid: string, _json: string) { return ''; }
}

export class OrchestrationHistoryUtilsJs {
  generateAutonomyExplanation(_metadataJson: string) { return ''; }
  shouldRouteToSilentHistory(_executionMode: string, _historyMode: string, _status: string) { return false; }
  getAssistantMessageChannel(_executionMode: string, _historyMode: string, _status: string) { return 'visible'; }
  buildSilentHistoryEntry(_moduleId: string, _metadataJson: string, _suppressedJson: string) { return null; }
}

export class OrchestrationOperatingModeServiceJs {
  derive(_moduleId: string, _autopilotLevel: number, _historyMode: string, _isGuest: boolean) {
    return j({
      automationLabel: 'Manual',
      historyLabel: 'Standard',
      combinedLabel: 'Manual · Standard',
      badge: 'manual',
    });
  }
}

export class OrchestrationPerformanceServiceJs {
  recordCacheHit(_domain: string) {}
  recordCacheMiss(_domain: string) {}
  recordComputation(_domain: string, _durationMs: number) {}
  getMetrics(_domain: string) { return j({ hits: 0, misses: 0, avgMs: 0 }); }
  getAllMetrics() { return j({}); }
}

export class OrchestrationPersistenceUtilsJs {
  toFirestoreSafeJson(valueJson: string) { return valueJson; }
  getProposalCollectionPath(uid: string) { return `users/${uid}/proposals`; }
  getExecutionCollectionPath(uid: string) { return `users/${uid}/executions`; }
  getExecutionFailureCollectionPath(uid: string) { return `users/${uid}/execution_failures`; }
  getThreadCollectionPath(uid: string) { return `users/${uid}/threads`; }
  toProposalRecord(_moduleId: string, _metadataJson: string, _storedAt: string) {
    return j({ moduleId: '', metadata: {}, storedAt: '' });
  }
  toExecutionRecord(_moduleId: string, _metadataJson: string, _storedAt: string) {
    return j({ moduleId: '', metadata: {}, storedAt: '' });
  }
  sanitizeRuntimeSummary(summaryJson: string) { return summaryJson; }
}

export class OrchestrationRolloutServiceJs {
  recordParsedCommand(_requiresClarification: boolean) {}
  recordRoutingDecision(_reason: string) {}
  recordPlanningAttempt(_built: boolean) {}
  recordRuntimeSummary(_summaryJson: string) {}
  getSnapshot() {
    return j({ commands: 0, routingDecisions: 0, planningAttempts: 0, summaries: 0 });
  }
}

export class OrchestrationContractsJs {
  isAutopilotLevel(value: unknown) { return typeof value === 'number' && value >= 0 && value <= 5; }
  isPrimaryAgentId(_value: string) { return true; }
  getAgentPrecedenceRank(_source: string) { return 100; }
  compareAgentPrecedence(_left: string, _right: string) { return 0; }
  compareMasterThreadTurns(_leftJson: string, _rightJson: string) { return 0; }
  compareMasterThreadMessages(_leftJson: string, _rightJson: string) { return 0; }
  toSpecPriority(_priority: string) { return 'info'; }
  adaptSpineEventToSpec(_typeJson: string, _sourceJson: string, _domainJson: string, _priorityJson: string, _dataJson: string) {
    return j({});
  }
  serializeSpecSpineEvent(_eventJson: string) { return _eventJson; }
}

export class RuntimeSemanticsBuilderJs {
  build(_autopilotLevel: number, _historyMode: string, _dispatchStatus: string, _highRisk: boolean) {
    return j({ disposition: 'standard', noticePrefix: '', summary: '', mode: 'autonomous', reason: '' });
  }
  getNoticePrefix(_disposition: string) { return ''; }
  defaultApprovalRequirement(_dispatchStatus?: string) {
    return j({ required: false, reason: '' });
  }
  deriveExecutionStatus(_dispatchStatus: string) { return 'completed'; }
}

export class InteractionGateJs {
  evaluate(_moduleId: string, _actionType: string, _autopilotLevel: number, _isGuest: boolean) {
    return j({ allowed: true, reason: '' });
  }
}

export class AutopilotActionPolicyServiceJs {
  isAllowed(_actionType: string, _level: number) { return true; }
}

// ─── Routing & Dispatch ─────────────────────────────────────────────────────

export class CommandIntelligenceServiceJs {
  parse(_rawInput: string, _sourceModuleId: string, _nowIso?: string, _timezone?: string) {
    return j({
      rawInput: _rawInput,
      normalizedInput: _rawInput,
      parserVersion: 'phase1-v1',
      parserMode: 'phase1',
      sourceModuleId: _sourceModuleId,
      generatedAt: new Date().toISOString(),
      timezone: _timezone || 'UTC',
      confidence: 0.8,
      intents: [],
      temporalReferences: [],
      sharedRouteHints: [],
      mentions: [],
      mentionedModuleIds: [],
      requiresClarification: false,
      ambiguityReasons: [],
    });
  }
}

export class NexusRoutingServiceJs {
  classifyIntent(_rawInput: string) { return j({ moduleId: 'nexus', confidence: 0.5, reason: 'default' }); }
  classifyIntentFromParsedCommand(_envelopeJson: string) {
    return j({ moduleId: 'nexus', confidence: 0.5, reason: 'default' });
  }
  classifyIntentWithContext(_rawInput: string, _contextJson: string) {
    return j({ moduleId: 'nexus', confidence: 0.5, reason: 'default' });
  }
  buildRouterPrompt() { return 'You are the nexus router.'; }
  parseRoutingResponse(_responseText: string) { return j({ moduleId: 'nexus', reason: 'fallback' }); }
  getRoute(_moduleId: string) { return '/nexus'; }
}

export class NexusActionDispatchServiceJs {
  canDispatchDeterministically(_planJson: string) { return true; }
  resolveDispatchNode(_planJson: string) { return j({ moduleId: 'nexus', actionType: 'none', payload: {} }); }
}

export class NexusDispatchExecutionServiceJs {
  canExecutePacketDeterministically(_packetJson: string) { return true; }
  buildExecutionSummary(_packetJson: string, _resultsJson?: string) { return j({ executed: 0, failed: 0, summary: '' }); }
  buildRetryPacket(_packetJson: string, _resultJson: string) { return null; }
  buildExecutionArtifacts(_packetJson: string, _resultsJson: string, _summaryJson: string) { return j([]); }
  detectDependencyCycles(_planJson: string) { return j([]); }
}

export class NexusActionPlannerServiceJs {
  buildNode(_actionType: string, _payloadJson: string) {
    return j({ actionType: _actionType, payload: JSON.parse(_payloadJson || '{}') });
  }
  shouldEnrichWithScout(_moduleId: string, _intentJson: string) { return false; }
  isDraftActionType(_actionType: string) { return false; }
  getSemanticInput(_rawInput: string) { return _rawInput; }
}

export class NexusSynthesisServiceJs {
  synthesize(_contextJson: string) { return j({ summary: '', conflicts: [] }); }
}

// ─── NSV & Soul ─────────────────────────────────────────────────────────────

export class NsvServiceJs {
  createDefault() { return j({ biological: {}, emotional: {}, cognitive: {}, planning: {}, resource: {} }); }
  normalize(nsvJson: string) { return nsvJson; }
  merge(baseJson: string, updatesJson: string) {
    return j({ ...JSON.parse(baseJson), ...JSON.parse(updatesJson) });
  }
  mergePatches(baseJson: string, updatesJson: string) {
    return j({ ...JSON.parse(baseJson), ...JSON.parse(updatesJson) });
  }
  formatForPrompt(_nsvJson: string) { return '[NSV snapshot]'; }
  formatForModulePrompt(_nsvJson: string, _allowedPathsJson: string) { return '[Module NSV]'; }
  formatForAtlasPlanner(_nsvJson: string) { return '[Atlas planner NSV]'; }
}

export class NsvOwnershipServiceJs {
  getWritableMetrics(_moduleId: string) { return []; }
  getReadableMetrics(_moduleId: string) { return []; }
  getMetricOwner(_metric: string) { return 'nexus'; }
  getMetricOwners(_metric: string) { return ['nexus']; }
  isExclusiveOwner(_moduleId: string, _metric: string) { return false; }
  ownsMetric(_moduleId: string, _metric: string) { return false; }
  getCoOwnedMetricsInPatch(_moduleId: string, _patchJson: string) { return []; }
  getDerivedMetrics() { return []; }
  getCalibrationPrompt(_metric: string) { return ''; }
  buildCalibrationPrompt(_moduleId: string) { return ''; }
  filterNsvForModule(nsvJson: string, _moduleId: string) { return nsvJson; }
  filterWritePatch(_moduleId: string, patchJson: string) { return patchJson; }
  isMetricStale(_lastUpdated: string | null, _thresholdDays: number, _nowMs: number) { return false; }
}

export class NeuralStateVectorJs {
  constructor(_json?: string) {}
  toJson() { return j({ biological: {}, emotional: {}, cognitive: {}, planning: {}, resource: {} }); }
}

export class GlobalProjectionServiceJs {
  getProjection(_uid: string) { return j({ crossFunctionalState: {}, compactedInsights: [] }); }
  updateCrossFunctionalState(_uid: string, _patchJson: string) { return j({}); }
  updateTherapeuticBaseline(_uid: string, _baselineJson: string) { return j({}); }
}

export class SoulAuthorityServiceJs {
  canWrite(_moduleId: string, _nsvPath: string) { return true; }
  getAuthoritativeModule(_nsvPath: string) { return 'nexus'; }
  auditPatch(_moduleId: string, _patchJson: string) { return j({ allowed: [], denied: [] }); }
}

export class SpecVectorCalculatorJs {
  calculate(_nsvJson: string) { return j({ score: 0.5, components: {} }); }
  getSnapshot(_nsvJs: unknown) { return { score: 0.5, label: 'balanced', components: {} }; }
  getBreakdown(_nsvJs: unknown) { return []; }
}

export class GuestQuotaServiceJs {
  private maxTurns = 10;
  getDefault() { return j({ totalTurnsUsed: 0, maxTurnsAllowed: this.maxTurns, isHardLocked: false }); }
  computeNext(currentJson: string) {
    const current = JSON.parse(currentJson);
    const next = (current.totalTurnsUsed ?? 0) + 1;
    return j({ totalTurnsUsed: next, maxTurnsAllowed: this.maxTurns, isHardLocked: next >= this.maxTurns });
  }
  canProceed(currentJson: string) {
    return (JSON.parse(currentJson).totalTurnsUsed ?? 0) < this.maxTurns;
  }
  getMaxTurns() { return this.maxTurns; }
}

export class ContextBudgeterJs {
  truncateText(value: string, _maxChars: number) { return value; }
  composeBoundedContext(titleJson: string, _identityJson: string, _nsvBlock: string, _insightsJson: string, _extensionBlock: string, _maxChars: number, _minNsvChars: number) {
    return titleJson;
  }
}

// ─── Agent System ───────────────────────────────────────────────────────────

export class ActionCapabilityResolverJs {
  resolve(_actionType: string) { return []; }
}

export class AgentRegistryJs {
  listProviders() { return j([]); }
  getProviderByModule(_moduleId: string) { return null; }
  registerProvider(_providerJson: string) {}
  getCapabilitiesForModule(_moduleId: string) { return []; }
  getProvidersForCapability(_capability: string, _preferredJson: string) { return j([]); }
  resolveProvidersForCapabilities(_capabilitiesJson: string, _preferredJson: string) { return j([]); }
  resolvePrimaryProvider(_capabilitiesJson: string, _preferredJson: string) { return null; }
  resolveActionAlias(_moduleId: string, actionType: string) { return actionType; }
  resetForTests() {}
}

// ─── Spine & Flow ───────────────────────────────────────────────────────────

export class FlowContractsJs {
  createFlowMeta(_source: string, _flowId: string | null) { return j({ source: _source, flowId: _flowId ?? 'mock-flow', timestamp: Date.now() }); }
  deriveReadinessLevel(_score: number) { return 'good'; }
  resolveReadinessScore(_dataJson: string | null) { return 0.7; }
  isCriticalReadiness(_dataJson: string | null) { return false; }
  isPhysicalCommitmentMissed(_domain: string, _dataJson: string) { return false; }
  isDelegationCompletionSignal(_eventType: string, _dataJson: string) { return false; }
  parseDelegationTarget(_eventJson: string) { return null; }
}

export class PrecedenceResolverJs {
  clear() {}
  evaluate(_moduleId: string, _actionType: string, _payloadJson: string, _metadataJson: string) { return false; }
}

// ─── Cognitive Engine ───────────────────────────────────────────────────────

export class CognitiveEngineJs {
  constructor(..._args: unknown[]) {}
  streamMessage(_contextJson: string, _onChunk: (chunk: string) => void, _onComplete: (full: string) => void, _onError: (err: string) => void) {
    _onComplete('');
    return null;
  }
  sendMessage(_contextJson: string, _onComplete: (response: string) => void, _onError: (err: string) => void) {
    _onComplete(j({ fullText: '', actions: [], model: 'mock' }));
    return null;
  }
  generateJSON(_contextJson: string, _onComplete: (response: string) => void, _onError: (err: string) => void) {
    _onComplete('{}');
    return null;
  }
}

export const CancellableTask = class {
  cancel() {}
};

export class UserIdentityJs {
  constructor(_uid?: string, _name?: string, _pronouns?: string) {}
}

export class PersonaFactoryJs {
  assemble(_moduleId: string, _baseRole: string, _identityJson: string, _moduleContextJson?: string) {
    return _baseRole;
  }
  assembleWithContext(_moduleId: string, _identity: unknown, _nsv: unknown, _moduleContextJson: string, _extra: unknown) {
    return '';
  }
}

export const PersonaPromptCatalogJs = class {
  getPrompt(_moduleId: string) { return ''; }
  getPersonaBlock(_moduleId: string) { return ''; }
  promptFor(_moduleId: string) { return ''; }
  orchestratorWelcome(_name: string) { return `Welcome, ${_name}.`; }
};

// ─── LLM Utilities ──────────────────────────────────────────────────────────

export class LlmSanitizerJs {
  sanitize(text: string, _retainSpacings?: boolean) { return text; }
  extractActions(text: string) { return j([]); }
  extractMutations(text: string) { return j([]); }
  sanitizeAndExtract(text: string) { return j({ text, actions: [], mutations: [] }); }
  stripProviderControlTokens(content: string) { return content; }
  isProviderControlOnly(_content: string) { return false; }
  stripTechnicalFiller(text: string) { return text; }
  stripPartialLeadingTag(text: string) { return text; }
  parseMutations(_content: string) { return []; }
  stripMutationTags(content: string) { return content; }
  sanitizeJsonPayload(content: string) { return content; }
}

export const ExtractedMutation = class {
  constructor(public path: string = '', public value: unknown = null) {}
};

export class DocumentFieldExtractorJs {
  extract(_text: string) { return j([]); }
  extractReceiptFields(_text: string) { return j({}); }
  extractInvoiceFields(_text: string) { return j({}); }
  extractLabReportFields(_text: string) { return j({}); }
  extractGeneralFields(_text: string) { return j({}); }
  buildExtractionPrompt(_domain: string, _rawText: string, _currency: string | null, _locale: string | null) { return ''; }
}

export class OnboardingValidationJs {
  validate(_schemaId: string, _dataJson: string) { return j({ valid: true, errors: [] }); }
  getRequiredFields(_schemaId: string) { return j([]); }
}

export class CredentialStoreJs {
  constructor(..._args: unknown[]) {}
  get(_key: string, _onComplete: (val: string | null) => void, _onError: (err: string) => void) { _onComplete(null); }
  set(_key: string, _value: string, _onComplete: () => void, _onError: (err: string) => void) { _onComplete(); }
  delete(_key: string, _onComplete: () => void, _onError: (err: string) => void) { _onComplete(); }
}

// ─── Action Hub (KMP) ───────────────────────────────────────────────────────

export const ActionHubJs = class {
  constructor(..._args: unknown[]) {}
  execute(_moduleId: string, _actionType: string, _payloadJson: string, _userId: string | null, _onComplete: (handled: boolean) => void, _onError: (err: string) => void) {
    _onComplete(false); // Fall through to TS handlers in tests
    return new CancellableTask();
  }
};

// ─── Ledger Aggregations ────────────────────────────────────────────────────

const noopAggregation = () => j({ items: [], total: 0, summary: '' });

export class AccountAggregationJs {
  compute(_json: string) { return noopAggregation(); }
  computeAccountSummary(_json: string) { return j({ totalBalance: 0, accounts: [] }); }
  computeNetLiquidAssets(_json: string) { return 0; }
  computeTotalBalance(_json: string) { return 0; }
  getDefaultAccount(_json: string) { return null; }
  computeTotalDebtFromItems(_json: string) { return 0; }
}
export class BudgetAggregationJs {
  compute(_json: string) { return noopAggregation(); }
  computeBudgetActuals(_txJson: string, _categoriesJson: string, _boundsJson?: string) { return j([]); }
  matchCategoryToTransaction(_txJson: string, _categoriesJson: string) { return null; }
}
export class CalendarAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class CreditAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class DashboardAggregationJs {
  compute(_json: string) { return noopAggregation(); }
  computeDashboardMetrics(_profileJson: string, _txJson: string, _budgetJson: string, _goalJson: string) { return j({ income: 0, expenses: 0, savings: 0 }); }
  computeRunwayProjection(_profileJson: string, _nowMs: number) { return j({ months: 0, amount: 0 }); }
  computeDebtPayoffSchedule(_debtJson: string, _extraPayment: number, _nowMs: number) { return j({ months: 0, totalInterest: 0 }); }
  evaluateAlerts(_profileJson: string, _txJson: string, _budgetJson: string, _nowMs: number) { return j([]); }
  computeSavingsProjection(_goalJson: string, _nowMs: number) { return j({ onTrack: true, projectedDate: '' }); }
}
export class ForecastAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class InsuranceAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class NetWorthAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class PortfolioAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class SubscriptionAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class TaxAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class TransactionAggregationJs { compute(_json: string) { return noopAggregation(); } }

export class LedgerAggregationUtilsJs {
  parseCurrency(_text: string) { return 0; }
  formatCurrency(_amount: number) { return '$0.00'; }
  buildFrictionScore(_json: string) { return j({ score: 0, factors: [] }); }
  epochMsToYearMonth(_nowMs: number) { return '2026-04'; }
  getMonthBounds(_month: string) { return j({ start: '2026-04-01', end: '2026-04-30' }); }
}

export class RetirementCalculatorJs {
  calculate(_json: string) { return j({ targetAge: 65, monthlyNeeded: 0, onTrack: true }); }
  project(_planJson: string, _currentYear: number) { return j({ projectedBalance: 0, shortfall: 0, onTrack: true }); }
  requiredMonthlyContribution(_planJson: string) { return 0; }
  getSnapshot(_planJson: string) { return j({ currentSavings: 0, target: 0, gap: 0 }); }
  getBreakdown(_planJson: string) { return j({ contributions: 0, growth: 0, total: 0 }); }
}

export class CrossVerificationServiceJs {
  verify(_json: string) { return j({ discrepancies: [], verified: true }); }
}

// ─── Titan ──────────────────────────────────────────────────────────────────

export class E1rmServiceJs {
  calculate(_weight: number, _reps: number) { return _weight; }
  calculateE1RM(_weight: number, _reps: number) { return _weight; }
  calculateFromJson(_json: string) { return j({ e1rm: 0, formula: 'epley' }); }
  computeSessionPRs(_exercisesJson: string, _historyJson: string, _personalRecordsJson?: string) { return j([]); }
  getBestE1RM(_exercisesJson: string, _exerciseId: string) { return 0; }
}

export class ExerciseLibraryJs {
  getExercise(_name: string) { return j({ name: _name, muscleGroup: 'unknown', equipment: 'none' }); }
  search(_query: string) { return j([]); }
  getAll() { return j([]); }
}

export class RecoveryTemplatesJs {
  getTemplate(_type: string) { return j({ type: _type, activities: [], durationMinutes: 30 }); }
  getAll() { return j([]); }
}

export class QuickLogParserJs {
  parse(_input: string) { return j({ type: 'unknown', parsed: {} }); }
  parseQuickLogInput(_input: string) { return j({ type: 'unknown', isEmpty: true, entries: [], hasLowConfidence: false, exercises: [], parsed: {} }); }
  annotatePRs(_entriesJson: string, _personalRecordsJson?: string) { return j([]); }
  buildHistorySuggestion(_sessionsJson: string, _maxLength: number) { return ''; }
}

export class ProgressiveOverloadEngineJs {
  recommend(_historyJson: string) { return j({ nextWeight: 0, nextReps: 0, progression: 'maintain' }); }
  annotatePRs(_exercisesJson: string, _historyJson: string, _personalRecordsJson?: string) { return j([]); }
  computeSessionPRs(_exercisesJson: string, _historyJson: string) { return j([]); }
}

export class TitanNsvUpdaterJs {
  buildWorkoutPatch(_workoutJson: string) { return j({}); }
  buildSleepPatch(_sleepJson: string) { return j({}); }
  computeWorkoutPatch(_rpe: number, _volumeKg: number, _hoursElapsed: number, _existingCns: number, _existingRecovery: number) {
    return { cnsFatigue: 5, recoveryScore: 70, energyBudget: 60, focusScore: 65 };
  }
  computeSleepPatch(_durationHours: number, _qualityRating: number) {
    return { sleepQuality: 7, cnsFatigue: 3, recoveryScore: 80, energyBudget: 75 };
  }
}

export const TitanPromptBuilderJs = class {
  build(_profileJson: string, _contextJson: string) { return ''; }
  buildOnboardingPrompt(_profileJson: string) { return 'Onboarding prompt'; }
};

// ─── Agnes ──────────────────────────────────────────────────────────────────

export class AgnesGravityEngineJs {
  compute(_stateJson: string) { return j({ gravity: 0, pull: 'neutral' }); }
}

export class SessionArcJs {
  getArc(_sessionJson: string) { return j({ phase: 'opening', progress: 0 }); }
  transition(_currentPhase: string) { return 'opening'; }
}

// ─── Atlas ──────────────────────────────────────────────────────────────────

export class AtlasComputeUtilsJs {
  getJournalPrompt(_tone: string) { return 'Reflect on your day.'; }
  getJournalForward(_tone: string) { return 'Looking ahead...'; }
  parseScore(_text: string) { return 0; }
  sanitizeTitle(_title: string) { return _title; }
  computeActiveLoad(_tasksJson: string) { return 0; }
  computeDeadlinePressure(_tasksJson: string) { return 0; }
}

export class HabitEnergyMatcherJs {
  match(_habitsJson: string, _energyLevel: number) { return j([]); }
}

// ─── Soma ───────────────────────────────────────────────────────────────────

export class SomaFieldTemplatesJs {
  getTemplate(_fieldId: string) { return j({ id: _fieldId, label: '', type: 'text', options: [] }); }
  getAll() { return j([]); }
}
