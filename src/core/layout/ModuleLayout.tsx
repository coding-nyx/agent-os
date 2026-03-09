import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Terminal } from 'lucide-react';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import { SyncTransition } from '@/core/components/SyncTransition';
import { SystemCommandCenter } from '@/core/components/SystemCommandCenter';
import { useVault } from '@/lib/vault-context';
import { ModuleId } from '@/lib/module-manifest';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useUIStore } from '@/lib/stores/ui-store';

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

function TelemetryTicker() {
    const [log, setLog] = useState('SYSTEM_IDLE');
    const logs = [
        '0x772_PING_SENT...', 'ENCRYPTING_PACKET_0xAF9...', 'NEURAL_SYNC_STABLE',
        'MASTER_KEY_ACTIVE', 'E2EE_TUNNEL_STABLE', 'SOUL_SYNTH_ACTIVE',
        'BIOMETRIC_UDP_STREAM', 'SIGNAL_INTEGRITY_99.4%', 'RE-ROUTING_PACKET_0x441'
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setLog(logs[Math.floor(Math.random() * logs.length)]);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-lg hidden sm:flex">
            <Terminal className="w-2.5 h-2.5 text-white/40" />
            <motion.span 
                key={log}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[7px] font-mono text-white/40 tracking-widest"
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
  const { isFocusMode, isLeftRailVisible, isRightRailVisible } = useUIStore();

  const handleExit = () => {
    setIsSyncing(true);
  };

  const finalizeExit = () => {
    setIsSyncing(false);
    if (onExit) onExit();
    else navigate('/orchestrator');
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
  const isAccessible = moduleId ? isModuleAccessible(moduleId) : true;
  const isLocked = Boolean(moduleId && !isAccessible);

  const openSecurityProtocol = () => {
    window.dispatchEvent(new CustomEvent('agnes:open-security-protocol'));
  };

  return (
    <div className="h-screen bg-[#010103] text-white flex flex-col font-sans relative selection:bg-white/10 overflow-hidden">
      <SyncTransition 
        isActive={isSyncing} 
        onComplete={finalizeExit} 
        moduleName={title} 
      />

      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_45%)] opacity-40" />
        <div className="absolute inset-0 surface-grid opacity-[0.015]" />
        <div className={`absolute top-0 right-0 w-[820px] h-[820px] ${theme.glow} rounded-full blur-[170px] animate-pulse opacity-45`} />
        <div className={`absolute bottom-0 left-0 w-[600px] h-[600px] ${theme.glow} rounded-full blur-[150px] opacity-25`} />
        
        {/* Deep Focus Vignette */}
        <AnimatePresence>
          {isFocusMode && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(2,2,5,0.8)_100%)] z-[5]"
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {(!hideNavigation && !isFocusMode) && (
          <motion.header 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="sticky top-0 z-[60] border-b border-white/5 bg-black/50 backdrop-blur-2xl px-4 md:px-8 py-3 md:py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 md:gap-6">
              {!hideBack && (
                <button 
                  onClick={handleExit}
                  aria-label="Back to Hub"
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-white" />
                </button>
              )}
              <div className="flex flex-col">
                <h1 className={`text-sm sm:text-lg md:text-xl font-black italic tracking-[0.2em] sm:tracking-[0.3em] uppercase ${theme.accent} truncate max-w-[120px] sm:max-w-[150px] md:max-w-xs`}>{title}</h1>
                <div className="hidden sm:flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[7px] font-bold text-white/40 uppercase tracking-[0.2em] italic truncate">Link Stable // Secure Tunnel</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 md:gap-8">
              <TelemetryTicker />
              <button
                type="button"
                onClick={openSecurityProtocol}
                className="hidden lg:flex flex-col items-end text-left focus:outline-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 hover:bg-white/5 transition-colors"
              >
                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1 italic leading-none">Security Protocol</span>
                <div className="flex items-center gap-2">
                  <Shield className={`w-3 h-3 ${theme.accent}`} />
                  <span className="text-[10px] font-bold text-white/60 tracking-tight leading-none uppercase">E2EE_Active</span>
                </div>
              </button>
              <div className="w-px h-8 bg-white/5 hidden md:block" />
              <div className="flex items-center gap-2">
                <SystemCommandCenter />
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex-1 flex w-full max-w-[100vw] overflow-x-hidden min-h-0">
        <AnimatePresence mode="popLayout">
          {RenderLeftRail && isLeftRailVisible && (
            <motion.div 
              key="left-rail"
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="hidden lg:block shrink-0 h-full relative z-30"
            >
              <RenderLeftRail />
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
                        <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Vault Sync Required</h3>
                        <p className="text-sm text-white/40 leading-relaxed font-medium px-8">
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
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {children}
                    </div>
                    {RenderMobileFooter && (
                        <div className="lg:hidden shrink-0 border-t border-white/5 bg-black/40 backdrop-blur-2xl">
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
              className="hidden lg:block shrink-0 h-full relative z-30"
            >
              <RenderRightRail />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent relative z-20 overflow-hidden">
        <div className={`w-32 h-full mx-auto ${theme.accent.replace('text-', 'bg-')} blur-md opacity-30`} />
      </footer>
    </div>
  );
}
