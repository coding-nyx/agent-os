import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { NeuralButton } from './NeuralButton';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

const variants = {
  danger: {
    icon: 'text-rose-400',
    iconBg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    confirmVariant: 'danger' as const,
    confirmTheme: undefined as undefined,
  },
  warning: {
    icon: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    confirmVariant: 'primary' as const,
    confirmTheme: 'amber' as const,
  },
  default: {
    icon: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    confirmVariant: 'primary' as const,
    confirmTheme: 'indigo' as const,
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
}: ConfirmDialogProps) {
  const theme = variants[variant];

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isOpen && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[var(--z-modal)] bg-black/70 backdrop-blur-sm"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className={cn(
                    'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-sm -translate-x-1/2 -translate-y-1/2',
                    'rounded-2xl border bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/60 p-6',
                    theme.border
                  )}
                >
                  {/* Close button */}
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="absolute right-3 top-3 p-2.5 -m-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>

                  {/* Icon */}
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-4', theme.iconBg)}>
                    <AlertTriangle className={cn('w-5 h-5', theme.icon)} aria-hidden="true" />
                  </div>

                  {/* Title */}
                  <Dialog.Title className="text-white/90 font-semibold text-base mb-1">
                    {title}
                  </Dialog.Title>

                  {/* Description */}
                  {description && (
                    <Dialog.Description className="text-white/50 text-sm mb-6">
                      {description}
                    </Dialog.Description>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3 mt-5">
                    <NeuralButton
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={onClose}
                    >
                      {cancelLabel}
                    </NeuralButton>
                    <NeuralButton
                      type="button"
                      variant={theme.confirmVariant}
                      themeColor={theme.confirmTheme}
                      className="flex-1"
                      onClick={handleConfirm}
                    >
                      {confirmLabel}
                    </NeuralButton>
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
