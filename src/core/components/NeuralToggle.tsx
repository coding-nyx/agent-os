import React from 'react';
import { cn } from '@/lib/utils';

interface NeuralToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  color?: 'indigo' | 'orange' | 'amber' | 'emerald' | 'rose';
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const COLOR_MAP = {
  indigo: 'bg-indigo-500/80',
  orange: 'bg-orange-500/70',
  amber: 'bg-amber-500/80',
  emerald: 'bg-emerald-500/60',
  rose: 'bg-rose-500/70',
};

/**
 * Pixel-exact toggle switch.
 * Uses inline `left` style (not translate-x) so the thumb
 * never drifts outside the pill regardless of layout context.
 */
export function NeuralToggle({
  checked,
  onChange,
  disabled,
  color = 'indigo',
  size = 'md',
  label,
  className,
}: NeuralToggleProps) {
  const pillW = size === 'sm' ? 34 : 40;
  const pillH = size === 'sm' ? 18 : 22;
  const thumbSize = size === 'sm' ? 12 : 16;
  const gap = size === 'sm' ? 3 : 3;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? COLOR_MAP[color] : 'bg-white/15',
        className
      )}
      style={{ width: pillW, height: pillH }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-white shadow-sm transition-all duration-200"
        style={{
          width: thumbSize,
          height: thumbSize,
          top: gap,
          left: checked ? pillW - thumbSize - gap : gap,
        }}
      />
    </button>
  );
}
