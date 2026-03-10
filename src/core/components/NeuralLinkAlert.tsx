
import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NeuralLinkAlertProps {
  error: string;
  onRetry: () => void;
  type?: 'connection' | 'security' | 'generic';
}

export function NeuralLinkAlert({ error, onRetry, type = 'generic' }: NeuralLinkAlertProps) {
  const icons = {
    connection: WifiOff,
    security: ShieldAlert,
    generic: AlertTriangle
  };
  const Icon = icons[type];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
    className="p-6 rounded-card-strong bg-red-500/5 border border-red-500/20 backdrop-blur-xl max-w-md mx-auto my-8 relative overflow-hidden group"
    >
      {/* Background Glitch Effect */}
      <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
      
      <div className="relative z-10 flex flex-col items-center text-center space-y-4">
        <div className="w-12 h-12 rounded-panel bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Icon className="w-6 h-6 text-red-400" />
        </div>
        
        <div className="space-y-1">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-400 font-display">Neural Link Severed</h3>
          <p className="text-white/60 text-xs font-medium leading-relaxed">{error}</p>
        </div>

        <button 
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-2.5 rounded-panel bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group/btn"
        >
          <RefreshCw className="w-3.5 h-3.5 text-red-400 group-hover/btn:rotate-180 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">Re-establish Handshake</span>
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <span className="text-[8px] font-mono text-red-500/30 uppercase tracking-[0.2em]">Error_Code: 0xLINK_FAIL_TIMEOUT</span>
      </div>
    </motion.div>
  );
}
