
import React from 'react';
import { motion } from 'framer-motion';

interface BootLoaderProps {
  message?: string;
}

export function BootLoader({ message = "Loading..." }: BootLoaderProps) {
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'var(--void, #020205)' }}
    >
      {/* Ambient radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 700px 450px at 50% 50%, rgba(99,102,241,0.055) 0%, transparent 70%)',
        }}
      />

      <motion.div
        className="relative flex flex-col items-center gap-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Brand mark */}
        <div className="relative flex items-center justify-center w-16 h-16">
          {/* Breathing outer ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-indigo-500/20"
            animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.15, 0.5] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Static middle ring */}
          <div className="absolute inset-[10px] rounded-full border border-indigo-500/15" />
          {/* Core dot */}
          <motion.div
            className="w-3 h-3 rounded-full bg-indigo-400"
            style={{ boxShadow: '0 0 12px rgba(99,102,241,0.7), 0 0 28px rgba(99,102,241,0.2)' }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Loading track + message */}
        <div className="flex flex-col items-center gap-3">
          {/* Sweep track */}
          <div
            className="relative w-36 overflow-hidden rounded-full"
            style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }}
          >
            <motion.div
              className="absolute inset-y-0 w-full rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.0) 10%, rgba(99,102,241,0.55) 50%, rgba(99,102,241,0.0) 90%, transparent 100%)',
              }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          {/* Label */}
          <p
            className="text-[11px] font-medium tracking-[0.22em] uppercase"
            style={{ color: 'rgba(255,255,255,0.38)' }}
          >
            {message}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
