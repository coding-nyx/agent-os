import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Heart, Star, Settings } from 'lucide-react';
import { BaseContext } from '../types';
import { cn } from '@/lib/utils';

interface AgnesTherapistCardProps {
  baseContext: Partial<BaseContext> | undefined;
  className?: string;
  agentAlias?: string;
}

export function AgnesTherapistCard({ baseContext, className, agentAlias = 'Agnes' }: AgnesTherapistCardProps) {
  const preferences = baseContext?.preferredAgnes;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn("w-72 flex flex-col gap-6 p-6 surface-card h-full !backdrop-blur-[2px] overflow-y-auto no-scrollbar", className)}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-wider text-white italic leading-none">
              {agentAlias}
            </h3>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-1">Neural Agent</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5">
          <Heart className="w-3 h-3 text-rose-400/60" />
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40 italic">Clinical Support</span>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Preferences</span>
          </div>
          
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Gender Alignment</span>
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                    {preferences?.gender || 'No Preference'}
                </p>
            </div>

            {preferences?.tone && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Vocal Tone</span>
                    <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                        {preferences.tone}
                    </p>
                </div>
            )}

            {preferences?.traits && preferences.traits.length > 0 && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Defined Traits</span>
                    <div className="flex flex-wrap gap-1.5">
                        {preferences.traits.map((trait, i) => (
                            <span key={i} className="text-[8px] font-black uppercase tracking-tighter text-rose-300/60 px-1.5 py-0.5 rounded bg-rose-500/5 border border-rose-500/10">
                                {trait}
                            </span>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div className="p-4 rounded-2xl bg-rose-500/[0.02] border border-rose-500/10 text-center">
            <p className="text-[9px] font-medium text-rose-200/40 leading-relaxed italic">
                "Specializing in deep emotional recalibration and trauma processing."
            </p>
        </div>
      </div>
    </motion.div>
  );
}
