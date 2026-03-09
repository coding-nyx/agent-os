/**
 * useAtlasPredictiveState
 *
 * React hook that owns the AtlasPredictiveService lifecycle.
 * Instantiates once on mount, re-evaluates when the NSV snapshot changes,
 * and tears down on unmount.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AtlasPredictiveService, AtlasState, AtlasStateDisplay } from '@/modules/atlas/services/atlas-predictive-service';
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
