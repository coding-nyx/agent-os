import React from 'react';
import { motion } from 'framer-motion';
import { User, Target, Brain, MessageSquare } from 'lucide-react';
import { BaseContext } from '../types';
import { cn } from '@/lib/utils';

interface AgnesPersonalitySidebarProps {
  baseContext: Partial<BaseContext> | undefined;
  className?: string;
}

export function AgnesPersonalitySidebar({ baseContext, className }: AgnesPersonalitySidebarProps) {
  if (!baseContext) {
    return (
        <motion.div 
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn("w-72 flex flex-col items-center justify-center p-6 surface-card h-full !backdrop-blur-[2px]", className)}
        >
            <User className="w-8 h-8 text-white/10 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 italic text-center">Neural Profile Offline</p>
        </motion.div>
    );
  }

  const identity = typeof baseContext.identity === 'object' ? baseContext.identity : { name: baseContext.identity };
  const struggles = Array.isArray(baseContext.struggles) ? baseContext.struggles : (baseContext.struggles ? [baseContext.struggles] : []);
  const goals = Array.isArray(baseContext.goals) ? baseContext.goals : (baseContext.goals ? [baseContext.goals] : []);

  const hasData = identity?.name || struggles.length > 0 || goals.length > 0 || baseContext.communicationStyle;

  if (!hasData) {
    return (
        <motion.div 
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn("w-72 flex flex-col items-center justify-center p-6 surface-card h-full !backdrop-blur-[2px]", className)}
        >
            <User className="w-8 h-8 text-white/10 mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 italic text-center">Profile Data Pending</p>
        </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn("w-72 flex flex-col gap-6 p-6 surface-card h-full !backdrop-blur-[2px] overflow-y-auto no-scrollbar", className)}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <User className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-white italic leading-none">
              {identity?.name || 'Subject'}
            </h3>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-1">User Personality</p>
          </div>
        </div>

        {baseContext.communicationStyle && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5">
            <MessageSquare className="w-3 h-3 text-white/40" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">{baseContext.communicationStyle} Style</span>
          </div>
        )}
      </div>

      {struggles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Focus Areas</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {struggles.map((item, i) => (
              <div key={i} className="px-3 py-1.5 rounded-xl bg-rose-400/5 border border-white/5 text-[10px] font-medium text-white/60">
                {item}
              </div>
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Active Goals</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {goals.map((item, i) => (
              <div key={i} className="px-3 py-1.5 rounded-xl bg-indigo-400/5 border border-white/5 text-[10px] font-medium text-white/60">
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
