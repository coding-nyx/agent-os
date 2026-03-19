import React, { useState, useMemo } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NeuralPicklistOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface NeuralPicklistProps {
  options: NeuralPicklistOption[];
  value: string[];
  onChange: (values: string[]) => void;
  maxSelections?: number;
  searchable?: boolean;
  className?: string;
}

export function NeuralPicklist({
  options,
  value,
  onChange,
  maxSelections,
  searchable = false,
  className,
}: NeuralPicklistProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q)
    );
  }, [options, query]);

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      if (maxSelections !== undefined && value.length >= maxSelections) return;
      onChange([...value, val]);
    }
  }

  return (
    <div className={cn('rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden', className)}>
      {searchable && (
        <div className="relative border-b border-white/5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>
      )}
      <div className="divide-y divide-white/5">
        {filtered.map((option) => {
          const selected = value.includes(option.value);
          const atMax = maxSelections !== undefined && value.length >= maxSelections && !selected;

          return (
            <button
              key={option.value}
              type="button"
              disabled={atMax}
              onClick={() => toggle(option.value)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150',
                selected ? 'bg-[var(--module-accent-faint)]' : 'hover:bg-white/[0.03]',
                atMax && 'opacity-40 cursor-not-allowed'
              )}
            >
              {option.icon && (
                <div className="shrink-0 text-white/40">{option.icon}</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white/90 truncate">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-white/40 mt-0.5 truncate">{option.description}</div>
                )}
              </div>
              <div
                className={cn(
                  'shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors duration-150',
                  selected
                    ? 'bg-[var(--module-accent)] border-[var(--module-accent)]'
                    : 'border-white/20 bg-transparent'
                )}
              >
                {selected && <Check className="w-3 h-3 text-white" />}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-white/30">No results</div>
        )}
      </div>
    </div>
  );
}
