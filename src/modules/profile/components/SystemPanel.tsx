import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Info, Activity, Code2, Bug, Cpu, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { useVault } from '@/lib/vault-context';
import { BridgeService } from '@/lib/services/bridge-service';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { useDebugMode, type DebugFlags } from '@/lib/hooks/use-debug-mode';
import { ModelSelector } from './ModelSelector';
import { VisionModelSelector } from './VisionModelSelector';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '1.0.0-beta';

const DEBUG_FLAG_ROWS: Array<{
  key: keyof DebugFlags;
  label: string;
  description: string;
}> = [
  { key: 'thinking',      label: 'AI Thinking',     description: 'Show reasoning steps in chat' },
  { key: 'actionTags',    label: 'Action Tags',      description: 'Show extracted action tags per reply' },
  { key: 'actionAsked',   label: 'Actions Asked',    description: 'Show what actions the model requested' },
  { key: 'dataUpdates',   label: 'Data Updates',     description: 'Show soul/profile write events' },
  { key: 'actionUpdates', label: 'Action Dispatch',  description: 'Show confirmed action executions' },
  { key: 'spineEvents',   label: 'Spine Events',     description: 'Show Spine bus events per message' },
];

const HEALTH_MODULE_IDS: ModuleId[] = ['agnes', 'titan', 'atlas', 'ledger', 'scout', 'forge'];

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.05, duration: 0.3 },
  }),
};

export function SystemPanel() {
  const { user, logout } = useAuth();
  const dataLayer = useDataLayer();
  const { isModuleAccessible } = useVault();
  const { debugMode, toggleDebugMode, debugFlags, setDebugFlag } = useDebugMode();
  const [testNotifSending, setTestNotifSending] = useState(false);
  const [testNotifSent, setTestNotifSent] = useState(false);

  const sendTestNotification = async () => {
    if (!user) return;
    setTestNotifSending(true);
    try {
      // 1. Attempt to initialize FCM (if permission allowed)
      const pushActive = await BridgeService.requestPermissionAndInit();
      
      // 2. Regardless of push success, send a spine event for inbox delivery
      const eventId = `test_spine_${Date.now()}`;
      await dataLayer.setDocument(
        `spine_events/${user.uid}/events`,
        eventId,
        {
          type: 'FINANCIAL_STRESS',
          source: 'system',
          domain: 'system',
          priority: 'alert',
          timestamp: Date.now(),
          cascadeDepth: 0,
          data: {
            title: 'Test Notification',
            note: pushActive 
              ? 'This is a test notification sent from debug mode.' 
              : 'Test notification sent to inbox (Push disabled/unsupported).',
            deepLink: { route: '/notifications' },
          },
        },
      );

      if (!pushActive) {
        console.log('[SystemPanel] Test notification sent to inbox (OS push was not initialized).');
      }

      setTestNotifSent(true);
      setTimeout(() => setTestNotifSent(false), 3000);
    } catch (err) {
      console.error('[SystemPanel] Failed to send test notification:', err);
    } finally {
      setTestNotifSending(false);
    }
  };

  const handleSignOut = () => {
    void logout();
  };

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Module health grid */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
            Module Health
          </h3>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.12em] text-emerald-400 font-bold">
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {HEALTH_MODULE_IDS.map((id, i) => {
            const manifest = MODULE_MANIFEST[id];
            const Icon = manifest?.icon;
            const accessible = isModuleAccessible(id);
            const statusLabel = accessible ? 'Unlocked' : 'Locked';
            const statusColor = accessible ? 'text-emerald-300' : 'text-amber-300';
            const dotColor = accessible ? 'bg-emerald-400' : 'bg-amber-400';
            return (
              <motion.div
                key={id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-2xl bg-slate-900/60 border border-white/[0.09] p-4 space-y-3 hover:border-white/[0.12] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {Icon ? (
                    <Icon
                      className="w-4 h-4 shrink-0"
                      style={{ color: manifest.colorHex }}
                    />
                  ) : (
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: manifest.colorHex }}
                    />
                  )}
                  <span className="text-xs font-bold text-white/85 truncate">
                    {manifest.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
                  />
                  <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      {/* App version */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Info className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
            System Info
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-white/[0.09]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-bold">
              App Version
            </span>
            <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
              {APP_VERSION}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-white/[0.09]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-bold">
              Platform
            </span>
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              AGNES_OS
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-white/[0.09]">
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/35 font-bold">
              Encryption
            </span>
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
              E2EE Active
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Session + Debug Mode */}
      <GlassCard className="p-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-4">
          Session
        </h3>
        <div className="space-y-3">
          {/* Debug Mode — top-level quick toggle */}
          <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Bug className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/90">Debug Mode</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Action logs · Spine events · AI reasoning overlays
                  </p>
                </div>
              </div>
              <NeuralToggle
                checked={debugMode}
                onChange={() => { toggleDebugMode(); }}
                color="amber"
                label="Toggle Debug Mode"
              />
            </div>

            {/* Granular sub-flag toggles — visible only when debug is ON */}
            <AnimatePresence initial={false}>
              {debugMode && (
                <motion.div
                  key="debug-flags"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-1.5 border-t border-amber-500/10 pt-3">
                    {DEBUG_FLAG_ROWS.map(({ key, label, description }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-500/5 hover:bg-amber-500/[0.08] transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white/75">{label}</p>
                          <p className="text-[11px] text-white/35 mt-0.5 leading-tight">{description}</p>
                        </div>
                        <NeuralToggle
                          checked={debugFlags[key]}
                          onChange={(v) => { setDebugFlag(key, v); }}
                          color="amber"
                          size="sm"
                          label={`Toggle ${label}`}
                        />
                      </div>
                    ))}
                    {/* Test notification */}
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-500/5 hover:bg-amber-500/[0.08] transition-colors mt-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Bell className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white/75">Test Notification</p>
                          <p className="text-[11px] text-white/35 mt-0.5 leading-tight">Send a test alert to the inbox</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={testNotifSending}
                        onClick={() => { void sendTestNotification(); }}
                        className={`shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] px-3 py-1.5 rounded-xl border transition-all duration-200 disabled:opacity-40 ${
                          testNotifSent
                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20'
                        }`}
                      >
                        {testNotifSent ? 'Sent' : 'Send'}
                      </button>
                    </div>

                    <p className="text-[11px] font-mono text-amber-400/60 px-1 pt-1 uppercase tracking-wider">
                      ⚡ Debug active — console + overlays enabled across all modules
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sign out */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/20 border border-rose-500/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <LogOut className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/90">Sign Out</p>
                <p className="text-[11px] text-white/35 uppercase tracking-wider font-semibold">
                  End this session
                </p>
              </div>
            </div>
            <NeuralButton size="sm" variant="danger" onClick={handleSignOut}>
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </NeuralButton>
          </div>
        </div>
      </GlassCard>

      {/* Model Selection — visible only when debug mode is ON */}
      <AnimatePresence initial={false}>
        {debugMode && (
          <motion.div
            key="model-selector"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
                  Model Selection
                </h3>
              </div>
              <ModelSelector />
              <div className="mt-6 pt-5 border-t border-white/[0.12]">
                <VisionModelSelector />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Developer — collapsible, for future dev tools */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 flex-1">
            Developer
          </h3>
          <span className="text-[11px] uppercase tracking-[0.12em] text-white/20 font-bold">
            More tools coming
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
}
