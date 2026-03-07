import { useMemo } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector, SpineEvent } from '@/lib/types';

export type SynthesisSeverity = 'critical' | 'warning' | 'positive';

export interface SynthesisAction {
  label: string;
  type: 'ask_nexus' | 'consult_module' | 'navigate';
  payload: string;
}

export interface SynthesisAlert {
  id: string;
  severity: SynthesisSeverity;
  title: string;
  description: string;
  involvedDomains: string[];
  suggestedActions: SynthesisAction[];
  detectedAt: number;
}

function safeNum(v: number | null | undefined): number {
  return typeof v === 'number' ? v : -1;
}

function detectPatterns(nsv: NeuralStateVector): SynthesisAlert[] {
  const now = Date.now();
  const alerts: SynthesisAlert[] = [];

  const stress = safeNum(nsv.emotional?.stressLoad);
  const cnsFatigue = safeNum(nsv.biological?.cnsFatigue);
  const friction = safeNum(nsv.resource?.financialFriction);
  const resilience = safeNum(nsv.emotional?.emotionalResilience);
  const sleep = safeNum(nsv.biological?.sleepQuality);
  const focus = safeNum(nsv.cognitive?.focusScore);
  const activeLoad = safeNum(nsv.cognitive?.activeLoad);
  const recovery = safeNum(nsv.biological?.recoveryScore);
  const planningLoad = safeNum(nsv.cognitive?.planningLoad);
  const deadline = safeNum(nsv.planning?.deadlinePressure);
  const completion = safeNum(nsv.cognitive?.taskCompletionRate);
  const researchLoad = safeNum(nsv.cognitive?.researchLoad);
  const diversity = safeNum(nsv.cognitive?.interestDiversity);

  // COMPOUND_STRESS: 3+ domains under pressure
  if (stress >= 7 && cnsFatigue >= 6 && friction >= 6) {
    alerts.push({
      id: 'COMPOUND_STRESS',
      severity: 'critical',
      title: 'Compound Stress Pattern',
      description: 'Stress is compounding across emotional, physical, and financial domains. Consider delegating non-urgent tasks.',
      involvedDomains: ['emotional', 'biological', 'resource'],
      suggestedActions: [
        { label: 'Ask Nexus about this', type: 'ask_nexus', payload: 'Tell me more about the compound stress pattern you detected.' },
        { label: 'Consult Agnes', type: 'consult_module', payload: 'agnes' },
      ],
      detectedAt: now,
    });
  }

  // BURNOUT_TRAJECTORY
  if (activeLoad >= 8 && sleep >= 0 && sleep <= 4 && resilience >= 0 && resilience <= 4) {
    alerts.push({
      id: 'BURNOUT_TRAJECTORY',
      severity: 'critical',
      title: 'Burnout Trajectory',
      description: 'High cognitive load with poor sleep and low resilience — burnout risk is elevated.',
      involvedDomains: ['cognitive', 'biological', 'emotional'],
      suggestedActions: [
        { label: 'Ask Nexus about this', type: 'ask_nexus', payload: 'What should I do about the burnout trajectory you detected?' },
      ],
      detectedAt: now,
    });
  }

  // RECOVERY_WINDOW (positive)
  if (recovery >= 7 && stress >= 0 && stress <= 3 && activeLoad >= 0 && activeLoad <= 4) {
    alerts.push({
      id: 'RECOVERY_WINDOW',
      severity: 'positive',
      title: 'Recovery Window Open',
      description: 'Your body, mind, and emotions are aligned for growth or challenge.',
      involvedDomains: ['biological', 'emotional', 'cognitive'],
      suggestedActions: [
        { label: 'Open Titan', type: 'navigate', payload: '/titan' },
        { label: 'Open Atlas', type: 'navigate', payload: '/atlas' },
      ],
      detectedAt: now,
    });
  }

  // SLEEP_PERFORMANCE_GAP
  if (sleep >= 0 && sleep <= 4 && focus >= 0 && focus <= 4) {
    alerts.push({
      id: 'SLEEP_PERFORMANCE_GAP',
      severity: 'warning',
      title: 'Sleep → Performance Gap',
      description: 'Poor sleep is likely degrading your focus and cognitive performance.',
      involvedDomains: ['biological', 'cognitive'],
      suggestedActions: [
        { label: 'Consult Titan', type: 'consult_module', payload: 'titan' },
      ],
      detectedAt: now,
    });
  }

  // FINANCIAL_EMOTIONAL_LOOP
  if (friction >= 7 && stress >= 6) {
    alerts.push({
      id: 'FINANCIAL_EMOTIONAL_LOOP',
      severity: 'warning',
      title: 'Financial → Emotional Loop',
      description: 'Financial friction is amplifying emotional stress — consider addressing the financial domain first.',
      involvedDomains: ['resource', 'emotional'],
      suggestedActions: [
        { label: 'Open Ledger', type: 'navigate', payload: '/ledger' },
        { label: 'Consult Agnes', type: 'consult_module', payload: 'agnes' },
      ],
      detectedAt: now,
    });
  }

  // TRAINING_RECOVERY_CONFLICT
  if (cnsFatigue >= 7 && recovery >= 0 && recovery <= 3) {
    alerts.push({
      id: 'TRAINING_RECOVERY_CONFLICT',
      severity: 'warning',
      title: 'Training ↔ Recovery Conflict',
      description: 'CNS fatigue is high while recovery is low — training should be deloaded or paused.',
      involvedDomains: ['biological'],
      suggestedActions: [
        { label: 'Consult Titan', type: 'consult_module', payload: 'titan' },
      ],
      detectedAt: now,
    });
  }

  // PLANNING_COLLAPSE
  if (deadline >= 8 && planningLoad >= 8 && completion >= 0 && completion <= 0.3) {
    alerts.push({
      id: 'PLANNING_COLLAPSE',
      severity: 'critical',
      title: 'Planning Collapse',
      description: 'Deadlines are mounting while completion rate is critically low. Consider delegating or renegotiating.',
      involvedDomains: ['planning', 'cognitive'],
      suggestedActions: [
        { label: 'Open Atlas', type: 'navigate', payload: '/atlas' },
        { label: 'Ask Nexus about this', type: 'ask_nexus', payload: 'Help me triage my deadlines and planning overload.' },
      ],
      detectedAt: now,
    });
  }

  // INTEREST_HYPERFOCUS
  if (diversity >= 0 && diversity <= 2 && researchLoad >= 7) {
    alerts.push({
      id: 'INTEREST_HYPERFOCUS',
      severity: 'warning',
      title: 'Research Hyperfocus',
      description: 'Research is narrowing to a single thread — consider diversifying inputs.',
      involvedDomains: ['cognitive'],
      suggestedActions: [
        { label: 'Ask Nexus about this', type: 'ask_nexus', payload: 'Help me diversify my research focus.' },
      ],
      detectedAt: now,
    });
  }

  return alerts.slice(0, 3);
}

export interface UseNexusSynthesisReturn {
  alerts: SynthesisAlert[];
  recentSpineEvents: SpineEvent[];
  isAnalyzing: boolean;
}

export function useNexusSynthesis(): UseNexusSynthesisReturn {
  const { globalSoul, isLoading } = useGlobalSoul();

  const nsv = globalSoul?.crossFunctionalState ?? null;

  const alerts = useMemo(() => {
    if (!nsv) return [];
    return detectPatterns(nsv);
  }, [nsv]);

  const recentSpineEvents = useMemo(() => {
    return Spine.getRecentEvents().filter(
      (e) => e.source.startsWith('cascade:') || e.priority !== 'info'
    );
  }, [alerts]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    alerts,
    recentSpineEvents,
    isAnalyzing: isLoading,
  };
}
