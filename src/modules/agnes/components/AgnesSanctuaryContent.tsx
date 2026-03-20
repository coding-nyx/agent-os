import React from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Sparkles, 
  Zap,
  Lock,
  Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgnesSanctuaryContentProps {
  onStartSession: (type: 'new' | 'impromptu' | 'continue') => void;
  agentAlias: string;
  userName: string;
  somaticEnabled: boolean;
  onSomaticToggle: () => void;
  isAccessible: boolean;
  hasActiveSession: boolean;
}

export const AgnesSanctuaryContent: React.FC<AgnesSanctuaryContentProps> = ({
  onStartSession,
  agentAlias,
  somaticEnabled,
  onSomaticToggle,
  isAccessible,
  hasActiveSession
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 relative z-[var(--z-content)] px-4 sm:px-6 py-8 sm:py-12 overflow-y-auto no-scrollbar items-center">
      
      {/* 1. Hero Section - Positioned to complement but not overlap the 3D model */}
      <main className="flex-1 flex flex-col items-center justify-start max-w-5xl w-full space-y-12 sm:space-y-20 mt-4 sm:mt-8">
        
        <div className="text-center space-y-8 relative z-[var(--z-content)]">
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-md"
            >
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-300 italic">Secure Neural Link Active</span>
            </motion.div>
            
            <div className="space-y-4">
              <h1 className="text-5xl sm:text-8xl font-black italic tracking-tighter text-white uppercase leading-none drop-shadow-2xl">
                Mind <span className="text-indigo-400">Restore</span>
              </h1>
              <p className="text-white/40 text-[10px] sm:text-xs font-bold tracking-[0.4em] uppercase max-w-xl mx-auto leading-relaxed px-4">
                A clinical-grade sanctuary for deep emotional recalibration and trauma-informed processing.
              </p>
            </div>
          </div>
        </div>

        {/* Action Grid - Adjusted for better visibility and vertical rhythm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-10 w-full max-w-4xl px-0 sm:px-4 pb-12">
          {/* Quick Support */}
          <motion.button
            whileHover={{ y: -6, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onStartSession('impromptu')}
            className="group relative flex flex-col items-start text-left space-y-6 sm:space-y-8 p-7 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] bg-black/40 backdrop-blur-2xl border border-white/5 hover:border-orange-500/30 transition-all duration-500 shadow-2xl min-h-[10rem]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform duration-500">
              <Zap size={24} />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase italic text-white group-hover:text-orange-400 transition-colors">Quick Support</h3>
              <p className="text-[11px] text-white/40 font-medium leading-relaxed max-w-[240px]">Private, off-the-record handshake. No trace remains in your vault.</p>
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-orange-500/40 group-hover:text-orange-400 transition-colors">Initialize Ephemeral Link</div>
          </motion.button>

          {/* Regular Session */}
          <motion.button
            whileHover={{ y: -6, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onStartSession(hasActiveSession ? 'continue' : 'new')}
            disabled={!isAccessible}
            className={cn(
              "group relative flex flex-col items-start text-left space-y-6 sm:space-y-8 p-7 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] bg-black/40 backdrop-blur-2xl border border-white/5 hover:border-indigo-500/30 transition-all duration-500 shadow-2xl min-h-[10rem]",
              !isAccessible && "opacity-30 cursor-not-allowed"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform duration-500">
              {isAccessible ? <Sparkles size={24} /> : <Lock size={24} />}
            </div>
            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase italic text-white group-hover:text-indigo-400 transition-colors">
                {hasActiveSession ? "Resume Sync" : "New Session"}
              </h3>
              <p className="text-[11px] text-white/40 font-medium leading-relaxed max-w-[240px]">
                Full vault-integrated synchronization with deep baseline analysis.
              </p>
            </div>
            <div className="text-[9px] font-black uppercase tracking-widest text-indigo-500/40 group-hover:text-indigo-400 transition-colors">
              {hasActiveSession ? "Re-establish Tunnel" : "Initialize Handshake"}
            </div>
          </motion.button>
        </div>
      </main>

      {/* 2. Minimalist Footer — encrypted status */}
      <footer className="mt-auto w-full max-w-4xl flex items-center justify-between pt-12 pb-8 border-t border-white/5 px-4">
        <div className="flex items-center gap-3 opacity-30">
           <Shield size={14} className="text-indigo-400" />
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">End-to-End Encrypted</span>
        </div>

        <div className="hidden sm:flex items-center gap-3 opacity-20">
           <Circle size={8} className="fill-current" />
           <span className="text-[9px] font-black uppercase tracking-[0.3em]">Sanctuary Active</span>
        </div>
      </footer>
    </div>
  );
};
