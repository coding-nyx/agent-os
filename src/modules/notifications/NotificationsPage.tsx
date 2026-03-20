import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Plus,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { NeuralButton } from '@/core/components/NeuralButton';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';
import { cn } from '@/lib/utils';
import type { NexusRecord } from '@/lib/data-layer';
import { AgnesNotificationSettingsPanel } from '@/modules/agnes/components/AgnesNotificationSettingsPanel';
import { TitanNotificationSettingsPanel } from '@/modules/titan/components/TitanNotificationSettingsPanel';
import { LedgerNotificationSettingsPanel } from '@/modules/ledger/components/LedgerNotificationSettingsPanel';
import { SomaNotificationSettingsPanel } from '@/modules/soma/components/SomaNotificationSettingsPanel';
import { AtlasNotificationSettingsPanel } from '@/modules/atlas/components/AtlasNotificationSettingsPanel';
import type { NotificationScheduleConfig, Recurrence } from '@/lib/notifications/types';
import { useNotifications, type InboxRecord } from '@/lib/notifications/NotificationContext';
import { type ModuleId } from '@/lib/module-manifest';
import { ModuleIcon, moduleTextColor } from '@/core/components/ModuleIcon';
import { getFirebase } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

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

function priorityIcon(priority: InboxRecord['priority']) {
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

function recurrenceSummary(r: Recurrence): string {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (r.kind) {
    case 'once':
      return `Once at ${new Date(r.dueAt).toLocaleString()}`;
    case 'every_n_days':
      return r.intervalDays === 1 ? 'Every day' : `Every ${r.intervalDays} days`;
    case 'hourly':
      return r.intervalHours === 1 ? 'Every hour' : `Every ${r.intervalHours} hours`;
    case 'weekly_by_days': {
      const days = r.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ');
      return `${days} at ${r.timeOfDay}`;
    }
    case 'daily_window':
      return `Daily ${r.windowStart}–${r.windowEnd}`;
    default:
      return 'Custom schedule';
  }
}

// ---------------------------------------------------------------------------
// Components
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
    <NeuralButton
      variant="ghost"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 !px-3 !h-8 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200 border',
        active
          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
          : 'bg-white/[0.03] border-white/[0.06] text-white/35 hover:text-white/60 hover:bg-white/[0.06] hover:border-white/10',
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
    </NeuralButton>
  );
}

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
  const title = item.title || formatEventType(item.type);
  const body = item.note || '';
  const source = item.source?.replace(/^cascade:/, '') ?? 'system';
  const hasAction = !!item.action || !!item.data?.deepLink?.route;

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
        <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
          <ModuleIcon source={source} withBackground className="w-6 h-6" />
        </div>

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

            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {!item.read && (
                <NeuralButton
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); onRead(item.id); }}
                  className="w-7 h-7 !px-0 rounded-xl bg-white/5 hover:bg-white/10"
                  aria-label="Mark as read"
                >
                  <Check className="w-3 h-3 text-white/50" />
                </NeuralButton>
              )}
              <NeuralButton
                variant="ghost"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                className="w-7 h-7 !px-0 rounded-xl bg-white/5 hover:bg-rose-500/20"
                aria-label="Delete notification"
              >
                <Trash2 className="w-3 h-3 text-white/40 group-hover:text-rose-400 transition-colors" />
              </NeuralButton>
              {hasAction && (
                <NeuralButton
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); onNavigate(item); }}
                  className="w-7 h-7 !px-0 rounded-xl bg-white/5 hover:bg-indigo-500/20"
                  aria-label="Perform action"
                >
                  <ChevronRight className="w-3 h-3 text-white/40 hover:text-indigo-400 transition-colors" />
                </NeuralButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {hasAction && (
        <NeuralButton
          variant="ghost"
          onClick={() => onNavigate(item)}
          className="absolute inset-0 opacity-0 !px-0 !h-auto border-none hover:bg-transparent"
          aria-label="Open"
          tabIndex={-1}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FilterMode = 'all' | 'unread' | 'critical';
type ViewMode = 'notifications' | 'reminders';

export default function NotificationsPage() {
  const { user, isGuest } = useAuth();
  const dataLayer = useDataLayer();
  const navigate = useNavigate();
  const { 
    inbox: items, 
    unreadCount, 
    loading: inboxLoading, 
    markAsRead, 
    markAllAsRead, 
    performAction 
  } = useNotifications();

  const [schedules, setSchedules] = useState<NexusRecord<NotificationScheduleConfig>[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('notifications');
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false));
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<{ id: string; title: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user || isGuest) {
      setSchedules([]);
      setSchedulesLoading(false);
      return;
    }
    setSchedulesLoading(true);
    const unsub = dataLayer.subscribeToQuery<NotificationScheduleConfig>(
      {
        collection: `users/${user.uid}/notification_schedules`,
        orderBy: [{ field: 'updatedAt', direction: 'desc' }],
        limit: 200,
      },
      (docs) => {
        setSchedules(docs);
        setSchedulesLoading(false);
      },
    );
    return () => unsub?.();
  }, [dataLayer, isGuest, user]);

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

  const deleteSchedule = useCallback(async (id: string) => {
    if (!user) return;
    await dataLayer.deleteDocument(`users/${user.uid}/notification_schedules`, id);
  }, [dataLayer, user]);

  const toggleSchedule = useCallback(async (id: string, enabled: boolean) => {
    if (!user) return;
    await dataLayer.updateDocument(`users/${user.uid}/notification_schedules`, id, { 
      enabled, 
      updatedAt: new Date().toISOString() 
    });

    if (enabled) {
      try {
        const { app } = getFirebase();
        if (app) {
          const functions = getFunctions(app);
          const scheduleReminder = httpsCallable<{ scheduleId: string }, unknown>(functions, 'scheduleReminder');
          await scheduleReminder({ scheduleId: id });
        }
      } catch (err) {
        console.warn('[NotificationsPage] scheduleReminder failed:', err);
      }
    }
  }, [dataLayer, user]);

  const navigateToItem = useCallback((item: InboxRecord) => {
    if (item.action) {
      void performAction(item.action, item.id);
    } else {
      const route = item.data?.deepLink?.route;
      const focusId = item.data?.deepLink?.focusId;
      if (!item.read) markAsRead(item.id);
      if (route) navigate(route, focusId ? { state: { focusId } } : undefined);
    }
  }, [markAsRead, performAction, navigate]);

  const criticalCount = items.filter((i) => i.priority === 'critical' || i.priority === 'alert').length;

  const filtered = items.filter((item) => {
    if (filter === 'unread') return !item.read;
    if (filter === 'critical') return item.priority === 'critical' || item.priority === 'alert';
    return true;
  });

  const loading = inboxLoading;

  return (
    <div className="min-h-screen bg-[#05050a] flex flex-col">
      <div className="shrink-0 border-b border-white/[0.05] bg-[#05050a]/90 backdrop-blur-xl sticky top-0 z-[var(--z-content)]">
        <div className={cn('mx-auto px-4 py-4 flex items-center gap-3', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
          <NeuralButton
            variant="ghost"
            onClick={() => navigate(-1)}
            className="w-9 h-9 !px-0 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06]"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </NeuralButton>

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
              <NeuralButton
                variant="secondary"
                size="sm"
                onClick={markAllAsRead}
                className="flex items-center gap-1.5 !px-3 !h-9 rounded-xl text-[11px] font-bold text-white/50 hover:text-white/80 transition-all"
              >
                <CheckCheck className="w-3 h-3" />
                <span className="hidden sm:inline">Read all</span>
              </NeuralButton>
            )}
            {items.length > 0 && (
              <NeuralButton
                variant="ghost"
                onClick={clearAll}
                className="w-9 h-9 !px-0 rounded-xl bg-white/[0.04] hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/20"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-3.5 h-3.5 text-white/40 hover:text-rose-400 transition-colors" />
              </NeuralButton>
            )}
          </div>
        </div>

        {!isWide && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex items-center gap-2">
            <FilterPill
              label="Inbox"
              active={viewMode === 'notifications'}
              onClick={() => setViewMode('notifications')}
            />
            <FilterPill
              label="Reminders"
              active={viewMode === 'reminders'}
              onClick={() => setViewMode('reminders')}
            />
          </div>
        )}

        {(isWide || viewMode === 'notifications') && items.length > 0 && (
          <div className={cn('mx-auto px-4 pb-3 flex items-center gap-2', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
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

      <div className={cn('flex-1 mx-auto w-full px-4 py-4', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
        <div className={cn(isWide ? 'grid grid-cols-[minmax(0,1fr)_360px] gap-4' : 'space-y-4')}>
          {(isWide || viewMode === 'notifications') && (
            <div className="min-w-0">
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
                        onRead={markAsRead}
                        onDelete={deleteItem}
                        onNavigate={navigateToItem}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {(isWide || viewMode === 'reminders') && !isGuest && (
            <div className={cn('space-y-4', isWide ? 'max-h-[calc(100vh-170px)] overflow-y-auto pr-1 no-scrollbar' : '')}>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-semibold">
                      All Reminders
                    </p>
                    <NeuralButton 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsCreateModalOpen(true)}
                      className="h-6 w-6 !px-0 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </NeuralButton>
                  </div>
                  <span className="text-[10px] text-white/30">
                    {schedules.length} total
                  </span>
                </div>
                {schedules.length === 0 ? (
                  <p className="text-xs text-white/30">No reminder schedules yet.</p>
                ) : (
                  <div className="space-y-2">
                    {schedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 transition-all hover:border-white/10"
                      >
                        <ModuleIcon source={s.moduleId} withBackground className="w-6 h-6 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={cn("text-xs font-semibold truncate", s.enabled ? "text-white/80" : "text-white/30")}>
                              {s.messageTemplate?.title || 'Reminder'}
                            </p>
                            <span className={cn(
                              "text-[8px] font-black uppercase px-1 rounded-sm border",
                              s.createdBy === 'agent' 
                                ? "border-violet-500/30 text-violet-400 bg-violet-500/10" 
                                : "border-white/10 text-white/30 bg-white/5"
                            )}>
                              {s.createdBy === 'agent' ? 'Nexus' : 'User'}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/40">
                            {s.moduleId} · {recurrenceSummary(s.recurrence)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <NeuralToggle
                            checked={s.enabled}
                            onChange={(checked) => toggleSchedule(s.id, checked)}
                            size="sm"
                            color="emerald"
                          />
                          <NeuralButton
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteScheduleTarget({ id: s.id, title: s.messageTemplate?.title || 'Reminder' })}
                            className="h-7 w-7 p-0 text-white/20 hover:text-rose-400"
                            aria-label={`Delete reminder ${s.messageTemplate?.title || 'Reminder'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </NeuralButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/50 font-semibold">
                    Reminder Presets
                  </p>
                </div>
                <div className={cn('grid gap-3', isWide ? 'grid-cols-1' : 'md:grid-cols-2')}>
                  <AgnesNotificationSettingsPanel />
                  <TitanNotificationSettingsPanel />
                  <LedgerNotificationSettingsPanel />
                  <SomaNotificationSettingsPanel />
                  <AtlasNotificationSettingsPanel />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.04] px-4 py-3">
          <div className={cn('mx-auto flex items-center gap-2', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
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

      <QuickReminderModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        moduleId="nexus"
      />

      <ConfirmDialog
        isOpen={!!deleteScheduleTarget}
        onClose={() => setDeleteScheduleTarget(null)}
        onConfirm={() => {
          if (deleteScheduleTarget) {
            void deleteSchedule(deleteScheduleTarget.id);
          }
          setDeleteScheduleTarget(null);
        }}
        title={`Delete "${deleteScheduleTarget?.title}"?`}
        description="This reminder will be removed and no longer fire."
        variant="danger"
        confirmLabel="Delete"
      />
    </div>
  );
}
