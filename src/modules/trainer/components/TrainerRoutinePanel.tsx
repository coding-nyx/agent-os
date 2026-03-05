import React from 'react';
import { Routine, Weekday } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday } from '../utils';

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
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Weekly Routine</span>
          <span className="text-[9px] font-mono uppercase text-white/20">{sorted.length} days</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-xs text-white/40">No routine on file. Ask Titan to generate a weekly plan.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((routine) => (
              <div key={`${routine.weekday}-${routine.id}`} className={cn(
                "flex items-center justify-between text-[10px]",
                routine.weekday === today ? "text-orange-400 font-bold" : "text-white/60"
              )}>
                <span className="uppercase tracking-wider">{routine.weekday}</span>
                <span className="text-white/30">{routine.exercises.length} exercises</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Today's Protocol</span>
          <span className="text-[9px] font-mono uppercase text-white/20 italic">{today}</span>
        </div>
        {!todayRoutine ? (
          <p className="text-xs text-white/40">No routine scheduled for today.</p>
        ) : (
          <div className="space-y-2">
            {todayRoutine.exercises.map((ex, idx) => (
              <div key={`${todayRoutine.id}-${idx}`} className="flex items-center justify-between text-[10px] text-white/60">
                <span className="font-medium">{ex.name}</span>
                <span className="text-white/30">{ex.sets}x{ex.reps}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
