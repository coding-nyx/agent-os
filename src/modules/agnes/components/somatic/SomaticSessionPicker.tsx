import React from 'react';
import { motion } from 'framer-motion';
import { Wind, Layers, X, ArrowRight, type LucideIcon } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SomaticExerciseType = 'breathwork' | 'grounding';

interface Props {
  onSelect: (exercise: SomaticExerciseType) => void;
  onExit: () => void;
}

interface ExerciseCard {
  type: SomaticExerciseType;
  icon: LucideIcon;
  title: string;
  description: string;
  duration: string;
  accentClass: string;
  borderClass: string;
  bgClass: string;
  iconColorClass: string;
}

// ─── Card config ──────────────────────────────────────────────────────────────

const CARDS: ExerciseCard[] = [
  {
    type: 'breathwork',
    icon: Wind,
    title: 'Breathwork',
    description:
      'Regulate your nervous system through guided breath cycles. Choose 4-7-8 for deep calm or Box Breathing for balanced focus.',
    duration: '~5 min · 4 cycles',
    accentClass: 'text-violet-400',
    borderClass: 'border-violet-500/25 hover:border-violet-500/50',
    bgClass: 'bg-violet-500/[0.04] hover:bg-violet-500/[0.08]',
    iconColorClass: 'text-violet-400',
  },
  {
    type: 'grounding',
    icon: Layers,
    title: 'Grounding',
    description:
      'The 5-4-3-2-1 technique guides your awareness through each sense to anchor you firmly in the present moment.',
    duration: '~3 min · 5 senses',
    accentClass: 'text-indigo-400',
    borderClass: 'border-indigo-500/25 hover:border-indigo-500/50',
    bgClass: 'bg-indigo-500/[0.04] hover:bg-indigo-500/[0.08]',
    iconColorClass: 'text-indigo-400',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SomaticSessionPicker({ onSelect, onExit }: Props) {
  return (
    <div className="flex flex-col w-full px-5 py-10 relative">
      {/* Exit button */}
      <NeuralButton
        variant="ghost"
        onClick={onExit}
        className="absolute top-4 right-4 w-9 h-9 !rounded-full p-0 text-white/30 hover:text-white/70"
        aria-label="Close somatic session picker"
      >
        <X className="w-4 h-4" />
      </NeuralButton>

      {/* Header */}
      <div className="mb-8 text-center space-y-2">
        <h2 className="text-2xl font-black text-white/90 uppercase tracking-tighter italic">
          Somatic <span className="text-violet-400">Practice</span>
        </h2>
        <p className="text-xs text-white/35 font-medium">
          Choose an exercise to reconnect with your body
        </p>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
        {CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.type}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelect(card.type)}
              className={`group w-full p-6 rounded-3xl border ${card.bgClass} ${card.borderClass} transition-all text-left relative overflow-hidden`}
            >
              {/* Background icon watermark */}
              <div className="absolute top-0 right-0 p-6 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity pointer-events-none">
                <Icon className="w-16 h-16" />
              </div>

              <div className="relative z-10">
                <Icon className={`w-8 h-8 mb-4 ${card.iconColorClass}`} />
                <h3 className="text-lg font-black text-white/90 uppercase tracking-tight italic mb-2">
                  {card.title}
                </h3>
                <p className="text-xs text-white/40 leading-relaxed font-medium mb-4">
                  {card.description}
                </p>

                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-black uppercase tracking-widest ${card.accentClass} opacity-70`}>
                    {card.duration}
                  </span>
                  <div
                    className={`flex items-center gap-1 ${card.accentClass} opacity-0 group-hover:opacity-100 transition-all -translate-x-3 group-hover:translate-x-0`}
                  >
                    <span className="text-[11px] font-black uppercase tracking-widest">Begin</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
