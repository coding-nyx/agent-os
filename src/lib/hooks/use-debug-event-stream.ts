/**
 * useDebugEventStream — subscribes to AraLogger's observable event stream.
 *
 * Returns an auto-updating array of the most recent debug events.
 * Only active when debugMode is ON — zero overhead otherwise.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { AraLogger, type DebugEvent, type DebugEventCategory } from '@/lib/ara-logger';

const MAX_VISIBLE = 150;

export function useDebugEventStream(
  debugMode: boolean,
  filter?: DebugEventCategory | '*',
): DebugEvent[] {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const category = filter ?? '*';

  // Seed with existing buffer on mount / debug-mode enable
  useEffect(() => {
    if (!debugMode) {
      setEvents([]);
      return;
    }
    const seed = AraLogger.getRecentEvents(MAX_VISIBLE);
    setEvents(category === '*' ? seed : seed.filter((e) => e.category === category));
  }, [debugMode, category]);

  // Subscribe to live events
  useEffect(() => {
    if (!debugMode) return;

    const unsub = AraLogger.subscribe(category, (event) => {
      setEvents((prev) => {
        const next = [...prev, event];
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });
    });

    return unsub;
  }, [debugMode, category]);

  return events;
}

export function useDebugEventCount(debugMode: boolean): {
  total: number;
  sinceLastOpen: number;
  resetCounter: () => void;
} {
  const [sinceLastOpen, setSinceLastOpen] = useState(0);
  const counterRef = useRef(0);

  useEffect(() => {
    if (!debugMode) {
      counterRef.current = 0;
      setSinceLastOpen(0);
      return;
    }

    const unsub = AraLogger.subscribe('*', () => {
      counterRef.current += 1;
      setSinceLastOpen(counterRef.current);
    });

    return unsub;
  }, [debugMode]);

  const resetCounter = useCallback(() => {
    counterRef.current = 0;
    setSinceLastOpen(0);
  }, []);

  return {
    total: AraLogger.events.length,
    sinceLastOpen,
    resetCounter,
  };
}
