# Flow Registry Validation

Generated: 2026-03-29T20:02:05.161Z

## Errors
- None

## Warnings
- Registry action specs missing ActionHub registrations: 14
- ActionHub registrations missing registry specs: 115
- Unresolved ActionHub.registerMultiple spreads: 10
- SpineEventType entries missing from registry events: 19

## Details
### Intents Referencing Missing Action Specs
- None

### Registry Action Specs Missing ActionHub Registrations
- atlas.update_task_graph
- agnes.update_emotional_state
- scout.web_search
- atlas.complete_goal
- scout.list_sessions
- scout.resume_session
- scout.start_session
- scout.add_sources
- scout.synthesize_knowledge
- scout.search_web
- scout.generate_digest
- scout.start_deep_research
- scout.handoff_to_atlas
- scout.create_research_request

### ActionHub Registrations Missing Registry Specs
- nexus.query_module_capability
- nexus.notify_turn_complete
- nexus.capture_nsv_snapshot
- nexus.execute_rollback
- nexus.mutate_module_data
- titan.propose_routine
- atlas.create_field
- atlas.delete_field
- agnes.agnes_create_session_note
- agnes.agnes_update_session_note
- agnes.agnes_delete_session_note
- agnes.agnes_set_somatic_mode
- agnes.track_emotional_trajectory
- agnes.predict_session_outcome
- agnes.update_emergency_contact
- agnes.update_psychiatric_history
- agnes.initiate_crisis_recovery_protocol
- atlas.update_recovery_window
- atlas.delete_recovery_window
- atlas.atlas_add_goal_milestone
- atlas.atlas_update_goal_milestone
- atlas.atlas_delete_goal_milestone
- atlas.create_project
- atlas.update_project
- atlas.delete_project
- ledger.create_account
- ledger.update_account
- ledger.delete_account
- ledger.transfer_funds
- ledger.reconcile_account
- ledger.record_net_worth_snapshot
- ledger.generate_cash_flow_forecast
- ledger.create_alert_rule
- ledger.delete_alert_rule
- ledger.dismiss_notification
- ledger.toggle_alert_rule
- ledger.create_automation_rule
- ledger.update_automation_rule
- ledger.delete_automation_rule
- ledger.toggle_automation_rule
- ledger.dismiss_suggestion
- ledger.add_default_automation_rules
- ledger.add_credit_score_entry
- ledger.delete_credit_score_entry
- ledger.set_credit_factors
- ledger.analyze_credit_score_trend
- ledger.export_transactions_csv
- ledger.export_tax_summary
- ledger.export_net_worth_report
- ledger.create_insurance_policy
- ledger.update_insurance_policy
- ledger.delete_insurance_policy
- ledger.analyze_insurance_coverage
- ledger.add_investment
- ledger.update_investment
- ledger.delete_investment
- ledger.record_portfolio_snapshot
- ledger.add_dividend
- ledger.ledger_update_budget_category_name
- ledger.ledger_update_transaction_notes
- ledger.add_receipt
- ledger.delete_receipt
- ledger.link_receipt_to_transaction
- ledger.analyze_receipts_by_tax_year
- ledger.create_recurring_rule
- ledger.update_recurring_rule
- ledger.delete_recurring_rule
- ledger.post_recurring_now
- ledger.skip_next_occurrence
- ledger.create_retirement_plan
- ledger.update_retirement_plan
- ledger.delete_retirement_plan
- ledger.project_retirement
- ledger.create_subscription
- ledger.update_subscription
- ledger.delete_subscription
- ledger.cancel_subscription
- ledger.set_tax_category
- ledger.add_tax_deduction
- ledger.delete_tax_deduction
- ledger.generate_tax_summary
- ledger.ledger_update_tax_info
- ledger.update_financial_plan
- ledger.update_budget_snapshot
- ledger.log_transaction_summary
- ledger.analyze_financial_document
- ledger.parse_financial_statement
- ledger.add_transaction
- soma.check_clearance_expiry
- soma.analyze_biomarker_trends
- soma.soma_update_medical_summary
- soma.soma_add_known_condition
- soma.soma_remove_known_condition
- soma.soma_add_medication
- soma.soma_remove_medication
- soma.soma_add_allergy
- soma.soma_remove_allergy
- soma.soma_update_physical_assessment
- soma.soma_log_next_checkup
- titan.clear_workout_program
- titan.log_workout_session
- titan.log_workout_set
- titan.suggest_progression
- titan.suggest_exercise_substitute
- titan.apply_program_template
- titan.Guards
- titan.Optional
- titan.Cap
- titan.propose_sleep_log
- titan.propose_workout_log
- titan.Payload
- titan.Complexity
- titan.log_injury
- titan.update_injury
- titan.log_meal

### Unresolved registerMultiple Spreads
- src/modules/atlas/services/actions/index.ts -> routineActions (no exported object found in src/modules/atlas/services/actions/routine-actions.ts)
- src/modules/atlas/services/actions/index.ts -> taskActions (no exported object found in src/modules/atlas/services/actions/task-actions.ts)
- src/modules/atlas/services/actions/index.ts -> journalActions (no exported object found in src/modules/atlas/services/actions/journal-actions.ts)
- src/modules/titan/services/actions/index.ts -> biomarkerHandlers (no exported object found in src/modules/titan/services/actions/biomarker-actions.ts)
- src/modules/titan/services/actions/index.ts -> sleepHandlers (no exported object found in src/modules/titan/services/actions/sleep-actions.ts)
- src/modules/titan/services/actions/index.ts -> cycleHandlers (no exported object found in src/modules/titan/services/actions/cycle-actions.ts)
- src/modules/titan/services/actions/index.ts -> bodyHandlers (no exported object found in src/modules/titan/services/actions/body-actions.ts)
- src/modules/titan/services/actions/index.ts -> recoveryHandlers (no exported object found in src/modules/titan/services/actions/recovery-actions.ts)
- src/modules/titan/services/actions/index.ts -> goalHandlers (no exported object found in src/modules/titan/services/actions/goal-actions.ts)
- src/modules/titan/services/actions/index.ts -> scheduleHandlers (no exported object found in src/modules/titan/services/actions/schedule-actions.ts)

### Registry Events Missing From SpineEventType
- None

### SpineEventType Entries Missing From Registry Events
- ATLAS_ROUTINE_CONFLICT
- ATLAS_ADAPTIVE_SUGGESTION
- ATLAS_RESCHEDULE_SUGGESTED
- REMINDER_CANCELLED
- TITAN_MEAL_LOGGED
- SCOUT_KNOWLEDGE_ENRICHED
- SCOUT_QUERY_RESULT_READY
- SCOUT_CROSS_MODULE_QUERY
- BURNOUT_TRAJECTORY_WARNING
- ATLAS_NSV_SYNC_DISCREPANCY
- ATLAS_DELEGATE_RESPONSE
- ATLAS_TASK_UNCOMPLETED
- MEDICAL_HISTORY_UPDATED
- DOCUMENT_ANALYSIS_FAILED
- CLEARANCE_EXPIRED
- EMOTIONAL_TRAJECTORY_DETECTED
- GOAL_VELOCITY_ALERT
- CLAIM_CONTRADICTION_DETECTED
- CRISIS_RECOVERY_INITIATED
