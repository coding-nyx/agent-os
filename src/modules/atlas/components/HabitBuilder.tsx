/**
 * HabitBuilder Component
 * Comprehensive habit CRUD with templates, tracking, and energy impact analysis
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Flame,
  TrendingUp,
  Zap,
  X,
  Edit2,
  Trash2,
  Sparkles,
  Calendar,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasHabit } from '../services/atlas-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { HabitTracker } from './HabitTracker';

interface HabitBuilderProps {
  habits: AtlasHabit[];
  onCreateHabit: (habit: Partial<AtlasHabit>) => void;
  onUpdateHabit: (habitId: string, updates: Partial<AtlasHabit>) => void;
  onDeleteHabit: (habitId: string) => void;
  onCompleteHabit: (habitId: string) => void;
  onPauseHabit: (habitId: string) => void;
}

type HabitFilter = 'all' | 'active' | 'paused' | 'archived';

// Habit templates for common patterns
const HABIT_TEMPLATES = [
  {
    id: 'exercise',
    title: 'Daily Exercise',
    frequency: 'daily' as const,
    energyCost: 4,
    minimumViableVersion: '10 minutes of movement',
    targetStreak: 30,
  },
  {
    id: 'meditation',
    title: 'Meditation',
    frequency: 'daily' as const,
    energyCost: 2,
    minimumViableVersion: '5 minutes of mindfulness',
    targetStreak: 21,
  },
  {
    id: 'journaling',
    title: 'Journaling',
    frequency: 'daily' as const,
    energyCost: 3,
    minimumViableVersion: 'Write 3 sentences',
    targetStreak: 30,
  },
  {
    id: 'reading',
    title: 'Reading',
    frequency: 'daily' as const,
    energyCost: 3,
    minimumViableVersion: 'Read 10 pages',
    targetStreak: 30,
  },
  {
    id: 'water',
    title: 'Drink Water',
    frequency: 'daily' as const,
    energyCost: 1,
    minimumViableVersion: '8 glasses throughout the day',
    targetStreak: 60,
  },
  {
    id: 'deep_work',
    title: 'Deep Work Session',
    frequency: 'weekdays' as const,
    energyCost: 7,
    minimumViableVersion: '1 hour of focused work',
    targetStreak: 20,
  },
  {
    id: 'learning',
    title: 'Learn Something New',
    frequency: 'daily' as const,
    energyCost: 4,
    minimumViableVersion: '30 minutes of learning',
    targetStreak: 30,
  },
  {
    id: 'sleep',
    title: 'Consistent Sleep Schedule',
    frequency: 'daily' as const,
    energyCost: 2,
    minimumViableVersion: 'Sleep by 11 PM',
    targetStreak: 14,
  },
];

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays Only' },
  { value: 'weekends', label: 'Weekends Only' },
  { value: 'weekly', label: 'Weekly' },
];

export function HabitBuilder({
  habits,
  onCreateHabit,
  onUpdateHabit,
  onDeleteHabit,
  onCompleteHabit,
  onPauseHabit,
}: HabitBuilderProps) {
  const reducedMotion = useReducedMotion();

  // ── State ──
  const [filter, setFilter] = useState<HabitFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingHabit, setEditingHabit] = useState<AtlasHabit | null>(null);

  // ── Form state ──
  const [formData, setFormData] = useState<Partial<AtlasHabit>>({
    title: '',
    frequency: 'daily',
    energyCost: 3,
    minimumViableVersion: '',
    targetStreak: 30,
    currentStreak: 0,
    bestStreak: 0,
    status: 'active',
  });

  // ── Filtered habits ──
  const filteredHabits = useMemo(() => {
    if (filter === 'all') return habits;
    return habits.filter((h) => h.status === filter);
  }, [habits, filter]);

  // ── Habit statistics ──
  const stats = useMemo(() => {
    const total = habits.length;
    const active = habits.filter((h) => h.status === 'active').length;
    const avgStreak =
      habits.length > 0
        ? Math.round(
            habits.reduce((sum, h) => sum + h.currentStreak, 0) / habits.length
          )
        : 0;
    const longestStreak = habits.length > 0
      ? Math.max(...habits.map((h) => h.bestStreak))
      : 0;
    const totalEnergyImpact = habits
      .filter((h) => h.status === 'active')
      .reduce((sum, h) => sum + h.energyCost, 0);

    return { total, active, avgStreak, longestStreak, totalEnergyImpact };
  }, [habits]);

  // ── Handlers ──
  const handleOpenForm = (habit?: AtlasHabit) => {
    if (habit) {
      setEditingHabit(habit);
      setFormData(habit);
    } else {
      setEditingHabit(null);
      setFormData({
        title: '',
        frequency: 'daily',
        energyCost: 3,
        minimumViableVersion: '',
        targetStreak: 30,
        currentStreak: 0,
        bestStreak: 0,
        status: 'active',
      });
    }
    setShowForm(true);
    setShowTemplates(false);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingHabit(null);
    setShowTemplates(false);
    setFormData({
      title: '',
      frequency: 'daily',
      energyCost: 3,
      minimumViableVersion: '',
      targetStreak: 30,
      currentStreak: 0,
      bestStreak: 0,
      status: 'active',
    });
  };

  const handleSelectTemplate = (template: typeof HABIT_TEMPLATES[0]) => {
    setFormData({
      ...formData,
      title: template.title,
      frequency: template.frequency,
      energyCost: template.energyCost,
      minimumViableVersion: template.minimumViableVersion,
      targetStreak: template.targetStreak,
    });
    setShowTemplates(false);
  };

  const handleSubmitForm = () => {
    if (!formData.title?.trim()) return;

    if (editingHabit) {
      onUpdateHabit(editingHabit.id, formData);
    } else {
      onCreateHabit({
        ...formData,
        id: `habit_${crypto.randomUUID()}`,
        currentStreak: 0,
        bestStreak: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    handleCloseForm();
  };

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header with stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
            Total Habits
          </div>
          <div className="text-2xl font-black text-white/90 tabular-nums">
            {stats.total}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">
            Active
          </div>
          <div className="text-2xl font-black text-emerald-400 tabular-nums">
            {stats.active}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-orange-400/60 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Flame className="w-3 h-3" />
            Avg Streak
          </div>
          <div className="text-2xl font-black text-orange-400 tabular-nums">
            {stats.avgStreak}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Best Streak
          </div>
          <div className="text-2xl font-black text-amber-400 tabular-nums">
            {stats.longestStreak}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-sky-400/60 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Energy Impact
          </div>
          <div className="text-2xl font-black text-sky-400 tabular-nums">
            {stats.totalEnergyImpact}
          </div>
        </SurfaceCard>
      </div>

      {/* ── Controls: Filter & Actions ── */}
      <div className="flex flex-col md:flex-row gap-3 justify-between">
        {/* Filter dropdown */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as HabitFilter)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 cursor-pointer"
        >
          <option value="all">All Habits</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="archived">Archived</option>
        </select>

        {/* Action buttons */}
        <div className="flex gap-2">
          <NeuralButton
            onClick={() => {
              setShowTemplates(true);
              setShowForm(true);
            }}
            size="sm"
            variant="ghost"
            className="border border-white/10"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Templates
          </NeuralButton>
          <NeuralButton onClick={() => handleOpenForm()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Habit
          </NeuralButton>
        </div>
      </div>

      {/* ── Habit List ── */}
      <div className="space-y-3">
        {filteredHabits.length === 0 ? (
          <EmptyState
            title="No habits yet"
            description="Create your first habit to start building streaks"
            icon={Flame}
            size="lg"
          />
        ) : (
          <div className="space-y-4">
            {/* Use existing HabitTracker component */}
            <HabitTracker
              habits={filteredHabits}
              onComplete={onCompleteHabit}
              onPause={onPauseHabit}
            />

            {/* Edit/Delete actions overlaid on each habit */}
            {filteredHabits.map((habit) => (
              <div key={habit.id} className="relative group -mt-4">
                {/* Invisible overlay for hover detection */}
                <div className="absolute inset-0 pointer-events-none" />
                {/* Quick action buttons on hover */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10 pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenForm(habit);
                    }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 transition-colors"
                    aria-label={`Edit ${habit.title}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete habit "${habit.title}"?`)) {
                        onDeleteHabit(habit.id);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400 transition-colors"
                    aria-label={`Delete ${habit.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Habit Form Modal ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseForm}
          >
            <motion.div
              initial={reducedMotion ? false : { scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-white/90">
                  {editingHabit ? 'Edit Habit' : 'Create New Habit'}
                </h2>
                <button
                  onClick={handleCloseForm}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ── Templates section ── */}
              {showTemplates && !editingHabit && (
                <div className="mb-6 pb-6 border-b border-white/10">
                  <h3 className="text-sm font-bold text-white/70 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Habit Templates
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {HABIT_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        className="p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-left transition-colors"
                      >
                        <div className="text-sm font-semibold text-white/90 mb-1">
                          {template.title}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {template.frequency} • {template.energyCost} energy
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                    Habit Name *
                  </label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Morning meditation, Daily exercise..."
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </div>

                {/* Frequency & Energy Cost */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Frequency
                    </label>
                    <select
                      value={formData.frequency || 'daily'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          frequency: e.target.value as AtlasHabit['frequency'],
                        })
                      }
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    >
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Energy Cost (0-10)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={formData.energyCost || 3}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          energyCost: Math.max(0, Math.min(10, parseInt(e.target.value) || 3)),
                        })
                      }
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    />
                  </div>
                </div>

                {/* Minimum Viable Version */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                    Minimum Viable Version
                  </label>
                  <p className="text-[10px] text-white/30 mb-2 italic">
                    The smallest version you can do on low-energy days
                  </p>
                  <input
                    type="text"
                    value={formData.minimumViableVersion || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, minimumViableVersion: e.target.value })
                    }
                    placeholder="e.g., 5 minutes instead of 30, 1 page instead of a chapter..."
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </div>

                {/* Target Streak */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Flame className="w-3 h-3" />
                    Target Streak (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.targetStreak || 30}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        targetStreak: Math.max(1, parseInt(e.target.value) || 30),
                      })
                    }
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </div>

                {/* Status (only when editing) */}
                {editingHabit && (
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status || 'active'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as AtlasHabit['status'],
                        })
                      }
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                )}

                {/* Energy Impact Info */}
                <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <h4 className="text-xs font-bold text-sky-400 mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Energy Impact Analysis
                  </h4>
                  <p className="text-xs text-sky-300/70 leading-relaxed">
                    {formData.energyCost && formData.energyCost <= 3 && (
                      <>
                        <strong>Low energy habit.</strong> Easy to maintain even on low-energy
                        days. Great for building consistency.
                      </>
                    )}
                    {formData.energyCost && formData.energyCost >= 4 && formData.energyCost <= 6 && (
                      <>
                        <strong>Moderate energy habit.</strong> Best scheduled during your peak
                        productivity times. Have a lighter version ready for off days.
                      </>
                    )}
                    {formData.energyCost && formData.energyCost >= 7 && (
                      <>
                        <strong>High energy habit.</strong> Requires significant focus and
                        energy. Consider pairing with recovery windows or making frequency less
                        demanding.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-6 border-t border-white/10">
                <NeuralButton onClick={handleCloseForm} variant="ghost" className="w-full sm:w-auto">
                  Cancel
                </NeuralButton>
                <NeuralButton onClick={handleSubmitForm} disabled={!formData.title?.trim()} className="w-full sm:w-auto">
                  {editingHabit ? 'Update Habit' : 'Create Habit'}
                </NeuralButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
