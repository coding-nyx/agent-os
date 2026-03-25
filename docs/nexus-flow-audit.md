# Nexus Flow Functionality Audit

This report audits intents, actions, proposals, and Spine events for end‑to‑end flow integrity, and proposes architecture‑level fixes to achieve a robust flow system.

## Executive Summary

- Spine events declared: 153
- Spine events used: 131
- Events never emitted: 45
- Events never listened: 109
- Unknown event strings in code (not in SpineEventType): 13
- Actions registered: 130
- Actions without labels: 111
- Labels without actions: 17
- Intents defined: 11
- Intents not supported by action planner: 7

## Key Integrity Findings

**Spine Events**
- 45 declared events are never emitted (dead flow or missing emitters).
- 109 declared events are never listened to (no downstream handling).
- 13 event strings are used but not typed in SpineEventType: NEURAL_TRANSMISSION_SENT, NEURAL_RESONANCE_RECEIVED, NEURAL_PROCESSING_STARTED, delegate, ATLAS_TASK_UNCOMPLETED, MARK_TASK_DONE, rest, AGNES.INFER_TASK_COMPLETE, SOMA.VITALITY_CRITICAL, STRESS_SPIKE, soma_poor_readiness, clearance_revoked, soma_optimal_readiness
- Dynamic event references exist (emitters: 27, listeners: 2). These bypass static verification.

**Actions & Proposals**
- 111 actions are missing human labels (proposal and audit UX inconsistency).
- 17 labels reference actions that are not registered (stale UI strings).
- 7 intents are routed but lack structured action plan support: emotional_support, fitness, medical, financial, research, technical, general.

**Flow Breakpoints (systemic)**
- SpineEventBus only persists non‑info events; info‑level flows are invisible to notifications and audit history unless handled elsewhere.
- Action label registry is not the source of truth; it drifts from action registrations.
- Intent routing and action planning are partially decoupled; non‑planning intents lack deterministic orchestration paths.

## End‑to‑End Flow Coverage (By Module)

**NEXUS**
- Actions registered: 31
- Spine events emitted (in module files): MODULE_DELEGATED, VITAL_UPDATED, REDUCE_TRAINING_LOAD
- Spine events listened (in module files): *, MODULE_DELEGATED, VITAL_UPDATED, SESSION_ENDED

**AGNES**
- Actions registered: 10
- Spine events emitted (in module files): VITAL_UPDATED, SOMATIC_SESSION_COMPLETE, CRISIS_DETECTED, BURNOUT_WARNING, COMPOUND_STRESS
- Spine events listened (in module files): SOMATIC_SUPPORT_REQUESTED

**TITAN**
- Actions registered: 11
- Spine events emitted (in module files): MODULE_DELEGATED, FLATTEN_ENERGY_WAVE, BLOCK_HIGH_INTENSITY, RECOVERY_AVAILABLE, SOMA_LAB_REPORT_PARSED, rest, TITAN_RECOVERY_NEEDED, SOMA_VETO_OVERRIDDEN, SOMA_BIOMARKER_COMMITTED, MEDICAL_ALERT, TITAN_BODY_WEIGHT_LOGGED, WORKOUT_COMPLETED, SOMA_READINESS_UPDATED, CYCLE_STARTED, CYCLE_COMPLETED, TITAN_PROPOSAL, TITAN_TRAINING_STREAK
- Spine events listened (in module files): BURNOUT_WARNING, TITAN_PROPOSAL, MODULE_HANDOFF_RECEIVED, COMPOUND_STRESS, COMMITMENT_MISSED, FINANCIAL_STRESS, REDUCE_TRAINING_LOAD, RECOVERY_AVAILABLE

**SOMA**
- Actions registered: 17
- Spine events emitted (in module files): MODULE_PROFILE_UPDATED, BLOCK_HIGH_INTENSITY, RECOVERY_AVAILABLE, SOMA_PROFILE_UPDATED, SOMA_DIAGNOSIS_MERGED, SOMA_DIAGNOSIS_DISCARDED, SOMA_VITAL_LOGGED, SOMA_LAB_REPORT_PARSED
- Spine events listened (in module files): WORKOUT_COMPLETED, TITAN_BODY_WEIGHT_LOGGED

**LEDGER**
- Actions registered: 18
- Spine events emitted (in module files): FIELD_CREATED, FIELD_DELETED, FINANCIAL_FRICTION_CHANGED, RESONANCE_ROI_UPDATED, FIELD_VALUE_UPDATED, TRANSACTION_CREATED, TRANSACTION_UPDATED, TRANSACTION_DELETED, BUDGET_CREATED, BUDGET_MODIFIED, GOAL_CREATED, GOAL_COMPLETED, FINANCIAL_HEALTH_CHECK, RISK_DETECTED, FINANCIAL_PLAN_CREATED, GOAL_PROGRESS, LEDGER_FIELD_SUGGESTION
- Spine events listened (in module files): none detected

**ATLAS**
- Actions registered: 29
- Spine events emitted (in module files): NSV_CALIBRATION_REQUEST, MODULE_DELEGATED, MODULE_PROFILE_UPDATED, CRISIS_MODE, MORNING_BRIEF_DUE, WEEKLY_REVIEW_DUE, COMMITMENT_MISSED, delegate, TASK_COMPLETED, ATLAS_RECOVERY_SCHEDULED, ATLAS_STATE_CHANGED, ATLAS_GOAL_UPDATED, ATLAS_GOAL_COMPLETED, HABIT_STREAK_BROKEN, PLANNING_STATE_UPDATED, ATLAS_HABIT_LOGGED, JOURNAL_ENTRY_CREATED, JOURNAL_ENTRY_UPDATED, TEMPORAL_REVIEW_COMPLETE, ROUTINE_UPDATED, ATLAS_TASK_UNCOMPLETED, ATLAS_TASK_COMPLETED, DEADLINE_APPROACHING, DEADLINE_PRESSURE_CHANGED, DELEGATION_REQUEST, ATLAS_PREDICTIVE_ALERT, PLANNING_OVERLOAD, GOAL_MISSING_PROGRESS, MARK_TASK_DONE
- Spine events listened (in module files): VITAL_UPDATED, BURNOUT_WARNING, WEEKLY_REVIEW_DUE, MORNING_BRIEF_DUE, EVENING_CHECKIN_DUE, BLOCK_HIGH_INTENSITY, FLATTEN_ENERGY_WAVE, AGNES.INFER_TASK_COMPLETE, SOMA.VITALITY_CRITICAL, PLANNING_OVERLOAD, CRISIS_MODE

**SCOUT**
- Actions registered: 16
- Spine events emitted (in module files): SESSION_STARTED, DEEP_RESEARCH_STARTED, DEEP_RESEARCH_COMPLETED, SOURCE_ADDED, KNOWLEDGE_SYNTHESIZED, RESEARCH_SEARCHING, RESEARCH_RESULTS, HABIT_SUGGESTED, DIGEST_GENERATION_STARTED, DIGEST_GENERATED, DIGEST_GENERATION_FAILED, SCOUT_PROFILE_UPDATED
- Spine events listened (in module files): SESSION_STARTED, DEEP_RESEARCH_STARTED, EXPORT_REQUESTED, DIGEST_GENERATION_STARTED, SCOUT_PROFILE_UPDATED, KNOWLEDGE_SYNTHESIZED, DIGEST_GENERATED

**FORGE**
- Actions registered: 12
- Spine events emitted (in module files): none detected
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
- NEURAL_TRANSMISSION_SENT, NEURAL_RESONANCE_RECEIVED, NEURAL_PROCESSING_STARTED, delegate, ATLAS_TASK_UNCOMPLETED, MARK_TASK_DONE, rest, AGNES.INFER_TASK_COMPLETE, SOMA.VITALITY_CRITICAL, STRESS_SPIKE, soma_poor_readiness, clearance_revoked, soma_optimal_readiness

**Events never emitted (sample)**
- CLEARANCE_DENIED, CLEARANCE_GRANTED, COGNITIVE_OVERLOAD, SECURITY_POLICY_UPDATED, DEADLINE_CRUNCH, EXECUTION_COLLAPSE, STREAK_BROKEN, SPENDING_DETECTED, ATLAS_GOAL_MILESTONE, ATLAS_ENERGY_UPDATED, ATLAS_ENERGY_OVERLOAD, ATLAS_RECOVERY_WINDOW_CREATED, ATLAS_TASK_CREATED, ATLAS_TASK_BLOCKED, ATLAS_TASK_UNBLOCKED, ATLAS_HABIT_MILESTONE, ATLAS_FIELD_CREATED, ATLAS_FIELD_DELETED, ATLAS_FIELD_VALUE_UPDATED, BUDGET_UPDATED, DOCUMENT_ANALYZED, FINANCIAL_FRICTION_UPDATED, BUDGET_ALERT, OVERSPEND_DETECTED, DEBT_MILESTONE, SAVINGS_MILESTONE, INCOME_CHANGE, EXPENSE_SPIKE, CASHFLOW_POSITIVE, CASHFLOW_NEGATIVE, SOMA_CLEARANCE_CHANGED, SOMA_FIELD_CREATED, SOMA_FIELD_UPDATED, SOMA_FIELD_DELETED, HEALTH_CONTEXT_STALE, MODULE_REMINDER_DUE, MODULE_REMINDER_COMPLETED, SOMATIC_SUPPORT_REQUESTED, EVENING_CHECKIN_DUE, MORNING_BRIEF, …

**Events never listened (sample)**
- CLEARANCE_DENIED, CLEARANCE_GRANTED, COGNITIVE_OVERLOAD, SECURITY_POLICY_UPDATED, MEDICAL_ALERT, CRISIS_DETECTED, DRAFT_APPROVED, DRAFT_DISMISSED, EXECUTION_COLLAPSE, STREAK_BROKEN, TASK_COMPLETED, DEADLINE_APPROACHING, HABIT_STREAK_BROKEN, TEMPORAL_REVIEW_COMPLETE, DELEGATION_REQUEST, NSV_CALIBRATION_REQUEST, SCHEMA_EXTENDED, SCHEMA_MODIFIED, SCHEMA_MIGRATED, FIELD_CREATED, FIELD_DELETED, FIELD_VALUE_UPDATED, ATLAS_RECOVERY_SCHEDULED, ATLAS_PREDICTIVE_ALERT, ATLAS_STATE_CHANGED, GOAL_MISSING_PROGRESS, ATLAS_TASK_COMPLETED, ATLAS_HABIT_LOGGED, ATLAS_GOAL_MILESTONE, ATLAS_GOAL_COMPLETED, ATLAS_ENERGY_UPDATED, ATLAS_ENERGY_OVERLOAD, ATLAS_RECOVERY_WINDOW_CREATED, ATLAS_TASK_CREATED, ATLAS_TASK_BLOCKED, ATLAS_TASK_UNBLOCKED, ATLAS_HABIT_MILESTONE, ATLAS_FIELD_CREATED, ATLAS_FIELD_DELETED, ATLAS_FIELD_VALUE_UPDATED, …

**Actions missing labels (sample)**
- add_sources, approve_diagnosis_merge, approve_health_entry, broadcast_spine_event, budget_event, complete_check_in, complete_goal, complete_habit, complete_orchestrator_onboarding, compute_readiness, compute_resonance_roi, confirm_routine, create_budget, create_checklist, create_document, create_goal, create_module_handoff, create_recovery_window, create_transaction, crisis_flag, delegate_to_module, delete_goal, delete_habit, delete_transaction, detect_data_hint, detect_risk, dismiss_routine, draft_email, edit_section, execute_code, explain_validation_error, financial_health_check, flatten_schedule, flatten_schedule_fail_once, focus_bio, focus_identity, focus_review, generate_digest, get_biomarker_history, get_lab_history, …

**Labels without actions (sample)**
- analyze_medical_image, parse_health_report, parse_workout_log, parse_biometric_data, log_sleep, create_cycle, advance_cycle_phase, complete_cycle, log_workout_session, suggest_agnes_session_invitation, schedule_task, log_habit, flatten_energy_wave, record_transaction, update_budget, analyze_spending, update_field_value