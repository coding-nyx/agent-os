import { LedgerAutomationEngineJs } from '@cortex-logic';
import type { AutomationRule, AutomationSuggestion, LedgerIntakeProfile } from './ledger-intake-service';

const _engine = new LedgerAutomationEngineJs();

/**
 * Evaluates all enabled AutomationRules against the current profile and returns
 * a list of AutomationSuggestions. These are SUGGESTIONS ONLY — no auto-execution.
 * The user must review and manually act on them.
 */
export function evaluateAutomationRules(profile: LedgerIntakeProfile): AutomationSuggestion[] {
  return JSON.parse(_engine.evaluateRules(JSON.stringify(profile), new Date().toISOString()));
}

/** Returns a set of default automation rules for a new user. */
export function getDefaultAutomationRules(): AutomationRule[] {
  return JSON.parse(_engine.getDefaultRules(new Date().toISOString()));
}
