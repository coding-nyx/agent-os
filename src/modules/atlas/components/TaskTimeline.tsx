import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { TaskCard } from './TaskCard';
import type {
  AtlasTask,
  ScheduledTask,
  EnergyWavePoint,
} from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// TaskTimeline — Vertical task timeline aligned to energy ribbon time axis
// ---------------------------------------------------------------------------

interface TaskTimelineProps {
  tasks: AtlasTask[];
  scheduledTasks: ScheduledTask[];
  energyWave: EnergyWavePoint[];
  onComplete: (taskId: string) => void;
  onExpand: (taskId: string) => void;
}

const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const HOUR_HEIGHT_PX = 80;
const TOTAL_SLOTS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

function getHourFromISO(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${suffix}`;
}

/**
 * Sample the energy wave to determine energy at a given hour slot.
 * Maps the discrete energy wave points evenly across the timeline range.
 */
function getEnergyAtSlot(
  energyWave: EnergyWavePoint[],
  slotIndex: number
): number {
  if (energyWave.length === 0) return 5;
  const mappedIndex = Math.min(
    Math.floor((slotIndex / TOTAL_SLOTS) * energyWave.length),
    energyWave.length - 1
  );
  return energyWave[mappedIndex]?.energy ?? 5;
}

export function TaskTimeline({
  tasks,
  scheduledTasks,
  energyWave,
  onComplete,
  onExpand,
}: TaskTimelineProps) {
  const reducedMotion = useReducedMotion();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showBacklog, setShowBacklog] = useState(false);

  // Generate hour slots
  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = TIMELINE_START_HOUR; h < TIMELINE_END_HOUR; h++) {
      result.push(h);
    }
    return result;
  }, []);

  // Bucket scheduled tasks by their hour
  const scheduledByHour = useMemo(() => {
    const map = new Map<number, ScheduledTask[]>();
    for (const st of scheduledTasks) {
      const hour = Math.floor(getHourFromISO(st.scheduledAt));
      const clamped = Math.max(
        TIMELINE_START_HOUR,
        Math.min(TIMELINE_END_HOUR - 1, hour)
      );
      const bucket = map.get(clamped) || [];
      bucket.push(st);
      map.set(clamped, bucket);
    }
    return map;
  }, [scheduledTasks]);

  // Find tasks that are NOT in the schedule → backlog
  const scheduledIds = useMemo(
    () => new Set(scheduledTasks.map((st) => st.id)),
    [scheduledTasks]
  );
  const backlogTasks = useMemo(
    () => tasks.filter((t) => !scheduledIds.has(t.id) && t.status !== 'done'),
    [tasks, scheduledIds]
  );

  // Current-time indicator position (percentage)
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isWithinRange =
    currentHour >= TIMELINE_START_HOUR && currentHour <= TIMELINE_END_HOUR;
  const currentTimePercent = isWithinRange
    ? ((currentHour - TIMELINE_START_HOUR) / TOTAL_SLOTS) * 100
    : -1;

  const handleToggleExpand = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    onExpand(taskId);
  };

  // Resolve the full AtlasTask record for a ScheduledTask (by shared id)
  const findFullTask = (st: ScheduledTask): AtlasTask | undefined =>
    tasks.find((t) => t.id === st.id);

  return (
    <section className="space-y-4" aria-label="Task timeline">
      {/* Timeline container */}
      <div
        className="relative"
        style={{ minHeight: `${hours.length * HOUR_HEIGHT_PX}px` }}
      >
        {/* Energy ribbon — vertical bar showing energy levels */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 rounded-full overflow-hidden"
          aria-hidden="true"
        >
          {hours.map((hour, index) => {
            const energy = getEnergyAtSlot(energyWave, index);
            const opacity = Math.max(0.12, energy / 10);
            return (
              <div
                key={hour}
                className="w-full"
                style={{
                  height: `${100 / hours.length}%`,
                  backgroundColor: `rgba(52, 211, 153, ${opacity})`,
                }}
              />
            );
          })}
        </div>

        {/* Current-time indicator line */}
        {currentTimePercent >= 0 && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
            className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${currentTimePercent}%` }}
            role="status"
            aria-label={`Current time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-rose-400 border-2 border-zinc-900 -ml-0.5 shrink-0" />
            <div className="flex-1 h-px bg-rose-400/40" />
            <span className="text-[9px] font-bold text-rose-400 tabular-nums pl-2 shrink-0">
              {now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </motion.div>
        )}

        {/* Hour slots */}
        {hours.map((hour, index) => {
          const slotTasks = scheduledByHour.get(hour) || [];
          const energy = getEnergyAtSlot(energyWave, index);

          return (
            <div
              key={hour}
              className="relative flex gap-4 border-t border-white/5"
              style={{ minHeight: `${HOUR_HEIGHT_PX}px` }}
            >
              {/* Time label */}
              <div className="w-14 pt-2 pr-2 text-right shrink-0">
                <span className="text-[10px] font-bold text-white/25 tabular-nums uppercase">
                  {formatHour(hour)}
                </span>
                {/* Micro energy indicator next to time */}
                <div
                  className="mt-1 ml-auto w-6 h-1 rounded-full overflow-hidden bg-white/5"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-emerald-400/50"
                    style={{ width: `${(energy / 10) * 100}%` }}
                  />
                </div>
              </div>

              {/* Task cards in this slot */}
              <div className="flex-1 py-2 space-y-2">
                {slotTasks.map((st) => {
                  const fullTask = findFullTask(st);

                  if (fullTask) {
                    return (
                      <TaskCard
                        key={st.id}
                        task={fullTask}
                        onComplete={onComplete}
                        isExpanded={expandedTaskId === st.id}
                        onToggleExpand={() => handleToggleExpand(st.id)}
                        allTasks={tasks}
                      />
                    );
                  }

                  // Fallback: scheduled task without a full AtlasTask record
                  return (
                    <div
                      key={st.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white/70 font-medium truncate">
                          {st.title}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-bold tabular-nums shrink-0">
                          ⚡ {st.energyCost}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-white/30">
                        <span>{st.duration}min</span>
                        <span>·</span>
                        <span className="capitalize">{st.category}</span>
                      </div>
                      {st.blockedBy && (
                        <p className="mt-1.5 text-[10px] text-amber-300/60">
                          Blocked: {st.blockedBy.replace(/_/g, ' ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Backlog section (collapsed by default) */}
      {backlogTasks.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <button
            onClick={() => setShowBacklog((prev) => !prev)}
            aria-expanded={showBacklog}
            className={cn(
              'flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors w-full',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded-lg p-1'
            )}
          >
            {showBacklog ? (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            )}
            <Inbox className="w-4 h-4" aria-hidden="true" />
            <span>Backlog ({backlogTasks.length})</span>
          </button>

          <AnimatePresence>
            {showBacklog && (
              <motion.div
                initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
                }
                className="overflow-hidden"
              >
                <div className="space-y-2 pt-3">
                  {backlogTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onComplete={onComplete}
                      isExpanded={expandedTaskId === task.id}
                      onToggleExpand={() => handleToggleExpand(task.id)}
                      allTasks={tasks}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
