/**
 * ProjectManager Component
 * Full CRUD UI for Atlas projects — filter, create, edit, delete with confirmation.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  FolderOpen,
  Calendar,
  Link2,
  CheckCircle2,
  X,
  TrendingUp,
  Archive,
  Pause,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtlasProject, AtlasGoal, AtlasTask } from '../services/atlas-profile-service';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { EmptyState } from '@/core/components/EmptyState';
import { useDeleteConfirmation } from './shared/useDeleteConfirmation';
import { PortalledModal } from './shared/PortalledModal';
import { ItemActionButtons } from './shared/ItemActionButtons';
import { StatsGrid } from './shared/StatsGrid';
import { useFilteredSortedList } from './shared/useFilteredSortedList';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface ProjectManagerProps {
  projects: AtlasProject[];
  goals: AtlasGoal[];
  tasks: AtlasTask[];
  onCreateProject: (project: Partial<AtlasProject>) => void;
  onUpdateProject: (projectId: string, updates: Partial<AtlasProject>) => void;
  onDeleteProject: (projectId: string) => void;
}

type ProjectFilter = 'all' | 'active' | 'paused' | 'completed' | 'archived';

interface ProjectFormState {
  title: string;
  description: string;
  status: AtlasProject['status'];
  goalId: string;
  deadline: string;
  notes: string;
}

const EMPTY_FORM: ProjectFormState = {
  title: '',
  description: '',
  status: 'active',
  goalId: '',
  deadline: '',
  notes: '',
};

// ─────────────────────────────────────────────────────────
// Status badge helper
// ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<AtlasProject['status'], string> = {
  active: 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30',
  paused: 'bg-amber-400/15 text-amber-400 border-amber-400/30',
  completed: 'bg-[var(--module-color-400)]/15 text-[var(--module-color-400)] border-[var(--module-color-400)]/30',
  archived: 'bg-white/10 text-white/40 border-white/20',
};

const STATUS_LABELS: Record<AtlasProject['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

// ─────────────────────────────────────────────────────────
// Health score helper
// ─────────────────────────────────────────────────────────

interface HealthScore {
  label: string;
  emoji: string;
  colorClass: string;
}

function computeHealthScore(
  project: AtlasProject,
  counts: { total: number; done: number },
): HealthScore {
  const ON_TRACK: HealthScore = { label: 'On track', emoji: '🟢', colorClass: 'text-emerald-400' };

  if (project.status === 'completed') return ON_TRACK;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (project.deadline) {
    const deadline = new Date(project.deadline);
    deadline.setHours(0, 0, 0, 0);

    if (deadline < today) {
      return { label: 'Overdue', emoji: '🔴', colorClass: 'text-red-400' };
    }

    const createdAt = new Date(project.createdAt);
    createdAt.setHours(0, 0, 0, 0);

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const totalDays = (deadline.getTime() - createdAt.getTime()) / MS_PER_DAY;
    const daysElapsed = (today.getTime() - createdAt.getTime()) / MS_PER_DAY;

    if (totalDays > 0) {
      const expectedProgress = (daysElapsed / totalDays) * 100;
      const actualProgress = counts.total > 0 ? (counts.done / counts.total) * 100 : 0;

      if (actualProgress < expectedProgress - 20) {
        return { label: 'At risk', emoji: '🟡', colorClass: 'text-amber-400' };
      }
    }
  }

  return ON_TRACK;
}

// ─────────────────────────────────────────────────────────
// Gantt chart sub-component
// ─────────────────────────────────────────────────────────

interface ProjectGanttViewProps {
  projects: AtlasProject[];
  taskCountsByProject: Record<string, { total: number; done: number }>;
}

const GANTT_BAR_COLORS: Record<AtlasProject['status'], string> = {
  active: '#3b82f6',
  completed: '#22c55e',
  paused: '#6b7280',
  archived: '#374151',
};

function ProjectGanttView({ projects, taskCountsByProject }: ProjectGanttViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projectsWithDeadlines = projects.filter(p => Boolean(p.deadline));

  if (projectsWithDeadlines.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.045] p-8 text-center text-sm text-white/40">
        No project deadlines set — add deadlines to see the timeline.
      </div>
    );
  }

  // Date range: earliest createdAt → latest deadline (or +90 days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allDates = projects.flatMap(p => [
    new Date(p.createdAt),
    p.deadline ? new Date(p.deadline) : null,
  ]).filter(Boolean) as Date[];

  const rangeStart = new Date(Math.min(...allDates.map(d => d.getTime())));
  rangeStart.setHours(0, 0, 0, 0);

  const deadlineDates = projects.filter(p => p.deadline).map(p => new Date(p.deadline!));
  const rangeEnd =
    deadlineDates.length > 0
      ? new Date(Math.max(...deadlineDates.map(d => d.getTime())))
      : new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  rangeEnd.setHours(0, 0, 0, 0);

  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const totalDays = Math.max((rangeEnd.getTime() - rangeStart.getTime()) / MS_PER_DAY, 1);

  const LABEL_COL = 160;
  const ROW_HEIGHT = 36;
  const AXIS_HEIGHT = 40;
  const svgWidth = 800;
  const chartWidth = svgWidth - LABEL_COL;
  const svgHeight = projects.length * ROW_HEIGHT + AXIS_HEIGHT;

  const dateToX = (date: Date) => {
    const days = (date.getTime() - rangeStart.getTime()) / MS_PER_DAY;
    return LABEL_COL + (days / totalDays) * chartWidth;
  };

  // Month labels along the x-axis
  const monthLabels: { x: number; label: string }[] = [];
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  if (cursor < rangeStart) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= rangeEnd) {
    monthLabels.push({
      x: dateToX(cursor),
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayX = dateToX(today);

  return (
    <div ref={containerRef} className="rounded-xl border border-white/10 bg-white/[0.045] p-4 overflow-x-auto">
      <div style={{ minWidth: LABEL_COL + 400 }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          preserveAspectRatio="none"
          style={{ height: svgHeight, display: 'block' }}
        >
          {/* X-axis month labels */}
          {monthLabels.map(({ x, label }) => (
            <g key={label + x}>
              <line
                x1={x} y1={AXIS_HEIGHT - 8}
                x2={x} y2={svgHeight}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={x + 4} y={16}
                fontSize={9}
                fill="rgba(255,255,255,0.35)"
                fontFamily="sans-serif"
              >
                {label}
              </text>
            </g>
          ))}

          {/* Project rows */}
          {projects.map((project, i) => {
            const y = AXIS_HEIGHT + i * ROW_HEIGHT;
            const barY = y + 8;
            const barH = ROW_HEIGHT - 16;

            const startDate = new Date(project.createdAt);
            startDate.setHours(0, 0, 0, 0);
            const endDate = project.deadline
              ? new Date(project.deadline)
              : rangeEnd;
            endDate.setHours(0, 0, 0, 0);

            const barX = dateToX(startDate);
            const barEndX = dateToX(endDate);
            const barW = Math.max(barEndX - barX, 4);

            const fill = GANTT_BAR_COLORS[project.status];
            const counts = taskCountsByProject[project.id] ?? { total: 0, done: 0 };
            const progress = counts.total > 0 ? counts.done / counts.total : 0;

            return (
              <g key={project.id}>
                {/* Row stripe */}
                <rect
                  x={0} y={y}
                  width={svgWidth} height={ROW_HEIGHT}
                  fill={i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent'}
                />

                {/* Project label */}
                <text
                  x={8} y={barY + barH / 2 + 4}
                  fontSize={10}
                  fill="rgba(255,255,255,0.6)"
                  fontFamily="sans-serif"
                >
                  {project.title.length > 20
                    ? project.title.slice(0, 19) + '…'
                    : project.title}
                </text>

                {/* Background bar */}
                <rect
                  x={barX} y={barY}
                  width={barW} height={barH}
                  rx={3} ry={3}
                  fill={fill}
                  opacity={0.25}
                />

                {/* Progress fill */}
                {counts.total > 0 && (
                  <rect
                    x={barX} y={barY}
                    width={barW * progress} height={barH}
                    rx={3} ry={3}
                    fill={fill}
                    opacity={0.75}
                  />
                )}
              </g>
            );
          })}

          {/* Today marker */}
          {todayX >= LABEL_COL && todayX <= svgWidth && (
            <line
              x1={todayX} y1={AXIS_HEIGHT - 8}
              x2={todayX} y2={svgHeight}
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.8}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AtlasProject['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border',
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────

export function ProjectManager({
  projects,
  goals,
  tasks,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}: ProjectManagerProps) {
  // ── State ──
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<AtlasProject | null>(null);
  const [formData, setFormData] = useState<ProjectFormState>(EMPTY_FORM);

  const { promptDelete, ConfirmationDialog } = useDeleteConfirmation<AtlasProject>(onDeleteProject);

  // ── Derived data ──
  const filteredProjects = useFilteredSortedList({
    items: projects,
    filter,
    filterFn: (project, currentFilter) =>
      currentFilter === 'all' || project.status === currentFilter,
  });

  const statsData = useMemo(() => {
    const total = projects.length;
    const active = projects.filter(p => p.status === 'active').length;
    const completed = projects.filter(p => p.status === 'completed').length;
    const archived = projects.filter(p => p.status === 'archived').length;

    return [
      { label: 'Total', value: total },
      {
        label: 'Active',
        value: active,
        colorClass: 'text-emerald-400',
        labelColorClass: 'text-emerald-400/60',
      },
      {
        label: 'Completed',
        value: completed,
        colorClass: 'text-[var(--module-color-400)]',
        labelColorClass: 'text-[var(--module-color-400)]/60',
        icon: <TrendingUp className="w-3 h-3" />,
      },
      {
        label: 'Archived',
        value: archived,
        colorClass: 'text-white/40',
        labelColorClass: 'text-white/25',
        icon: <Archive className="w-3 h-3" />,
      },
    ];
  }, [projects]);

  // ── Handlers ──
  const handleOpenForm = (project?: AtlasProject) => {
    if (project) {
      setEditingProject(project);
      setFormData({
        title: project.title,
        description: project.description ?? '',
        status: project.status,
        goalId: project.goalId ?? '',
        deadline: project.deadline ?? '',
        notes: project.notes ?? '',
      });
    } else {
      setEditingProject(null);
      setFormData(EMPTY_FORM);
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingProject(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmitForm = () => {
    if (!formData.title.trim()) return;

    const payload: Partial<AtlasProject> = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      status: formData.status,
      goalId: formData.goalId.trim() || undefined,
      deadline: formData.deadline.trim() || undefined,
      notes: formData.notes.trim() || undefined,
    };

    if (editingProject) {
      onUpdateProject(editingProject.id, payload);
    } else {
      onCreateProject(payload);
    }

    handleCloseForm();
  };

  // ── Goal select options ──
  const goalOptions = useMemo(
    () => [
      { value: '', label: 'No goal linked' },
      ...goals
        .filter(g => g.status === 'active')
        .map(g => ({ value: g.id, label: g.title })),
    ],
    [goals],
  );

  // ── Per-card task counts ──
  const taskCountsByProject = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const project of projects) {
      const projectTasks = tasks.filter(t => t.projectId === project.id);
      map[project.id] = {
        total: projectTasks.length,
        done: projectTasks.filter(t => t.status === 'done').length,
      };
    }
    return map;
  }, [projects, tasks]);

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* ── Stats ── */}
      <StatsGrid stats={statsData} className="grid-cols-2 sm:grid-cols-4" />

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-52">
          <NeuralSelectMenu
            value={filter}
            onChange={next => setFilter(next as ProjectFilter)}
            options={[
              { value: 'all', label: 'All Projects' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'completed', label: 'Completed' },
              { value: 'archived', label: 'Archived' },
            ]}
            triggerClassName="w-full"
            ariaLabel="Filter projects"
          />
        </div>

        <NeuralButton onClick={() => handleOpenForm()} size="sm" className="ml-auto">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </NeuralButton>

        {/* View mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'grid'
                ? 'bg-white/10 text-white/90'
                : 'text-white/40 hover:text-white/60',
            )}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'timeline'
                ? 'bg-white/10 text-white/90'
                : 'text-white/40 hover:text-white/60',
            )}
          >
            Timeline
          </button>
        </div>
      </div>

      {/* ── Project List ── */}
      <div className="space-y-3">
        {viewMode === 'timeline' ? (
          <ProjectGanttView
            projects={filteredProjects}
            taskCountsByProject={taskCountsByProject}
          />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description={
              filter === 'all'
                ? 'Create your first project to organise tasks and goals'
                : `No ${filter} projects`
            }
            icon={FolderOpen}
            size="lg"
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map(project => {
              const counts = taskCountsByProject[project.id] ?? { total: 0, done: 0 };
              const progress =
                counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
              const linkedGoal = project.goalId
                ? goals.find(g => g.id === project.goalId)
                : null;
              const health = computeHealthScore(project, counts);

              return (
                <div key={project.id} className="relative group">
                  <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4 space-y-3 hover:bg-white/[0.05] transition-colors h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 pr-16">
                      <h3 className="text-sm font-bold text-white/85 leading-tight">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={cn('text-[11px] font-semibold shrink-0', health.colorClass)}>
                          {health.emoji} {health.label}
                        </span>
                        <FolderOpen className="w-4 h-4 text-white/20 shrink-0 mt-0.5" />
                      </div>
                    </div>

                    {/* Status badge */}
                    <StatusBadge status={project.status} />

                    {/* Description */}
                    {project.description && (
                      <p className="text-xs text-white/40 line-clamp-2">{project.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
                      {project.deadline && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(project.deadline).toLocaleDateString()}
                        </span>
                      )}
                      <span>
                        {counts.total} task{counts.total !== 1 ? 's' : ''}
                      </span>
                      {counts.total > 0 && (
                        <span className="text-emerald-400/60">
                          {counts.done}/{counts.total} done
                        </span>
                      )}
                      {linkedGoal && (
                        <span className="flex items-center gap-1 text-[var(--module-color-400)]/60">
                          <Link2 className="w-3 h-3" />
                          {linkedGoal.title.length > 20
                            ? `${linkedGoal.title.slice(0, 20)}…`
                            : linkedGoal.title}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    {counts.total > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-white/30">
                          <span>Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full h-1 bg-white/[0.045] rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300',
                              project.status === 'completed'
                                ? 'bg-[var(--module-color-400)]/60'
                                : 'bg-emerald-400/50',
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Edit / Delete buttons (visible on hover) */}
                  <ItemActionButtons
                    onEdit={() => handleOpenForm(project)}
                    onDelete={() => promptDelete(project)}
                    itemTitle={project.title}
                    className="right-3"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <PortalledModal isOpen={showForm} onClose={handleCloseForm}>
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white/90">
            {editingProject ? 'Edit Project' : 'Create New Project'}
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
            placeholder="Enter project title..."
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
          />

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Description
            </label>
            <NeuralTextarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the project..."
              rows={3}
            />
          </div>

          {/* Status & Goal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
                Status
              </label>
              <NeuralSelectMenu
                value={formData.status}
                onChange={next =>
                  setFormData({ ...formData, status: next as AtlasProject['status'] })
                }
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'archived', label: 'Archived' },
                ]}
                ariaLabel="Project status"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                Linked Goal
              </label>
              <NeuralSelectMenu
                value={formData.goalId}
                onChange={next => setFormData({ ...formData, goalId: next })}
                options={goalOptions}
                ariaLabel="Linked goal"
              />
            </div>
          </div>

          {/* Deadline */}
          <NeuralInput
            label="Deadline"
            type="date"
            icon={<Calendar className="w-4 h-4" />}
            value={formData.deadline}
            onChange={e => setFormData({ ...formData, deadline: e.target.value })}
          />

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Notes
            </label>
            <NeuralTextarea
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-6 border-t border-white/10">
          <NeuralButton onClick={handleCloseForm} variant="ghost" className="w-full sm:w-auto">
            Cancel
          </NeuralButton>
          <NeuralButton
            onClick={handleSubmitForm}
            disabled={!formData.title.trim()}
            className="w-full sm:w-auto"
          >
            {editingProject ? 'Update Project' : 'Create Project'}
          </NeuralButton>
        </div>
      </PortalledModal>

      <ConfirmationDialog />
    </div>
  );
}
