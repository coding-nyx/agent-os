/**
 * ExerciseLibraryBrowser — Full browse/search UI for the Titan exercise library.
 *
 * Architecture decisions:
 * - `EXERCISE_LIBRARY` (TS) is the source of truth for filtering and search. It
 *   has strong-typed `MuscleGroup` unions and clean equipment strings.
 * - `exercise-library.json` is a richer, supplemental dataset that provides
 *   `secondaryMuscles` and `movementPattern` for the expanded card view.
 * - The two sources are joined at module load time into `ENRICHED_LIBRARY` so
 *   that per-render work stays O(1) for lookups.
 *
 * Complexity:
 * - Filter pass: O(n) where n = 30 (EXERCISE_LIBRARY size) — effectively O(1).
 * - Alternatives per card: O(n) at render time, memoised per exercise identity.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Dumbbell,
  Zap,
  User,
  Cog,
  ChevronDown,
  X,
  Plus,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EXERCISE_LIBRARY } from '../data/exercise-library';
import type { Exercise, ExerciseCategory, MuscleGroup } from '../types';
import exerciseJsonRaw from '../data/exercise-library.json';

// ─── Public Props ─────────────────────────────────────────────────────────────

export interface ExerciseLibraryBrowserProps {
  className?: string;
  /** Called when the user clicks "Add to Routine" or an alternative chip. */
  onAddExercise?: (exerciseName: string) => void;
  /** User's available equipment from profile — enables "Match My Equipment" quick filter. */
  profileEquipment?: string[];
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type CategoryFilterValue = ExerciseCategory | 'all';

/** Shape of each entry in exercise-library.json (richer metadata). */
interface JsonEntry {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern?: string;
}

/** Exercise enriched with JSON metadata where a name-match exists. */
interface EnrichedExercise extends Exercise {
  secondaryMuscles: string[];
  movementPattern?: string;
}

// ─── Static Configuration ─────────────────────────────────────────────────────

const CATEGORIES: ReadonlyArray<{ value: CategoryFilterValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'compound', label: 'Compound' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'mobility', label: 'Mobility' },
] as const;

interface MuscleFilterGroup {
  readonly label: string;
  readonly muscles: ReadonlyArray<MuscleGroup>;
}

const MUSCLE_FILTER_GROUPS: ReadonlyArray<MuscleFilterGroup> = [
  { label: 'Chest',     muscles: ['chest'] },
  { label: 'Back',      muscles: ['back', 'lats', 'traps'] },
  { label: 'Shoulders', muscles: ['shoulders'] },
  { label: 'Arms',      muscles: ['biceps', 'triceps', 'forearms'] },
  { label: 'Core',      muscles: ['core'] },
  { label: 'Legs',      muscles: ['quads', 'hamstrings'] },
  { label: 'Glutes',    muscles: ['glutes'] },
  { label: 'Calves',    muscles: ['calves'] },
] as const;

const EQUIPMENT_OPTIONS = [
  { label: 'Any Equipment', value: 'any' },
  { label: 'Barbell',       value: 'barbell' },
  { label: 'Dumbbell',      value: 'dumbbell' },
  { label: 'Cable',         value: 'cable' },
  { label: 'Bodyweight',    value: 'bodyweight' },
  { label: 'Machine',       value: 'machine' },
  { label: 'Kettlebell',    value: 'kettlebell' },
  { label: 'Band',          value: 'band' },
] as const;

/** Tailwind classes for each category badge. */
const CATEGORY_BADGE: Record<ExerciseCategory, string> = {
  compound:  'bg-emerald-500/15 text-emerald-300  border-emerald-500/25',
  isolation: 'bg-sky-500/15     text-sky-300      border-sky-500/25',
  cardio:    'bg-green-500/15   text-green-300    border-green-500/25',
  mobility:  'bg-purple-500/15  text-purple-300   border-purple-500/25',
};

// ─── Data Enrichment (module-level, runs once) ────────────────────────────────

/**
 * Strip non-alphanumeric chars for fuzzy name matching between the TS library
 * (which uses display names like "Barbell Back Squat") and the JSON dataset
 * (which uses canonical names like "Barbell Squat").
 */
function normaliseKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const JSON_LIBRARY = exerciseJsonRaw as JsonEntry[];

/** Build a name→JsonEntry lookup for O(1) enrichment access. */
const JSON_LOOKUP = new Map<string, JsonEntry>();
for (const entry of JSON_LIBRARY) {
  JSON_LOOKUP.set(normaliseKey(entry.name), entry);
  for (const alias of entry.aliases) {
    JSON_LOOKUP.set(normaliseKey(alias), entry);
  }
}

function findJsonEntry(exercise: Exercise): JsonEntry | undefined {
  // Try the exercise's own name first.
  const byName = JSON_LOOKUP.get(normaliseKey(exercise.name));
  if (byName) return byName;
  // Then try each of its aliases.
  for (const alias of exercise.aliases ?? []) {
    const byAlias = JSON_LOOKUP.get(normaliseKey(alias));
    if (byAlias) return byAlias;
  }
  return undefined;
}

/**
 * ENRICHED_LIBRARY: EXERCISE_LIBRARY augmented with JSON metadata.
 * Built once at module initialisation — zero runtime cost per render.
 */
const ENRICHED_LIBRARY: ReadonlyArray<EnrichedExercise> = EXERCISE_LIBRARY.map(exercise => {
  const json = findJsonEntry(exercise);
  return {
    ...exercise,
    secondaryMuscles: json?.secondaryMuscles ?? [],
    movementPattern: json?.movementPattern,
  };
});

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Equipment icon selection — maps the first equipment keyword to a Lucide icon. */
function resolveEquipmentIcon(equipment: string[]): React.ReactNode {
  const primary = (equipment[0] ?? '').toLowerCase();
  if (primary.includes('barbell') || primary.includes('dumbbell') || primary.includes('kettlebell')) {
    return <Dumbbell className="w-3 h-3 shrink-0" />;
  }
  if (primary.includes('cable')) return <Zap className="w-3 h-3 shrink-0" />;
  if (primary.includes('bodyweight')) return <User className="w-3 h-3 shrink-0" />;
  if (primary.includes('machine')) return <Cog className="w-3 h-3 shrink-0" />;
  return <Dumbbell className="w-3 h-3 shrink-0" />;
}

interface CategoryChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function CategoryChip({ label, selected, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-wide border transition-all duration-200',
        selected
          ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]'
          : 'bg-white/[0.045] border-white/[0.08] text-white/40 hover:text-white/60 hover:bg-white/[0.07]',
      )}
    >
      {label}
    </button>
  );
}

interface MuscleChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

function MuscleChip({ label, selected, onClick }: MuscleChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide border transition-all duration-200',
        selected
          ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]'
          : 'bg-white/[0.045] border-white/[0.09] text-white/35 hover:text-white/55 hover:bg-white/[0.06]',
      )}
    >
      {label}
    </button>
  );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: EnrichedExercise;
  /** Full library needed to compute alternatives list. */
  allExercises: ReadonlyArray<EnrichedExercise>;
  isExpanded: boolean;
  onToggle: () => void;
  onAddExercise?: (exerciseName: string) => void;
}

function ExerciseCard({
  exercise,
  allExercises,
  isExpanded,
  onToggle,
  onAddExercise,
}: ExerciseCardProps) {
  /**
   * Alternatives: other exercises that share at least one primary muscle group.
   * O(n) over the full library — memoised by exercise identity so it only
   * recomputes when the exercise reference changes (never, in practice).
   */
  const alternatives = useMemo(
    () =>
      allExercises
        .filter(
          other =>
            other.id !== exercise.id &&
            other.muscleGroups.some(m => exercise.muscleGroups.includes(m)),
        )
        .slice(0, 3),
    [exercise, allExercises],
  );

  const badgeStyle = CATEGORY_BADGE[exercise.category] ?? 'bg-white/10 text-white/60 border-white/10';

  return (
    <motion.div
      layout="position"
      className={cn(
        'border rounded-2xl overflow-hidden transition-colors duration-200',
        isExpanded
          ? 'border-[var(--module-accent-border)] bg-slate-900/70'
          : 'border-white/[0.09] bg-white/[0.045] hover:border-white/[0.13] hover:bg-white/[0.045]',
      )}
    >
      {/* ── Card header — always visible ── */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--module-accent-ring)] rounded-2xl"
      >
        {/* Primary info column */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Name + badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white/90 leading-tight">
              {exercise.name}
            </span>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-widest border',
                badgeStyle,
              )}
            >
              {exercise.category}
            </span>
          </div>

          {/* Primary muscles */}
          <p className="text-[11px] text-white/50 leading-snug capitalize">
            {exercise.muscleGroups.join(', ')}
          </p>

          {/* Equipment */}
          <div className="flex items-center gap-1.5 text-white/35">
            {resolveEquipmentIcon(exercise.equipment)}
            <span className="text-[11px]">{exercise.equipment.join(', ')}</span>
          </div>

          {/* Aliases */}
          {(exercise.aliases ?? []).length > 0 && (
            <p className="text-[11px] text-white/25 leading-snug truncate">
              Also: {exercise.aliases!.join(', ')}
            </p>
          )}
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="shrink-0 mt-0.5 text-white/25"
          aria-hidden
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </button>

      {/* ── Expandable detail section ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-3 pb-4 space-y-3 border-t border-white/[0.09]">
              {/* Secondary muscles */}
              {exercise.secondaryMuscles.length > 0 && (
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
                    Secondary Muscles
                  </span>
                  <p className="text-[12px] text-white/55 capitalize leading-snug">
                    {exercise.secondaryMuscles.join(', ')}
                  </p>
                </div>
              )}

              {/* Movement pattern */}
              {exercise.movementPattern && (
                <div className="space-y-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
                    Movement Pattern
                  </span>
                  <p className="text-[12px] text-white/55 capitalize">
                    {exercise.movementPattern}
                  </p>
                </div>
              )}

              {/* Alternatives */}
              {alternatives.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/30">
                    Alternatives
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {alternatives.map(alt => (
                      <button
                        key={alt.id}
                        type="button"
                        onClick={() => onAddExercise?.(alt.name)}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium bg-white/[0.045] border border-white/[0.09] text-white/45 hover:bg-[var(--module-accent-muted)] hover:border-[var(--module-accent-border)] hover:text-[var(--module-color-300)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--module-accent-ring)]"
                      >
                        {alt.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add to Routine CTA */}
              {onAddExercise && (
                <div className="pt-1">
                  <NeuralButton
                    variant="ghost"
                    themeColor="module"
                    size="sm"
                    onClick={() => onAddExercise(exercise.name)}
                    className="gap-1.5 text-[11px]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to Routine
                  </NeuralButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExerciseLibraryBrowser({
  className,
  onAddExercise,
  profileEquipment,
}: ExerciseLibraryBrowserProps) {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchQuery,    setSearchQuery]    = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>('all');
  const [muscleFilter,   setMuscleFilter]   = useState<string | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState('any');
  const [matchMyEquipment, setMatchMyEquipment] = useState(false);

  // Only one card expanded at a time (reduces cognitive load + layout shifts).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  // ── Derived filtering — O(n) pass, memoised on filter changes ─────────────
  const filteredExercises = useMemo<ReadonlyArray<EnrichedExercise>>(() => {
    const q = searchQuery.toLowerCase().trim();

    const selectedMuscles: ReadonlyArray<MuscleGroup> | null =
      muscleFilter !== null
        ? MUSCLE_FILTER_GROUPS.find(g => g.label === muscleFilter)?.muscles ?? null
        : null;

    return ENRICHED_LIBRARY.filter(exercise => {
      // 1. Text search: name or alias contains query.
      if (q !== '') {
        const nameMatch  = exercise.name.toLowerCase().includes(q);
        const aliasMatch = (exercise.aliases ?? []).some(a => a.toLowerCase().includes(q));
        if (!nameMatch && !aliasMatch) return false;
      }

      // 2. Category exact match.
      if (categoryFilter !== 'all' && exercise.category !== categoryFilter) return false;

      // 3. Muscle group — at least one primary muscle in the selected group.
      if (selectedMuscles !== null) {
        const hit = exercise.muscleGroups.some(m =>
          (selectedMuscles as MuscleGroup[]).includes(m),
        );
        if (!hit) return false;
      }

      // 4. Equipment — at least one equipment string matches (case-insensitive).
      if (matchMyEquipment && profileEquipment && profileEquipment.length > 0) {
        const profileEq = profileEquipment.map(e => e.toLowerCase());
        const hit = exercise.equipment.some(e => profileEq.some(p => e.toLowerCase().includes(p) || p.includes(e.toLowerCase())));
        if (!hit && !exercise.equipment.some(e => e === 'bodyweight')) return false;
      } else if (equipmentFilter !== 'any') {
        const hit = exercise.equipment.some(
          e => e.toLowerCase() === equipmentFilter,
        );
        if (!hit) return false;
      }

      return true;
    });
  }, [searchQuery, categoryFilter, muscleFilter, equipmentFilter, matchMyEquipment, profileEquipment]);

  const hasActiveFilters =
    searchQuery !== '' ||
    categoryFilter !== 'all' ||
    muscleFilter !== null ||
    equipmentFilter !== 'any';

  function clearAllFilters() {
    setSearchQuery('');
    setCategoryFilter('all');
    setMuscleFilter(null);
    setEquipmentFilter('any');
    setExpandedId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SurfaceCard className={cn('p-4 sm:p-5 md:p-6', className)}>
      <div className="space-y-4">
        {/* Search ──────────────────────────────────────────────────────────── */}
        <NeuralInput
          icon={<Search className="w-4 h-4" />}
          placeholder="Search by name or alias…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search exercises"
        />

        {/* Category chips ──────────────────────────────────────────────────── */}
        <div
          role="group"
          aria-label="Filter by category"
          className="flex items-center gap-1.5 flex-wrap"
        >
          {CATEGORIES.map(cat => (
            <CategoryChip
              key={cat.value}
              label={cat.label}
              selected={categoryFilter === cat.value}
              onClick={() => {
                setCategoryFilter(cat.value);
                setExpandedId(null);
              }}
            />
          ))}
        </div>

        {/* Muscle group chips + Equipment dropdown ─────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Muscle chips */}
          <div
            role="group"
            aria-label="Filter by muscle group"
            className="flex flex-wrap gap-1.5 flex-1"
          >
            {MUSCLE_FILTER_GROUPS.map(group => (
              <MuscleChip
                key={group.label}
                label={group.label}
                selected={muscleFilter === group.label}
                onClick={() => {
                  setMuscleFilter(prev => (prev === group.label ? null : group.label));
                  setExpandedId(null);
                }}
              />
            ))}
          </div>

          {/* Equipment select */}
          <div className="shrink-0 self-start flex items-center gap-2">
            {profileEquipment && profileEquipment.length > 0 && (
              <button
                onClick={() => { setMatchMyEquipment(v => !v); setEquipmentFilter('any'); setExpandedId(null); }}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap',
                  matchMyEquipment
                    ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                    : 'bg-white/[0.045] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60',
                )}
                title={`Filter to your equipment: ${profileEquipment.join(', ')}`}
              >
                My Gym
              </button>
            )}
            <NeuralSelectMenu
              value={equipmentFilter}
              options={EQUIPMENT_OPTIONS as unknown as Array<{ label: string; value: string }>}
              onChange={val => {
                setEquipmentFilter(val);
                setMatchMyEquipment(false);
                setExpandedId(null);
              }}
              minWidthClassName="min-w-[155px]"
              ariaLabel="Filter by equipment"
            />
          </div>
        </div>

        {/* Result count + clear ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <PanelLabel
            label="Exercise Library"
            metadata={`Showing ${filteredExercises.length} of ${ENRICHED_LIBRARY.length}`}
            className="mb-0"
          />
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              aria-label="Clear all filters"
              className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--module-accent-ring)] rounded"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Exercise list ───────────────────────────────────────────────────── */}
        {filteredExercises.length === 0 ? (
          <EmptyState
            title="No exercises found"
            description="Try a different search term or adjust your filters."
            icon={BookOpen}
            size="md"
          />
        ) : (
          <div className="space-y-2">
            {filteredExercises.map(exercise => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                allExercises={ENRICHED_LIBRARY}
                isExpanded={expandedId === exercise.id}
                onToggle={() => toggleExpanded(exercise.id)}
                onAddExercise={onAddExercise}
              />
            ))}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}
