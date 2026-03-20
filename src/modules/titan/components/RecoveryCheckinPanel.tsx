import React, { useState } from 'react';
import { HeartPulse, Moon, Activity, Brain, MessageSquare } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

interface RecoveryCheckinPanelProps {
  onSubmit: (payload: {
    pain: number;
    fatigue: number;
    sleepQuality: number;
    mood: number;
    notes?: string;
  }) => void;
  onSkip: () => void;
  isNudge?: boolean;
  allowSkip?: boolean;
}

function clamp(value: number, min = 0, max = 10): number {
  return Math.max(min, Math.min(max, value));
}

export function RecoveryCheckinPanel({
  onSubmit,
  onSkip,
  isNudge = false,
  allowSkip = true
}: RecoveryCheckinPanelProps) {
  const [pain, setPain] = useState(3);
  const [fatigue, setFatigue] = useState(4);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [mood, setMood] = useState(3);
  const [notes, setNotes] = useState('');

  return (
    <SurfaceCard className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <HeartPulse className="w-4 h-4 text-orange-400" />
        <h3 className="text-[13px] uppercase tracking-wider text-white/80 font-black">
          Daily Recovery Check-in
        </h3>
        {isNudge && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-300/70">
            Nudge
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/40">Pain</label>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-white/40" />
            <NeuralInput
              type="number"
              min={0}
              max={10}
              value={pain}
              onChange={(e) => setPain(clamp(Number(e.target.value), 0, 10))}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/40">Fatigue</label>
          <div className="flex items-center gap-2">
            <HeartPulse className="w-3.5 h-3.5 text-white/40" />
            <NeuralInput
              type="number"
              min={0}
              max={10}
              value={fatigue}
              onChange={(e) => setFatigue(clamp(Number(e.target.value), 0, 10))}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/40">Sleep</label>
          <div className="flex items-center gap-2">
            <Moon className="w-3.5 h-3.5 text-white/40" />
            <NeuralInput
              type="number"
              min={1}
              max={5}
              value={sleepQuality}
              onChange={(e) => setSleepQuality(clamp(Number(e.target.value), 1, 5))}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-white/40">Mood</label>
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-white/40" />
            <NeuralInput
              type="number"
              min={1}
              max={5}
              value={mood}
              onChange={(e) => setMood(clamp(Number(e.target.value), 1, 5))}
              className="h-9 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-wider text-white/40 flex items-center gap-2 mb-1">
          <MessageSquare className="w-3.5 h-3.5" /> Notes
        </label>
        <NeuralInput
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes on how you feel."
          className="h-10 text-xs"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <NeuralButton
          variant="primary"
          size="sm"
          onClick={() => onSubmit({ pain, fatigue, sleepQuality, mood, notes: notes.trim() || undefined })}
        >
          Save Check-in
        </NeuralButton>
        {allowSkip && (
          <NeuralButton variant="ghost" size="sm" onClick={onSkip}>
            Skip Today
          </NeuralButton>
        )}
      </div>
    </SurfaceCard>
  );
}
