import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';

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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl',
            'border border-white/10 bg-white/[0.03] backdrop-blur-xl',
            'mx-4 mb-2'
          )}
          role="alert"
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: manifest.colorHex }} />
          <p className="text-sm text-white/70 flex-1 min-w-0">
            This sounds like a <span className="font-bold text-white/90">{manifest.title}</span> question.
          </p>
          <button
            onClick={onConfirm}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold',
              'bg-white/10 hover:bg-white/15 text-white/90 transition-colors'
            )}
          >
            Open {manifest.title} <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/60 transition-colors"
            aria-label="Dismiss suggestion"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
