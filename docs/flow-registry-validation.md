# Flow Registry Validation

Generated: 2026-03-27T06:14:22.272Z

## Errors
- None

## Warnings
- Registry action specs missing ActionHub registrations: 13
- ActionHub registrations missing registry specs: 74
- Unresolved ActionHub.registerMultiple spreads: 10
- SpineEventType entries missing from registry events: 12

## Details
### Intents Referencing Missing Action Specs
- None

### Registry Action Specs Missing ActionHub Registrations
- scout.web_search
- scout.list_sessions
- scout.resume_session
- scout.start_session
- scout.add_sources
- scout.synthesize_knowledge
- scout.search_web
- scout.generate_digest
- scout.start_deep_research
- scout.handoff_to_atlas
- ledger.create_financial_plan
- ledger.create_financial_plan_request
- scout.create_research_request

### ActionHub Registrations Missing Registry Specs
- titan.propose_routine
- atlas.create_field
- atlas.delete_field
- atlas.update_recovery_window
- atlas.delete_recovery_window
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
- ledger.sync_bank_account
- ledger.create_alert_rule
- ledger.delete_alert_rule
- ledger.dismiss_notification
- ledger.toggle_alert_rule
- ledger.create_automation_rule
- ledger.update_automation_rule
- ledger.delete_automation_rule
- ledger.toggle_automation_rule
- ledger.dismiss_suggestion
- ledger.add_credit_score_entry
- ledger.delete_credit_score_entry
- ledger.set_credit_factors
- ledger.export_transactions_csv
- ledger.export_tax_summary
- ledger.export_net_worth_report
- ledger.create_insurance_policy
- ledger.update_insurance_policy
- ledger.delete_insurance_policy
- ledger.add_investment
- ledger.update_investment
- ledger.delete_investment
- ledger.record_portfolio_snapshot
- ledger.add_dividend
- ledger.add_receipt
- ledger.delete_receipt
- ledger.link_receipt_to_transaction
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
- titan.clear_workout_program
- titan.log_workout_session
- titan.log_workout_set
- titan.suggest_progression
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
