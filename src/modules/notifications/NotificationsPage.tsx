import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  ArrowLeft,
  Check,
  CheckCheck,
  Trash2,
  Zap,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
  Clock,
  Inbox,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { cn } from '@/lib/utils';
import type { NexusRecord } from '@/lib/data-layer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InboxItem {
  type: string;
  source: string;
  priority: 'info' | 'alert' | 'critical';
  data: {
    note?: string;
    title?: string;
    deepLink?: { route: string; focusId?: string };
    moduleId?: string;
    scheduleId?: string;
  };
  scheduleId?: string;
  occurrenceId?: string;
  read: boolean;
  createdAt: string;
}

type InboxRecord = NexusRecord<InboxItem>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function moduleColor(source: string): string {
  const map: Record<string, string> = {
    agnes: 'from-violet-500/20 to-purple-500/10 border-violet-500/20',
    titan: 'from-orange-500/20 to-amber-500/10 border-orange-500/20',
    ledger: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20',
    soma: 'from-rose-500/20 to-pink-500/10 border-rose-500/20',
    atlas: 'from-sky-500/20 to-cyan-500/10 border-sky-500/20',
    scout: 'from-lime-500/20 to-green-500/10 border-lime-500/20',
    forge: 'from-fuchsia-500/20 to-pink-500/10 border-fuchsia-500/20',
    bridge: 'from-indigo-500/20 to-blue-500/10 border-indigo-500/20',
    system: 'from-slate-500/20 to-zinc-500/10 border-slate-500/20',
  };
  return map[source.toLowerCase()] ?? 'from-white/5 to-white/[0.02] border-white/10';
}

function moduleDot(source: string): string {
  const map: Record<string, string> = {
    agnes: 'bg-violet-400',
    titan: 'bg-orange-400',
    ledger: 'bg-emerald-400',
    soma: 'bg-rose-400',
    atlas: 'bg-sky-400',
    scout: 'bg-lime-400',
    forge: 'bg-fuchsia-400',
    bridge: 'bg-indigo-400',
    system: 'bg-slate-400',
  };
  return map[source.toLowerCase()] ?? 'bg-white/40';
}

function priorityIcon(priority: InboxItem['priority']) {
  if (priority === 'critical') return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
  if (priority === 'alert') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
  return <Info className="w-3.5 h-3.5 text-white/30" />;
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyInbox() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center gap-5 py-24 px-8 text-center"
    >
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <Inbox className="w-8 h-8 text-white/20" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-indigo-400" />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-white/60 mb-1">All clear</p>
        <p className="text-xs text-white/30 leading-relaxed max-w-[220px]">
          No notifications yet. Reminders and system alerts will appear here.
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Individual notification card
// ---------------------------------------------------------------------------

function NotificationCard({
  item,
  index,
  onRead,
  onDelete,
  onNavigate,
}: {
  item: InboxRecord;
  index: number;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (item: InboxRecord) => void;
}) {
  const deepRoute = item.data?.deepLink?.route;
  const title = item.data?.title ?? formatEventType(item.type);
  const body = item.data?.note ?? '';
  const source = item.source?.replace(/^cascade:/, '') ?? 'system';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.96 }}
      transition={{
        layout: { type: 'spring', stiffness: 400, damping: 35 },
        default: { duration: 0.25, delay: index * 0.04 },
      }}
      className={cn(
        'group relative rounded-2xl bg-gradient-to-br border overflow-hidden',
        moduleColor(source),
        !item.read && 'ring-1 ring-white/[0.07]',
      )}
    >
      {/* Unread indicator bar */}
      <AnimatePresence>
        {!item.read && (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-indigo-400/60"
          />
        )}
      </AnimatePresence>

      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Source dot */}
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <div className={cn('w-2 h-2 rounded-full shrink-0', moduleDot(source))} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {priorityIcon(item.priority)}
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
              {source}
            </span>
            {!item.read && (
              <span className="ml-auto text-[9px] font-black uppercase tracking-[0.15em] text-indigo-400/80">
                NEW
              </span>
            )}
          </div>

          <p className={cn(
            'text-sm font-semibold leading-snug mb-1 break-words',
            item.read ? 'text-white/55' : 'text-white/90',
          )}>
            {title}
          </p>

          {body && (
            <p className="text-[11px] text-white/35 leading-relaxed line-clamp-2 break-words">
              {body}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-3 h-3 text-white/20 shrink-0" />
            <span className="text-[10px] text-white/25">{timeAgo(item.createdAt)}</span>

            {/* Action buttons — appear on hover */}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {!item.read && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRead(item.id); }}
                  className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                  aria-label="Mark as read"
                >
                  <Check className="w-3 h-3 text-white/50" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                className="w-7 h-7 rounded-xl bg-white/5 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
                aria-label="Delete notification"
              >
                <Trash2 className="w-3 h-3 text-white/40 group-hover:text-rose-400 transition-colors" />
              </button>
              {deepRoute && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onNavigate(item); }}
                  className="w-7 h-7 rounded-xl bg-white/5 hover:bg-indigo-500/20 flex items-center justify-center transition-colors"
                  aria-label="Go to module"
                >
                  <ChevronRight className="w-3 h-3 text-white/40 hover:text-indigo-400 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tap-to-navigate overlay (full card clickable) */}
      {deepRoute && (
        <button
          type="button"
          onClick={() => onNavigate(item)}
          className="absolute inset-0 opacity-0"
          aria-label={`Go to ${source}`}
          tabIndex={-1}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Filter pill
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200 border',
        active
          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
          : 'bg-white/[0.03] border-white/[0.06] text-white/35 hover:text-white/60 hover:bg-white/[0.06]',
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn(
          'rounded-md px-1.5 py-0.5 text-[9px] font-black',
          active ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/10 text-white/40',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'unread' | 'critical';

export default function NotificationsPage() {
  const { user, isGuest } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();

  const [items, setItems] = useState<InboxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');

  // Subscribe to notification_inbox collection
  useEffect(() => {
    if (!user || isGuest) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = dataLayer.subscribeToQuery<InboxItem>(
      {
        collection: `users/${user.uid}/notification_inbox`,
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 100,
      },
      (docs) => {
        setItems(docs);
        setLoading(false);
      },
    );

    return () => unsub?.();
  }, [dataLayer, isGuest, user]);

  const markRead = useCallback(async (id: string) => {
    if (!user) return;
    await dataLayer.setDocument(
      `users/${user.uid}/notification_inbox`,
      id,
      { read: true } as Partial<InboxItem>,
    );
  }, [dataLayer, user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unread = items.filter((i) => !i.read);
    await Promise.all(
      unread.map((i) =>
        dataLayer.setDocument(
          `users/${user.uid}/notification_inbox`,
          i.id,
          { read: true } as Partial<InboxItem>,
        ),
      ),
    );
  }, [dataLayer, items, user]);

  const deleteItem = useCallback(async (id: string) => {
    if (!user) return;
    await dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, id);
  }, [dataLayer, user]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await Promise.all(
      items.map((i) =>
        dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, i.id),
      ),
    );
  }, [dataLayer, items, user]);

  const navigateToItem = useCallback((item: InboxRecord) => {
    const route = item.data?.deepLink?.route;
    if (!item.read) markRead(item.id);
    if (route) navigate(route);
  }, [markRead, navigate]);

  // Derived counts
  const unreadCount = items.filter((i) => !i.read).length;
  const criticalCount = items.filter((i) => i.priority === 'critical').length;

  const filtered = items.filter((item) => {
    if (filter === 'unread') return !item.read;
    if (filter === 'critical') return item.priority === 'critical' || item.priority === 'alert';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#05050a] flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.05] bg-[#05050a]/90 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center transition-colors shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-[0.25em] text-indigo-400/70 font-black leading-none mb-0.5">
              System
            </p>
            <h1 className="text-base font-black italic uppercase tracking-tight text-white leading-none flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="text-[10px] font-black not-italic normal-case tracking-wide bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-full px-2 py-0.5">
                  {unreadCount} new
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] font-bold text-white/50 hover:text-white/80 transition-all"
              >
                <CheckCheck className="w-3 h-3" />
                <span className="hidden sm:inline">Read all</span>
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/20 flex items-center justify-center transition-colors"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-rose-400 transition-colors" />
              </button>
            )}
          </div>
        </div>

        {/* Filter pills */}
        {items.length > 0 && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex items-center gap-2">
            <FilterPill
              label="All"
              active={filter === 'all'}
              count={items.length}
              onClick={() => setFilter('all')}
            />
            <FilterPill
              label="Unread"
              active={filter === 'unread'}
              count={unreadCount}
              onClick={() => setFilter('unread')}
            />
            <FilterPill
              label="Alerts"
              active={filter === 'critical'}
              count={criticalCount}
              onClick={() => setFilter('critical')}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-2 mt-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-white/[0.025] border border-white/[0.04] animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          filter === 'all' ? (
            <EmptyInbox />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-20 text-center"
            >
              <BellOff className="w-7 h-7 text-white/15" />
              <p className="text-xs text-white/30">No {filter === 'unread' ? 'unread' : 'alert'} notifications</p>
            </motion.div>
          )
        ) : (
          <motion.div layout className="flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
              {filtered.map((item, i) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  index={i}
                  onRead={markRead}
                  onDelete={deleteItem}
                  onNavigate={navigateToItem}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Bottom status bar */}
      {!loading && items.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.04] px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <Bell className="w-3 h-3 text-white/20 shrink-0" />
            <p className="text-[10px] text-white/20">
              {items.length} notification{items.length !== 1 ? 's' : ''}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ' · all read'}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-indigo-400/40" />
              <span className="text-[9px] uppercase tracking-[0.15em] text-indigo-400/30 font-black">
                Nexus Inbox
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
