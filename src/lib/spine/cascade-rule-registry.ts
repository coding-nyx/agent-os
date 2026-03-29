import type { CascadeRule } from './cascade-rules';

/**
 * CascadeRuleRegistry — runtime enable/disable control for cascade rules.
 *
 * Rules are registered here first, then forwarded to the Spine when enabled.
 * Disabling a rule prevents it from firing until re-enabled (session-scoped;
 * for persistent disabling, persist `disabledRuleIds` to user preferences and
 * call `disable()` during bootstrap).
 */
class CascadeRuleRegistryImpl {
  private readonly rules = new Map<string, CascadeRule>();
  private readonly disabled = new Set<string>();
  private spineRef: { registerCascadeRules: (rules: CascadeRule[]) => void; unregisterCascadeRule?: (id: string) => void } | null = null;

  /**
   * Provide the Spine instance so the registry can forward enable/disable to it.
   * Must be called once at bootstrap before any register() calls.
   */
  setSpine(spine: { registerCascadeRules: (rules: CascadeRule[]) => void; unregisterCascadeRule?: (id: string) => void }): void {
    this.spineRef = spine;
  }

  /**
   * Register a rule with the registry. If not disabled, also registers it with Spine.
   */
  register(rule: CascadeRule): void {
    this.rules.set(rule.id, rule);
    if (!this.disabled.has(rule.id) && this.spineRef) {
      this.spineRef.registerCascadeRules([rule]);
    }
  }

  /**
   * Register multiple rules at once.
   */
  registerAll(rules: CascadeRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  /**
   * Disable a rule by ID. If the rule is currently registered with Spine,
   * attempts to unregister it (requires Spine support for `unregisterCascadeRule`).
   */
  disable(ruleId: string): void {
    this.disabled.add(ruleId);
    this.spineRef?.unregisterCascadeRule?.(ruleId);
  }

  /**
   * Re-enable a previously disabled rule. Re-registers it with Spine if present.
   */
  enable(ruleId: string): void {
    if (!this.disabled.has(ruleId)) return;
    this.disabled.delete(ruleId);
    const rule = this.rules.get(ruleId);
    if (rule && this.spineRef) {
      this.spineRef.registerCascadeRules([rule]);
    }
  }

  isDisabled(ruleId: string): boolean {
    return this.disabled.has(ruleId);
  }

  /**
   * Bulk-disable a list of IDs. Used during bootstrap to restore persisted preferences.
   */
  applyDisabledList(ruleIds: string[]): void {
    for (const id of ruleIds) {
      this.disable(id);
    }
  }

  getAll(): CascadeRule[] {
    return Array.from(this.rules.values());
  }

  getEnabled(): CascadeRule[] {
    return this.getAll().filter((r) => !this.disabled.has(r.id));
  }
}

export const CascadeRuleRegistry = new CascadeRuleRegistryImpl();
