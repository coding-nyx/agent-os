/**
 * GoalTracker Component
 * Comprehensive goal CRUD with milestones, progress tracking, and dependencies
 */

import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Plus,
  Target,
  CheckCircle2,
  X,
  Calendar,
  ListTodo,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasGoal, AtlasMilestone, AtlasTask } from '../services/atlas-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { EmptyState } from '@/core/components/EmptyState';
import { GoalProgress } from './GoalProgress';

// Shared primitives
import { useDeleteConfirmation } from './shared/useDeleteConfirmation';
import { PortalledModal } from './shared/PortalledModal';
import { ItemActionButtons } from './shared/ItemActionButtons';
import { StatsGrid } from './shared/StatsGrid';
import { useFilteredSortedList } from './shared/useFilteredSortedList';

interface GoalTrackerProps {
  goals: AtlasGoal[];
  tasks: AtlasTask[];
  onCreateGoal: (goal: Partial<AtlasGoal>) => void;
  onUpdateGoal: (goalId: string, updates: Partial<AtlasGoal>) => void;
  onDeleteGoal: (goalId: string) => void;
  onUpdateGoalProgress: (goalId: string, milestoneId: string) => void;
}

type GoalFilter = 'all' | 'active' | 'paused' | 'completed' | 'abandoned';

export function GoalTracker({
  goals,
  tasks,
  onCreateGoal,
  onUpdateGoal,
  onDeleteGoal,
  onUpdateGoalProgress,
}: GoalTrackerProps) {
  // ── State ──
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<AtlasGoal | null>(null);

  const { promptDelete, ConfirmationDialog } = useDeleteConfirmation<AtlasGoal>(onDeleteGoal);

  const goalListRef = useRef<HTMLDivElement>(null);

  // ── Form state ──
  const [formData, setFormData] = useState<Partial<AtlasGoal>>({
    title: '',
    description: '',
    deadline: '',
    successCriteria: '',
    milestones: [],
    associatedTaskIds: [],
    status: 'active',
    progressPercent: 0,
  });

  const [newMilestone, setNewMilestone] = useState({ title: '', dueDate: '' });

  // ── Filtered goals ──
  const filteredGoals = useFilteredSortedList({
    items: goals,
    filter,
    filterFn: (goal, currentFilter) => currentFilter === 'all' || goal.status === currentFilter,
  });

  const goalVirtualizer = useVirtualizer({
    count: filteredGoals.length,
    getScrollElement: () => goalListRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  // ── Goal statistics ──
  const statsData = useMemo(() => {
    const total = goals.length;
    const active = goals.filter((g) => g.status === 'active').length;
    const completed = goals.filter((g) => g.status === 'completed').length;
    const avgProgress =
      goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + g.progressPercent, 0) / goals.length)
        : 0;

    return [
      { label: 'Total Goals', value: total },
      { 
        label: 'Active', 
        value: active, 
        colorClass: 'text-emerald-400', 
        labelColorClass: 'text-emerald-400/60' 
      },
      { 
        label: 'Completed', 
        value: completed, 
        colorClass: 'text-[var(--module-color-400)]', 
        labelColorClass: 'text-[var(--module-color-400)]/60' 
      },
      { 
        label: 'Avg Progress', 
        value: `${avgProgress}%`, 
        icon: <TrendingUp className="w-3 h-3" />,
        colorClass: 'text-orange-400', 
        labelColorClass: 'text-orange-400/60' 
      },
    ];
  }, [goals]);

  // ── Handlers ──
  const handleOpenForm = (goal?: AtlasGoal) => {
    if (goal) {
      setEditingGoal(goal);
      setFormData(goal);
    } else {
      setEditingGoal(null);
      setFormData({
        title: '',
        description: '',
        deadline: '',
        successCriteria: '',
        milestones: [],
        associatedTaskIds: [],
        status: 'active',
        progressPercent: 0,
      });
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGoal(null);
    setFormData({
      title: '',
      description: '',
      deadline: '',
      successCriteria: '',
      milestones: [],
      associatedTaskIds: [],
      status: 'active',
      progressPercent: 0,
    });
    setNewMilestone({ title: '', dueDate: '' });
  };

  const handleAddMilestone = () => {
    if (!newMilestone.title.trim()) return;

    const milestone: AtlasMilestone = {
      id: `milestone_${crypto.randomUUID()}`,
      title: newMilestone.title,
      dueDate: newMilestone.dueDate || undefined,
      completed: false,
    };

    setFormData({
      ...formData,
      milestones: [...(formData.milestones || []), milestone],
    });

    setNewMilestone({ title: '', dueDate: '' });
  };

  const handleRemoveMilestone = (milestoneId: string) => {
    setFormData({
      ...formData,
      milestones: formData.milestones?.filter((m) => m.id !== milestoneId) || [],
    });
  };

  const handleSubmitForm = () => {
    if (!formData.title?.trim()) return;

    // Calculate progress based on completed milestones
    const milestones = formData.milestones || [];
    const completedCount = milestones.filter((m) => m.completed).length;
    const progressPercent =
      milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    if (editingGoal) {
      onUpdateGoal(editingGoal.id, { ...formData, progressPercent });
    } else {
      onCreateGoal({
        ...formData,
        id: `goal_${crypto.randomUUID()}`,
        progressPercent,
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
      <StatsGrid stats={statsData} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />

      {/* ── Controls: Filter & Actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filter dropdown */}
        <div className="w-full sm:w-48">
          <NeuralSelectMenu
            value={filter}
            onChange={(next) => setFilter(next as GoalFilter)}
            options={[
              { value: 'all', label: 'All Goals' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'completed', label: 'Completed' },
              { value: 'abandoned', label: 'Abandoned' },
            ]}
            triggerClassName="w-full"
            ariaLabel="Filter goals"
          />
        </div>

        {/* New Goal button */}
        <NeuralButton onClick={() => handleOpenForm()} size="sm" className="ml-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Goal
        </NeuralButton>
      </div>

      {/* ── Goal List ── */}
      <div className="space-y-3">
        {filteredGoals.length === 0 ? (
          <EmptyState
            title="No goals yet"
            description="Create your first goal to start tracking progress"
            icon={Target}
            size="lg"
          />
        ) : (
          <div ref={goalListRef} className="overflow-y-auto max-h-[600px]">
            <div style={{ height: goalVirtualizer.getTotalSize(), position: 'relative' }}>
              {goalVirtualizer.getVirtualItems().map(vitem => {
                const goal = filteredGoals[vitem.index];
                return (
                  <div
                    key={vitem.key}
                    style={{ position: 'absolute', top: vitem.start, left: 0, right: 0, paddingBottom: 12 }}
                    className="relative group"
                  >
                    <GoalProgress
                      goals={[goal]}
                      onUpdateProgress={onUpdateGoalProgress}
                      onExpandGoal={() => {}}
                    />
                    <ItemActionButtons
                      onEdit={() => handleOpenForm(goal)}
                      onDelete={() => promptDelete(goal)}
                      itemTitle={goal.title}
                      className="right-12"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Goal Form Modal ── */}
      <PortalledModal isOpen={showForm} onClose={handleCloseForm}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white/90">
            {editingGoal ? 'Edit Goal' : 'Create New Goal'}
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
          {/* Title */}
          <NeuralInput
            label="Title *"
            placeholder="Enter goal title..."
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Description
            </label>
            <NeuralTextarea
              value={formData.description || ''}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe your goal..."
              rows={3}
            />
          </div>

          {/* Deadline & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NeuralInput
              label="Deadline"
              type="date"
              icon={<Calendar className="w-4 h-4" />}
              value={formData.deadline || ''}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            />
            <div className="space-y-2">
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                Status
              </label>
              <NeuralSelectMenu
                value={formData.status || 'active'}
                onChange={(next) =>
                  setFormData({
                    ...formData,
                    status: next as AtlasGoal['status'],
                  })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'abandoned', label: 'Abandoned' },
                ]}
                ariaLabel="Status"
              />
            </div>
          </div>

          {/* Success Criteria */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Success Criteria
            </label>
            <NeuralTextarea
              value={formData.successCriteria || ''}
              onChange={(e) =>
                setFormData({ ...formData, successCriteria: e.target.value })
              }
              placeholder="How will you know you've achieved this goal?"
              rows={2}
            />
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Milestones
            </label>
            <div className="space-y-2">
              {/* Existing milestones */}
              {(formData.milestones || []).map((milestone) => (
                <div
                  key={milestone.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10"
                >
                  <CheckCircle2
                    className={cn(
                      'w-4 h-4 shrink-0',
                      milestone.completed ? 'text-emerald-400' : 'text-white/20'
                    )}
                  />
                  <span
                    className={cn(
                      'flex-1 text-xs',
                      milestone.completed
                        ? 'text-white/40 line-through'
                        : 'text-white/70'
                    )}
                  >
                    {milestone.title}
                  </span>
                  {milestone.dueDate && (
                    <span className="text-[10px] text-white/30">
                      {new Date(milestone.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <NeuralButton
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMilestone(milestone.id)}
                    className="h-7 w-7 min-w-0 p-0 hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </NeuralButton>
                </div>
              ))}

              {/* Add new milestone */}
              <div className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1 w-full">
                  <NeuralInput
                    placeholder="Add milestone..."
                    value={newMilestone.title}
                    onChange={(e) =>
                      setNewMilestone({ ...newMilestone, title: e.target.value })
                    }
                    className="h-10 min-h-[40px]"
                  />
                </div>
                <div className="w-full sm:w-auto">
                  <NeuralInput
                    type="date"
                    value={newMilestone.dueDate}
                    onChange={(e) =>
                      setNewMilestone({ ...newMilestone, dueDate: e.target.value })
                    }
                    className="h-10 min-h-[40px]"
                  />
                </div>
                <NeuralButton
                  onClick={handleAddMilestone}
                  size="sm"
                  className="h-10 w-10 min-w-0"
                  disabled={!newMilestone.title.trim()}
                >
                  <Plus className="w-4 h-4" />
                </NeuralButton>
              </div>
            </div>
          </div>

          {/* Associated Tasks */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1 flex items-center gap-1">
              <ListTodo className="w-3 h-3" />
              Associated Tasks
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto p-1">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-white/70">{t.title}</span>
                  <NeuralToggle
                    checked={formData.associatedTaskIds?.includes(t.id) || false}
                    onChange={(checked) => {
                      const taskIds = formData.associatedTaskIds || [];
                      setFormData({
                        ...formData,
                        associatedTaskIds: checked
                          ? [...taskIds, t.id]
                          : taskIds.filter((id) => id !== t.id),
                      });
                    }}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-6 border-t border-white/10">
          <NeuralButton onClick={handleCloseForm} variant="ghost" className="w-full sm:w-auto">
            Cancel
          </NeuralButton>
          <NeuralButton onClick={handleSubmitForm} disabled={!formData.title?.trim()} className="w-full sm:w-auto">
            {editingGoal ? 'Update Goal' : 'Create Goal'}
          </NeuralButton>
        </div>
      </PortalledModal>

      <ConfirmationDialog />
    </div>
  );
}
