/**
 * Atlas Planning Engine — TypeScript bridge to KMP AtlasPlanningEngineJs.
 *
 * All type/interface exports are preserved here because UI components import
 * them directly from this module. Function implementations delegate to the
 * KMP facade via the @cortex-logic bridge.
 */

import type {
  AtlasTask,
  AtlasGoal,
  AtlasHabit,
  AtlasProfile,
  AtlasProject,
  EnergyWavePoint,
  NeuralStateVector,
  ScheduledTask,
} from '@/lib/types';
import { AtlasPlanningEngineJs } from '@cortex-logic';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DependencyGraph {
  /** taskId → IDs this task depends on */
  adjacency: Map<string, string[]>;
  /** taskId → IDs that are blocked by this task */
  reverseAdj: Map<string, string[]>;
  /** Ordered task IDs on the longest weighted path (by energyCost) */
  criticalPath: string[];
  /** Chains where a root task is blocked and everything downstream waits */
  blockedChains: { root: string; chain: string[] }[];
  /** Tasks with no goal, no project, and no dependencies */
  orphanTasks: string[];
  /** True if a cycle was detected in the dependency graph */
  cycleDetected: boolean;
  /** Topological order of task IDs (empty if cycle detected) */
  topologicalOrder: string[];
}

export interface GoalVelocity {
  goalId: string;
  title: string;
  completedMilestones: number;
  totalMilestones: number;
  daysElapsed: number;
  daysRemaining: number | null;
  actualVelocity: number;
  requiredVelocity: number | null;
  onPace: boolean;
  linkedTaskCount: number;
  linkedTasksDone: number;
  riskLevel: 'on-track' | 'at-risk' | 'behind' | 'stalled';
}

export interface DailyLoadForecast {
  date: string;
  scheduledEnergy: number;
  taskEnergy: number;
  habitEnergy: number;
  routineEnergy: number;
  totalDemand: number;
  estimatedCapacity: number;
  headroom: number;
  overloaded: boolean;
}

export interface ConflictReport {
  deadlineConvergence: { date: string; taskIds: string[]; count: number }[];
  habitScheduleGaps: { habitTitle: string; habitFrequency: string }[];
  recoveryViolations: { taskTitle: string; windowTitle: string }[];
}

export interface TaskBreakdownSuggestion {
  subtasks: {
    title: string;
    estimatedEnergyCost: number;
    suggestedOrder: number;
    rationale: string;
  }[];
  totalEstimatedEnergy: number;
  decompositionStrategy: string;
}

export interface HistoricalPatterns {
  completionRate7d: number;
  completionRate30d: number;
  avgEnergyAccuracy: number | null;
  commonDeferDays: string[];
  peakProductivityHour: number | null;
  reviewConsistency: number;
}

// ─── KMP bridge instance ──────────────────────────────────────────────────────

const _engine = new AtlasPlanningEngineJs();

// ─── Helper: convert plain-object adjacency maps to Map<string, string[]> ────

function toMap(obj: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(obj));
}

// ─── 2A: Dependency Graph Analysis ───────────────────────────────────────────

export function buildDependencyGraph(tasks: AtlasTask[]): DependencyGraph {
  const raw = JSON.parse(_engine.buildDependencyGraph(JSON.stringify(tasks)));
  return {
    adjacency: toMap(raw.adjacency),
    reverseAdj: toMap(raw.reverseAdj),
    criticalPath: raw.criticalPath,
    blockedChains: raw.blockedChains,
    orphanTasks: raw.orphanTasks,
    cycleDetected: raw.cycleDetected,
    topologicalOrder: raw.topologicalOrder,
  };
}

// ─── 2B: Goal Velocity Tracker ───────────────────────────────────────────────

export function computeGoalVelocities(
  goals: AtlasGoal[],
  tasks: AtlasTask[],
  now: Date = new Date(),
): GoalVelocity[] {
  return JSON.parse(
    _engine.computeGoalVelocities(JSON.stringify(goals), JSON.stringify(tasks), now.toISOString())
  );
}

// ─── 2C: Load Forecaster ─────────────────────────────────────────────────────

export function forecastLoad(
  profile: AtlasProfile,
  nsv: NeuralStateVector | null,
  days: number = 7,
  now: Date = new Date(),
): DailyLoadForecast[] {
  return JSON.parse(
    _engine.forecastLoad(
      JSON.stringify(profile),
      nsv === null ? 'null' : JSON.stringify(nsv),
      days,
      now.toISOString()
    )
  );
}

// ─── 2D: Conflict Detector ───────────────────────────────────────────────────

export function detectConflicts(
  profile: AtlasProfile,
  forecastDays: number = 7,
  now: Date = new Date(),
): ConflictReport {
  return JSON.parse(
    _engine.detectConflicts(JSON.stringify(profile), forecastDays, now.toISOString())
  );
}

// ─── 2E: Smart Task Decomposition ───────────────────────────────────────────

export function suggestTaskBreakdown(
  task: AtlasTask,
  _profile: AtlasProfile,
): TaskBreakdownSuggestion {
  // The KMP facade builds a minimal profile internally from the task alone.
  return JSON.parse(_engine.suggestTaskBreakdown(JSON.stringify(task)));
}

// ─── 2F: Historical Patterns ─────────────────────────────────────────────────

export function computeHistoricalPatterns(
  profile: AtlasProfile,
  now: Date = new Date(),
): HistoricalPatterns {
  return JSON.parse(
    _engine.computeHistoricalPatterns(JSON.stringify(profile), now.toISOString())
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const AtlasPlanningEngine = {
  buildDependencyGraph,
  computeGoalVelocities,
  forecastLoad,
  detectConflicts,
  suggestTaskBreakdown,
  computeHistoricalPatterns,
};
