/**
 * Atlas Module — Prompt Builder & Context Mode Definitions
 *
 * Implements the three-scope pattern from the dynamic field system:
 *   1. General — full context + all actions (persisted)
 *   2. Scoped  — single entity context + entity-specific actions (ephemeral)
 *   3. Field CRUD — schema definitions only, NO user wellness data (ephemeral)
 *
 * Architecture rules:
 *   - Atlas NEVER writes to biological/emotional/resource NSV — read-only
 *   - Atlas gets formatNSVForAtlasPlanner() instead of generic module prompt
 *   - LLM is sole semantic validator for custom field relevance (NO keyword gates)
 *   - One planning decision per response
 *   - Recovery windows are inviolable
 */

import type { FieldDefinition } from '@/lib/field-system/types';
import type { FieldValue } from '@/lib/field-system/types';
import type {
  AtlasTask,
  AtlasHabit,
  AtlasGoal,
  AtlasProject,
} from '../services/atlas-profile-service';
import type { AtlasRoutine, AtlasCapacityBlueprint, NeuralStateVector } from '@/lib/types';
import { ATLAS_PERSONA } from '../personas';
import type { PlanningDigest } from '../services/atlas-proactive-service';
import type { GoalVelocity, DependencyGraph, HistoricalPatterns } from '../services/atlas-planning-engine';

// ============================================================================
// Context Mode Discriminated Union
// ============================================================================

/**
 * AtlasContextMode determines what system prompt and action set Atlas uses.
 */
export type AtlasContextMode =
  | { kind: 'general' }
  | { kind: 'task-focus'; task: AtlasTask }
  | { kind: 'habit-review'; habits: AtlasHabit[] }
  | { kind: 'goal-planning'; goal: AtlasGoal }
  | { kind: 'field-crud'; currentExtensions: FieldDefinition[] };

// ============================================================================
// Full Atlas Data Context for General Mode
// ============================================================================

/** Decrypted journal summary injected into the AI context (no raw content stored). */
export interface AtlasJournalSummary {
  date: string;
  mood: number;           // 1-5
  energyLevel: number;    // 1-5
  morningIntent?: string;
  blockers?: string;
  /** first 120 chars of freeform, already decrypted at call site */
  freeformSnippet?: string;
  /** first 60 chars of eveningReflection, already decrypted at call site */
  eveningReflectionSnippet?: string;
}

/** Morning or evening check-in snapshot. */
export interface AtlasCheckInSummary {
  type: 'morning' | 'evening';
  completedAt: string;
  energyRating?: number;  // 1-5
  moodRating?: number;    // 1-5
  intention?: string;
  reflection?: string;
}

/**
 * All Atlas entity data passed to the general-mode prompt builder.
 * The caller (AtlasPage / useModuleAI glue) is responsible for:
 *  - Filtering tasks/goals/habits to the relevant subset.
 *  - Decrypting journal entries and passing only the summary fields — never
 *    raw encrypted content or full freeform text.
 */
export interface AtlasDataContext {
  tasks?: AtlasTask[];
  goals?: AtlasGoal[];
  habits?: AtlasHabit[];
  projects?: AtlasProject[];
  routine?: AtlasRoutine | null;
  /** Last 3-5 entries, already decrypted to summary fields only. */
  journalSummaries?: AtlasJournalSummary[];
  /** Today's completed check-ins. */
  checkIns?: AtlasCheckInSummary[];
  /** ISO date string for "today", defaults to Date.now() when omitted. */
  today?: string;

  // ── Computed intelligence (from planning engine + proactive service) ──
  /** Proactive planning alerts and capacity summary. */
  planningDigest?: PlanningDigest;
  /** Dependency graph summary for context injection. */
  dependencyGraph?: Pick<DependencyGraph, 'criticalPath' | 'blockedChains' | 'orphanTasks' | 'cycleDetected'>;
  /** Per-goal velocity and risk analysis. */
  goalVelocities?: GoalVelocity[];
  /** Historical completion patterns. */
  historicalPatterns?: HistoricalPatterns;
  /** Quick capacity snapshot for daily planning. */
  capacityBlueprint?: AtlasCapacityBlueprint;
}

/**
 * NSV fields Atlas is permitted to READ (but never write).
 */
export const ATLAS_NSV_READ_FIELDS = [
  'biological.cnsFatigue',
  'biological.sleepQuality',
  'biological.recoveryScore',
  'emotional.emotionalResilience',
  'emotional.stressLoad',
  'emotional.moodTrend',
  'cognitive.energyBudget',
  'cognitive.focusScore',
  'cognitive.activeLoad',
  'cognitive.researchLoad',
  'cognitive.planningLoad',
  'cognitive.taskCompletionRate',
  'planning.streakHealth',
  'planning.deadlinePressure',
  'planning.reflectionStreak',
  'planning.goalAlignment',
  'planning.habitMomentum',
  'resource.financialFriction',
] as const;

/**
 * NSV fields Atlas is permitted to WRITE (cognitive + planning domains only).
 */
export const ATLAS_NSV_WRITE_FIELDS = [
  'cognitive.energyBudget',
  'cognitive.focusScore',
  'cognitive.activeLoad',
  'cognitive.planningLoad',
  'cognitive.taskCompletionRate',
  'planning.streakHealth',
  'planning.deadlinePressure',
] as const;

// ============================================================================
// Allowed Actions Per Scope
// ============================================================================

/**
 * Action filtering map. Even if the LLM hallucinates an out-of-scope action,
 * the runtime hook blocks it with a console warning.
 */
export const ATLAS_ALLOWED_ACTIONS: Record<AtlasContextMode['kind'], string[]> = {
  general: [
    // Task management
    'create_task', 'update_task', 'complete_task', 'move_task', 'prioritize', 'delete_task',
    'set_task_recurrence',
    // Goal management
    'create_goal', 'update_goal', 'update_goal_progress', 'set_deadline', 'delete_goal',
    // Project management
    'create_project', 'update_project', 'delete_project',
    // Habit management
    'create_habit', 'update_habit', 'update_habit_streak', 'pause_habit', 'delete_habit',
    // Schedule management
    'daily_plan', 'weekly_review', 'schedule_block', 'generate_daily_schedule', 'suggest_daily_plan',
    // Energy & recovery
    'update_energy_wave', 'create_recovery_window', 'update_recovery_window', 'delete_recovery_window', 'flatten_schedule',
    // NSV sync (Atlas-owned fields only)
    'sync_vitals', 'request_nsv_calibration',
    // Cross-module delegation
    'delegate_to_module',
    // Reminders
    'propose_reminder', 'query_reminders',
    // Field CRUD (also available in general for AI proactive suggestions)
    'suggest_field', 'create_field', 'delete_field',
  ],
  'task-focus': [
    'update_task', 'complete_task', 'move_task', 'prioritize', 'set_deadline',
    'create_task', 'set_task_recurrence',
    'propose_reminder', 'query_reminders',
  ],
  'habit-review': [
    'update_habit_streak', 'pause_habit', 'create_habit', 'update_habit',
    'propose_reminder', 'query_reminders',
  ],
  'goal-planning': [
    'update_goal_progress', 'set_deadline', 'create_goal', 'update_goal',
    'create_task',
    'propose_reminder', 'query_reminders',
  ],
  'field-crud': [
    'suggest_field', 'create_field', 'delete_field',
  ],
};

// ============================================================================
// Atlas 13 Rules
// ============================================================================

/**
 * The 13 inviolable rules for Atlas behavior.
 */
export const ATLAS_RULES = [
  '1. Start every response with <thought> — always. No exceptions.',
  '2. NEVER fabricate NSV scores, deadlines, task data, or energy values.',
  '3. NEVER schedule over a recovery window without explicit user override with a documented reason.',
  '4. NEVER encourage sustained high-intensity work — if activeLoad > 7 for 2+ slots, inject recovery.',
  '5. NEVER ignore biological context — if Soma/Titan signals a contraindication, surface it before scheduling.',
  '6. NEVER contradict Soma clearance signals — do not schedule physical demands when recoveryScore < 5.',
  '7. NEVER write to biological, emotional, or resource NSV fields — those belong to other modules.',
  '8. NEVER therapize — if the user is in emotional distress, stop planning and suggest Agnes.',
  '9. NEVER promise task completion — Atlas builds plans, execution belongs to the user.',
  '10. NEVER give financial advice — financialFriction is a scheduling constraint only; Ledger owns financial guidance.',
  '11. NEVER build a plan where total scheduled energyCost > energyBudget × 0.8 without flagging the overload.',
  '12. NEVER overwhelm — one planning decision per response; do not restructure the user\'s entire life at once.',
  '13. NEVER silently deprioritize — surface all scheduling conflicts explicitly before resolving them.',
] as const;

// ============================================================================
// Energy Budget Computation Prompt Fragment
// ============================================================================

export const ENERGY_BUDGET_COMPUTATION_PROMPT = `
ENERGY BUDGET COMPUTATION:
1. Start with raw energyBudget (0-10) from cognitive domain.
2. Apply sleep modifier: if sleepQuality < 4, reduce by 2 points.
3. Apply fatigue modifier: if cnsFatigue > 7, cap at 4.
4. Apply stress modifier: if stressLoad > 7, reduce by 1 point.
5. Apply financial modifier: if financialFriction > 8, reduce by 1 point (hidden cognitive tax).
6. Floor at 0, cap at 10.
7. Safe planning threshold = effective budget × 0.8
8. If total scheduled energyCost > threshold, flag overload BEFORE proceeding.
`.trim();

const SUGGEST_DAILY_PLAN_ACTION_PROMPT = `
SUGGEST_DAILY_PLAN ACTION:
When the user asks you to plan their day, use:
<action type="suggest_daily_plan">{"date":"YYYY-MM-DD","proposal":{"blocks":[{"time":"HH:MM","taskId":"...","title":"...","energyCost":N,"duration":60}],"totalEnergy":N,"note":"..."}}</action>
This returns a proposal for user review — nothing is committed until they confirm.
Respect the energy wave: high-energy tasks in peak slots, low-energy tasks in valleys.
`.trim();

// ============================================================================
// NSV-Reactive Tone Override
// ============================================================================

/**
 * Returns a tone calibration directive block based on the current NSV state.
 * Returns an empty string when no override is warranted.
 */
export function buildToneOverrideBlock(nsv?: NeuralStateVector | null): string {
  if (!nsv) return '';

  const stressLoad = nsv.emotional?.stressLoad ?? null;
  const emotionalResilience = nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience ?? null;
  const cnsFatigue = nsv.biological?.cnsFatigue ?? nsv.cnsFatigue ?? null;
  const energyBudget = nsv.cognitive?.energyBudget ?? null;
  const focusScore = nsv.cognitive?.focusScore ?? null;
  const activeLoad = nsv.cognitive?.activeLoad ?? null;
  const planningLoad = nsv.cognitive?.planningLoad ?? null;

  const stressHigh = stressLoad !== null && stressLoad > 7;
  const resilienceLow = emotionalResilience !== null && emotionalResilience < 4;
  const fatigueHigh = cnsFatigue !== null && cnsFatigue > 7;
  const energyLow = energyBudget !== null && energyBudget < 3;
  const focusHigh = focusScore !== null && focusScore > 7;
  const activeLoadLow = activeLoad !== null && activeLoad < 4;
  const planningLoadLow = planningLoad !== null && planningLoad < 5;

  if (stressHigh || resilienceLow) {
    return `TONE CALIBRATION [GENTLE_CARE]:
The user's current biometric + emotional signals indicate elevated stress or low resilience.
Adjust your tone accordingly: be warm, validating, and patient. Offer fewer options.
Avoid ambitious scheduling. Prioritize acknowledgement over optimization.`;
  }

  if (fatigueHigh || energyLow) {
    return `TONE CALIBRATION [MINIMAL_ASKS]:
The user's current signals indicate high CNS fatigue or critically low energy reserves.
Be compassionate and keep asks to an absolute minimum. Prioritize rest over any planning goal.
Do not propose multi-step plans. Offer one small, restoring action at most.`;
  }

  if (focusHigh && activeLoadLow && planningLoadLow) {
    return `TONE CALIBRATION [DIRECT_STRUCTURED]:
The user's current signals indicate high focus and available cognitive headroom.
Be concise and ambitious. Prefer structured output (lists, schedules, milestones).
This is a good window for deep work planning and goal advancement.`;
  }

  return '';
}

// ============================================================================
// System Prompt Builders
// ============================================================================

/**
 * Build the system prompt for Atlas based on the current context mode.
 *
 * @param mode - The current conversation scope
 * @param nsvBlock - Pre-formatted NSV context from formatNSVForAtlasPlanner()
 * @param extensionFieldsBlock - Serialized extension field values
 * @param dataContext - All Atlas entity data for general-mode context injection
 * @param nsvData - Raw NSV for tone calibration (general mode only)
 * @returns Complete system prompt string
 */
export function buildAtlasPrompt(
  mode: AtlasContextMode,
  nsvBlock?: string,
  extensionFieldsBlock?: string,
  dataContext?: AtlasDataContext,
  nsvData?: NeuralStateVector | null
): string {
  switch (mode.kind) {
    case 'general':
      return buildGeneralPrompt(nsvBlock, extensionFieldsBlock, dataContext, nsvData);
    case 'task-focus':
      return buildTaskFocusPrompt(mode.task, nsvBlock);
    case 'habit-review':
      return buildHabitReviewPrompt(mode.habits, nsvBlock);
    case 'goal-planning':
      return buildGoalPlanningPrompt(mode.goal, nsvBlock);
    case 'field-crud':
      return buildFieldCrudPrompt(mode.currentExtensions);
  }
}

// ── General Mode ──────────────────────────────────────────────────────────

function buildGeneralPrompt(
  nsvBlock?: string,
  extensionFieldsBlock?: string,
  data?: AtlasDataContext,
  nsvData?: NeuralStateVector | null
): string {
  // Full ATLAS_PERSONA already contains identity, philosophy, mission,
  // all 13 rules, action tags, cross-module intelligence, and planning methodology.
  // enhanceContextForModule("atlas") appends NSV + extension + compacted insights.
  const parts = [ATLAS_PERSONA];

  if (extensionFieldsBlock) {
    parts.push(extensionFieldsBlock);
  }

  if (nsvBlock) {
    parts.push(nsvBlock);
  }

  // Inject live Atlas data so the AI is never hallucinating about user state.
  if (data) {
    const dataBlock = buildAtlasDataContextBlock(data);
    if (dataBlock) parts.push(dataBlock);
  }

  const toneBlock = buildToneOverrideBlock(nsvData);
  if (toneBlock) {
    parts.push(toneBlock);
  }

  parts.push(ENERGY_BUDGET_COMPUTATION_PROMPT);

  parts.push(SUGGEST_DAILY_PLAN_ACTION_PROMPT);

  return parts.join('\n\n');
}

// ============================================================================
// Atlas Data Context Serializer
// ============================================================================

/**
 * Serialize live Atlas entity data into a prompt block.
 * Token efficiency principles:
 *  - Goals: id, title, progress%, deadline, status (≤25)
 *  - Habits: title, streak/target, status, frequency (≤10 active)
 *  - Tasks: title, priority, deadline, energyCost — today's + overdue first (≤15)
 *  - Journal: date, mood, energy, intent snippet, blocker snippet (last 5)
 *  - Routines: active blocks only
 *  - Check-ins: today's only
 */
function buildAtlasDataContextBlock(data: AtlasDataContext): string {
  const today = data.today ?? new Date().toISOString().slice(0, 10);
  const parts: string[] = ['[ATLAS LIVE DATA — DO NOT FABRICATE ANY VALUES BELOW]'];

  // ── Projects ───────────────────────────────────────────────────────────
  if (data.projects && data.projects.length > 0) {
    const activeProjects = data.projects
      .filter(p => p.status === 'active' || p.status === 'paused')
      .slice(0, 10);

    if (activeProjects.length > 0) {
      const projectLines = activeProjects.map(p => {
        const deadlineStr = p.deadline ? ` | due: ${p.deadline}` : '';
        const taskCountStr = ` | tasks: ${p.taskIds.length}`;
        return `  - [${p.status.toUpperCase()}] "${p.title}"${deadlineStr}${taskCountStr}`;
      });
      parts.push(`ACTIVE PROJECTS (${activeProjects.length}):\n${projectLines.join('\n')}`);
    }
  }

  // ── Goals ──────────────────────────────────────────────────────────────
  if (data.goals && data.goals.length > 0) {
    const activeGoals = data.goals.filter(g => g.status !== 'abandoned').slice(0, 25);
    const now7 = new Date(today);
    now7.setDate(now7.getDate() + 7);
    const upcomingDeadlineGoals = activeGoals.filter(g =>
      g.deadline && g.deadline <= now7.toISOString().slice(0, 10)
    );

    const goalLines = activeGoals.map(g => {
      const deadlineStr = g.deadline ? ` | deadline: ${g.deadline}` : '';
      const urgentMarker = g.deadline && g.deadline <= now7.toISOString().slice(0, 10) ? ' ⚠️' : '';
      const criteriaStr = g.successCriteria
        ? ` | criteria: "${g.successCriteria.slice(0, 80)}${g.successCriteria.length > 80 ? '...' : ''}"`
        : '';
      const totalMs = g.milestones.length;
      const doneMs = g.milestones.filter(m => m.completed).length;
      const nextMs = g.milestones.find(m => !m.completed);
      const msStr = totalMs > 0
        ? ` | milestones: ${doneMs}/${totalMs}${nextMs ? ` (next: "${nextMs.title.slice(0, 40)}${nextMs.title.length > 40 ? '...' : ''}")` : ' (all done)'}`
        : '';
      return `  - [${g.status.toUpperCase()}] "${g.title}" — ${g.progressPercent}% complete${deadlineStr}${urgentMarker}${criteriaStr}${msStr}`;
    });
    parts.push(`GOALS (${activeGoals.length} active):\n${goalLines.join('\n')}`);

    if (upcomingDeadlineGoals.length > 0) {
      const deadlineLines = upcomingDeadlineGoals.map(g =>
        `  - "${g.title}" — due ${g.deadline} (${g.progressPercent}% done)`
      );
      parts.push(`UPCOMING GOAL DEADLINES (next 7 days):\n${deadlineLines.join('\n')}`);
    }
  }

  // ── Tasks (grouped by project/goal for full visibility) ────────────────
  if (data.tasks && data.tasks.length > 0) {
    const activeTasks = data.tasks.filter(t =>
      t.status === 'active' || t.status === 'queued' || t.status === 'blocked'
    );

    const formatTask = (t: AtlasTask): string => {
      const overdue = t.deadline && t.deadline.slice(0, 10) < today ? ' OVERDUE' : '';
      const dueStr = t.deadline ? ` due:${t.deadline.slice(0, 10)}` : '';
      const depStr = t.status === 'blocked' ? ' [BLOCKED]' : '';
      return `    [P${t.priority}|E${t.energyCost}] "${t.title}" (${t.status})${dueStr}${overdue}${depStr}`;
    };

    // Sort all active: overdue first, then priority desc
    const sorted = [...activeTasks].sort((a, b) => {
      const aOverdue = a.deadline && a.deadline.slice(0, 10) < today ? 1 : 0;
      const bOverdue = b.deadline && b.deadline.slice(0, 10) < today ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      return b.priority - a.priority;
    });

    // Overdue tasks always shown first as a standalone section
    const overdueTasks = sorted.filter(t => t.deadline && t.deadline.slice(0, 10) < today);
    if (overdueTasks.length > 0) {
      const lines = overdueTasks.map(formatTask);
      parts.push(`OVERDUE TASKS (${overdueTasks.length}):\n${lines.join('\n')}`);
    }

    // Group remaining by project, then goal, then unlinked
    const nonOverdue = sorted.filter(t => !(t.deadline && t.deadline.slice(0, 10) < today));
    const grouped: string[] = [];

    // By project
    const projectIds = [...new Set(nonOverdue.filter(t => t.projectId).map(t => t.projectId!))];
    for (const pid of projectIds) {
      const project = data.projects?.find(p => p.id === pid);
      const projectTasks = nonOverdue.filter(t => t.projectId === pid);
      const label = project ? `Project: "${project.title}"` : `Project: ${pid.slice(0, 12)}`;
      grouped.push(`  ${label} (${projectTasks.length} tasks):`);
      for (const t of projectTasks.slice(0, 8)) grouped.push(formatTask(t));
      if (projectTasks.length > 8) grouped.push(`    ... +${projectTasks.length - 8} more`);
    }

    // By goal (tasks not already shown under a project)
    const shownIds = new Set(nonOverdue.filter(t => t.projectId).map(t => t.id));
    const goalIds = [...new Set(nonOverdue.filter(t => t.goalId && !shownIds.has(t.id)).map(t => t.goalId!))];
    for (const gid of goalIds) {
      const goal = data.goals?.find(g => g.id === gid);
      const goalTasks = nonOverdue.filter(t => t.goalId === gid && !shownIds.has(t.id));
      const label = goal ? `Goal: "${goal.title}"` : `Goal: ${gid.slice(0, 12)}`;
      grouped.push(`  ${label} (${goalTasks.length} tasks):`);
      for (const t of goalTasks.slice(0, 6)) grouped.push(formatTask(t));
      if (goalTasks.length > 6) grouped.push(`    ... +${goalTasks.length - 6} more`);
      for (const t of goalTasks) shownIds.add(t.id);
    }

    // Unlinked tasks
    const unlinked = nonOverdue.filter(t => !shownIds.has(t.id) && !t.projectId && !t.goalId);
    if (unlinked.length > 0) {
      grouped.push(`  Unlinked tasks (${unlinked.length}):`);
      for (const t of unlinked.slice(0, 10)) grouped.push(formatTask(t));
      if (unlinked.length > 10) grouped.push(`    ... +${unlinked.length - 10} more`);
    }

    parts.push(`ACTIVE TASKS (${activeTasks.length} total):\n${grouped.join('\n')}`);

    // Today's priority tasks
    const todayTasks = sorted.filter(t =>
      !t.deadline || t.deadline.slice(0, 10) <= today
    ).slice(0, 8);
    if (todayTasks.length > 0) {
      const todayLines = todayTasks.map(t =>
        `  - [P${t.priority}] "${t.title}" — energy: ${t.energyCost}/10`
      );
      parts.push(`TODAY'S PRIORITY TASKS:\n${todayLines.join('\n')}`);
    }
  }

  // ── Habits ─────────────────────────────────────────────────────────────
  if (data.habits && data.habits.length > 0) {
    const activeHabits = data.habits.filter(h => h.status === 'active').slice(0, 10);
    const habitLines = activeHabits.map(h => {
      const streakRisk = h.currentStreak > 0 && h.lastCompleted
        ? (Date.now() - new Date(h.lastCompleted).getTime() > 20 * 60 * 60 * 1000 ? ' ⚠️ streak at risk' : '')
        : '';
      const mvvStr = h.minimumViableVersion
        ? ` | mvv: "${h.minimumViableVersion.slice(0, 60)}${h.minimumViableVersion.length > 60 ? '...' : ''}"`
        : '';
      return `  - "${h.title}" | streak: ${h.currentStreak}/${h.targetStreak} (best: ${h.bestStreak}) | ${h.frequency}${streakRisk}${mvvStr}`;
    });
    parts.push(`ACTIVE HABITS (${activeHabits.length}):\n${habitLines.join('\n')}`);
  }

  // ── Routine ────────────────────────────────────────────────────────────
  if (data.routine && data.routine.isActive && data.routine.blocks.length > 0) {
    const todayDayOfWeek = new Date(today + 'T12:00:00').getDay();
    const todayBlocks = data.routine.blocks.filter(b =>
      b.daysOfWeek.includes(todayDayOfWeek)
    );
    if (todayBlocks.length > 0) {
      const blockLines = todayBlocks.map(b =>
        `  - ${b.startTime}–${b.endTime}: "${b.title}" (${b.category}, E${b.energyCost})`
      );
      parts.push(`TODAY'S ROUTINE BLOCKS:\n${blockLines.join('\n')}`);
    }
  }

  // ── Journal Summaries (pre-decrypted by caller) ─────────────────────────
  if (data.journalSummaries && data.journalSummaries.length > 0) {
    const recent = data.journalSummaries.slice(-5).reverse(); // most recent first
    const journalLines = recent.map(j => {
      const intentStr = j.morningIntent ? ` | intent: "${j.morningIntent.slice(0, 60)}"` : '';
      const blockerStr = j.blockers ? ` | blockers: "${j.blockers.slice(0, 60)}"` : '';
      const snippetStr = j.freeformSnippet ? ` | wrote: "${j.freeformSnippet.slice(0, 80)}..."` : '';
      const eveningStr = j.eveningReflectionSnippet
        ? ` | evening: "${j.eveningReflectionSnippet.slice(0, 60)}${j.eveningReflectionSnippet.length > 60 ? '...' : ''}"`
        : '';
      return `  - ${j.date}: mood ${j.mood}/5, energy ${j.energyLevel}/5${intentStr}${blockerStr}${snippetStr}${eveningStr}`;
    });
    parts.push(`RECENT JOURNAL ENTRIES (last ${recent.length}, summarised — raw content never exposed):\n${journalLines.join('\n')}`);
  }

  // ── Today's Check-ins ──────────────────────────────────────────────────
  if (data.checkIns && data.checkIns.length > 0) {
    const checkInLines = data.checkIns.map(ci => {
      const energyStr = ci.energyRating ? ` energy: ${ci.energyRating}/5` : '';
      const moodStr = ci.moodRating ? ` mood: ${ci.moodRating}/5` : '';
      const intentStr = ci.intention ? ` intention: "${ci.intention.slice(0, 80)}"` : '';
      const reflectStr = ci.reflection ? ` reflection: "${ci.reflection.slice(0, 80)}"` : '';
      return `  - ${ci.type.toUpperCase()} (${ci.completedAt.slice(11, 16)}):${energyStr}${moodStr}${intentStr}${reflectStr}`;
    });
    parts.push(`TODAY'S CHECK-INS:\n${checkInLines.join('\n')}`);
  }

  // ── Planning Alerts (proactive intelligence) ──────────────────────────
  if (data.planningDigest && data.planningDigest.alerts.length > 0) {
    const alertLines = data.planningDigest.alerts.map(a => {
      const hint = a.actionHint ? ` → ${a.actionHint.slice(0, 60)}` : '';
      return `  [${a.severity.toUpperCase()}] ${a.title}: ${a.detail.slice(0, 100)}${hint}`;
    });
    parts.push(`[PLANNING ALERTS]\n${alertLines.join('\n').slice(0, 400)}`);
  }

  // ── Dependency Graph ──────────────────────────────────────────────────
  if (data.dependencyGraph) {
    const dg = data.dependencyGraph;
    const dgLines: string[] = [];

    if (dg.criticalPath.length > 1) {
      const pathTitles = dg.criticalPath.slice(0, 4).map(id => {
        const task = data.tasks?.find(t => t.id === id);
        return task ? `"${task.title.slice(0, 25)}"` : id.slice(0, 12);
      });
      const more = dg.criticalPath.length > 4 ? ` → +${dg.criticalPath.length - 4} more` : '';
      dgLines.push(`  Critical path: ${pathTitles.join(' → ')}${more}`);
    }

    for (const chain of dg.blockedChains.slice(0, 2)) {
      const rootTask = data.tasks?.find(t => t.id === chain.root);
      const rootLabel = rootTask ? `"${rootTask.title.slice(0, 25)}"` : chain.root.slice(0, 12);
      dgLines.push(`  Blocked: ${rootLabel} blocks ${chain.chain.length} downstream task(s)`);
    }

    if (dg.orphanTasks.length > 0) {
      dgLines.push(`  Orphan tasks: ${dg.orphanTasks.length} not linked to any goal/project`);
    }

    if (dg.cycleDetected) {
      dgLines.push(`  WARNING: Dependency cycle detected in task graph`);
    }

    if (dgLines.length > 0) {
      parts.push(`[DEPENDENCY GRAPH]\n${dgLines.join('\n').slice(0, 300)}`);
    }
  }

  // ── Goal Velocity ─────────────────────────────────────────────────────
  if (data.goalVelocities && data.goalVelocities.length > 0) {
    const velocityLines = data.goalVelocities.slice(0, 5).map(v => {
      const riskLabel = v.riskLevel.toUpperCase().replace('-', ' ');
      const paceStr = v.requiredVelocity !== null
        ? `${v.actualVelocity} ms/wk actual vs ${v.requiredVelocity} required`
        : `${v.actualVelocity} ms/wk`;
      const daysStr = v.daysRemaining !== null ? `, ${v.daysRemaining}d left` : '';
      return `  [${riskLabel}] "${v.title.slice(0, 30)}" — ${v.completedMilestones}/${v.totalMilestones} ms, ${paceStr}${daysStr}`;
    });
    parts.push(`[GOAL VELOCITY]\n${velocityLines.join('\n').slice(0, 300)}`);
  }

  // ── Capacity Snapshot ─────────────────────────────────────────────────
  if (data.capacityBlueprint) {
    const cb = data.capacityBlueprint;
    const headroomSign = cb.headroom >= 0 ? '+' : '';
    const patternsStr = data.historicalPatterns
      ? ` | Completion: ${Math.round(data.historicalPatterns.completionRate7d * 100)}% (7d)${data.historicalPatterns.avgEnergyAccuracy !== null ? `, energy accuracy: ${Math.round(data.historicalPatterns.avgEnergyAccuracy * 100)}%` : ''}`
      : '';
    const pressureStr = cb.pressurePoints.length > 0
      ? `\n  Pressure: ${cb.pressurePoints.slice(0, 2).join('; ').slice(0, 100)}`
      : '';
    parts.push(`[CAPACITY SNAPSHOT]\n  State: ${cb.state.toUpperCase()} | Capacity: ${cb.safeCapacity} | Demand: ${cb.plannedDemand} | Headroom: ${headroomSign}${cb.headroom}${patternsStr}${pressureStr}`.slice(0, 350));
  }

  return parts.join('\n\n');
}

// ── Task Focus Mode ───────────────────────────────────────────────────────

function buildTaskFocusPrompt(task: AtlasTask, nsvBlock?: string): string {
  const dependencyList = task.dependencies.length > 0
    ? `Dependencies: ${task.dependencies.join(', ')}`
    : 'No dependencies';

  return `
IDENTITY: You are Atlas, focused on a single task.
You are providing targeted assistance for one specific task. Stay focused — do not plan the entire day.

CURRENT TASK:
- ID: ${task.id}
- Title: ${task.title}
- Status: ${task.status}
- Priority: ${task.priority}/5
- Energy Cost: ${task.energyCost}/10
- Deadline: ${task.deadline || 'None set'}
- ${dependencyList}
- Description: ${task.description || 'None'}
- Notes: ${task.notes || 'None'}
- Tags: ${task.tags?.join(', ') || 'None'}
- Created: ${task.createdAt}

${nsvBlock ? `\nCOGNITIVE CONTEXT:\n${nsvBlock}\n` : ''}

ALLOWED ACTIONS:
- <action type="update_task">{"id":"${task.id}", ...changes}</action>
- <action type="complete_task">{"id":"${task.id}","completedAt":"ISO8601"}</action>
- <action type="move_task">{"id":"${task.id}","newSlot":"ISO8601","reason":"..."}</action>
- <action type="set_deadline">{"targetId":"${task.id}","targetType":"task","deadline":"ISO8601"}</action>
- <action type="create_task">{...sub-task linked to this task}</action>
- <action type="propose_reminder">{"title":"Reminder: ${task.title}","note":"...","dueAt":"ISO8601","recurrence":{"kind":"once","dueAt":"ISO8601"},"priority":"info","source":{"entityType":"task","entityId":"${task.id}","label":"${task.title}"}}</action>
- <action type="query_reminders">{"moduleId":"atlas"}</action>

RULES:
${ATLAS_RULES.join('\n')}

SCOPE CONSTRAINT: Only discuss and modify THIS task. If the user asks about other tasks, suggest returning to the main Atlas view.
`.trim();
}

// ── Habit Review Mode ─────────────────────────────────────────────────────

function buildHabitReviewPrompt(habits: AtlasHabit[], nsvBlock?: string): string {
  const habitLines = habits.map(h => [
    `- [${h.status.toUpperCase()}] "${h.title}"`,
    `  Frequency: ${h.frequency} | Streak: ${h.currentStreak}/${h.targetStreak} (best: ${h.bestStreak})`,
    `  Energy: ${h.energyCost}/10 | MVV: "${h.minimumViableVersion || 'not set'}"`,
    `  Last completed: ${h.lastCompleted || 'never'}`,
  ].join('\n')).join('\n');

  return `
IDENTITY: You are Atlas, reviewing habit health.
You are providing guidance on habit streaks, motivation, and minimum viable versions.

ACTIVE HABITS:
${habitLines || 'No habits tracked yet.'}

${nsvBlock ? `\nCOGNITIVE CONTEXT:\n${nsvBlock}\n` : ''}

HABIT RULES:
- Protect high-streak habits (streak > 7) from schedule conflicts — they are momentum assets.
- When a streak breaks: acknowledge without shame. Offer a restart protocol.
- New habits use the minimum viable version principle (tiny habit). Escalate gradually.
- Paused habits retain their best streak as a reference point on resume.

ALLOWED ACTIONS:
- <action type="update_habit_streak">{"id":"habit_id","currentStreak":N,"lastCompleted":"ISO8601"}</action>
- <action type="pause_habit">{"id":"habit_id","reason":"...","resumeDate":"ISO8601"}</action>
- <action type="create_habit">{"title":"...","frequency":"[daily|weekly|custom]","targetStreak":[derive from user context],"energyCost":[0-10 based on user capacity],"minimumViableVersion":"..."}</action>
- <action type="update_habit">{"id":"habit_id",...changes}</action>
- <action type="propose_reminder">{"title":"Habit check-in: ...","note":"...","dueAt":"ISO8601","recurrence":{"kind":"weekly_by_days","daysOfWeek":[user's habit days],"timeOfDay":"[user's preferred time]"},"priority":"info","source":{"entityType":"habit","entityId":"habit_id","label":"..."}}</action>
- <action type="query_reminders">{"moduleId":"atlas"}</action>

RULES:
${ATLAS_RULES.join('\n')}

SCOPE CONSTRAINT: Only discuss habits. For tasks or goals, suggest returning to the main Atlas view.
`.trim();
}

// ── Goal Planning Mode ────────────────────────────────────────────────────

function buildGoalPlanningPrompt(goal: AtlasGoal, nsvBlock?: string): string {
  const milestoneLines = goal.milestones.map((m, i) =>
    `  ${i + 1}. [${m.completed ? '✅' : '⬜'}] "${m.title}" ${m.dueDate ? `(due: ${m.dueDate})` : ''}`
  ).join('\n');

  return `
IDENTITY: You are Atlas, focused on goal architecture.
You are helping plan, break down, and track progress on a specific goal.

CURRENT GOAL:
- ID: ${goal.id}
- Title: ${goal.title}
- Status: ${goal.status}
- Progress: ${goal.progressPercent}%
- Deadline: ${goal.deadline || 'None set (goals without deadlines are wishes)'}
- Success Criteria: ${goal.successCriteria || 'Not defined'}
- Description: ${goal.description || 'None'}
- Associated Tasks: ${goal.associatedTaskIds.length} linked tasks

MILESTONES:
${milestoneLines || '  No milestones defined yet.'}

${nsvBlock ? `\nCOGNITIVE CONTEXT:\n${nsvBlock}\n` : ''}

GOAL RULES:
- Break every goal into milestones. Break every milestone into tasks.
- Goals without deadlines are wishes. Gently push for a "committed by" date.
- Surface goal progress during reviews. Goals should never be invisible.

ALLOWED ACTIONS:
- <action type="update_goal_progress">{"id":"${goal.id}","completedMilestoneIds":["ms_id"]}</action>
- <action type="set_deadline">{"targetId":"${goal.id}","targetType":"goal","deadline":"ISO8601"}</action>
- <action type="create_task">{...task linked to goal via "goalId":"${goal.id}"}</action>
- <action type="update_goal">{"id":"${goal.id}", ...changes}</action>
- <action type="create_goal">{...new goal}</action>
- <action type="propose_reminder">{"title":"Goal check-in: ${goal.title}","note":"...","dueAt":"ISO8601","recurrence":{"kind":"every_n_days","intervalDays":[derive from goal timeline]},"priority":"info","source":{"entityType":"goal","entityId":"${goal.id}","label":"${goal.title}"}}</action>
- <action type="query_reminders">{"moduleId":"atlas"}</action>

RULES:
${ATLAS_RULES.join('\n')}

SCOPE CONSTRAINT: Only discuss THIS goal and its milestones/tasks. For unrelated topics, suggest returning to the main Atlas view.
`.trim();
}

// ── Field CRUD Mode ───────────────────────────────────────────────────────

function buildFieldCrudPrompt(currentExtensions: FieldDefinition[]): string {
  const extensionList = currentExtensions.length > 0
    ? currentExtensions.map(f =>
        `- "${f.name}" (${f.type}) — ${f.description || 'No description'}`
      ).join('\n')
    : 'No custom fields yet.';

  return `
IDENTITY: You are Atlas, managing custom productivity tracking fields.
You help users create, modify, or delete custom data fields for their Atlas productivity dashboard.

DOMAIN: Productivity, planning, energy management, task tracking, habit tracking, goal setting, focus optimization, cognitive load, time management.

IMPORTANT: This is a field management conversation. You have NO access to the user's wellness data, NSV scores, or personal context. You only see schema definitions.

CORE SCHEMA FIELDS (immutable — cannot be duplicated or shadowed):
- userId, energyBudget, planningLoad, taskCompletionRate, streakHealth
- urgencyPressure, peakProductivityTime, workStyle, priorityAreas
- habitTracking, goalReviewFrequency, procrastinationTriggers
- focusScore, openLoopCount, lastReview, nextReview

CURRENT EXTENSION FIELDS (user-created, max 15):
${extensionList}
Extensions used: ${currentExtensions.length}/15

DOMAIN VALIDATION — YOUR RESPONSIBILITY:
You are the sole semantic domain validator. When a user proposes a field:
1. Is it relevant to productivity, planning, energy, focus, or cognitive work? → Approve
2. Is it a health/biometric field? → Reject, suggest Soma module
3. Is it an emotional/psychological field? → Reject, suggest Agnes module
4. Is it a financial field? → Reject, suggest Ledger module
5. Is it a fitness/training field? → Reject, suggest Titan module
6. Does the field ID conflict with core schema? → Reject with explanation

ALLOWED ACTIONS:
- <action type="suggest_field">{"name":"...","type":"number|range|text|select|boolean|date","description":"...","validation":{...},"metadata":{"category":"focus|energy|habits|meta","icon":"LucideIconName"}}</action>
- <action type="create_field">{"id":"kebab-case-id","name":"...","type":"...","description":"...","validation":{...},"metadata":{"category":"...","icon":"..."}}</action>
- <action type="delete_field">{"fieldId":"existing-field-id","reason":"..."}</action>

RULES:
- Field IDs must be kebab-case and unique across core + extensions
- Validate type consistency (defaultValue matches field type)
- Provide clear descriptions for every field
- Categories: focus, energy, habits, meta
- If rejecting, explain WHY and suggest the correct module
- Maximum 15 extension fields — warn user when approaching limit
`.trim();
}

// ============================================================================
// Extension Field Context Serialization
// ============================================================================

/**
 * Serialize extension field values for injection into general/task-focus prompts.
 *
 * Produces:
 * ```
 * [CUSTOM TRACKED METRICS — ATLAS]
 * - Deep Work Hours: 4.5 (number: 0-16, daily)
 * - Meeting Load: 7/10 (range)
 * ```
 */
export function serializeAtlasExtensionFields(
  extensions: FieldDefinition[],
  values: Record<string, FieldValue> = {}
): string {
  if (extensions.length === 0) return '';

  const lines = extensions.map(field => {
    const val = values[field.id];
    const currentValue = val?.value ?? field.defaultValue ?? '—';
    const min = field.validation?.minimum;
    const max = field.validation?.maximum;
    const rangeStr = (min != null && max != null) ? `${min}-${max}` : '';

    let formatted: string;
    if (field.type === 'range' && max != null) {
      formatted = `${currentValue}/${max}`;
    } else {
      formatted = String(currentValue);
    }

    const typeInfo = rangeStr ? `${field.type}: ${rangeStr}` : field.type;
    const lastUpdatedStr = val?.timestamp
      ? `, updated ${new Date(val.timestamp).toLocaleDateString()}`
      : '';

    return `- ${field.name}: ${formatted} (${typeInfo}${lastUpdatedStr})`;
  });

  return `[CUSTOM TRACKED METRICS — ATLAS]\n${lines.join('\n')}`;
}

// ============================================================================
// Greeting Templates
// ============================================================================

/**
 * Greeting messages per context mode.
 */
export function getAtlasGreeting(mode: AtlasContextMode, agentAlias: string): string {
  switch (mode.kind) {
    case 'general':
      return `Cognitive link active. I am ${agentAlias}. Share task pressure, schedule constraints, or focus instability and I will reshape your wave.`;
    case 'task-focus':
      return `Focused on: "${mode.task.title}". What do you need — breakdown, reschedule, or completion?`;
    case 'habit-review':
      return `Reviewing ${mode.habits.length} habit(s). Let's check streaks and adjust if needed.`;
    case 'goal-planning':
      return `Planning mode for: "${mode.goal.title}" (${mode.goal.progressPercent}% complete). Where should we focus?`;
    case 'field-crud':
      return `Field management active. Describe what you want to track, or ask me to suggest productivity metrics.`;
  }
}

// ============================================================================
// Placeholder / Input Hint Templates
// ============================================================================

/**
 * Chat input placeholder text per context mode.
 */
export function getAtlasPlaceholder(mode: AtlasContextMode): string {
  switch (mode.kind) {
    case 'general':
      return 'Share your schedule pressure, focus bottlenecks, or request load flattening...';
    case 'task-focus':
      return 'Ask about this task — break it down, reschedule, or mark complete...';
    case 'habit-review':
      return 'Discuss streak health, adjust frequency, or pause a habit...';
    case 'goal-planning':
      return 'Plan milestones, link tasks, or update progress...';
    case 'field-crud':
      return 'Describe a productivity metric to track, or ask for suggestions...';
  }
}

/**
 * Check whether an action type is allowed in the given scope.
 */
export function isActionAllowedInScope(
  actionType: string,
  scopeKind: AtlasContextMode['kind']
): boolean {
  const allowed = ATLAS_ALLOWED_ACTIONS[scopeKind];
  if (!allowed) return false;
  return allowed.includes(actionType);
}
