/**
 * useAtlasPredictiveState
 *
 * React hook that owns the AtlasPredictiveService lifecycle.
 * Instantiates once on mount, re-evaluates when the NSV snapshot changes,
 * and tears down on unmount.
 *
 * S19-atlas-01: Emits ATLAS_OVERLOAD_DETECTED via Spine when the predictive
 * state transitions to Overloaded or Recovery.
 */

import { useEffect, useRef, useState } from 'react';
import { AtlasPredictiveService, AtlasState, AtlasStateDisplay } from '@/modules/atlas/services/atlas-predictive-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector } from '@/lib/types';

export interface UseAtlasPredictiveStateResult {
  display: AtlasStateDisplay;
  service: AtlasPredictiveService | null;
}

export function useAtlasPredictiveState(
  nsv: NeuralStateVector | null | undefined
): UseAtlasPredictiveStateResult {
  const serviceRef = useRef<AtlasPredictiveService | null>(null);

  // Seed the initial display from a fresh service instance (no cost — no Spine subscriptions yet)
  const [display, setDisplay] = useState<AtlasStateDisplay>(() =>
    new AtlasPredictiveService().getStateForDisplay()
  );

  // Create the service once and wire the onChange callback
  useEffect(() => {
    const svc = new AtlasPredictiveService((nextState: AtlasState) => {
      setDisplay(svc.getStateForDisplay());
      // S19-atlas-01: Emit ATLAS_OVERLOAD_DETECTED on Overloaded / Recovery transitions
      if (nextState === 'Overloaded' || nextState === 'Recovery') {
        Spine.publish({
          type: 'ATLAS_OVERLOAD_DETECTED',
          source: 'atlas-predictive-service',
          domain: 'C',
          priority: 'alert',
          data: { state: nextState, timestamp: new Date().toISOString() },
        });
      }
    });
    serviceRef.current = svc;

    return () => {
      svc.destroy();
      serviceRef.current = null;
    };
  }, []);

  // Re-evaluate whenever the NSV snapshot changes
  useEffect(() => {
    if (!nsv || !serviceRef.current) return;
    serviceRef.current.evaluate(nsv);
    setDisplay(serviceRef.current.getStateForDisplay());
  }, [nsv]);

  return { display, service: serviceRef.current };
}
