import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { NeuralButton } from '@/core/components/NeuralButton';

interface RoutingSuggestionProps {
  target: ModuleId;
  reason?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  visible: boolean;
}

export function RoutingSuggestion({ target, reason, onConfirm, onDismiss, visible }: RoutingSuggestionProps) {
  const manifest = MODULE_MANIFEST[target];
  if (!manifest) return null;

  const Icon = manifest.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            'absolute bottom-[110%] left-4 right-4 z-[90]',
            'flex items-center gap-3 px-4 py-3 rounded-2xl',
            'border border-white/10 bg-black/40 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
            'mx-0'
          )}
          role="alert"
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: manifest.colorHex }} />
          <p className="text-sm text-white/70 flex-1 min-w-0">
            This sounds like a <span className="font-bold text-white/90">{manifest.title}</span> question.
          </p>
          <NeuralButton
            themeColor="cyan"
            size="sm"
            onClick={onConfirm}
          >
            Open {manifest.title} <ArrowRight className="w-3 h-3" />
          </NeuralButton>
          <NeuralButton
            themeColor="cyan"
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            aria-label="Dismiss suggestion"
          >
            <X className="w-4 h-4" />
          </NeuralButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
