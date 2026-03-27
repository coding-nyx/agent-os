import { useEffect, useRef, useState } from 'react';
import { Calendar, Clock, Sunrise } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { InboxRecord } from '@/lib/notifications/NotificationContext';
import { cn } from '@/lib/utils';
import {
  SNOOZE_OPTIONS,
  type SnoozeOption,
  computeSnoozedUntil,
  snoozeCountdown,
  isSnoozed,
  suggestSnooze,
} from '../services/notification-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnoozeMenuProps {
  /** The notification record being snoozed. */
  item: InboxRecord;
  /** Called when the user picks a snooze duration. */
  onSnooze: (notificationId: string, snoozedUntil: string) => void;
  /** Called when the user cancels an active snooze. */
  onUnsnooze: (notificationId: string) => void;
  /** ISO string representing when the current snooze expires (undefined if not snoozed). */
  snoozedUntil?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maps a snooze option value to its representative Lucide icon. */
const SNOOZE_ICON_MAP: Record<string, LucideIcon> = {
  '1h': Clock,
  '3h': Clock,
  tomorrow: Sunrise,
  '2d': Sunrise,
  '1w': Calendar,
};

function getSnoozeIcon(value: string): LucideIcon {
  return SNOOZE_ICON_MAP[value] ?? Clock;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: ReturnType<typeof suggestSnooze>;
  onPick: (option: SnoozeOption) => void;
}

function SuggestionRow({ suggestion, onPick }: SuggestionRowProps) {
  const Icon = getSnoozeIcon(suggestion.option.value);
  return (
    <button
      onClick={() => onPick(suggestion.option)}
      className={cn(
        'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
        'bg-cyan-500/[0.08] border border-cyan-500/20 hover:bg-cyan-500/[0.14]',
      )}
    >
      <Icon
        className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0"
        aria-hidden="true"
      />
      <span className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-white/90">
          {suggestion.option.label}
        </span>
        <span className="text-[11px] italic text-white/40 leading-snug mt-0.5">
          {suggestion.reason}
        </span>
      </span>
    </button>
  );
}

interface SnoozeOptionRowProps {
  option: SnoozeOption;
  isSuggested: boolean;
  onPick: (option: SnoozeOption) => void;
}

function SnoozeOptionRow({ option, isSuggested, onPick }: SnoozeOptionRowProps) {
  const Icon = getSnoozeIcon(option.value);
  return (
    <button
      onClick={() => onPick(option)}
      disabled={isSuggested}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
        isSuggested
          ? 'text-white/25 cursor-default'
          : 'text-white/65 hover:text-white/90 hover:bg-white/[0.06]',
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{option.label}</span>
      {isSuggested && (
        <span className="ml-auto text-[11px] uppercase tracking-widest text-cyan-500/50">
          suggested
        </span>
      )}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SnoozeMenu
 *
 * A self-contained trigger + absolute dropdown for snoozing/unsnoozing a
 * single notification. The dropdown closes on any outside click.
 *
 * Complexity: O(k) where k = SNOOZE_OPTIONS.length (constant ≤ 5).
 */
export default function SnoozeMenu({
  item,
  onSnooze,
  onUnsnooze,
  snoozedUntil,
}: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentlySnoozed = isSnoozed(snoozedUntil);

  // Compute suggestion once per render — O(1)
  const suggestion = suggestSnooze(item);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    function handleOutsideClick(e: MouseEvent): void {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [open]);

  // ── Action handlers ─────────────────────────────────────────────────────────
  function handlePick(option: SnoozeOption): void {
    onSnooze(item.id, computeSnoozedUntil(option));
    setOpen(false);
  }

  function handleUnsnooze(): void {
    onUnsnooze(item.id);
    setOpen(false);
  }

  function handleTriggerClick(): void {
    if (currentlySnoozed) {
      handleUnsnooze();
    } else {
      setOpen((prev) => !prev);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative inline-block">
      {/* ── Trigger ── */}
      <button
        onClick={handleTriggerClick}
        aria-haspopup={currentlySnoozed ? undefined : 'listbox'}
        aria-expanded={open}
        title={currentlySnoozed ? 'Click to unsnooze' : 'Snooze this notification'}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors select-none',
          currentlySnoozed
            ? 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20'
            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]',
        )}
      >
        <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
        {currentlySnoozed && snoozedUntil !== undefined ? (
          <span>Snoozed ({snoozeCountdown(snoozedUntil)})</span>
        ) : (
          <span className="sr-only">Snooze</span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          role="listbox"
          aria-label="Snooze options"
          className={cn(
            'absolute right-0 top-full mt-1 z-50 w-56',
            'bg-[#0e0e16] border border-white/[0.12] rounded-xl shadow-xl overflow-hidden',
          )}
        >
          {/* AI suggestion section */}
          <div className="px-3 pt-3 pb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">
              AI suggestion
            </p>
            <SuggestionRow suggestion={suggestion} onPick={handlePick} />
          </div>

          <div className="h-px bg-white/[0.07] mx-3 my-1" />

          {/* All options */}
          <div className="px-3 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-1.5">
              Snooze for
            </p>
            {SNOOZE_OPTIONS.map((option) => (
              <SnoozeOptionRow
                key={option.value}
                option={option}
                isSuggested={option.value === suggestion.option.value}
                onPick={handlePick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
