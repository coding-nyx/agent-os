import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'framer-motion';
import { Shield, Zap, AlertTriangle, ShieldCheck } from 'lucide-react';

interface NeuralIntegrityProps {
  mode: 'agnes' | 'titan' | 'global';
  onUpgrade?: () => void;
}

export function NeuralIntegrity({ mode, onUpgrade }: NeuralIntegrityProps) {
  const { isGuest } = useAuth();
  
  // Simplified mock integrity for UI flare
  const integrity = isGuest ? {
      score: 45,
      label: 'GUEST_LINK_UNSTABLE'
  } : {
      score: 98,
      label: 'ENCRYPTED_STABLE'
  };

  const themes = {
    agnes: 'text-indigo-400',
    titan: 'text-orange-400',
    global: 'text-cyan-400'
  };

  const themeColor = themes[mode];

  return (
    <div className="flex flex-col gap-2 w-full max-w-[240px]">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {integrity.score > 70 ? (
            <ShieldCheck className={`w-3 h-3 ${themeColor}`} />
          ) : (
            <Zap className="w-3 h-3 text-amber-400" />
          )}
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
            Neural Integrity: <span className={integrity.score < 30 ? 'text-red-500' : 'text-white'}>{integrity.label}</span>
          </span>
        </div>
        <span className="text-[9px] font-bold text-white/40">{Math.round(integrity.score)}%</span>
      </div>
      
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${integrity.score}%` }}
          className={`h-full ${integrity.score < 30 ? 'bg-red-500' : integrity.score < 70 ? 'bg-amber-500' : themeColor.replace('text-', 'bg-')}`}
        />
      </div>

      {isGuest && integrity.score < 95 && onUpgrade && (
        <button 
          onClick={onUpgrade}
          className="text-[8px] font-black uppercase tracking-[0.2em] text-white/50 hover:text-indigo-400 transition-colors text-left flex items-center gap-1 mt-1 italic"
        >
          Secure Neural Link Permanently →
        </button>
      )}
    </div>
  );
}
