import type { AraDataLayer, AraRecord } from '@/lib/data-layer';
import type { AliveEntity, AliveEntityRuntimeContext, AliveEntityRuntimeReference, SoulImpactPreset } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';
import { AliveEntityUtilsJs } from '@cortex-logic';

const _aliveUtils = new AliveEntityUtilsJs();
import type { SleepEntry, WorkoutSession, AtlasGoal, AtlasHabit, JournalEntry, PhysicalAssessment, VitalReading } from '@/lib/types';
import type {
  FinancialGoal as LedgerFinancialGoal,
  Transaction as LedgerTransaction,
} from '@/modules/ledger/services/ledger-intake-service';
import type { ScoutDigest, ScoutKnowledgeNode } from '@/modules/scout/types';

export const ALIVE_ENTITY_COLLECTION = 'alive_entities';


function resolveAliveEntityCollectionPath(options?: {
  uid?: string;
  collectionPath?: string;
}): string {
  if (options?.collectionPath) return options.collectionPath;
  if (options?.uid) return `users/${options.uid}/${ALIVE_ENTITY_COLLECTION}`;
  return ALIVE_ENTITY_COLLECTION;
}

type AliveEntitySeed = Omit<AliveEntity, 'createdAt' | 'updatedAt'> & Partial<Pick<AliveEntity, 'createdAt' | 'updatedAt'>>;

function getAliveEntityPrefix(id: string): string {
  const lastDelimiter = id.lastIndexOf('.');
  return lastDelimiter === -1 ? id : id.slice(0, lastDelimiter);
}

export function normalizeAliveEntity(entity: AliveEntitySeed): AliveEntity {
  return JSON.parse(_aliveUtils.normalize(JSON.stringify(entity))) as AliveEntity;
}

export function createAliveEntity(entity: AliveEntitySeed): AliveEntity {
  return normalizeAliveEntity(entity);
}

export function dedupeAliveEntities(entities: AliveEntitySeed[]): AliveEntity[] {
  return JSON.parse(_aliveUtils.dedupeAndSort(JSON.stringify(entities))) as AliveEntity[];
}

export function buildAliveEntityRuntimeContext(
  entities: AliveEntitySeed[],
  options?: {
    moduleFilter?: ModuleId[];
    limitPerModule?: number;
  },
): AliveEntityRuntimeContext {
  const moduleFilterJson = options?.moduleFilter ? JSON.stringify(options.moduleFilter) : 'null';
  const limit = options?.limitPerModule ?? 3;
  return JSON.parse(
    _aliveUtils.buildRuntimeContext(JSON.stringify(entities), moduleFilterJson, limit),
  ) as AliveEntityRuntimeContext;
}

export function adaptAtlasGoalToAliveEntity(goal: AtlasGoal, sourceModule: ModuleId = 'atlas'): AliveEntity {
  const impact: SoulImpactPreset = {
    bandwidth: Math.min(1, Math.max(0, goal.progressPercent / 100)),
  };

  return normalizeAliveEntity({
    id: `alive.goal.${goal.id}`,
    type: 'ACTION',
    label: goal.title,
    semantic_tags: ['atlas', 'goal', goal.status],
    attributes: {
      description: goal.description ?? null,
      deadline: goal.deadline ?? null,
      successCriteria: goal.successCriteria,
      progressPercent: goal.progressPercent,
      associatedTaskIds: goal.associatedTaskIds,
      milestoneCount: goal.milestones.length,
      status: goal.status,
    },
    soul_impact_preset: impact,
    sourceModule,
    sourceEntityId: goal.id,
    provenance: 'adapter',
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  });
}

export function adaptAtlasHabitToAliveEntity(habit: AtlasHabit, sourceModule: ModuleId = 'atlas'): AliveEntity {
  const impact: SoulImpactPreset = {
    bandwidth: Math.min(1, Math.max(0, habit.currentStreak / Math.max(habit.targetStreak, 1))),
    resilience: habit.status === 'active' ? 0.15 : 0,
  };

  return normalizeAliveEntity({
    id: `alive.habit.${habit.id}`,
    type: 'HABIT',
    label: habit.title,
    semantic_tags: ['atlas', 'habit', habit.frequency, habit.status],
    attributes: {
      frequency: habit.frequency,
      targetStreak: habit.targetStreak,
      currentStreak: habit.currentStreak,
      bestStreak: habit.bestStreak,
      energyCost: habit.energyCost,
      minimumViableVersion: habit.minimumViableVersion,
      metricValue: habit.metricValue ?? null,
    },
    soul_impact_preset: impact,
    sourceModule,
    sourceEntityId: habit.id,
    provenance: 'adapter',
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    archivedAt: habit.status === 'archived' ? habit.updatedAt : undefined,
  });
}

export function adaptJournalEntryToAliveEntity(entry: JournalEntry, sourceModule: ModuleId = 'atlas'): AliveEntity {
  const moodNormalized = Math.min(1, Math.max(0, entry.mood / 5));
  const energyNormalized = Math.min(1, Math.max(0, entry.energyLevel / 5));

  return normalizeAliveEntity({
    id: `alive.journal.${entry.id}`,
    type: 'LOG',
    label: `Journal ${entry.date}`,
    semantic_tags: ['journal', 'reflection', ...entry.tags],
    attributes: {
      date: entry.date,
      morningIntent: entry.morningIntent,
      eveningReflection: entry.eveningReflection,
      freeform: entry.freeform,
      blockers: entry.blockers,
      gratitude: entry.gratitude,
      mood: entry.mood,
      energyLevel: entry.energyLevel,
    },
    soul_impact_preset: {
      resilience: moodNormalized,
      bandwidth: energyNormalized,
    },
    sourceModule,
    sourceEntityId: entry.id,
    provenance: 'adapter',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

export function adaptVitalReadingToAliveEntity(reading: VitalReading, sourceModule: ModuleId = 'soma'): AliveEntity {
  const timestamp = new Date(reading.timestamp).toISOString();
  return normalizeAliveEntity({
    id: `alive.vital.${reading.timestamp}`,
    type: 'METRIC',
    label: `Vital reading ${timestamp}`,
    semantic_tags: ['soma', 'vitals'],
    attributes: {
      ...reading,
    },
    soul_impact_preset: {
      vitality: 0.2,
    },
    sourceModule,
    sourceEntityId: String(reading.timestamp),
    provenance: 'adapter',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function adaptSomaPhysicalAssessmentToAliveEntity(
  assessment: PhysicalAssessment,
  sourceModule: ModuleId = 'soma',
): AliveEntity {
  const timestamp = new Date(assessment.timestamp).toISOString();
  const readinessSignals = [assessment.vo2Max, assessment.strength, assessment.endurance].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  const vitality = readinessSignals.length > 0 ? Math.min(1, readinessSignals.reduce((sum, value) => sum + value, 0) / (readinessSignals.length * 100)) : 0;

  return normalizeAliveEntity({
    id: `alive.assessment.${assessment.timestamp}`,
    type: 'METRIC',
    label: `Physical assessment ${timestamp}`,
    semantic_tags: ['soma', 'assessment', 'physical'],
    attributes: {
      ...assessment,
    },
    soul_impact_preset: {
      vitality,
      resilience: typeof assessment.bodyFatPercentage === 'number' ? Math.max(0, 1 - assessment.bodyFatPercentage / 100) : undefined,
    },
    sourceModule,
    sourceEntityId: String(assessment.timestamp),
    provenance: 'adapter',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function adaptLedgerFinancialGoalToAliveEntity(
  goal: LedgerFinancialGoal,
  sourceModule: ModuleId = 'ledger',
): AliveEntity {
  const progress = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;

  return normalizeAliveEntity({
    id: `alive.ledger.goal.${goal.id}`,
    type: 'ACTION',
    label: goal.name,
    semantic_tags: ['ledger', 'financial-goal', goal.type, goal.priority],
    attributes: {
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      monthlyContribution: goal.monthlyContribution,
      targetDate: goal.targetDate ?? null,
      priority: goal.priority,
      notes: goal.notes ?? null,
      milestoneCount: goal.milestones?.length ?? 0,
    },
    soul_impact_preset: {
      output: Math.min(1, Math.max(0, progress)),
      friction: goal.priority === 'high' ? 0.15 : goal.priority === 'medium' ? 0.08 : 0.04,
    },
    sourceModule,
    sourceEntityId: goal.id,
    provenance: 'adapter',
    createdAt: goal.createdAt,
    updatedAt: goal.createdAt,
  });
}

export function adaptLedgerTransactionToAliveEntity(
  transaction: LedgerTransaction,
  sourceModule: ModuleId = 'ledger',
): AliveEntity {
  const dateIso = transaction.date.includes('T') ? transaction.date : new Date(`${transaction.date}T00:00:00.000Z`).toISOString();
  const absoluteAmount = Math.abs(transaction.amount);

  return normalizeAliveEntity({
    id: `alive.ledger.transaction.${transaction.id}`,
    type: 'LOG',
    label: transaction.description,
    semantic_tags: ['ledger', 'transaction', transaction.type, transaction.category],
    attributes: {
      date: transaction.date,
      amount: transaction.amount,
      category: transaction.category,
      isRecurring: transaction.isRecurring ?? false,
      goalId: transaction.goalId ?? null,
      budgetCategoryId: transaction.budgetCategoryId ?? null,
      taxCategory: transaction.taxCategory ?? null,
      notes: transaction.notes ?? null,
    },
    soul_impact_preset: {
      output: transaction.type === 'income' ? Math.min(1, absoluteAmount / 10000) : 0,
      friction: transaction.type === 'expense' ? Math.min(1, absoluteAmount / 10000) : 0,
    },
    sourceModule,
    sourceEntityId: transaction.id,
    provenance: 'adapter',
    createdAt: dateIso,
    updatedAt: dateIso,
  });
}

export function adaptTitanWorkoutSessionToAliveEntity(
  session: WorkoutSession,
  sourceModule: ModuleId = 'titan',
): AliveEntity {
  const completedSets = session.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => set.completed).length,
    0,
  );
  const totalPlannedSets = session.exercises.reduce((count, exercise) => count + exercise.plannedSets, 0);
  const completionRatio = totalPlannedSets > 0 ? completedSets / totalPlannedSets : session.status === 'completed' ? 1 : 0;

  return normalizeAliveEntity({
    id: `alive.titan.workout.${session.id}`,
    type: 'LOG',
    label: session.routineName,
    semantic_tags: ['titan', 'workout', session.status, session.recoverySession ? 'recovery' : 'training'],
    attributes: {
      routineId: session.routineId,
      date: session.date,
      totalExercises: session.exercises.length,
      completedSets,
      totalPlannedSets,
      totalVolume: session.totalVolume ?? null,
      rpe: session.rpe ?? null,
      notes: session.notes ?? null,
      recoverySession: session.recoverySession ?? false,
    },
    soul_impact_preset: {
      vitality: Math.min(1, Math.max(0, completionRatio)),
      output: typeof session.totalVolume === 'number' ? Math.min(1, session.totalVolume / 10000) : completionRatio,
    },
    sourceModule,
    sourceEntityId: session.id,
    provenance: 'adapter',
    createdAt: session.startedAt,
    updatedAt: session.completedAt ?? session.startedAt,
  });
}

export function adaptTitanProgramToAliveEntity(
  program: { id: string; name: string; startDate: string; durationWeeks: number; description?: string; phases?: { name: string; weeks: [number, number] }[] },
  sourceModule: ModuleId = 'titan',
): AliveEntity {
  const startDate = new Date(program.startDate);
  const now = new Date();
  const weeksElapsed = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const progress = Math.min(1, weeksElapsed / program.durationWeeks);
  const currentWeek = weeksElapsed + 1;
  const currentPhase = program.phases?.find(p => currentWeek >= p.weeks[0] && currentWeek <= p.weeks[1]);

  return normalizeAliveEntity({
    id: `alive.titan.program.${program.id}`,
    type: 'ACTION', // Treated as a long-running action/project
    label: program.name,
    semantic_tags: ['titan', 'program', 'training', 'active', ...(currentPhase ? [currentPhase.name.toLowerCase()] : [])],
    attributes: {
      startDate: program.startDate,
      durationWeeks: program.durationWeeks,
      currentWeek,
      currentPhase: currentPhase?.name ?? null,
      description: program.description ?? null,
    },
    soul_impact_preset: {
      vitality: 0.3, // Active training contributes to vitality
      bandwidth: 0.1, // Consumes some bandwidth
    },
    sourceModule,
    sourceEntityId: program.id,
    provenance: 'adapter',
    createdAt: program.startDate,
    updatedAt: now.toISOString(),
  });
}

export function adaptTitanSleepEntryToAliveEntity(entry: SleepEntry, sourceModule: ModuleId = 'titan'): AliveEntity {
  return normalizeAliveEntity({
    id: `alive.titan.sleep.${entry.id}`,
    type: 'METRIC',
    label: `Sleep ${entry.date}`,
    semantic_tags: ['titan', 'sleep', ...(entry.tags ?? [])],
    attributes: {
      date: entry.date,
      bedtime: entry.bedtime ?? null,
      wakeTime: entry.wakeTime ?? null,
      durationHours: entry.durationHours,
      quality: entry.quality,
      deepSleepPct: entry.deepSleepPct ?? null,
      remSleepPct: entry.remSleepPct ?? null,
      awakenings: entry.awakenings ?? null,
      notes: entry.notes ?? null,
    },
    soul_impact_preset: {
      vitality: Math.min(1, Math.max(0, entry.durationHours / 8)),
      resilience: Math.min(1, Math.max(0, entry.quality / 10)),
    },
    sourceModule,
    sourceEntityId: entry.id,
    provenance: 'adapter',
    createdAt: entry.recordedAt,
    updatedAt: entry.recordedAt,
  });
}

export function adaptScoutKnowledgeNodeToAliveEntity(
  node: ScoutKnowledgeNode,
  sourceModule: ModuleId = 'scout',
): AliveEntity {
  const confidence = Math.min(1, Math.max(0, node.confidence));

  return normalizeAliveEntity({
    id: `alive.scout.knowledge.${node.id}`,
    type: 'LOG',
    label: node.claim,
    semantic_tags: ['scout', 'research', 'knowledge', node.status],
    attributes: {
      claim: node.claim,
      confidence: node.confidence,
      evidenceIds: node.evidence,
      evidenceCount: node.evidence.length,
      status: node.status,
      sessionId: node.parentSessionId ?? null,
      provenance: node.provenance ?? null,
    },
    soul_impact_preset: {
      bandwidth: confidence,
    },
    sourceModule,
    sourceEntityId: node.id,
    provenance: 'native',
    createdAt: node.provenance?.synthesizedAt ?? node.updatedAt,
    updatedAt: node.updatedAt,
  });
}

export function adaptScoutDigestToAliveEntity(
  digest: Pick<ScoutDigest, 'id' | 'generatedAt' | 'generationType' | 'summary' | 'topClaims' | 'trendingInterests' | 'synthesizedContent'>,
  sourceModule: ModuleId = 'scout',
): AliveEntity {
  const generatedAt = digest.generatedAt;
  return normalizeAliveEntity({
    id: `alive.scout.digest.${digest.id}`,
    type: 'LOG',
    label: `Scout digest ${generatedAt.slice(0, 10)}`,
    semantic_tags: ['scout', 'digest', digest.generationType],
    attributes: {
      generatedAt,
      generationType: digest.generationType,
      summary: digest.summary,
      topClaims: digest.topClaims,
      trendingInterests: digest.trendingInterests,
      synthesizedContent: digest.synthesizedContent,
    },
    soul_impact_preset: {
      bandwidth: Math.min(1, Math.max(0, (digest.summary?.verifiedCount ?? 0) / 5)),
    },
    sourceModule,
    sourceEntityId: digest.id,
    provenance: 'native',
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });
}

export async function upsertAliveEntity(
  dataLayer: AraDataLayer,
  entity: AliveEntitySeed,
  options?: {
    uid?: string;
    collectionPath?: string;
  },
): Promise<AraRecord<AliveEntity>> {
  const normalized = normalizeAliveEntity(entity);
  return dataLayer.setDocument<AliveEntity>(resolveAliveEntityCollectionPath(options), normalized.id, normalized);
}

export async function listAliveEntities(
  dataLayer: AraDataLayer,
  sourceModule?: ModuleId,
  options?: {
    uid?: string;
    collectionPath?: string;
  },
): Promise<Array<AraRecord<AliveEntity>>> {
  const collection = resolveAliveEntityCollectionPath(options);
  if (!sourceModule) {
    return dataLayer.listDocuments<AliveEntity>(collection, { limit: 500 });
  }

  return dataLayer.query<AliveEntity>({
    collection,
    where: [{ field: 'sourceModule', op: '==', value: sourceModule }],
  });
}

export async function syncAliveEntities(
  dataLayer: AraDataLayer,
  entities: AliveEntitySeed[],
  options?: {
    uid?: string;
    collectionPath?: string;
    pruneMissingWithinIncomingPrefixes?: boolean;
  },
): Promise<AliveEntity[]> {
  const normalized = dedupeAliveEntities(entities);
  if (normalized.length === 0) return [];

  const collection = resolveAliveEntityCollectionPath(options);

  await dataLayer.batchWrite(
    normalized.map((entity) => ({
      type: 'set' as const,
      collection,
      id: entity.id,
      data: entity,
    })),
  );

  if (options?.pruneMissingWithinIncomingPrefixes) {
    const incomingIds = new Set(normalized.map((entity) => entity.id));
    const incomingPrefixes = new Set(normalized.map((entity) => getAliveEntityPrefix(entity.id)));
    const existing = await dataLayer.listDocuments<AliveEntity>(collection, { limit: 500 });
    const stale = existing.filter(
      (entity) => incomingPrefixes.has(getAliveEntityPrefix(entity.id)) && !incomingIds.has(entity.id),
    );

    if (stale.length > 0) {
      await dataLayer.batchWrite(
        stale.map((entity) => ({
          type: 'delete' as const,
          collection,
          id: entity.id,
        })),
      );
    }
  }

  return normalized;
}

export function bootstrapAliveEntities(input: {
  goals?: AtlasGoal[];
  habits?: AtlasHabit[];
  journalEntries?: JournalEntry[];
  vitalReadings?: VitalReading[];
  physicalAssessments?: PhysicalAssessment[];
  ledgerFinancialGoals?: LedgerFinancialGoal[];
  ledgerTransactions?: LedgerTransaction[];
  titanWorkoutSessions?: WorkoutSession[];
  titanSleepEntries?: SleepEntry[];
  titanActiveProgram?: { id: string; name: string; startDate: string; durationWeeks: number; description?: string };
  scoutKnowledgeNodes?: ScoutKnowledgeNode[];
  scoutDigests?: ScoutDigest[];
}): AliveEntity[] {
  return dedupeAliveEntities([
    ...(input.goals ?? []).map((goal) => adaptAtlasGoalToAliveEntity(goal)),
    ...(input.habits ?? []).map((habit) => adaptAtlasHabitToAliveEntity(habit)),
    ...(input.journalEntries ?? []).map((entry) => adaptJournalEntryToAliveEntity(entry)),
    ...(input.vitalReadings ?? []).map((reading) => adaptVitalReadingToAliveEntity(reading)),
    ...(input.physicalAssessments ?? []).map((assessment) => adaptSomaPhysicalAssessmentToAliveEntity(assessment)),
    ...(input.ledgerFinancialGoals ?? []).map((goal) => adaptLedgerFinancialGoalToAliveEntity(goal)),
    ...(input.ledgerTransactions ?? []).map((transaction) => adaptLedgerTransactionToAliveEntity(transaction)),
    ...(input.titanWorkoutSessions ?? []).map((session) => adaptTitanWorkoutSessionToAliveEntity(session)),
    ...(input.titanSleepEntries ?? []).map((entry) => adaptTitanSleepEntryToAliveEntity(entry)),
    ...(input.titanActiveProgram ? [adaptTitanProgramToAliveEntity(input.titanActiveProgram)] : []),
    ...(input.scoutKnowledgeNodes ?? []).map((node) => adaptScoutKnowledgeNodeToAliveEntity(node)),
    ...(input.scoutDigests ?? []).map((digest) => adaptScoutDigestToAliveEntity(digest)),
  ]);
}
