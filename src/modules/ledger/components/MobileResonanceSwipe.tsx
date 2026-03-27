import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { TrendingUp, TrendingDown, ChevronRight, Zap } from 'lucide-react';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { formatCurrency } from '@/lib/utils';
import { Transaction } from '../services/ledger-intake-service';

interface MobileResonanceSwipeProps {
  transactions: Transaction[];
  currency: string;
  onSwipe: (transactionId: string, score: number) => void;
}

function ResonanceCard({ 
  transaction, 
  currency, 
  onSwipe 
}: { 
  transaction: Transaction, 
  currency: string, 
  onSwipe: (dir: 'left' | 'right') => void 
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  const resonanceOpacity = useTransform(x, [50, 150], [0, 1]);
  const frictionOpacity = useTransform(x, [-150, -50], [1, 0]);

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
      <SurfaceCard className="h-full flex flex-col p-6 border-white/[0.12] bg-zinc-900/90 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
        {/* Direction Overlays */}
        <motion.div style={{ opacity: resonanceOpacity }} className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-emerald-500 text-emerald-500 font-black text-4xl px-6 py-2 rounded-2xl transform -rotate-12">RESONANCE</div>
        </motion.div>
        <motion.div style={{ opacity: frictionOpacity }} className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none">
          <div className="border-4 border-red-500 text-red-500 font-black text-4xl px-6 py-2 rounded-2xl transform rotate-12">FRICTION</div>
        </motion.div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30">{transaction.category}</span>
            <h3 className="text-xl font-bold text-white tracking-tight">{transaction.description}</h3>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-white tabular-nums">
              {formatCurrency(transaction.amount, currency)}
            </div>
            <div className="text-[11px] text-white/40 font-mono uppercase">{transaction.date}</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-white/[0.045] border border-white/[0.12] flex items-center justify-center">
            <Zap size={32} className="text-cyan-400" />
          </div>
          <p className="text-sm text-white/60 leading-relaxed max-w-[240px]">
            Swipe right if this spend aligns with your growth. Swipe left if it caused friction.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center gap-2">
            <TrendingDown className="text-red-400 opacity-40" />
            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Friction</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <TrendingUp className="text-emerald-400 opacity-40" />
            <span className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Resonance</span>
          </div>
        </div>
      </SurfaceCard>
    </motion.div>
  );
}

export function MobileResonanceSwipe({ transactions, currency, onSwipe }: MobileResonanceSwipeProps) {
  const unswiped = transactions.filter(t => t.resonance_score === undefined && t.type === 'expense');
  const [index, setIndex] = useState(0);

  const handleSwipe = (dir: 'left' | 'right') => {
    const score = dir === 'right' ? 1.0 : -1.0;
    onSwipe(unswiped[index].id, score);
    setIndex(prev => prev + 1);
  };

  if (index >= unswiped.length) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center p-8 bg-white/[0.045] rounded-3xl border border-dashed border-white/[0.12]">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
          <ChevronRight className="text-emerald-400" />
        </div>
        <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Resonance Clear</p>
        <p className="text-[11px] text-white/20 mt-1">All transactions have been scored</p>
      </div>
    );
  }

  return (
    <div className="relative h-[400px] w-full max-w-sm mx-auto">
      <AnimatePresence>
        {unswiped.slice(index, index + 2).reverse().map((t, i) => (
          <ResonanceCard 
            key={t.id} 
            transaction={t} 
            currency={currency} 
            onSwipe={handleSwipe} 
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
