/**
 * GoalTracker — Active goal milestone cards with circular progress rings,
 * deadline countdowns, achieved collapsible section, and a "Set New Goal" modal.
 *
 * Complexity notes:
 *   - Rendering n active goals: O(n) — linear pass over goals array (≤ 50)
 *   - e1RM lookup: O(1) — keyed Record<string, PersonalRecord>
 *   - currentValue resolution: O(1) per goal on save (bodyWeightLog[0] access)
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Target,
  Trophy,
  Plus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Calendar,
  Dumbbell,
  Scale,
  Wind,
  BarChart2,
  Zap,
  Sliders,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WorkoutGoal, GoalMetric, GoalStatus, BodyWeightEntry, PersonalRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { PanelLabel } from '@/core/components/PanelLabel';
import { getTodayIso } from '../utils';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GoalTrackerProps {
  goals: WorkoutGoal[];
  /** Used to auto-calculate currentValue for lift_1rm goals */
  personalRecords?: Record<string, PersonalRecord>;
  bodyWeightLog?: BodyWeightEntry[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (goal: WorkoutGoal) => Promise<void>;
  onDirectUpdate?: (goal: WorkoutGoal) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METRIC_OPTIONS: Array<{ label: string; value: GoalMetric }> = [
  { label: 'Lift 1-Rep Max', value: 'lift_1rm' },
  { label: 'Body Weight', value: 'body_weight' },
  { label: 'Body Fat %', value: 'body_fat_pct' },
  { label: 'Run Pace (min/km)', value: 'run_pace' },
  { label: 'Cardio Distance (km)', value: 'cardio_distance' },
  { label: 'Weekly Sessions', value: 'weekly_sessions' },
  { label: 'Custom', value: 'custom' },
];

const DEFAULT_UNITS: Record<GoalMetric, string> = {
  lift_1rm: 'kg',
  body_weight: 'kg',
  body_fat_pct: '%',
  run_pace: 'min/km',
  cardio_distance: 'km',
  weekly_sessions: 'sessions',
  custom: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp a value between min and max (inclusive). O(1) */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Compute progress percentage for a goal.
 * For metrics where lower is better (pace, body_fat_pct, body_weight when
 * target < current), we invert the scale so progress reflects reduction.
 * O(1).
 */
function computeProgress(goal: WorkoutGoal): number {
  if (goal.currentValue === undefined || goal.targetValue === 0) return 0;
  const { currentValue, targetValue, metric, startValue } = goal;

  // For "lower-is-better" metrics where target < current (cutting / pace improvement)
  const lowerIsBetter =
    (metric === 'run_pace' || metric === 'body_fat_pct') ||
    (metric === 'body_weight' && targetValue < currentValue);

  if (lowerIsBetter) {
    if (currentValue <= targetValue) return 100;
    // Use startValue (captured at goal creation) to compute directional progress.
    // If startValue is missing (legacy goals), fall back to 0% to avoid misleading data.
    if (startValue === undefined || startValue <= targetValue) return 0;
    const totalDistance = startValue - targetValue;
    const covered = startValue - currentValue;
    return clamp((covered / totalDistance) * 100, 0, 100);
  }

  return clamp((currentValue / targetValue) * 100, 0, 100);
}

/** Days remaining until deadline. Negative = overdue. O(1) */
function daysUntil(deadline: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Deadline text colour based on urgency. */
function deadlineColor(days: number): string {
  if (days < 0) return 'text-rose-400';
  if (days < 14) return 'text-rose-400';
  if (days < 30) return 'text-yellow-400';
  return 'text-white/60';
}

function metricIcon(metric: GoalMetric): React.ReactNode {
  const cls = 'w-3.5 h-3.5';
  switch (metric) {
    case 'lift_1rm': return <Dumbbell className={cls} />;
    case 'body_weight': return <Scale className={cls} />;
    case 'body_fat_pct': return <BarChart2 className={cls} />;
    case 'run_pace': return <Wind className={cls} />;
    case 'cardio_distance': return <Zap className={cls} />;
    case 'weekly_sessions': return <Calendar className={cls} />;
    default: return <Sliders className={cls} />;
  }
}

function metricBadgeStyle(metric: GoalMetric): string {
  switch (metric) {
    case 'lift_1rm': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'body_weight':
    case 'body_fat_pct': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 'run_pace':
    case 'cardio_distance': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'weekly_sessions': return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
    default: return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
  }
}

function metricLabel(metric: GoalMetric): string {
  return METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? metric;
}

// ─── Circular Progress Ring (pure SVG) ────────────────────────────────────────

interface ProgressRingProps {
  pct: number;   // 0–100
  size?: number; // px
  stroke?: number;
  accentClass?: string;
}

function ProgressRing({ pct, size = 56, stroke = 5, accentClass = 'stroke-[var(--module-accent)]' }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={stroke}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={accentClass}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: WorkoutGoal;
  onMarkAchieved: (goal: WorkoutGoal) => void;
}

function GoalCard({ goal, onMarkAchieved }: GoalCardProps) {
  const pct = computeProgress(goal);
  const days = goal.deadline ? daysUntil(goal.deadline) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="surface-card border border-[var(--module-accent-border)] rounded-xl p-4 flex flex-col gap-3"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Circular ring */}
        <div className="relative shrink-0 flex items-center justify-center" style={{ width: 56, height: 56 }}>
          <ProgressRing pct={pct} />
          <span className="absolute text-[11px] font-bold tabular-nums text-white/80">
            {Math.round(pct)}%
          </span>
        </div>

        {/* Name + badge */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 leading-tight truncate">{goal.name}</p>
          <span
            className={cn(
              'inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border',
              metricBadgeStyle(goal.metric)
            )}
          >
            {metricIcon(goal.metric)}
            {metricLabel(goal.metric)}
          </span>
        </div>
      </div>

      {/* Progress values */}
      <div className="flex items-center gap-2 text-xs text-white/60">
        <span className="font-bold text-white/90 tabular-nums">
          {goal.currentValue !== undefined ? `${goal.currentValue} ${goal.unit}` : '— '}
        </span>
        <span className="text-white/30">→</span>
        <span className="font-semibold tabular-nums">
          {goal.targetValue} {goal.unit}
        </span>
      </div>

      {/* Deadline */}
      {days !== null && (
        <div className={cn('flex items-center gap-1.5 text-[11px] font-medium', deadlineColor(days))}>
          <Calendar className="w-3 h-3 shrink-0" />
          {days < 0
            ? `${Math.abs(days)} days overdue`
            : days === 0
            ? 'Due today'
            : `${days} days left`}
        </div>
      )}

      {/* Mark achieved button */}
      <NeuralButton
        size="sm"
        variant="ghost"
        onClick={() => onMarkAchieved(goal)}
        className="w-full mt-auto text-[11px] border border-[var(--module-accent-border)] text-[var(--module-color-300)] hover:bg-[var(--module-accent-muted)]"
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
        Mark Achieved
      </NeuralButton>
    </motion.div>
  );
}

// ─── New Goal Modal ───────────────────────────────────────────────────────────

interface GoalFormState {
  name: string;
  metric: GoalMetric;
  targetValue: string;
  unit: string;
  exerciseName: string;
  deadline: string;
  notes: string;
}

const INITIAL_FORM: GoalFormState = {
  name: '',
  metric: 'lift_1rm',
  targetValue: '',
  unit: DEFAULT_UNITS['lift_1rm'],
  exerciseName: '',
  deadline: '',
  notes: '',
};

interface NewGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  personalRecords?: Record<string, PersonalRecord>;
  bodyWeightLog?: BodyWeightEntry[];
  directWriteMode: boolean;
  onDirectSave?: (goal: WorkoutGoal) => Promise<void>;
  onAnalyze?: (prompt: string) => void;
}

function NewGoalModal({
  isOpen,
  onClose,
  personalRecords,
  bodyWeightLog,
  directWriteMode,
  onDirectSave,
  onAnalyze,
}: NewGoalModalProps) {
  const [form, setForm] = useState<GoalFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const set = useCallback(<K extends keyof GoalFormState>(key: K, value: GoalFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Auto-populate unit when metric changes
  const handleMetricChange = useCallback((metric: GoalMetric) => {
    setForm((prev) => ({
      ...prev,
      metric,
      unit: DEFAULT_UNITS[metric],
      exerciseName: metric !== 'lift_1rm' ? '' : prev.exerciseName,
    }));
  }, []);

  /**
   * Resolve currentValue from available data.
   * - lift_1rm: lookup personalRecords by exerciseName key (lowercase), use pre-computed e1RM.
   * - body_weight: bodyWeightLog[0].weight
   * - body_fat_pct: bodyWeightLog[0].bodyFatPct
   * - others: undefined
   * O(1) for all cases.
   */
  function resolveCurrentValue(metric: GoalMetric, exerciseName: string): number | undefined {
    if (metric === 'lift_1rm' && exerciseName.trim()) {
      const key = exerciseName.trim().toLowerCase();
      const pr = personalRecords?.[key];
      if (pr) return pr.e1RM;
    }
    if (metric === 'body_weight') {
      return bodyWeightLog?.[0]?.weight;
    }
    if (metric === 'body_fat_pct') {
      const pct = bodyWeightLog?.[0]?.bodyFatPct;
      return pct;
    }
    return undefined;
  }

  const handleSave = useCallback(async () => {
    const name = form.name.trim();
    const targetRaw = parseFloat(form.targetValue);
    if (!name || isNaN(targetRaw) || targetRaw <= 0) return;

    setSaving(true);
    const now = new Date().toISOString();
    const today = getTodayIso();

    const currentValue = resolveCurrentValue(form.metric, form.exerciseName);

    const goal: WorkoutGoal = {
      id: crypto.randomUUID(),
      name,
      metric: form.metric,
      targetValue: targetRaw,
      currentValue,
      startValue: currentValue,
      unit: form.unit.trim() || DEFAULT_UNITS[form.metric],
      exerciseName: form.metric === 'lift_1rm' && form.exerciseName.trim()
        ? form.exerciseName.trim()
        : undefined,
      deadline: form.deadline || undefined,
      status: 'active',
      notes: form.notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      if (directWriteMode && onDirectSave) {
        await onDirectSave(goal);
      } else if (onAnalyze) {
        const parts: string[] = [
          `Set a new fitness goal: "${name}"`,
          `Metric: ${metricLabel(form.metric)}`,
          `Target: ${targetRaw} ${goal.unit}`,
        ];
        if (currentValue !== undefined) parts.push(`Current value: ${currentValue} ${goal.unit}`);
        if (form.exerciseName) parts.push(`Exercise: ${form.exerciseName}`);
        if (form.deadline) parts.push(`Deadline: ${form.deadline}`);
        if (form.notes) parts.push(`Notes: ${form.notes}`);
        parts.push(`Today's date: ${today}`);
        onAnalyze(
          `<action type="log_goal">${JSON.stringify({
            name: goal.name,
            metric: goal.metric,
            targetValue: goal.targetValue,
            currentValue: goal.currentValue,
            unit: goal.unit,
            exerciseName: goal.exerciseName,
            deadline: goal.deadline,
            notes: goal.notes,
          })}</action>\n\n${parts.join('. ')}.`
        );
      }
      setForm(INITIAL_FORM);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [form, directWriteMode, onDirectSave, onAnalyze, personalRecords, bodyWeightLog, onClose]);

  const isValid = form.name.trim().length > 0 && parseFloat(form.targetValue) > 0;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Set New Goal"
    >
      <div className="space-y-4 pt-1">
        {/* Name */}
        <NeuralInput
          label="Goal Name"
          placeholder='e.g. "Bench 100 kg", "Run 5 km sub-25 min"'
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />

        {/* Metric */}
        <div className="space-y-1.5">
          <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Metric
          </label>
          <NeuralSelectMenu
            options={METRIC_OPTIONS}
            value={form.metric}
            onChange={(v) => handleMetricChange(v as GoalMetric)}
            ariaLabel="Metric"
            minWidthClassName="min-w-full w-full"
          />
        </div>

        {/* Exercise name — only for lift_1rm */}
        {form.metric === 'lift_1rm' && (
          <NeuralInput
            label="Exercise Name"
            placeholder='e.g. "Barbell Bench Press"'
            value={form.exerciseName}
            onChange={(e) => set('exerciseName', e.target.value)}
          />
        )}

        {/* Target value + Unit */}
        <div className="flex gap-3">
          <div className="flex-1">
            <NeuralInput
              label="Target Value"
              type="number"
              placeholder="e.g. 100"
              value={form.targetValue}
              onChange={(e) => set('targetValue', e.target.value)}
            />
          </div>
          <div className="w-28">
            <NeuralInput
              label="Unit"
              placeholder="kg"
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
            />
          </div>
        </div>

        {/* Deadline (optional) */}
        <NeuralInput
          label="Deadline (optional)"
          type="date"
          value={form.deadline}
          onChange={(e) => set('deadline', e.target.value)}
        />

        {/* Notes (optional) */}
        <div className="space-y-1.5">
          <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
            Notes (optional)
          </label>
          <NeuralTextarea
            placeholder="Motivation, context, strategy..."
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <NeuralButton variant="ghost" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </NeuralButton>
          <NeuralButton
            size="sm"
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex-1"
          >
            {saving ? 'Saving…' : directWriteMode ? 'Save Goal' : 'Set Goal'}
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * GoalTracker — renders active goals as an interactive 2-column grid with
 * SVG circular progress rings, a collapsible achieved section, and a modal
 * for creating new structured goals.
 *
 * @param goals           Full goals array from TitanProfile
 * @param personalRecords PR map for auto-resolving lift 1RM current values
 * @param bodyWeightLog   Body log for auto-resolving weight/fat current values
 * @param onAnalyze       Callback to open AI chat with a pre-built prompt
 * @param directWriteMode If true, save directly without AI gating
 * @param onDirectSave    Direct write handler for creating a new goal
 * @param onDirectUpdate  Direct write handler for updating an existing goal
 */
export function GoalTracker({
  goals,
  personalRecords,
  bodyWeightLog,
  onAnalyze,
  directWriteMode = false,
  onDirectSave,
  onDirectUpdate,
}: GoalTrackerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [achievedOpen, setAchievedOpen] = useState(false);

  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active'),
    [goals]
  );
  const achievedGoals = useMemo(
    () => goals.filter((g) => g.status === 'achieved'),
    [goals]
  );

  /** Mark a goal as achieved — direct write or AI prompt. O(n) */
  const handleMarkAchieved = useCallback(
    async (goal: WorkoutGoal) => {
      const today = getTodayIso();
      const updated: WorkoutGoal = {
        ...goal,
        status: 'achieved' as GoalStatus,
        achievedDate: today,
        updatedAt: new Date().toISOString(),
      };

      if (directWriteMode && onDirectUpdate) {
        await onDirectUpdate(updated);
      } else if (onAnalyze) {
        onAnalyze(
          `<action type="update_goal">${JSON.stringify({
            id: goal.id,
            status: 'achieved',
            achievedDate: today,
          })}</action>\n\nI just achieved my goal: "${goal.name}"! Mark it as achieved with today's date (${today}).`
        );
      }
    },
    [directWriteMode, onDirectUpdate, onAnalyze]
  );

  return (
    <SurfaceCard className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PanelLabel
          label="Goal Milestones"
          metadata={activeGoals.length > 0 ? `${activeGoals.length} active` : undefined}
        />
        <NeuralButton
          size="sm"
          variant="ghost"
          onClick={() => setIsModalOpen(true)}
          className="border border-[var(--module-accent-border)] text-[var(--module-color-300)] hover:bg-[var(--module-accent-muted)] text-[11px]"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Set New Goal
        </NeuralButton>
      </div>

      {/* Active goals grid */}
      {activeGoals.length === 0 ? (
        <EmptyState
          title="No active goals"
          description="Set a goal with a target value and optional deadline to track your progress."
          icon={Target}
          size="sm"
          action={
            <NeuralButton size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Set Your First Goal
            </NeuralButton>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {activeGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onMarkAchieved={handleMarkAchieved}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Achieved section — collapsible */}
      {achievedGoals.length > 0 && (
        <div className="border-t border-white/[0.09] pt-3">
          <button
            type="button"
            onClick={() => setAchievedOpen((o) => !o)}
            className="flex items-center gap-2 text-xs font-semibold text-white/50 hover:text-white/70 transition-colors w-full text-left"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Achieved ({achievedGoals.length})</span>
            {achievedOpen
              ? <ChevronDown className="w-3.5 h-3.5 ml-auto" />
              : <ChevronRight className="w-3.5 h-3.5 ml-auto" />
            }
          </button>

          <AnimatePresence>
            {achievedOpen && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2 overflow-hidden"
              >
                {achievedGoals.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-2 text-xs text-white/60 px-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="font-medium text-white/80 truncate">{g.name}</span>
                    {g.achievedDate && (
                      <span className="ml-auto text-[11px] text-white/40 tabular-nums shrink-0">
                        {g.achievedDate}
                      </span>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* New Goal Modal */}
      <NewGoalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        personalRecords={personalRecords}
        bodyWeightLog={bodyWeightLog}
        directWriteMode={directWriteMode}
        onDirectSave={onDirectSave}
        onAnalyze={onAnalyze}
      />
    </SurfaceCard>
  );
}
