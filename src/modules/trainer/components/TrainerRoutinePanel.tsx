import React from 'react';
import { Routine, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday } from '../utils';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';

interface TrainerRoutinePanelProps {
  routines: Routine[];
}

const WEEKDAY_ORDER: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function TrainerRoutinePanel({ routines }: TrainerRoutinePanelProps) {
  const today = getTodayWeekday();
  
  const sorted = [...(routines || [])].sort((a, b) => {
    const aIndex = WEEKDAY_ORDER.indexOf(a.weekday || 'monday');
    const bIndex = WEEKDAY_ORDER.indexOf(b.weekday || 'monday');
    return aIndex - bIndex;
  });

  const todayRoutine = sorted.find(r => r.weekday === today);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6 bg-black/40 border-b border-white/5 backdrop-blur-xl">
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Weekly Plan</span>
          <span className="text-[9px] font-mono uppercase text-white/40">{sorted.length} days</span>
        </div>
        {sorted.length === 0 ? (
          <EmptyState
            size="sm"
            title="No routine on file"
            description="Ask Titan to generate a weekly plan."
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="space-y-2">
            {sorted.map((routine) => (
              <div
                key={`${routine.weekday}-${routine.id}`}
                className={cn(
                  'flex items-center justify-between text-[10px]',
                  routine.weekday === today ? 'text-orange-300 font-bold' : 'text-white/60'
                )}
              >
                <span className="uppercase tracking-wider">{routine.weekday}</span>
                <span className="text-white/50">{routine.exercises.length} exercises</span>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Today&apos;s Protocol</span>
          <span className="text-[9px] font-mono uppercase text-white/40 italic">{today}</span>
        </div>
        {!todayRoutine ? (
          <EmptyState
            size="sm"
            title="No protocol scheduled"
            description="Titan can generate a recovery or strength session."
            className="bg-transparent border-white/10"
          />
        ) : (
          <div className="space-y-2">
            {todayRoutine.exercises.map((ex, idx) => (
              <div key={`${todayRoutine.id}-${idx}`} className="flex items-center justify-between text-[10px] text-white/60">
                <span className="font-medium">{ex.name}</span>
                <span className="text-white/50">
                  {ex.sets}x{ex.reps}
                </span>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
