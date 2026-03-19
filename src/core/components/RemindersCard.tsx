import { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import type { NexusRecord } from '@/lib/data-layer';
import type { ModuleId } from '@/lib/module-manifest';

interface ReminderItem {
  source: string;
  read: boolean;
  createdAt: string;
  data?: {
    title?: string;
    note?: string;
    deepLink?: { route: string };
    moduleId?: string;
  };
}

type ReminderRecord = NexusRecord<ReminderItem>;

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
  const { user, isGuest } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReminderRecord[]>([]);

  useEffect(() => {
    if (!user || isGuest) {
      setItems([]);
      return;
    }
    const unsub = dataLayer.subscribeToQuery<ReminderItem>(
      {
        collection: `users/${user.uid}/notification_inbox`,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 100,
      },
      (docs) => setItems(docs)
    );
    return () => unsub?.();
  }, [dataLayer, isGuest, user]);

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
    <section className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-white/50" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Reminders</span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/notifications')}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45 hover:text-white/70"
        >
          View
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        {preview.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.data?.deepLink?.route ?? '/notifications')}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white/[0.04]"
          >
            <p className="truncate text-xs font-semibold text-white/80">
              {item.data?.title ?? 'Reminder'}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">{timeAgo(item.createdAt)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
