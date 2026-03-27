import React, { useState, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Plus,
  Shield,
  Activity,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Injury, InjurySeverity, InjuryStatus, BodyRegion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EXERCISE_LIBRARY } from '../data/exercise-library';
import { getTodayIso } from '../utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface InjuryTrackerProps {
  injuries: Injury[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (injury: Injury) => Promise<void>;
  onDirectUpdate?: (injury: Injury) => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BODY_REGION_OPTIONS: Array<{ label: string; value: BodyRegion }> = [
  { label: 'Shoulder', value: 'shoulder' },
  { label: 'Elbow', value: 'elbow' },
  { label: 'Wrist', value: 'wrist' },
  { label: 'Hand', value: 'hand' },
  { label: 'Upper Back', value: 'upper_back' },
  { label: 'Lower Back', value: 'lower_back' },
  { label: 'Hip', value: 'hip' },
  { label: 'Knee', value: 'knee' },
  { label: 'Ankle', value: 'ankle' },
  { label: 'Foot', value: 'foot' },
  { label: 'Neck', value: 'neck' },
  { label: 'Chest', value: 'chest' },
  { label: 'Abdomen', value: 'abdomen' },
  { label: 'Other', value: 'other' },
];

const SEVERITY_OPTIONS: Array<{ label: string; value: InjurySeverity }> = [
  { label: 'Mild', value: 'mild' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' },
];

const STATUS_OPTIONS: Array<{ label: string; value: InjuryStatus }> = [
  { label: 'Active', value: 'active' },
  { label: 'Recovering', value: 'recovering' },
  { label: 'Resolved', value: 'resolved' },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

function formatBodyRegion(r: BodyRegion): string {
  return BODY_REGION_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

function severityColor(s: InjurySeverity): string {
  if (s === 'mild') return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
  if (s === 'moderate') return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
  return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
}

function statusColor(s: InjuryStatus): string {
  if (s === 'active') return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
  if (s === 'recovering') return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
  return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
}

function statusLabel(s: InjuryStatus): string {
  if (s === 'active') return 'Active';
  if (s === 'recovering') return 'Recovering';
  return 'Resolved';
}

/**
 * Find up to `limit` safe exercise alternatives for a given set of avoided exercises.
 * Safe = shares a primary muscle group with the avoided exercise AND is not itself avoided.
 *
 * Complexity: O(|exercisesToAvoid| × |EXERCISE_LIBRARY|) — bounded by library size (~35 entries).
 */
function findAlternatives(
  avoidedName: string,
  allAvoided: string[],
  limit = 3
): string[] {
  const avoidedLower = new Set(allAvoided.map((n) => n.toLowerCase().trim()));
  const targetEntry = EXERCISE_LIBRARY.find(
    (e) => e.name.toLowerCase() === avoidedName.toLowerCase().trim()
  );
  if (!targetEntry) return [];

  const targetGroups = new Set(targetEntry.muscleGroups);
  const alternatives: string[] = [];

  for (const entry of EXERCISE_LIBRARY) {
    if (alternatives.length >= limit) break;
    if (avoidedLower.has(entry.name.toLowerCase().trim())) continue;
    if (entry.muscleGroups.some((g) => targetGroups.has(g))) {
      alternatives.push(entry.name);
    }
  }
  return alternatives;
}

/** Derive all muscle groups affected by the exercises-to-avoid list */
function affectedMuscleGroups(exercisesToAvoid: string[]): string[] {
  const groups = new Set<string>();
  for (const name of exercisesToAvoid) {
    const entry = EXERCISE_LIBRARY.find(
      (e) => e.name.toLowerCase() === name.toLowerCase().trim()
    );
    if (entry) entry.muscleGroups.forEach((g) => groups.add(g));
  }
  return Array.from(groups);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ExerciseSubstitutionPanelProps {
  exercisesToAvoid: string[];
}

function ExerciseSubstitutionPanel({ exercisesToAvoid }: ExerciseSubstitutionPanelProps) {
  const [open, setOpen] = useState(false);

  if (!exercisesToAvoid.length) return null;

  const substitutions = exercisesToAvoid.map((ex) => ({
    avoided: ex,
    alternatives: findAlternatives(ex, exercisesToAvoid),
  }));

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--module-color-400)] hover:text-white transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        Safe Substitutions
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {substitutions.map(({ avoided, alternatives }) => (
                <div key={avoided}>
                  <p className="text-[11px] text-white/40 mb-1">
                    Instead of{' '}
                    <span className="text-rose-400 line-through">{avoided}</span>:
                  </p>
                  {alternatives.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {alternatives.map((alt) => (
                        <span
                          key={alt}
                          className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)] cursor-default"
                        >
                          {alt}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-white/30 italic">
                      No library matches — ask trainer for alternatives.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface InjuryCardProps {
  injury: Injury;
  onMarkResolved: (injury: Injury) => void;
  saving: boolean;
}

function InjuryCard({ injury, onMarkResolved, saving }: InjuryCardProps) {
  const muscleGroups = useMemo(
    () => affectedMuscleGroups(injury.exercisesToAvoid ?? []),
    [injury.exercisesToAvoid]
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 space-y-3"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-tight truncate">
            {injury.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Body region */}
            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/[0.045] border border-white/[0.12] text-white/60">
              {formatBodyRegion(injury.bodyRegion)}
            </span>
            {/* Severity */}
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                severityColor(injury.severity)
              )}
            >
              {injury.severity.charAt(0).toUpperCase() + injury.severity.slice(1)}
            </span>
            {/* Status */}
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                statusColor(injury.status)
              )}
            >
              {statusLabel(injury.status)}
            </span>
          </div>
        </div>

        {/* Mark resolved button */}
        {injury.status !== 'resolved' && (
          <NeuralButton
            size="sm"
            variant="ghost"
            onClick={() => onMarkResolved(injury)}
            disabled={saving}
            className="shrink-0 text-emerald-400 hover:text-emerald-300 border-emerald-400/20"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Resolved
          </NeuralButton>
        )}
      </div>

      {/* Onset date */}
      <div className="flex items-center gap-1.5 text-[11px] text-white/40">
        <Calendar className="w-3 h-3" />
        <span>
          Since{' '}
          {new Date(injury.onsetDate + 'T00:00:00').toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        {injury.resolvedDate && (
          <span className="text-emerald-400">
            → resolved{' '}
            {new Date(injury.resolvedDate + 'T00:00:00').toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>

      {/* Modifications */}
      {injury.modifications && (
        <div className="rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] px-3 py-2">
          <p className="text-[11px] font-semibold text-[var(--module-color-400)] mb-0.5">
            Coach Note
          </p>
          <p className="text-[11px] text-white/70 leading-relaxed">
            {injury.modifications}
          </p>
        </div>
      )}

      {/* Exercises to avoid + affected muscle groups */}
      {(injury.exercisesToAvoid?.length ?? 0) > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-white/40 mb-1.5">Exercises to Avoid</p>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {injury.exercisesToAvoid!.map((ex) => (
              <span
                key={ex}
                className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-400/10 border border-rose-400/20 text-rose-300"
              >
                {ex}
              </span>
            ))}
          </div>
          {muscleGroups.length > 0 && (
            <p className="text-[11px] text-white/30">
              Affected groups:{' '}
              <span className="text-[var(--module-color-400)]">
                {muscleGroups.join(', ')}
              </span>
            </p>
          )}
          <ExerciseSubstitutionPanel exercisesToAvoid={injury.exercisesToAvoid!} />
        </div>
      )}

      {/* Notes */}
      {injury.notes && (
        <p className="text-[11px] text-white/40 italic leading-relaxed">{injury.notes}</p>
      )}
    </motion.div>
  );
}

// ─── Log Injury Modal form state ──────────────────────────────────────────────

interface InjuryFormState {
  name: string;
  bodyRegion: BodyRegion;
  onsetDate: string;
  severity: InjurySeverity;
  exercisesToAvoidRaw: string; // comma-separated input
  modifications: string;
  notes: string;
}

function defaultForm(): InjuryFormState {
  return {
    name: '',
    bodyRegion: 'shoulder',
    onsetDate: getTodayIso(),
    severity: 'mild',
    exercisesToAvoidRaw: '',
    modifications: '',
    notes: '',
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InjuryTracker({
  injuries,
  onAnalyze,
  directWriteMode = false,
  onDirectSave,
  onDirectUpdate,
}: InjuryTrackerProps) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<InjuryFormState>(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);

  // Partition injuries
  const { active, resolved } = useMemo(() => {
    const active: Injury[] = [];
    const resolved: Injury[] = [];
    for (const inj of injuries) {
      if (inj.status === 'resolved') {
        resolved.push(inj);
      } else {
        active.push(inj);
      }
    }
    // Sort active: severe first, then by onset date desc
    const severityRank: Record<InjurySeverity, number> = { severe: 0, moderate: 1, mild: 2 };
    active.sort((a, b) => {
      const diff = severityRank[a.severity] - severityRank[b.severity];
      if (diff !== 0) return diff;
      return b.onsetDate.localeCompare(a.onsetDate);
    });
    resolved.sort((a, b) => (b.resolvedDate ?? b.onsetDate).localeCompare(a.resolvedDate ?? a.onsetDate));
    return { active, resolved };
  }, [injuries]);

  // ── Form handlers ──────────────────────────────────────────────────────────

  const openModal = useCallback(() => {
    setForm(defaultForm());
    setFormError(null);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      setFormError('Injury name is required.');
      return;
    }
    if (!form.onsetDate) {
      setFormError('Onset date is required.');
      return;
    }

    const exercisesToAvoid = form.exercisesToAvoidRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const now = new Date().toISOString();
    const injury: Injury = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      bodyRegion: form.bodyRegion,
      onsetDate: form.onsetDate,
      severity: form.severity,
      status: 'active',
      exercisesToAvoid: exercisesToAvoid.length > 0 ? exercisesToAvoid : undefined,
      modifications: form.modifications.trim() || undefined,
      notes: form.notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    setFormError(null);
    setSaving(true);
    try {
      if (directWriteMode && onDirectSave) {
        await onDirectSave(injury);
        setShowModal(false);
      } else if (onAnalyze) {
        const avoidStr =
          exercisesToAvoid.length > 0
            ? ` Exercises to avoid: ${exercisesToAvoid.join(', ')}.`
            : '';
        const prompt = `Log a new injury: "${injury.name}" (${injury.bodyRegion}, ${injury.severity} severity) starting ${injury.onsetDate}.${avoidStr}${injury.modifications ? ` Modifications: ${injury.modifications}.` : ''}${injury.notes ? ` Notes: ${injury.notes}.` : ''}`;
        onAnalyze(prompt);
        setShowModal(false);
      }
    } catch {
      setFormError('Failed to save injury. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [form, directWriteMode, onDirectSave, onAnalyze]);

  // ── Mark-as-resolved handler ───────────────────────────────────────────────

  const handleMarkResolved = useCallback(
    async (injury: Injury) => {
      const now = new Date().toISOString();
      const updated: Injury = {
        ...injury,
        status: 'resolved',
        resolvedDate: getTodayIso(),
        updatedAt: now,
      };

      setSaving(true);
      try {
        if (directWriteMode && onDirectUpdate) {
          await onDirectUpdate(updated);
        } else if (onAnalyze) {
          onAnalyze(
            `Mark injury "${injury.name}" as resolved as of today (${getTodayIso()}).`
          );
        }
      } catch {
        // Silent — no modal to show error in
      } finally {
        setSaving(false);
      }
    },
    [directWriteMode, onDirectUpdate, onAnalyze]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SurfaceCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center">
            <Shield className="w-4 h-4 text-[var(--module-color-300)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 leading-tight">
              Injury Management
            </p>
            <p className="text-[11px] text-white/40 mt-0.5">
              {active.length > 0
                ? `${active.length} active · ${resolved.length} resolved`
                : 'Track and manage injuries'}
            </p>
          </div>
        </div>

        <NeuralButton size="sm" onClick={openModal}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Log Injury
        </NeuralButton>
      </div>

      {/* Active Injuries */}
      {active.length === 0 && resolved.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No injuries logged"
          description="Log an injury to track recovery, get exercise substitutions, and receive tailored coaching."
        />
      ) : active.length === 0 ? (
        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/5 px-4 py-3 mb-4">
          <p className="text-[12px] text-emerald-400 font-semibold">
            ✓ No active injuries — all clear.
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          <AnimatePresence>
            {active.map((inj) => (
              <InjuryCard
                key={inj.id}
                injury={inj}
                onMarkResolved={handleMarkResolved}
                saving={saving}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Resolved Injuries (collapsible) */}
      {resolved.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setResolvedOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left text-[11px] font-semibold text-white/40 hover:text-white/70 transition-colors py-1"
          >
            {resolvedOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <BookOpen className="w-3 h-3" />
            {resolved.length} Resolved{' '}
            {resolved.length === 1 ? 'Injury' : 'Injuries'}
          </button>

          <AnimatePresence>
            {resolvedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-2">
                  {resolved.map((inj) => (
                    <div
                      key={inj.id}
                      className="flex items-center justify-between rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-white/60 truncate">
                            {inj.name}
                          </p>
                          <p className="text-[11px] text-white/30">
                            {formatBodyRegion(inj.bodyRegion)} ·{' '}
                            {inj.onsetDate} → {inj.resolvedDate ?? '?'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0',
                          severityColor(inj.severity)
                        )}
                      >
                        {inj.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Log Injury Modal ── */}
      <NeuralModal
        isOpen={showModal}
        onClose={closeModal}
        title="Log Injury"
        themeColor="module"
      >
        <div className="space-y-4 mt-1">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Injury Name *
            </label>
            <NeuralInput
              placeholder="e.g. Left shoulder impingement"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Body Region + Severity row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
                Body Region
              </label>
              <NeuralSelectMenu<BodyRegion>
                value={form.bodyRegion}
                options={BODY_REGION_OPTIONS}
                onChange={(v) => setForm((f) => ({ ...f, bodyRegion: v }))}
                ariaLabel="Body region"
                minWidthClassName="w-full"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
                Severity
              </label>
              <NeuralSelectMenu<InjurySeverity>
                value={form.severity}
                options={SEVERITY_OPTIONS}
                onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
                ariaLabel="Severity"
                minWidthClassName="w-full"
              />
            </div>
          </div>

          {/* Onset date */}
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Onset Date *
            </label>
            <NeuralInput
              type="date"
              value={form.onsetDate}
              onChange={(e) => setForm((f) => ({ ...f, onsetDate: e.target.value }))}
            />
          </div>

          {/* Exercises to avoid */}
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Exercises to Avoid{' '}
              <span className="font-normal opacity-60">(comma-separated)</span>
            </label>
            <NeuralInput
              placeholder="Overhead Press, Lateral Raise, Bench Press"
              value={form.exercisesToAvoidRaw}
              onChange={(e) =>
                setForm((f) => ({ ...f, exercisesToAvoidRaw: e.target.value }))
              }
            />
          </div>

          {/* Modifications */}
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Coaching Modifications
            </label>
            <NeuralTextarea
              placeholder="e.g. Use cable face pulls instead of overhead pressing movements"
              value={form.modifications}
              onChange={(e) => setForm((f) => ({ ...f, modifications: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1.5">
              Notes
            </label>
            <NeuralTextarea
              placeholder="Additional context, pain level, treatment plan..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Error */}
          {formError && (
            <div className="flex items-center gap-2 text-rose-400 text-[11px] bg-rose-400/10 border border-rose-400/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {formError}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <NeuralButton
              variant="ghost"
              onClick={closeModal}
              disabled={saving}
              className="flex-1"
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="flex-1"
            >
              {saving
                ? 'Saving…'
                : directWriteMode
                ? 'Save Injury'
                : 'Send to Trainer'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </SurfaceCard>
  );
}
