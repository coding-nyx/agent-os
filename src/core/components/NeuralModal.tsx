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
  themeColor?: 'indigo' | 'orange' | 'cyan' | 'emerald' | 'amber' | 'module';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const themes = {
  indigo: { color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  orange: { color: 'text-[#FF7252]', bg: 'bg-[#DC4B1E]/10', border: 'border-[#DC4B1E]/20' },
  cyan: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
  emerald: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  amber: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  module: { color: 'text-[var(--module-accent)]', bg: 'bg-[var(--module-accent-faint)]', border: 'border-[var(--module-accent-border)]' },
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
  themeColor = 'module',
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
                  className="fixed inset-0 z-[var(--z-modal)] bg-black/80 backdrop-blur-md"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                  transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
                  drag="y"
                  dragConstraints={{ top: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) {
                      onClose();
                    }
                  }}
                  className={cn(
                    // Mobile: bottom-sheet anchored to bottom
                    "fixed inset-x-0 bottom-0 z-[calc(var(--z-modal)+1)] pointer-events-none",
                    // Desktop: centered overlay
                    "sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4"
                  )}
                  style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                  <div
                    className={cn(
                      "relative w-full overflow-hidden flex flex-col bg-[#05050a] pointer-events-auto",
                      // Mobile: bottom-sheet shape
                      "rounded-t-3xl border-t border-x border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] max-h-[85vh]",
                      // Desktop: centered modal shape
                      "sm:rounded-modal sm:border sm:shadow-[0_0_50px_rgba(0,0,0,0.5)] sm:max-h-[calc(100vh-2rem)]",
                      widths[maxWidth]
                    )}
                  >
                    <Dialog.Close asChild>
                      <button
                        aria-label="Close dialog"
                        className="absolute top-3 right-3 sm:top-6 sm:right-6 p-3 -m-1 text-white/20 hover:text-white transition-colors z-[var(--z-content)] flex items-center justify-center min-w-[44px] min-h-[44px]"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </Dialog.Close>

                    <div className={cn("shrink-0 border-b border-white/5", theme.bg)}>
                      {/* Mobile drag handle */}
                      <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden cursor-grab active:cursor-grabbing" aria-hidden>
                        <div className="w-10 h-1 rounded-full bg-white/20" />
                      </div>

                      <div className="px-5 pt-2 pb-5 sm:p-8">
                        <div className="flex items-center gap-3 sm:gap-4">
                          {Icon && (
                            <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-xl sm:rounded-panel flex items-center justify-center border border-white/10 bg-black/40 shadow-xl">
                              <Icon className={cn("w-5 h-5 sm:w-6 sm:h-6", theme.color)} />
                            </div>
                          )}
                          <div className="min-w-0 pr-8">
                            <Dialog.Title className="text-base sm:text-xl font-bold tracking-wide text-white uppercase leading-tight font-display truncate">
                              {title}
                            </Dialog.Title>
                            {subtitle && (
                              <p className="text-white/35 text-[10px] sm:text-[11px] uppercase font-semibold tracking-[0.15em] mt-0.5 sm:mt-1 truncate">
                                {subtitle}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-5 sm:p-8 overflow-y-auto min-h-0 flex-1 custom-scrollbar overscroll-contain">
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
