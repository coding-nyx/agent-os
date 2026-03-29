import type {
  NexusActionPlan,
  NexusActionPlanDispatchNode,
  NexusActionPlanExecutionPacket,
  NexusActionPlanNode,
} from '@/lib/contracts/nexus-action-plan';
import type { ModuleId } from '@/lib/module-manifest';
import { AgentRegistryService } from '@/lib/agents/agent-registry';

const DETERMINISTIC_ACTIONS_BY_MODULE: Partial<Record<ModuleId | 'nexus', string[]>> = {
  atlas: [
    'schedule_block', 'flatten_schedule',
    'create_task', 'update_task', 'complete_task', 'delete_task',
    'create_goal', 'update_goal', 'delete_goal',
    'create_habit', 'update_habit', 'delete_habit', 'log_habit_completion',
    'atlas_journal_create_entry', 'atlas_journal_update_entry',
    'atlas_add_goal_milestone', 'atlas_update_goal_milestone', 'atlas_delete_goal_milestone',
    'atlas_update_task_description', 'atlas_update_task_notes',
    'create_project', 'update_project', 'delete_project',
    'create_recovery_window', 'delete_recovery_window',
  ],
  soma: [
    'commit_biomarker', 'log_vital', 'issue_clearance', 'parse_lab_report',
    'analyze_medical_image', 'compute_readiness', 'addPhysicalAssessment',
    'soma_update_medical_summary', 'soma_add_known_condition', 'soma_remove_known_condition',
    'soma_add_medication', 'soma_remove_medication',
    'soma_add_allergy', 'soma_remove_allergy',
    'soma_update_physical_assessment', 'soma_log_next_checkup',
    'update_conditions', 'approve_health_entry', 'reject_health_entry',
    'approve_diagnosis_merge', 'reject_diagnosis_merge',
  ],
  agnes: [
    'update_emotional_resilience', 'update_stress_load', 'update_mood_trend',
    'update_trauma_markers', 'sync_vitals', 'crisis_flag',
    'update_agnes_profile', 'update_belief_graph',
    'agnes_create_session_note', 'agnes_update_session_note', 'agnes_delete_session_note',
    'agnes_set_somatic_mode',
    'create_emotional_support_session',
  ],
  titan: [
    'log_workout_session', 'log_sleep', 'log_injury', 'log_body_weight',
    'log_cardio', 'log_meal', 'log_custom_field',
    'create_workout_goal', 'update_workout_goal', 'delete_workout_goal',
    'update_recovery_plan', 'create_recovery_checkin',
    'log_cycle_phase', 'update_cycle_entry',
    'titan_update_exercise_note',
  ],
  ledger: [
    'create_transaction', 'update_transaction', 'delete_transaction', 'categorize_transaction',
    'update_budget', 'create_budget_category', 'delete_budget_category',
    'create_goal', 'update_goal', 'delete_goal',
    'create_account', 'update_account', 'delete_account',
    'create_recurring_rule', 'update_recurring_rule', 'delete_recurring_rule',
    'create_debt', 'update_debt', 'delete_debt',
    'create_subscription', 'update_subscription', 'delete_subscription',
    'create_plan', 'update_plan', 'activate_plan',
    'update_income', 'update_expenses',
    'ledger_update_budget_category_name', 'ledger_update_transaction_notes', 'ledger_update_tax_info',
  ],
  scout: [
    'add_knowledge_node', 'update_knowledge_node', 'delete_knowledge_node',
    'add_sources', 'update_source', 'delete_source',
    'generate_digest', 'synthesize_knowledge',
    'verify_claim', 'update_research_focus',
    'scout_create_session', 'scout_update_source_status', 'scout_archive_source',
    'scout_verify_knowledge_node',
  ],
  nexus: [
    'navigate_to_module', 'create_module_handoff', 'mutate_module_data',
    'broadcast_spine_event', 'sync_vitals', 'update_global_identity',
    'query_module_data',
  ],
};

function canDeterministicallyDispatch(moduleId: ModuleId, actionType: string): boolean {
  return (DETERMINISTIC_ACTIONS_BY_MODULE[moduleId] ?? []).includes(actionType);
}

function resolveNode(node: NexusActionPlanNode): NexusActionPlanDispatchNode {
  const resolved = AgentRegistryService.resolveActionForProvider(
    node.targetModuleId,
    node.actionType,
    node.payload,
  );

  if (!canDeterministicallyDispatch(node.targetModuleId, resolved.actionType)) {
    return {
      nodeId: node.id,
      targetModuleId: node.targetModuleId,
      sourceActionType: node.actionType,
      resolvedActionType: null,
      payload: node.payload,
      dependsOn: node.dependsOn,
      status: 'requires_followup',
      reason: `No deterministic handler mapping exists yet for ${node.targetModuleId}.${node.actionType}.`,
    };
  }

  return {
    nodeId: node.id,
    targetModuleId: node.targetModuleId,
    sourceActionType: node.actionType,
    resolvedActionType: resolved.actionType,
    payload: resolved.payload,
    dependsOn: node.dependsOn,
    status: 'resolved',
  };
}

export class NexusActionDispatchService {
  static resolvePlan(plan: NexusActionPlan): NexusActionPlanDispatchNode[] {
    return plan.nodes.map(resolveNode);
  }

  static resolvePacket(packet: NexusActionPlanExecutionPacket): NexusActionPlanDispatchNode[] {
    return packet.nodes.map(resolveNode);
  }
}
