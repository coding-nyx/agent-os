import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Terminal, Sparkles } from 'lucide-react';
import { ModuleSwitcherPopover } from '@/core/components/ModuleSwitcherPopover';
import { SyncTransition } from '@/core/components/SyncTransition';
import { SystemCommandCenter } from '@/core/components/SystemCommandCenter';
import { useVault } from '@/lib/vault-context';
import { ModuleId, type ModuleTheme } from '@/lib/module-manifest';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useUIStore } from '@/lib/stores/ui-store';
import { ScopedChatPanel } from '@/core/components/field-management/ScopedChatPanel';
import { useDebugMode } from '@/lib/hooks/use-debug-mode';
import { ModelBadge } from '@/core/components/debug';
import { NexusLogger } from '@/lib/nexus-logger';
import { useCrossModuleHintListener } from '@/lib/hooks/use-cross-module-hint-listener';
import { DataSyncToast } from '@/core/components/DataSyncToast';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';

/**
 * CSS custom property palette per module theme.
 * Applied on ModuleLayout root so descendants can use var(--module-*) everywhere.
 * NeuralButton `themeColor="module"` resolves these automatically.
 */
const MODULE_THEME_VARIABLES: Record<ModuleTheme, Record<string, string>> = {
  indigo: {
    '--module-accent':        '#818cf8', // indigo-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#6366f1', // indigo-500
    '--module-accent-border': 'rgba(99,102,241,0.25)',
    '--module-accent-ring':   '#818cf8',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(99,102,241,0.1)',
    '--module-accent-glow':   'rgba(99,102,241,0.15)',
    '--module-color-300':     '#a5b4fc',
    '--module-color-400':     '#818cf8',
    '--module-color-500':     '#6366f1',
    '--module-color-600':     '#4f46e5',
  },
  orange: {
    '--module-accent':        '#DC4B1E',
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#FF5C2A',
    '--module-accent-border': 'rgba(220,75,30,0.25)',
    '--module-accent-ring':   'rgba(220,75,30,0.38)',
    '--module-accent-shadow': '0 8px 24px rgba(220,75,30,0.32), inset 0 1px 0 rgba(255,255,255,0.18)',
    '--module-accent-muted':  'rgba(220,75,30,0.10)',
    '--module-accent-faint':  'rgba(220,75,30,0.05)',
    '--module-accent-glow':   'rgba(220,75,30,0.15)',
    '--module-color-300':     '#FFA882',
    '--module-color-400':     '#FF7252',
    '--module-color-500':     '#DC4B1E',
    '--module-color-600':     '#B23510',
  },
  cyan: {
    '--module-accent':        '#22d3ee', // cyan-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#06b6d4', // cyan-500
    '--module-accent-border': 'rgba(6,182,212,0.25)',
    '--module-accent-ring':   '#22d3ee',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(6,182,212,0.1)',
    '--module-accent-glow':   'rgba(6,182,212,0.15)',
    '--module-color-300':     '#67e8f9',
    '--module-color-400':     '#22d3ee',
    '--module-color-500':     '#06b6d4',
    '--module-color-600':     '#0891b2',
  },
  emerald: {
    '--module-accent':        '#34d399', // emerald-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#10b981', // emerald-500
    '--module-accent-border': 'rgba(16,185,129,0.25)',
    '--module-accent-ring':   '#34d399',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(16,185,129,0.1)',
    '--module-accent-glow':   'rgba(16,185,129,0.15)',
    '--module-color-300':     '#6ee7b7',
    '--module-color-400':     '#34d399',
    '--module-color-500':     '#10b981',
    '--module-color-600':     '#059669',
  },
  sky: {
    '--module-accent':        '#38bdf8', // sky-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#0ea5e9', // sky-500
    '--module-accent-border': 'rgba(14,165,233,0.25)',
    '--module-accent-ring':   '#38bdf8',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(14,165,233,0.1)',
    '--module-accent-glow':   'rgba(14,165,233,0.15)',
    '--module-color-300':     '#7dd3fc',
    '--module-color-400':     '#38bdf8',
    '--module-color-500':     '#0ea5e9',
    '--module-color-600':     '#0284c7',
  },
  lime: {
    '--module-accent':        '#a3e635',
    '--module-accent-text':   '#000000',
    '--module-accent-hover':  '#bef264',
    '--module-accent-border': 'rgba(132,204,22,0.25)',
    '--module-accent-ring':   'rgba(132,204,22,0.38)',
    '--module-accent-shadow': '0 8px 24px rgba(132,204,22,0.28), inset 0 1px 0 rgba(255,255,255,0.20)',
    '--module-accent-muted':  'rgba(132,204,22,0.10)',
    '--module-accent-faint':  'rgba(132,204,22,0.05)',
    '--module-accent-glow':   'rgba(132,204,22,0.15)',
    '--module-color-300':     '#bef264',
    '--module-color-400':     '#a3e635',
    '--module-color-500':     '#84cc16',
    '--module-color-600':     '#65a30d',
  },
  rose: {
    '--module-accent':        '#fb7185', // rose-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#f43f5e', // rose-500
    '--module-accent-border': 'rgba(244,63,94,0.25)',
    '--module-accent-ring':   '#fb7185',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(244,63,94,0.1)',
    '--module-accent-glow':   'rgba(244,63,94,0.15)',
    '--module-color-300':     '#fda4af',
    '--module-color-400':     '#fb7185',
    '--module-color-500':     '#f43f5e',
    '--module-color-600':     '#e11d48',
  },
  fuchsia: {
    '--module-accent':        '#e879f9', // fuchsia-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#d946ef', // fuchsia-500
    '--module-accent-border': 'rgba(217,70,239,0.25)',
    '--module-accent-ring':   '#e879f9',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(217,70,239,0.1)',
    '--module-accent-glow':   'rgba(217,70,239,0.15)',
    '--module-color-300':     '#f0abfc',
    '--module-color-400':     '#e879f9',
    '--module-color-500':     '#d946ef',
    '--module-color-600':     '#c026d3',
  },
  slate: {
    '--module-accent':        '#94a3b8', // slate-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#64748b', // slate-500
    '--module-accent-border': 'rgba(100,116,139,0.25)',
    '--module-accent-ring':   '#94a3b8',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(100,116,139,0.1)',
    '--module-accent-glow':   'rgba(100,116,139,0.15)',
    '--module-color-300':     '#cbd5e1',
    '--module-color-400':     '#94a3b8',
    '--module-color-500':     '#64748b',
    '--module-color-600':     '#475569',
  },
  violet: {
    '--module-accent':        '#a78bfa', // violet-400
    '--module-accent-text':   '#ffffff',
    '--module-accent-hover':  '#8b5cf6', // violet-500
    '--module-accent-border': 'rgba(139,92,246,0.25)',
    '--module-accent-ring':   '#a78bfa',
    '--module-accent-shadow': '0 0 0 0',
    '--module-accent-muted':  'rgba(139,92,246,0.1)',
    '--module-accent-glow':   'rgba(139,92,246,0.15)',
    '--module-color-300':     '#c4b5fd',
    '--module-color-400':     '#a78bfa',
    '--module-color-500':     '#8b5cf6',
    '--module-color-600':     '#7c3aed',
  },
};

interface ModuleLayoutProps {
  children: React.ReactNode;
  title: string;
  themeColor: 'indigo' | 'orange' | 'cyan' | 'emerald' | 'sky' | 'lime' | 'rose' | 'fuchsia' | 'slate' | 'violet';
  onExit?: () => void;
  hideBack?: boolean;
  moduleId?: ModuleId;
  hideNavigation?: boolean;
  renderLeftRail?: () => React.ReactNode;
  renderRightRail?: () => React.ReactNode;
  renderMobileFooter?: () => React.ReactNode;
}

interface TelemetryTickerProps {
    debugMode: boolean;
}

function TelemetryTicker({ debugMode }: TelemetryTickerProps) {
    const [log, setLog] = useState('SYSTEM_IDLE');
    const fakeLogs = [
        '0x772_PING_SENT...', 'ENCRYPTING_PACKET_0xAF9...', 'NEURAL_SYNC_STABLE',
        'MASTER_KEY_ACTIVE', 'E2EE_TUNNEL_STABLE', 'SOUL_SYNTH_ACTIVE',
        'BIOMETRIC_UDP_STREAM', 'SIGNAL_INTEGRITY_99.4%', 'RE-ROUTING_PACKET_0x441'
    ];

    useEffect(() => {
        if (!debugMode) {
            // Fake ticker: random string every 3s
            const interval = setInterval(() => {
                setLog(fakeLogs[Math.floor(Math.random() * fakeLogs.length)]);
            }, 3000);
            return () => clearInterval(interval);
        } else {
            // Real Spine events: poll NexusLogger every 1s
            const interval = setInterval(() => {
                const recent = NexusLogger.getRecentSpineEvents(1);
                const last = recent[recent.length - 1];
                setLog(last ? `⚡ ${last.eventType}` : '⚡ SPINE_IDLE');
            }, 1000);
            return () => clearInterval(interval);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debugMode]);

    return (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-lg max-w-[180px] overflow-hidden">
            <Terminal className="w-2.5 h-2.5 text-white/40 shrink-0" />
            <motion.span 
                key={log}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[8px] font-mono text-white/40 tracking-wider truncate"
            >
                {log}
            </motion.span>
        </div>
    );
}

export function ModuleLayout({ 
  children, 
  title, 
  themeColor, 
  onExit, 
  hideBack = false, 
  moduleId, 
  hideNavigation = false,
  renderLeftRail: RenderLeftRail,
  renderRightRail: RenderRightRail,
  renderMobileFooter: RenderMobileFooter
}: ModuleLayoutProps) {
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { isModuleAccessible } = useVault();
  const reducedMotion = useReducedMotion();
  const { isLeftRailVisible, isRightRailVisible } = useUIStore();
  const { debugMode } = useDebugMode();

  // Contextual Inference Engine — S10-008
  const { activeHint, dismissHint, confirmHint } = useCrossModuleHintListener();

  const handleExit = () => {
    setIsSyncing(true);
  };

  const finalizeExit = () => {
    setIsSyncing(false);
    if (onExit) onExit();
    else navigate('/hub');
  };

  const colors = {
    indigo: { accent: 'text-indigo-400', glow: 'bg-indigo-500/10' },
    orange: { accent: 'text-orange-400', glow: 'bg-orange-500/10' },
    cyan: { accent: 'text-cyan-400', glow: 'bg-cyan-500/10' },
    emerald: { accent: 'text-emerald-400', glow: 'bg-emerald-500/10' },
    sky: { accent: 'text-sky-400', glow: 'bg-sky-500/10' },
    lime: { accent: 'text-lime-400', glow: 'bg-lime-500/10' },
    rose: { accent: 'text-rose-400', glow: 'bg-rose-500/10' },
    fuchsia: { accent: 'text-fuchsia-400', glow: 'bg-fuchsia-500/10' },
    slate: { accent: 'text-slate-400', glow: 'bg-slate-500/10' },
    violet: { accent: 'text-violet-400', glow: 'bg-violet-500/10' }
  };

  const theme = colors[themeColor];

  const moduleThemeVars = MODULE_THEME_VARIABLES[themeColor];
  const isAccessible = moduleId ? isModuleAccessible(moduleId) : true;
  const isLocked = Boolean(moduleId && !isAccessible);

  const openSecurityProtocol = () => {
    window.dispatchEvent(new CustomEvent('agnes:open-security-protocol'));
  };

  const handleAskModule = () => {
    if (!activeHint) return;
    const { targetModule, rawQuote } = activeHint.hint;
    NexusHandoffService.store({
      moduleId: targetModule,
      type: 'query',
      content: rawQuote,
      reason: 'contextual-hint-inquiry',
      sourceModuleId: moduleId,
      createdAt: new Date().toISOString(),
    });
    dismissHint();
    navigate(`/${targetModule}`);
  };

  return (
    <div
      className="h-[100dvh] bg-[#010103] text-white flex flex-col font-sans relative selection:bg-white/10 overflow-hidden"
      style={moduleThemeVars as React.CSSProperties}
    >
      <SyncTransition 
        isActive={isSyncing} 
        onComplete={finalizeExit} 
        moduleName={title} 
      />

      <div className="fixed inset-0 z-[var(--z-base)] pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_45%)] opacity-40" />
        <div className="absolute inset-0 surface-grid opacity-[0.015]" />
        <div className={`absolute top-0 right-0 w-[820px] h-[820px] ${theme.glow} rounded-full blur-[170px] animate-pulse opacity-45`} />
        <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] ${theme.glow} rounded-full blur-[150px] opacity-25`} />
        
      </div>

      <AnimatePresence>
        {(!hideNavigation) && (
          <motion.header 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="sticky top-0 z-[var(--z-header)] border-b border-white/5 bg-black/50 backdrop-blur-2xl px-4 md:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0.75rem))] flex items-center justify-between gap-2"
          >
            {/* Left cluster: back + title */}
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              {!hideBack && (
                <button 
                  onClick={handleExit}
                  aria-label="Back to Hub"
                  className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 text-white/40 group-hover:text-white" />
                </button>
              )}
              <div className="flex flex-col min-w-0">
                <h1 className={`text-sm md:text-base font-bold tracking-[0.08em] md:tracking-[0.15em] uppercase font-display ${theme.accent} truncate max-w-[130px] sm:max-w-[180px] md:max-w-[220px] lg:max-w-xs`}>{title}</h1>
                {/* Subtitle — sm+ only */}
                <div className="hidden sm:flex items-center gap-1.5">
                  <div className={`w-1 h-1 rounded-full animate-pulse shrink-0 ${debugMode ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  {debugMode ? (
                    <ModelBadge debugMode={debugMode} />
                  ) : (
                    <span className="text-[9px] font-medium text-white/40 uppercase tracking-[0.1em] truncate font-mono">
                      Link Stable // Secure Tunnel
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right cluster: ticker → bell → modules → security → divider → avatar */}
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <TelemetryTicker debugMode={debugMode} />

              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('open-nexus'))}
                aria-label="Open Nexus"
                className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 shrink-0"
              >
                  <Sparkles className="w-4 h-4 text-white/50" />
              </button>

              {/* Module switcher — mobile + md+ */}
              <div className="block md:hidden">
                <ModuleSwitcherPopover currentModuleId={moduleId} />
              </div>
              <div className="hidden md:block">
                <ModuleSwitcherPopover currentModuleId={moduleId} />
              </div>

              {/* Security protocol — lg+ */}
              <button
                type="button"
                onClick={openSecurityProtocol}
                className="hidden lg:flex flex-col items-end text-left focus:outline-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
              >
                <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1 leading-none">Security Protocol</span>
                <div className="flex items-center gap-1.5">
                  <Shield className={`w-3 h-3 ${theme.accent}`} />
                  <span className="text-[10px] font-medium text-white/60 tracking-tight leading-none uppercase font-mono">Device: Synced</span>
                </div>
              </button>

              <div className="w-px h-6 bg-white/5 hidden sm:block" />
              <SystemCommandCenter />
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="relative z-[var(--z-content)] flex-1 flex w-full max-w-[100vw] overflow-x-hidden min-h-0">
        {moduleId && <ScopedChatPanel moduleId={moduleId} themeColor={themeColor} />}
        <AnimatePresence mode="popLayout">
          {RenderLeftRail && isLeftRailVisible && (
            <motion.div 
              key="left-rail"
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="hidden lg:block shrink-0 h-full relative z-[var(--z-content)]"
            >
              {RenderLeftRail()}
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          <AnimatePresence mode="wait">
            {!isSyncing && (
              <motion.div
                key={title}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                transition={reducedMotion ? { duration: 0 } : undefined}
                className="flex-1 w-full flex flex-col min-h-0"
              >
                {isLocked ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-xl w-full p-12 rounded-card-strong border border-white/10 bg-white/[0.02] backdrop-blur-3xl text-center space-y-8 shadow-2xl">
                      <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                        <div className={cn("w-3 h-3 rounded-full animate-ping", `bg-${themeColor}-500`)} />
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-2xl sm:text-3xl font-bold uppercase tracking-tight text-white font-display">Vault Sync Required</h3>
                        <p className="text-sm text-white/45 leading-relaxed font-medium px-4 sm:px-8">
                          This domain is end-to-end encrypted. Initialize a local handshake to decrypt your profile synchronization.
                        </p>
                      </div>
                      <NeuralButton size="xl" className="w-full" onClick={() => setShowAuth(true)}>
                        Unlock {title} Vault
                      </NeuralButton>
                    </div>
                    {moduleId && (
                      <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={moduleId} />
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {children}
                    </div>
                    {RenderMobileFooter && (
                        <div className="lg:hidden shrink-0 border-t border-white/5 bg-black/40 backdrop-blur-2xl pb-[env(safe-area-inset-bottom,0px)]">
                            <RenderMobileFooter />
                        </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="popLayout">
          {RenderRightRail && isRightRailVisible && (
            <motion.div 
              key="right-rail"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="hidden lg:block shrink-0 h-full relative z-[var(--z-content)]"
            >
              <RenderRightRail />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent relative z-[var(--z-content)] overflow-hidden">
        <div className={`w-32 h-full mx-auto ${theme.accent.replace('text-', 'bg-')} blur-md opacity-30`} />
      </footer>

      {/* Contextual Inference Engine — S10-008: cross-module data sync toast */}
      <AnimatePresence>
        {activeHint !== null && (
          <DataSyncToast
            hint={activeHint}
            onConfirm={confirmHint}
            onDismiss={dismissHint}
            onAskModule={handleAskModule}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
