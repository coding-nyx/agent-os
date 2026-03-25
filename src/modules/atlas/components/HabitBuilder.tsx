/**
 * HabitBuilder Component
 * Comprehensive habit CRUD with templates, tracking, and energy impact analysis
 */

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Flame,
  TrendingUp,
  Zap,
  X,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasHabit } from '../services/atlas-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState } from '@/core/components/EmptyState';
import { HabitTracker } from './HabitTracker';

// Shared primitives
import { useDeleteConfirmation } from './shared/useDeleteConfirmation';
import { PortalledModal } from './shared/PortalledModal';
import { ItemActionButtons } from './shared/ItemActionButtons';
import { StatsGrid, type StatItem } from './shared/StatsGrid';
import { useFilteredSortedList } from './shared/useFilteredSortedList';

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
  // Physical
  { id: 'morning-walk', title: 'Morning Walk', frequency: 'daily' as const, energyCost: 2, category: 'physical', icon: '🚶', description: 'Start the day with 20–30 min of light movement.' },
  { id: 'hydration', title: 'Drink 8 Glasses', frequency: 'daily' as const, energyCost: 1, category: 'physical', icon: '💧', description: 'Track daily hydration to support focus and recovery.' },
  { id: 'stretching', title: 'Evening Stretch', frequency: 'daily' as const, energyCost: 2, category: 'physical', icon: '🧘', description: '10 min of stretching before bed to aid recovery.' },
  // Mental
  { id: 'meditation', title: 'Meditation', frequency: 'daily' as const, energyCost: 2, category: 'mental', icon: '🧠', description: '10 min of mindfulness or breathwork each morning.' },
  { id: 'journaling', title: 'Daily Journal', frequency: 'daily' as const, energyCost: 3, category: 'mental', icon: '📓', description: 'Write 3 sentences about today — what happened, what you felt, what you learned.' },
  { id: 'reading', title: 'Read 20 Pages', frequency: 'daily' as const, energyCost: 3, category: 'mental', icon: '📚', description: 'Read non-work material every day to expand perspective.' },
  // Professional
  { id: 'deep-work', title: 'Deep Work Block', frequency: 'weekdays' as const, energyCost: 8, category: 'professional', icon: '💻', description: '2+ hour focused work session with no interruptions.' },
  { id: 'inbox-zero', title: 'Inbox Zero', frequency: 'weekdays' as const, energyCost: 3, category: 'professional', icon: '📬', description: 'Process and archive all emails once per day.' },
  { id: 'weekly-review', title: 'Weekly Review', frequency: 'weekly' as const, energyCost: 4, category: 'professional', icon: '📊', description: 'Review goals, tasks, and habits every Sunday.' },
] as const;

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
  // ── State ──
  const [filter, setFilter] = useState<HabitFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingHabit, setEditingHabit] = useState<AtlasHabit | null>(null);

  // ── Shared Primitives ──
  const { promptDelete, ConfirmationDialog } = useDeleteConfirmation<AtlasHabit>(onDeleteHabit);

  const filteredHabits = useFilteredSortedList({
    items: habits,
    filter,
    filterFn: (habit, currentFilter) => {
      if (currentFilter === 'all') return true;
      return habit.status === currentFilter;
    }
  });

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

  const statItems: StatItem[] = [
    { label: 'Total Habits', value: stats.total },
    { label: 'Active', value: stats.active, colorClass: 'text-emerald-400', labelColorClass: 'text-emerald-400/60' },
    { label: 'Avg Streak', value: stats.avgStreak, icon: <Flame className="w-3 h-3" />, colorClass: 'text-orange-400', labelColorClass: 'text-orange-400/60' },
    { label: 'Best Streak', value: stats.longestStreak, icon: <TrendingUp className="w-3 h-3" />, colorClass: 'text-amber-400', labelColorClass: 'text-amber-400/60' },
    { label: 'Energy Impact', value: stats.totalEnergyImpact, icon: <Zap className="w-3 h-3" />, colorClass: 'text-[var(--module-color-400)]', labelColorClass: 'text-[var(--module-color-400)]/60' },
  ];

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

  const handleSelectTemplate = (template: typeof HABIT_TEMPLATES[number]) => {
    setFormData({
      ...formData,
      title: template.title,
      frequency: template.frequency,
      energyCost: template.energyCost,
      minimumViableVersion: template.description,
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
      <StatsGrid stats={statItems} />

      {/* ── Controls: Filter & Actions ── */}
      <div className="flex flex-col md:flex-row gap-3 justify-between">
        {/* Filter dropdown */}
        <div className="w-full md:w-48">
          <NeuralSelectMenu
            value={filter}
            onChange={(next) => setFilter(next as HabitFilter)}
            options={[
              { value: 'all', label: 'All Habits' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'archived', label: 'Archived' },
            ]}
            triggerClassName="w-full"
            ariaLabel="Filter habits"
          />
        </div>

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

            {/* Action buttons overlaid on each habit */}
            {filteredHabits.map((habit) => (
              <div key={habit.id} className="relative group -mt-4">
                <ItemActionButtons
                  onEdit={() => handleOpenForm(habit)}
                  onDelete={() => promptDelete(habit)}
                  itemTitle={habit.title}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Habit Form Modal ── */}
      <PortalledModal isOpen={showForm} onClose={handleCloseForm}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white/90">
            {editingHabit ? 'Edit Habit' : 'Create New Habit'}
          </h2>
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={handleCloseForm}
            className="p-2 h-9 w-9 min-w-0 hover:bg-white/10 text-white/40 hover:text-white/70"
          >
            <X className="w-5 h-5" />
          </NeuralButton>
        </div>

        <div className="space-y-4">
          {/* ── Template starter ── */}
          {!editingHabit && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="text-xs text-[var(--module-color-400)] hover:text-[var(--module-color-300)] flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                {showTemplates ? 'Hide templates' : 'Start from a template'}
              </button>
              {showTemplates && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {HABIT_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      className="text-left p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[var(--module-accent-border)] transition-all"
                    >
                      <div className="text-base mb-1">{tpl.icon}</div>
                      <div className="text-[11px] font-semibold text-white/80 leading-tight">{tpl.title}</div>
                      <div className="text-[10px] text-white/40 mt-0.5 capitalize">{tpl.category}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Title */}
          <NeuralInput
            label="Habit Name *"
            placeholder="e.g., Morning meditation, Daily exercise..."
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />

          {/* Frequency & Energy Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Frequency
              </label>
              <NeuralSelectMenu
                value={formData.frequency || 'daily'}
                onChange={(next) =>
                  setFormData({
                    ...formData,
                    frequency: next as AtlasHabit['frequency'],
                  })
                }
                options={FREQUENCY_OPTIONS}
                ariaLabel="Frequency"
              />
            </div>
            <NeuralInput
              label="Energy Cost (0-10)"
              type="number"
              min={0}
              max={10}
              icon={<Zap className="w-4 h-4" />}
              value={formData.energyCost || 3}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  energyCost: Math.max(0, Math.min(10, parseInt(e.target.value) || 3)),
                })
              }
            />
          </div>

          {/* Minimum Viable Version */}
          <div className="space-y-1">
            <NeuralInput
              label="Minimum Viable Version"
              placeholder="e.g., 5 minutes instead of 30, 1 page instead of a chapter..."
              value={formData.minimumViableVersion || ''}
              onChange={(e) =>
                setFormData({ ...formData, minimumViableVersion: e.target.value })
              }
            />
            <p className="text-[10px] text-white/30 ml-1 italic">
              The smallest version you can do on low-energy days
            </p>
          </div>

          {/* Target Streak */}
          <NeuralInput
            label="Target Streak (days)"
            type="number"
            min={1}
            icon={<Flame className="w-4 h-4" />}
            value={formData.targetStreak || 30}
            onChange={(e) =>
              setFormData({
                ...formData,
                targetStreak: Math.max(1, parseInt(e.target.value) || 30),
              })
            }
          />

          {/* Status (only when editing) */}
          {editingHabit && (
            <div className="space-y-2">
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                Status
              </label>
              <NeuralSelectMenu
                value={formData.status || 'active'}
                onChange={(next) =>
                  setFormData({
                    ...formData,
                    status: next as AtlasHabit['status'],
                  })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'archived', label: 'Archived' },
                ]}
                ariaLabel="Status"
              />
            </div>
          )}

          {/* Energy Impact Info */}
          <div className="p-4 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]">
            <h4 className="text-xs font-bold text-[var(--module-color-400)] mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Energy Impact Analysis
            </h4>
            <p className="text-xs text-[var(--module-color-300)]/70 leading-relaxed">
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
      </PortalledModal>

      <ConfirmationDialog />
    </div>
  );
}
