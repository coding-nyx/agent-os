import { describe, expect, it } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import type { AtlasGoal, AtlasHabit, JournalEntry, PhysicalAssessment, SleepEntry, VitalReading, WorkoutSession } from '@/lib/types';
import type { FinancialGoal, Transaction } from '@/modules/ledger/services/ledger-intake-service';
import {
  ALIVE_ENTITY_COLLECTION,
  adaptAtlasGoalToAliveEntity,
  adaptAtlasHabitToAliveEntity,
  adaptLedgerFinancialGoalToAliveEntity,
  adaptLedgerTransactionToAliveEntity,
  adaptSomaPhysicalAssessmentToAliveEntity,
  adaptTitanSleepEntryToAliveEntity,
  adaptTitanWorkoutSessionToAliveEntity,
  bootstrapAliveEntities,
  buildAliveEntityRuntimeContext,
  createAliveEntity,
  dedupeAliveEntities,
  listAliveEntities,
  syncAliveEntities,
  upsertAliveEntity,
} from './alive-entity-service';

const goal: AtlasGoal = {
  id: 'goal-1',
  title: 'Ship phase 0.1',
  description: 'Build platform layer',
  deadline: '2026-03-31',
  milestones: [],
  associatedTaskIds: ['task-1'],
  successCriteria: 'Platform contracts merged',
  progressPercent: 60,
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

const habit: AtlasHabit = {
  id: 'habit-1',
  title: 'Morning review',
  frequency: 'daily',
  targetStreak: 30,
  currentStreak: 10,
  bestStreak: 12,
  energyCost: 2,
  minimumViableVersion: 'Review top 3 tasks',
  status: 'active',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

const journal: JournalEntry = {
  id: '2026-03-03',
  date: '2026-03-03',
  createdAt: '2026-03-03T00:00:00.000Z',
  updatedAt: '2026-03-03T01:00:00.000Z',
  morningIntent: 'Focus',
  eveningReflection: 'Good progress',
  freeform: 'Notes',
  mood: 4,
  energyLevel: 3,
  gratitude: ['health'],
  blockers: 'none',
  aiPromptUsed: null,
  tags: ['deep-work'],
  sketch: null,
};

const reading: VitalReading = {
  timestamp: Date.parse('2026-03-03T10:00:00.000Z'),
  heartRate: 58,
};

const assessment: PhysicalAssessment = {
  timestamp: Date.parse('2026-03-03T12:00:00.000Z'),
  weight: 78,
  vo2Max: 48,
  strength: 72,
};

const financialGoal: FinancialGoal = {
  id: 'fgoal-1',
  name: 'Emergency fund',
  type: 'savings',
  targetAmount: 12000,
  currentAmount: 6000,
  monthlyContribution: 500,
  priority: 'high',
  createdAt: '2026-03-05T00:00:00.000Z',
};

const transaction: Transaction = {
  id: 'tx-1',
  date: '2026-03-06',
  description: 'Rent',
  amount: 1800,
  type: 'expense',
  category: 'Housing',
  isRecurring: true,
};

const workoutSession: WorkoutSession = {
  id: 'workout-1',
  routineId: 'routine-1',
  routineName: 'Lower Body A',
  date: '2026-03-07',
  startedAt: '2026-03-07T09:00:00.000Z',
  completedAt: '2026-03-07T10:00:00.000Z',
  exercises: [
    {
      exerciseName: 'Squat',
      plannedSets: 3,
      plannedReps: '5',
      sets: [
        { setNumber: 1, repsCompleted: 5, completed: true, weight: 100 },
        { setNumber: 2, repsCompleted: 5, completed: true, weight: 100 },
        { setNumber: 3, repsCompleted: 5, completed: false, weight: 100 },
      ],
    },
  ],
  totalVolume: 1000,
  rpe: 8,
  status: 'partial',
};

const sleepEntry: SleepEntry = {
  id: 'sleep-1',
  date: '2026-03-07',
  durationHours: 7.5,
  quality: 8,
  tags: ['recovered'],
  recordedAt: '2026-03-07T07:00:00.000Z',
};

describe('alive-entity-service', () => {
  it('normalizes alive entities', () => {
    const entity = createAliveEntity({
      id: 'alive.custom',
      type: 'ACTION',
      label: '  Custom Action  ',
      semantic_tags: [' Atlas ', 'atlas', 'focus'],
      attributes: {},
      soul_impact_preset: { bandwidth: 0.4 },
      sourceModule: 'atlas',
      provenance: 'native',
    });

    expect(entity.label).toBe('Custom Action');
    expect(entity.semantic_tags).toEqual(['atlas', 'focus']);
  });

  it('adapts atlas goals into alive entities', () => {
    const entity = adaptAtlasGoalToAliveEntity(goal);
    expect(entity.id).toBe('alive.goal.goal-1');
    expect(entity.type).toBe('ACTION');
    expect(entity.sourceEntityId).toBe(goal.id);
  });

  it('adapts ledger, titan, and soma records into alive entities', () => {
    expect(adaptLedgerFinancialGoalToAliveEntity(financialGoal)).toMatchObject({
      id: 'alive.ledger.goal.fgoal-1',
      sourceModule: 'ledger',
      type: 'ACTION',
    });
    expect(adaptLedgerTransactionToAliveEntity(transaction)).toMatchObject({
      id: 'alive.ledger.transaction.tx-1',
      sourceModule: 'ledger',
      type: 'LOG',
    });
    expect(adaptTitanWorkoutSessionToAliveEntity(workoutSession)).toMatchObject({
      id: 'alive.titan.workout.workout-1',
      sourceModule: 'titan',
      type: 'LOG',
    });
    expect(adaptTitanSleepEntryToAliveEntity(sleepEntry)).toMatchObject({
      id: 'alive.titan.sleep.sleep-1',
      sourceModule: 'titan',
      type: 'METRIC',
    });
    expect(adaptSomaPhysicalAssessmentToAliveEntity(assessment)).toMatchObject({
      id: `alive.assessment.${assessment.timestamp}`,
      sourceModule: 'soma',
      type: 'METRIC',
    });
  });

  it('bootstraps alive entities from multiple module records', () => {
    const entities = bootstrapAliveEntities({
      goals: [goal],
      habits: [habit],
      journalEntries: [journal],
      vitalReadings: [reading],
      physicalAssessments: [assessment],
      ledgerFinancialGoals: [financialGoal],
      ledgerTransactions: [transaction],
      titanWorkoutSessions: [workoutSession],
      titanSleepEntries: [sleepEntry],
    });

    expect(entities.map((entity) => entity.id)).toEqual([
      'alive.titan.workout.workout-1',
      'alive.titan.sleep.sleep-1',
      'alive.ledger.transaction.tx-1',
      'alive.ledger.goal.fgoal-1',
      `alive.assessment.${assessment.timestamp}`,
      `alive.vital.${reading.timestamp}`,
      'alive.journal.2026-03-03',
      'alive.goal.goal-1',
      'alive.habit.habit-1',
    ]);
  });

  it('deduplicates alive entities with provenance precedence and stable ids', async () => {
    const adapterEntity = adaptAtlasGoalToAliveEntity(goal);
    const nativeEntity = createAliveEntity({
      ...adapterEntity,
      provenance: 'native',
      label: 'Native goal',
      updatedAt: '2026-03-03T00:00:00.000Z',
    });

    const deduped = dedupeAliveEntities([adapterEntity, nativeEntity]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].label).toBe('Native goal');

    const dataLayer = new InMemoryDataProvider();
    await syncAliveEntities(dataLayer, [adapterEntity, nativeEntity]);
    const stored = await listAliveEntities(dataLayer);
    expect(stored).toHaveLength(1);
    expect(stored[0].provenance).toBe('native');
  });

  it('builds runtime context for orchestration consumers', () => {
    const context = buildAliveEntityRuntimeContext([
      adaptAtlasGoalToAliveEntity(goal),
      adaptLedgerFinancialGoalToAliveEntity(financialGoal),
      adaptLedgerTransactionToAliveEntity(transaction),
      adaptTitanWorkoutSessionToAliveEntity(workoutSession),
    ], { limitPerModule: 1 });

    expect(context.total).toBe(4);
    expect(context.moduleIds).toEqual(['titan', 'ledger', 'atlas']);
    expect(context.byModule.ledger).toHaveLength(1);
    expect(context.tags).toContain('ledger');
    expect(context.lastUpdatedAt).toBe('2026-03-07T10:00:00.000Z');
  });

  it('persists alive entities through the data layer', async () => {
    const dataLayer = new InMemoryDataProvider();
    await upsertAliveEntity(dataLayer, adaptAtlasGoalToAliveEntity(goal));

    const stored = await listAliveEntities(dataLayer);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('alive.goal.goal-1');

    const atlasOnly = await listAliveEntities(dataLayer, 'atlas');
    expect(atlasOnly).toHaveLength(1);
    expect(atlasOnly[0].sourceModule).toBe('atlas');
  });

  it('uses the alive entity collection constant', async () => {
    const dataLayer = new InMemoryDataProvider();
    await upsertAliveEntity(dataLayer, adaptAtlasGoalToAliveEntity(goal));
    const docs = await dataLayer.listDocuments(ALIVE_ENTITY_COLLECTION);
    expect(docs).toHaveLength(1);
  });


  it('prunes stale alive entities within the incoming id prefixes when requested', async () => {
    const dataLayer = new InMemoryDataProvider();
    await syncAliveEntities(
      dataLayer,
      [
        adaptLedgerFinancialGoalToAliveEntity(financialGoal),
        adaptLedgerFinancialGoalToAliveEntity({ ...financialGoal, id: 'fgoal-stale', name: 'Old goal' }),
        adaptLedgerTransactionToAliveEntity(transaction),
      ],
      { uid: 'user-1' },
    );

    await syncAliveEntities(
      dataLayer,
      [adaptLedgerFinancialGoalToAliveEntity({ ...financialGoal, currentAmount: 7000 })],
      { uid: 'user-1', pruneMissingWithinIncomingPrefixes: true },
    );

    const docs = await dataLayer.listDocuments('users/user-1/alive_entities');
    expect(docs.map((doc) => doc.id).sort()).toEqual([
      'alive.ledger.goal.fgoal-1',
      'alive.ledger.transaction.tx-1',
    ]);
    expect(docs.find((doc) => doc.id === 'alive.ledger.goal.fgoal-1')).toEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({ currentAmount: 7000 }),
      }),
    );
  });

  it('supports user-scoped alive entity sync for runtime wiring', async () => {
    const dataLayer = new InMemoryDataProvider();
    await syncAliveEntities(
      dataLayer,
      [
        adaptAtlasGoalToAliveEntity(goal),
        adaptAtlasHabitToAliveEntity(habit),
        adaptLedgerFinancialGoalToAliveEntity(financialGoal),
      ],
      { uid: 'user-1' },
    );

    const docs = await dataLayer.listDocuments('users/user-1/alive_entities');
    expect(docs).toHaveLength(3);
    expect(docs.map((doc) => doc.id).sort()).toEqual([
      'alive.goal.goal-1',
      'alive.habit.habit-1',
      'alive.ledger.goal.fgoal-1',
    ]);
  });
});
