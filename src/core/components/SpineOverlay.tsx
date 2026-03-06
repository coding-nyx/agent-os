import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';
import { useLocation } from 'react-router-dom';

type SpinePulse = SpineEvent & { uiId: string };

const DOMAIN_COLORS: Record<SpineEvent['domain'], string> = {
  B: 'bg-emerald-400',
  E: 'bg-indigo-400',
  C: 'bg-sky-400',
  R: 'bg-cyan-400',
  system: 'bg-violet-400'
};

export function SpineOverlay() {
  const [pulses, setPulses] = useState<SpinePulse[]>([]);
  const location = useLocation();
  const isHub = location.pathname === '/hub';

  useEffect(() => {
    return Spine.on('*', (event) => {
      setPulses((prev) => [
        { ...event, uiId: `${event.id}-${Date.now()}` },
        ...prev
      ].slice(0, 8));
    });
  }, []);

  useEffect(() => {
    if (pulses.length === 0) return;
    const timer = window.setTimeout(() => {
      setPulses((prev) => prev.slice(0, Math.max(prev.length - 1, 0)));
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [pulses]);

  const spineTicks = useMemo(() => Array.from({ length: 6 }, (_, i) => i), []);

  return (
    <motion.div
      className="fixed inset-y-0 right-10 z-[80] pointer-events-none hidden lg:flex items-center"
      animate={{ opacity: isHub ? 0 : 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="relative h-[70vh] w-2">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-white/5 via-white/20 to-white/5" />
        {spineTicks.map((tick) => (
          <div
            key={tick}
            className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white/10"
            style={{ top: `${(tick / (spineTicks.length - 1)) * 100}%` }}
          />
        ))}

        <AnimatePresence>
          {pulses.map((pulse, index) => {
            const color = DOMAIN_COLORS[pulse.domain] || 'bg-white/30';
            return (
              <motion.div
                key={pulse.uiId}
                initial={{ opacity: 0, scale: 0.5, y: 0 }}
                animate={{ opacity: 1, scale: 1.2, y: 0 }}
                exit={{ opacity: 0, scale: 2.2 }}
                className={`absolute left-1/2 -translate-x-1/2 rounded-full ${color}`}
                style={{
                  width: 10 + index * 1.5,
                  height: 10 + index * 1.5,
                  top: `${20 + (index * 12) % 60}%`,
                  boxShadow: '0 0 24px rgba(255,255,255,0.2)'
                }}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
