/**
 * VaultLockedShell — 3-state vault shell component (GAP-07)
 *
 * Product spec §8 requires 3 states:
 *   Logged Out → Logged In (vault locked) → Logged In (vault unlocked)
 *
 * When the vault is locked this component renders a safe shell that:
 *  - Shows the module identity (name + description)
 *  - Shows non-sensitive metadata (last active timestamp, optional item count)
 *  - Surfaces an "Unlock vault to continue" prompt with the vault CTA
 *  - Does NOT attempt to render or decrypt any sensitive profile data
 *
 * Replace simple EmptyState "Vault locked" returns with this component so that
 * locked modules feel alive rather than blank.
 */

import React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VaultLockedShellProps {
  /** Human-readable module name shown in the heading */
  moduleName: string;
  /** One-line description of what this module manages */
  moduleDescription: string;
  /** Optional accent colour class (e.g. "text-sky-400") applied to the module name */
  accentClassName?: string;
  /** Optional: last active ISO timestamp — shown if provided */
  lastActive?: string | null;
  /** Optional: count of items (goals, tasks, plans…) stored — shown if provided */
  itemCount?: number | null;
  /** Label for itemCount (e.g. "goals", "plans") */
  itemCountLabel?: string;
  /** Called when the user taps the unlock CTA */
  onUnlock?: () => void;
  className?: string;
}

function formatLastActive(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'last active today';
    if (diffDays === 1) return 'last active yesterday';
    if (diffDays < 7) return `last active ${diffDays} days ago`;
    return `last active ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  } catch {
    return '';
  }
}

export function VaultLockedShell({
  moduleName,
  moduleDescription,
  accentClassName = 'text-white/80',
  lastActive,
  itemCount,
  itemCountLabel = 'items',
  onUnlock,
  className,
}: VaultLockedShellProps) {
  const lastActiveLabel = lastActive ? formatLastActive(lastActive) : null;

  return (
    <div
      className={cn(
        'h-full flex items-center justify-center p-8',
        className
      )}
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-xs">
        {/* Lock badge */}
        <div className="w-16 h-16 rounded-3xl bg-white/[0.045] border border-white/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-white/30" aria-hidden="true" />
        </div>

        {/* Module identity */}
        <div className="space-y-1">
          <h2 className={cn('text-lg font-bold tracking-tighter uppercase font-display', accentClassName)}>
            {moduleName}
          </h2>
          <p className="text-xs text-white/40 leading-relaxed">{moduleDescription}</p>
        </div>

        {/* Non-sensitive metadata (safe to show while locked) */}
        {(lastActiveLabel || (itemCount !== null && itemCount !== undefined)) && (
          <div className="flex items-center gap-4 text-[11px] text-white/25 uppercase tracking-widest font-medium">
            {lastActiveLabel && <span>{lastActiveLabel}</span>}
            {lastActiveLabel && itemCount !== null && itemCount !== undefined && (
              <span aria-hidden="true">·</span>
            )}
            {itemCount !== null && itemCount !== undefined && (
              <span>{itemCount} {itemCountLabel}</span>
            )}
          </div>
        )}

        {/* Unlock CTA */}
        <div className="space-y-3">
          <p className="text-xs text-white/35 leading-relaxed">
            Your data is encrypted and secured in your personal vault.
          </p>
          {onUnlock ? (
            <button
              type="button"
              onClick={onUnlock}
              className="px-5 py-2.5 rounded-xl bg-white/8 border border-white/15 hover:bg-white/12 hover:border-white/25 transition-all text-xs font-semibold text-white/70 hover:text-white/90 tracking-wide"
            >
              Unlock vault to continue
            </button>
          ) : (
            <p className="text-[11px] text-white/25 italic">
              Unlock your vault to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
