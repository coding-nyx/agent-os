import React, { useState, useMemo, useCallback } from 'react';
import { Moon, Plus, TrendingUp, TrendingDown, Minus, Brain, Clock, Zap, MessageSquare } from 'lucide-react';
import type { SleepEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { PanelLabel } from '@/core/components/PanelLabel';
import { BarChart } from '@/core/components/viz/BarChart';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { getTodayIso } from '../utils';

interface SleepTrackerProps {
  sleepLog: SleepEntry[];
  onAnalyze?: (prompt: string) => void;
}

const SLEEP_TAGS = ['stress', 'alcohol', 'late_meal', 'caffeine', 'exercise_pm', 'screen_time', 'travel', 'illness'] as const;

function qualityColor(q: number): string {
  if (q >= 8) return 'text-emerald-400';
  if (q >= 6) return 'text-cyan-400';
  if (q >= 4) return 'text-amber-400';
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
  if (h >= 6) return 'text-amber-400';
  return 'text-rose-400';
}

function trendIcon(current: number, previous: number) {
  const delta = current - previous;
  if (delta > 0.5) return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (delta < -0.5) return <TrendingDown className="w-3 h-3 text-rose-400" />;
  return <Minus className="w-3 h-3 text-white/40" />;
}


export function SleepTracker({ sleepLog, onAnalyze }: SleepTrackerProps) {
  const [showModal, setShowModal] = useState(false);

  // ── form state ──
  const [date, setDate] = useState(getTodayIso());
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState(7);
  const [deepSleepPct, setDeepSleepPct] = useState<number | ''>('');
  const [remSleepPct, setRemSleepPct] = useState<number | ''>('');
  const [awakenings, setAwakenings] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-derive duration from bedtime/waketime
  const durationHours = useMemo(() => {
    if (!bedtime || !wakeTime) return null;
    const [bh, bm] = bedtime.split(':').map(Number);
    const [wh, wm] = wakeTime.split(':').map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60; // crossed midnight
    return parseFloat((mins / 60).toFixed(2));
  }, [bedtime, wakeTime]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!onAnalyze) return;
    if (typeof deepSleepPct === 'number' && typeof remSleepPct === 'number' && deepSleepPct + remSleepPct > 100) {
      setFormError('Deep sleep % + REM % cannot exceed 100%.');
      return;
    }
    setFormError(null);
    const dur = durationHours ?? 7;
    const tagStr = selectedTags.length ? ` Tags: ${selectedTags.join(', ')}.` : '';
    const extrasStr = [
      deepSleepPct !== '' ? `deep sleep ${deepSleepPct}%` : null,
      remSleepPct !== '' ? `REM ${remSleepPct}%` : null,
      awakenings !== '' ? `${awakenings} awakenings` : null,
    ].filter(Boolean).join(', ');
    const notesStr = notes.trim() ? ` Notes: "${notes.trim()}".` : '';

    const prompt = [
      `Log my sleep for ${date}:`,
      `Bedtime ${bedtime}, wake ${wakeTime} (${dur.toFixed(1)}h). Quality: ${quality}/10.`,
      extrasStr,
      tagStr,
      notesStr,
      'Save this entry and give me a brief sleep quality analysis with any recommendations.',
    ].filter(Boolean).join(' ');

    onAnalyze(prompt);
    setShowModal(false);
    // Reset
    setDate(getTodayIso());
    setNotes('');
    setSelectedTags([]);
    setDeepSleepPct('');
    setRemSleepPct('');
    setAwakenings('');
  }, [date, bedtime, wakeTime, durationHours, quality, deepSleepPct, remSleepPct, awakenings, notes, selectedTags, onAnalyze]);

  // ── stats ──
  const recent = useMemo(() => (sleepLog ?? []).slice(0, 14), [sleepLog]);
  const avgQuality = recent.length ? recent.reduce((s, e) => s + e.quality, 0) / recent.length : null;
  const avgDuration = recent.length ? recent.reduce((s, e) => s + e.durationHours, 0) / recent.length : null;
  const prevQuality = recent.length > 7
    ? recent.slice(7).reduce((s, e) => s + e.quality, 0) / recent.slice(7).length
    : null;

  // Bar chart data (last 7 nights, reversed so oldest left)
  const chartData = useMemo(() => {
    const last7 = (sleepLog ?? []).slice(0, 7).reverse();
    return last7.map(e => ({
      category: e.date.slice(5), // MM-DD
      value: e.quality,
    }));
  }, [sleepLog]);

  const lastEntry = sleepLog?.[0] ?? null;

  return (
    <>
      <div className="px-8 pb-6 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <PanelLabel label="Sleep Analysis" metadata={recent.length ? `${recent.length} nights tracked` : 'No data yet'} />
          <div className="flex gap-2">
            {lastEntry && onAnalyze && (
              <NeuralButton
                size="sm"
                variant="ghost"
                onClick={() => onAnalyze(`Analyze my sleep trends from the last ${recent.length} nights and give me actionable recommendations to improve recovery and training performance.`)}
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Analyze Trends
              </NeuralButton>
            )}
            <NeuralButton size="sm" onClick={() => setShowModal(true)}>
              <Plus className="w-3 h-3 mr-1.5" />
              Log Sleep
            </NeuralButton>
          </div>
        </div>

        {/* Empty state */}
        {sleepLog?.length === 0 && (
          <EmptyState
            title="No sleep data yet"
            description="Track your sleep to unlock AI-powered recovery analysis. Titan uses sleep quality to calibrate your training intensity."
            icon={Moon}
            action={
              <NeuralButton onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Log First Night
              </NeuralButton>
            }
          />
        )}

        {/* Stats row */}
        {recent.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Avg Quality"
              value={avgQuality != null ? avgQuality.toFixed(1) : '—'}
              unit="/10"
              color={avgQuality != null && avgQuality >= 7 ? 'emerald' : avgQuality != null && avgQuality >= 5 ? 'amber' : 'orange'}
              trendDirection={avgQuality != null && prevQuality != null
                ? avgQuality > prevQuality ? 'up' : avgQuality < prevQuality ? 'down' : 'stable'
                : 'stable'}
            />
            <MetricCard
              label="Avg Duration"
              value={avgDuration != null ? avgDuration.toFixed(1) : '—'}
              unit="h"
              color={avgDuration != null && avgDuration >= 7.5 ? 'emerald' : avgDuration != null && avgDuration >= 6 ? 'amber' : 'orange'}
              trendDirection="stable"
            />
            <MetricCard
              label="Last Night"
              value={lastEntry ? lastEntry.quality.toFixed(0) : '—'}
              unit="/10"
              color={lastEntry && lastEntry.quality >= 7 ? 'cyan' : 'amber'}
              trendDirection={lastEntry && prevQuality != null
                ? lastEntry.quality > prevQuality ? 'up' : 'down'
                : 'stable'}
            />
            <MetricCard
              label="Nights Logged"
              value={sleepLog?.length ?? 0}
              color="cyan"
              trendDirection="stable"
            />
          </div>
        )}

        {/* Quality chart */}
        {chartData.length > 0 && (
          <SurfaceCard className="p-4">
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">
                Sleep Quality — Last 7 Nights
              </p>
            </div>
            <BarChart
              data={chartData}
              orientation="vertical"
              height={160}
              color="cyan"
              showValues
              animate
            />
          </SurfaceCard>
        )}

        {/* Recent entries */}
        {recent.length > 0 && (
          <SurfaceCard className="p-4">
            <PanelLabel label="Recent Entries" metadata="last 14 nights" />
            <div className="space-y-2 mt-2">
              {recent.slice(0, 7).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Moon className="w-3.5 h-3.5 text-cyan-400/60 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white/80">{entry.date}</span>
                        {entry.tags?.map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-white/5 border border-white/10 text-white/40">
                            {t.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                      {entry.notes && (
                        <p className="text-[10px] text-white/40 truncate mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className={cn('text-xs font-black tabular-nums', durationColor(entry.durationHours))}>
                        {entry.durationHours.toFixed(1)}h
                      </div>
                      <div className="text-[9px] text-white/40 uppercase">duration</div>
                    </div>
                    <div className="text-right">
                      <div className={cn('text-sm font-black tabular-nums', qualityColor(entry.quality))}>
                        {entry.quality}<span className="text-[9px] text-white/40">/10</span>
                      </div>
                      <div className={cn('text-[9px] uppercase tracking-wider font-black', qualityColor(entry.quality))}>
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

      {/* Log Sleep Modal */}
      <NeuralModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Log Sleep"
        subtitle="Track your recovery"
        icon={Moon}
        themeColor="cyan"
        maxWidth="lg"
      >
        <div className="space-y-5">
          {/* Date */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>

          {/* Bedtime / Wake */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Bedtime</label>
              <input
                type="time"
                value={bedtime}
                onChange={e => setBedtime(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Wake Time</label>
              <input
                type="time"
                value={wakeTime}
                onChange={e => setWakeTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-all"
              />
            </div>
          </div>

          {/* Duration display */}
          {durationHours != null && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/10">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-cyan-300 font-black">{durationHours.toFixed(1)}h</span>
              <span className="text-xs text-white/40">total sleep</span>
            </div>
          )}

          {/* Quality slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Sleep Quality</label>
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
              className="w-full accent-cyan-400"
            />
          </div>

          {/* Optional advanced fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Deep Sleep %</label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="—"
                value={deepSleepPct}
                onChange={e => setDeepSleepPct(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 transition-all tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">REM %</label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="—"
                value={remSleepPct}
                onChange={e => setRemSleepPct(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 transition-all tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Awakenings</label>
              <input
                type="number"
                min={0}
                placeholder="—"
                value={awakenings}
                onChange={e => setAwakenings(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 transition-all tabular-nums"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Factors (optional)</label>
            <div className="flex flex-wrap gap-2">
              {SLEEP_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all',
                    selectedTags.includes(tag)
                      ? 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/60'
                  )}
                >
                  {tag.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Dreams, disturbances, how you feel on waking..."
              rows={2}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 transition-all resize-none"
            />
          </div>

          {formError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <NeuralButton variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </NeuralButton>
            <NeuralButton onClick={handleSave} disabled={!onAnalyze}>
              <Moon className="w-4 h-4 mr-2" />
              Save & Analyze
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </>
  );
}
