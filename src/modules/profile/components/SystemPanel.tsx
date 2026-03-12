import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Info, Activity, Code2, Bug, Cpu } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { useDebugMode, type DebugFlags } from '@/lib/hooks/use-debug-mode';
import { ModelSelector } from './ModelSelector';

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

const ACTIVE_MODULES: Array<{
  id: keyof typeof MODULE_MANIFEST;
  label: string;
  colorHex: string;
}> = [
  { id: 'agnes', label: 'Agnes', colorHex: '#6366F1' },
  { id: 'titan', label: 'Titan', colorHex: '#F59E0B' },
  { id: 'atlas', label: 'Atlas', colorHex: '#0EA5E9' },
  { id: 'ledger', label: 'Ledger', colorHex: '#10B981' },
  { id: 'scout', label: 'Scout', colorHex: '#84CC16' },
  { id: 'forge', label: 'Forge', colorHex: '#F43F5E' },
];

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
  const { logout } = useAuth();
  const { debugMode, toggleDebugMode, debugFlags, setDebugFlag } = useDebugMode();

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
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
            Module Health
          </h3>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.12em] text-emerald-400 font-bold">
              Live
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ACTIVE_MODULES.map((mod, i) => {
            const manifest = MODULE_MANIFEST[mod.id];
            const Icon = manifest?.icon;
            return (
              <motion.div
                key={mod.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-3 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {Icon ? (
                    <Icon
                      className="w-4 h-4 shrink-0"
                      style={{ color: mod.colorHex }}
                    />
                  ) : (
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: mod.colorHex }}
                    />
                  )}
                  <span className="text-xs font-bold text-white/85 truncate">
                    {mod.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: mod.colorHex, opacity: 0.85 }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                    Active
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
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
            System Info
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold">
              App Version
            </span>
            <span className="text-xs font-bold text-violet-300 uppercase tracking-wider">
              {APP_VERSION}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold">
              Platform
            </span>
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
              AGNES_OS
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-bold">
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
        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 mb-4">
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
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Action logs · Spine events · AI reasoning overlays
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={debugMode}
                aria-label="Toggle Debug Mode"
                onClick={toggleDebugMode}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-black ${
                  debugMode
                    ? 'bg-amber-500 border-amber-400'
                    : 'bg-white/10 border-white/20'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform duration-200 ease-in-out mt-0.5 ${
                    debugMode ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
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
                          <p className="text-[9px] text-white/35 mt-0.5 leading-tight">{description}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={debugFlags[key]}
                          aria-label={`Toggle ${label}`}
                          onClick={() => { setDebugFlag(key, !debugFlags[key]); }}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-1 focus:ring-offset-black ${
                            debugFlags[key]
                              ? 'bg-amber-500 border-amber-400'
                              : 'bg-white/10 border-white/20'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out mt-px ${
                              debugFlags[key] ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                    <p className="text-[9px] font-mono text-amber-400/60 px-1 pt-1 uppercase tracking-wider">
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
                <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">
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
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
                  Model Selection
                </h3>
              </div>
              <ModelSelector />
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
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 flex-1">
            Developer
          </h3>
          <span className="text-[9px] uppercase tracking-[0.12em] text-white/20 font-bold">
            More tools coming
          </span>
        </div>
      </GlassCard>
    </motion.div>
  );
}
