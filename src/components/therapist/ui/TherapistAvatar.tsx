
import { motion, Variants } from 'framer-motion';
import { useEffect, useState } from 'react';

export type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking';

interface TherapistAvatarProps {
  state: AvatarState;
  className?: string;
}

export function TherapistAvatar({ state, className }: TherapistAvatarProps) {
  const [blink, setBlink] = useState(false);

  // Blinking effect
  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 4000 + Math.random() * 2000); // Random blink every 4-6s
    return () => clearInterval(interval);
  }, []);

  const eyeVariants: Variants = {
    idle: { scaleY: blink ? 0.1 : 1 },
    listening: { scaleY: blink ? 0.1 : 1, y: [0, 1, 0], transition: { repeat: Infinity, duration: 2, ease: "easeInOut" } }, // Subtle nod
    speaking: { scaleY: blink ? 0.1 : 1 },
    thinking: { scaleY: blink ? 0.1 : 1, x: [0, 5, -5, 0], transition: { duration: 2, repeat: Infinity } }
  };

  const mouthVariants: Variants = {
    idle: { scaleX: 0.8, scaleY: 0.2, borderRadius: 20 },
    listening: { scaleX: 0.9, scaleY: 0.25, borderRadius: 20 }, // Slight smile
    speaking: {
      scaleY: [0.2, 0.6, 0.3, 0.7, 0.2],
      transition: { repeat: Infinity, duration: 0.4, ease: "easeInOut" }
    },
    thinking: { scaleX: 0.5, scaleY: 0.2, borderRadius: 10, rotate: -5 } // Pursed lips
  };

  return (
    <div className={`relative w-48 h-48 flex items-center justify-center ${className}`}>
      {/* Background Aura */}
      <motion.div
        className="absolute inset-0 rounded-full bg-indigo-500/10 blur-xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* Head */}
      <motion.div
        className="relative w-32 h-32 bg-indigo-100 rounded-3xl shadow-lg border border-indigo-200 flex flex-col items-center justify-center overflow-hidden"
        animate={state === 'listening' ? { y: [0, 2, 0] } : {}}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Eyes Container */}
        <div className="flex gap-6 mb-4">
          <motion.div
            className="w-3 h-3 bg-slate-700 rounded-full"
            variants={eyeVariants}
            animate={state}
          />
          <motion.div
            className="w-3 h-3 bg-slate-700 rounded-full"
            variants={eyeVariants}
            animate={state}
          />
        </div>

        {/* Mouth */}
        <motion.div
          className="w-12 h-4 bg-slate-600 rounded-full"
          variants={mouthVariants}
          animate={state}
        />
      </motion.div>
    </div>
  );
}
