# Flow Registry Review Report

This report highlights heuristic promotions and flow risks that require human review.

## Baseline Snapshot

- Spine events declared: 153
- Spine events used: 131
- Unknown event strings: 13
- Actions registered: 130
- Actions unlabeled: 111
- Intents not planned: 7

## Heuristic Promotions

- Actions promoted heuristically (still in registry): 0
- Actions with auto-generated labels: 122
- High-risk actions detected: 29
- Mutating actions detected: 132
- Staged heuristic actions: 144
- Staged heuristic events: 153

## Event Coverage Risks

- Events with no producers: 0
- Events with no consumers: 0

## High-Risk Actions (Sample)

- titan.request_clearance (Request Clearance)
- atlas.update_energy_budget (Update Energy Budget)
- nexus.delete_field (Removing custom tracking field)
- ledger.delete_field (Removing custom tracking field)
- soma.delete_field (Removing custom tracking field)
- titan.delete_field (Removing custom tracking field)
- ledger.record_transaction_retry_success (Record Transaction Retry Success)
- ledger.record_transaction_retry_fail (Record Transaction Retry Fail)
- atlas.create_goal (Create Goal)
- ledger.create_goal (Create Goal)
- atlas.update_goal_progress (Update Goal Progress)
- atlas.update_goal (Updating strategic goal progress)
- atlas.delete_goal (Delete Goal)
- atlas.complete_goal (Complete Goal)
- ledger.complete_goal (Complete Goal)
- atlas.delete_habit (Delete Habit)
- forge.budget_event (Budget Event)
- ledger.create_transaction (Create Transaction)
- ledger.update_transaction (Update Transaction)
- ledger.delete_transaction (Delete Transaction)
- ledger.create_budget (Create Budget)
- ledger.modify_budget (Modify Budget)
- soma.issue_clearance (Evaluating medical clearance)
- soma.approve_diagnosis_merge (Approve Diagnosis Merge)
- soma.reject_diagnosis_merge (Reject Diagnosis Merge)
- titan.self_clearance_check (Performing readiness clearance check)
- soma.create_medical_review (Create Medical Review)
- ledger.create_financial_plan (Create Financial Plan)
- ledger.create_financial_plan_request (Create Financial Plan Request)

## Auto-Generated Labels (Sample)

- scout.query_knowledge → "Query Knowledge"
- agnes.update_soul_resilience → "Update Soul Resilience"
- agnes.update_emotional_resilience → "Update Emotional Resilience"
- agnes.update_stress_load → "Update Stress Load"
- agnes.update_mood_trend → "Update Mood Trend"
- agnes.update_trauma_markers → "Update Trauma Markers"
- titan.update_cns_fatigue → "Update Cns Fatigue"
- titan.update_sleep_quality → "Update Sleep Quality"
- titan.request_clearance → "Request Clearance"
- atlas.flatten_schedule → "Flatten Schedule"
- atlas.update_task_graph → "Update Task Graph"
- agnes.update_emotional_state → "Update Emotional State"
- atlas.update_energy_budget → "Update Energy Budget"
- atlas.update_focus_score → "Update Focus Score"
- atlas.update_active_load → "Update Active Load"
- atlas.update_planning_load → "Update Planning Load"
- atlas.update_task_completion_rate → "Update Task Completion Rate"
- scout.update_research_load → "Update Research Load"
- scout.track_research_thread → "Track Research Thread"
- scout.update_research_interests → "Update Research Interests"
- scout.synthesize_research_trends → "Synthesize Research Trends"
- scout.update_interest_diversity → "Update Interest Diversity"
- atlas.update_streak_health → "Update Streak Health"
- atlas.update_deadline_pressure → "Update Deadline Pressure"
- ledger.update_resonance_roi → "Update Resonance Roi"
- ledger.compute_resonance_roi → "Compute Resonance Roi"
- ledger.update_financial_friction → "Update Financial Friction"
- nexus.detect_data_hint → "Detect Data Hint"
- nexus.propose_draft → "Propose Draft"
- nexus.delegate_to_module → "Delegate To Module"

## Events Missing Producers (Sample)

- none

## Events Missing Consumers (Sample)

- none
