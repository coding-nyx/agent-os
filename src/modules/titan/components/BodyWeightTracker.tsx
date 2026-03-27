/**
 * BodyWeightTracker — Log and visualise body weight / composition over time.
 *
 * Features:
 *  - Weight trend line chart (pure SVG, last 90 days)
 *  - Stats bar: current, delta from last entry, 7-day rate of change, entries logged
 *  - Log modal: date, weight (kg/lbs toggle), body fat %, optional measurements accordion
 *  - Supports both direct-write and AI (coach) mode
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Scale, Plus, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, MessageSquare, Camera,
} from 'lucide-react';
import type { BodyWeightEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getFirebase } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { getTodayIso } from '../utils';
import { useDataLogger } from './shared/useDataLogger';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface BodyWeightTrackerProps {
  bodyWeightLog: BodyWeightEntry[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (entry: BodyWeightEntry) => Promise<void>;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function kgToLbs(kg: number) { return Math.round(kg * 2.20462 * 10) / 10; }
function lbsToKg(lbs: number) { return Math.round((lbs / 2.20462) * 100) / 100; }

function formatWeight(kg: number, unit: 'kg' | 'lbs') {
  return unit === 'kg' ? `${kg} kg` : `${kgToLbs(kg)} lbs`;
}

function ratePer7Days(log: BodyWeightEntry[]): number | null {
  if (log.length < 2) return null;
  const newest = log[0];
  const target = log.find(e => {
    const diff = (new Date(newest.date).getTime() - new Date(e.date).getTime()) / 86_400_000;
    return diff >= 6;
  });
  if (!target) return null;
  const days = (new Date(newest.date).getTime() - new Date(target.date).getTime()) / 86_400_000;
  if (days === 0) return null;
  return Math.round(((newest.weight - target.weight) / days) * 7 * 100) / 100;
}

// ---------------------------------------------------------------------------
// Weight Trend SVG Chart
// ---------------------------------------------------------------------------

function WeightTrendChart({ log }: { log: BodyWeightEntry[] }) {
  const data = useMemo(() => {
    const cutoff = Date.now() - 90 * 86_400_000;
    return [...log]
      .filter(e => new Date(e.date).getTime() >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [log]);

  if (data.length < 2) return null;

  const values = data.map(e => e.weight);
  const minW = Math.min(...values) - 0.5;
  const maxW = Math.max(...values) + 0.5;
  const range = maxW - minW || 1;
  const n = data.length;

  const W = 500;
  const H = 120;
  const PAD_X = 8;
  const PAD_Y = 8;

  const svgPts = data.map((e, i): [number, number] => {
    const x = PAD_X + (i / (n - 1)) * (W - PAD_X * 2);
    const y = H - PAD_Y - ((e.weight - minW) / range) * (H - PAD_Y * 2);
    return [x, y];
  });

  const polyline = svgPts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = [
    ...svgPts,
    [svgPts[n - 1][0], H] as [number, number],
    [svgPts[0][0], H] as [number, number],
  ].map(([x, y]) => `${x},${y}`).join(' ');

  const trend = values[values.length - 1] < values[0];
  const lineColor = trend ? '#34d399' : '#f97316';
  const stopColor = trend ? 'rgba(52,211,153,' : 'rgba(249,115,22,';

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-24"
        aria-label="Weight trend chart"
      >
        <defs>
          <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${stopColor}0.25)`} />
            <stop offset="100%" stopColor={`${stopColor}0)`} />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#weightGrad)" />
        <polyline
          points={polyline}
          stroke={lineColor}
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* First and last dots */}
        {[svgPts[0], svgPts[n - 1]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill={lineColor} />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-white/30 px-1 mt-0.5">
        <span>{data[0].date.slice(5)}</span>
        <span className="text-white/50 font-bold">{n} entries</span>
        <span>{data[n - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log Entry Row
// ---------------------------------------------------------------------------

function EntryRow({ entry, unit }: { entry: BodyWeightEntry; unit: 'kg' | 'lbs' }) {
  const [expanded, setExpanded] = useState(false);
  const hasMeasurements = entry.measurements && Object.values(entry.measurements).some(v => v != null);

  return (
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.045] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Scale className="w-3 h-3 text-white/30 shrink-0" />
          <span className="text-xs font-bold text-white/80">{entry.date}</span>
          {entry.bodyFatPct != null && (
            <span className="text-[11px] text-white/40">{entry.bodyFatPct}% BF</span>
          )}
          {entry.notes && (
            <span className="text-[11px] text-white/30 italic truncate max-w-[120px]">{entry.notes}</span>
          )}
          {entry.photoUrl && (
            <a href={entry.photoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
              <Camera className="w-3 h-3 text-[var(--module-color-400)]/60 hover:text-[var(--module-color-400)]" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-[var(--module-color-400)] tabular-nums">
            {formatWeight(entry.weight, unit)}
          </span>
          {hasMeasurements && (
            expanded ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />
          )}
        </div>
      </button>

      {expanded && hasMeasurements && entry.measurements && (
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.09] flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(entry.measurements).map(([key, val]) =>
            val != null ? (
              <span key={key} className="text-[11px] text-white/50">
                {key.replace(/([A-Z])/g, ' $1').toLowerCase()}: {val} cm
              </span>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BodyWeightTracker({
  bodyWeightLog,
  onAnalyze,
  directWriteMode = false,
  onDirectSave,
  userId,
}: BodyWeightTrackerProps) {
  const [unit, setUnit] = useState<'kg' | 'lbs'>('kg');
  const [showMeasurements, setShowMeasurements] = useState(false);

  // Form state
  const [date, setDate] = useState(getTodayIso);
  const [weightInput, setWeightInput] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { showModal, openModal, closeModal, formError, setFormError, saving, handleSave } =
    useDataLogger<BodyWeightEntry>({ directWriteMode, onDirectSave, onAnalyze });

  const setMeasurement = useCallback((key: string, val: string) => {
    setMeasurements(prev => ({ ...prev, [key]: val }));
  }, []);

  const MEASUREMENT_FIELDS: { key: string; label: string }[] = [
    { key: 'waist', label: 'Waist' },
    { key: 'hips', label: 'Hips' },
    { key: 'chest', label: 'Chest' },
    { key: 'leftArm', label: 'L. Arm' },
    { key: 'rightArm', label: 'R. Arm' },
    { key: 'leftLeg', label: 'L. Leg' },
    { key: 'rightLeg', label: 'R. Leg' },
    { key: 'neck', label: 'Neck' },
    { key: 'calves', label: 'Calves' },
  ];

  const onSave = useCallback(async () => {
    // Upload photo first if provided
    let photoUrl: string | undefined;
    if (photoFile && userId) {
      try {
        const { storage } = getFirebase();
        if (storage) {
          const path = `titan/${userId}/progress-photos/${date}-${Date.now()}.${photoFile.name.split('.').pop()}`;
          const fileRef = storageRef(storage, path);
          await uploadBytes(fileRef, photoFile);
          photoUrl = await getDownloadURL(fileRef);
        }
      } catch {
        // Non-fatal — proceed without photo
      }
    }
    await handleSave(() => {
      const rawWeight = parseFloat(weightInput);
      if (!weightInput || isNaN(rawWeight) || rawWeight <= 0) {
        setFormError('Enter a valid weight.');
        return null;
      }
      const weightKg = unit === 'lbs' ? lbsToKg(rawWeight) : rawWeight;
      if (weightKg < 20 || weightKg > 300) {
        setFormError('Weight must be between 20 and 300 kg.');
        return null;
      }

      const parsedBF = bodyFat ? parseFloat(bodyFat) : undefined;
      const parsedMeasurements: BodyWeightEntry['measurements'] = {};
      let hasMeasurements = false;
      for (const { key } of MEASUREMENT_FIELDS) {
        const v = measurements[key];
        if (v) {
          (parsedMeasurements as Record<string, number>)[key] = parseFloat(v);
          hasMeasurements = true;
        }
      }

      const entry: BodyWeightEntry = {
        id: crypto.randomUUID(),
        date,
        weight: Math.round(weightKg * 100) / 100,
        bodyFatPct: parsedBF != null && !isNaN(parsedBF) ? parsedBF : undefined,
        measurements: hasMeasurements ? parsedMeasurements : undefined,
        notes: notes.trim() || undefined,
        photoUrl,
        recordedAt: new Date().toISOString(),
      };

      const bfStr = entry.bodyFatPct != null ? ` Body fat: ${entry.bodyFatPct}%.` : '';
      const analyzePrompt =
        `Log my body weight for ${date}: ${weightKg} kg.${bfStr}` +
        (notes.trim() ? ` Notes: "${notes.trim()}".` : '') +
        ' Save this entry and give me a brief body composition analysis.';

      return { entry, analyzePrompt };
    });
    setWeightInput('');
    setBodyFat('');
    setMeasurements({});
    setNotes('');
    setPhotoFile(null);
    setPhotoPreview(null);
  }, [handleSave, weightInput, unit, date, bodyFat, measurements, notes, photoFile, userId, setFormError]);

  // Derived stats
  const latest = bodyWeightLog?.[0] ?? null;
  const prev = bodyWeightLog?.[1] ?? null;
  const delta = latest && prev ? Math.round((latest.weight - prev.weight) * 100) / 100 : null;
  const weekRate = useMemo(() => ratePer7Days(bodyWeightLog ?? []), [bodyWeightLog]);
  const trendDir: 'up' | 'down' | 'stable' =
    weekRate == null ? 'stable' : weekRate < -0.05 ? 'down' : weekRate > 0.05 ? 'up' : 'stable';

  const recent = (bodyWeightLog ?? []).slice(0, 10);

  return (
    <>
      <div className="space-y-4 sm:space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PanelLabel
            label="Body Composition"
            metadata={bodyWeightLog?.length ? `${bodyWeightLog.length} entries` : 'No data yet'}
          />
          <div className="flex items-center gap-2">
            {/* Unit toggle */}
            <NeuralButton
              size="sm"
              variant="ghost"
              onClick={() => setUnit(u => u === 'kg' ? 'lbs' : 'kg')}
              className="text-[11px] font-black uppercase tracking-wider"
            >
              {unit}
            </NeuralButton>
            {latest && onAnalyze && (
              <NeuralButton
                size="sm"
                variant="ghost"
                onClick={() => onAnalyze(
                  `Analyze my body weight trend from the last ${bodyWeightLog?.length ?? 0} entries and provide actionable insights on my body composition trajectory.`
                )}
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Analyze
              </NeuralButton>
            )}
            <NeuralIconButton
              size="sm"
              onClick={() => openModal()}
              title="Log Weight"
              aria-label="Log Weight"
              icon={<Scale className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* Empty state */}
        {!bodyWeightLog?.length && (
          <EmptyState
            icon={Scale}
            title="No weight data yet"
            description="Track your body weight to monitor composition changes and set a baseline for your transformation."
            action={
              <NeuralIconButton
                onClick={() => openModal()}
                title="Log Weight"
                aria-label="Log Weight"
                icon={<Scale className="w-4 h-4" />}
              />
            }
          />
        )}

        {/* Stats row */}
        {latest && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Current"
              value={unit === 'kg' ? latest.weight : kgToLbs(latest.weight)}
              unit={unit}
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Change"
              value={delta != null ? (delta >= 0 ? `+${unit === 'kg' ? delta : kgToLbs(Math.abs(delta))}` : `${unit === 'kg' ? delta : `-${kgToLbs(Math.abs(delta))}`}`) : '—'}
              unit={delta != null ? unit : ''}
              color={delta == null ? 'orange' : delta < 0 ? 'emerald' : delta > 0 ? 'orange' : 'orange'}
              trendDirection={delta == null ? 'stable' : delta < 0 ? 'down' : delta > 0 ? 'up' : 'stable'}
            />
            <MetricCard
              label="7-Day Rate"
              value={weekRate != null ? (weekRate >= 0 ? `+${unit === 'kg' ? weekRate : kgToLbs(Math.abs(weekRate))}` : `${unit === 'kg' ? weekRate : `-${kgToLbs(Math.abs(weekRate))}`}`) : '—'}
              unit={weekRate != null ? `${unit}/wk` : ''}
              color={weekRate == null ? 'orange' : weekRate < 0 ? 'emerald' : weekRate > 0.5 ? 'orange' : 'orange'}
              trendDirection={trendDir}
            />
            <MetricCard
              label="Entries"
              value={bodyWeightLog?.length ?? 0}
              color="orange"
              trendDirection="stable"
            />
          </div>
        )}

        {/* Trend chart */}
        {(bodyWeightLog?.length ?? 0) >= 2 && (
          <SurfaceCard className="p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50 mb-3">
              Weight Trend — Last 90 Days
            </p>
            <WeightTrendChart log={bodyWeightLog ?? []} />
          </SurfaceCard>
        )}

        {/* Recent entries */}
        {recent.length > 0 && (
          <SurfaceCard className="p-4">
            <PanelLabel label="Recent Entries" metadata="last 10" />
            <div className="space-y-1.5 mt-2">
              {recent.map(e => (
                <EntryRow key={e.id} entry={e} unit={unit} />
              ))}
            </div>
          </SurfaceCard>
        )}
      </div>

      {/* Log Weight Modal */}
      <NeuralModal
        isOpen={showModal}
        onClose={() => closeModal()}
        title="Log Weight"
        subtitle="Track your body composition"
        icon={Scale}
        themeColor="module"
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* Date */}
          <NeuralInput
            label="Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="focus:border-[var(--module-accent)]"
          />

          {/* Weight + unit toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">
                Weight ({unit})
              </label>
              <NeuralToggle
                checked={unit === 'lbs'}
                onChange={(isLbs) => setUnit(isLbs ? 'lbs' : 'kg')}
                size="sm"
                color="orange"
                label={`Switch to ${unit === 'kg' ? 'lbs' : 'kg'}`}
              />
            </div>
            <NeuralInput
              type="number"
              step="0.1"
              min={unit === 'kg' ? 20 : 44}
              max={unit === 'kg' ? 300 : 660}
              placeholder={unit === 'kg' ? '75.0' : '165.0'}
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              className="focus:border-[var(--module-accent)] tabular-nums"
            />
          </div>

          {/* Body fat % */}
          <NeuralInput
            label="Body Fat % (optional)"
            type="number"
            step="0.1"
            min={3}
            max={60}
            placeholder="—"
            value={bodyFat}
            onChange={e => setBodyFat(e.target.value)}
            className="focus:border-[var(--module-accent)] tabular-nums"
          />

          {/* Measurements accordion */}
          <div className="space-y-2">
            <NeuralButton
              variant="ghost"
              size="sm"
              onClick={() => setShowMeasurements(v => !v)}
              className="text-[11px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/60 h-auto p-1"
            >
              {showMeasurements ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              Measurements (cm) — optional
            </NeuralButton>
            {showMeasurements && (
              <div className="grid grid-cols-2 gap-3">
                {MEASUREMENT_FIELDS.map(({ key, label }) => (
                  <NeuralInput
                    key={key}
                    label={label}
                    type="number"
                    step="0.1"
                    placeholder="—"
                    value={measurements[key] ?? ''}
                    onChange={e => setMeasurement(key, e.target.value)}
                    className="focus:border-[var(--module-accent)] tabular-nums h-10 min-h-[40px]"
                  />
                ))}
              </div>
            )}
          </div>

{/* Progress Photo */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Progress Photo (optional)
            </label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) {
                  setPhotoFile(file);
                  setPhotoPreview(URL.createObjectURL(file));
                }
              }}
            />
            {photoPreview ? (
              <div className="relative w-full max-w-[160px]">
                <img src={photoPreview} alt="preview" className="w-full rounded-xl object-cover max-h-40 border border-white/[0.12]" />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-1 right-1 bg-slate-900/85 rounded-full p-0.5 text-white/60 hover:text-white"
                >✕</button>
              </div>
            ) : (
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 text-white/40 hover:text-white/70 border border-dashed border-white/[0.12] hover:border-white/20 px-4 py-2 rounded-xl"
              >
                <Camera className="w-4 h-4" />
                Add photo
              </NeuralButton>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Notes (optional)
            </label>
            <NeuralTextarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Morning weigh-in, post-competition, etc."
              rows={2}
              className="focus:border-[var(--module-accent)]"
            />
          </div>

          {formError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-white/[0.09]">
            <NeuralButton variant="ghost" onClick={() => closeModal()}>
              Cancel
            </NeuralButton>
            <NeuralButton
              onClick={onSave}
              disabled={saving || (!directWriteMode && !onAnalyze)}
            >
              <Scale className="w-4 h-4 mr-2" />
              {directWriteMode ? 'Save Entry' : 'Save & Analyze'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </>
  );
}
