import React, { lazy, Suspense, useEffect, useState, useCallback, useMemo } from 'react';
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
  Moon,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { NeuralButton } from '@/core/components/NeuralButton';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';
import { cn } from '@/lib/utils';
import type { NexusRecord } from '@/lib/data-layer';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';
import { buildAllPresets } from '@/lib/notifications/preset-registry';
import { recurrenceSummary } from '@/lib/notifications/recurrence-summary';
import { BridgeService } from '@/lib/services/bridge-service';
import { queueScheduleReminder } from '@/lib/notifications/schedule-dispatch-service';
import { useNotifications, type InboxRecord } from '@/lib/notifications/NotificationContext';
import { type ModuleId } from '@/lib/module-manifest';
import { ModuleIcon, moduleTextColor } from '@/core/components/ModuleIcon';
import { ReminderOutcomeService } from '@/lib/notifications/reminder-outcome-service';
import { ReminderLifecycleService } from '@/lib/notifications/reminder-lifecycle-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NOTIFICATIONS_PERSONA } from './personas';
import { serializeNotificationContext, NOTIFICATION_SCOPE_ACTIONS } from './prompts/notification-prompt-builder';
import {
  buildNotificationSummary,
  isSnoozed,
  snoozeCountdown,
  computeSnoozedUntil,
  SNOOZE_OPTIONS,
  suggestSnooze,
  QuietHoursConfig,
  createDefaultQuietHours,
  isInQuietHours,
  groupByDate,
} from './services/notification-service';

const NexusChat = lazy(async () => {
  const mod = await import('@/core/components/NexusChat');
  return { default: mod.NexusChat };
});

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
        'flex items-center gap-1.5 !px-3 !h-9 min-h-[44px] sm:min-h-0 sm:!h-9 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] transition-all duration-200 border',
        active
          ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
          : 'bg-white/[0.045] border-white/[0.09] text-white/50 hover:text-white/70 hover:bg-white/[0.07] hover:border-white/[0.12]',
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn(
          'rounded-md px-1.5 py-0.5 text-[11px] font-black',
          active ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/10 text-white/50',
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
        <div className="w-20 h-20 rounded-3xl bg-white/[0.045] border border-white/[0.09] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
          <Inbox className="w-8 h-8 text-white/35" />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-indigo-400" />
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-white/68 mb-1">All clear</p>
        <p className="text-sm text-white/50 leading-relaxed max-w-[220px]">
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
  const typeLabel = item.type ? formatEventType(item.type) : null;
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
      onClick={hasAction ? () => onNavigate(item) : undefined}
      className={cn(
        'relative rounded-2xl bg-gradient-to-br border overflow-hidden',
        moduleColor(source),
        !item.read && 'ring-1 ring-white/[0.07]',
        hasAction && 'cursor-pointer active:scale-[0.99] transition-transform duration-100',
      )}
    >
      {!item.read && (
        <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-indigo-400 pointer-events-none" />
      )}

      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <ModuleIcon source={source} withBackground className="w-5 h-5 shrink-0" />
          {priorityIcon(item.priority)}
          <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white/50">
            {source}
          </span>
          {typeLabel && (
            <span className="text-[11px] text-white/40 truncate">· {typeLabel}</span>
          )}
        </div>

        <p className={cn(
          'text-sm font-semibold leading-snug mb-1 break-words pr-5',
          item.read ? 'text-white/55' : 'text-white/90',
        )}>
          {title}
        </p>

        {body && (
          <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2 break-words">
            {body}
          </p>
        )}
      </div>

      {/* Footer — always visible, stops card-click propagation */}
      <div
        className="flex items-center gap-1.5 px-3 pb-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <Clock className="w-3 h-3 text-white/35 shrink-0" />
        <span className="text-[11px] text-white/40 flex-1">{timeAgo(item.createdAt)}</span>

        {!item.read && (
          <NeuralButton
            variant="ghost"
            onClick={() => onRead(item.id)}
            className="h-7 w-7 !px-0 rounded-xl bg-white/[0.045] hover:bg-white/10"
            aria-label="Mark as read"
          >
            <Check className="w-3 h-3 text-white/50" />
          </NeuralButton>
        )}
        <NeuralButton
          variant="ghost"
          onClick={() => onDelete(item.id)}
          className="h-7 w-7 !px-0 rounded-xl bg-white/[0.045] hover:bg-rose-500/20"
          aria-label="Delete notification"
        >
          <Trash2 className="w-3 h-3 text-white/40 hover:text-rose-400 transition-colors" />
        </NeuralButton>
        {hasAction && (
          <NeuralButton
            variant="ghost"
            onClick={() => onNavigate(item)}
            className="h-7 !px-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1"
            aria-label="Open"
          >
            Open <ChevronRight className="w-3 h-3" />
          </NeuralButton>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SnoozeButton — inline snooze dropdown per notification
// ---------------------------------------------------------------------------

function SnoozeButton({
  item,
  snoozedUntil,
  onSnooze,
  onUnsnooze,
}: {
  item: InboxRecord;
  snoozedUntil?: string;
  onSnooze: (id: string, until: string) => void;
  onUnsnooze: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const suggestion = useMemo(() => suggestSnooze(item), [item]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const snoozed = isSnoozed(snoozedUntil);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => snoozed ? onUnsnooze(item.id) : setOpen(v => !v)}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-lg border transition-all',
          snoozed
            ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
            : 'bg-white/[0.045] border-white/[0.09] text-white/50 hover:text-white/70 hover:bg-white/[0.08]'
        )}
        title={snoozed ? `Snoozed (${snoozeCountdown(snoozedUntil!)}) — click to unsnooze` : 'Snooze'}
      >
        {snoozed ? <Moon className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 z-50 w-52 bg-[#0e0e16] border border-white/10 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/[0.09]">
              <p className="text-[11px] uppercase tracking-widest text-indigo-400/70 font-black mb-1">Suggested</p>
              <button
                onClick={() => { onSnooze(item.id, computeSnoozedUntil(suggestion.option)); setOpen(false); }}
                className="w-full text-left flex items-center justify-between group"
              >
                <span className="text-sm font-medium text-white/70 group-hover:text-white">{suggestion.option.label}</span>
                <span className="text-[11px] text-white/50 italic max-w-[100px] text-right leading-tight">{suggestion.reason}</span>
              </button>
            </div>
            {SNOOZE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onSnooze(item.id, computeSnoozedUntil(opt)); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-2 min-h-[44px]"
              >
                <Clock className="w-3 h-3 shrink-0" />
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const [filter, setFilter] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('notifications');
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false));
  const [deleteScheduleTarget, setDeleteScheduleTarget] = useState<{ id: string; title: string } | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ── New state: bulk selection, snooze, quiet hours, AI ──────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [snoozedMap, setSnoozedMap] = useState<Record<string, string>>({}); // id → snoozedUntil ISO
  const [quietHours, setQuietHours] = useState<QuietHoursConfig>(createDefaultQuietHours());
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user || isGuest) {
      setSchedules([]);
            return;
    }
    const unsub = dataLayer.subscribeToQuery<NotificationScheduleConfig>(
      {
        collection: `users/${user.uid}/notification_schedules`,
        orderBy: [{ field: 'updatedAt', direction: 'desc' }],
        limit: 200,
      },
      (docs) => {
        setSchedules(docs);
              },
    );
    return () => unsub?.();
  }, [dataLayer, isGuest, user]);

  const deleteItem = useCallback(async (id: string) => {
    if (!user) return;
    const record = items.find((item) => item.id === id);
    if (record) {
      await ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped');
    }
    await dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, id);
  }, [dataLayer, items, user]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await Promise.all(
      items.map((item) => ReminderOutcomeService.recordOutcome(dataLayer, user.uid, item, 'skipped')),
    );
    await Promise.all(
      items.map((i) =>
        dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, i.id),
      ),
    );
  }, [dataLayer, items, user]);

  const deleteSchedule = useCallback(async (id: string) => {
    if (!user) return;
    const schedule = schedules.find((entry) => entry.id === id);
    if (schedule?.enabled) {
      await ReminderLifecycleService.cancel(user.uid, id);
    }
    await dataLayer.deleteDocument(`users/${user.uid}/notification_schedules`, id);
  }, [dataLayer, schedules, user]);

  const toggleSchedule = useCallback(async (id: string, enabled: boolean) => {
    if (!user) return;

    if (!enabled) {
      await ReminderLifecycleService.cancel(user.uid, id);
      return;
    }

    await dataLayer.updateDocument(`users/${user.uid}/notification_schedules`, id, { 
      enabled, 
      updatedAt: new Date().toISOString() 
    });

    if (enabled) {
      try {
        await queueScheduleReminder(id);
      } catch (err) {
        console.warn('[NotificationsPage] scheduleReminder failed:', err);
      }
    }
  }, [dataLayer, user]);

  // ── Preset state ──────────────────────────────────────────────────────────
  const allPresets = useMemo(() => buildAllPresets(), []);
  const PRESET_IDS = useMemo(() => new Set(allPresets.map((p) => p.scheduleId)), [allPresets]);

  const scheduleMap = useMemo(() => {
    const m = new Map<string, NexusRecord<NotificationScheduleConfig>>();
    for (const s of schedules) m.set(s.id, s);
    return m;
  }, [schedules]);

  const mergedPresets = useMemo(() =>
    allPresets.map((p) => ({
      scheduleId: p.scheduleId,
      config: (scheduleMap.get(p.scheduleId) ?? p.config) as NotificationScheduleConfig,
      moduleId: p.config.moduleId,
    })), [allPresets, scheduleMap]
  );

  const agentSchedules = useMemo(() =>
    schedules.filter((s) => s.createdBy === 'agent' && !PRESET_IDS.has(s.id)),
    [schedules, PRESET_IDS]
  );

  const userSchedules = useMemo(() =>
    schedules.filter((s) => s.createdBy !== 'agent' && !PRESET_IDS.has(s.id)),
    [schedules, PRESET_IDS]
  );

  const savePreset = useCallback(async (scheduleId: string, next: NotificationScheduleConfig) => {
    if (!user || isGuest) return;
    const existing = scheduleMap.get(scheduleId);
    const wasEnabled = existing?.enabled ?? false;
    const isNewlyEnabled = next.enabled && !wasEnabled;

    await dataLayer.setDocument<NotificationScheduleConfig>(
      `users/${user.uid}/notification_schedules`,
      scheduleId,
      next,
    );

    if (isNewlyEnabled && 'Notification' in window && Notification.permission !== 'granted') {
      await BridgeService.requestPermissionAndInit();
    }
    if (isNewlyEnabled) {
      try {
        await queueScheduleReminder(scheduleId);
      } catch (err) {
        console.warn('[NotificationsPage] scheduleReminder preset failed:', err);
      }
    }
  }, [dataLayer, isGuest, scheduleMap, user]);

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
    if (isSnoozed(snoozedMap[item.id])) return false;
    if (filter === 'unread') return !item.read;
    if (filter === 'critical') return item.priority === 'critical' || item.priority === 'alert';
    return true;
  });

  // ── Bulk action handlers ─────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map(i => i.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const markReadSelected = useCallback(async () => {
    await Promise.all(Array.from(selectedIds).map(id => markAsRead(id)));
    setSelectedIds(new Set());
  }, [selectedIds, markAsRead]);

  const deleteSelected = useCallback(async () => {
    if (!user) return;
    const selectedRecords = Array.from(selectedIds)
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is InboxRecord => Boolean(item));

    await Promise.all(
      selectedRecords.map((record) =>
        ReminderOutcomeService.recordOutcome(dataLayer, user.uid, record, 'skipped'),
      ),
    );

    await Promise.all(
      Array.from(selectedIds).map(id =>
        dataLayer.deleteDocument(`users/${user.uid}/notification_inbox`, id)
      )
    );
    setSelectedIds(new Set());
  }, [dataLayer, items, selectedIds, user]);

  // ── Snooze handlers ──────────────────────────────────────────────────────
  const handleSnooze = useCallback((id: string, snoozedUntil: string) => {
    setSnoozedMap(prev => ({ ...prev, [id]: snoozedUntil }));
  }, []);

  const handleUnsnooze = useCallback((id: string) => {
    setSnoozedMap(prev => { const next = { ...prev }; delete next[id]; return next; });
  }, []);

  const filtered2 = filtered;

  const loading = inboxLoading;

  return (
    <div className="min-h-screen bg-[#05050a] flex flex-col">
      <div className="shrink-0 border-b border-white/[0.09] bg-[#05050a]/90 backdrop-blur-xl sticky top-0 z-[var(--z-content)]">
        <div className={cn('mx-auto px-4 py-4 flex items-center gap-3', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
          <NeuralButton
            variant="ghost"
            onClick={() => navigate(-1)}
            className="w-11 h-11 !px-0 rounded-xl bg-white/[0.045] hover:bg-white/[0.08] border border-white/[0.09]"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </NeuralButton>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.25em] text-indigo-400/70 font-black leading-none mb-0.5">
              System
            </p>
            <h1 className="text-base font-black italic uppercase tracking-tight text-white leading-none flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="text-[11px] font-black not-italic normal-case tracking-wide bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-full px-2 py-0.5">
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
            <NeuralButton
              variant="ghost"
              onClick={() => setShowAI(v => !v)}
              className={cn(
                'w-11 h-11 !px-0 rounded-xl border transition-all',
                showAI
                  ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                  : 'bg-white/[0.045] border-white/[0.09] text-white/50 hover:text-white/70'
              )}
              aria-label="AI triage assistant"
            >
              <Bot className="w-3.5 h-3.5" />
            </NeuralButton>
            {items.length > 0 && (
              <NeuralButton
                variant="ghost"
                onClick={() => setConfirmClearAll(true)}
                className="w-11 h-11 !px-0 rounded-xl bg-white/[0.045] hover:bg-rose-500/10 border border-white/[0.09] hover:border-rose-500/20"
                aria-label="Clear all notifications"
              >
                <Trash2 className="w-3.5 h-3.5 text-white/50 hover:text-rose-400 transition-colors" />
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

        {/* AI Chat Panel */}
        <AnimatePresence>
          {showAI && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 400 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-indigo-500/5 mb-4"
            >
              <Suspense fallback={<div className="h-full min-h-[240px] animate-pulse bg-white/[0.045]" />}>
                <NotificationAIPanel items={items} quietHoursEnabled={quietHours.enabled} />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-xl"
            >
              <span className="text-sm text-white/68 font-medium flex-1">
                {selectedIds.size} selected
              </span>
              <NeuralButton variant="ghost" size="sm" onClick={selectAll} className="text-[11px] text-white/50 hover:text-white/70">
                All {filtered.length}
              </NeuralButton>
              <NeuralButton variant="ghost" size="sm" onClick={clearSelection} className="text-[11px] text-white/50 hover:text-white/70">
                Clear
              </NeuralButton>
              <NeuralButton
                variant="secondary"
                size="sm"
                onClick={() => void markReadSelected()}
                className="flex items-center gap-1.5 text-cyan-400 border-cyan-500/20 bg-cyan-500/10"
              >
                <CheckCheck className="w-3 h-3" />
                Mark read
              </NeuralButton>
              <NeuralButton
                variant="ghost"
                size="sm"
                onClick={() => void deleteSelected()}
                className="flex items-center gap-1.5 text-rose-400 border-rose-500/20 bg-rose-500/10"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </NeuralButton>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={cn(isWide ? 'grid grid-cols-[minmax(0,1fr)_360px] gap-4' : 'space-y-4')}>
          {(isWide || viewMode === 'notifications') && (
            <div className="min-w-0">
              {loading ? (
                <div className="flex flex-col gap-2 mt-2">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="h-20 rounded-2xl bg-white/[0.025] border border-white/[0.09] animate-pulse"
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
                    <BellOff className="w-7 h-7 text-white/30" />
                    <p className="text-sm text-white/50">No {filter === 'unread' ? 'unread' : 'alert'} notifications</p>
                  </motion.div>
                )
              ) : (
                <motion.div layout className="flex flex-col gap-2">
                  <AnimatePresence mode="popLayout">
                    {filtered.map((item, i) => (
                      <div key={item.id} className="flex items-start gap-2">
                        {/* Checkbox for bulk selection */}
                        <button
                          onClick={() => toggleSelect(item.id)}
                          className={cn(
                            'mt-3.5 shrink-0 w-4 h-4 rounded border transition-colors',
                            selectedIds.has(item.id)
                              ? 'bg-indigo-500 border-indigo-500'
                              : 'bg-white/[0.045] border-white/20 hover:border-white/40'
                          )}
                          aria-label={selectedIds.has(item.id) ? 'Deselect' : 'Select'}
                        >
                          {selectedIds.has(item.id) && <Check className="w-3 h-3 text-white mx-auto" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <NotificationCard
                            item={item}
                            index={i}
                            onRead={markAsRead}
                            onDelete={deleteItem}
                            onNavigate={navigateToItem}
                          />
                        </div>

                        {/* Snooze button */}
                        <div className="relative shrink-0 mt-2">
                          <SnoozeButton
                            item={item}
                            snoozedUntil={snoozedMap[item.id]}
                            onSnooze={handleSnooze}
                            onUnsnooze={handleUnsnooze}
                          />
                        </div>
                      </div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {(isWide || viewMode === 'reminders') && !isGuest && (
            <div className={cn('space-y-3', isWide ? 'max-h-[calc(100dvh-170px)] overflow-y-auto pr-1 no-scrollbar' : '')}>

              {/* Quiet Hours / DND */}
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center gap-2 mb-3">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/68 font-semibold flex-1">
                    Quiet Hours / DND
                  </p>
                  <NeuralToggle
                    checked={quietHours.enabled}
                    onChange={(enabled) => setQuietHours(q => ({ ...q, enabled, updatedAt: new Date().toISOString() }))}
                    size="sm"
                    color="indigo"
                  />
                </div>
                {quietHours.enabled ? (
                  <div className="space-y-3">
                    {isInQuietHours(quietHours) && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                        <Moon className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="text-sm text-amber-300">DND active right now</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-white/50 mb-1">From</label>
                        <input
                          type="time"
                          value={quietHours.from}
                          onChange={e => setQuietHours(q => ({ ...q, from: e.target.value, updatedAt: new Date().toISOString() }))}
                          className="w-full bg-white/[0.045] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white/70 focus:outline-none focus:border-indigo-500/40 min-h-[44px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-white/50 mb-1">To</label>
                        <input
                          type="time"
                          value={quietHours.to}
                          onChange={e => setQuietHours(q => ({ ...q, to: e.target.value, updatedAt: new Date().toISOString() }))}
                          className="w-full bg-white/[0.045] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white/70 focus:outline-none focus:border-indigo-500/40 min-h-[44px]"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/50 mb-1.5">Exempt modules (always delivered)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(['agnes', 'atlas', 'titan', 'soma', 'ledger', 'scout', 'forge'] as const).map(mod => {
                          const isExempt = quietHours.exemptModules.includes(mod);
                          return (
                            <button
                              key={mod}
                              onClick={() => setQuietHours(q => ({
                                ...q,
                                exemptModules: isExempt
                                  ? q.exemptModules.filter(m => m !== mod)
                                  : [...q.exemptModules, mod],
                                updatedAt: new Date().toISOString(),
                              }))}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border transition-all min-h-[36px]',
                                isExempt
                                  ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                                  : 'bg-white/[0.045] border-white/[0.09] text-white/50 hover:text-white/68'
                              )}
                            >
                              {mod}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/50">Enable to suppress non-critical notifications during set hours.</p>
                )}
              </div>

              {/* Presets */}
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/68 font-semibold mb-3">
                  Presets
                </p>
                <div className="space-y-1.5">
                  {mergedPresets.map((p) => (
                    <div
                      key={p.scheduleId}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2.5 transition-all hover:border-white/[0.12]"
                    >
                      <ModuleIcon source={p.moduleId} withBackground className="w-5 h-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm font-semibold truncate leading-none mb-0.5', p.config.enabled ? 'text-white/80' : 'text-white/50')}>
                          {p.config.messageTemplate.title}
                        </p>
                        <p className="text-[11px] text-white/50">
                          {recurrenceSummary(p.config.recurrence)}
                        </p>
                      </div>
                      <span className={cn('text-[11px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0', moduleTextColor(p.moduleId), 'bg-white/[0.045]')}>
                        {p.moduleId}
                      </span>
                      <NeuralToggle
                        checked={p.config.enabled}
                        onChange={(checked) => {
                          void savePreset(p.scheduleId, { ...p.config, enabled: checked, updatedAt: new Date().toISOString() });
                        }}
                        size="sm"
                        color="emerald"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Nexus Reminders */}
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/68 font-semibold">
                    Nexus Reminders
                  </p>
                  {agentSchedules.length > 0 && (
                    <span className="text-[11px] text-white/50">{agentSchedules.length}</span>
                  )}
                </div>
                {agentSchedules.length === 0 ? (
                  <p className="text-sm text-white/50">No agent-created reminders yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {agentSchedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2.5 transition-all hover:border-white/[0.12]"
                      >
                        <ModuleIcon source={s.moduleId} withBackground className="w-5 h-5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-semibold truncate leading-none mb-0.5', s.enabled ? 'text-white/80' : 'text-white/50')}>
                            {s.messageTemplate?.title || 'Reminder'}
                          </p>
                          <p className="text-[11px] text-white/50">
                            {recurrenceSummary(s.recurrence)}
                          </p>
                        </div>
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
                          className="h-7 w-7 p-0 text-white/40 hover:text-rose-400"
                          aria-label={`Delete reminder ${s.messageTemplate?.title || 'Reminder'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </NeuralButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Your Reminders */}
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/68 font-semibold">
                      Your Reminders
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
                  {userSchedules.length > 0 && (
                    <span className="text-[11px] text-white/50">{userSchedules.length}</span>
                  )}
                </div>
                {userSchedules.length === 0 ? (
                  <p className="text-sm text-white/50">No custom reminders yet. Use + to create one.</p>
                ) : (
                  <div className="space-y-1.5">
                    {userSchedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2.5 transition-all hover:border-white/[0.12]"
                      >
                        <ModuleIcon source={s.moduleId} withBackground className="w-5 h-5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm font-semibold truncate leading-none mb-0.5', s.enabled ? 'text-white/80' : 'text-white/50')}>
                            {s.messageTemplate?.title || 'Reminder'}
                          </p>
                          <p className="text-[11px] text-white/50">
                            {recurrenceSummary(s.recurrence)}
                          </p>
                        </div>
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
                          className="h-7 w-7 p-0 text-white/40 hover:text-rose-400"
                          aria-label={`Delete reminder ${s.messageTemplate?.title || 'Reminder'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </NeuralButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.09] px-4 py-3">
          <div className={cn('mx-auto flex items-center gap-2', isWide ? 'max-w-5xl' : 'max-w-2xl')}>
            <Bell className="w-3 h-3 text-white/35 shrink-0" />
            <p className="text-[11px] text-white/40">
              {items.length} notification{items.length !== 1 ? 's' : ''}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ' · all read'}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-indigo-400/50" />
              <span className="text-[11px] uppercase tracking-[0.15em] text-indigo-400/50 font-black">
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

      <ConfirmDialog
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={() => { void clearAll(); setConfirmClearAll(false); }}
        title="Clear all notifications?"
        description="This will permanently delete all notifications in your inbox."
        variant="danger"
        confirmLabel="Clear All"
      />
    </div>
  );
}

function NotificationAIPanel({
  items,
  quietHoursEnabled,
}: {
  items: InboxRecord[];
  quietHoursEnabled: boolean;
}) {
  const notificationSummary = useMemo(() => buildNotificationSummary(items), [items]);
  const enrichedSystemPrompt = useMemo(() => {
    const ctx = serializeNotificationContext(notificationSummary, quietHoursEnabled);
    return `${NOTIFICATIONS_PERSONA}\n\n${ctx}`;
  }, [notificationSummary, quietHoursEnabled]);

  const ai = useModuleAI({
    moduleId: 'notifications' as ModuleId,
    systemPrompt: enrichedSystemPrompt,
    persistencePolicy: 'session-only' as any,
  });

  return (
    <NexusChat
      moduleId={'notifications' as ModuleId}
      ai={ai}
      agentName="Nexus Notify"
      themeColor={'indigo' as any}
      placeholder="Triage my inbox, set quiet hours, snooze alerts..."
      authMode="global"
      showInternalSignals={false}
      hideClearHistory={true}
    />
  );
}
