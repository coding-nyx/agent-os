import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import type { AraRecord } from '@/lib/data-layer';
import type { ModuleId } from '@/lib/module-manifest';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { ModuleIcon } from '@/core/components/ModuleIcon';

interface ReminderItem {
  source: string;
  read: boolean;
  createdAt: string;
  data?: {
    title?: string;
    note?: string;
    deepLink?: { route: string; focusId?: string };
    moduleId?: string;
  };
}

type ReminderRecord = AraRecord<ReminderItem>;

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function RemindersCard({ moduleId }: { moduleId: ModuleId }) {
  const { inbox: items, performAction } = useNotifications();
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const source = item.source?.replace(/^cascade:/, '').toLowerCase();
      const moduleMatch =
        source === moduleId ||
        item.data?.moduleId?.toLowerCase() === moduleId ||
        item.data?.deepLink?.route === `/${moduleId}`;
      return moduleMatch && !item.read;
    });
  }, [items, moduleId]);

  const preview = filtered.slice(0, 2);
  if (preview.length === 0) return null;

  return (
    <section className="mx-4 mb-4 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">Reminders</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45 hover:text-white/70"
        >
          View
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {preview.map((item) => {
          const source = item.source?.replace(/^cascade:/, '').toLowerCase() || moduleId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.action) {
                  void performAction(item.action, item.id);
                } else {
                  navigate(
                    item.data?.deepLink?.route ?? '/notifications',
                    item.data?.deepLink?.focusId ? { state: { focusId: item.data.deepLink.focusId } } : undefined,
                  );
                }
              }}
              className="w-full flex items-start gap-3 rounded-xl border border-white/[0.12] bg-slate-900/70 px-3 py-2 text-left hover:bg-white/[0.06] transition-all hover:translate-y-[-1px] active:translate-y-0"
            >
              <ModuleIcon source={source} withBackground className="w-6 h-6 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-white/90">
                  {item.title || item.data?.title || 'Reminder'}
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">{timeAgo(item.createdAt)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
