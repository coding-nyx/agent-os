import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface NeuralDropdownItem {
  type?: 'item' | 'separator';
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}

interface NeuralDropdownProps {
  trigger: React.ReactNode;
  items: NeuralDropdownItem[];
  align?: 'start' | 'end';
  className?: string;
}

export function NeuralDropdown({ trigger, items, align = 'start', className }: NeuralDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <div onClick={() => setOpen((prev) => !prev)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] rounded-xl border border-white/10 bg-[#05050a]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] py-1 overflow-hidden',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <div key={i} className="my-1 border-t border-white/5" />;
            }
            return (
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150',
                  item.variant === 'danger'
                    ? 'text-rose-400 hover:bg-rose-500/10'
                    : 'text-white/80 hover:bg-[var(--module-accent-muted)] hover:text-white',
                  item.disabled && 'opacity-40 cursor-not-allowed'
                )}
              >
                {item.icon && (
                  <span className="shrink-0 text-current opacity-70">{item.icon}</span>
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
