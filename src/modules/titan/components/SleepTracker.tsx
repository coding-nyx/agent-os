import React, { useState, useMemo, useCallback } from 'react';
import { Moon, Plus, TrendingUp, TrendingDown, Minus, Clock, MessageSquare } from 'lucide-react';
import type { SleepEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { PanelLabel } from '@/core/components/PanelLabel';
import { BarChart } from '@/core/components/viz/BarChart';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { getTodayIso } from '../utils';
import { useDataLogger } from './shared/useDataLogger';

interface SleepTrackerProps {
  sleepLog: SleepEntry[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (entry: SleepEntry) => Promise<void>;
}

const SLEEP_TAGS = ['stress', 'alcohol', 'late_meal', 'caffeine', 'exercise_pm', 'screen_time', 'travel', 'illness'] as const;

function qualityColor(q: number): string {
  if (q >= 8) return 'text-emerald-400';
  if (q >= 6) return 'text-[var(--module-color-400)]';
  if (q >= 4) return 'text-[var(--module-color-300)]';
  return 'text-rose-400';
}

function qualityLabel(q: number): string {
  if (q >= 8) return 'Excellent';
  if (q >= 6) return 'Good';
  if (q >= 4) return 'Poor';
  return 'Very Poor';
}

function durationColor(h: number): string {
  if (h >= 7.5) return 'text-emerald-400';
  if (h >= 6) return 'text-[var(--module-color-300)]';
  return 'text-rose-400';
}

export function SleepTracker({ sleepLog, onAnalyze, directWriteMode = false, onDirectSave }: SleepTrackerProps) {
  const [date, setDate] = useState(getTodayIso());
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState(7);
  const [deepSleepPct, setDeepSleepPct] = useState<number | ''>('');
  const [remSleepPct, setRemSleepPct] = useState<number | ''>('');
  const [awakenings, setAwakenings] = useState<number | ''>('');
  const [hrv, setHrv] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { showModal, openModal, closeModal, formError, setFormError, saving, handleSave } =
    useDataLogger<SleepEntry>({ directWriteMode, onDirectSave, onAnalyze });

  const durationHours = useMemo(() => {
    if (!bedtime || !wakeTime) return null;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wakeTime.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return parseFloat((mins / 60).toFixed(2));
  }, [bedtime, wakeTime]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }, []);

  const onSave = useCallback(async () => {
    await handleSave(() => {
      if (typeof deepSleepPct === 'number' && typeof remSleepPct === 'number' && deepSleepPct + remSleepPct > 100) {
        setFormError('Deep sleep % + REM % cannot exceed 100%.');
        return null;
      }
      const dur = durationHours ?? 7;
      const entry: SleepEntry = {
        id: crypto.randomUUID(),
        date,
        bedtime,
        wakeTime,
        durationHours: dur,
        quality,
        deepSleepPct: deepSleepPct || undefined,
        remSleepPct: remSleepPct || undefined,
        awakenings: awakenings || undefined,
        hrv: hrv || undefined,
        notes: notes.trim() || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        recordedAt: new Date().toISOString(),
      };
      const analyzePrompt = `Log sleep: ${dur}h, quality ${quality}/10 on ${date}${hrv ? `, HRV ${hrv}ms` : ''}. ` + (notes ? `Notes: ${notes}` : '');
      return { entry, analyzePrompt };
    });
  }, [handleSave, date, bedtime, wakeTime, durationHours, quality, deepSleepPct, remSleepPct, awakenings, hrv, notes, selectedTags, setFormError]);

  const recent = useMemo(() => [...sleepLog].sort((a, b) => b.date.localeCompare(a.date)), [sleepLog]);
  const avgQuality = sleepLog.length ? sleepLog.reduce((s, e) => s + e.quality, 0) / sleepLog.length : null;
  const avgDuration = sleepLog.length ? sleepLog.reduce((s, e) => s + e.durationHours, 0) / sleepLog.length : null;
  const lastEntry = recent[0];

  const chartData = useMemo(() => {
    return recent.slice(0, 7).reverse().map(e => ({
      category: e.date.split('-').slice(1).join('-'),
      value: e.quality,
    }));
  }, [recent]);

  return (
    <>
      <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5 space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between">
          <PanelLabel label="Sleep Analysis" metadata={recent.length ? `${recent.length} night${recent.length === 1 ? '' : 's'} tracked` : 'No data yet'} />
          <div className="flex gap-2">
            {lastEntry && onAnalyze && (
              <NeuralButton
                size="sm"
                variant="ghost"
                onClick={() => onAnalyze(`Analyze my sleep trends from the last ${recent.length} nights and give me actionable recommendations to improve recovery and training performance.`)}
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Trends
              </NeuralButton>
            )}
            <NeuralIconButton
              size="sm"
              onClick={() => openModal()}
              title="Log Sleep"
              aria-label="Log Sleep"
              icon={<Moon className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {sleepLog?.length === 0 && (
          <EmptyState
            title="No sleep data yet"
            description="Track your sleep to unlock AI-powered recovery analysis. Titan uses sleep quality to calibrate your training intensity."
            icon={Moon}
            action={
              <NeuralIconButton
                onClick={() => openModal()}
                title="Log Sleep"
                aria-label="Log Sleep"
                icon={<Moon className="w-4 h-4" />}
              />
            }
          />
        )}

        {recent.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              label="Avg Quality"
              value={avgQuality != null ? avgQuality.toFixed(1) : '—'}
              unit="/10"
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Avg Duration"
              value={avgDuration != null ? avgDuration.toFixed(1) : '—'}
              unit="h"
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Last Night"
              value={lastEntry ? lastEntry.quality.toFixed(0) : '—'}
              unit="/10"
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Nights Logged"
              value={sleepLog?.length ?? 0}
              color="orange"
              trendDirection="stable"
            />
          </div>
        )}

        {chartData.length > 0 && (
          <SurfaceCard className="p-4">
            <div className="mb-3">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/50">
                Sleep Quality — Last 7 Nights
              </p>
            </div>
            <BarChart
              data={chartData}
              orientation="vertical"
              height={160}
              color="orange"
              showValues
              animate
            />
          </SurfaceCard>
        )}

        {recent.length > 0 && (
          <SurfaceCard className="p-3 sm:p-4 md:p-5">
            <PanelLabel label="Recent Entries" metadata="last 14 nights" />
            <div className="space-y-2 mt-2">
              {recent.slice(0, 7).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-3 py-2.5 min-h-[2.75rem] rounded-xl bg-white/[0.045] border border-white/[0.09] hover:bg-white/[0.045] transition-colors gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Moon className="w-3.5 h-3.5 text-[var(--module-color-400)] shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/80">{entry.date}</span>
                        {entry.tags?.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-white/[0.045] border border-white/10 text-white/40">
                            {t.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                      {entry.notes && (
                        <p className="text-[11px] text-white/40 truncate mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className={cn('text-xs font-black tabular-nums', durationColor(entry.durationHours))}>
                        {entry.durationHours.toFixed(1)}h
                      </div>
                      <div className="text-[11px] text-white/40 uppercase">duration</div>
                    </div>
                    {entry.hrv && (
                      <div className="text-right">
                        <div className="text-xs font-black tabular-nums text-emerald-400">
                          {entry.hrv}
                        </div>
                        <div className="text-[11px] text-white/40 uppercase">hrv ms</div>
                      </div>
                    )}
                    <div className="text-right">
                      <div className={cn('text-sm font-black tabular-nums', qualityColor(entry.quality))}>
                        {entry.quality}<span className="text-[11px] text-white/40">/10</span>
                      </div>
                      <div className={cn('text-[11px] uppercase tracking-wider font-black', qualityColor(entry.quality))}>
                        {qualityLabel(entry.quality)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        )}
      </div>

      <NeuralModal
        isOpen={showModal}
        onClose={() => closeModal()}
        title="Log Sleep"
        subtitle="Track your recovery"
        icon={Moon}
        themeColor="module"
        maxWidth="lg"
      >
        <div className="space-y-5">
          <NeuralInput
            label="Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="focus:border-[var(--module-accent)]"
          />

          <div className="grid grid-cols-2 gap-3">
            <NeuralInput
              label="Bedtime"
              type="time"
              value={bedtime}
              onChange={e => setBedtime(e.target.value)}
              className="focus:border-[var(--module-accent)]"
            />
            <NeuralInput
              label="Wake Time"
              type="time"
              value={wakeTime}
              onChange={e => setWakeTime(e.target.value)}
              className="focus:border-[var(--module-accent)]"
            />
          </div>

          {durationHours != null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]">
              <Clock className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
              <span className="text-xs text-[var(--module-color-300)] font-black">{durationHours.toFixed(1)}h</span>
              <span className="text-xs text-white/40">total sleep</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Sleep Quality</label>
              <span className={cn('text-sm font-black tabular-nums', qualityColor(quality))}>
                {quality}/10 — {qualityLabel(quality)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={quality}
              onChange={e => setQuality(Number(e.target.value))}
              className="w-full accent-[var(--module-color-400)]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NeuralInput
              label="Deep Sleep %"
              type="number"
              min={0}
              max={100}
              placeholder="—"
              value={deepSleepPct}
              onChange={e => setDeepSleepPct(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="REM %"
              type="number"
              min={0}
              max={100}
              placeholder="—"
              value={remSleepPct}
              onChange={e => setRemSleepPct(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="Awakenings"
              type="number"
              min={0}
              placeholder="—"
              value={awakenings}
              onChange={e => setAwakenings(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
            <NeuralInput
              label="HRV (ms)"
              type="number"
              min={1}
              max={300}
              placeholder="—"
              value={hrv}
              onChange={e => setHrv(e.target.value ? Number(e.target.value) : '')}
              className="placeholder:text-white/20 focus:border-[var(--module-accent)] tabular-nums px-3 py-2 h-auto min-h-0"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Factors (optional)</label>
            <div className="flex flex-wrap gap-2">
              {SLEEP_TAGS.map(tag => (
                <NeuralButton
                  key={tag}
                  variant={selectedTags.includes(tag) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider transition-all h-auto',
                    selectedTags.includes(tag)
                      ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] text-[var(--module-color-300)]'
                      : 'bg-white/[0.045] border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60'
                  )}
                >
                  {tag.replace('_', ' ')}
                </NeuralButton>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Notes (optional)</label>
            <NeuralTextarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Dreams, disturbances, how you feel on waking..."
              rows={2}
              className="placeholder:text-white/30 focus:border-[var(--module-accent)]"
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
            <NeuralButton onClick={onSave} disabled={!directWriteMode && !onAnalyze}>
              <Moon className="w-4 h-4 mr-2" />
              {directWriteMode ? 'Save Entry' : 'Save & Analyze'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </>
  );
}
