/**
 * DailyMacroLogger — Log meals and track daily macro progress vs targets.
 *
 * Features:
 *   A. Today's Macro Rings — pure-SVG arcs showing protein/carbs/fat/calories vs targets
 *   B. Today's Meal List — sorted by mealType with per-meal macro summary
 *   C. Log Meal Modal — validates and saves via direct-write or AI prompt
 *   D. 7-Day History — collapsible SVG bar chart of daily calories & protein
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Utensils, Plus, ChevronDown, ChevronUp, MessageSquare, Info } from 'lucide-react';
import type { MealEntry, MealType, TitanMacroEstimate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { PanelLabel } from '@/core/components/PanelLabel';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import type { NeuralSelectMenuOption } from '@/core/components/NeuralSelectMenu';
import { getTodayIso } from '../utils';
import { useDataLogger } from './shared/useDataLogger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyMacroLoggerProps {
  mealLog: MealEntry[];
  macroTargets?: TitanMacroEstimate;
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (entry: MealEntry) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_TYPE_OPTIONS: NeuralSelectMenuOption<MealType>[] = [
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'snack' },
  { label: 'Pre-Workout', value: 'pre_workout' },
  { label: 'Post-Workout', value: 'post_workout' },
];

const MEAL_TYPE_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
  pre_workout: 4,
  post_workout: 5,
};

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  pre_workout: 'Pre-Workout',
  post_workout: 'Post-Workout',
};

const MEAL_TYPE_COLORS: Record<MealType, string> = {
  breakfast: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  lunch: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  dinner: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  snack: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  pre_workout: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  post_workout: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

// ─── Ring Chart ───────────────────────────────────────────────────────────────

interface MacroRingProps {
  label: string;
  value: number;
  target?: number;
  unit: string;
  color: string;
  trackColor: string;
  size?: number;
  strokeWidth?: number;
}

function MacroRing({
  label,
  value,
  target,
  unit,
  color,
  trackColor,
  size = 80,
  strokeWidth = 7,
}: MacroRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target && target > 0 ? Math.min(value / target, 1) : 0;
  const dashOffset = circumference * (1 - pct);
  const hasTarget = target != null && target > 0;
  const over = hasTarget && value > target;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          {hasTarget && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={over ? '#f87171' : color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          )}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-xs font-black tabular-nums leading-none', over ? 'text-rose-400' : 'text-white/90')}>
            {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
          </span>
          <span className="text-[11px] text-white/40 uppercase font-bold">{unit}</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] font-black uppercase tracking-widest text-white/50">{label}</div>
        {hasTarget && (
          <div className="text-[11px] text-white/30 tabular-nums">
            / {target}{unit}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 7-Day Bar Chart ──────────────────────────────────────────────────────────

interface DayBarData {
  label: string;        // "Mon", "Tue" etc.
  calories: number;
  protein: number;
}

interface WeeklyBarChartProps {
  days: DayBarData[];
  calorieTarget?: number;
  proteinTarget?: number;
}

function WeeklyBarChart({ days, calorieTarget, proteinTarget }: WeeklyBarChartProps) {
  const chartH = 100;
  const chartW = 280;
  const barGroupW = chartW / Math.max(days.length, 1);
  const barW = Math.max(barGroupW * 0.3, 6);
  const gap = barW * 0.5;
  const maxCal = Math.max(...days.map(d => d.calories), calorieTarget ?? 0, 100);
  const maxProt = Math.max(...days.map(d => d.protein), proteinTarget ?? 0, 10);

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${chartH + 24}`} className="overflow-visible">
      {/* Target line for calories */}
      {calorieTarget && calorieTarget > 0 && (
        <line
          x1={0}
          y1={chartH - (calorieTarget / maxCal) * chartH}
          x2={chartW}
          y2={chartH - (calorieTarget / maxCal) * chartH}
          stroke="#34d399"
          strokeWidth={0.75}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}
      {days.map((d, i) => {
        const cx = i * barGroupW + barGroupW / 2;
        const calH = maxCal > 0 ? (d.calories / maxCal) * chartH : 0;
        const protH = maxProt > 0 ? (d.protein / maxProt) * chartH : 0;
        return (
          <g key={d.label}>
            {/* Calorie bar */}
            <rect
              x={cx - gap - barW}
              y={chartH - calH}
              width={barW}
              height={calH}
              rx={2}
              fill="#34d399"
              opacity={0.7}
            />
            {/* Protein bar */}
            <rect
              x={cx + gap}
              y={chartH - protH}
              width={barW}
              height={protH}
              rx={2}
              fill="#60a5fa"
              opacity={0.7}
            />
            {/* Day label */}
            <text
              x={cx}
              y={chartH + 14}
              textAnchor="middle"
              fontSize={8}
              fill="rgba(255,255,255,0.4)"
              fontFamily="inherit"
              fontWeight="700"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoToDate(iso: string): Date {
  // Parse date-only strings without timezone issues
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayLabel(iso: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][isoToDate(iso).getDay()];
}

interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function sumMeals(meals: MealEntry[]): DayTotals {
  return meals.reduce<DayTotals>(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein: acc.protein + (m.protein ?? 0),
      carbs: acc.carbs + (m.carbs ?? 0),
      fat: acc.fat + (m.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DailyMacroLogger({
  mealLog,
  macroTargets,
  onAnalyze,
  directWriteMode = false,
  onDirectSave,
}: DailyMacroLoggerProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [date, setDate] = useState(getTodayIso());
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState<number | ''>('');
  const [protein, setProtein] = useState<number | ''>('');
  const [carbs, setCarbs] = useState<number | ''>('');
  const [fat, setFat] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const [historyOpen, setHistoryOpen] = useState(false);

  const { showModal, openModal, closeModal, formError, setFormError, saving, handleSave } =
    useDataLogger<MealEntry>({ directWriteMode, onDirectSave, onAnalyze });

  // ── Derived: today's meals ─────────────────────────────────────────────────
  const today = getTodayIso();

  const todaysMeals = useMemo(
    () =>
      mealLog
        .filter((m) => m.date === today)
        .sort((a, b) => MEAL_TYPE_ORDER[a.mealType] - MEAL_TYPE_ORDER[b.mealType]),
    [mealLog, today],
  );

  const todayTotals = useMemo(() => sumMeals(todaysMeals), [todaysMeals]);

  // ── Derived: 7-day history ─────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const result: DayBarData[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const meals = mealLog.filter((m) => m.date === iso);
      const totals = sumMeals(meals);
      result.push({ label: dayLabel(iso), calories: totals.calories, protein: totals.protein });
    }
    return result;
  }, [mealLog]);

  const weekAvgCalories = useMemo(() => {
    const active = weekDays.filter((d) => d.calories > 0);
    if (!active.length) return null;
    return Math.round(active.reduce((s, d) => s + d.calories, 0) / active.length);
  }, [weekDays]);

  const weekAvgProtein = useMemo(() => {
    const active = weekDays.filter((d) => d.protein > 0);
    if (!active.length) return null;
    return Math.round(active.reduce((s, d) => s + d.protein, 0) / active.length);
  }, [weekDays]);

  // ── Reset form state ───────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setDate(getTodayIso());
    setMealType('breakfast');
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setNotes('');
  }, []);

  const handleOpenModal = useCallback(() => {
    resetForm();
    openModal();
  }, [openModal, resetForm]);

  const handleClose = useCallback(() => {
    closeModal();
    resetForm();
  }, [closeModal, resetForm]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const onSave = useCallback(async () => {
    await handleSave(() => {
      if (!name.trim()) {
        setFormError('Meal name is required.');
        return null;
      }
      const numericFields = [
        { label: 'Calories', val: calories },
        { label: 'Protein', val: protein },
        { label: 'Carbs', val: carbs },
        { label: 'Fat', val: fat },
      ];
      for (const f of numericFields) {
        if (f.val !== '' && (typeof f.val !== 'number' || f.val < 0)) {
          setFormError(`${f.label} must be a non-negative number.`);
          return null;
        }
      }

      const entry: MealEntry = {
        id: crypto.randomUUID(),
        date,
        mealType,
        name: name.trim(),
        calories: calories !== '' ? Math.round(calories as number) : undefined,
        protein: protein !== '' ? Math.round((protein as number) * 10) / 10 : undefined,
        carbs: carbs !== '' ? Math.round((carbs as number) * 10) / 10 : undefined,
        fat: fat !== '' ? Math.round((fat as number) * 10) / 10 : undefined,
        notes: notes.trim() || undefined,
        recordedAt: new Date().toISOString(),
      };

      const macroParts = [
        calories !== '' ? `${Math.round(calories as number)} kcal` : '',
        protein !== '' ? `${protein}g protein` : '',
        carbs !== '' ? `${carbs}g carbs` : '',
        fat !== '' ? `${fat}g fat` : '',
      ].filter(Boolean).join(', ');

      const analyzePrompt =
        `Log meal: "${name.trim()}" as ${MEAL_TYPE_LABELS[mealType]} on ${date}` +
        (macroParts ? `. Macros: ${macroParts}` : '') +
        (notes.trim() ? `. Notes: ${notes.trim()}` : '') +
        '. Please use the log_meal action to save this entry.';

      return { entry, analyzePrompt };
    });
  }, [
    handleSave, setFormError, date, mealType, name, calories, protein, carbs, fat, notes,
  ]);

  // ── Has any macro data ──────────────────────────────────────────────────────
  const hasTargets =
    (macroTargets?.calories ?? 0) > 0 ||
    (macroTargets?.protein ?? 0) > 0 ||
    (macroTargets?.carbs ?? 0) > 0 ||
    (macroTargets?.fat ?? 0) > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-4 sm:space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <PanelLabel
            label="Daily Macro Logger"
            metadata={
              mealLog.length
                ? `${mealLog.length} meal${mealLog.length === 1 ? '' : 's'} logged`
                : 'No meals logged yet'
            }
          />
          <div className="flex gap-2">
            {todaysMeals.length > 0 && onAnalyze && (
              <NeuralButton
                size="sm"
                variant="ghost"
                onClick={() =>
                  onAnalyze(
                    `Analyze my nutrition today (${today}): total ${todayTotals.calories} kcal, ` +
                    `${todayTotals.protein}g protein, ${todayTotals.carbs}g carbs, ${todayTotals.fat}g fat. ` +
                    `I've had ${todaysMeals.length} meal(s). How does this compare to my targets and what should I adjust?`,
                  )
                }
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Analyze
              </NeuralButton>
            )}
            <NeuralIconButton
              size="sm"
              onClick={handleOpenModal}
              title="Log Meal"
              aria-label="Log Meal"
              icon={<Plus className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* ── A. Today's Macro Rings ── */}
        {todaysMeals.length === 0 ? (
          <EmptyState
            title="No meals logged today"
            description="Start tracking your nutrition to see macro progress and get AI-powered dietary insights."
            icon={Utensils}
            action={
              <NeuralIconButton
                onClick={handleOpenModal}
                title="Log Meal"
                aria-label="Log Meal"
                icon={<Plus className="w-4 h-4" />}
              />
            }
          />
        ) : (
          <SurfaceCard className="p-4 sm:p-5">
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50">
                Today's Macros — {today}
              </p>
            </div>
            <div className="flex items-start justify-around gap-2">
              <MacroRing
                label="Calories"
                value={todayTotals.calories}
                target={macroTargets?.calories}
                unit="kcal"
                color="#34d399"
                trackColor="rgba(52,211,153,0.12)"
              />
              <MacroRing
                label="Protein"
                value={todayTotals.protein}
                target={macroTargets?.protein}
                unit="g"
                color="#60a5fa"
                trackColor="rgba(96,165,250,0.12)"
              />
              <MacroRing
                label="Carbs"
                value={todayTotals.carbs}
                target={macroTargets?.carbs}
                unit="g"
                color="#fbbf24"
                trackColor="rgba(251,191,36,0.12)"
              />
              <MacroRing
                label="Fat"
                value={todayTotals.fat}
                target={macroTargets?.fat}
                unit="g"
                color="#f87171"
                trackColor="rgba(248,113,113,0.12)"
              />
            </div>
            {!hasTargets && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl bg-white/[0.045] border border-white/[0.09]">
                <Info className="w-3 h-3 text-white/30 shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/40 leading-relaxed">
                  No macro targets set — ask Titan to calculate your targets based on your goals.
                </p>
              </div>
            )}
          </SurfaceCard>
        )}

        {/* ── B. Today's Meal List ── */}
        {todaysMeals.length > 0 && (
          <SurfaceCard className="p-3 sm:p-4">
            <PanelLabel label="Today's Meals" metadata={`${todaysMeals.length} entry${todaysMeals.length === 1 ? '' : 'ies'}`} />
            <div className="space-y-2 mt-2">
              {todaysMeals.map((meal) => (
                <MealRow key={meal.id} meal={meal} />
              ))}
            </div>
          </SurfaceCard>
        )}

        {/* ── D. 7-Day History ── */}
        <SurfaceCard className="p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center justify-between w-full"
          >
            <PanelLabel
              label="7-Day History"
              metadata={
                weekAvgCalories != null
                  ? `avg ${weekAvgCalories} kcal · ${weekAvgProtein ?? '—'}g protein`
                  : 'No data'
              }
            />
            <span className="text-white/30">
              {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {historyOpen && (
            <div className="mt-4 space-y-3">
              {weekDays.every((d) => d.calories === 0 && d.protein === 0) ? (
                <p className="text-xs text-white/30 text-center py-4">No meal data for the last 7 days.</p>
              ) : (
                <>
                  <WeeklyBarChart
                    days={weekDays}
                    calorieTarget={macroTargets?.calories}
                    proteinTarget={macroTargets?.protein}
                  />
                  <div className="flex items-center gap-4 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/70 inline-block" />
                      <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Calories</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-400/70 inline-block" />
                      <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Protein</span>
                    </div>
                    {macroTargets?.calories && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-0 border-t border-dashed border-emerald-400/50 inline-block" />
                        <span className="text-[11px] text-white/30 font-bold uppercase tracking-wider">Cal target</span>
                      </div>
                    )}
                  </div>
                  {(weekAvgCalories != null || weekAvgProtein != null) && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {weekAvgCalories != null && (
                        <div className="px-3 py-2 rounded-xl bg-white/[0.045] border border-white/[0.09] text-center">
                          <div className="text-sm font-black text-emerald-400 tabular-nums">{weekAvgCalories}</div>
                          <div className="text-[11px] text-white/30 uppercase tracking-wider font-bold">avg kcal/day</div>
                        </div>
                      )}
                      {weekAvgProtein != null && (
                        <div className="px-3 py-2 rounded-xl bg-white/[0.045] border border-white/[0.09] text-center">
                          <div className="text-sm font-black text-blue-400 tabular-nums">{weekAvgProtein}g</div>
                          <div className="text-[11px] text-white/30 uppercase tracking-wider font-bold">avg protein/day</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </SurfaceCard>
      </div>

      {/* ── C. Log Meal Modal ── */}
      <NeuralModal
        isOpen={showModal}
        onClose={handleClose}
        title="Log Meal"
        subtitle="Track your nutrition"
        icon={Utensils}
        themeColor="module"
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* Date */}
          <NeuralInput
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="focus:border-[var(--module-accent)]"
          />

          {/* Meal Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
              Meal Type
            </label>
            <NeuralSelectMenu<MealType>
              value={mealType}
              options={MEAL_TYPE_OPTIONS}
              onChange={setMealType}
              ariaLabel="Meal Type"
              minWidthClassName="min-w-full w-full"
              accentClassName="text-[var(--module-color-300)]"
              triggerClassName="w-full focus:ring-[var(--module-accent)]"
            />
          </div>

          {/* Name */}
          <NeuralInput
            label="Meal Name *"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chicken Rice Bowl, Protein Shake…"
            className="focus:border-[var(--module-accent)]"
          />

          {/* Macros row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NeuralInput
              label="Calories (kcal)"
              type="number"
              min={0}
              placeholder="—"
              value={calories}
              onChange={(e) => setCalories(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="Protein (g)"
              type="number"
              min={0}
              placeholder="—"
              value={protein}
              onChange={(e) => setProtein(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="Carbs (g)"
              type="number"
              min={0}
              placeholder="—"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="Fat (g)"
              type="number"
              min={0}
              placeholder="—"
              value={fat}
              onChange={(e) => setFat(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
              Notes (optional)
            </label>
            <NeuralTextarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ingredients, prep method, how you felt after…"
              rows={2}
              className="placeholder:text-white/30 focus:border-[var(--module-accent)]"
            />
          </div>

          {/* Error */}
          {formError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/[0.09]">
            <NeuralButton variant="ghost" onClick={handleClose} disabled={saving}>
              Cancel
            </NeuralButton>
            <NeuralButton
              onClick={onSave}
              disabled={saving || (!directWriteMode && !onAnalyze)}
            >
              <Utensils className="w-4 h-4 mr-2" />
              {directWriteMode ? 'Save Meal' : 'Save & Analyze'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </>
  );
}

// ─── Meal Row ─────────────────────────────────────────────────────────────────

function MealRow({ meal }: { meal: MealEntry }) {
  const macros = [
    meal.protein != null ? `P ${meal.protein}g` : null,
    meal.carbs != null ? `C ${meal.carbs}g` : null,
    meal.fat != null ? `F ${meal.fat}g` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center justify-between px-3 py-2.5 min-h-[2.75rem] rounded-xl bg-white/[0.045] border border-white/[0.09] hover:bg-white/[0.045] transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Utensils className="w-3.5 h-3.5 text-[var(--module-color-400)] shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white/80 truncate">{meal.name}</span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border',
                MEAL_TYPE_COLORS[meal.mealType],
              )}
            >
              {MEAL_TYPE_LABELS[meal.mealType]}
            </span>
          </div>
          {macros.length > 0 && (
            <p className="text-[11px] text-white/40 mt-0.5">{macros.join(' · ')}</p>
          )}
          {meal.notes && (
            <p className="text-[11px] text-white/30 truncate mt-0.5 italic">{meal.notes}</p>
          )}
        </div>
      </div>
      {meal.calories != null && (
        <div className="text-right shrink-0">
          <div className="text-sm font-black tabular-nums text-emerald-400">
            {meal.calories}
          </div>
          <div className="text-[11px] text-white/30 uppercase">kcal</div>
        </div>
      )}
    </div>
  );
}
