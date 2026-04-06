/**
 * Test mock for @cortex-logic KMP bridge.
 * Provides lightweight stubs for all 69 @JsExport classes so vitest can
 * load any file that imports from '@cortex-logic' without the full KMP runtime.
 *
 * Method signatures match the real KMP classes. Methods return realistic
 * values based on inputs where tests assert on output. JSON-returning methods
 * use j() helper; methods whose callers read properties directly return plain objects.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

const j = JSON.stringify;

const NON_MUTATING_ACTIONS = new Set([
  'generate_summary', 'web_search', 'search_memory', 'delegate_to_module',
  'deep_research', 'analyze', 'explain', 'read_nsv', 'get_status',
  'query_module', 'query_module_data', 'propose_draft', 'propose_routine',
  'confirm_routine', 'dismiss_routine', 'propose_reminder', 'navigate_to_module',
  'create_module_handoff', 'commit_research', 'complete_onboarding',
  'update_intake_profile', 'update_belief_graph',
  'analyze_trends', 'analyze_patterns', 'analyze_sentiment', 'cross_module_analysis',
  'generate_report', 'trend_summary',
]);

function defaultOrchestrationMetadata() {
  return {
    executionMode: 'autonomous' as const,
    historyMode: 'standard' as const,
    mutatesState: false,
    patientScope: 'USER',
    dispatchStatus: 'dispatched',
    approvalRequirement: { required: false, reason: '' },
    runtime: {
      autopilotLevel: 3,
      autonomy: 'conditional_autonomy',
      disposition: 'visible_execution',
      historyDestination: 'standard',
      willPersistHistory: true,
      shouldNotifyUser: false,
      summary: '',
      noticePrefix: '',
    },
    proposal: {
      id: 'mock-proposal-id',
      createdAt: new Date().toISOString(),
    },
    proposalCard: { title: '', summary: '', proposalId: 'mock-proposal-id', source: 'nexus', status: 'pending', approvalRequirement: { required: false, reason: '' }, historyMode: 'standard' },
    execution: {
      id: 'mock-execution-id',
      source: 'nexus',
      status: 'completed',
      executedAt: new Date().toISOString(),
      patientScope: 'USER',
    },
    activeThreadId: null,
    failure: null,
  };
}

// ─── Orchestration Services ─────────────────────────────────────────────────

export class OrchestrationActionGateServiceJs {
  evaluate(inputJson: string, _actionType: string) {
    const input = JSON.parse(inputJson);
    const { moduleId, actionType, autopilotLevel, historyMode, isGuest, persistencePolicy, payload, activeThreadId } = input;
    const mutatesState = !NON_MUTATING_ACTIONS.has(actionType);
    const now = new Date().toISOString();

    // Build runtime semantics
    const runtimeBuilder = new RuntimeSemanticsBuilderJs();
    let dispatchStatus: string;
    let executionMode: string;
    let executionStatus: string;
    let shouldDispatch: boolean;

    if (persistencePolicy === 'ephemeral') {
      dispatchStatus = 'ephemeral';
      executionMode = 'analysis_only';
      executionStatus = 'analysis_only';
      shouldDispatch = false;
    } else if (isGuest && mutatesState) {
      dispatchStatus = 'blocked';
      executionMode = 'analysis_only';
      executionStatus = 'analysis_only';
      shouldDispatch = false;
    } else if (!mutatesState) {
      dispatchStatus = 'approved';
      executionMode = autopilotLevel === 5 ? 'ghost' : autopilotLevel <= 2 ? 'assisted' : 'autonomous';
      executionStatus = 'executed';
      shouldDispatch = true;
    } else if (autopilotLevel <= 1) {
      dispatchStatus = 'awaiting_approval';
      executionMode = 'assisted';
      executionStatus = 'deferred';
      shouldDispatch = false;
    } else if (autopilotLevel === 2) {
      dispatchStatus = 'awaiting_approval';
      executionMode = 'assisted';
      executionStatus = 'deferred';
      shouldDispatch = false;
    } else if (autopilotLevel === 3) {
      dispatchStatus = 'approved';
      executionMode = 'autonomous';
      executionStatus = 'executed';
      shouldDispatch = true;
    } else if (autopilotLevel === 4) {
      dispatchStatus = 'approved';
      executionMode = 'autonomous';
      executionStatus = 'executed';
      shouldDispatch = true;
    } else {
      // level 5 ghost
      dispatchStatus = 'approved';
      executionMode = 'ghost';
      executionStatus = 'executed';
      shouldDispatch = true;
    }

    const runtime = runtimeBuilder.build(autopilotLevel, historyMode, dispatchStatus, false);
    // Silent audit entries ARE persisted (to the audit log), just not to visible history
    if (runtime.historyDestination === 'silent_audit') {
      runtime.willPersistHistory = true;
    }
    // Override disposition for guest
    if (isGuest && mutatesState) {
      runtime.disposition = 'high_risk_review';
    }

    const confidence = mutatesState ? 0.85 : 0.95;

    const resolvedHistoryMode = autopilotLevel === 5 && historyMode === 'silent' ? 'silent' : 'standard';
    const patientScope = isGuest ? 'GUEST' : 'USER';
    const proposalId = `proposal-${actionType}-${Date.now()}`;
    const execId = `exec-${actionType}-${Date.now()}`;

    const metadata = {
      actionType,
      activeThreadId: activeThreadId ?? null,
      autopilotLevel,
      executionMode,
      historyMode: resolvedHistoryMode,
      mutatesState,
      highRisk: false,
      patientScope,
      dispatchStatus,
      approvalRequirement: {
        required: dispatchStatus === 'awaiting_approval',
        reason: dispatchStatus === 'awaiting_approval' ? 'manual_level' : 'none',
      },
      runtime,
      proposal: {
        id: proposalId,
        source: moduleId || 'nexus',
        intent: actionType,
        confidence,
        patientScope,
        createdAt: now,
        metadata: { actionType, moduleId },
      },
      proposalCard: {
        id: `card-${proposalId}`,
        proposalId,
        title: actionType,
        summary: '',
        source: moduleId || 'nexus',
        status: 'pending',
        approvalRequirement: { required: dispatchStatus === 'awaiting_approval', reason: dispatchStatus === 'awaiting_approval' ? 'manual_level' : 'none' },
        executionMode,
        historyMode: resolvedHistoryMode,
      },
      execution: {
        id: execId,
        proposalId,
        source: moduleId || 'nexus',
        autopilotLevel,
        executionMode,
        historyMode: resolvedHistoryMode,
        patientScope,
        status: executionStatus,
        executedAt: now,
      },
      failure: null,
    };

    return j({ shouldDispatch, metadata });
  }
  isNsvReadOnlyModule(moduleId: string) {
    return ['scout', 'forge'].includes(moduleId);
  }
  isNsvWriteActionType(actionType: string) {
    // Only explicit NSV-write actions — not general-purpose actions
    return ['update_nsv', 'write_nsv', 'patch_soul', 'force_soul_update'].includes(actionType);
  }
  inferMutatesState(actionType: string) { return !NON_MUTATING_ACTIONS.has(actionType); }
}

export class OrchestrationPolicyServiceJs {
  sortProposals(proposalsJson: string) { return proposalsJson; }
  resolveWinningProposal(proposalsJson: string) {
    const arr = JSON.parse(proposalsJson);
    if (arr.length === 0) return null;
    const RANK: Record<string, number> = { agnes: 1, atlas: 2, soma: 3, titan: 4, scout: 5, ledger: 6, forge: 7, nexus: 8 };
    arr.sort((a: any, b: any) => {
      const ra = RANK[a.source ?? a.id] ?? 100;
      const rb = RANK[b.source ?? b.id] ?? 100;
      if (ra !== rb) return ra - rb;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    });
    return j(arr[0]);
  }
  getExecutionPolicy(level: number, proposalJson: string, _conflict: boolean, _highRisk: boolean) {
    const proposal = JSON.parse(proposalJson);
    if (proposal.patientScope === 'GUEST') {
      return j({ requiresApproval: { required: false, reason: 'guest_scope' }, executionMode: 'analysis_only', historyMode: 'standard', canMutateState: false });
    }
    if (level <= 2) {
      return j({ requiresApproval: { required: true, reason: 'manual_level' }, executionMode: 'assisted', historyMode: 'standard', canMutateState: false });
    }
    if (level === 3) {
      return j({ requiresApproval: { required: true, reason: 'conditional_gate' }, executionMode: 'assisted', historyMode: 'standard', canMutateState: false });
    }
    if (level === 5) {
      return j({ requiresApproval: { required: false, reason: 'none' }, executionMode: 'ghost', historyMode: 'silent', canMutateState: true });
    }
    return j({ requiresApproval: { required: false, reason: 'none' }, executionMode: 'autonomous', historyMode: 'standard', canMutateState: true });
  }
}

export class OrchestrationCommandCenterServiceJs {
  buildSnapshot(actionsJson: string, failuresJson: string, silentJson: string, limit: number) {
    const actions = JSON.parse(actionsJson || '[]');
    const failures: any[] = JSON.parse(failuresJson || '[]');
    const silentHistory: any[] = JSON.parse(silentJson || '[]');
    const sliced = (arr: any[]) => arr.slice(0, limit);
    const approvalItems = actions.filter((a: any) => a.dispatchStatus === 'awaiting_approval' || a.dispatchStatus === 'deferred').map((a: any, i: number) => ({
      id: `approval-${i}`, kind: 'approval' as const, tone: 'amber' as const, title: a.label || a.actionType || '', summary: a.summary || '', source: a.source || 'nexus', timestamp: a.executedAt || null,
    }));
    const incidentItems = failures.filter((f: any) => f.status === 'escalated').map((f: any, i: number) => ({
      id: `incident-${i}`, kind: 'incident' as const, tone: 'rose' as const, title: f.actionType || 'Failure', summary: f.errorMessage || '', source: f.moduleId || 'nexus', timestamp: f.failedAt || null,
    }));
    const debtFromFailures = failures.filter((f: any) => f.status !== 'escalated').map((f: any, i: number) => ({
      id: `debt-fail-${i}`, kind: 'debt' as const, tone: 'cyan' as const, title: (f.actionType || 'Retry').replace(/_/g, ' '), summary: f.errorMessage || '', source: f.moduleId || 'nexus', timestamp: f.failedAt || null,
    }));
    const debtFromBlocked = actions.filter((a: any) => a.dispatchStatus === 'blocked').map((a: any, i: number) => ({
      id: `debt-blocked-${i}`, kind: 'debt' as const, tone: 'cyan' as const, title: a.label || a.actionType || '', summary: a.summary || '', source: a.source || 'nexus', timestamp: a.executedAt || null,
    }));
    const debtItems = [...debtFromFailures, ...debtFromBlocked];
    const auditItems = silentHistory.map((s: any, i: number) => {
      const hiddenMsgs = s.metadata?.hiddenMessages;
      const summary = Array.isArray(hiddenMsgs) ? hiddenMsgs.join(' ') : s.summary || '';
      const title = s.actionType || summary;
      return { id: `audit-${i}`, kind: 'audit' as const, tone: 'violet' as const, title, summary, source: s.source || s.moduleId || '', timestamp: s.timestamp || null };
    });
    return j({
      attentionCount: approvalItems.length + incidentItems.length + debtItems.length,
      approvals: { count: approvalItems.length, items: sliced(approvalItems) },
      incidents: { count: incidentItems.length, items: sliced(incidentItems) },
      debt: { count: debtItems.length, items: sliced(debtItems) },
      audit: { count: auditItems.length, items: sliced(auditItems) },
    });
  }
}

export class OrchestrationExecutionUtilsJs {
  classifyFailureCode(serialized: string) {
    const lower = (serialized || '').toLowerCase();
    if (lower.includes('permission') || lower.includes('denied') || lower.includes('unauthorized')) return 'PERMISSION';
    if (lower.includes('missing') && (lower.includes('handler') || lower.includes('action'))) return 'MISSING_HANDLER';
    if (lower.includes('network') || lower.includes('timeout') || lower.includes('transient') || lower.includes('econnrefused')) return 'TRANSIENT';
    return 'UNKNOWN';
  }
  nextFailureStatus(code: string, retryCount: number) {
    const NON_TRANSIENT = ['PERMISSION', 'MISSING_HANDLER', 'UNKNOWN'];
    if (NON_TRANSIENT.includes(code)) return 'escalated';
    // Transient errors can retry up to 3 times
    if (retryCount < 3) return 'retry_scheduled';
    return 'escalated';
  }
  getRetryBackoffMs(retryCount: number) { return Math.min(1000 * Math.pow(2, retryCount), 30000); }
  createResumableSnapshot(_type: string, _contextJson: string, _metadataJson: string) { return j({}); }
  recordFailure(_uid: string, failureJson: string) {
    const f = JSON.parse(failureJson);
    return j({ ...f, id: f.id || `failure-${Date.now()}`, storedAt: new Date().toISOString() });
  }
  recordMissingHandlerFailure(_uid: string, inputJson: string) {
    const input = JSON.parse(inputJson);
    return j({
      id: `failure-${Date.now()}`, actionType: input.actionType || 'unknown',
      error: 'missing_handler', errorCode: 'MISSING_HANDLER', status: 'escalated',
      failedAt: new Date().toISOString(),
    });
  }
}

export class OrchestrationHistoryUtilsJs {
  generateAutonomyExplanation(metadataJson: string) {
    const m = JSON.parse(metadataJson);
    const modeLabel = m.executionMode === 'ghost' ? 'Ghost Mode' : m.executionMode || 'autonomous';
    const level = m.autopilotLevel ?? m.runtime?.autopilotLevel ?? '?';
    const lines = [`Executed with ${modeLabel} at Autopilot L${level}.`];
    if (m.runtime?.historyDestination === 'silent_audit' || m.historyMode === 'silent') {
      lines.push('Actions were routed to the silent audit log.');
    }
    if (m.runtime?.shouldNotifyUser === false) {
      lines.push('No user-facing notification was sent.');
    }
    return lines.join(' ');
  }
  shouldRouteToSilentHistory(historyMode: string, executionStatus: string, historyDestination: string) {
    return historyDestination === 'silent_audit' || (historyMode === 'silent' && executionStatus === 'executed');
  }
  getAssistantMessageChannel(historyMode: string, executionStatus: string, historyDestination: string) {
    return this.shouldRouteToSilentHistory(historyMode, executionStatus, historyDestination) ? 'silent_history' : 'visible';
  }
  buildSilentHistoryEntry(moduleId: string, metadataJson: string, suppressedJson: string) {
    const metadata = JSON.parse(metadataJson);
    if (metadata.patientScope === 'GUEST') return null;
    if (metadata.runtime?.historyDestination !== 'silent_audit' && metadata.historyMode !== 'silent') return null;
    const suppressed: string[] = JSON.parse(suppressedJson || '[]');
    const executionId = metadata.execution?.id || '';
    const autonomyExplanation = this.generateAutonomyExplanation(metadataJson);
    return j({
      id: `silent.${executionId}`, moduleId, actionType: metadata.actionType || metadata.proposalCard?.title || '',
      executionId, proposalId: metadata.proposal?.id || '',
      summary: suppressed[0] || '', source: metadata.proposal?.source || moduleId,
      timestamp: new Date().toISOString(), patientScope: metadata.patientScope || 'USER',
      metadata: { moduleId, autonomyExplanation, hiddenMessages: suppressed, activeThreadId: metadata.activeThreadId },
      suppressedMessages: suppressed,
    });
  }
}

export class OrchestrationOperatingModeServiceJs {
  derive(
    autopilotLevel: number, historyMode: string, _autonomy: string | null,
    isGuest: boolean, awaitingApprovalCount: number,
    failedCount: number, escalatedCount: number,
  ) {
    const levelLabels: Record<number, string> = {
      0: 'L0 Manual lock', 1: 'L1 Proposal first', 2: 'L2 Guided assist',
      3: 'L3 Conditional autonomy', 4: 'L4 Supervised autonomy', 5: 'L5 Ghost',
    };
    const levelLabel = levelLabels[autopilotLevel] ?? `L${autopilotLevel}`;
    const historyLabel = (autopilotLevel === 5 && historyMode === 'silent') ? 'Silent audit' : historyMode === 'silent' ? 'Silent audit' : 'Visible history';
    const scopeLabel = isGuest ? 'Guest scope' : 'User scope';
    const autonomyLabel = isGuest ? 'Analysis-only' : autopilotLevel === 5 ? 'Ghost mode' : autopilotLevel >= 3 ? 'Auto execution' : 'Manual';
    const authorityLabel = isGuest ? 'Analysis-only' : autopilotLevel >= 3 ? 'Auto execution' : 'Manual review';
    if (isGuest) {
      return j({ levelLabel, autonomyLabel, scopeLabel, authorityLabel, historyLabel: 'Standard', summaryLabel: 'Guest analysis-only', chips: [] });
    }
    let summaryLabel = levelLabel.split(' ').slice(1).join(' ') + ' autonomy';
    if (escalatedCount > 0) summaryLabel = 'Incident posture';
    else if (failedCount > 0) summaryLabel = 'Failures detected';
    else if (awaitingApprovalCount > 0) summaryLabel = 'Approval gated';
    else if (autopilotLevel === 5 && historyMode === 'silent') summaryLabel = 'Ghost silent';
    const chips = [
      { id: 'level', label: `${levelLabel} ${summaryLabel}`, tone: '' },
      { id: 'scope', label: scopeLabel, tone: '' },
      { id: 'history', label: historyLabel, tone: '' },
      { id: 'authority', label: authorityLabel, tone: '' },
    ];
    return j({ levelLabel, autonomyLabel, scopeLabel, authorityLabel, historyLabel, summaryLabel, chips });
  }
}

export class OrchestrationPerformanceServiceJs {
  private _data = new Map<string, { cacheHits: number; cacheMisses: number; totalComputations: number; totalDurationMs: number }>();
  private _get(domain: string) {
    if (!this._data.has(domain)) this._data.set(domain, { cacheHits: 0, cacheMisses: 0, totalComputations: 0, totalDurationMs: 0 });
    return this._data.get(domain)!;
  }
  recordCacheHit(domain: string) { this._get(domain).cacheHits++; }
  recordCacheMiss(domain: string) { this._get(domain).cacheMisses++; }
  recordComputation(domain: string, durationMs: number) { const d = this._get(domain); d.totalComputations++; d.totalDurationMs += durationMs; }
  getMetrics(domain: string) { return j(this._get(domain)); }
  getAllMetrics() { return j(Object.fromEntries(this._data)); }
  reset() { this._data.clear(); }
}

export class OrchestrationPersistenceUtilsJs {
  toFirestoreSafeJson(valueJson: string) { return valueJson; }
  getProposalCollectionPath(uid: string) { return `users/${uid}/orchestration_proposals`; }
  getExecutionCollectionPath(uid: string) { return `users/${uid}/orchestration_execution_records`; }
  getExecutionFailureCollectionPath(uid: string) { return `users/${uid}/orchestration_execution_failures`; }
  getThreadCollectionPath(uid: string) { return `users/${uid}/orchestration_threads`; }
  toProposalRecord(moduleId: string, metadataJson: string, storedAt: string) {
    const metadata = JSON.parse(metadataJson);
    return j({
      id: metadata.proposal?.id || 'mock-id', moduleId,
      actionType: metadata.actionType || metadata.proposalCard?.title || '',
      threadId: metadata.activeThreadId || null,
      executionId: metadata.execution?.id || '',
      dispatchStatus: metadata.dispatchStatus,
      executionMode: metadata.executionMode,
      historyMode: metadata.historyMode,
      approvalRequirement: metadata.approvalRequirement,
      patientScope: metadata.patientScope,
      mutatesState: metadata.mutatesState ?? false,
      highRisk: false,
      proposal: metadata.proposal,
      proposalCard: metadata.proposalCard,
      runtime: metadata.runtime,
      createdAt: metadata.proposal?.createdAt || storedAt,
      storedAt,
    });
  }
  toExecutionRecord(moduleId: string, metadataJson: string, storedAt: string) {
    const metadata = JSON.parse(metadataJson);
    return j({
      id: metadata.execution?.id || 'mock-id', moduleId,
      actionType: metadata.actionType || metadata.proposalCard?.title || '',
      threadId: metadata.activeThreadId || null,
      dispatchStatus: metadata.dispatchStatus,
      approvalRequirement: metadata.approvalRequirement,
      proposalCard: metadata.proposalCard,
      execution: metadata.execution,
      executedAt: metadata.execution?.executedAt || storedAt,
      storedAt,
    });
  }
  sanitizeRuntimeSummary(summaryJson: string) {
    const summary = JSON.parse(summaryJson);
    if (!summary) return summaryJson;
    // Filter out GUEST-scoped actions and recompute counts
    if (Array.isArray(summary.actions)) {
      summary.actions = summary.actions.filter((a: any) => a.patientScope !== 'GUEST');
      if (summary.counts) {
        summary.counts.total = summary.actions.length;
        summary.counts.visibleExecutions = summary.actions.filter((a: any) => a.runtime?.disposition === 'visible_execution' && (a.executionStatus === 'executed')).length;
        summary.counts.silentExecutions = summary.actions.filter((a: any) => a.runtime?.disposition === 'silent_execution' && (a.executionStatus === 'executed')).length;
        summary.counts.awaitingApproval = summary.actions.filter((a: any) => ['manual_review', 'proposal_review', 'high_risk_review'].includes(a.runtime?.disposition)).length;
        summary.counts.analysisOnly = summary.actions.filter((a: any) => a.runtime?.disposition === 'analysis_only').length;
        summary.counts.blocked = summary.actions.filter((a: any) => a.dispatchStatus === 'blocked').length;
        summary.counts.ephemeral = summary.actions.filter((a: any) => a.runtime?.disposition === 'ephemeral_preview').length;
        summary.counts.failed = summary.actions.filter((a: any) => a.executionStatus === 'failed' || a.executionStatus === 'failed_escalated').length;
        summary.counts.escalated = summary.actions.filter((a: any) => a.executionStatus === 'failed_escalated' || a.failure?.status === 'escalated').length;
      }
    }
    return j(summary);
  }
}

export class OrchestrationRolloutServiceJs {
  private _s = { parseSuccesses: 0, parseClarifications: 0, parsedRouteHits: 0, capabilityRouteHits: 0, keywordRouteHits: 0, defaultRouteHits: 0, planningBuilds: 0, planningSkips: 0, approvalInterruptions: 0, executionFailures: 0, executionFailureByAction: {} as Record<string, number> };
  recordParsedCommand(requiresClarification: boolean) { if (requiresClarification) this._s.parseClarifications++; else this._s.parseSuccesses++; }
  recordRoutingDecision(reason: string) {
    if (reason.startsWith('command:')) this._s.parsedRouteHits++;
    else if (reason.startsWith('capability:')) this._s.capabilityRouteHits++;
    else if (reason.startsWith('matched:')) this._s.keywordRouteHits++;
    else if (reason.startsWith('default')) this._s.defaultRouteHits++;
  }
  recordPlanningAttempt(built: boolean) { if (built) this._s.planningBuilds++; else this._s.planningSkips++; }
  recordRuntimeSummary(summaryJson: string) {
    const summary = JSON.parse(summaryJson);
    for (const action of (summary.actions || [])) {
      if (action.dispatchStatus === 'awaiting_approval' || action.dispatchStatus === 'deferred') this._s.approvalInterruptions++;
      if (action.executionStatus === 'failed' || action.executionStatus === 'failed_escalated') {
        this._s.executionFailures++;
        const at = action.actionType || 'unknown';
        this._s.executionFailureByAction[at] = (this._s.executionFailureByAction[at] || 0) + 1;
      }
    }
  }
  getSnapshot() { return j({ ...this._s }); }
  reset() { this._s = { parseSuccesses: 0, parseClarifications: 0, parsedRouteHits: 0, capabilityRouteHits: 0, keywordRouteHits: 0, defaultRouteHits: 0, planningBuilds: 0, planningSkips: 0, approvalInterruptions: 0, executionFailures: 0, executionFailureByAction: {} }; }
}

export class OrchestrationContractsJs {
  private _ranks: Record<string, number> = { agnes: 1, atlas: 2, soma: 3, titan: 4, scout: 5, ledger: 6, forge: 7, nexus: 8 };
  isAutopilotLevel(value: unknown) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5; }
  isPrimaryAgentId(_value: string) { return true; }
  getAgentPrecedenceRank(source: string) { return this._ranks[source.toLowerCase()] ?? 100; }
  compareAgentPrecedence(left: string, right: string) { return this.getAgentPrecedenceRank(left) - this.getAgentPrecedenceRank(right); }
  compareMasterThreadTurns(leftJson: string, rightJson: string) {
    const l = JSON.parse(leftJson); const r = JSON.parse(rightJson);
    const seqDelta = (l.sequence ?? 0) - (r.sequence ?? 0);
    if (seqDelta !== 0) return seqDelta;
    return (l.createdAt ?? '').localeCompare(r.createdAt ?? '');
  }
  compareMasterThreadMessages(leftJson: string, rightJson: string) {
    const l = JSON.parse(leftJson); const r = JSON.parse(rightJson);
    const seqDelta = (l.turnSequence ?? 0) - (r.turnSequence ?? 0);
    if (seqDelta !== 0) return seqDelta;
    return (l.createdAt ?? '').localeCompare(r.createdAt ?? '');
  }
  toSpecPriority(priority: string) {
    return priority === 'critical' ? 1 : priority === 'alert' ? 2 : 3;
  }
  adaptSpineEventToSpec(eventJson: string, optionsJson: string) {
    const event = JSON.parse(eventJson);
    const opts = optionsJson ? JSON.parse(optionsJson) : {};
    const rawSource = (event.source || '').replace(/^spine-cascade:/i, '').toUpperCase();
    const VALID = ['NEXUS', 'AGNES', 'ATLAS', 'TITAN', 'LEDGER', 'SOMA', 'SCOUT', 'FORGE'];
    const source = VALID.includes(rawSource) ? rawSource : 'NEXUS';
    const priorityMap: Record<string, number> = { critical: 1, alert: 2, info: 3 };
    const priority = priorityMap[event.priority] ?? 3;
    const data = event.data || {};
    const rawMutations = opts.mutations || data.mutations || {};
    const SPEC_KEYS = ['resilience', 'bandwidth', 'vitality', 'output', 'friction'];
    const mutations: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawMutations)) {
      if (SPEC_KEYS.includes(k) && typeof v === 'number') mutations[k] = v;
    }
    return j({
      header: { id: event.id || '', source, timestamp: event.timestamp || 0, priority },
      payload: { intent: opts.intent || data.intent || '', mutations, attributes: {} },
      logic_gates: { confidence: opts.confidence ?? data.confidence ?? 0, requires_approval: opts.requiresApproval ?? false, patient_scope: opts.patientScope ?? data.patient_scope ?? 'USER' },
    });
  }
  serializeSpecSpineEvent(eventJson: string) { return eventJson; }
}

export class RuntimeSemanticsBuilderJs {
  build(autopilotLevel: number, historyMode: string, dispatchStatus: string, highRisk: boolean): any {
    const autonomy: string =
      autopilotLevel === 0 ? 'manual_lock' :
      autopilotLevel <= 2 ? 'guided_assist' :
      autopilotLevel === 3 ? 'conditional_autonomy' :
      autopilotLevel === 4 ? 'supervised_autonomy' : 'ghost';

    const disposition: string =
      dispatchStatus === 'ephemeral' ? 'ephemeral_preview' :
      highRisk ? 'high_risk_review' :
      autopilotLevel === 0 ? 'manual_review' :
      dispatchStatus === 'awaiting_approval' ? 'proposal_review' :
      dispatchStatus === 'analysis_only' ? 'analysis_only' :
      (autopilotLevel === 5 && historyMode === 'silent') ? 'silent_execution' : 'visible_execution';

    const historyDestination =
      (autopilotLevel === 5 && historyMode === 'silent') ? 'silent_audit' : 'standard';

    return {
      autopilotLevel,
      autonomy,
      disposition,
      historyDestination,
      willPersistHistory: disposition !== 'ephemeral_preview' && disposition !== 'silent_execution',
      shouldNotifyUser: ['manual_review', 'proposal_review', 'high_risk_review'].includes(disposition),
    };
  }
  getNoticePrefix(disposition: string) {
    if (disposition === 'high_risk_review') return 'High-risk action requires approval';
    if (disposition === 'manual_review') return 'Manual review required before execution';
    if (disposition === 'proposal_review') return 'Pending approval before execution';
    if (disposition === 'analysis_only') return 'Not executed in this session';
    if (disposition === 'incident_review') return 'Execution failed and requires incident review';
    return null;
  }
  defaultApprovalRequirement(dispatchStatus?: string) {
    if (dispatchStatus === 'awaiting_approval') return j({ required: true, reason: 'manual_level' });
    return j({ required: false, reason: 'none' });
  }
  deriveExecutionStatus(dispatchStatus: string) {
    if (dispatchStatus === 'approved' || dispatchStatus === 'dispatched') return 'executed';
    if (dispatchStatus === 'awaiting_approval') return 'deferred';
    if (dispatchStatus === 'analysis_only') return 'analysis_only';
    if (dispatchStatus === 'blocked') return 'blocked';
    if (dispatchStatus === 'ephemeral') return 'analysis_only';
    return 'executed';
  }
}

export class InteractionGateJs {
  evaluate(
    autopilotLevel: number,
    kind: string,
    _sourceModuleId: string,
    confidence: number,
    requiresApproval: boolean,
    highRisk: boolean,
    hasConflict: boolean,
    canAutoDispatch: boolean,
  ) {
    // Ghost level (5): silent if canAutoDispatch, else visible
    if (autopilotLevel === 5) {
      if (canAutoDispatch && !highRisk && !hasConflict && !requiresApproval) {
        // Routing decisions use silent_delegate (auto-navigate), other kinds use silent_execute
        const mode = kind === 'routing' ? 'silent_delegate' : 'silent_execute';
        return { kind, mode, reason: 'ghost_mode', confidence, historyMode: 'silent', shouldPersistDraft: false, shouldNotifyUser: false, shouldRenderHudSignal: false };
      }
      const reason = !canAutoDispatch ? 'silent_unavailable' : requiresApproval ? 'explicit_gate' : highRisk ? 'high_risk_gate' : 'conflict_gate';
      return { kind, mode: 'visible_proposal', reason, confidence, historyMode: 'standard', shouldPersistDraft: true, shouldNotifyUser: true, shouldRenderHudSignal: true };
    }
    // L3: conditional autonomy (higher thresholds). L4: supervised autonomy.
    if (autopilotLevel >= 3 && autopilotLevel <= 4) {
      const l3Thresholds: Record<string, number> = { routing: 0.85, planning: 0.80, routine: 0.80 };
      const l4Thresholds: Record<string, number> = { routing: 0.62, planning: 0.72, routine: 0.72 };
      const thresholds = autopilotLevel === 3 ? l3Thresholds : l4Thresholds;
      const threshold = thresholds[kind] ?? 0.7;
      const effectiveConfidence = confidence >= 0 ? confidence : threshold;
      if (canAutoDispatch && effectiveConfidence >= threshold && !requiresApproval && !highRisk && !hasConflict) {
        return { kind, mode: 'silent_execute', reason: 'auto_execution', confidence: effectiveConfidence, historyMode: 'standard', shouldPersistDraft: false, shouldNotifyUser: false, shouldRenderHudSignal: true };
      }
      return { kind, mode: 'visible_proposal', reason: 'confidence_below_threshold', confidence: effectiveConfidence, historyMode: 'standard', shouldPersistDraft: true, shouldNotifyUser: true, shouldRenderHudSignal: true };
    }
    // L0-L2: always visible
    return { kind, mode: 'visible_proposal', reason: 'manual_level', confidence: confidence >= 0 ? confidence : 0.5, historyMode: 'standard', shouldPersistDraft: true, shouldNotifyUser: true, shouldRenderHudSignal: true };
  }
}

export class AutopilotActionPolicyServiceJs {
  isAllowed(_actionType: string, _level: number) { return true; }
}

// ─── Routing & Dispatch ─────────────────────────────────────────────────────

export class CommandIntelligenceServiceJs {
  private static MODULES = ['agnes', 'atlas', 'titan', 'soma', 'ledger', 'scout', 'forge', 'nexus'];

  parse(rawInput: string, sourceModuleId: string, nowIso?: string, timezone?: string) {
    const lower = rawInput.toLowerCase();
    const mentions: any[] = [];
    const sharedRouteHints: any[] = [];
    const intents: any[] = [];

    // Detect module mentions — only for explicitly directive or addressed references.
    // Casual compound phrases like "atlas planning" or "my finances" are not
    // treated as agent mentions; they don't imply the user is addressing the module.
    const delegatePattern = /\b(?:delegate|hand\s*off|transfer|pass)\s+(?:to\s+)?/i;
    const consultPattern = /\b(?:ask|check\s+with|consult)\s+/i;
    for (const mod of CommandIntelligenceServiceJs.MODULES) {
      const modPattern = new RegExp(`\\b${mod}\\b`, 'i');
      if (!modPattern.test(lower)) continue;
      // Direct address: module name at start of sentence or followed by comma ("Agnes, ...")
      const directAddressPattern = new RegExp(`(?:^|[.!?]\\s*)${mod}\\b[,!]?\\s`, 'i');
      const isDirectAddress = directAddressPattern.test(rawInput);
      if (delegatePattern.test(lower)) {
        mentions.push({ moduleId: mod, disposition: 'ownership', confidence: 0.9 });
      } else if (consultPattern.test(lower)) {
        mentions.push({ moduleId: mod, disposition: 'consultative', confidence: 0.9 });
      } else if (isDirectAddress) {
        // Direct address ("Atlas, plan my day") → reference: intent analysis
        // determines whether to keep in thread or allow routing
        mentions.push({ moduleId: mod, disposition: 'reference', confidence: 0.9 });
      }
      // Otherwise: no mention generated for casual/compound references
    }

    // Intent detection for planning keywords
    const INTENT_PATTERNS: Array<{ pattern: RegExp; type: string; verb: string; module: string; capabilities: string[] }> = [
      { pattern: /\bplan\s+(?:my\s+)?day\b/i, type: 'plan_day', verb: 'plan', module: 'atlas', capabilities: ['daily-planning'] },
      { pattern: /\bschedule\s+(.+?)(?:\bat\b|\bon\b)/i, type: 'schedule_item', verb: 'schedule', module: 'atlas', capabilities: ['daily-planning'] },
      { pattern: /\bupdate\s+(.+?)\s+to\s+rest\b/i, type: 'recovery_day', verb: 'update', module: 'atlas', capabilities: ['recovery-planning'] },
    ];

    const segments = rawInput.split(/,\s*/);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i].trim();
      for (const p of INTENT_PATTERNS) {
        if (p.pattern.test(seg)) {
          const match = seg.match(p.pattern);
          const entities: Record<string, unknown> = {};
          if (p.type === 'schedule_item' && match?.[1]) {
            entities.title = match[1].trim().toLowerCase();
          }
          if (p.type === 'recovery_day') {
            const baseDate = nowIso ? new Date(nowIso) : new Date();
            const tomorrow = new Date(baseDate.getTime() + 86400000);
            entities.flattenedUntil = tomorrow.toISOString().slice(0, 10) + 'T00:00:00.000Z';
            entities.reason = 'rest';
            entities.sourceSegment = seg;
          }
          intents.push({
            id: `intent-${i + 1}`,
            rawSegment: seg,
            intentType: p.type,
            verb: p.verb,
            mutatesState: true,
            confidence: 0.85,
            capabilities: p.capabilities,
            candidateModules: [p.module],
            routeHints: [{ moduleId: p.module, confidence: 0.9, reason: 'intent_match', source: 'command_intelligence' }],
            dependsOn: [],
            entities,
            temporal: [],
          });
          if (!sharedRouteHints.some((h: any) => h.moduleId === p.module)) {
            sharedRouteHints.push({ moduleId: p.module, confidence: 0.9, reason: 'planning intent', source: 'command_intelligence' });
          }
          break;
        }
      }
    }

    return j({
      rawInput,
      normalizedInput: rawInput,
      parserVersion: 'phase1-v1',
      parserMode: 'phase1',
      sourceModuleId,
      generatedAt: nowIso || new Date().toISOString(),
      timezone: timezone || 'UTC',
      confidence: intents.length > 0 ? 0.85 : 0.8,
      intents,
      temporalReferences: [],
      sharedRouteHints,
      mentions,
      mentionedModuleIds: mentions.map((m: any) => m.moduleId),
      requiresClarification: false,
      ambiguityReasons: [],
    });
  }
}

export class NexusRoutingServiceJs {
  private static KEYWORD_MAP: Record<string, { keywords: string[]; confidence: number }> = {
    agnes: { keywords: ['feel', 'emotion', 'anxious', 'anxiety', 'mood', 'relationship', 'stress', 'therapy', 'journal', 'sad', 'happy', 'angry', 'grief', 'trauma'], confidence: 0.72 },
    titan: { keywords: ['workout', 'training', 'exercise', 'gym', 'squat', 'bench', 'deadlift', 'muscle', 'sleep', 'recovery', 'run', 'cardio', 'lift'], confidence: 0.72 },
    ledger: { keywords: ['budget', 'finance', 'money', 'transaction', 'expense', 'income', 'savings', 'invest', 'bank', 'credit', 'debt', 'tax'], confidence: 0.72 },
    soma: { keywords: ['bloodwork', 'blood', 'medical', 'lab', 'hormone', 'health', 'doctor', 'prescription', 'supplement', 'symptom', 'diagnosis', 'menstrual'], confidence: 0.72 },
    atlas: { keywords: ['plan', 'schedule', 'task', 'habit', 'routine', 'calendar', 'deadline', 'focus', 'goal', 'prioritize'], confidence: 0.72 },
    forge: { keywords: ['code', 'refactor', 'typescript', 'programming', 'debug', 'deploy', 'api', 'module', 'compile', 'build'], confidence: 0.72 },
    scout: { keywords: ['research', 'search', 'verify', 'investigate', 'fact', 'source', 'find', 'look up', 'lookup', 'article'], confidence: 0.72 },
  };

  classifyIntent(rawInput: string) { return this.classifyIntentWithContext(rawInput, null as any); }

  classifyIntentFromParsedCommand(envelopeJson: string | null) {
    if (!envelopeJson) return null;
    const envelope = JSON.parse(envelopeJson);
    // Check for mentions with ownership/delegation disposition
    if (envelope.mentions?.length) {
      for (const m of envelope.mentions) {
        if (m.disposition === 'ownership' || m.disposition === 'delegation') {
          return j({ moduleId: m.moduleId, confidence: 0.9, rationale: `mention:ownership:${m.moduleId}` });
        }
        if (m.disposition === 'consultative') {
          return j({ moduleId: 'nexus', confidence: 0.85, rationale: `mention:consult:${m.moduleId}` });
        }
      }
    }
    // Check for route hints
    if (envelope.sharedRouteHints?.length) {
      const best = envelope.sharedRouteHints.sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      return j({ moduleId: best.moduleId, confidence: best.confidence ?? 0.85, rationale: `command:${best.reason || 'route_hint'}` });
    }
    // Check intent capabilities via agent registry
    if (envelope.intents?.length) {
      for (const intent of envelope.intents) {
        if (intent.routeHints?.length) {
          return j({ moduleId: intent.routeHints[0].moduleId, confidence: 0.85, rationale: `command:route_hint` });
        }
        if (intent.capabilities?.length) {
          const registry = new AgentRegistryJs();
          const providers = JSON.parse(registry.resolveProvidersForCapabilities(j(intent.capabilities), null as any));
          if (providers.length > 0) {
            return j({ moduleId: providers[0].moduleId, confidence: 0.8, rationale: `capability:${intent.capabilities[0]}` });
          }
        }
      }
    }
    return null;
  }

  classifyIntentWithContext(rawInput: string, _contextJson: string | null) {
    // Keyword-only routing — parsed command intelligence is handled by classifyIntentFromParsedCommand
    const lower = rawInput.toLowerCase();
    for (const [moduleId, { keywords, confidence }] of Object.entries(NexusRoutingServiceJs.KEYWORD_MAP)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return j({ moduleId, confidence, rationale: `matched:${moduleId}` });
      }
    }
    return j({ moduleId: 'nexus', confidence: 0.45, rationale: 'default_nexus' });
  }

  buildRouterPrompt() { return 'You are the nexus router.'; }
  parseRoutingResponse(_responseText: string) { return j({ moduleId: 'nexus', reason: 'fallback' }); }
  getRoute(_moduleId: string) { return '/nexus'; }
}

export class NexusActionDispatchServiceJs {
  private static DETERMINISTIC_ACTIONS: Record<string, string[]> = {
    atlas: ['schedule_block', 'create_habit', 'update_routine', 'plan_day', 'flatten_load', 'flatten_schedule'],
    titan: ['log_workout', 'log_sleep', 'update_nsv'],
    ledger: ['record_transaction', 'categorize_transaction'],
    scout: ['web_search', 'deep_research', 'commit_research'],
  };
  canDispatchDeterministically(moduleId: string, actionType: string) {
    return (NexusActionDispatchServiceJs.DETERMINISTIC_ACTIONS[moduleId] ?? []).includes(actionType);
  }
  resolveDispatchNode(_planJson: string) { return j({ moduleId: 'nexus', actionType: 'none', payload: {} }); }
}

export class NexusDispatchExecutionServiceJs {
  canExecutePacketDeterministically(_packetJson: string) { return true; }
  buildExecutionSummary(packetJson: string, resultsJson: string) {
    const packet = JSON.parse(packetJson);
    const results: any[] = JSON.parse(resultsJson || '[]');
    const executed = results.filter((r: any) => r.status === 'executed');
    const nodeMap = new Map<string, any>();
    for (const n of (packet.nodes || [])) nodeMap.set(n.id, n);
    const labels = executed.map((r: any) => nodeMap.get(r.nodeId)?.label || r.sourceActionType || 'action');
    return `Executed ${executed.length} planned actions: ${labels.join(', ')}.`;
  }
  buildRetryPacket(packetJson: string, resultsJson: string) {
    const packet = JSON.parse(packetJson);
    const results: any[] = JSON.parse(resultsJson || '[]');
    const failedOrBlocked = results.filter((r: any) => r.status === 'failed' || r.status === 'blocked_by_dependency');
    if (failedOrBlocked.length === 0) return null;
    const failedNodeIds = new Set(failedOrBlocked.map((r: any) => r.nodeId));
    const retryNodes = (packet.nodes || []).filter((n: any) => failedNodeIds.has(n.id));
    const retryDispatchPlan = (packet.dispatchPlan || []).filter((n: any) => failedNodeIds.has(n.nodeId));
    const retryAttempt = (packet.retryAttempt ?? 0) + 1;
    const basePlanId = packet.planId.replace(/\.retry\.\d+$/, '');
    const retryOfPlanId = packet.retryOfPlanId || basePlanId;
    const retryPlanId = `${basePlanId}.retry.${retryAttempt}`;
    const retryTitle = packet.title ? packet.title.replace(/\(retry \d+\)/, `(retry ${retryAttempt})`).replace(/^(.+?)$/, (t: string) => t.includes('(retry') ? t : t) : packet.title;
    const updatedTitle = retryTitle && retryTitle.includes('(retry') ? retryTitle : (packet.title ? `${packet.title} (retry ${retryAttempt})` : packet.title);
    return j({ ...packet, planId: retryPlanId, retryOfPlanId, title: updatedTitle, summary: `Retry attempt ${retryAttempt} for ${failedOrBlocked.length} blocked or failed node from ${packet.title?.replace(/ \(retry \d+\)/, '') || 'plan'}.`, nodes: retryNodes, dispatchPlan: retryDispatchPlan, retryAttempt, retryLineage: [...(packet.retryLineage || []), packet.planId] });
  }
  buildExecutionArtifacts(packetJson: string, resultsJson: string, timestamp: string, retryPacketJson?: string | null, retryPrompt?: string | null) {
    const packet = JSON.parse(packetJson);
    const results: any[] = JSON.parse(resultsJson || '[]');
    const nodeMap = new Map<string, any>();
    for (const n of (packet.nodes || [])) nodeMap.set(n.id, n);
    const failedOrBlocked = results.filter((r: any) => r.status === 'failed' || r.status === 'blocked_by_dependency');
    const isRetry = !!packet.retryOfPlanId || (packet.retryAttempt ?? 0) > 0;
    const retryPacket = retryPacketJson ? JSON.parse(retryPacketJson) : null;

    const artifacts: any[] = results.map((r: any) => {
      const node = nodeMap.get(r.nodeId);
      const label = node?.label || r.sourceActionType || 'action';
      const isExecuted = r.status === 'executed';
      const isFailed = r.status === 'failed' || r.status === 'blocked_by_dependency';
      const mappedStatus = isExecuted ? 'executed' : r.status === 'blocked_by_dependency' ? 'blocked' : 'failed';
      let summary: string;
      if (isRetry && isExecuted) {
        summary = `${label} executed on retry attempt ${packet.retryAttempt}.`;
      } else {
        summary = `${label} ${mappedStatus}.`;
      }

      const artifact: any = {
        id: `${packet.planId}.${r.nodeId}.execution`,
        threadId: packet.sourceThreadId || null,
        sourceModuleId: r.targetModuleId || 'nexus',
        actionType: r.resolvedActionType || r.sourceActionType || '',
        proposalId: packet.planId || '',
        executionId: `${packet.planId}.${r.nodeId}.execution`,
        requestedAt: timestamp,
        resolvedAt: timestamp,
        status: mappedStatus,
        summary,
        patientScope: 'USER',
        errorMessage: r.reason || null,
      };

      if (isRetry) {
        artifact.retryOfPlanId = packet.retryOfPlanId;
        artifact.retryAttempt = packet.retryAttempt;
        artifact.retryParentExecutionId = `${packet.retryOfPlanId}.${r.nodeId}.execution`;
        artifact.retryable = false;
      } else if (isFailed && retryPacket) {
        const retryAttempt = retryPacket.retryAttempt ?? 1;
        artifact.retryable = true;
        artifact.retrySummary = `Retry attempt ${retryAttempt} available.`;
        artifact.retryVisibleContent = `Retry attempt ${retryAttempt} for ${failedOrBlocked.length} blocked or failed node from ${packet.title}.`;
        artifact.retryOfPlanId = null;
        artifact.retryAttempt = null;
        artifact.retryPrompt = retryPrompt || null;
      } else {
        artifact.retryable = false;
      }

      return artifact;
    });

    return j(artifacts);
  }
  detectDependencyCycles(_planJson: string) { return []; }
}

export class NexusActionPlannerServiceJs {
  buildNode(intentJson: string, actionType: string | null, targetModuleId: string, supportingModuleIdsJson: string) {
    const intent = JSON.parse(intentJson);
    const supportingModuleIds = JSON.parse(supportingModuleIdsJson || '[]');
    const resolvedActionType = actionType || 'propose_draft';
    return j({
      id: `node-${intent.id || Date.now()}`,
      intentId: intent.id || '',
      intentType: intent.intentType || '',
      label: intent.verb ? `${intent.verb} ${intent.rawSegment?.split(' ').slice(1, 4).join(' ') || ''}`.trim() : intent.rawSegment || '',
      summary: intent.rawSegment || '',
      targetModuleId,
      supportingModuleIds,
      actionType: resolvedActionType,
      mutatesState: intent.mutatesState ?? true,
      canRunInParallel: (intent.dependsOn || []).length === 0,
      dependsOn: intent.dependsOn || [],
      payload: intent.entities || {},
    });
  }
  shouldEnrichWithScout(intentType: string, _targetModuleId: string, _supportingJson: string) {
    return intentType === 'research' || intentType === 'verify' || intentType === 'investigate';
  }
  isDraftActionType(actionType: string) { return actionType === 'propose_draft'; }
  getSemanticInput(rawInput: string) { return rawInput; }
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

const WRITE_PERMISSIONS: Record<string, string[]> = {
  agnes: ['emotional.emotionalResilience', 'emotional.stressLoad', 'emotional.moodTrend', 'emotional.traumaMarkers'],
  titan: ['biological.cnsFatigue', 'biological.sleepQuality', 'biological.recoveryScore', 'biological.hormonalContext'],
  atlas: ['cognitive.focusScore', 'cognitive.activeLoad', 'cognitive.planningLoad', 'cognitive.energyBudget', 'cognitive.taskCompletionRate', 'planning.streakHealth', 'planning.deadlinePressure', 'planning.reflectionStreak', 'planning.goalAlignment', 'planning.habitMomentum'],
  soma: ['biological.hormonalContext'],
  ledger: ['resource.financialFriction', 'resource.resonanceROI'],
  scout: ['cognitive.researchLoad', 'cognitive.interestDiversity'],
  nexus: [],
  forge: [],
  bridge: [],
};

const ALL_METRICS = Object.values(WRITE_PERMISSIONS).flat();

const READ_PERMISSIONS: Record<string, string[]> = {
  agnes: [...WRITE_PERMISSIONS.agnes, 'biological.sleepQuality', 'biological.recoveryScore', 'cognitive.focusScore', 'cognitive.energyBudget', 'planning.streakHealth'],
  titan: [...WRITE_PERMISSIONS.titan, 'cognitive.energyBudget', 'cognitive.focusScore', 'planning.streakHealth'],
  atlas: [...WRITE_PERMISSIONS.atlas, 'biological.cnsFatigue', 'biological.sleepQuality', 'emotional.stressLoad', 'resource.financialFriction'],
  soma: [...WRITE_PERMISSIONS.soma, 'emotional.emotionalResilience', 'emotional.stressLoad', 'biological.sleepQuality', 'biological.recoveryScore'],
  ledger: [...WRITE_PERMISSIONS.ledger, 'planning.deadlinePressure', 'cognitive.activeLoad'],
  scout: [...WRITE_PERMISSIONS.scout, 'cognitive.focusScore', 'cognitive.activeLoad'],
  nexus: ALL_METRICS,
  forge: ['biological.cnsFatigue', 'biological.sleepQuality', 'cognitive.activeLoad', 'cognitive.focusScore', 'cognitive.energyBudget'],
  bridge: [],
};

export class NsvOwnershipServiceJs {
  getWritableMetrics(moduleId: string) { return WRITE_PERMISSIONS[moduleId] || []; }
  getReadableMetrics(moduleId: string) { return READ_PERMISSIONS[moduleId] || []; }
  getMetricOwner(metric: string) {
    for (const [mod, metrics] of Object.entries(WRITE_PERMISSIONS)) {
      if (metrics.includes(metric)) return mod;
    }
    return 'nexus';
  }
  getMetricOwners(metric: string) {
    const owners: string[] = [];
    for (const [mod, metrics] of Object.entries(WRITE_PERMISSIONS)) {
      if (metrics.includes(metric)) owners.push(mod);
    }
    return owners.length ? owners : ['nexus'];
  }
  isExclusiveOwner(moduleId: string, metric: string) {
    const owners = this.getMetricOwners(metric);
    return owners.length === 1 && owners[0] === moduleId;
  }
  ownsMetric(moduleId: string, metric: string) {
    return (WRITE_PERMISSIONS[moduleId] || []).includes(metric);
  }
  getCoOwnedMetricsInPatch(moduleId: string, patchJson: string) {
    const patch = JSON.parse(patchJson);
    const results: string[] = [];
    for (const [domain, values] of Object.entries(patch)) {
      if (typeof values !== 'object' || !values) continue;
      for (const key of Object.keys(values as Record<string, unknown>)) {
        const metric = `${domain}.${key}`;
        const owners = this.getMetricOwners(metric);
        if (owners.length > 1 && owners.includes(moduleId)) results.push(metric);
      }
    }
    return results;
  }
  getDerivedMetrics() { return []; }
  getCalibrationPrompt(metric: string) { return `Calibrate ${metric}`; }
  buildCalibrationPrompt(moduleId: string) {
    const metrics = WRITE_PERMISSIONS[moduleId] || [];
    if (metrics.length > 0) {
      const hints = metrics.map((m: string) => m.split('.').pop()).filter(Boolean);
      return `Calibration required for ${moduleId}: assess the user's current ${hints.includes('emotionalResilience') ? 'resilient ' : ''}state across ${hints.join(', ')}.`;
    }
    return `Calibration required for ${moduleId}: missing vital metrics. Engage the user to establish baseline readings.`;
  }
  filterNsvForModule(nsvJson: string, moduleId: string) {
    const nsv = JSON.parse(nsvJson);
    const readable = new Set(READ_PERMISSIONS[moduleId] || []);
    const isFullAccess = moduleId === 'nexus';
    const DOMAIN_KEYS = ['biological', 'emotional', 'cognitive', 'planning', 'resource'];
    const result: Record<string, any> = {};
    for (const domain of DOMAIN_KEYS) {
      const src = nsv[domain];
      if (!src || typeof src !== 'object') { result[domain] = {}; continue; }
      const filtered: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(src)) {
        if (isFullAccess || readable.has(`${domain}.${key}`)) filtered[key] = val;
        else filtered[key] = null;
      }
      result[domain] = filtered;
    }
    // Handle lastUpdated — only keep entries for readable metrics
    if (nsv.lastUpdated && typeof nsv.lastUpdated === 'object') {
      const filteredLU: Record<string, unknown> = {};
      for (const [metricPath, ts] of Object.entries(nsv.lastUpdated)) {
        if (isFullAccess || readable.has(metricPath)) filteredLU[metricPath] = ts;
      }
      result.lastUpdated = filteredLU;
    } else {
      result.lastUpdated = {};
    }
    // Carry over top-level flat aliases
    for (const key of Object.keys(nsv)) {
      if (!DOMAIN_KEYS.includes(key) && key !== 'lastUpdated' && !result.hasOwnProperty(key)) {
        result[key] = nsv[key];
      }
    }
    return j(result);
  }
  filterWritePatch(moduleId: string, patchJson: string) {
    const patch = JSON.parse(patchJson);
    const writable = new Set(WRITE_PERMISSIONS[moduleId] || []);
    const result: Record<string, Record<string, unknown>> = {};
    for (const [domain, values] of Object.entries(patch)) {
      if (typeof values !== 'object' || !values) continue;
      const filtered: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(values as Record<string, unknown>)) {
        if (writable.has(`${domain}.${key}`)) filtered[key] = val;
      }
      if (Object.keys(filtered).length > 0) result[domain] = filtered;
    }
    return j(result);
  }
  isMetricStale(lastUpdated: string | null, thresholdDays: number, nowMs: number) {
    if (!lastUpdated) return true;
    const lastMs = new Date(lastUpdated).getTime();
    if (isNaN(lastMs)) return true;
    return (nowMs - lastMs) > thresholdDays * 86400000;
  }
}

export class NeuralStateVectorJs {
  private _json: string;
  constructor(json?: string) { this._json = json || '{}'; }
  toJson() { return this._json; }
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
  private _resolve(nsvJs: any): Record<string, any> {
    try { return typeof nsvJs?.toJson === 'function' ? JSON.parse(nsvJs.toJson()) : {}; }
    catch { return {}; }
  }
  private _calc(nsv: Record<string, any>) {
    const er = nsv.emotional?.emotionalResilience;
    const resilience = typeof er === 'number' ? Math.round(er / 10 * 10) / 10 : null;
    const al = nsv.cognitive?.activeLoad ?? null;
    const pl = nsv.cognitive?.planningLoad ?? null;
    const bandwidth = (typeof al === 'number' && typeof pl === 'number')
      ? Math.round((1 - (al + pl) / 20) * 10) / 10 : null;
    const cns = nsv.biological?.cnsFatigue;
    const sleep = nsv.biological?.sleepQuality;
    const rec = nsv.biological?.recoveryScore;
    const vitality = (typeof cns === 'number' && typeof sleep === 'number')
      ? Math.round(((10 - cns) / 10 * 0.4 + sleep / 10 * 0.3 + ((rec ?? 5) / 10) * 0.3) * 10) / 10
      : null;
    const tcr = nsv.cognitive?.taskCompletionRate;
    const streak = nsv.planning?.streakHealth;
    const focus = nsv.cognitive?.focusScore;
    const output = (typeof tcr === 'number')
      ? Math.round((tcr * 0.5 + ((streak ?? 5) / 10) * 0.3 + ((focus ?? 5) / 10) * 0.2) * 10) / 10
      : null;
    const ff = nsv.resource?.financialFriction;
    const friction = typeof ff === 'number' ? Math.round(ff / 10 * 10) / 10 : null;
    return { resilience, bandwidth, vitality, output, friction };
  }
  calculate(nsvJson: string) { return j(this._calc(JSON.parse(nsvJson))); }
  selectResilience(nsvJs: any) { return this._calc(this._resolve(nsvJs)).resilience; }
  selectBandwidth(nsvJs: any) { return this._calc(this._resolve(nsvJs)).bandwidth; }
  selectVitality(nsvJs: any) { return this._calc(this._resolve(nsvJs)).vitality; }
  selectOutput(nsvJs: any) { return this._calc(this._resolve(nsvJs)).output; }
  selectFriction(nsvJs: any) { return this._calc(this._resolve(nsvJs)).friction; }
  getSnapshot(nsvJs: any) { return this._calc(this._resolve(nsvJs)); }
  getBreakdown(nsvJs: any) {
    const nsv = this._resolve(nsvJs);
    const v = this._calc(nsv);
    return [
      { vector: 'resilience', value: v.resilience, inputs: [{ key: 'emotionalResilience', value: nsv.emotional?.emotionalResilience ?? 0 }], notes: [] },
      { vector: 'bandwidth', value: v.bandwidth, inputs: [{ key: 'activeLoad', value: nsv.cognitive?.activeLoad ?? 0 }, { key: 'planningLoad', value: nsv.cognitive?.planningLoad ?? 0 }], notes: [] },
      { vector: 'vitality', value: v.vitality, inputs: [{ key: 'cnsFatigue', value: nsv.biological?.cnsFatigue ?? 0 }, { key: 'sleepQuality', value: nsv.biological?.sleepQuality ?? 0 }], notes: [] },
      { vector: 'output', value: v.output, inputs: [{ key: 'taskCompletionRate', value: nsv.cognitive?.taskCompletionRate ?? 0 }], notes: ['compatibility aggregate: taskCompletionRate drives this vector'] },
      { vector: 'friction', value: v.friction, inputs: [{ key: 'financialFriction', value: nsv.resource?.financialFriction ?? 0 }], notes: ['compatibility aggregate: financialFriction drives this vector'] },
    ];
  }
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
  truncateText(value: string, maxChars: number) { return value.slice(0, maxChars); }
  composeBoundedContext(title: string, identityJson: string | null, nsvBlock: string | null, insightsJson: string | null, extensionBlock: string | null, maxChars: number, minNsvChars: number) {
    const identity = identityJson ? JSON.parse(identityJson) as string[] : [];
    const insights = insightsJson ? JSON.parse(insightsJson) as string[] : [];
    // Priority: title → identity → nsv (up to minNsvChars minimum) → insights → extension
    const parts: string[] = [title];
    if (identity.length > 0) parts.push(identity.join('\n'));
    let remaining = maxChars - parts.join('\n\n').length;
    if (nsvBlock && remaining > 0) {
      const nsvBudget = Math.max(minNsvChars, Math.min(remaining - 100, nsvBlock.length));
      parts.push(nsvBlock.slice(0, nsvBudget));
      remaining = maxChars - parts.join('\n\n').length;
    }
    if (insights.length > 0 && remaining > 50) {
      let insightText = '';
      for (const line of insights) {
        if (insightText.length + line.length + 1 > remaining - 20) break;
        insightText += (insightText ? '\n' : '') + line;
      }
      if (insightText) parts.push(insightText);
      remaining = maxChars - parts.join('\n\n').length;
    }
    if (extensionBlock && remaining > 50) {
      parts.push(extensionBlock.slice(0, remaining - 10));
    }
    const output = parts.join('\n\n');
    return output.length > maxChars ? output.slice(0, maxChars) : output;
  }
}

// ─── Agent System ───────────────────────────────────────────────────────────

export class ActionCapabilityResolverJs {
  resolve(actionType: string) {
    const map: Record<string, string[]> = {
      create_habit: ['habit-management'], update_focus_score: ['focus-tracking'], update_routine: ['routine-management'],
      daily_plan: ['daily-planning'], schedule_block: ['daily-planning'], flatten_schedule: ['daily-planning'],
      record_transaction: ['transaction-recording'], categorize_transaction: ['transaction-recording'],
      log_workout: ['workout-logging'], log_sleep: ['sleep-tracking'], update_nsv: ['recovery-tracking'],
      web_search: ['web-search'], deep_research: ['deep-research'], query_knowledge: ['knowledge-management'],
      journal_entry: ['journaling'], mood_check: ['mood-tracking'],
    };
    return map[actionType] || [];
  }
}

const BUILT_IN_PROVIDERS = [
  { moduleId: 'atlas', capabilities: ['daily-planning', 'habit-management', 'routine-management', 'task-management', 'focus-tracking', 'recovery-planning'] },
  { moduleId: 'titan', capabilities: ['workout-logging', 'sleep-tracking', 'recovery-tracking', 'nutrition-tracking'] },
  { moduleId: 'ledger', capabilities: ['transaction-recording', 'budget-management', 'financial-analysis'] },
  { moduleId: 'scout', capabilities: ['web-search', 'deep-research', 'knowledge-management', 'research'] },
  { moduleId: 'agnes', capabilities: ['journaling', 'mood-tracking', 'therapeutic-support', 'recovery-planning'] },
  { moduleId: 'soma', capabilities: ['body-awareness', 'somatic-tracking', 'recovery-planning'] },
];

export class AgentRegistryJs {
  private _providers = [...BUILT_IN_PROVIDERS];
  listProviders() { return j(this._providers); }
  getProviderByModule(moduleId: string) {
    const p = this._providers.find((p) => p.moduleId === moduleId);
    return p ? j(p) : null;
  }
  registerProvider(providerJson: string) {
    const p = JSON.parse(providerJson);
    const idx = this._providers.findIndex((x) => x.moduleId === p.moduleId);
    if (idx >= 0) this._providers[idx] = p;
    else this._providers.push(p);
  }
  getCapabilitiesForModule(moduleId: string) {
    return this._providers.find((p) => p.moduleId === moduleId)?.capabilities || [];
  }
  getProvidersForCapability(capability: string, preferredJson: string) {
    const preferred = preferredJson ? JSON.parse(preferredJson) : [];
    const matches = this._providers.filter((p) => p.capabilities.includes(capability));
    matches.sort((a, b) => {
      const aP = preferred.includes(a.moduleId) ? -1 : 0;
      const bP = preferred.includes(b.moduleId) ? -1 : 0;
      return aP - bP;
    });
    return j(matches);
  }
  resolveProvidersForCapabilities(capabilitiesJson: string, preferredJson: string | null) {
    const capabilities: string[] = JSON.parse(capabilitiesJson);
    const preferred: string[] = preferredJson ? JSON.parse(preferredJson) : [];
    const seen = new Set<string>();
    const result: any[] = [];
    for (const cap of capabilities) {
      const matches = this._providers.filter((p) => p.capabilities.includes(cap));
      for (const m of matches) {
        if (!seen.has(m.moduleId)) { seen.add(m.moduleId); result.push(m); }
      }
    }
    if (preferred.length > 0) {
      result.sort((a, b) => {
        const aI = preferred.indexOf(a.moduleId);
        const bI = preferred.indexOf(b.moduleId);
        const aP = aI >= 0 ? aI : preferred.length;
        const bP = bI >= 0 ? bI : preferred.length;
        return aP - bP;
      });
    }
    return j(result);
  }
  resolvePrimaryProvider(capabilitiesJson: string, preferredJson: string | null) {
    const providers = JSON.parse(this.resolveProvidersForCapabilities(capabilitiesJson, preferredJson));
    return providers.length > 0 ? j(providers[0]) : null;
  }
  resolveActionAlias(moduleId: string, actionType: string) {
    const ALIAS_MAP: Record<string, Record<string, string>> = {
      atlas: { schedule_item: 'schedule_block', recovery_day: 'flatten_load' },
    };
    return ALIAS_MAP[moduleId]?.[actionType] ?? actionType;
  }
  resetForTests() { this._providers = [...BUILT_IN_PROVIDERS]; }
}

// ─── Spine & Flow ───────────────────────────────────────────────────────────

export class FlowContractsJs {
  createFlowMeta(source: string, flowId: string | null) {
    return j({ flowId: flowId ?? `flow-${Date.now()}`, originId: source, schemaVersion: 1 });
  }
  deriveReadinessLevel(score: number | null) {
    if (score === null) return '';
    if (score < 40) return 'critical';
    if (score < 60) return 'poor';
    if (score < 80) return 'fair';
    if (score < 90) return 'good';
    return 'optimal';
  }
  resolveReadinessScore(dataJson: string | null) {
    if (!dataJson) return null;
    const d = JSON.parse(dataJson);
    return d.score ?? d.readinessScore ?? null;
  }
  isCriticalReadiness(dataJson: string | null) {
    if (!dataJson) return false;
    const d = JSON.parse(dataJson);
    if (d.level === 'critical' || d.level === 'poor') return true;
    const score = d.score ?? d.readinessScore ?? null;
    return typeof score === 'number' && score < 60;
  }
  isPhysicalCommitmentMissed(domain: string, dataJson: string | null) {
    if (domain === 'B') return true;
    if (!dataJson) return false;
    const d = JSON.parse(dataJson);
    if (d.impactDomain === 'physical') return true;
    if (Array.isArray(d.moduleAffinity) && d.moduleAffinity.includes('titan')) return true;
    return false;
  }
  isDelegationCompletionSignal(eventType: string, dataJson: string | null) {
    if (eventType === 'MODULE_PROFILE_UPDATED') return true;
    if (eventType !== 'MODULE_DELEGATED') return false;
    if (!dataJson) return false;
    const d = JSON.parse(dataJson);
    return d.status === 'completed' || d.reason === 'query_result';
  }
  parseDelegationTarget(eventJson: string) {
    const event = JSON.parse(eventJson);
    return event.target || null;
  }
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
  _name: string; _pronouns: string; _uid: string | null; _assignedSex: string | null;
  _alias: string; _agentGender: string; _displayNamesJson: string; _agentGendersJson: string;
  constructor(
    name?: string, pronouns?: string, uid?: string | null,
    assignedSex?: string | null, alias?: string, agentGender?: string,
    displayNamesJson?: string, agentGendersJson?: string,
  ) {
    this._name = name || 'User';
    this._pronouns = pronouns || 'they/them';
    this._uid = uid ?? null;
    this._assignedSex = assignedSex ?? null;
    this._alias = alias || 'Agent';
    this._agentGender = agentGender || 'neutral';
    this._displayNamesJson = displayNamesJson || '{}';
    this._agentGendersJson = agentGendersJson || '{}';
  }
}

export class PersonaFactoryJs {
  assemble(moduleId: string, baseRole: string, _identityJson: string, _moduleContextJson?: string) {
    return baseRole;
  }
  assembleWithContext(moduleId: string, identity: any, _nsv: any, moduleContextJson: string, _extra: any) {
    const ctx = moduleContextJson ? JSON.parse(moduleContextJson) : {};
    const base = ctx.baseRole || '';
    const name = identity?._name || 'User';
    const pronouns = identity?._pronouns || 'they/them';
    const alias = identity?._alias || moduleId;
    const sex = identity?._assignedSex || null;

    let prompt = base;
    prompt += `\n\n[IDENTITY_SYNC]\nYour Name: ${alias}\nUser Name: ${name}\nUser Pronouns: ${pronouns}\nYour Gender Personality: default`;

    if (sex === 'female') {
      prompt += `\n\n[BIOLOGICAL_CONTEXT]\nAssigned Sex: Female\nTrack menstrual-cycle-aware recommendations.`;
    }

    return prompt;
  }
}

export const PersonaPromptCatalogJs = class {
  getPrompt(_moduleId: string) { return ''; }
  getPersonaBlock(_moduleId: string) { return ''; }
  promptFor(_moduleId: string) { return ''; }
  orchestratorWelcome(name: string) { return `Welcome, ${name}.`; }
};

// ─── LLM Utilities ──────────────────────────────────────────────────────────

export class LlmSanitizerJs {
  sanitize(text: string, _retainSpacings?: boolean) {
    const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/gi;
    const openThoughtRegex = /<thought>([^<]*$)/i;
    let publicText = text;
    const parts: string[] = [];
    let isThinking = false;

    publicText = publicText.replace(thoughtRegex, (_m: string, c: string) => {
      parts.push(c.trim());
      return '';
    });

    const openMatch = publicText.match(openThoughtRegex);
    if (openMatch) {
      isThinking = true;
      publicText = publicText.replace(openThoughtRegex, '');
    }

    return {
      publicText: publicText.replace(/\s{2,}/g, ' ').trim(),
      internalThoughts: parts.length > 0 ? parts.join('\n') : null,
      isThinking,
      isActing: false,
      currentActionType: null,
    };
  }
  extractActions(_text: string) { return j([]); }
  extractMutations(_text: string) { return j([]); }
  sanitizeAndExtract(text: string) { return j({ text, actions: [], mutations: [] }); }
  stripProviderControlTokens(content: string) {
    if (!content) return '';
    return content.replace(/\[user interrupted\]/gi, '').trim();
  }
  isProviderControlOnly(content: string) {
    if (!content || !content.trim()) return false;
    const stripped = content.replace(/\[user interrupted\]/gi, '').trim();
    return stripped.length === 0;
  }
  stripTechnicalFiller(text: string) { return text; }
  stripPartialLeadingTag(text: string) { return text; }
  parseMutations(_content: string) { return []; }
  stripMutationTags(content: string) { return content; }
  sanitizeJsonPayload(content: string) {
    if (!content) return '';
    let s = content.trim();
    // Strip markdown code fences
    s = s.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/g, '$1').trim();
    // Strip AI prefixes
    s = s.replace(/^(?:JSON|Payload|Here is the JSON|Sure[,!]? here'?s?(?: the)?(?: JSON)?)\s*:\s*/i, '');
    // Fix trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    return s.trim();
  }
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
  private static REGISTERED: Record<string, Set<string>> = {
    titan: new Set(['log_sleep', 'log_workout', 'update_exercise_library']),
    atlas: new Set(['log_sleep', 'daily_plan', 'schedule_block', 'flatten_schedule']),
    ledger: new Set(['record_transaction', 'update_budget', 'categorize_transaction']),
  };
  constructor(..._args: unknown[]) {}
  isRegistered(moduleId: string, actionType: string): boolean {
    return ActionHubJs.REGISTERED[moduleId]?.has(actionType) ?? false;
  }
  execute(moduleId: string, actionType: string, _payloadJson: string, _userId: string | null, _onComplete: (handled: boolean) => void, _onError: (err: string) => void) {
    const handled = ActionHubJs.REGISTERED[moduleId]?.has(actionType) ?? false;
    _onComplete(handled);
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
  computeDashboardMetrics(_txJson: string, _totalDebt: number, _accountsJson: string, _nowMs: number) { return j({ currentMonthIncome: 0, currentMonthExpenses: 0, currentMonthNet: 0, totalBalance: 0, totalDebt: 0, averageMonthlyExpenses: 0, savingsRate: null, topSpendCategory: null, hasTransactions: false }); }
  computeRunwayProjection(profileJson: string, _nowMs: number) {
    const p = JSON.parse(profileJson);
    const monthlyIncome = p.monthlyIncome ?? 0;
    const fixedTotal = (p.fixedExpenses ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
    const variableTotal = (p.variableExpenses ?? []).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
    const debtMinPayments = (p.debtItems ?? []).reduce((s: number, d: any) => s + (d.minPayment ?? 0), 0);
    const monthlyExpenseBaseline = fixedTotal + variableTotal + debtMinPayments;
    const monthlyBuffer = monthlyIncome - monthlyExpenseBaseline;
    const monthlyBurn = monthlyBuffer < 0 ? Math.abs(monthlyBuffer) : 0;
    const txs = p.transactions ?? [];
    const incomeFromTx = txs.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + (t.amount ?? 0), 0);
    const expenseFromTx = txs.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + (t.amount ?? 0), 0);
    const ledgerBalance = incomeFromTx - expenseFromTx;
    const reserveSavings = (p.savingsGoals ?? []).reduce((s: number, g: any) => s + (g.currentAmount ?? 0), 0);
    const modeledLiquidity = ledgerBalance + reserveSavings;
    const hasTx = txs.length > 0;
    const source = hasTx ? (monthlyIncome > 0 ? 'profile+transactions' : 'transactions') : 'profile';
    let monthsRemaining: number | null = null;
    let daysRemaining: number | null = null;
    let status: string = 'needs_data';
    if (monthlyBurn > 0) {
      monthsRemaining = Math.round(modeledLiquidity / monthlyBurn * 100) / 100;
      daysRemaining = Math.round(monthsRemaining * 30.44);
      status = monthsRemaining <= 1 ? 'critical' : monthsRemaining <= 3 ? 'depleted' : monthsRemaining <= 6 ? 'watch' : 'healthy';
    } else {
      status = 'stable';
    }
    return j({ source, modeledLiquidity, ledgerBalance, reserveSavings, monthlyIncome, monthlyExpenseBaseline, monthlyBurn, monthlyBuffer, monthsRemaining, daysRemaining, status });
  }
  computeDebtPayoffSchedule(_debtJson: string, _strategy: string, _extraPayment: number) { return j({ strategy: 'avalanche', months: [], totalInterestPaid: 0, monthsToPayoff: 0, interestSavedVsMinimum: 0 }); }
  evaluateAlerts(_profileJson: string, _budgetJson: string, _metricsJson: string, _nowMs: number) { return j([]); }
  computeSavingsProjection(_goalJson: string, _nowMs: number) { return j({ goalId: '', monthsToTarget: null, projectedCompletionDate: null, onTrack: true, monthlyRequired: 0, surplusOrDeficit: 0 }); }
}
export class ForecastAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class InsuranceAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class NetWorthAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class PortfolioAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class SubscriptionAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class TaxAggregationJs { compute(_json: string) { return noopAggregation(); } }
export class TransactionAggregationJs {
  compute(_json: string) { return noopAggregation(); }
  computeMonthlyTotals(_transactionsJson: string, months: number, _nowMs: number) {
    const result = [];
    const now = new Date(_nowMs || Date.now());
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, income: 0, expenses: 0, net: 0 });
    }
    return j(result);
  }
}

export class LedgerAggregationUtilsJs {
  parseCurrency(_text: string) { return 0; }
  formatCurrency(_amount: number) { return '$0.00'; }
  buildFrictionScore(_json: string) { return j({ score: 0, factors: [] }); }
  epochMsToYearMonth(nowMs: number) {
    const d = new Date(nowMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  getMonthBounds(month: string) {
    const [year, mon] = month.split('-').map(Number);
    const start = `${year}-${String(mon).padStart(2, '0')}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return j({ start, end });
  }
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
  computeFinancialFriction(_profileJson: string) { return 0.3; }
  verifyCoherence(_profileJson: string) { return j({ coherent: true, issues: [] }); }
  computeNsvFinancialPatch(_profileJson: string) { return j({ financialFriction: 3, energyBudget: 5 }); }
  computeResonanceROI(_profileJson: string) { return j({ resonanceROI: 0.7, financialFriction: 3, frictionTier: 'LOW', analysis: '' }); }
  categorizeTax(_expenseJson: string) { return 'unknown'; }
  calculateBehavioralROI(_itemJson: string, _usageFrequency: number) { return 5.0; }
  estimateUsageFrequency(_itemJson: string) { return 4.0; }
  planDebtSnowball(_debtsJson: string, _extraBudget: number) { return j([]); }
  projectSavingsGoal(goalJson: string) {
    const g = JSON.parse(goalJson);
    return j({ goalId: g.id ?? '', label: g.name ?? '', targetAmount: g.targetAmount ?? 0, currentBalance: g.currentBalance ?? 0, monthlyContribution: g.monthlyContribution ?? 0, monthsToGoal: 12, achieveByDate: new Date(Date.now() + 365*86400000).toISOString().slice(0,10), confidenceBand: { optimistic: 11, base: 12, pessimistic: 14 }, percentComplete: 0 });
  }
  estimateQuarterlyTax(_monthlyIncome: number, _monthlyDeductibles: number) { return j({ estimatedLiability: 0, nextDeadline: new Date().getFullYear() + '-04-15' }); }
  suggestTaxOptimizations(_expensesJson: string) { return j([]); }
  analyzeProfile(_profileJson: string, _savingsContributionsJson: string) { return j({ categorizedExpenses: [], ytdDeductibleTotal: 0, estimatedTaxSaving: 0, roiScores: [], debtSnowballPlan: [], savingsProjections: [] }); }
}

// ─── Titan ──────────────────────────────────────────────────────────────────

export class E1rmServiceJs {
  calculate(weight: number, reps: number) { return this.calculateE1RM(weight, reps); }
  calculateE1RM(weight: number, reps: number) {
    if (reps <= 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }
  calculateFromJson(json: string) {
    const d = JSON.parse(json);
    return j({ e1rm: this.calculateE1RM(d.weight ?? 0, d.reps ?? 1), formula: 'epley' });
  }
  computeSessionPRs(setsJson: string, existingPRsJson: string) {
    const sets: Array<{ exerciseName: string; weightKg: number; reps: number }> = JSON.parse(setsJson);
    const existingPRs: Record<string, number> = JSON.parse(existingPRsJson);
    const updatedPRs = { ...existingPRs };
    const bestByExercise = new Map<string, { e1rm: number; name: string }>();
    for (const s of sets) {
      const key = s.exerciseName.toLowerCase();
      const e1rm = this.calculateE1RM(s.weightKg, s.reps);
      const current = bestByExercise.get(key);
      if (!current || e1rm > current.e1rm) bestByExercise.set(key, { e1rm, name: s.exerciseName });
    }
    const results: Array<{ exerciseName: string; isNewPR: boolean; previousE1RM: number | null; newE1RM: number }> = [];
    for (const [key, best] of bestByExercise) {
      const prev = existingPRs[key] ?? null;
      const isNewPR = prev === null || best.e1rm > prev;
      results.push({ exerciseName: best.name, isNewPR, previousE1RM: prev === undefined ? null : prev, newE1RM: best.e1rm });
      if (isNewPR) updatedPRs[key] = best.e1rm;
    }
    return j({ updatedPRs, results });
  }
  getBestE1RM(exercisesJson: string, exerciseId: string) {
    const arr: Array<{ exerciseId: string; e1RM: number }> = JSON.parse(exercisesJson);
    const match = arr.filter((r) => r.exerciseId === exerciseId);
    return match.length > 0 ? Math.max(...match.map((r) => r.e1RM)) : -1.0;
  }
}

export class ExerciseLibraryJs {
  getExercise(name: string) { return j({ name, muscleGroup: 'unknown', equipment: 'none' }); }
  search(_query: string) { return j([]); }
  getAll() { return j([]); }
}

export class RecoveryTemplatesJs {
  getTemplate(type: string) { return j({ type, activities: [], durationMinutes: 30 }); }
  getAll() { return j([]); }
}

export class QuickLogParserJs {
  private static EXERCISE_ALIASES: Record<string, { id: string; name: string }> = {
    squat: { id: 'squat', name: 'Barbell Back Squat' },
    'back squat': { id: 'squat', name: 'Barbell Back Squat' },
    bench: { id: 'bench_press', name: 'Bench Press' },
    'bench press': { id: 'bench_press', name: 'Bench Press' },
    deadlift: { id: 'deadlift', name: 'Deadlift' },
    rdl: { id: 'rdl', name: 'Romanian Deadlift' },
    'romanian deadlift': { id: 'rdl', name: 'Romanian Deadlift' },
    ohp: { id: 'ohp', name: 'Overhead Press' },
    'overhead press': { id: 'ohp', name: 'Overhead Press' },
    'bb row': { id: 'barbell_row', name: 'Barbell Row' },
    'barbell row': { id: 'barbell_row', name: 'Barbell Row' },
    pullup: { id: 'pull_up', name: 'Pull Up' },
    'pull up': { id: 'pull_up', name: 'Pull Up' },
    'pull-up': { id: 'pull_up', name: 'Pull Up' },
    row: { id: 'barbell_row', name: 'Barbell Row' },
    curl: { id: 'curl', name: 'Bicep Curl' },
    dip: { id: 'dip', name: 'Dip' },
  };

  private resolveExercise(raw: string): { id: string | null; name: string; isNew: boolean } {
    const lower = raw.toLowerCase().trim();
    const alias = QuickLogParserJs.EXERCISE_ALIASES[lower];
    if (alias) return { id: alias.id, name: alias.name, isNew: false };
    return { id: lower.replace(/\s+/g, '_'), name: raw.trim(), isNew: true };
  }

  parse(input: string) { return this.parseQuickLogInput(input); }

  parseQuickLogInput(input: string) {
    if (!input || !input.trim()) {
      return j({ isEmpty: true, entries: [], hasLowConfidence: false });
    }
    const entries: any[] = [];
    let hasLowConfidence = false;
    const segments = input.split(/[,;]\s*/);
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      // Try patterns: "3x5 exercise @100kg", "exercise 3x5 @100kg", "exercise @100kg", "exercise"
      const setRepRegex = /(\d+)\s*[x×]\s*(\d+)/i;
      const weightRegex = /(?:@\s*)?([\d.]+)\s*(kg|lbs?)?/i;
      // Also match weight without @ prefix at end: "80lbs", "100kg"
      const trailingWeightRegex = /\b([\d.]+)\s*(kg|lbs?)\b/i;

      const setRepMatch = trimmed.match(setRepRegex);
      const sets = setRepMatch ? parseInt(setRepMatch[1]) : 1;
      const reps = setRepMatch ? parseInt(setRepMatch[2]) : null;

      // Remove setxrep from string to find exercise name
      let remainder = trimmed.replace(setRepRegex, '').trim();

      // Extract weight (with @ or trailing unit)
      let weight: number | null = null;
      let unit: 'kg' | 'lbs' = 'kg';
      const atWeightMatch = remainder.match(/@\s*([\d.]+)\s*(kg|lbs?)?/i);
      if (atWeightMatch) {
        weight = parseFloat(atWeightMatch[1]);
        unit = atWeightMatch[2]?.toLowerCase().startsWith('lb') ? 'lbs' : 'kg';
        remainder = remainder.replace(/@\s*[\d.]+\s*(?:kg|lbs?)?/i, '').trim();
      } else {
        const trailingMatch = remainder.match(trailingWeightRegex);
        if (trailingMatch) {
          weight = parseFloat(trailingMatch[1]);
          unit = trailingMatch[2].toLowerCase().startsWith('lb') ? 'lbs' : 'kg';
          remainder = remainder.replace(trailingWeightRegex, '').trim();
        } else {
          // Try bare number with @ but no unit
          const bareAtMatch = trimmed.match(/@\s*([\d.]+)\s*$/);
          if (bareAtMatch && !atWeightMatch) {
            weight = parseFloat(bareAtMatch[1]);
            remainder = remainder.replace(/@\s*[\d.]+\s*$/, '').trim();
          }
        }
      }

      // What's left is the exercise name
      const exerciseRaw = remainder || trimmed.replace(setRepRegex, '').replace(/@\s*[\d.]+\s*(?:kg|lbs?)?/i, '').replace(/\b[\d.]+\s*(?:kg|lbs?)\b/i, '').trim();
      const resolved = this.resolveExercise(exerciseRaw);

      let parseConfidence: 'high' | 'medium' | 'low' = 'high';
      if (resolved.isNew) parseConfidence = 'low';
      else if (weight === null || reps === null) parseConfidence = 'medium';

      if (parseConfidence === 'low') hasLowConfidence = true;

      entries.push({
        raw: trimmed,
        exerciseName: resolved.name,
        exerciseId: resolved.id,
        sets,
        reps,
        weight,
        unit,
        isNew: resolved.isNew,
        parseConfidence,
        isPR: false,
        prDelta: null,
      });
    }

    return j({ isEmpty: entries.length === 0, entries, hasLowConfidence });
  }

  annotatePRs(entriesJson: string, personalRecordsJson?: string) {
    const entries: any[] = JSON.parse(entriesJson);
    const prs: any[] = personalRecordsJson ? JSON.parse(personalRecordsJson) : [];
    const e1rm = new E1rmServiceJs();
    const prMap = new Map<string, number>();
    if (Array.isArray(prs)) {
      for (const pr of prs) {
        const key = pr.exerciseId || pr.exerciseName?.toLowerCase().replace(/\s+/g, '_');
        if (key && typeof pr.e1RM === 'number') prMap.set(key, pr.e1RM);
      }
    }

    return j(entries.map((entry: any) => {
      if (entry.weight == null || entry.reps == null) {
        return { ...entry, isPR: false, prDelta: null };
      }
      const computed = e1rm.calculateE1RM(entry.weight, entry.reps);
      const existingKey = entry.exerciseId || entry.exerciseName?.toLowerCase().replace(/\s+/g, '_');
      const prev = prMap.get(existingKey) ?? null;
      const isPR = prev === null || computed > prev;
      return { ...entry, isPR, prDelta: isPR && prev !== null ? Math.round((computed - prev) * 10) / 10 : null };
    }));
  }

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
  computeWorkoutPatch(rpe: number, volumeKg: number, hoursElapsed: number, existingCns: number, existingRecovery: number) {
    // KMP uses banker's rounding (round half to even)
    const round1 = (n: number) => {
      const s = n * 10;
      const f = Math.floor(s);
      if (Math.abs(s - f - 0.5) < 1e-9) return (f % 2 === 0 ? f : f + 1) / 10;
      return Math.round(s) / 10;
    };
    const rawFatigue = Math.min(10, rpe * 0.6 + Math.min(4, volumeKg / 5000));
    const decayFactor = Math.pow(0.5, hoursElapsed / 48);
    const decayedFatigue = existingCns * decayFactor;
    const cnsFatigue = round1(Math.max(decayedFatigue, rawFatigue));
    const recoveryDelta = rpe >= 8 ? -1.5 : rpe >= 6 ? -0.5 : 0;
    const recoveryScore = round1(Math.max(0, Math.min(10, existingRecovery + recoveryDelta)));
    const energyBudget = round1(Math.max(0, Math.min(10, 10 - cnsFatigue * 0.7 - (10 - recoveryScore) * 0.3)));
    const focusScore = round1(Math.max(0, Math.min(10, 10 - cnsFatigue * 0.5)));
    return { cnsFatigue, recoveryScore, energyBudget, focusScore };
  }
  computeSleepPatch(durationHours: number, qualityRating: number) {
    const round1 = (n: number) => Math.round(n * 10) / 10;
    // Piecewise hours score: linear ramp below 7.5h, peak at 8.25h above
    const hoursScore = durationHours >= 7.5
      ? Math.min(10, Math.max(0, 10 - Math.abs(durationHours - 8.25)))
      : Math.min(10, Math.max(0, durationHours * (10 / 7.5)));
    const sleepQuality = round1(Math.max(0, Math.min(10, (hoursScore + qualityRating) / 2)));
    const energyBudget = round1(Math.max(0, Math.min(10, sleepQuality * 0.9)));
    const focusScore = round1(Math.max(0, Math.min(10, sleepQuality * 0.8)));
    return { sleepQuality, energyBudget, focusScore };
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
  sanitizeTitle(title: string) { return title; }
  computeActiveLoad(_tasksJson: string) { return 0; }
  computeDeadlinePressure(_tasksJson: string) { return 0; }
}

export class HabitEnergyMatcherJs {
  match(_habitsJson: string, _energyLevel: number) { return j([]); }
}

// ─── Soma ───────────────────────────────────────────────────────────────────

export class SomaFieldTemplatesJs {
  getTemplate(fieldId: string) { return j({ id: fieldId, label: '', type: 'text', options: [] }); }
  getAll() { return j([]); }
}

// ─── Atlas Planning & Predictive ─────────────────────────────────────────────

export class AtlasPlanningEngineJs {
  buildDependencyGraph(_tasksJson: string) { return j({ adjacency: {}, reverseAdj: {}, criticalPath: [], blockedChains: [], orphanTasks: [], cycleDetected: false, topologicalOrder: [] }); }
  computeGoalVelocities(_goalsJson: string, _tasksJson: string, _nowIso: string) { return j([]); }
  forecastLoad(_profileJson: string, _nsvJson: string, _daysAhead: number, _nowIso: string) { return j([]); }
  detectConflicts(_profileJson: string, _daysAhead: number, _nowIso: string) { return j({ deadlineConvergence: [], habitScheduleGaps: [], recoveryViolations: [] }); }
  suggestTaskBreakdown(_taskJson: string) { return j({ subtasks: [], totalEstimatedEnergy: 0, decompositionStrategy: '' }); }
  computeHistoricalPatterns(_profileJson: string, _nowIso: string) { return j({ completionRate7d: 0, completionRate30d: 0, avgEnergyAccuracy: null, commonDeferDays: [], peakProductivityHour: null, reviewConsistency: 0 }); }
}

export class BlueprintEngineJs {
  calculateCapacity(_nsvJson: string) { return 0.8; }
  isOverloaded(_weightsJson: string, _capacity: number) { return false; }
  getTasksToDefer(_tasksJson: string, _capacity: number) { return j([]); }
}

export class AtlasPredictiveEngineJs {
  computeEffectiveEnergyBudget(_nsvJson: string) { return 1.0; }
  getSafePlanningThreshold(_nsvJson: string) { return 0.8; }
  isOverloaded(_totalEnergyCost: number, _nsvJson: string) { return false; }
  computeBurnoutTrajectoryScore(_nsvHistoryJson: string) { return 0.0; }
  computeTransitionRisk(currentNsvJson: string, previousNsvJson: string) {
    const cur = JSON.parse(currentNsvJson);
    const prev = JSON.parse(previousNsvJson);
    const sum = (nsv: Record<string, unknown>) => {
      const c = (nsv.cognitive ?? {}) as Record<string, unknown>;
      const p = (nsv.planning ?? {}) as Record<string, unknown>;
      const b = (nsv.biological ?? {}) as Record<string, unknown>;
      const n = (k: Record<string, unknown>, field: string, top?: string) => {
        if (typeof k[field] === 'number') return k[field] as number;
        if (top && typeof (nsv as Record<string, unknown>)[top] === 'number') return (nsv as Record<string, unknown>)[top] as number;
        return 0;
      };
      return n(c, 'planningLoad') + n(p, 'deadlinePressure') + n(b, 'cnsFatigue', 'cnsFatigue');
    };
    const delta = sum(cur) - sum(prev);
    return delta > 0 ? Math.min(1.0, delta / 5) : 0.0;
  }
  evaluateNextState(currentState: string, _nsvJson: string, consecutiveClearCount: number) {
    // Minimal state machine for tests — mirrors KMP logic exactly
    const nsv = JSON.parse(_nsvJson);
    const planningLoad = nsv?.cognitive?.planningLoad ?? nsv?.planning?.deadlinePressure ?? 0;
    const deadlinePressure = nsv?.planning?.deadlinePressure ?? 0;
    const resilience = nsv?.emotional?.emotionalResilience ?? -1;
    const cnsFatigue = nsv?.biological?.cnsFatigue ?? -1;
    const financialFriction = nsv?.resource?.financialFriction ?? -1;
    const isBurnout =
      [resilience !== -1 && resilience <= 3, cnsFatigue !== -1 && cnsFatigue >= 8, financialFriction !== -1 && financialFriction >= 7].filter(Boolean).length >= 2;
    if (isBurnout) return j({ nextState: 'Recovery', newCleanCount: 0, isBurnout: true, emitOverload: false });
    let nextState = currentState; let newCleanCount = consecutiveClearCount; let emitOverload = false;
    if (currentState === 'Normal') {
      if (planningLoad >= 6 || deadlinePressure >= 6) { nextState = 'Compressed'; newCleanCount = 0; }
    } else if (currentState === 'Compressed') {
      if (planningLoad >= 8 && deadlinePressure >= 6) { nextState = 'Overloaded'; newCleanCount = 0; emitOverload = true; }
      else if (planningLoad < 6 && deadlinePressure < 6) { newCleanCount = consecutiveClearCount + 1; if (newCleanCount >= 2) { nextState = 'Normal'; newCleanCount = 0; } }
      else { newCleanCount = 0; }
    } else if (currentState === 'Overloaded') {
      if (planningLoad < 6 && deadlinePressure < 6) { newCleanCount = consecutiveClearCount + 1; if (newCleanCount >= 2) { nextState = 'Compressed'; newCleanCount = 0; } }
      else { newCleanCount = 0; }
    } else if (currentState === 'Recovery') {
      if (planningLoad < 4 && deadlinePressure < 4) { newCleanCount = consecutiveClearCount + 1; if (newCleanCount >= 2) { nextState = 'Compressed'; newCleanCount = 0; } }
      else { newCleanCount = 0; }
    }
    return j({ nextState, newCleanCount, isBurnout: false, emitOverload });
  }
  flattenEnergyWave(energyWaveJson: string, reason: string) {
    const wave = JSON.parse(energyWaveJson);
    const rescaled = wave.map((p: any) => ({ ...p }));
    if (rescaled.length > 0) {
      const removedEnergy = rescaled[0].energy * 0.2; const removedFocus = rescaled[0].focus * 0.2; const removedLoad = rescaled[0].load * 0.2;
      rescaled[0] = { ...rescaled[0], energy: Math.round((rescaled[0].energy - removedEnergy) * 100) / 100, focus: Math.round((rescaled[0].focus - removedFocus) * 100) / 100, load: Math.round((rescaled[0].load - removedLoad) * 100) / 100 };
      const weights = [0.4, 0.35, 0.25];
      for (let i = 1; i <= 3 && i < rescaled.length; i++) { const w = weights[i-1]; rescaled[i] = { ...rescaled[i], energy: Math.min(10, Math.round((rescaled[i].energy + removedEnergy * w) * 100) / 100), focus: Math.min(10, Math.round((rescaled[i].focus + removedFocus * w) * 100) / 100), load: Math.min(10, Math.round((rescaled[i].load + removedLoad * w) * 100) / 100) }; }
    }
    return j({ budgetCap: 0.8, rescaledWave: rescaled, deferrals: [], recoveryExtensions: [], flattenedUntil: new Date(Date.now() + 3 * 86400000).toISOString(), reason });
  }
}

// ─── Ledger Automation & Recurring ──────────────────────────────────────────

export class LedgerAutomationEngineJs {
  evaluateRules(_profileJson: string, _nowIso: string) { return j([]); }
  getDefaultRules(_nowIso: string) { return j([]); }
}

export class RecurringBillEngineJs {
  advanceByFrequency(_dateStr: string, _frequency: string) { return _dateStr; }
  computeNextDueDate(_ruleJson: string, _fromIso?: string) { return new Date().toISOString().slice(0, 10); }
  computeDueRules(_rulesJson: string, _todayIso: string) { return j([]); }
  computeUpcomingBills(_rulesJson: string, _todayIso: string, _days: number) { return j([]); }
  postDueTransactions(_rulesJson: string, profileJson: string, _todayIso: string) { return j({ updatedProfile: JSON.parse(profileJson), autoPosted: [], pendingRules: [] }); }
  postSingleRule(_ruleJson: string, profileJson: string, _todayIso: string) { const profile = JSON.parse(profileJson); return j({ updatedProfile: profile, transaction: {} }); }
  skipNextOccurrence(_ruleJson: string, profileJson: string) { return profileJson; }
}

// ─── Atlas Blueprint Service ────────────────────────────────────────────────

export class AtlasBlueprintServiceJs {
  inferIngestionMode(confidence: number) { return confidence >= 0.7 ? 'structured' : 'unstructured'; }
  projectCapacityBlueprint(_blueprintJson: string, _capacityPct: number) { return j({ capacity: 40, headroom: 5, overflowTasks: 0, summary: 'Projection is workable.' }); }
  computeReviewBlueprint(_profileJson: string, soulJson: string, nowIso: string) {
    const soul = soulJson !== 'null' ? JSON.parse(soulJson) : null;
    const nsv = soul?.crossFunctionalState ?? {};
    const bio = nsv.biological ?? {};
    const emo = nsv.emotional ?? {};
    const res = nsv.resource ?? {};
    const plan = nsv.planning ?? {};
    const get = (v: number | null | undefined, fallback = 5): number =>
      v !== null && v !== undefined ? v : fallback;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const vitality = clamp((get(bio.recoveryScore) + (10 - get(bio.cnsFatigue))) / 2, 0, 10);
    const resilience = clamp((get(emo.emotionalResilience) + (10 - get(emo.stressLoad))) / 2, 0, 10);
    const friction = clamp((get(res.financialFriction) + (10 - get(res.resonanceROI))) / 2, 0, 10);
    const goalAlign = get(plan.goalAlignment, 0.5);
    const habitMom = get(plan.habitMomentum, 0.5);
    const specAlignment = clamp(((goalAlign + habitMom) / 2) * 10, 0, 10);
    const rawPct = clamp(72 + vitality * 2.2 + resilience * 1.8 + specAlignment * 1.2 - friction * 2.8, 60, 115);
    const recommendedCapacityPct = Math.round(rawPct);
    const state = recommendedCapacityPct >= 95 ? 'expand' : recommendedCapacityPct >= 85 ? 'hold' : recommendedCapacityPct >= 72 ? 'compress' : 'recover';
    const safeCapacity = Math.round(40 * recommendedCapacityPct / 100);
    const headroom = Math.max(0, safeCapacity - 20);
    const recommendedActions: Array<{ id: string; label: string }> = [];
    if (state === 'recover') recommendedActions.push({ id: 'schedule-recovery', label: 'Schedule recovery time' });
    return j({
      generatedAt: nowIso, period: 'weekly',
      capacity: { baselineCapacity: 40, safeCapacity, plannedDemand: 20, loadRatio: 0.55, headroom, recommendedCapacityPct, state, vectors: { vitality, friction, resilience, specAlignment }, pressurePoints: [] },
      projection: { state, summary: state === 'recover' ? 'High friction detected. Reduce load.' : 'Stable week.', confidence: 'medium', projectedCapacity: safeCapacity, projectedDemand: 20, projectedHeadroom: headroom, nextPeriodFocus: 'Hold the current blueprint', recommendedActions },
    });
  }
  computeQuickSnapshot(_profileJson: string, _soulJson: string) {
    if (_profileJson === 'null') return 'null';
    return j({ baselineCapacity: 40, safeCapacity: 36, plannedDemand: 20, loadRatio: 0.55, headroom: 16, recommendedCapacityPct: 90, state: 'hold', vectors: { vitality: 6, friction: 4, resilience: 6, specAlignment: 6 }, pressurePoints: [] });
  }
  computeDailyCapacity(_profileJson: string, _soulJson: string, _targetDate: string) {
    return j({ totalCapacity: 40, committedEnergy: 10, availableEnergy: 30, dayOfWeek: 1 });
  }
  computeDeadlinePressureScore(_tasksJson: string, _goalsJson: string, _taskCompletionRate: number) { return 3.0; }
}

// ─── Titan Clearance Engine ─────────────────────────────────────────────────

export class TitanClearanceEngineJs {
  evaluate(nsvJson: string) {
    const nsv = JSON.parse(nsvJson);
    const vitality = nsv?.biological?.recoveryScore != null ? nsv.biological.recoveryScore / 10 : nsv?.biological?.cnsFatigue != null ? Math.max(0, Math.min(1, (10 - nsv.biological.cnsFatigue) / 10)) : 0.5;
    const resilience = nsv?.emotional?.emotionalResilience != null ? Math.max(0, Math.min(1, nsv.emotional.emotionalResilience / 10)) : 0.5;
    const score = vitality * 0.6 + resilience * 0.4;
    const warnings: string[] = [];
    let cleared = true; let vetoReason: string | undefined; let consequence: string | undefined;
    if (vitality < 0.3) { cleared = false; vetoReason = 'CRITICAL_VITALITY_LOW'; consequence = 'FORCE_RECOVERY_MODE'; }
    if (vitality < 0.5 && vitality >= 0.3) { warnings.push('HRV delta > -20%: Propose 20% volume reduction.'); }
    if (resilience < 0.2) { cleared = false; vetoReason = 'CRITICAL_RESILIENCE_LOW'; consequence = 'PROPOSE_REST_OR_LOW_STIFFNESS'; }
    if (score < 0.4 && cleared) { cleared = false; vetoReason = 'CLEARANCE_ALGORITHM_FAIL'; consequence = 'INITIATE_RECOVERY'; }
    return j({ score, cleared, ...(vetoReason ? { vetoReason } : {}), ...(consequence ? { consequence } : {}), warnings });
  }
}

// ─── Medical Clearance Evaluator ────────────────────────────────────────────

const CONTRAINDICATED_PATTERNS: Record<string, string[]> = {
  'high intensity': ['cardiac', 'heart', 'hypertension', 'seizure', 'fracture'],
  'heavy lifting': ['hernia', 'spinal', 'disc', 'fracture', 'pregnancy'],
  'endurance': ['asthma', 'copd', 'cardiac', 'anemia'],
  'flexibility': ['hypermobility', 'joint instability'],
};

function mockHasContraindication(conditions: string[], medications: string[], activity: string): string | null {
  const normalizedActivity = activity.toLowerCase().replace(/[_\-]/g, ' ');
  const allTerms = [...conditions, ...medications].map(t => t.toLowerCase());
  for (const [pattern, contras] of Object.entries(CONTRAINDICATED_PATTERNS)) {
    if (!normalizedActivity.includes(pattern)) continue;
    for (const contra of contras) {
      const match = allTerms.find(t => t.includes(contra));
      if (match) return `${match} may contraindicate ${pattern}`;
    }
  }
  return null;
}

export class MedicalClearanceEvaluatorJs {
  evaluate(profileJson: string, activity: string) {
    const profile = JSON.parse(profileJson);
    const conditions: string[] = profile.knownConditions ?? [];
    const medications: string[] = profile.medications ?? [];
    const clearances: Array<{ activity: string; status: string; reason: string; issuedAt: string }> = profile.clearances ?? [];
    const contra = mockHasContraindication(conditions, medications, activity);
    if (contra) return j({ id: crypto.randomUUID(), activity, status: 'denied', reason: contra, issuedAt: new Date().toISOString() });
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const recentDenied = clearances.find(c => c.activity.toLowerCase() === activity.toLowerCase() && c.status === 'denied' && (Date.now() - new Date(c.issuedAt).getTime()) < sevenDays);
    if (recentDenied) return j({ id: crypto.randomUUID(), activity, status: 'conditional', reason: `Previously denied (${recentDenied.reason}). Re-evaluation recommended.`, issuedAt: new Date().toISOString() });
    return j({ id: crypto.randomUUID(), activity, status: 'granted', reason: 'No contraindications detected.', issuedAt: new Date().toISOString() });
  }
  isActivitySafe(profileJson: string, activity: string) {
    const result = JSON.parse(this.evaluate(profileJson, activity));
    return result.status === 'granted';
  }
  getLatestClearance(profileJson: string) {
    const profile = JSON.parse(profileJson);
    const clearances = profile.clearances ?? [];
    return clearances.length > 0 ? JSON.stringify(clearances[0]) : 'null';
  }
}

// ─── Embedding Utils ─────────────────────────────────────────────────────────

export class EmbeddingUtilsJs {
  cosineSimilarity(aJson: string, bJson: string) {
    const a: number[] = JSON.parse(aJson);
    const b: number[] = JSON.parse(bJson);
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < len; i++) { dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i]; }
    if (nA === 0 || nB === 0) return 0;
    return dot / Math.sqrt(nA * nB);
  }
  computeKeywordScore(claim: string, query: string) {
    const claimLower = claim.toLowerCase();
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (tokens.length === 0) return 0;
    return tokens.filter(t => claimLower.includes(t)).length / tokens.length;
  }
  deduplicateTextResults(resultsJson: string, overlapThreshold: number) {
    const results: Array<{ text: string }> = JSON.parse(resultsJson);
    const seenTexts: string[] = [];
    const out = results.filter(r => {
      const words = new Set(r.text.toLowerCase().split(/\s+/).filter(Boolean));
      const isDup = seenTexts.some(prev => {
        const prevWords = new Set(prev.toLowerCase().split(/\s+/).filter(Boolean));
        const overlap = [...words].filter(w => prevWords.has(w)).length;
        return overlap / Math.max(words.size, prevWords.size) > overlapThreshold;
      });
      if (!isDup) seenTexts.push(r.text);
      return !isDup;
    });
    return JSON.stringify(out);
  }
  evaluateDiscrepancy(inferredJson: string, storedJson: string) {
    if (storedJson === 'null') return true;
    const inferred = JSON.parse(inferredJson);
    const stored = JSON.parse(storedJson);
    if (typeof inferred === 'number' && typeof stored === 'number') {
      const diff = Math.abs(inferred - stored);
      return diff > 1 || (stored !== 0 ? diff / Math.abs(stored) : diff) > 0.15;
    }
    if (typeof inferred === 'string' && typeof stored === 'string') return inferred.toLowerCase() !== stored.toLowerCase();
    return inferred !== stored;
  }
  resolveFieldPath(objJson: string, path: string) {
    const normalised = path.replace(/\[(\d+)]/g, '.$1');
    const segments = normalised.split('.');
    let cursor: unknown = JSON.parse(objJson);
    for (const seg of segments) {
      if (cursor === null || cursor === undefined) return 'null';
      if (typeof cursor !== 'object') return 'null';
      cursor = (cursor as Record<string, unknown>)[seg];
    }
    return JSON.stringify(cursor ?? null);
  }
}

// ─── Alive Entity Utils ──────────────────────────────────────────────────────

const PROV_PRIORITY: Record<string, number> = { native: 3, adapter: 2, bootstrap: 1 };

function mockNormalizeEntity(entity: Record<string, unknown>, nowIso: string): Record<string, unknown> {
  const label = typeof entity.label === 'string' ? entity.label.trim() : '';
  const rawTags: string[] = Array.isArray(entity.semantic_tags) ? entity.semantic_tags as string[] : [];
  const tags = [...new Set(rawTags.map(t => t.trim().toLowerCase()).filter(Boolean))].sort();
  return {
    ...entity,
    label,
    semantic_tags: tags,
    attributes: entity.attributes ?? {},
    soul_impact_preset: entity.soul_impact_preset ?? {},
    createdAt: entity.createdAt ?? nowIso,
    updatedAt: entity.updatedAt ?? nowIso,
  };
}

export class AliveEntityUtilsJs {
  normalize(entityJson: string) {
    const nowIso = new Date().toISOString();
    return JSON.stringify(mockNormalizeEntity(JSON.parse(entityJson), nowIso));
  }
  dedupeAndSort(entitiesJson: string) {
    const nowIso = new Date().toISOString();
    const entities: Record<string, unknown>[] = JSON.parse(entitiesJson);
    const deduped = new Map<string, Record<string, unknown>>();
    for (const e of entities) {
      const norm = mockNormalizeEntity(e, nowIso);
      const id = norm.id as string;
      if (!id) continue;
      const existing = deduped.get(id);
      const normProv = PROV_PRIORITY[norm.provenance as string] ?? 0;
      const existProv = existing ? (PROV_PRIORITY[existing.provenance as string] ?? 0) : -1;
      if (!existing || normProv >= existProv) deduped.set(id, norm);
    }
    return JSON.stringify([...deduped.values()].sort((a, b) => ((b.updatedAt as string) ?? '').localeCompare((a.updatedAt as string) ?? '')));
  }
  buildRuntimeContext(entitiesJson: string, moduleFilterJson: string, limitPerModule: number) {
    const limit = limitPerModule > 0 ? limitPerModule : 3;
    const sorted: Record<string, unknown>[] = JSON.parse(this.dedupeAndSort(entitiesJson));
    const moduleFilter: Set<string> | null = moduleFilterJson === 'null' ? null : new Set(JSON.parse(moduleFilterJson) as string[]);
    const filtered = moduleFilter ? sorted.filter(e => moduleFilter.has(e.sourceModule as string)) : sorted;
    const byModule: Record<string, unknown[]> = {};
    const tagSet = new Set<string>();
    for (const e of filtered) {
      const mod = e.sourceModule as string;
      if (!mod) continue;
      (e.semantic_tags as string[] ?? []).forEach(t => tagSet.add(t));
      const bucket = byModule[mod] ?? (byModule[mod] = []);
      if (bucket.length < limit) bucket.push({ id: e.id, label: e.label, type: e.type, sourceModule: mod, sourceEntityId: e.sourceEntityId ?? null, provenance: e.provenance ?? 'bootstrap', semantic_tags: e.semantic_tags ?? [], updatedAt: e.updatedAt ?? '' });
    }
    return j({ total: filtered.length, moduleIds: Object.keys(byModule), byModule, tags: [...tagSet].sort(), lastUpdatedAt: filtered[0]?.updatedAt ?? null });
  }
}
