/**
 * TaskManager Component
 * Comprehensive task CRUD with dependencies, energy cost, and AI-suggested scheduling
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Filter,
  Search,
  Link2,
  Calendar,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  GitBranch,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasTask, AtlasProject } from '../services/atlas-profile-service';
import { TaskCard } from './TaskCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { EmptyState } from '@/core/components/EmptyState';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';

interface TaskManagerProps {
  tasks: AtlasTask[];
  projects: AtlasProject[];
  onCreateTask: (task: Partial<AtlasTask>) => void;
  onUpdateTask: (taskId: string, updates: Partial<AtlasTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  focusTaskId?: string;
}

type TaskFilter = 'all' | 'active' | 'blocked' | 'done' | 'deferred';
type TaskSort = 'priority' | 'deadline' | 'energy' | 'created';

export function TaskManager({
  tasks,
  projects,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCompleteTask,
  focusTaskId,
}: TaskManagerProps) {
  const reducedMotion = useReducedMotion();

  // ── State ──
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sortBy, setSortBy] = useState<TaskSort>('priority');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<AtlasTask | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showDependencyGraph, setShowDependencyGraph] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [remindTask, setRemindTask] = useState<AtlasTask | null>(null);

  useEffect(() => {
    if (!focusTaskId) return;
    setExpandedTaskId(focusTaskId);
    const target = tasks.find((t) => t.id === focusTaskId);
    if (target) setRemindTask(null);
  }, [focusTaskId, tasks]);

  // ── Form state ──
  const [formData, setFormData] = useState<Partial<AtlasTask>>({
    title: '',
    description: '',
    priority: 3,
    energyCost: 5,
    status: 'queued',
    dependencies: [],
    tags: [],
  });

  // ── Filtered & sorted tasks ──
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter((t) => t.status === filter);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          return a.priority - b.priority;
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'energy':
          return b.energyCost - a.energyCost;
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [tasks, filter, searchQuery, sortBy]);

  // ── Task statistics ──
  const stats = useMemo(() => {
    const total = tasks.length;
    const active = tasks.filter((t) => t.status === 'active' || t.status === 'queued').length;
    const blocked = tasks.filter((t) => t.status === 'blocked').length;
    const completed = tasks.filter((t) => t.status === 'done').length;
    const totalEnergy = tasks
      .filter((t) => t.status !== 'done')
      .reduce((sum, t) => sum + t.energyCost, 0);
    
    return { total, active, blocked, completed, totalEnergy };
  }, [tasks]);

  // ── Task dependency graph data ──
  const dependencyGraph = useMemo(() => {
    const nodes = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      energyCost: t.energyCost,
    }));

    const edges = tasks.flatMap((t) =>
      t.dependencies.map((depId) => ({
        from: depId,
        to: t.id,
      }))
    );

    return { nodes, edges };
  }, [tasks]);

  // ── Handlers ──
  const handleOpenForm = useCallback((task?: AtlasTask) => {
    if (task) {
      setEditingTask(task);
      setFormData(task);
    } else {
      setEditingTask(null);
      setFormData({
        title: '',
        description: '',
        priority: 3,
        energyCost: 5,
        status: 'queued',
        dependencies: [],
        tags: [],
      });
    }
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      priority: 3,
      energyCost: 5,
      status: 'queued',
      dependencies: [],
      tags: [],
    });
  }, []);

  const handleSubmitForm = useCallback(() => {
    if (!formData.title?.trim()) return;

    if (editingTask) {
      onUpdateTask(editingTask.id, formData);
    } else {
      onCreateTask({
        ...formData,
        id: `task_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    handleCloseForm();
  }, [formData, editingTask, onUpdateTask, onCreateTask, handleCloseForm]);

  const handleToggleExpand = useCallback((taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  }, []);

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Header with stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
            Total Tasks
          </div>
          <div className="text-2xl font-black text-white/90 tabular-nums">
            {stats.total}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-sky-400/60 uppercase tracking-wider mb-1">
            Active
          </div>
          <div className="text-2xl font-black text-sky-400 tabular-nums">
            {stats.active}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-amber-400/60 uppercase tracking-wider mb-1">
            Blocked
          </div>
          <div className="text-2xl font-black text-amber-400 tabular-nums">
            {stats.blocked}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-emerald-400/60 uppercase tracking-wider mb-1">
            Done
          </div>
          <div className="text-2xl font-black text-emerald-400 tabular-nums">
            {stats.completed}
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-3">
          <div className="text-[10px] text-orange-400/60 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Energy
          </div>
          <div className="text-2xl font-black text-orange-400 tabular-nums">
            {stats.totalEnergy}
          </div>
        </SurfaceCard>
      </div>

      {/* ── Controls: Search, Filter, Sort, Actions ── */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <NeuralInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Filter dropdown */}
        <div className="w-full sm:w-40">
          <NeuralSelectMenu
            value={filter}
            onChange={(next) => setFilter(next as TaskFilter)}
            options={[
              { value: 'all', label: 'All Tasks' },
              { value: 'active', label: 'Active' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'done', label: 'Done' },
              { value: 'deferred', label: 'Deferred' },
            ]}
            triggerClassName="w-full"
            ariaLabel="Filter tasks"
          />
        </div>

        {/* Sort dropdown */}
        <div className="w-full sm:w-40">
          <NeuralSelectMenu
            value={sortBy}
            onChange={(next) => setSortBy(next as TaskSort)}
            options={[
              { value: 'priority', label: 'Priority' },
              { value: 'deadline', label: 'Deadline' },
              { value: 'energy', label: 'Energy Cost' },
              { value: 'created', label: 'Created Date' },
            ]}
            triggerClassName="w-full"
            ariaLabel="Sort tasks"
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 ml-auto">
          <NeuralButton
            onClick={() => setShowDependencyGraph(!showDependencyGraph)}
            size="sm"
            variant="ghost"
            className="border border-white/10"
          >
            <GitBranch className="w-4 h-4 mr-2" />
            Graph
          </NeuralButton>
          <NeuralButton onClick={() => handleOpenForm()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </NeuralButton>
        </div>
      </div>

      {/* ── Dependency Graph View ── */}
      <AnimatePresence>
        {showDependencyGraph && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SurfaceCard className="p-4">
              <h3 className="text-sm font-bold text-white/90 mb-4 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Task Dependency Graph
              </h3>
              <div className="space-y-2">
                {dependencyGraph.edges.length === 0 ? (
                  <p className="text-xs text-white/40 italic">
                    No task dependencies defined yet
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {dependencyGraph.edges.map((edge, idx) => {
                      const fromTask = tasks.find((t) => t.id === edge.from);
                      const toTask = tasks.find((t) => t.id === edge.to);
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs text-white/60 p-2 rounded-lg bg-white/[0.02] border border-white/5"
                        >
                          <span
                            className={cn(
                              'truncate flex-1',
                              fromTask?.status === 'done' && 'line-through text-emerald-400/50'
                            )}
                          >
                            {fromTask?.title || edge.from}
                          </span>
                          <Link2 className="w-3 h-3 text-white/20 shrink-0" />
                          <span className="truncate flex-1">{toTask?.title || edge.to}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </SurfaceCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Task List ── */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No tasks found' : 'No tasks yet'}
            description={
              searchQuery
                ? 'Try adjusting your search or filters'
                : 'Create your first task to get started'
            }
            icon={CheckCircle2}
            size="lg"
          />
        ) : (
          filteredTasks.map((task) => (
            <div key={task.id} className="relative group">
              <TaskCard
                task={task}
                onComplete={onCompleteTask}
                isExpanded={expandedTaskId === task.id}
                onToggleExpand={() => handleToggleExpand(task.id)}
                allTasks={tasks}
                onRemind={(t) => setRemindTask(t)}
              />
              {/* Quick action buttons on hover */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <NeuralButton
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenForm(task);
                  }}
                  className="p-1.5 h-8 w-8 min-w-0 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white/90"
                  aria-label={`Edit ${task.title}`}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </NeuralButton>
                <NeuralButton
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: task.id, title: task.title });
                  }}
                  className="p-1.5 h-8 w-8 min-w-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/60 hover:text-rose-400"
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </NeuralButton>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Task Form Modal — portalled to body to escape Framer Motion transform containment ── */}
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
                  {editingTask ? 'Edit Task' : 'Create New Task'}
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
                  placeholder="Enter task title..."
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
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Add task details..."
                    rows={3}
                  />
                </div>

                {/* Priority & Energy Cost */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                      Priority (1-5)
                    </label>
                    <NeuralSelectMenu
                      value={formData.priority || 3}
                      onChange={(next) =>
                        setFormData({ ...formData, priority: Number(next) as 1 | 2 | 3 | 4 | 5 })
                      }
                      options={[
                        { value: 1, label: '1 - Critical' },
                        { value: 2, label: '2 - High' },
                        { value: 3, label: '3 - Medium' },
                        { value: 4, label: '4 - Low' },
                        { value: 5, label: '5 - Minimal' },
                      ]}
                      ariaLabel="Priority"
                    />
                  </div>
                  <NeuralInput
                    label="Energy Cost (0-10)"
                    type="number"
                    min={0}
                    max={10}
                    icon={<Zap className="w-4 h-4" />}
                    value={formData.energyCost || 5}
                    onChange={(e) =>
                      setFormData({ ...formData, energyCost: Math.max(0, Math.min(10, parseInt(e.target.value) || 5)) })
                    }
                  />
                </div>

                {/* Deadline & Project */}
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
                      Project
                    </label>
                    <NeuralSelectMenu
                      value={formData.projectId || ''}
                      onChange={(next) => setFormData({ ...formData, projectId: String(next) })}
                      options={[
                        { value: '', label: 'None' },
                        ...projects.map((p) => ({ value: p.id, label: p.title })),
                      ]}
                      ariaLabel="Project"
                    />
                  </div>
                </div>

                {/* Dependencies */}
                <div className="space-y-2">
                  <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1 flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    Dependencies
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto p-1">
                    {tasks
                      .filter((t) => t.id !== editingTask?.id)
                      .map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <span className="text-xs text-white/70">{t.title}</span>
                          <NeuralToggle
                            checked={formData.dependencies?.includes(t.id) || false}
                            onChange={(checked) => {
                              const deps = formData.dependencies || [];
                              setFormData({
                                ...formData,
                                dependencies: checked
                                  ? [...deps, t.id]
                                  : deps.filter((id) => id !== t.id),
                              });
                            }}
                            size="sm"
                          />
                        </div>
                      ))}
                  </div>
                </div>

                {/* Tags */}
                <NeuralInput
                  label="Tags (comma-separated)"
                  value={formData.tags?.join(', ') || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="work, urgent, research..."
                />
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-6 border-t border-white/10">
                <NeuralButton onClick={handleCloseForm} variant="ghost" className="w-full sm:w-auto">
                  Cancel
                </NeuralButton>
                <NeuralButton onClick={handleSubmitForm} disabled={!formData.title?.trim()} className="w-full sm:w-auto">
                  {editingTask ? 'Update Task' : 'Create Task'}
                </NeuralButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
      <QuickReminderModal
        open={!!remindTask}
        moduleId="atlas"
        defaultTitle={remindTask ? `Task: ${remindTask.title}` : ''}
        defaultNote={remindTask?.description}
        deepLink={
          remindTask
            ? { route: '/atlas', focusId: `task:${remindTask.id}` }
            : undefined
        }
        source={
          remindTask
            ? { moduleId: 'atlas', entityType: 'task', entityId: remindTask.id, label: remindTask.title }
            : undefined
        }
        tags={remindTask?.tags}
        onClose={() => setRemindTask(null)}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDeleteTask(deleteTarget.id);
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
