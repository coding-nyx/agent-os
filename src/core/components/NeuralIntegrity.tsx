import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'framer-motion';
import { Zap, AlertTriangle, ShieldCheck, WifiOff } from 'lucide-react';
import { useConnectivitySentinel } from '@/lib/hooks/useConnectivitySentinel';

interface NeuralIntegrityProps {
  mode: 'agnes' | 'titan' | 'global';
  onUpgrade?: () => void;
}

export function NeuralIntegrity({ mode, onUpgrade }: NeuralIntegrityProps) {
  const { isGuest } = useAuth();
  const { status, isFirebaseBlocked, isLLMBlocked } = useConnectivitySentinel();
  
  let score = isGuest ? 45 : 98;
  let label = isGuest ? 'GUEST_LINK_UNSTABLE' : 'ENCRYPTED_STABLE';

  if (status === 'obstructed') {
    score = score * 0.4; // Penalize integrity score
    label = isLLMBlocked ? 'NEURAL_LINK_OBSTRUCTED' : 'DATA_SYNC_BLOCKED';
  }

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
          {status === 'obstructed' ? (
            <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
          ) : score > 70 ? (
            <ShieldCheck className={`w-3 h-3 ${themeColor}`} />
          ) : (
            <Zap className="w-3 h-3 text-amber-400" />
          )}
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
            Neural Integrity: <span className={status === 'obstructed' ? 'text-red-500' : 'text-white'}>{label}</span>
          </span>
        </div>
        <span className="text-[9px] font-bold text-white/40">{Math.round(score)}%</span>
      </div>
      
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          className={`h-full ${status === 'obstructed' ? 'bg-red-500' : score < 70 ? 'bg-amber-500' : themeColor.replace('text-', 'bg-')}`}
        />
      </div>

      {status === 'obstructed' && (
        <div className="flex items-start gap-1 mt-1">
          <WifiOff className="w-2.5 h-2.5 text-red-400/60 shrink-0" />
          <p className="text-[7px] leading-relaxed text-red-400/60 uppercase font-bold tracking-wider">
            Network interference detected. Check ad-blocker or firewall settings.
          </p>
        </div>
      )}

      {isGuest && score < 95 && status === 'connected' && onUpgrade && (
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
