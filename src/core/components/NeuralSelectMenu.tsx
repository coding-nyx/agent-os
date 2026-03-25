import React from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NeuralSelectMenuOption<T extends string | number = string> {
  label: string;
  value: T;
}

export interface NeuralSelectMenuProps<T extends string | number = string> {
  value: T;
  options: NeuralSelectMenuOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
  accentClassName?: string;
  placeholder?: string;
  minWidthClassName?: string;
  ariaLabel?: string;
}

// Radix UI forbids empty-string values on <Select.Item> because '' is reserved
// for clearing the selection. We map '' ↔ this sentinel internally.
const EMPTY_SENTINEL = '__NEURAL_SELECT_NONE__';
const toRadix = (v: string) => (v === '' ? EMPTY_SENTINEL : v);
const fromRadix = (v: string) => (v === EMPTY_SENTINEL ? '' : v);

export function NeuralSelectMenu<T extends string | number = string>({
  value,
  options,
  onChange,
  disabled = false,
  triggerClassName,
  contentClassName,
  itemClassName,
  accentClassName = 'text-violet-300',
  placeholder,
  minWidthClassName = 'min-w-[180px]',
  ariaLabel = 'Select',
}: NeuralSelectMenuProps<T>) {
  return (
    <Select.Root
      value={toRadix(String(value))}
      onValueChange={(next) => {
        const actual = fromRadix(next);
        const match = options.find((option) => String(option.value) === actual);
        onChange((match ? match.value : (actual as T)) as T);
      }}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn(
          minWidthClassName,
          'bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white/80 font-semibold',
          'flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/40',
          'transition-colors duration-200',
          'data-[placeholder]:text-white/40',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          triggerClassName
        )}
        aria-label={ariaLabel}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="w-3.5 h-3.5 text-white/40" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={cn(
            'overflow-hidden z-50',
            'bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl',
            'shadow-2xl shadow-black/50',
            contentClassName
          )}
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport className="p-2">
            {options.map((option) => (
              <Select.Item
                key={String(option.value)}
                value={toRadix(String(option.value))}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2.5 rounded-xl',
                  'text-[11px] text-white/80 cursor-pointer font-semibold',
                  'outline-none',
                  'hover:bg-white/10 hover:text-white',
                  'focus:bg-violet-500/20 focus:text-white',
                  'data-[state=checked]:bg-violet-500/30 data-[state=checked]:text-white',
                  'transition-colors',
                  itemClassName
                )}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator className="ml-auto">
                  <Check className={cn('w-3.5 h-3.5', accentClassName)} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
