/**
 * GoalTracker Component
 * Comprehensive goal CRUD with milestones, progress tracking, and dependencies
 */

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Target,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  X,
  Calendar,
  ListTodo,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasGoal, AtlasMilestone, AtlasTask } from '../services/atlas-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { GoalProgress } from './GoalProgress';

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
  const reducedMotion = useReducedMotion();

  // ── State ──
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<AtlasGoal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

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
  const filteredGoals = useMemo(() => {
    if (filter === 'all') return goals;
    return goals.filter((g) => g.status === filter);
  }, [goals, filter]);

  // ── Goal statistics ──
  const stats = useMemo(() => {
    const total = goals.length;
    const active = goals.filter((g) => g.status === 'active').length;
    const completed = goals.filter((g) => g.status === 'completed').length;
    const avgProgress =
      goals.length > 0
        ? Math.round(goals.reduce((sum, g) => sum + g.progressPercent, 0) / goals.length)
        : 0;

    return { total, active, completed, avgProgress };
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
            Total Goals
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
          <div className="text-[10px] text-sky-400/60 uppercase tracking-wider mb-1">
            Completed
          </div>
          <div className="text-2xl font-black text-sky-400 tabular-nums">
            {stats.completed}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-orange-400/60 uppercase tracking-wider mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Avg Progress
          </div>
          <div className="text-2xl font-black text-orange-400 tabular-nums">
            {stats.avgProgress}%
          </div>
        </SurfaceCard>
      </div>

      {/* ── Controls: Filter & Actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filter dropdown */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as GoalFilter)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 cursor-pointer"
        >
          <option value="all">All Goals</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="abandoned">Abandoned</option>
        </select>

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
          <div className="space-y-4">
            {filteredGoals.map((goal) => (
              <div key={goal.id} className="relative group">
                <GoalProgress
                  goals={[goal]}
                  onUpdateProgress={onUpdateGoalProgress}
                  onExpandGoal={() => {}}
                />
                {/* Quick action buttons on hover */}
                <div className="absolute top-3 right-12 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenForm(goal);
                    }}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90 transition-colors"
                    aria-label={`Edit ${goal.title}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: goal.id, title: goal.title });
                    }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400 transition-colors"
                    aria-label={`Delete ${goal.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Goal Form Modal — portalled to body to escape Framer Motion transform containment ── */}
      {createPortal(
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
                  {editingGoal ? 'Edit Goal' : 'Create New Goal'}
                </h2>
                <button
                  onClick={handleCloseForm}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Enter goal title..."
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe your goal..."
                    rows={3}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 resize-none"
                  />
                </div>

                {/* Deadline & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Deadline
                    </label>
                    <input
                      type="date"
                      value={formData.deadline || ''}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status || 'active'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as AtlasGoal['status'],
                        })
                      }
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                      <option value="abandoned">Abandoned</option>
                    </select>
                  </div>
                </div>

                {/* Success Criteria */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                    Success Criteria
                  </label>
                  <textarea
                    value={formData.successCriteria || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, successCriteria: e.target.value })
                    }
                    placeholder="How will you know you've achieved this goal?"
                    rows={2}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 resize-none"
                  />
                </div>

                {/* Milestones */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
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
                        <button
                          onClick={() => handleRemoveMilestone(milestone.id)}
                          className="p-1 rounded hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {/* Add new milestone */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={newMilestone.title}
                        onChange={(e) =>
                          setNewMilestone({ ...newMilestone, title: e.target.value })
                        }
                        placeholder="Add milestone..."
                        className="flex-1 min-w-0 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                      />
                      <input
                        type="date"
                        value={newMilestone.dueDate}
                        onChange={(e) =>
                          setNewMilestone({ ...newMilestone, dueDate: e.target.value })
                        }
                        className="shrink-0 w-full sm:w-auto px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white/90 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                      />
                      <NeuralButton
                        onClick={handleAddMilestone}
                        size="sm"
                        disabled={!newMilestone.title.trim()}
                      >
                        <Plus className="w-3 h-3" />
                      </NeuralButton>
                    </div>
                  </div>
                </div>

                {/* Associated Tasks */}
                <div>
                  <label className="block text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ListTodo className="w-3 h-3" />
                    Associated Tasks
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tasks.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.associatedTaskIds?.includes(t.id) || false}
                          onChange={(e) => {
                            const taskIds = formData.associatedTaskIds || [];
                            setFormData({
                              ...formData,
                              associatedTaskIds: e.target.checked
                                ? [...taskIds, t.id]
                                : taskIds.filter((id) => id !== t.id),
                            });
                          }}
                          className="w-4 h-4 rounded border-white/20 text-emerald-500 focus:ring-emerald-400/50"
                        />
                        <span className="text-xs text-white/70">{t.title}</span>
                      </label>
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteGoal(deleteTarget.id);
          setDeleteTarget(null);
        }}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
      />
    </div>
  );
}
