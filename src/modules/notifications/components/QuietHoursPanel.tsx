import { Moon } from 'lucide-react';

import { NeuralToggle } from '@/core/components/NeuralToggle';
import { cn } from '@/lib/utils';
import {
  type QuietHoursConfig,
  isInQuietHours,
} from '../services/notification-service';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Exhaustive list of Agnes module identifiers.
 * Kept as a const tuple so TypeScript infers the literal union type.
 */
const ALL_MODULES = [
  'agnes',
  'atlas',
  'titan',
  'soma',
  'scout',
  'ledger',
  'forge',
] as const;

type ModuleId = (typeof ALL_MODULES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuietHoursPanelProps {
  /** Current quiet-hours configuration (controlled). */
  config: QuietHoursConfig;
  /** Called with the full updated config whenever any field changes. */
  onChange: (updated: QuietHoursConfig) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface TimeFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** Styled native <input type="time"> matching the dark-glass theme. */
function TimeField({ label, value, onChange }: TimeFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={cn(
          'w-full px-3 py-2.5 rounded-xl text-sm font-medium',
          'bg-white/[0.06] border border-white/10 text-white/90',
          'focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.08]',
          'transition-colors [color-scheme:dark]',
        )}
      />
    </label>
  );
}

interface ModulePillProps {
  moduleId: ModuleId;
  isExempt: boolean;
  onToggle: (moduleId: ModuleId) => void;
}

/** Toggleable pill indicating whether a module is exempt from quiet hours. */
function ModulePill({ moduleId, isExempt, onToggle }: ModulePillProps) {
  return (
    <button
      onClick={() => onToggle(moduleId)}
      aria-pressed={isExempt}
      title={
        isExempt
          ? `${moduleId} will bypass quiet hours`
          : `Click to exempt ${moduleId} from quiet hours`
      }
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all select-none',
        isExempt
          ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-500/10'
          : 'bg-white/[0.05] border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/[0.08]',
      )}
    >
      {moduleId}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * QuietHoursPanel
 *
 * A fully controlled settings panel for configuring Do-Not-Disturb windows.
 * Embedded directly into the settings tab — not a modal.
 *
 * Complexity: O(m) where m = ALL_MODULES.length (constant = 7).
 */
export default function QuietHoursPanel({ config, onChange }: QuietHoursPanelProps) {
  const dndActive = isInQuietHours(config);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Merge a partial update and stamp updatedAt, then bubble to parent. */
  function applyUpdate(partial: Partial<Omit<QuietHoursConfig, 'updatedAt'>>): void {
    onChange({ ...config, ...partial, updatedAt: new Date().toISOString() });
  }

  function handleToggleEnabled(enabled: boolean): void {
    applyUpdate({ enabled });
  }

  function handleFromChange(from: string): void {
    applyUpdate({ from });
  }

  function handleToChange(to: string): void {
    applyUpdate({ to });
  }

  function handleToggleModule(moduleId: ModuleId): void {
    const next = config.exemptModules.includes(moduleId)
      ? config.exemptModules.filter((m) => m !== moduleId)
      : [...config.exemptModules, moduleId];
    applyUpdate({ exemptModules: next });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/10 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
              config.enabled
                ? 'bg-indigo-500/20'
                : 'bg-white/[0.06]',
            )}
            aria-hidden="true"
          >
            <Moon
              className={cn(
                'w-4 h-4 transition-colors',
                config.enabled ? 'text-indigo-400' : 'text-white/30',
              )}
            />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/90 leading-snug">
              Quiet Hours / Do Not Disturb
            </p>
            <p className="text-xs text-white/40 mt-0.5 leading-snug">
              {config.enabled
                ? `${config.from} – ${config.to} · ${config.exemptModules.length} exempt`
                : 'Suppress non-critical notifications during set hours'}
            </p>
          </div>
        </div>

        <NeuralToggle
          checked={config.enabled}
          onChange={handleToggleEnabled}
          color="indigo"
          size="md"
          aria-label="Enable quiet hours"
        />
      </div>

      {/* ── Body: enabled state ── */}
      {config.enabled ? (
        <div className="px-5 pb-5 space-y-5 border-t border-white/[0.06]">
          {/* DND active banner */}
          {dndActive && (
            <div
              role="status"
              className={cn(
                'mt-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl',
                'bg-amber-500/10 border border-amber-500/20',
              )}
            >
              <span className="text-base" aria-hidden="true">🌙</span>
              <p className="text-xs font-semibold text-amber-300">
                DND is active right now
              </p>
            </div>
          )}

          {/* Time range */}
          <div className={cn('grid grid-cols-2 gap-3', dndActive ? '' : 'mt-4')}>
            <TimeField
              label="From"
              value={config.from}
              onChange={handleFromChange}
            />
            <TimeField
              label="To"
              value={config.to}
              onChange={handleToChange}
            />
          </div>

          {/* Module exemptions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2.5">
              Always deliver from
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Exempt modules">
              {ALL_MODULES.map((mod) => (
                <ModulePill
                  key={mod}
                  moduleId={mod}
                  isExempt={config.exemptModules.includes(mod)}
                  onToggle={handleToggleModule}
                />
              ))}
            </div>
            {config.exemptModules.length > 0 && (
              <p className="mt-2 text-[10px] text-white/25">
                {config.exemptModules.length} module
                {config.exemptModules.length !== 1 ? 's' : ''} will bypass quiet hours
              </p>
            )}
          </div>
        </div>
      ) : (
        /* ── Body: disabled state ── */
        <div className="px-5 py-4 border-t border-white/[0.06]">
          <p className="text-sm text-white/30 italic">
            Enable to suppress non-critical notifications during set hours.
          </p>
        </div>
      )}
    </div>
  );
}
