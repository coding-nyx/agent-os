import { useEffect, useRef } from 'react';
import { SpineDomain, SpineEvent, SpineEventPayload, SpineEventPriority, SpineEventType } from '@/lib/types';
import type { AraDataLayer } from '@/lib/data-layer';
import { adaptSpineEventToSpec, serializeSpecSpineEvent } from '@/lib/contracts/orchestration';
import { AraLogger } from '@/lib/ara-logger';
import { NotificationContentResolverJs } from '@cortex-logic';

export interface CascadeRule {
  id: string;
  trigger: SpineEventType;
  condition: (event: SpineEvent) => boolean;
  transform: (event: SpineEvent) => SpineEventPayload;
}

export interface EventFilterOptions {
  minPriority?: 'info' | 'warning' | 'alert' | 'critical';
}

export interface CascadeTruncationRecord {
  timestamp: number;
  triggerType: SpineEventType;
  source: string;
  cascadeDepth: number;
  matchingRuleIds: string[];
}

export interface CascadeDiagnosticsSnapshot {
  maxCascadeDepth: number;
  truncationCount: number;
  truncationCountByTrigger: Record<string, number>;
  recentTruncations: CascadeTruncationRecord[];
}

const PRIORITY_LEVELS = { info: 0, warning: 1, alert: 2, critical: 3 };
const SPINE_EVENTS_SUBCOLLECTION = 'events';
const SPINE_SPEC_EVENTS_SUBCOLLECTION = 'spec_events';
const MAX_CASCADE_DEPTH = 3;
const MAX_RECENT_CASCADE_TRUNCATIONS = 100;

/**
 * System alert event types that must be rate-limited in the client process.
 * These are the same types rate-limited server-side in bridgeSpineEvents.
 * This prevents the cascade rules from flooding the Spine bus (and Firestore)
 * with duplicate alerts within a short window.
 */
const CASCADE_ALERT_RATE_LIMITED_TYPES = new Set<string>([
  'BURNOUT_WARNING',
  'BLOCK_HIGH_INTENSITY',
  'FINANCIAL_STRESS',
  'COGNITIVE_OVERLOAD',
  'CRISIS_MODE',
  'PLANNING_OVERLOAD',
  'STREAK_BROKEN',
  'MEDICAL_ALERT',
  'DEADLINE_CRUNCH',
  'CRISIS_DETECTED',
  'ATLAS_ENERGY_OVERLOAD',
  'ATLAS_OVERLOAD_DETECTED',
  'BURNOUT_TRAJECTORY_WARNING',
  'ATLAS_PREDICTIVE_ALERT',
  'COMMITMENT_MISSED',
  'BUDGET_ALERT',
  'OVERSPEND_DETECTED',
  'EXPENSE_SPIKE',
  'CASHFLOW_NEGATIVE',
  'DEADLINE_APPROACHING',
  'AI_LINK_FAILURE',
]);

/** Minimum ms between cascade emissions of the same system alert type. Default: 60 minutes. */
const CASCADE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** Lazily-created singleton for the KMP notification content resolver. */
let _notificationResolver: InstanceType<typeof NotificationContentResolverJs> | null = null;
function getNotificationResolver(): InstanceType<typeof NotificationContentResolverJs> | null {
  if (_notificationResolver) return _notificationResolver;
  try {
    _notificationResolver = new (NotificationContentResolverJs as any)();
    return _notificationResolver;
  } catch {
    return null;
  }
}

/**
 * Resolve notification title/body via the KMP NotificationContentResolver and
 * merge them into the event's data map so that downstream consumers (Cloud
 * Functions, Android FCM handler) receive pre-resolved content.
 */
function enrichWithNotificationContent(event: SpineEvent): SpineEvent {
  const resolver = getNotificationResolver();
  if (!resolver) return event;
  try {
    const resultJson = resolver.resolve(event.type, JSON.stringify(event.data));
    if (!resultJson) return event;
    const { title, body } = JSON.parse(resultJson) as { title: string; body: string };
    return {
      ...event,
      data: {
        ...event.data,
        _notificationTitle: title,
        _notificationBody: body,
      },
    };
  } catch {
    return event;
  }
}

type Listener = (event: SpineEvent) => void;
interface ListenerRegistration {
  handler: Listener;
  options?: EventFilterOptions;
}

class SpineEventBus {
  private listeners = new Map<string, Set<ListenerRegistration>>();
  private recentEvents: SpineEvent[] = [];
  private cascadeRules: CascadeRule[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Tracks the last emission timestamp (ms) for rate-limited cascade alert types. */
  private _alertCooldowns = new Map<string, number>();
  private _cascadeTruncationCount = 0;
  private _cascadeTruncationByTrigger = new Map<SpineEventType, number>();
  private _recentCascadeTruncations: CascadeTruncationRecord[] = [];
  private uid: string | null = null;
  private dataLayer: AraDataLayer | null = null;
  private _sequenceCounter = 0;

  private readonly validDomains: SpineDomain[] = ['B', 'E', 'C', 'R', 'system'];
  private readonly validPriorities: SpineEventPriority[] = ['info', 'warning', 'alert', 'critical'];

  setUser(uid: string | null): void {
    this.uid = uid;
  }

  /**
   * Inject a AraDataLayer so Spine can persist events through the abstraction
   * layer instead of hitting Firebase directly. Call this at app bootstrap (main.tsx).
   * When set, `logEvent` prefers the data layer over the direct Firebase path,
   * enabling InMemoryDataLayer injection in tests.
   */
  setDataLayer(layer: AraDataLayer): void {
    this.dataLayer = layer;
  }

  registerCascadeRules(rules: CascadeRule[]): void {
    const deduped = new Map<string, CascadeRule>();
    this.cascadeRules.forEach((rule) => deduped.set(rule.id, rule));
    rules.forEach((rule) => deduped.set(rule.id, rule));
    this.cascadeRules = Array.from(deduped.values());
  }

  /**
   * Remove a single cascade rule by ID so it no longer fires.
   * Used by CascadeRuleRegistry.disable().
   */
  unregisterCascadeRule(ruleId: string): void {
    this.cascadeRules = this.cascadeRules.filter((rule) => rule.id !== ruleId);
  }

  publish(eventInput: SpineEventPayload): SpineEvent {
    return this.emit(eventInput);
  }

  subscribe(type: SpineEventType | '*', listener: Listener, options?: EventFilterOptions): () => void {
    return this.on(type, listener, options);
  }

  emit(eventInput: SpineEventPayload): SpineEvent {
    const normalized = this.validateAndNormalize(eventInput);

    // Build a stable debounce key BEFORE assigning a unique idempotencyKey.
    // The debounce key uses type:source:target so that logically identical
    // events emitted within the 500ms window are deduplicated regardless of
    // timing jitter. Callers may supply an explicit `idempotencyKey` to
    // control deduplication granularity.
    const debounceKey = normalized.idempotencyKey ?? `${normalized.type}:${normalized.source}:${normalized.target ?? ''}`;
    if (this.debounceTimers.has(debounceKey)) {
      // Return a synthetic event so callers still get a valid SpineEvent back,
      // but skip all listeners, cascades, and persistence.
      return {
        ...normalized,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sequence: ++this._sequenceCounter,
        idempotencyKey: debounceKey,
      } as SpineEvent;
    }

    const event: SpineEvent = {
      ...normalized,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      sequence: ++this._sequenceCounter,
      idempotencyKey: normalized.idempotencyKey ?? debounceKey,
    };

    const timer = globalThis.setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
    }, 500);
    this.debounceTimers.set(debounceKey, timer);

    const typeListeners = this.listeners.get(event.type) || new Set();
    const wildcardListeners = this.listeners.get('*') || new Set();
    const allListeners = [...typeListeners, ...wildcardListeners];

    allListeners.forEach((reg) => {
      if (reg.options?.minPriority) {
        if (PRIORITY_LEVELS[event.priority] < PRIORITY_LEVELS[reg.options.minPriority]) {
          return; // Skip if event priority is below minimum required
        }
      }
      reg.handler(event);
    });

    AraLogger.spine(event.type, event.source, event.data);

    this.recentEvents = [event, ...this.recentEvents].slice(0, 50);

    const matchingRules = this.cascadeRules.filter((rule) => rule.trigger === event.type && rule.condition(event));
    if (matchingRules.length > 0) {
      if (event.cascadeDepth >= MAX_CASCADE_DEPTH) {
        this.recordCascadeTruncation(event, matchingRules);
      } else {
        matchingRules.forEach((rule) => {
          const cascaded = rule.transform(event);

          // Rate-limit cascade emissions for system alert types to prevent a
          // single VITAL_UPDATED in a critical state from flooding the bus and
          // Firestore with repeated push notifications.
          if (CASCADE_ALERT_RATE_LIMITED_TYPES.has(cascaded.type as string)) {
            const lastEmittedMs = this._alertCooldowns.get(cascaded.type as string) ?? 0;
            if (Date.now() - lastEmittedMs < CASCADE_ALERT_COOLDOWN_MS) {
              return; // suppress — same alert type already emitted within cooldown window
            }
            this._alertCooldowns.set(cascaded.type as string, Date.now());
          }

          this.emit({
            ...cascaded,
            source: `cascade:${event.source}`,
            cascadeDepth: event.cascadeDepth + 1
          });
        });
      }
    }

    if (event.priority !== 'info') {
      this.logEvent(event).catch((error) => {
        console.warn('[SpineEventBus] Failed to log event:', error);
      });
    }

    return event;
  }

  on(type: SpineEventType | '*', listener: Listener, options?: EventFilterOptions): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    const registration = { handler: listener, options };
    this.listeners.get(type)?.add(registration);
    return () => {
      this.listeners.get(type)?.delete(registration);
    };
  }

  getRecentEvents(filter?: { type?: SpineEventType; source?: string }): SpineEvent[] {
    return this.recentEvents.filter((event) => {
      const typeMatch = !filter?.type || event.type === filter.type;
      const sourceMatch = !filter?.source || event.source === filter.source;
      return typeMatch && sourceMatch;
    });
  }

  clear(): void {
    this.listeners.clear();
    this.recentEvents = [];
    this.cascadeRules = [];
    this.debounceTimers.forEach((timer) => globalThis.clearTimeout(timer));
    this.debounceTimers.clear();
    this._alertCooldowns.clear();
    this.resetCascadeDiagnostics();
  }

  /** Exposed for testing: reset the alert cooldown registry without a full clear(). */
  resetAlertCooldowns(): void {
    this._alertCooldowns.clear();
  }

  getCascadeDiagnostics(): CascadeDiagnosticsSnapshot {
    const truncationCountByTrigger: Record<string, number> = {};
    this._cascadeTruncationByTrigger.forEach((count, eventType) => {
      truncationCountByTrigger[eventType] = count;
    });

    return {
      maxCascadeDepth: MAX_CASCADE_DEPTH,
      truncationCount: this._cascadeTruncationCount,
      truncationCountByTrigger,
      recentTruncations: [...this._recentCascadeTruncations],
    };
  }

  resetCascadeDiagnostics(): void {
    this._cascadeTruncationCount = 0;
    this._cascadeTruncationByTrigger.clear();
    this._recentCascadeTruncations = [];
  }

  private async logEvent(event: SpineEvent): Promise<void> {
    if (!this.uid) return;

    // Resolve notification content from KMP before persistence so the Cloud
    // Function receives pre-resolved title/body in the Firestore document.
    const enrichedEvent = enrichWithNotificationContent(event);

    // Prefer AraDataLayer when injected — supports InMemoryDataLayer in tests
    // and keeps Spine decoupled from the Firebase SDK.
    if (this.dataLayer) {
      await this.dataLayer.createDocument(`spine_events/${this.uid}/${SPINE_EVENTS_SUBCOLLECTION}`, enrichedEvent);

      try {
        await this.dataLayer.createDocument(
          `spine_events/${this.uid}/${SPINE_SPEC_EVENTS_SUBCOLLECTION}`,
          serializeSpecSpineEvent(adaptSpineEventToSpec(event)),
        );
      } catch (error) {
        console.error('[SpineEventBus] Failed to persist spec-adapted event:', error);
      }
      return;
    }

    // If dataLayer is not injected, logEvent fails. This is desired behavior to prevent Firebase coupling.
    // Log an error to indicate the missing dependency.
    console.error('[SpineEventBus] AraDataLayer not injected. Cannot log event.');
  }

  private validateAndNormalize(event: SpineEventPayload): SpineEventPayload & { cascadeDepth: number } {
    if (!event || typeof event !== 'object') {
      throw new Error('[SpineEventBus] Event payload must be an object');
    }

    if (!event.type) {
      throw new Error('[SpineEventBus] Missing required field: type');
    }

    if (!event.source || typeof event.source !== 'string') {
      throw new Error('[SpineEventBus] Missing or invalid required field: source');
    }

    if (!this.validDomains.includes(event.domain)) {
      throw new Error(`[SpineEventBus] Invalid domain "${event.domain}"`);
    }

    if (!this.validPriorities.includes(event.priority)) {
      throw new Error(`[SpineEventBus] Invalid priority "${event.priority}"`);
    }

    if (event.data === undefined || event.data === null || typeof event.data !== 'object') {
      throw new Error('[SpineEventBus] Missing or invalid required field: data');
    }

    if (event.cascadeDepth !== undefined && typeof event.cascadeDepth !== 'number') {
      throw new Error('[SpineEventBus] cascadeDepth must be a number when provided');
    }

    return {
      ...event,
      cascadeDepth: event.cascadeDepth ?? 0
    };
  }

  private recordCascadeTruncation(event: SpineEvent, matchingRules: CascadeRule[]): void {
    this._cascadeTruncationCount += 1;
    this._cascadeTruncationByTrigger.set(
      event.type,
      (this._cascadeTruncationByTrigger.get(event.type) ?? 0) + 1,
    );

    const record: CascadeTruncationRecord = {
      timestamp: Date.now(),
      triggerType: event.type,
      source: event.source,
      cascadeDepth: event.cascadeDepth,
      matchingRuleIds: matchingRules.map((rule) => rule.id),
    };
    this._recentCascadeTruncations = [record, ...this._recentCascadeTruncations].slice(
      0,
      MAX_RECENT_CASCADE_TRUNCATIONS,
    );

    AraLogger.emit('spine', {
      moduleId: event.source,
      label: 'CASCADE_TRUNCATED',
      detail: record,
    });
    AraLogger.warn(
      'SpineEventBus',
      `Cascade truncated at depth ${event.cascadeDepth} for ${event.type}`,
      { matchingRuleIds: record.matchingRuleIds, source: event.source },
    );
  }
}

export const Spine = new SpineEventBus();

export function useSpineEvent(type: SpineEventType | '*', handler: Listener, options?: EventFilterOptions): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    return Spine.on(type, (event) => handlerRef.current(event), optionsRef.current);
  }, [type]);
}
