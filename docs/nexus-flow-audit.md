# Nexus Flow Functionality Audit

This report audits intents, actions, proposals, and Spine events for end‑to‑end flow integrity, and proposes architecture‑level fixes to achieve a robust flow system.

## Executive Summary

- Spine events declared: 170
- Spine events used: 176
- Events never emitted: 24
- Events never listened: 126
- Unknown event strings in code (not in SpineEventType): 26
- Actions registered: 220
- Actions without labels: 175
- Labels without actions: 21
- Intents defined: 11
- Intents not supported by action planner: 7

## Key Integrity Findings

**Spine Events**
- 24 declared events are never emitted (dead flow or missing emitters).
- 126 declared events are never listened to (no downstream handling).
- 26 event strings are used but not typed in SpineEventType: NEURAL_TRANSMISSION_SENT, NEURAL_RESONANCE_RECEIVED, NEURAL_PROCESSING_STARTED, delegate, MARK_TASK_DONE, ACCOUNT_CREATED, TRANSFER_COMPLETED, NET_WORTH_SNAPSHOT, CREDIT_SCORE_ADDED, INSURANCE_POLICY_CREATED, INVESTMENT_ADDED, PORTFOLIO_SNAPSHOT, RECURRING_RULE_CREATED, RECURRING_POSTED, RETIREMENT_PLAN_CREATED, …
- Dynamic event references exist (emitters: 13, listeners: 3). These bypass static verification.

**Actions & Proposals**
- 175 actions are missing human labels (proposal and audit UX inconsistency).
- 21 labels reference actions that are not registered (stale UI strings).
- 7 intents are routed but lack structured action plan support: emotional_support, fitness, medical, financial, research, technical, general.

**Flow Breakpoints (systemic)**
- SpineEventBus only persists non‑info events; info‑level flows are invisible to notifications and audit history unless handled elsewhere.
- Action label registry is not the source of truth; it drifts from action registrations.
- Intent routing and action planning are partially decoupled; non‑planning intents lack deterministic orchestration paths.

## End‑to‑End Flow Coverage (By Module)

**NEXUS**
- Actions registered: 37
- Spine events emitted (in module files): MODULE_DELEGATED, REDUCE_TRAINING_LOAD
- Spine events listened (in module files): *, MODULE_DELEGATED, VITAL_UPDATED, SESSION_ENDED

**AGNES**
- Actions registered: 19
- Spine events emitted (in module files): DRAFT_PROPOSED, VITAL_UPDATED, CONFLICT_DETECTED, CRISIS_MODE, SOMATIC_SESSION_COMPLETE, CRISIS_DETECTED, BURNOUT_WARNING, COMPOUND_STRESS, EMOTIONAL_TRAJECTORY_DETECTED
- Spine events listened (in module files): SOMATIC_SUPPORT_REQUESTED

**TITAN**
- Actions registered: 13
- Spine events emitted (in module files): DRAFT_PROPOSED, MODULE_DELEGATED, BLOCK_HIGH_INTENSITY, delegate, FLATTEN_ENERGY_WAVE, SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED, RECOVERY_AVAILABLE, SOMA_LAB_REPORT_PARSED, SOMA_PROFILE_UPDATED, SOMA_VETO_OVERRIDDEN, TITAN_RECOVERY_NEEDED, MEDICAL_ALERT, TITAN_BODY_WEIGHT_LOGGED, WORKOUT_COMPLETED, CLEARANCE_DENIED, CLEARANCE_GRANTED, CYCLE_STARTED, CYCLE_COMPLETED, TITAN_MEAL_LOGGED, TITAN_PROPOSAL, TITAN_TRAINING_STREAK
- Spine events listened (in module files): BURNOUT_WARNING, MODULE_HANDOFF_RECEIVED, TITAN_PROPOSAL, COMMITMENT_MISSED, FINANCIAL_STRESS, COMPOUND_STRESS, REDUCE_TRAINING_LOAD, RECOVERY_AVAILABLE

**SOMA**
- Actions registered: 29
- Spine events emitted (in module files): MODULE_PROFILE_UPDATED, DRAFT_PROPOSED, BLOCK_HIGH_INTENSITY, SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED, RECOVERY_AVAILABLE, SOMA_FIELD_CREATED, SOMA_FIELD_DELETED, SOMA_FIELD_UPDATED, SOMA_VITAL_LOGGED, CLEARANCE_EXPIRED, SOMA_LAB_REPORT_PARSED, MEDICAL_HISTORY_UPDATED, SOMA_PROFILE_UPDATED, SOMA_DIAGNOSIS_MERGED, SOMA_DIAGNOSIS_DISCARDED
- Spine events listened (in module files): WORKOUT_COMPLETED, TITAN_BODY_WEIGHT_LOGGED

**LEDGER**
- Actions registered: 83
- Spine events emitted (in module files): DRAFT_PROPOSED, FIELD_CREATED, FIELD_DELETED, FINANCIAL_STRESS, ACCOUNT_CREATED, TRANSFER_COMPLETED, NET_WORTH_SNAPSHOT, CREDIT_SCORE_ADDED, INSURANCE_POLICY_CREATED, INVESTMENT_ADDED, PORTFOLIO_SNAPSHOT, FINANCIAL_FRICTION_CHANGED, RESONANCE_ROI_UPDATED, FIELD_VALUE_UPDATED, BUDGET_UPDATED, TRANSACTION_UPDATED, RECURRING_RULE_CREATED, RECURRING_POSTED, RETIREMENT_PLAN_CREATED, SUBSCRIPTION_CREATED, SUBSCRIPTION_CANCELLED, TAX_SUMMARY_GENERATED, TRANSACTION_CREATED, TRANSACTION_DELETED, BUDGET_CREATED, BUDGET_MODIFIED, GOAL_CREATED, GOAL_COMPLETED, FINANCIAL_HEALTH_CHECK, RISK_DETECTED, FINANCIAL_PLAN_CREATED, GOAL_PROGRESS, MODULE_STATE_UPDATED
- Spine events listened (in module files): none detected

**ATLAS**
- Actions registered: 34
- Spine events emitted (in module files): MODULE_PROFILE_UPDATED, NSV_CALIBRATION_REQUEST, DRAFT_PROPOSED, MODULE_DELEGATED, CRISIS_MODE, MORNING_BRIEF_DUE, WEEKLY_REVIEW_DUE, COMMITMENT_MISSED, delegate, TASK_COMPLETED, ATLAS_FIELD_CREATED, ATLAS_FIELD_DELETED, ATLAS_FIELD_VALUE_UPDATED, ATLAS_STATE_CHANGED, MORNING_BRIEF, ATLAS_RECOVERY_SCHEDULED, ATLAS_ADAPTIVE_SUGGESTION, ATLAS_RESCHEDULE_SUGGESTED, ATLAS_ENERGY_UPDATED, ATLAS_ENERGY_OVERLOAD, COGNITIVE_OVERLOAD, ATLAS_RECOVERY_WINDOW_CREATED, ATLAS_GOAL_UPDATED, ATLAS_GOAL_MILESTONE, ATLAS_GOAL_COMPLETED, GOAL_MISSING_PROGRESS, HABIT_STREAK_BROKEN, ATLAS_HABIT_MILESTONE, PLANNING_STATE_UPDATED, ATLAS_HABIT_LOGGED, JOURNAL_ENTRY_CREATED, JOURNAL_ENTRY_UPDATED, FLATTEN_ENERGY_WAVE, TEMPORAL_REVIEW_COMPLETE, ATLAS_ROUTINE_CONFLICT, ATLAS_TASK_CREATED, ROUTINE_UPDATED, ATLAS_PREDICTIVE_ALERT, ATLAS_TASK_BLOCKED, ATLAS_TASK_UNBLOCKED, ATLAS_TASK_COMPLETED, ATLAS_TASK_UNCOMPLETED, DEADLINE_APPROACHING, DEADLINE_PRESSURE_CHANGED, DELEGATION_REQUEST, SOMATIC_SUPPORT_REQUESTED, BURNOUT_TRAJECTORY_WARNING, PLANNING_OVERLOAD, MARK_TASK_DONE
- Spine events listened (in module files): VITAL_UPDATED, BURNOUT_WARNING, WEEKLY_REVIEW_DUE, MORNING_BRIEF_DUE, EVENING_CHECKIN_DUE, BLOCK_HIGH_INTENSITY, FLATTEN_ENERGY_WAVE, AGNES.INFER_TASK_COMPLETE, SOMA.VITALITY_CRITICAL, PLANNING_OVERLOAD, CRISIS_MODE

**SCOUT**
- Actions registered: 6
- Spine events emitted (in module files): DRAFT_PROPOSED, SESSION_STARTED, MODULE_HANDOFF_RECEIVED, MODULE_STATE_UPDATED, DEEP_RESEARCH_BACKUP_FOUND, RESEARCH_PROPOSED, EXPORT_REQUESTED, KNOWLEDGE_SYNTHESIZED, DEEP_RESEARCH_REQUESTED, DEEP_RESEARCH_STARTED, DEEP_RESEARCH_COMPLETED, SOURCE_ADDED, RESEARCH_SEARCHING, RESEARCH_RESULTS, SCOUT_PROFILE_UPDATED, SCOUT_CROSS_MODULE_QUERY, SCOUT_QUERY_RESULT_READY, DIGEST_GENERATION_STARTED, DIGEST_GENERATED, DIGEST_GENERATION_FAILED
- Spine events listened (in module files): SESSION_STARTED, DEEP_RESEARCH_STARTED, EXPORT_REQUESTED, DIGEST_GENERATION_STARTED, RESEARCH_PROPOSED, MODULE_HANDOFF_RECEIVED, SCOUT_PROFILE_UPDATED, KNOWLEDGE_SYNTHESIZED, DIGEST_GENERATED

**FORGE**
- Actions registered: 13
- Spine events emitted (in module files): DRAFT_PROPOSED
- Spine events listened (in module files): none detected

## Orchestration & Proposal Lifecycle Audit

- Mutation proposals originate in `OrchestrationActionGateService` and depend on action labels + policy gating for visibility.
- Routine and reminder proposals are Spine‑event driven; confirm/dismiss flows exist but are not globally enforced by policy.
- Planning suggestions are generated only for a subset of intents and do not cover non‑planning domains.
- Delegation emits `MODULE_DELEGATED` but relies on listeners to render or accept handoff; coverage is inconsistent across modules.

## Missing / Broken Point‑to‑Point Handling

- Event strings used outside SpineEventType indicate unmodeled flows (type drift).
- Events with emitters but no listeners represent silent failures (no downstream response).
- Actions with no labels and no prompt allowlists reduce visibility and auditability.
- Intents routed to modules without deterministic action plans rely entirely on free‑form LLM execution, leading to inconsistent behavior.

## Architecture‑Level Fixes (Robust Flow System)

1. **Flow Registry as Source of Truth**
- A single declarative registry mapping intents → capabilities → actions → events → proposals.
- Registry defines ownership, mutability, risk class, and visibility.

2. **Generated Artifacts From Registry**
- Auto‑generate action labels, allowed action lists, and Spine event catalogs.
- Auto‑generate proposal lifecycle handlers (confirm/dismiss/approve) per proposal type.

3. **Flow Validation Gates (CI + Runtime)**
- CI checks for unknown event strings, unlabeled actions, and unhandled proposal states.
- Runtime guards log and route unhandled events/actions to a system‑level incident queue.

4. **Intent‑to‑Action Determinism**
- Extend planning/dispatch coverage so every intent has a deterministic fallback path.
- Default to explicit proposals when intent mutates state and no deterministic action mapping exists.

5. **Unified Delegation & Rerouting Policy**
- Standardize delegation events and require at least one listener per delegation type.
- Add deterministic reroute rules when a module is locked/unavailable.

## Appendix: Detailed Lists

**Unknown event strings (not in SpineEventType)**
- NEURAL_TRANSMISSION_SENT, NEURAL_RESONANCE_RECEIVED, NEURAL_PROCESSING_STARTED, delegate, MARK_TASK_DONE, ACCOUNT_CREATED, TRANSFER_COMPLETED, NET_WORTH_SNAPSHOT, CREDIT_SCORE_ADDED, INSURANCE_POLICY_CREATED, INVESTMENT_ADDED, PORTFOLIO_SNAPSHOT, RECURRING_RULE_CREATED, RECURRING_POSTED, RETIREMENT_PLAN_CREATED, SUBSCRIPTION_CREATED, SUBSCRIPTION_CANCELLED, TAX_SUMMARY_GENERATED, MODULE_STATE_UPDATED, RESEARCH_PROPOSED, AGNES.INFER_TASK_COMPLETE, SOMA.VITALITY_CRITICAL, STRESS_SPIKE, soma_poor_readiness, clearance_revoked, soma_optimal_readiness

**Events never emitted (sample)**
- DEADLINE_CRUNCH, STREAK_BROKEN, SPENDING_DETECTED, DOCUMENT_ANALYZED, FINANCIAL_FRICTION_UPDATED, BUDGET_ALERT, OVERSPEND_DETECTED, DEBT_MILESTONE, SAVINGS_MILESTONE, INCOME_CHANGE, EXPENSE_SPIKE, CASHFLOW_POSITIVE, CASHFLOW_NEGATIVE, EVENING_CHECKIN_DUE, SCOUT_KNOWLEDGE_ENRICHED, HABIT_SUGGESTED, LEDGER_FIELD_SUGGESTION, FINANCIAL_STREAK_MILESTONE, ATLAS_NSV_SYNC_DISCREPANCY, ATLAS_DELEGATE_RESPONSE, DOCUMENT_ANALYSIS_FAILED, GOAL_VELOCITY_ALERT, CLAIM_CONTRADICTION_DETECTED, CRISIS_RECOVERY_INITIATED

**Events never listened (sample)**
- CLEARANCE_DENIED, CLEARANCE_GRANTED, COGNITIVE_OVERLOAD, SECURITY_POLICY_UPDATED, MEDICAL_ALERT, CRISIS_DETECTED, DRAFT_APPROVED, DRAFT_DISMISSED, STREAK_BROKEN, TASK_COMPLETED, DEADLINE_APPROACHING, HABIT_STREAK_BROKEN, TEMPORAL_REVIEW_COMPLETE, DELEGATION_REQUEST, NSV_CALIBRATION_REQUEST, SCHEMA_EXTENDED, SCHEMA_MODIFIED, SCHEMA_MIGRATED, FIELD_CREATED, FIELD_DELETED, FIELD_VALUE_UPDATED, ATLAS_RECOVERY_SCHEDULED, ATLAS_PREDICTIVE_ALERT, ATLAS_STATE_CHANGED, GOAL_MISSING_PROGRESS, ATLAS_TASK_COMPLETED, ATLAS_HABIT_LOGGED, ATLAS_GOAL_MILESTONE, ATLAS_GOAL_COMPLETED, ATLAS_ENERGY_UPDATED, ATLAS_ENERGY_OVERLOAD, ATLAS_RECOVERY_WINDOW_CREATED, ATLAS_TASK_CREATED, ATLAS_TASK_BLOCKED, ATLAS_TASK_UNBLOCKED, ATLAS_HABIT_MILESTONE, ATLAS_FIELD_CREATED, ATLAS_FIELD_DELETED, ATLAS_FIELD_VALUE_UPDATED, ATLAS_GOAL_UPDATED, …

**Actions missing labels (sample)**
- add_credit_score_entry, add_default_automation_rules, add_dividend, add_investment, add_receipt, add_tax_deduction, add_transaction, agnes_create_session_note, agnes_delete_session_note, agnes_set_somatic_mode, agnes_update_session_note, analyze_biomarker_trends, analyze_credit_score_trend, analyze_financial_document, analyze_insurance_coverage, analyze_receipts_by_tax_year, approve_health_entry, atlas_add_goal_milestone, atlas_delete_goal_milestone, atlas_update_goal_milestone, broadcast_spine_event, cancel_subscription, capture_nsv_snapshot, check_clearance_expiry, clear_workout_program, complete_check_in, complete_orchestrator_onboarding, compute_readiness, compute_resonance_roi, confirm_routine, create_account, create_alert_rule, create_automation_rule, create_checklist, create_document, create_insurance_policy, create_module_handoff, create_recovery_window, create_recurring_rule, create_retirement_plan, …

**Labels without actions (sample)**
- analyze_medical_image, parse_health_report, parse_workout_log, parse_biometric_data, log_sleep, create_cycle, advance_cycle_phase, complete_cycle, log_workout_session, suggest_agnes_session_invitation, create_research_request, schedule_task, log_habit, flatten_energy_wave, create_task, update_task, delete_task, record_transaction, update_budget, analyze_spending, update_field_value