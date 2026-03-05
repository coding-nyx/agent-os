import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NeuralModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  themeColor?: 'indigo' | 'orange' | 'cyan' | 'emerald' | 'amber';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const themes = {
  indigo: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  orange: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  cyan: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  emerald: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  amber: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
};

const widths = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl'
};

export function NeuralModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  themeColor = 'indigo',
  maxWidth = 'md'
}: NeuralModalProps) {
  const theme = themes[themeColor];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn(
              "relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#05050a] shadow-[0_0_50px_rgba(0,0,0,0.5)]",
              widths[maxWidth]
            )}
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors z-20"
            >
              <X className="w-5 h-5" />
            </button>

            <div className={cn("p-8 border-b border-white/5", theme.bg)}>
              <div className="flex items-center gap-4">
                {Icon && (
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/10 bg-black/40 shadow-xl">
                    <Icon className={cn("w-6 h-6", theme.color)} />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-black italic tracking-wider text-white uppercase leading-tight">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="text-white/30 text-[9px] uppercase font-black tracking-[0.3em] mt-1">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
