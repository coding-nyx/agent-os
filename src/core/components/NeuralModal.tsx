import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LucideIcon } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

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
  const reducedMotion = useReducedMotion();

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isOpen && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reducedMotion ? { duration: 0 } : undefined}
                  className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }}
                  transition={reducedMotion ? { duration: 0 } : undefined}
                  className={cn(
                    "fixed inset-0 z-[101] m-auto flex items-center justify-center p-4 pointer-events-none"
                  )}
                >
                    <div
                      className={cn(
                        "relative w-full overflow-hidden rounded-modal border border-white/10 bg-[#05050a] shadow-[0_0_50px_rgba(0,0,0,0.5)] pointer-events-auto",
                        widths[maxWidth]
                      )}
                    >
                    <Dialog.Close asChild>
                      <button
                        aria-label="Close dialog"
                        className="absolute top-6 right-6 text-white/20 hover:text-white transition-colors z-20"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </Dialog.Close>

                    <div className={cn("p-8 border-b border-white/5", theme.bg)}>
                      <div className="flex items-center gap-4">
                        {Icon && (
                            <div className="w-12 h-12 rounded-panel flex items-center justify-center border border-white/10 bg-black/40 shadow-xl">
                            <Icon className={cn("w-6 h-6", theme.color)} />
                          </div>
                        )}
                        <div>
                          <Dialog.Title className="text-xl font-black italic tracking-wider text-white uppercase leading-tight">
                            {title}
                          </Dialog.Title>
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
                  </div>
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
