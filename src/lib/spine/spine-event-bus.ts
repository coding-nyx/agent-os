import { addDoc, collection } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { getFirebase } from '@/lib/firebase';
import { SpineEvent, SpineEventType } from '@/lib/types';

export interface CascadeRule {
  id: string;
  trigger: SpineEventType;
  condition: (event: SpineEvent) => boolean;
  transform: (event: SpineEvent) => Omit<SpineEvent, 'id' | 'timestamp' | 'cascadeDepth'>;
}

type Listener = (event: SpineEvent) => void;

class SpineEventBus {
  private listeners = new Map<string, Set<Listener>>();
  private recentEvents: SpineEvent[] = [];
  private cascadeRules: CascadeRule[] = [];
  private debounceTimers = new Map<string, number>();
  private uid: string | null = null;

  setUser(uid: string | null): void {
    this.uid = uid;
  }

  registerCascadeRules(rules: CascadeRule[]): void {
    this.cascadeRules = rules;
  }

  emit(eventInput: Omit<SpineEvent, 'id' | 'timestamp'>): void {
    const event: SpineEvent = {
      ...eventInput,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };

    const debounceKey = `${event.type}:${event.source}`;
    if (this.debounceTimers.has(debounceKey)) return;

    const timer = window.setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
    }, 500);
    this.debounceTimers.set(debounceKey, timer);

    const typeListeners = this.listeners.get(event.type) || new Set();
    const wildcardListeners = this.listeners.get('*') || new Set();
    [...typeListeners, ...wildcardListeners].forEach((listener) => listener(event));

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
  }

  on(type: SpineEventType | '*', listener: Listener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
    return () => {
      this.listeners.get(type)?.delete(listener);
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
    this.debounceTimers.forEach((timer) => window.clearTimeout(timer));
    this.debounceTimers.clear();
  }

  private async logEvent(event: SpineEvent): Promise<void> {
    if (!this.uid) return;
    const { db } = getFirebase();
    if (!db) return;

    await addDoc(collection(db, 'spine_events', this.uid, 'events'), event);
  }
}

export const Spine = new SpineEventBus();

export function useSpineEvent(type: SpineEventType | '*', handler: Listener): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    return Spine.on(type, (event) => handlerRef.current(event));
  }, [type]);
}
