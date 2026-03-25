import type { AgentCapability } from './agent-capability';

const ACTION_CAPABILITY_MAP: Record<string, AgentCapability[]> = {
  schedule_item: ['schedule-mutation', 'daily-planning'],
  recovery_day: ['recovery-planning', 'schedule-mutation'],
  update_schedule: ['schedule-mutation'],
  query_knowledge: ['research'],
  web_search: ['research'],
  deep_research: ['research'],
  execute_code: ['technical-work'],
  create_financial_plan: ['financial-planning'],
  create_financial_plan_request: ['financial-planning'],
  create_emotional_support_session: ['emotional-support'],
  create_workout_plan: ['fitness-planning'],
  create_medical_review: ['medical-review'],
  create_research_request: ['research'],
  create_technical_task: ['technical-work'],
  create_general_request: ['general-orchestration'],
  update_emotional_resilience: ['emotional-support'],
  update_stress_load: ['emotional-support'],
  update_mood_trend: ['emotional-support'],
  update_trauma_markers: ['emotional-support'],
  daily_plan: ['daily-planning'],
  flatten_schedule: ['recovery-planning', 'schedule-mutation'],
};

function uniqueCapabilities(capabilities: AgentCapability[]): AgentCapability[] {
  return Array.from(new Set(capabilities));
}

export class ActionCapabilityResolver {
  static resolve(actionType: string): AgentCapability[] {
    const normalized = actionType.trim().toLowerCase();
    if (!normalized) return [];
    if (ACTION_CAPABILITY_MAP[normalized]) {
      return ACTION_CAPABILITY_MAP[normalized];
    }

    const inferred: AgentCapability[] = [];
    if (normalized.startsWith('query_') || normalized.includes('research') || normalized.includes('search')) {
      inferred.push('research');
    }
    if (normalized.includes('code') || normalized.includes('build') || normalized.includes('refactor')) {
      inferred.push('technical-work');
    }
    if (normalized.includes('financial') || normalized.includes('budget') || normalized.includes('transaction')) {
      inferred.push('financial-planning');
    }
    if (normalized.includes('emotional') || normalized.includes('mood') || normalized.includes('stress')) {
      inferred.push('emotional-support');
    }
    if (normalized.includes('plan') || normalized.includes('schedule')) {
      inferred.push('daily-planning');
    }

    return uniqueCapabilities(inferred);
  }
}
