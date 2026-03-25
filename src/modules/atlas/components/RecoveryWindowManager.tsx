/**
 * RecoveryWindowManager Component
 * CRUD UI for managing Atlas recovery windows.
 * Follows the GoalTracker pattern: inline stats, modal form, card list with edit/delete.
 */

import React, { useState, useMemo } from 'react';
import { Plus, Clock, X, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecoveryWindow } from '@/lib/types';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { EmptyState } from '@/core/components/EmptyState';

import { useDeleteConfirmation } from './shared/useDeleteConfirmation';
import { PortalledModal } from './shared/PortalledModal';
import { ItemActionButtons } from './shared/ItemActionButtons';
import { StatsGrid } from './shared/StatsGrid';

// ── Types ────────────────────────────────────────────────────────────────────

interface RecoveryWindowManagerProps {
  windows: RecoveryWindow[];
  onCreateWindow: (window: Partial<RecoveryWindow>) => void;
  onUpdateWindow: (windowId: string, updates: Partial<RecoveryWindow>) => void;
  onDeleteWindow: (windowId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an ISO datetime string as "Mar 25 · 2:00 PM"
 * Uses locale-aware formatting for readability.
 */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Compute duration between two ISO strings in hours (rounded to 1 decimal).
 * Returns null if inputs are invalid.
 */
function durationHours(start: string, end: string): number | null {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(ms) || ms <= 0) return null;
    return Math.round((ms / 3_600_000) * 10) / 10;
  } catch {
    return null;
  }
}

/**
 * Convert an ISO datetime string to a datetime-local input value ("YYYY-MM-DDTHH:MM").
 */
function isoToLocal(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/** Status badge colour mapping. */
const STATUS_BADGE: Record<RecoveryWindow['status'], string> = {
  planned: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  active: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  completed: 'bg-white/5 text-white/40 border border-white/10',
};

const STATUS_LABEL: Record<RecoveryWindow['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  completed: 'Completed',
};

// ── Empty form factory ────────────────────────────────────────────────────────

function emptyForm(): Partial<RecoveryWindow> {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return {
    title: '',
    start: now.toISOString(),
    end: twoHoursLater.toISOString(),
    reason: '',
    status: 'planned',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RecoveryWindowManager({
  windows,
  onCreateWindow,
  onUpdateWindow,
  onDeleteWindow,
}: RecoveryWindowManagerProps) {
  // ── State ──
  const [showForm, setShowForm] = useState(false);
  const [editingWindow, setEditingWindow] = useState<RecoveryWindow | null>(null);
  const [formData, setFormData] = useState<Partial<RecoveryWindow>>(emptyForm());

  // Delete confirmation expects { id, title }
  const { promptDelete, ConfirmationDialog } = useDeleteConfirmation<RecoveryWindow>(onDeleteWindow);

  // ── Stats ──
  const statsData = useMemo(() => {
    const total = windows.length;
    const planned = windows.filter((w) => w.status === 'planned').length;
    const active = windows.filter((w) => w.status === 'active').length;
    const completed = windows.filter((w) => w.status === 'completed').length;

    return [
      { label: 'Total', value: total },
      {
        label: 'Planned',
        value: planned,
        colorClass: 'text-sky-300',
        labelColorClass: 'text-sky-300/60',
      },
      {
        label: 'Active',
        value: active,
        colorClass: 'text-emerald-400',
        labelColorClass: 'text-emerald-400/60',
      },
      {
        label: 'Completed',
        value: completed,
        colorClass: 'text-white/40',
        labelColorClass: 'text-white/30',
      },
    ];
  }, [windows]);

  // ── Form handlers ──

  const openCreate = () => {
    setEditingWindow(null);
    setFormData(emptyForm());
    setShowForm(true);
  };

  const openEdit = (w: RecoveryWindow) => {
    setEditingWindow(w);
    setFormData({ ...w });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingWindow(null);
    setFormData(emptyForm());
  };

  const handleSubmit = () => {
    const title = formData.title?.trim();
    if (!title) return;

    if (editingWindow) {
      onUpdateWindow(editingWindow.id, formData);
    } else {
      onCreateWindow({
        ...formData,
        id: `rw_${crypto.randomUUID()}`,
      });
    }

    closeForm();
  };

  /** Update form start/end from datetime-local input value (local ISO "YYYY-MM-DDTHH:MM"). */
  const handleDateChange = (field: 'start' | 'end', localValue: string) => {
    if (!localValue) return;
    // datetime-local gives us "YYYY-MM-DDTHH:MM" — convert to full ISO
    const d = new Date(localValue);
    if (!isNaN(d.getTime())) {
      setFormData((prev) => ({ ...prev, [field]: d.toISOString() }));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Stats */}
      <StatsGrid stats={statsData} className="grid-cols-2 sm:grid-cols-4" />

      {/* Controls */}
      <div className="flex items-center justify-end">
        <NeuralButton onClick={openCreate} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Window
        </NeuralButton>
      </div>

      {/* Window Cards */}
      <div className="space-y-3">
        {windows.length === 0 ? (
          <EmptyState
            title="No recovery windows scheduled"
            description="Adding recovery time protects your cognitive health."
            icon={CalendarRange}
            size="lg"
          />
        ) : (
          windows.map((w) => {
            const hours = durationHours(w.start, w.end);
            return (
              <div
                key={w.id}
                className="relative group rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-white/20 transition-colors"
              >
                {/* Action buttons — revealed on hover */}
                <ItemActionButtons
                  onEdit={() => openEdit(w)}
                  onDelete={() => promptDelete(w)}
                  itemTitle={w.title}
                />

                <div className="flex flex-col gap-2 pr-20">
                  {/* Title row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white/90">{w.title}</span>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                        STATUS_BADGE[w.status]
                      )}
                    >
                      {STATUS_LABEL[w.status]}
                    </span>
                    {hours !== null && (
                      <span className="text-[10px] text-white/30 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {hours}h
                      </span>
                    )}
                  </div>

                  {/* Time range */}
                  <p className="text-xs text-white/50">
                    {formatDateTime(w.start)}
                    <span className="mx-1.5 text-white/20">–</span>
                    {formatDateTime(w.end)}
                  </p>

                  {/* Reason */}
                  {w.reason && (
                    <p className="text-xs text-white/40 leading-relaxed">{w.reason}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Form Modal */}
      <PortalledModal isOpen={showForm} onClose={closeForm}>
        {/* Modal header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white/90">
            {editingWindow ? 'Edit Recovery Window' : 'New Recovery Window'}
          </h2>
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={closeForm}
            className="p-2 h-9 w-9 min-w-0 hover:bg-white/10 text-white/40 hover:text-white/70"
          >
            <X className="w-5 h-5" />
          </NeuralButton>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <NeuralInput
            label="Title *"
            placeholder="e.g. Deep Rest Block"
            value={formData.title ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          />

          {/* Start / End */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NeuralInput
              label="Start"
              type="datetime-local"
              value={isoToLocal(formData.start ?? '')}
              onChange={(e) => handleDateChange('start', e.target.value)}
            />
            <NeuralInput
              label="End"
              type="datetime-local"
              value={isoToLocal(formData.end ?? '')}
              onChange={(e) => handleDateChange('end', e.target.value)}
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Reason
            </label>
            <NeuralTextarea
              value={formData.reason ?? ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Why is this recovery time needed?"
              rows={3}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
              Status
            </label>
            <NeuralSelectMenu
              value={formData.status ?? 'planned'}
              onChange={(next) =>
                setFormData((prev) => ({
                  ...prev,
                  status: next as RecoveryWindow['status'],
                }))
              }
              options={[
                { value: 'planned', label: 'Planned' },
                { value: 'active', label: 'Active' },
                { value: 'completed', label: 'Completed' },
              ]}
              ariaLabel="Status"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-6 border-t border-white/10">
          <NeuralButton onClick={closeForm} variant="ghost" className="w-full sm:w-auto">
            Cancel
          </NeuralButton>
          <NeuralButton
            onClick={handleSubmit}
            disabled={!formData.title?.trim()}
            className="w-full sm:w-auto"
          >
            {editingWindow ? 'Update Window' : 'Create Window'}
          </NeuralButton>
        </div>
      </PortalledModal>

      <ConfirmationDialog />
    </div>
  );
}
