import { useState } from 'react';
import { Bell } from 'lucide-react';
import { NeuralModal } from '@/core/components/NeuralModal';
import type { ModuleTheme } from '@/lib/module-manifest';

interface ModuleReminderEntryProps {
  title: string;
  subtitle?: string;
  panel: React.ReactNode;
  themeColor?: ModuleTheme;
  compact?: boolean;
  iconOnly?: boolean;
}

const MODAL_THEME: Record<ModuleTheme, 'indigo' | 'orange' | 'cyan' | 'emerald' | 'amber'> = {
  indigo: 'indigo',
  orange: 'orange',
  cyan: 'cyan',
  emerald: 'emerald',
  sky: 'cyan',
  lime: 'emerald',
  rose: 'amber',
  fuchsia: 'amber',
  slate: 'cyan',
  violet: 'indigo',
};

export function ModuleReminderEntry({
  title,
  subtitle = 'Configure reminder cadence and delivery',
  panel,
  themeColor = 'indigo',
  compact = false,
  iconOnly = false,
}: ModuleReminderEntryProps) {
  const [open, setOpen] = useState(false);
  const modalTheme = MODAL_THEME[themeColor];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title} reminders`}
        title={`${title} reminders`}
        className={
          iconOnly
            ? 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80'
            : compact
              ? 'h-8 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60 hover:text-white/80 hover:bg-white/[0.08] transition-colors'
              : 'h-9 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60 hover:text-white/80 hover:bg-white/[0.08] transition-colors'
        }
      >
        <Bell className={iconOnly ? 'h-4 w-4' : compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {!iconOnly && <span>Reminders</span>}
      </button>

      <NeuralModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`${title} Reminders`}
        subtitle={subtitle}
        icon={Bell}
        themeColor={modalTheme}
        maxWidth="2xl"
      >
        <div className="space-y-4">{panel}</div>
      </NeuralModal>
    </>
  );
}
