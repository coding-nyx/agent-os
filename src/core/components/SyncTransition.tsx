
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Shield, Zap, Sparkles, Database } from 'lucide-react';

interface SyncTransitionProps {
  isActive: boolean;
  onComplete: () => void;
  moduleName: string;
}

export function SyncTransition({ isActive, onComplete, moduleName }: SyncTransitionProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const technicalLogs = [
    `COMPACTING_SESSION_DATA...`,
    `ENCRYPTING_PACKETS...`,
    `SYNCING_GLOBAL_SOUL...`,
    `PUSHING_TO_E2EE_VAULT...`,
    `SYNCHRONIZATION_STABLE.`
  ];

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let safetyTimeout: NodeJS.Timeout | null = null;
    if (isActive) {
      // Safety timeout: force-complete after 5 seconds no matter what
      safetyTimeout = setTimeout(() => {
        onComplete();
      }, 5000);

      let currentLog = 0;
      const interval = setInterval(() => {
        if (currentLog < technicalLogs.length) {
          setLogs(prev => [...prev, technicalLogs[currentLog]]);
          setProgress((currentLog + 1) * (100 / technicalLogs.length));
          currentLog++;
        } else {
          clearInterval(interval);
          timeoutId = setTimeout(onComplete, 300);
        }
      }, 250);
      return () => {
        clearInterval(interval);
        if (timeoutId) clearTimeout(timeoutId);
        if (safetyTimeout) clearTimeout(safetyTimeout);
      };
    } else {
      setLogs([]);
      setProgress(0);
    }
  }, [isActive, onComplete]);

  // Escape key dismissal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isActive) onComplete();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isActive, onComplete]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-[#020205] flex flex-col items-center justify-center p-8 overflow-hidden"
        >
          {/* Skip button */}
          <button 
            onClick={onComplete}
            className="absolute top-6 right-6 text-white/30 hover:text-white/60 text-xs z-[10000] transition-colors"
            aria-label="Skip synchronization"
          >
            ✕ Skip
          </button>
          {/* Background FX */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" />
          </div>

          <div className="relative z-10 w-full max-w-lg space-y-12">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                  <Database className="w-10 h-10 text-indigo-400 animate-pulse" />
                </div>
                <motion.div 
                  className="absolute -top-2 -right-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-6 h-6 text-indigo-300" />
                </motion.div>
              </div>
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-[0.2em] text-white">Soul Synchronization</h2>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.4em] mt-2 italic">Disconnecting from {moduleName}</p>
              </div>
            </div>

            {/* Progress HUD */}
            <div className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest italic">Neural_Uplink</span>
                <span className="text-[10px] font-mono text-white/40">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-[2px]">
                <motion.div 
                  className="h-full bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.8)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Technical Ticker */}
            <div className="bg-black/40 border border-white/5 rounded-2xl p-6 h-48 overflow-hidden font-mono">
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3"
                  >
                    <span className="text-indigo-500/40 text-[8px]">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                    <span className="text-white/60 text-[9px] uppercase tracking-tighter">{log}</span>
                  </motion.div>
                ))}
                {progress < 100 && (
                  <div className="flex items-center gap-2 text-indigo-400/40">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="text-[9px] animate-pulse">AWAITING_RESPONSE...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute bottom-12 left-12 right-12 flex justify-between opacity-10">
            <span className="text-[8px] font-black uppercase tracking-[0.5em]">E2EE_ENCRYPTION_ACTIVE</span>
            <span className="text-[8px] font-black uppercase tracking-[0.5em]">NEXUS_OS_v3.4.0</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
