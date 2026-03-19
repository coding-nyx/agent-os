/**
 * CardioLogger — Log and review cardiovascular conditioning sessions.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Activity, Plus, MessageSquare, Wind,
} from 'lucide-react';
import type { CardioSession, CardioSessionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';
import { MetricCard } from '@/core/components/viz/MetricCard';
import { getTodayIso } from '../utils';

// ---------------------------------------------------------------------------
// Cardio type metadata
// ---------------------------------------------------------------------------

const CARDIO_TYPES: { value: CardioSessionType; label: string; emoji: string }[] = [
  { value: 'run',        label: 'Run',        emoji: '🏃' },
  { value: 'bike',       label: 'Bike',       emoji: '🚴' },
  { value: 'swim',       label: 'Swim',       emoji: '🏊' },
  { value: 'row',        label: 'Row',        emoji: '🚣' },
  { value: 'hike',       label: 'Hike',       emoji: '🥾' },
  { value: 'elliptical', label: 'Elliptical', emoji: '🔄' },
  { value: 'jump_rope',  label: 'Jump Rope',  emoji: '🪢' },
  { value: 'other',      label: 'Other',      emoji: '⚡' },
];

export interface CardioLoggerProps {
  cardioLog: CardioSession[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (session: CardioSession) => Promise<void>;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function paceStr(distKm: number, durationMin: number): string {
  if (distKm <= 0 || durationMin <= 0) return '';
  const minPerKm = durationMin / distKm;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}/km`;
}

function rpeColor(rpe: number): string {
  if (rpe >= 9) return 'text-rose-400';
  if (rpe >= 7) return 'text-orange-400';
  if (rpe >= 5) return 'text-amber-400';
  return 'text-emerald-400';
}

function SessionRow({ session }: { session: CardioSession }) {
  const meta = CARDIO_TYPES.find(t => t.value === session.type);
  const pace = session.distanceKm ? paceStr(session.distanceKm, session.durationMinutes) : null;

  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-base leading-none">{meta?.emoji ?? '⚡'}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white/80">{meta?.label ?? session.type}</span>
            <span className="text-[10px] text-white/40">{session.date}</span>
          </div>
          {(session.notes || pace) && (
            <p className="text-[10px] text-white/30 truncate mt-0.5">
              {pace && <span className="mr-2">{pace}</span>}
              {session.notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {session.distanceKm != null && (
          <div className="text-right hidden sm:block">
            <div className="text-xs font-black text-orange-400 tabular-nums">{session.distanceKm} km</div>
            <div className="text-[9px] text-white/40">dist</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-xs font-black text-white/80 tabular-nums">
            {formatDuration(session.durationMinutes)}
          </div>
          <div className="text-[9px] text-white/40 uppercase">time</div>
        </div>
      </div>
    </div>
  );
}

export function CardioLogger({ cardioLog, onAnalyze, directWriteMode, onDirectSave }: CardioLoggerProps) {
  const [showModal, setShowModal] = useState(false);
  const [date, setDate] = useState(getTodayIso());
  const [type, setType] = useState<CardioSessionType>('run');
  const [durationHours, setDurationHours] = useState<string | number>('');
  const [durationMins, setDurationMins] = useState<string | number>('30');
  const [distance, setDistance] = useState<string | number>('');
  const [avgHR, setAvgHR] = useState<string | number>('');
  const [calories, setCalories] = useState<string | number>('');
  const [rpe, setRpe] = useState<number>(6);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const recent = useMemo(() => [...cardioLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7), [cardioLog]);

  const weeklyStats = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last7 = cardioLog.filter(s => new Date(s.date) >= sevenDaysAgo);
    return {
      sessions: last7.length,
      totalDuration: last7.reduce((sum, s) => sum + s.durationMinutes, 0),
      totalDistance: Math.round(last7.reduce((sum, s) => sum + (s.distanceKm || 0), 0) * 10) / 10,
    };
  }, [cardioLog]);

  const totalDurationMins = (parseInt(durationHours as string) || 0) * 60 + (parseInt(durationMins as string) || 0);

  const handleSave = useCallback(async () => {
    if (totalDurationMins <= 0) {
      setFormError('Duration must be greater than 0.');
      return;
    }
    setFormError(null);
    setSaving(true);

    const session: CardioSession = {
      id: crypto.randomUUID(),
      date,
      type,
      durationMinutes: totalDurationMins,
      distanceKm: distance ? parseFloat(distance as string) : undefined,
      avgHeartRate: avgHR ? parseInt(avgHR as string) : undefined,
      calories: calories ? parseInt(calories as string) : undefined,
      rpe,
      notes: notes.trim() || undefined,
      status: 'completed',
      recordedAt: new Date().toISOString(),
    };

    try {
      if (directWriteMode && onDirectSave) {
        await onDirectSave(session);
      } else if (onAnalyze) {
        const typeLabel = CARDIO_TYPES.find(t => t.value === type)?.label || type;
        const msg = `Log cardio session: ${typeLabel} for ${formatDuration(totalDurationMins)} on ${date}. ` +
          (distance ? `Distance: ${distance}km. ` : '') +
          (avgHR ? `Avg HR: ${avgHR}bpm. ` : '') +
          (calories ? `Calories: ${calories}. ` : '') +
          `RPE: ${rpe}/10. ` +
          (notes ? `Notes: ${notes}` : '');
        onAnalyze(msg);
      }
      setShowModal(false);
    } catch (err) {
      setFormError('Failed to save session.');
    } finally {
      setSaving(false);
    }
  }, [date, type, totalDurationMins, distance, avgHR, calories, rpe, notes, directWriteMode, onDirectSave, onAnalyze]);

  return (
    <>
      <div className="pb-5 sm:pb-6 space-y-4 sm:space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <PanelLabel label="Cardio & Conditioning" metadata={recent.length ? `${recent.length} recent sessions` : 'No sessions yet'} />
          <div className="flex items-center gap-2">
            {recent.length > 0 && onAnalyze && (
              <NeuralButton
                size="sm"
                variant="ghost"
                themeColor="orange"
                onClick={() => onAnalyze(
                  `Analyze my cardio performance from the last ${recent.length} sessions and provide insights on my aerobic fitness trend.`
                )}
              >
                <MessageSquare className="w-3 h-3 mr-1.5" />
                Analyze
              </NeuralButton>
            )}
            <NeuralButton size="sm" themeColor="orange" onClick={() => setShowModal(true)}>
              <Plus className="w-3 h-3 mr-1.5" />
              Log Session
            </NeuralButton>
          </div>
        </div>

        {!cardioLog?.length && (
          <EmptyState
            icon={Activity}
            title="No cardio sessions yet"
            description="Track your runs, rides, swims and more. Titan uses cardio data to balance your aerobic and anaerobic training load."
            action={
              <NeuralButton themeColor="orange" onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Log First Session
              </NeuralButton>
            }
          />
        )}

        {cardioLog?.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Sessions (7d)"
              value={weeklyStats.sessions}
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Duration (7d)"
              value={formatDuration(weeklyStats.totalDuration)}
              color="orange"
              trendDirection="stable"
            />
            <MetricCard
              label="Distance (7d)"
              value={weeklyStats.totalDistance > 0 ? weeklyStats.totalDistance : '—'}
              unit={weeklyStats.totalDistance > 0 ? 'km' : ''}
              color="orange"
              trendDirection="stable"
            />
          </div>
        )}

        {recent.length > 0 && (
          <SurfaceCard className="p-4">
            <PanelLabel label="Recent Sessions" metadata="last 7" />
            <div className="space-y-1.5 mt-2">
              {recent.map(s => (
                <SessionRow key={s.id} session={s} />
              ))}
            </div>
          </SurfaceCard>
        )}
      </div>

      <NeuralModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Log Cardio Session"
        subtitle="Track your conditioning work"
        icon={Activity}
        themeColor="orange"
        maxWidth="lg"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Activity Type</label>
            <div className="flex flex-wrap gap-2">
              {CARDIO_TYPES.map(ct => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setType(ct.value)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border',
                    type === ct.value
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                  )}
                >
                  <span>{ct.emoji}</span>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Duration</label>
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center bg-white/5 border border-white/10 rounded-xl focus-within:border-orange-500/50 transition-all px-4 py-2.5">
                <input
                  type="number"
                  min={0}
                  max={23}
                  placeholder="0"
                  value={durationHours}
                  onChange={e => setDurationHours(e.target.value)}
                  className="w-8 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-white/40 mx-1.5 font-bold">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  placeholder="00"
                  value={durationMins}
                  onChange={e => setDurationMins(e.target.value)}
                  className="w-8 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none text-left tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="ml-auto text-[10px] text-white/40 font-semibold tracking-wider">HH:MM</span>
              </div>
              {totalDurationMins > 0 && (
                <span className="text-sm font-black text-orange-400 shrink-0 min-w-[60px] text-right">{formatDuration(totalDurationMins)}</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Distance (km)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="—"
                value={distance}
                onChange={e => setDistance(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-all tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Avg HR (bpm)</label>
              <input
                type="number"
                min={40}
                max={220}
                placeholder="—"
                value={avgHR}
                onChange={e => setAvgHR(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-all tabular-nums"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Calories</label>
              <input
                type="number"
                min={0}
                placeholder="—"
                value={calories}
                onChange={e => setCalories(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 transition-all tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Effort (RPE)</label>
              <span className={cn('text-sm font-black tabular-nums', rpeColor(rpe))}>
                {rpe}/10
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={rpe}
              onChange={e => setRpe(Number(e.target.value))}
              className="w-full accent-orange-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Route, conditions, how it felt..."
              rows={2}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-all resize-none"
            />
          </div>

          {formError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <NeuralButton variant="ghost" themeColor="orange" onClick={() => setShowModal(false)}>
              Cancel
            </NeuralButton>
            <NeuralButton
              themeColor="orange"
              onClick={handleSave}
              disabled={saving || (!directWriteMode && !onAnalyze)}
            >
              <Activity className="w-4 h-4 mr-2" />
              {directWriteMode ? 'Save Session' : 'Save & Analyze'}
            </NeuralButton>
          </div>
        </div>
      </NeuralModal>
    </>
  );
}
