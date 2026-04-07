import { useState, useCallback, useRef } from 'react';
import { useGlobalSoulStore, useGlobalSoulActions } from '@/lib/global-soul-context';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import type { SomaticExerciseType } from '../components/somatic/SomaticSessionPicker';
import type { SpineEvent } from '@/lib/types';
import type { AgnesState } from './types';

interface UseAgnesSomaticParams {
  currentState: AgnesState;
  onboardingComplete: boolean | undefined;
  setCurrentState: (state: AgnesState) => void;
}

export function useAgnesSomatic({
  currentState,
  onboardingComplete,
  setCurrentState,
}: UseAgnesSomaticParams) {
  const globalSoul = useGlobalSoulStore((s) => s.globalSoul);
  const { updateCrossFunctionalState } = useGlobalSoulActions();
  // Keep globalSoul in a ref so callbacks that read it at call-time don't list it as a dep.
  const globalSoulRef = useRef(globalSoul);
  globalSoulRef.current = globalSoul;

  const [selectedSomaticExercise, setSelectedSomaticExercise] = useState<SomaticExerciseType | null>(null);
  const somaticStartedAt = useRef<number>(0);

  // S14-006: Reactive Spine event handling
  const handledSpineEventsRef = useRef<Set<string>>(new Set());

  // Somatic support requested via Spine cascade (e.g. from Ledger or Soma)
  useSpineEvent('SOMATIC_SUPPORT_REQUESTED', useCallback((event: SpineEvent) => {
    if (currentState === 'session') return; // Don't interrupt active therapy session
    if (!onboardingComplete || currentState !== 'selecting') return;
    const eventKey = `somatic-req-${event.id}`;
    if (handledSpineEventsRef.current.has(eventKey)) return;
    handledSpineEventsRef.current.add(eventKey);

    // Auto-open somatic picker
    setCurrentState('somatic');
    setSelectedSomaticExercise(null);
  }, [onboardingComplete, currentState, setCurrentState]));

  const handleOpenSomatic = useCallback(() => {
    somaticStartedAt.current = Date.now();
    setSelectedSomaticExercise(null);
    setCurrentState('somatic');
  }, [setCurrentState]);

  const handleSomaticSelect = useCallback((exercise: SomaticExerciseType) => {
    somaticStartedAt.current = Date.now();
    setSelectedSomaticExercise(exercise);
  }, []);

  const handleSomaticComplete = useCallback(async () => {
    const durationSeconds = Math.round((Date.now() - somaticStartedAt.current) / 1000);
    const exerciseType = selectedSomaticExercise ?? 'breathwork';

    // Update NSV: reduce stress load, increase resilience
    // Read from ref so this callback doesn't need globalSoul as a dep.
    const emotional = globalSoulRef.current?.crossFunctionalState?.emotional;
    await updateCrossFunctionalState({
      emotional: {
        stressLoad: Math.max(0, (emotional?.stressLoad ?? 5) - 1.5),
        emotionalResilience: Math.min(10, (emotional?.emotionalResilience ?? 5) + 0.5),
      },
    });

    // Emit Spine event
    Spine.publish({
      type: 'SOMATIC_SESSION_COMPLETE',
      source: 'agnes',
      domain: 'E',
      priority: 'info',
      data: { exerciseType, durationSeconds, completedFully: true },
    });

    setCurrentState('selecting');
    setSelectedSomaticExercise(null);
  // globalSoul is read from globalSoulRef at call-time — no dep needed.
  }, [selectedSomaticExercise, updateCrossFunctionalState, setCurrentState]);

  const handleSomaticExit = useCallback(() => {
    setCurrentState('selecting');
    setSelectedSomaticExercise(null);
  }, [setCurrentState]);

  return {
    selectedSomaticExercise,
    handleOpenSomatic,
    handleSomaticSelect,
    handleSomaticComplete,
    handleSomaticExit,
  };
}
