import { describe, expect, it } from 'vitest';
import { OrchestrationActionGateService } from './orchestration-action-gate-service';

describe('OrchestrationActionGateService', () => {
  it('defers mutating actions when autopilot requires approval', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'atlas',
      actionType: 'create_habit',
      payload: { title: 'Walk' },
      autopilotLevel: 2,
      historyMode: 'standard',
      isGuest: false,
      activeThreadId: 'thread-1',
    });

    expect(decision.shouldDispatch).toBe(false);
    expect(decision.metadata.approvalRequirement.required).toBe(true);
    expect(decision.metadata.executionMode).toBe('assisted');
    expect(decision.metadata.execution.status).toBe('deferred');
    expect(decision.metadata.runtime.autonomy).toBe('guided_assist');
    expect(decision.metadata.runtime.disposition).toBe('proposal_review');
    expect(decision.metadata.proposal.metadata?.actionType).toBe('create_habit');
  });

  it('allows non-mutating analysis actions to proceed without approval', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'nexus',
      actionType: 'generate_summary',
      payload: {},
      autopilotLevel: 2,
      historyMode: 'standard',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.mutatesState).toBe(false);
    expect(decision.metadata.executionMode).toBe('assisted');
    expect(decision.metadata.execution.status).toBe('executed');
    expect(decision.metadata.runtime.disposition).toBe('visible_execution');
  });

  it('treats delegate_to_module as non-mutating so routing is not held for approval', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'nexus',
      actionType: 'delegate_to_module',
      payload: { moduleId: 'atlas', reason: 'planning support' },
      autopilotLevel: 2,
      historyMode: 'standard',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.mutatesState).toBe(false);
    expect(decision.metadata.approvalRequirement.required).toBe(false);
    expect(decision.metadata.execution.status).toBe('executed');
    expect(decision.metadata.runtime.disposition).toBe('visible_execution');
  });

  it('keeps search_memory silent at level 5 even if recovered payload requests approval', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'nexus',
      actionType: 'search_memory',
      payload: { query: 'sleep', requiresApproval: true },
      autopilotLevel: 5,
      historyMode: 'silent',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.mutatesState).toBe(false);
    expect(decision.metadata.approvalRequirement.required).toBe(false);
    expect(decision.metadata.dispatchStatus).toBe('approved');
    expect(decision.metadata.executionMode).toBe('ghost');
    expect(decision.metadata.runtime.disposition).toBe('silent_execution');
  });

  it('forces guest mutating actions into analysis-only mode', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'ledger',
      actionType: 'record_transaction',
      payload: { amount: 42 },
      autopilotLevel: 5,
      historyMode: 'silent',
      isGuest: true,
    });

    expect(decision.shouldDispatch).toBe(false);
    expect(decision.metadata.patientScope).toBe('GUEST');
    expect(decision.metadata.executionMode).toBe('analysis_only');
    expect(decision.metadata.execution.status).toBe('analysis_only');
    expect(decision.metadata.runtime.disposition).toBe('high_risk_review');
  });

  it('keeps level 3 proposal-first for medium-confidence mutations that level 4 can execute', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'atlas',
      actionType: 'update_focus_score',
      payload: { focusScore: 8 },
      autopilotLevel: 3,
      historyMode: 'standard',
      isGuest: false,
    });

    expect(decision.metadata.proposal.confidence).toBeGreaterThanOrEqual(0.85);
    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.executionMode).toBe('autonomous');
    expect(decision.metadata.runtime.autonomy).toBe('conditional_autonomy');
    expect(decision.metadata.runtime.disposition).toBe('visible_execution');
  });

  it('allows higher autopilot levels to execute the same medium-confidence mutation autonomously', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'atlas',
      actionType: 'update_focus_score',
      payload: { focusScore: 8 },
      autopilotLevel: 4,
      historyMode: 'standard',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.executionMode).toBe('autonomous');
    expect(decision.metadata.execution.status).toBe('executed');
    expect(decision.metadata.proposal.confidence).toBeGreaterThanOrEqual(0.7);
    expect(decision.metadata.runtime.autonomy).toBe('supervised_autonomy');
  });

  it('marks ghost execution as silent runtime work at level 5', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'ledger',
      actionType: 'record_transaction',
      payload: { amount: 42, merchant: 'Cafe', category: 'food' },
      autopilotLevel: 5,
      historyMode: 'silent',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.executionMode).toBe('ghost');
    expect(decision.metadata.historyMode).toBe('silent');
    expect(decision.metadata.runtime.disposition).toBe('silent_execution');
    expect(decision.metadata.runtime.historyDestination).toBe('silent_audit');
    expect(decision.metadata.runtime.willPersistHistory).toBe(true);
  });

  it('dispatches web_search at autopilot level 0 — non-mutating reads are never blocked by analysis_only policy', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'scout',
      actionType: 'web_search',
      payload: { query: 'latest AI research' },
      autopilotLevel: 0,
      historyMode: 'standard',
      isGuest: false,
    });

    expect(decision.shouldDispatch).toBe(true);
    expect(decision.metadata.mutatesState).toBe(false);
    expect(decision.metadata.dispatchStatus).toBe('approved');
    expect(decision.metadata.execution.status).toBe('executed');
  });

  it('keeps ephemeral sessions analysis-only regardless of action type', () => {
    const decision = OrchestrationActionGateService.evaluate({
      moduleId: 'ledger',
      actionType: 'record_transaction',
      payload: { amount: 10 },
      autopilotLevel: 5,
      historyMode: 'silent',
      isGuest: false,
      persistencePolicy: 'ephemeral',
    });

    expect(decision.shouldDispatch).toBe(false);
    expect(decision.metadata.dispatchStatus).toBe('ephemeral');
    expect(decision.metadata.execution.status).toBe('analysis_only');
    expect(decision.metadata.runtime.disposition).toBe('ephemeral_preview');
  });
});
