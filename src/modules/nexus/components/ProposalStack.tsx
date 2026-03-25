import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Check, X, ArrowRight, Zap } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';

interface Proposal {
  id: string;
  agent: string;
  title: string;
  description: string;
  impact: string;
  actionLabel: string;
  onAccept: () => void;
  onReject: () => void;
  isVeto?: boolean;
  vetoReason?: string;
  onOverride?: () => void;
}

function ProposalCard({ proposal, onSwipe }: { proposal: Proposal, onSwipe: (dir: 'left' | 'right') => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  const acceptOpacity = useTransform(x, [50, 150], [0, 1]);
  const rejectOpacity = useTransform(x, [-150, -50], [1, 0]);

  return (
    <motion.div
      style={{ x, rotate, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100) onSwipe('right');
        else if (info.offset.x < -100) onSwipe('left');
      }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      <SurfaceCard className="h-full flex flex-col p-6 border-white/10 bg-zinc-900/90 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
        {/* Direction Overlays */}
        <motion.div style={{ opacity: acceptOpacity }} className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-emerald-500 text-emerald-500 font-black text-4xl px-6 py-2 rounded-2xl transform -rotate-12">ACCEPT</div>
        </motion.div>
        <motion.div style={{ opacity: rejectOpacity }} className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-red-500 text-red-500 font-black text-4xl px-6 py-2 rounded-2xl transform rotate-12">
            {proposal.isVeto ? 'OVERRIDE' : 'SLIDE'}
          </div>
        </motion.div>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Zap size={20} className="text-[var(--module-accent)]" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{proposal.agent} Proposal</span>
            <h3 className="text-lg font-bold text-white tracking-tight">{proposal.title}</h3>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <p className="text-sm text-white/60 leading-relaxed italic">"{proposal.description}"</p>
          
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 block mb-2">Soul Impact</span>
            <p className="text-xs font-mono text-[var(--module-accent)]">{proposal.impact}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-4">
          <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
            <motion.div 
              className="h-full bg-[var(--module-accent)]"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 5, ease: "linear" }}
            />
          </div>
          <span className="text-[10px] font-mono text-white/20 whitespace-nowrap uppercase tracking-widest">Auto-slide in 5s</span>
        </div>
      </SurfaceCard>
    </motion.div>
  );
}

export function ProposalStack({ proposals }: { proposals: Proposal[] }) {
  const [index, setIndex] = useState(0);

  const handleSwipe = (dir: 'left' | 'right') => {
    const proposal = proposals[index];
    if (dir === 'right') {
      proposal.onAccept();
    } else {
      if (proposal.isVeto) {
        console.warn(`[ProposalStack] User Overriding Agent Veto: ${proposal.agent}`);
        if (proposal.onOverride) proposal.onOverride();
      } else {
        proposal.onReject();
      }
    }
    setIndex(prev => prev + 1);
  };

  if (index >= proposals.length) {
    return (
      <div className="h-[340px] flex flex-col items-center justify-center text-center p-8 bg-white/[0.02] rounded-3xl border border-dashed border-white/10">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Check className="text-white/20" />
        </div>
        <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Queue Clear</p>
        <p className="text-[10px] text-white/20 mt-1">No pending agent proposals</p>
      </div>
    );
  }

  return (
    <div className="relative h-[340px] w-full max-w-sm mx-auto">
      <AnimatePresence>
        {proposals.slice(index, index + 2).reverse().map((p, i) => (
          <ProposalCard key={p.id} proposal={p} onSwipe={handleSwipe} />
        ))}
      </AnimatePresence>
    </div>
  );
}
