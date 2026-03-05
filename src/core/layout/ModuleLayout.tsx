
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Terminal } from 'lucide-react';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import { useAuth } from '@/lib/auth-context';
import { SyncTransition } from '@/core/components/SyncTransition';

interface ModuleLayoutProps {
  children: React.ReactNode;
  title: string;
  themeColor: 'indigo' | 'orange' | 'cyan';
  onExit?: () => void;
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
        <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.03] border border-white/5 rounded-lg">
            <Terminal className="w-2.5 h-2.5 text-white/20" />
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

export function ModuleLayout({ children, title, themeColor, onExit }: ModuleLayoutProps) {
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleExit = () => {
    setIsSyncing(true);
  };

  const finalizeExit = () => {
    if (onExit) onExit();
    else navigate('/hub');
  };

  const colors = {
    indigo: { accent: 'text-indigo-400', glow: 'bg-indigo-500/10' },
    orange: { accent: 'text-orange-400', glow: 'bg-orange-500/10' },
    cyan: { accent: 'text-cyan-400', glow: 'bg-cyan-500/10' }
  };

  const theme = colors[themeColor];

  return (
    <div className="fixed inset-0 bg-[#020205] text-white overflow-hidden flex flex-col font-sans">
      <SyncTransition 
        isActive={isSyncing} 
        onComplete={finalizeExit} 
        moduleName={title} 
      />

      <div className="absolute inset-0 z-0 text-white">
        <div className={`absolute top-0 right-0 w-[600px] h-[600px] ${theme.glow} rounded-full blur-[120px] animate-pulse`} />
        <div className={`absolute bottom-0 left-0 w-[400px] h-[400px] ${theme.glow} rounded-full blur-[100px] opacity-50`} />
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#fff 0.5px, transparent 0.5px)', backgroundSize: '32px 32px' }} />
      </div>

      <header className="relative z-20 border-b border-white/5 bg-black/20 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6 text-white">
          <button 
            onClick={handleExit}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
          >
            <ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-white" />
          </button>
          <div>
            <h1 className={`text-xl font-black italic tracking-[0.3em] uppercase ${theme.accent}`}>{title}</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest italic leading-none">Optimal</span>
              </div>
              <TelemetryTicker />
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1 italic leading-none">Security Protocol</span>
            <div className="flex items-center gap-2">
              <Shield className={`w-3 h-3 ${theme.accent}`} />
              <span className="text-[10px] font-bold text-white/60 tracking-tight leading-none uppercase">E2EE_Active</span>
            </div>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="w-48">
            <NeuralIntegrity mode={themeColor === 'indigo' ? 'therapy' : themeColor === 'orange' ? 'trainer' : 'global'} />
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!isSyncing && (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full w-full"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-20 h-1 bg-gradient-to-r from-transparent via-white/5 to-transparent flex items-center justify-center">
        <div className={`w-32 h-full ${theme.accent.replace('text-', 'bg-')} blur-md opacity-50`} />
      </footer>
    </div>
  );
}
