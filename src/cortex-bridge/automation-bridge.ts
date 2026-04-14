/**
 * automation-bridge.ts
 *
 * Singleton bridge for `AutomationServiceJs` (cortex-logic 2.0.0+).
 *
 * Usage:
 *   import { getAutomationService, subscribeToSuggestions, getSuggestionsSnapshot, pokeSuggestions } from '@/cortex-bridge/automation-bridge';
 *
 *   // Call once on user sign-in / vault unlock to inject credentials:
 *   setAutomationCredentials({ userId, encryptionKey });
 *
 *   // React components use useSyncExternalStore for live suggestions:
 *   const json = useSyncExternalStore(subscribeToSuggestions, getSuggestionsSnapshot);
 *
 *   // Trigger evaluation when the profile changes:
 *   useEffect(() => { pokeSuggestions(JSON.stringify(profile)); }, [profile]);
 *
 *   // Apply an LLM action:
 *   const service = getAutomationService();
 *   service?.apply('create_automation_rule', payloadJson, () => { ... }, (err) => { ... });
 *
 * The service is `null` if credentials haven't been set (user not signed in).
 *
 * This bridge follows the same pattern as `action-hub-bridge.ts`.
 */

import { AutomationServiceJs } from '@cortex-logic';
import { createAutomationStorageCallbacks } from '@/modules/ledger/services/automation-storage-adapter';

type AutomationServiceInstance = InstanceType<NonNullable<typeof AutomationServiceJs>>;

// ─── Module-level state ───────────────────────────────────────────────────────

let _instance: AutomationServiceInstance | null = null;
let _currentUserId: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _currentKey: any | null = null;

// ─── Credential injection ─────────────────────────────────────────────────────

/**
 * Updates the stored credentials. Call on sign-in, vault unlock, or whenever
 * the user/key pair changes. Forces the singleton to recreate on next access.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setAutomationCredentials(ctx: { userId: string | null; encryptionKey: any | null }): void {
  if (ctx.userId !== _currentUserId || ctx.encryptionKey !== _currentKey) {
    _currentUserId = ctx.userId;
    _currentKey = ctx.encryptionKey;
    _instance = null; // recreate on next access
  }
}

// ─── Singleton accessor ───────────────────────────────────────────────────────

/**
 * Returns the shared `AutomationServiceJs` instance, or `null` if either:
 * - The class isn't in the current cortex-logic bundle (pre-1.6.0)
 * - No credentials have been set yet
 */
export function getAutomationService(): AutomationServiceInstance | null {
  if (!AutomationServiceJs) return null; // cortex bundle doesn't include AutomationServiceJs yet
  if (!_currentUserId) return null;      // credentials not set

  if (!_instance) {
    const callbacks = createAutomationStorageCallbacks({
      userId: _currentUserId,
      encryptionKey: _currentKey,
    });
    _instance = new (AutomationServiceJs as new (...args: unknown[]) => AutomationServiceInstance)(
      callbacks.jsLoadRules,
      callbacks.jsSaveRules,
      callbacks.jsLoadStates,
      callbacks.jsSaveStates,
      callbacks.jsLoadSchedules,
      callbacks.jsSaveSchedules,
    );
  }

  return _instance;
}

/**
 * Returns the set of automation action IDs that cortex supports.
 * Delegates to `AutomationServiceJs.supportedActionIds()` when available,
 * falling back to the static list used by the legacy path.
 *
 * agnes uses this to keep its LLM prompt whitelist in sync with cortex.
 */
export function getAutomationActionIds(): Set<string> {
  const service = getAutomationService();
  if (service) {
    try {
      const ids = JSON.parse((service as any).supportedActionIds()) as string[];
      return new Set(ids);
    } catch {
      // fall through
    }
  }
  // Static fallback — matches AUTOMATION_ACTION_IDS in cortex.
  return new Set([
    'create_automation_rule',
    'update_automation_rule',
    'delete_automation_rule',
    'toggle_automation_rule',
    'dismiss_suggestion',
    'add_default_automation_rules',
  ]);
}

// ─── Suggestion cache (useSyncExternalStore-compatible) ───────────────────────

type SuggestionsListener = () => void;
const _suggestionsListeners = new Set<SuggestionsListener>();
let _suggestionsSnapshot = '[]';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pendingEvalTask: any | null = null;

/**
 * Subscribe to suggestion cache updates. Pass directly to `useSyncExternalStore`.
 * Returns an unsubscribe function.
 */
export function subscribeToSuggestions(listener: SuggestionsListener): () => void {
  _suggestionsListeners.add(listener);
  return () => { _suggestionsListeners.delete(listener); };
}

/**
 * Return the latest suggestion JSON array. Pass directly to `useSyncExternalStore`.
 * Returns `'[]'` until the first evaluation completes.
 */
export function getSuggestionsSnapshot(): string {
  return _suggestionsSnapshot;
}

/**
 * Trigger an async evaluation against the current profile.
 * Cancels any in-flight evaluation before starting the new one.
 * Called from `useEffect([profile])` in components that display suggestions.
 */
export function pokeSuggestions(profileJson: string): void {
  const service = getAutomationService();
  if (!service) return;
  // Cancel any previous in-flight evaluation.
  try { _pendingEvalTask?.cancel?.(); } catch { /* ignore */ }
  // Normalize label→name on expense items so KMP LedgerExpense deserialization
  // doesn't throw MissingFieldException (TypeScript uses 'label', Kotlin uses 'name').
  const normalizedJson = (() => {
    try {
      const p = JSON.parse(profileJson);
      const mapExpenses = (arr: unknown[]) =>
        arr.map((e) => { const i = e as Record<string, unknown>; return { ...i, name: i['name'] ?? i['label'] ?? '' }; });
      if (Array.isArray(p.fixedExpenses)) p.fixedExpenses = mapExpenses(p.fixedExpenses);
      if (Array.isArray(p.variableExpenses)) p.variableExpenses = mapExpenses(p.variableExpenses);
      return JSON.stringify(p);
    } catch { return profileJson; }
  })();
  _pendingEvalTask = (service as any).evaluate(
    normalizedJson,
    (json: string) => {
      _suggestionsSnapshot = json;
      _pendingEvalTask = null;
      _suggestionsListeners.forEach(l => l());
    },
    (_err: string) => {
      _pendingEvalTask = null;
    },
  );
}
