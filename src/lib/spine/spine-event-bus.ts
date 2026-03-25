import { useEffect, useRef } from 'react';
import { SpineDomain, SpineEvent, SpineEventPayload, SpineEventPriority, SpineEventType } from '@/lib/types';
import type { NexusDataLayer } from '@/lib/data-layer';
import { adaptSpineEventToSpec, serializeSpecSpineEvent } from '@/lib/contracts/orchestration';
import { NexusLogger } from '@/lib/nexus-logger';

export interface CascadeRule {
  id: string;
  trigger: SpineEventType;
  condition: (event: SpineEvent) => boolean;
  transform: (event: SpineEvent) => SpineEventPayload;
}

export interface EventFilterOptions {
  minPriority?: 'info' | 'alert' | 'critical';
}

const PRIORITY_LEVELS = { info: 0, alert: 1, critical: 2 };
const SPINE_EVENTS_SUBCOLLECTION = 'events';
const SPINE_SPEC_EVENTS_SUBCOLLECTION = 'spec_events';

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
  private uid: string | null = null;
  private dataLayer: NexusDataLayer | null = null;
  private _sequenceCounter = 0;

  private readonly validDomains: SpineDomain[] = ['B', 'E', 'C', 'R', 'system'];
  private readonly validPriorities: SpineEventPriority[] = ['info', 'alert', 'critical'];

  setUser(uid: string | null): void {
    this.uid = uid;
  }

  /**
   * Inject a NexusDataLayer so Spine can persist events through the abstraction
   * layer instead of hitting Firebase directly. Call this at app bootstrap (main.tsx).
   * When set, `logEvent` prefers the data layer over the direct Firebase path,
   * enabling InMemoryDataLayer injection in tests.
   */
  setDataLayer(layer: NexusDataLayer): void {
    this.dataLayer = layer;
  }

  registerCascadeRules(rules: CascadeRule[]): void {
    const deduped = new Map<string, CascadeRule>();
    this.cascadeRules.forEach((rule) => deduped.set(rule.id, rule));
    rules.forEach((rule) => deduped.set(rule.id, rule));
    this.cascadeRules = Array.from(deduped.values());
  }

  publish(eventInput: SpineEventPayload): SpineEvent {
    return this.emit(eventInput);
  }

  subscribe(type: SpineEventType | '*', listener: Listener, options?: EventFilterOptions): () => void {
    return this.on(type, listener, options);
  }

  emit(eventInput: SpineEventPayload): SpineEvent {
    const normalized = this.validateAndNormalize(eventInput);
    const event: SpineEvent = {
      ...normalized,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      sequence: ++this._sequenceCounter,
      idempotencyKey: normalized.idempotencyKey ?? `${normalized.type}:${normalized.source}:${Date.now()}`,
    };

    const debounceKey = event.idempotencyKey ?? `${event.type}:${event.source}:${event.target ?? ''}`;
    if (this.debounceTimers.has(debounceKey)) return event;

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

    NexusLogger.spine(event.type, event.source, event.data);

    this.recentEvents = [event, ...this.recentEvents].slice(0, 50);

    if (event.cascadeDepth < 3) {
      const matchingRules = this.cascadeRules.filter((rule) => rule.trigger === event.type && rule.condition(event));
      matchingRules.forEach((rule) => {
        const cascaded = rule.transform(event);
        this.emit({
          ...cascaded,
          source: `cascade:${event.source}`,
          cascadeDepth: event.cascadeDepth + 1
        });
      });
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
  }

  private async logEvent(event: SpineEvent): Promise<void> {
    if (!this.uid) return;

    // Prefer NexusDataLayer when injected — supports InMemoryDataLayer in tests
    // and keeps Spine decoupled from the Firebase SDK.
    if (this.dataLayer) {
      await this.dataLayer.createDocument(`spine_events/${this.uid}/${SPINE_EVENTS_SUBCOLLECTION}`, event);

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
    console.error('[SpineEventBus] NexusDataLayer not injected. Cannot log event.');
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
