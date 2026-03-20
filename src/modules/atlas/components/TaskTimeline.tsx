import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, ChevronUp, Inbox, Clock, CalendarClock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { NeuralButton } from '@/core/components/NeuralButton';
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
const HOUR_HEIGHT_PX = 48;
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
  const [isCollapsed, setIsCollapsed] = useState(true);

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

  // Smart hour filtering: show hours with tasks + ±1 hour padding around current time
  const visibleHours = useMemo(() => {
    const now = new Date();
    const currentH = now.getHours();
    const hoursWithTasks = new Set<number>();

    for (const h of scheduledByHour.keys()) {
      hoursWithTasks.add(h);
    }

    // Always include current hour ±1
    const minHour = Math.max(TIMELINE_START_HOUR, currentH - 1);
    const maxHour = Math.min(TIMELINE_END_HOUR - 1, currentH + 1);
    for (let h = minHour; h <= maxHour; h++) {
      hoursWithTasks.add(h);
    }

    // Add ±1 padding around hours with tasks
    const padded = new Set<number>();
    for (const h of hoursWithTasks) {
      if (h - 1 >= TIMELINE_START_HOUR) padded.add(h - 1);
      padded.add(h);
      if (h + 1 < TIMELINE_END_HOUR) padded.add(h + 1);
    }

    return Array.from(padded).sort((a, b) => a - b);
  }, [scheduledByHour]);

  // Find tasks that are NOT in the schedule → backlog
  const scheduledIds = useMemo(
    () => new Set(scheduledTasks.map((st) => st.id)),
    [scheduledTasks]
  );
  const backlogTasks = useMemo(
    () => tasks.filter((t) => !scheduledIds.has(t.id) && t.status !== 'done'),
    [tasks, scheduledIds]
  );

  // Current-time indicator position
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isWithinRange =
    currentHour >= TIMELINE_START_HOUR && currentHour <= TIMELINE_END_HOUR;

  // For expanded view, compute position relative to visible hours
  const currentTimePercent = useMemo(() => {
    if (!isWithinRange) return -1;
    const visibleStart = visibleHours[0] ?? TIMELINE_START_HOUR;
    const visibleEnd = (visibleHours[visibleHours.length - 1] ?? TIMELINE_END_HOUR - 1) + 1;
    const visibleRange = visibleEnd - visibleStart;
    if (visibleRange <= 0) return -1;
    return ((currentHour - visibleStart) / visibleRange) * 100;
  }, [currentHour, isWithinRange, visibleHours]);

  // For collapsed summary bar
  const dayProgressPercent = isWithinRange
    ? ((currentHour - TIMELINE_START_HOUR) / TOTAL_SLOTS) * 100
    : currentHour < TIMELINE_START_HOUR ? 0 : 100;

  const totalScheduled = scheduledTasks.length;
  const avgEnergy = energyWave.length > 0
    ? energyWave.reduce((s, p) => s + (p.energy ?? 0), 0) / energyWave.length
    : 0;

  const handleToggleExpand = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
    onExpand(taskId);
  };

  const findFullTask = (st: ScheduledTask): AtlasTask | undefined =>
    tasks.find((t) => t.id === st.id);

  return (
    <section className="space-y-3" aria-label="Task timeline">
      {/* Collapsed summary */}
      <AnimatePresence mode="wait">
        {isCollapsed ? (
          <motion.div
            key="collapsed"
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }}
          >
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-4 hover:bg-white/[0.04] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
              aria-label="Expand daily timeline"
            >
              {/* Top row: time + stats */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-[var(--module-color-400)]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                    {formatHour(TIMELINE_START_HOUR)} – {formatHour(TIMELINE_END_HOUR)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {totalScheduled > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--module-color-400)] tabular-nums">
                      <Clock className="w-3 h-3" />
                      {totalScheduled} scheduled
                    </span>
                  )}
                  {avgEnergy > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400/70 tabular-nums">
                      <Zap className="w-3 h-3" />
                      {avgEnergy.toFixed(1)}
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-white/30" />
                </div>
              </div>

              {/* Day progress bar */}
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--module-accent)] transition-all duration-1000"
                  style={{ width: `${Math.max(1, Math.min(100, dayProgressPercent))}%` }}
                />
              </div>

              {/* Mini energy ribbon (horizontal) */}
              {energyWave.length > 0 && (
                <div className="flex gap-px mt-2 h-1 rounded-full overflow-hidden" aria-hidden="true">
                  {energyWave.slice(0, 10).map((p, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-full"
                      style={{ backgroundColor: `rgba(52, 211, 153, ${Math.max(0.08, (p.energy ?? 0) / 10)})` }}
                    />
                  ))}
                </div>
              )}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
          >
            {/* Collapse button */}
            <div className="flex justify-end mb-2">
              <NeuralButton
                onClick={() => setIsCollapsed(true)}
                variant="ghost"
                size="sm"
                themeColor="module"
                className="text-[10px] font-bold uppercase tracking-wider gap-1"
                aria-label="Collapse timeline"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Collapse
              </NeuralButton>
            </div>

            {/* Timeline container */}
            <div
              className="relative"
              style={{ minHeight: `${visibleHours.length * HOUR_HEIGHT_PX}px` }}
            >
              {/* Energy ribbon — vertical bar showing energy levels */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 rounded-full overflow-hidden"
                aria-hidden="true"
              >
                {visibleHours.map((hour) => {
                  const slotIndex = hour - TIMELINE_START_HOUR;
                  const energy = getEnergyAtSlot(energyWave, slotIndex);
                  const opacity = Math.max(0.12, energy / 10);
                  return (
                    <div
                      key={hour}
                      className="w-full"
                      style={{
                        height: `${100 / visibleHours.length}%`,
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

              {/* Hour slots — only visible hours */}
              {visibleHours.map((hour) => {
                const slotIndex = hour - TIMELINE_START_HOUR;
                const slotTasks = scheduledByHour.get(hour) || [];
                const energy = getEnergyAtSlot(energyWave, slotIndex);

                return (
                  <div
                    key={hour}
                    className="relative flex gap-4 border-t border-white/5"
                    style={{ minHeight: `${HOUR_HEIGHT_PX}px` }}
                  >
                    {/* Time label */}
                    <div className="w-14 pt-1.5 pr-2 text-right shrink-0">
                      <span className="text-[10px] font-bold text-white/25 tabular-nums uppercase">
                        {formatHour(hour)}
                      </span>
                      <div
                        className="mt-0.5 ml-auto w-6 h-1 rounded-full overflow-hidden bg-white/5"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-emerald-400/50"
                          style={{ width: `${(energy / 10) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Task cards in this slot */}
                    <div className="flex-1 py-1.5 space-y-1.5">
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

                        return (
                          <div
                            key={st.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white/70 font-medium truncate">
                                {st.title}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-bold tabular-nums shrink-0">
                                ⚡ {st.energyCost}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/30">
                              <span>{st.duration}min</span>
                              <span>·</span>
                              <span className="capitalize">{st.category}</span>
                            </div>
                            {st.blockedBy && (
                              <p className="mt-1 text-[10px] text-amber-300/60">
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backlog section (collapsed by default) */}
      {backlogTasks.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <NeuralButton
            onClick={() => setShowBacklog((prev) => !prev)}
            aria-expanded={showBacklog}
            variant="ghost"
            className="w-full !justify-start gap-2 text-xs font-bold uppercase tracking-wider text-white/40 hover:text-white/60 !h-auto py-3 px-2"
          >
            {showBacklog ? (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            )}
            <Inbox className="w-4 h-4" aria-hidden="true" />
            <span>Backlog ({backlogTasks.length})</span>
          </NeuralButton>

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
