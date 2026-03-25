/**
 * AlertsCenter — Ledger Module
 *
 * Notification bell with a sliding panel that surfaces active alert
 * notifications and lets the user manage alert rules.
 *
 * Architecture notes:
 * - Pure presentational state (open/tab) lives in local useState.
 * - Alert evaluation is memoised — re-runs only when `profile` changes.
 * - Dismissed notifications are filtered client-side using profile.dismissedAlertIds.
 * - No external modal state managers are used; the panel is self-contained.
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Bell,
  BellRing,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  Settings,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { evaluateAlerts, getDefaultAlertRules } from '../services/alert-service';
import type {
  AlertNotification,
  AlertRule,
  AlertType,
  AlertSeverity,
  LedgerIntakeProfile,
} from '../services/ledger-intake-service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertsCenterProps {
  profile: LedgerIntakeProfile;
  alertRules: AlertRule[];
  onDismissNotification: (notificationId: string) => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onCreateRule: (rule: Partial<AlertRule>) => void;
  onDeleteRule: (ruleId: string) => void;
}

type PanelTab = 'notifications' | 'settings';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Severity display order — lower index = higher priority. */
const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Hex accent colours per severity level, used for border and icon tints. */
const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

/** Tailwind text colours that approximate the hex accents above. */
const SEVERITY_TEXT_CLASS: Record<AlertSeverity, string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  budget_breach: 'Budget Breach',
  large_transaction: 'Large Transaction',
  bill_overdue: 'Overdue Bill',
  goal_behind: 'Goal Behind',
  low_balance: 'Low Balance',
  trial_ending: 'Trial Ending',
  subscription_renewal: 'Subscription Renewal',
  net_worth_drop: 'Net Worth Drop',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface NotificationIconProps {
  severity: AlertSeverity;
  size?: number;
}

/** Renders the appropriate icon for a notification severity. */
function NotificationIcon({ severity, size = 16 }: NotificationIconProps): React.ReactElement {
  const colorHex = SEVERITY_COLOR[severity];

  if (severity === 'critical' || severity === 'warning') {
    return <AlertTriangle size={size} color={colorHex} strokeWidth={2} />;
  }
  if (severity === 'info') {
    return <Info size={size} color={colorHex} strokeWidth={2} />;
  }
  return <CheckCircle2 size={size} color={colorHex} strokeWidth={2} />;
}

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: AlertNotification;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, onDismiss }: NotificationItemProps): React.ReactElement {
  const borderColor = SEVERITY_COLOR[notification.severity];

  const handleDismiss = useCallback(() => {
    onDismiss(notification.id);
  }, [onDismiss, notification.id]);

  return (
    <div
      className="relative flex gap-3 px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] transition-colors group"
      style={{ borderLeftColor: borderColor, borderLeftWidth: '3px' }}
    >
      {/* Severity icon */}
      <div className="shrink-0 mt-0.5">
        <NotificationIcon severity={notification.severity} size={15} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/90 leading-tight">
          {notification.title}
        </p>
        <p className="text-[11px] text-white/50 leading-snug">
          {notification.message}
        </p>
        {notification.actionTab && (
          <p className={cn('text-[10px] font-medium uppercase tracking-wider mt-1', SEVERITY_TEXT_CLASS[notification.severity])}>
            → View {notification.actionTab}
          </p>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label={`Dismiss alert: ${notification.title}`}
        className="shrink-0 self-start mt-0.5 p-1 rounded text-white/20 hover:text-white/70 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function AllClearEmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <CheckCircle2 size={18} className="text-emerald-400" strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white/80">All clear</p>
        <p className="text-[11px] text-white/35 mt-0.5">No active alerts right now.</p>
      </div>
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}

/**
 * A lightweight, accessible toggle switch implemented without any external
 * component library — keeps the dependency surface minimal.
 *
 * Keyboard: Space/Enter toggles the value; the element acts as role="switch".
 */
function ToggleSwitch({ enabled, onChange, label }: ToggleSwitchProps): React.ReactElement {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!enabled);
    }
  }, [enabled, onChange]);

  return (
    <div
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange(!enabled)}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        enabled
          ? 'bg-emerald-500 border-emerald-400/40 focus-visible:ring-emerald-400'
          : 'bg-white/10 border-white/10 focus-visible:ring-white/30',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </div>
  );
}

// ─── Alert Rule Row ───────────────────────────────────────────────────────────

interface AlertRuleRowProps {
  rule: AlertRule;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onDelete: (ruleId: string) => void;
}

function AlertRuleRow({ rule, onToggle, onDelete }: AlertRuleRowProps): React.ReactElement {
  const handleToggle = useCallback((enabled: boolean) => {
    onToggle(rule.id, enabled);
  }, [onToggle, rule.id]);

  const handleDelete = useCallback(() => {
    onDelete(rule.id);
  }, [onDelete, rule.id]);

  const severityColor = SEVERITY_TEXT_CLASS[rule.severity];

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors group">
      {/* Enabled / disabled visibility icon */}
      <div className={cn('shrink-0', rule.isEnabled ? 'text-white/50' : 'text-white/20')}>
        {rule.isEnabled ? <Eye size={13} strokeWidth={2} /> : <EyeOff size={13} strokeWidth={2} />}
      </div>

      {/* Label + meta */}
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-[11px] font-semibold uppercase tracking-wide leading-tight truncate',
          rule.isEnabled ? 'text-white/85' : 'text-white/35',
        )}>
          {rule.label}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[10px] text-white/35 uppercase tracking-wide">
            {ALERT_TYPE_LABELS[rule.type]}
          </span>
          {rule.threshold !== undefined && (
            <>
              <span className="text-white/20 text-[10px]">·</span>
              <span className="text-[10px] text-white/35">
                threshold: {rule.threshold}
              </span>
            </>
          )}
          <span className="text-white/20 text-[10px]">·</span>
          <span className={cn('text-[10px] uppercase tracking-wide font-medium', severityColor)}>
            {rule.severity}
          </span>
        </div>
      </div>

      {/* Toggle */}
      <ToggleSwitch enabled={rule.isEnabled} onChange={handleToggle} label={`Toggle ${rule.label}`} />

      {/* Delete */}
      <button
        onClick={handleDelete}
        aria-label={`Delete rule: ${rule.label}`}
        className="shrink-0 p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/40"
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Panel Tabs ───────────────────────────────────────────────────────────────

interface PanelTabBarProps {
  active: PanelTab;
  onChangeTab: (tab: PanelTab) => void;
  notificationCount: number;
}

function PanelTabBar({ active, onChangeTab, notificationCount }: PanelTabBarProps): React.ReactElement {
  return (
    <div className="flex border-b border-white/[0.08] shrink-0">
      {(['notifications', 'settings'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => onChangeTab(tab)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-white/30',
            active === tab
              ? 'text-white border-b-2 border-emerald-400 -mb-px'
              : 'text-white/40 hover:text-white/70',
          )}
        >
          {tab === 'notifications' ? (
            <>
              <Bell size={12} strokeWidth={2} />
              Alerts
              {notificationCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold w-4 h-4 leading-none">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </>
          ) : (
            <>
              <Settings size={12} strokeWidth={2} />
              Rules
            </>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * AlertsCenter renders a notification bell button and a sliding overlay panel
 * for viewing active alerts and managing alert rules.
 *
 * Complexity: O(n log n) — notifications are sorted by severity on each render,
 * but the input set n is bounded by the number of enabled rules × entities,
 * which is small in practice (< 100 items).
 */
export default function AlertsCenter({
  profile,
  alertRules,
  onDismissNotification,
  onToggleRule,
  onCreateRule,
  onDeleteRule,
}: AlertsCenterProps): React.ReactElement {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('notifications');
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Evaluate active notifications ─────────────────────────────────────────
  const activeNotifications = useMemo<AlertNotification[]>(() => {
    const { notifications } = evaluateAlerts(profile);
    const dismissedSet = new Set(profile.dismissedAlertIds ?? []);

    // Filter dismissed, then sort: critical → warning → info, newest within tier
    return notifications
      .filter((n) => !dismissedSet.has(n.id))
      .sort((a, b) => {
        const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (severityDiff !== 0) return severityDiff;
        // Tie-break by creation time, newest first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [profile]);

  const unreadCount = activeNotifications.length;
  const hasAlerts = unreadCount > 0;

  // ── Close panel on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!isPanelOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsPanelOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, [isPanelOpen]);

  // ── Close panel on Escape ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isPanelOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsPanelOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleBell = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  const handleAddDefaultRules = useCallback(() => {
    const defaults = getDefaultAlertRules();
    for (const rule of defaults) {
      onCreateRule(rule);
    }
  }, [onCreateRule]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={panelRef} className="relative">
      {/* ── Bell trigger button ─────────────────────────────────────────── */}
      <div className="relative inline-flex">
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={handleToggleBell}
          aria-label={isPanelOpen ? 'Close alerts panel' : 'Open alerts panel'}
          aria-expanded={isPanelOpen}
          aria-haspopup="dialog"
          className={cn(
            'p-2 !px-2 transition-colors',
            isPanelOpen && 'bg-white/10 text-white',
            !isPanelOpen && hasAlerts && 'text-amber-400 hover:text-amber-300',
          )}
        >
          {hasAlerts ? (
            <BellRing size={18} strokeWidth={2} />
          ) : (
            <Bell size={18} strokeWidth={2} />
          )}
        </NeuralButton>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 border border-black text-white text-[9px] font-bold leading-none min-w-[16px] h-4 px-0.5"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {/* ── Sliding panel ───────────────────────────────────────────────── */}
      {isPanelOpen && (
        <div
          role="dialog"
          aria-label="Alerts Center"
          aria-modal="false"
          className={cn(
            // Positioning — fixed to viewport so it always appears on-screen
            'fixed top-16 right-4 z-50',
            // Dimensions
            'w-96 max-h-[calc(100dvh-5rem)]',
            // Glass dark aesthetic consistent with Ledger module
            'flex flex-col rounded-2xl overflow-hidden',
            'bg-black/90 backdrop-blur-xl',
            'border border-white/10',
            'shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]',
          )}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-2">
              <BellRing size={14} className="text-white/50" strokeWidth={2} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70">
                Alerts Center
              </span>
            </div>
            <button
              onClick={() => setIsPanelOpen(false)}
              aria-label="Close alerts panel"
              className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Tab bar */}
          <PanelTabBar
            active={activeTab}
            onChangeTab={setActiveTab}
            notificationCount={unreadCount}
          />

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar overscroll-contain">
            {activeTab === 'notifications' ? (
              <NotificationsTab
                notifications={activeNotifications}
                onDismiss={onDismissNotification}
              />
            ) : (
              <SettingsTab
                alertRules={alertRules}
                onToggle={onToggleRule}
                onDelete={onDeleteRule}
                onAddDefaults={handleAddDefaultRules}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

interface NotificationsTabProps {
  notifications: AlertNotification[];
  onDismiss: (id: string) => void;
}

function NotificationsTab({ notifications, onDismiss }: NotificationsTabProps): React.ReactElement {
  if (notifications.length === 0) {
    return <AllClearEmptyState />;
  }

  // Group by severity for visual separation
  const criticals = notifications.filter((n) => n.severity === 'critical');
  const warnings = notifications.filter((n) => n.severity === 'warning');
  const infos = notifications.filter((n) => n.severity === 'info');

  return (
    <div className="p-3 space-y-1">
      {criticals.length > 0 && (
        <NotificationGroup
          label="Critical"
          color="#ef4444"
          notifications={criticals}
          onDismiss={onDismiss}
        />
      )}
      {warnings.length > 0 && (
        <NotificationGroup
          label="Warnings"
          color="#f59e0b"
          notifications={warnings}
          onDismiss={onDismiss}
        />
      )}
      {infos.length > 0 && (
        <NotificationGroup
          label="Info"
          color="#3b82f6"
          notifications={infos}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

interface NotificationGroupProps {
  label: string;
  color: string;
  notifications: AlertNotification[];
  onDismiss: (id: string) => void;
}

function NotificationGroup({ label, color, notifications, onDismiss }: NotificationGroupProps): React.ReactElement {
  return (
    <div className="space-y-1">
      <p
        className="text-[9px] font-bold uppercase tracking-[0.2em] px-1 pt-2 pb-0.5"
        style={{ color }}
      >
        {label}
      </p>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

interface SettingsTabProps {
  alertRules: AlertRule[];
  onToggle: (ruleId: string, enabled: boolean) => void;
  onDelete: (ruleId: string) => void;
  onAddDefaults: () => void;
}

function SettingsTab({ alertRules, onToggle, onDelete, onAddDefaults }: SettingsTabProps): React.ReactElement {
  const hasRules = alertRules.length > 0;

  if (!hasRules) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 gap-4 text-center">
        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <Settings size={16} className="text-white/30" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/70">No alert rules yet</p>
          <p className="text-[11px] text-white/35 mt-1">
            Add the default rules to get started with automated alerts.
          </p>
        </div>
        <NeuralButton
          variant="outline"
          size="sm"
          themeColor="emerald"
          onClick={onAddDefaults}
          className="mt-1"
        >
          <CheckCircle2 size={13} />
          Add default rules
        </NeuralButton>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1">
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/30 px-1 pt-2 pb-1.5">
        Active Rules ({alertRules.length})
      </p>

      <div className="space-y-1">
        {alertRules.map((rule) => (
          <AlertRuleRow
            key={rule.id}
            rule={rule}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Add defaults button at bottom, always accessible */}
      <div className="pt-3 border-t border-white/[0.06] mt-3">
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={onAddDefaults}
          className="w-full text-white/40 hover:text-white/70"
        >
          <Settings size={12} strokeWidth={2} />
          Reset to default rules
        </NeuralButton>
      </div>
    </div>
  );
}
