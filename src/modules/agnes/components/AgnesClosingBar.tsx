import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NeuralButton } from '@/core/components/NeuralButton';

interface AgnesClosingBarProps {
  visible: boolean;
  onClose: () => void;
  isBusy: boolean;
}

export function AgnesClosingBar({ visible, onClose, isBusy }: AgnesClosingBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-indigo-950/40 backdrop-blur border-t border-indigo-500/20"
        >
          <span className="text-sm text-indigo-200/60">
            Ready to close when you are.
          </span>
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isBusy}
          >
            Close Session
          </NeuralButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
