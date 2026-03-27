import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Calendar, CheckCircle2, ChevronRight, AlertCircle, Trash2 } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { cn } from '@/lib/utils';
import type { TitanProfile, PlannedWorkout, Routine } from '@/lib/types';

interface ActiveProgramDashboardProps {
  activeProgram: NonNullable<TitanProfile['activeProgram']>;
  plannedWorkouts: PlannedWorkout[];
  routines: Routine[];
  onClearProgram: () => void;
  onUpdateProgram: (updates: Partial<NonNullable<TitanProfile['activeProgram']>>) => void;
}

export function ActiveProgramDashboard({
  activeProgram,
  plannedWorkouts,
  routines,
  onClearProgram,
  onUpdateProgram,
}: ActiveProgramDashboardProps) {
  const startDate = new Date(activeProgram.startDate);
  const now = new Date();
  
  // Calculate progress
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / msPerWeek));
  const currentWeek = Math.min(weeksElapsed + 1, activeProgram.durationWeeks);
  const progressPercent = Math.min(100, (currentWeek / activeProgram.durationWeeks) * 100);

  const handleWeekChange = (val: string) => {
    const target = parseInt(val, 10);
    if (isNaN(target)) return;
    
    // Shift start date so current week becomes target
    // newStart = now - (target - 1) * msPerWeek
    // We subtract slightly less than a full week (e.g. 1 hour) to ensure we fall safely into the target week range
    // actually just matching the exact millisecond offset is fine
    const newStart = new Date(now.getTime() - ((target - 1) * msPerWeek));
    onUpdateProgram({ startDate: newStart.toISOString() });
  };

  // Calculate adherence for current week
  // (Filter planned workouts for this week)
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0,0,0,0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23,59,59,999);

  const thisWeekWorkouts = plannedWorkouts.filter(pw => {
    const d = new Date(pw.date);
    return d >= startOfWeek && d <= endOfWeek;
  });

  const completedCount = thisWeekWorkouts.filter(pw => pw.status === 'completed').length;
  const totalCount = thisWeekWorkouts.length;
  
  // Find current phase
  const currentPhase = activeProgram.phases?.find(p => currentWeek >= p.weeks[0] && currentWeek <= p.weeks[1]);

  return (
    <SurfaceCard className="p-4 sm:p-5 relative overflow-hidden group">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--module-accent)]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/20">
              Active Program
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-white/40 font-mono bg-white/[0.045] rounded px-1.5 py-0.5 border border-white/[0.09] hover:border-white/10 transition-colors">
              <span>Week</span>
              <select
                value={currentWeek}
                onChange={(e) => handleWeekChange(e.target.value)}
                className="bg-transparent border-none p-0 text-white font-bold w-auto cursor-pointer focus:ring-0 appearance-none text-center min-w-[1rem]"
              >
                {Array.from({ length: activeProgram.durationWeeks }).map((_, i) => (
                  <option key={i} value={i + 1} className="bg-black text-white">
                    {i + 1}
                  </option>
                ))}
              </select>
              <span>/ {activeProgram.durationWeeks}</span>
            </div>
            {currentPhase && (
               <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">
                 {currentPhase.name}
               </span>
            )}
          </div>
          
          <h3 className="text-xl font-bold text-white mb-2 truncate">
            {activeProgram.name}
          </h3>
          
          <div className="flex items-center gap-4 text-xs text-white/60">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
              <span>Started {startDate.toLocaleDateString()}</span>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{completedCount}/{totalCount} completed this week</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:self-center shrink-0">
           <NeuralButton 
             variant="ghost" 
             size="sm"
             onClick={onClearProgram}
             className="text-white/30 hover:text-red-400 hover:bg-red-500/10"
             title="End Program"
           >
             <Trash2 className="w-4 h-4" />
           </NeuralButton>
           <div className="hidden sm:block w-px h-8 bg-white/10 mx-1" />
           <div className="flex flex-col items-end min-w-[4rem]">
             <span className="text-2xl font-bold text-[var(--module-color-300)] tabular-nums">
               {Math.round(progressPercent)}%
             </span>
             <span className="text-[11px] uppercase tracking-wider text-white/30">Complete</span>
           </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-5 h-1.5 w-full bg-white/[0.045] rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-[var(--module-accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      
      {/* Week Grid (Simple visualizer) */}
      <div className="mt-4 pt-4 border-t border-white/[0.09] grid grid-cols-12 gap-1">
        {Array.from({ length: activeProgram.durationWeeks }).map((_, i) => {
           const weekNum = i + 1;
           const isPast = weekNum < currentWeek;
           const isCurrent = weekNum === currentWeek;
           
           return (
             <div 
               key={i} 
               className={cn(
                 "h-1.5 rounded-full transition-colors",
                 isPast ? "bg-emerald-500/40" : 
                 isCurrent ? "bg-[var(--module-accent)] animate-pulse" : 
                 "bg-white/10"
               )}
               title={`Week ${weekNum}`}
             />
           );
        })}
      </div>
    </SurfaceCard>
  );
}
