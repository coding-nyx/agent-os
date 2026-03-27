import React from 'react';
import type { NotificationMessageTemplate } from '../types';
import { NeuralInput } from '@/core/components/NeuralInput';

export function TemplateEditor({
  value,
  onChange,
  disabled,
}: {
  value: NotificationMessageTemplate;
  onChange: (next: NotificationMessageTemplate) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <NeuralInput
        label="Title"
        disabled={disabled}
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        placeholder="Reminder title"
      />
      <div className="space-y-2 w-full">
        <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 ml-1">
          Body
        </label>
        <textarea
          disabled={disabled}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          placeholder="Reminder message body"
          className="w-full bg-slate-900/70 border border-white/[0.12] rounded-2xl min-h-[110px] p-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all duration-300 disabled:opacity-40"
        />
      </div>
    </div>
  );
}

