import type { AliveEntityRuntimeContext } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import type { SynthesisAlert } from '@/modules/nexus/hooks/useNexusSynthesis';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';

export interface AnticipatoryPlanningProposal {
  id: string;
  title: string;
  summary: string;
  prompt: string;
  confidence?: number;
  state: 'draft' | 'deferred';
  targetModuleId?: ModuleId;
  sourceSignalIds: string[];
}

interface BuildAnticipatoryPlanningInput {
  threadId: string;
  alerts: SynthesisAlert[];
  aliveContext: AliveEntityRuntimeContext | null;
  conversationDepth: number;
}

type PlanningHeuristicRule = {
  match: (alert: SynthesisAlert) => boolean;
  targetModuleId?: ModuleId;
  title: string;
  prompt: string;
};

const HEURISTIC_RULES: PlanningHeuristicRule[] = [
  {
    match: (alert) => alert.id === 'PLANNING_COLLAPSE',
    targetModuleId: 'atlas',
    title: 'Draft a workload triage plan',
    prompt:
      'Build a realistic triage plan for today using my current alive entities, recent workload pressure, and the most urgent deadlines. Prioritize relief first, then execution.',
  },
  {
    match: (alert) => alert.id === 'BURNOUT_TRAJECTORY' || alert.id === 'COMPOUND_STRESS',
    targetModuleId: 'agnes',
    title: 'Prepare a recovery-first plan',
    prompt:
      'Create a recovery-first plan that reduces overload, protects resilience, and only keeps the minimum viable commitments for today. Reference any relevant alive entities.',
  },
  {
    match: (alert) => alert.id === 'FINANCIAL_EMOTIONAL_LOOP',
    targetModuleId: 'ledger',
    title: 'Prepare a friction-reduction plan',
    prompt:
      'Draft a friction-reduction plan that stabilizes today’s financial stress while protecting emotional bandwidth. Use my current alive entities where relevant.',
  },
];

function buildAliveSummary(context: AliveEntityRuntimeContext | null): string {
  if (!context || context.total === 0) {
    return 'No alive entities are currently available, so Nexus should work from the detected cross-domain pattern alone.';
  }

  const moduleSummary = context.moduleIds
    .map((moduleId) => {
      const count = context.byModule[moduleId]?.length ?? 0;
      return count > 0 ? `${moduleId} (${count})` : null;
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .join(', ');

  return moduleSummary
    ? `Alive inputs are available from ${moduleSummary}.`
    : `${context.total} alive inputs are available for planning.`;
}

export class AnticipatoryPlanningService {
  static buildProposal(input: BuildAnticipatoryPlanningInput): AnticipatoryPlanningProposal | null {
    if (!AutonomyFeatureFlags.isEnabled('anticipatoryPlanning')) return null;
    if (input.conversationDepth > 1) return null;

    const activeAlert = input.alerts.find((alert) => alert.severity === 'critical')
      ?? input.alerts.find((alert) => alert.severity === 'warning');
    if (!activeAlert) return null;

    const rule = HEURISTIC_RULES.find((candidate) => candidate.match(activeAlert));
    if (!rule) return null;

    const aliveSummary = buildAliveSummary(input.aliveContext);
    const sourceSignalIds = [
      activeAlert.id,
      ...(input.aliveContext?.moduleIds ?? []).map((moduleId) => `alive:${moduleId}`),
    ];

    return {
      id: `${input.threadId}.planning.${activeAlert.id.toLowerCase()}`,
      title: rule.title,
      summary: `${activeAlert.description} ${aliveSummary}`,
      prompt: rule.prompt,
      confidence: activeAlert.severity === 'critical' ? 0.78 : 0.72,
      state: 'draft',
      targetModuleId: rule.targetModuleId,
      sourceSignalIds,
    };
  }
}
