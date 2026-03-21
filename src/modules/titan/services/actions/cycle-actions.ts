import {
  loadProfile,
  persistProfile,
  Spine,
} from './shared';
import type { ActionHandler, TitanProfile, CycleEntry, CyclePhase, CycleType } from './shared';

export const cycleHandlers: Record<string, ActionHandler> = {

  create_cycle: async ({ userId, encryptionKey, payload }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const rawPhases = Array.isArray(payload?.phases) ? payload.phases : [];
    const phases: CyclePhase[] = rawPhases
      .filter((p: unknown) => p && typeof p === 'object')
      .map((p: Record<string, unknown>) => ({
        id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
        name: typeof p.name === 'string' ? p.name : 'Phase',
        durationDays: typeof p.durationDays === 'number' && Number.isFinite(p.durationDays)
          ? Math.max(1, Math.floor(p.durationDays))
          : 7,
        notes: typeof p.notes === 'string' ? p.notes : undefined,
        dosage: typeof p.dosage === 'string' ? p.dosage : undefined,
        trainingModifier:
          p.trainingModifier === 'increase' || p.trainingModifier === 'maintain' ||
          p.trainingModifier === 'reduce' || p.trainingModifier === 'rest'
            ? p.trainingModifier
            : undefined,
      }));

    if (phases.length === 0) return;

    const now = new Date().toISOString();
    const cycle: CycleEntry = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      name: typeof payload?.name === 'string' ? payload.name : 'Custom Cycle',
      type: (['workout', 'recovery', 'custom'] as const).includes(payload?.type as CycleType)
        ? payload.type as CycleType
        : 'workout',
      description: typeof payload?.description === 'string' ? payload.description : undefined,
      startDate: typeof payload?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) ? payload.startDate : now.slice(0, 10),
      endDate: typeof payload?.endDate === 'string' ? payload.endDate : undefined,
      phases,
      currentPhaseIndex: 0,
      currentPhaseStartDate: typeof payload?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) ? payload.startDate : now.slice(0, 10),
      status: 'active',
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
      cycleLength: typeof payload?.cycleLength === 'number' ? payload.cycleLength : undefined,
      lastPeriodDate: typeof payload?.lastPeriodDate === 'string' ? payload.lastPeriodDate : undefined,
      linkedRoutineIds: Array.isArray(payload?.linkedRoutineIds)
        ? (payload.linkedRoutineIds as unknown[]).filter((id): id is string => typeof id === 'string')
        : undefined,
      deloadWeekNumber: typeof payload?.deloadWeekNumber === 'number' && payload.deloadWeekNumber > 0
        ? payload.deloadWeekNumber
        : undefined,
      progressionScheme: (['linear', 'wave', 'block', 'undulating'] as const).includes((payload?.progressionScheme ?? 'linear') as 'linear' | 'wave' | 'block' | 'undulating')
        ? payload.progressionScheme as CycleEntry['progressionScheme']
        : undefined,
      createdAt: now,
      updatedAt: now,
    };

    const next: TitanProfile = {
      ...profile,
      cycles: [cycle, ...(profile.cycles ?? [])].slice(0, 50),
      updatedAt: now,
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    Spine.emit({
      type: 'CYCLE_STARTED',
      source: 'titan',
      domain: 'B',
      data: { cycleId: cycle.id, name: cycle.name, type: cycle.type },
      cascadeDepth: 0,
      priority: 'info',
    });
  },

  advance_cycle_phase: async ({ userId, encryptionKey, payload }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile || !profile.cycles) return;

    const cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId : null;
    if (!cycleId) return;

    if (!profile.cycles.some(c => c.id === cycleId)) {
      console.warn(`advance_cycle_phase: cycle "${cycleId}" not found — no-op`);
      return;
    }

    const now = new Date().toISOString();
    const updatedCycles = profile.cycles.map((cycle) => {
      if (cycle.id !== cycleId) return cycle;
      const nextPhaseIndex = cycle.currentPhaseIndex + 1;
      if (nextPhaseIndex >= cycle.phases.length) {
        // All phases done — mark complete
        return { ...cycle, status: 'completed' as const, updatedAt: now };
      }
      return {
        ...cycle,
        currentPhaseIndex: nextPhaseIndex,
        currentPhaseStartDate: now.slice(0, 10),
        updatedAt: now,
      };
    });

    const next: TitanProfile = { ...profile, cycles: updatedCycles, updatedAt: now };
    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    const cycle = updatedCycles.find(c => c.id === cycleId);
    if (cycle?.status === 'completed') {
      Spine.emit({
        type: 'CYCLE_COMPLETED',
        source: 'titan',
        domain: 'B',
        data: { cycleId: cycle.id, name: cycle.name, type: cycle.type },
        cascadeDepth: 0,
        priority: 'info',
      });
    }
  },

  complete_cycle: async ({ userId, encryptionKey, payload }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile || !profile.cycles) return;

    const cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId : null;
    if (!cycleId) return;

    const now = new Date().toISOString();
    const updatedCycles = profile.cycles.map((cycle) =>
      cycle.id === cycleId
        ? { ...cycle, status: 'completed' as const, updatedAt: now }
        : cycle
    );

    await persistProfile({ ...profile, cycles: updatedCycles, updatedAt: now }, userId ?? null, encryptionKey ?? null);
  },

};
