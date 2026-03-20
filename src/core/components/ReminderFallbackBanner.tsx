import { useEffect, useState } from 'react';
import { ReminderScheduler } from '@/lib/notifications/reminder-scheduler-service';
import { cn } from '@/lib/utils';

export function ReminderFallbackBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return ReminderScheduler.subscribeDebug(setActive);
  }, []);

  if (!import.meta.env.DEV || !active) return null;

  return (
    <div className={cn('fixed top-0 left-0 right-0 z-50 bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-center text-[10px] font-semibold text-amber-200')}>
      DEV: Reminder fallback active (local scheduler).
    </div>
  );
}
