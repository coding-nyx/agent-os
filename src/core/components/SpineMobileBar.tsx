/**
 * SpineMobileBar — mobile spine activity indicator.
 *
 * A 2px horizontal sweep bar that appears at the bottom of the mobile chat
 * header whenever a Spine event fires. Gives mobile users the same system
 * activity feedback that the vertical SpineOverlay provides on desktop.
 *
 * - Subscribes to all Spine events via wildcard listener
 * - Colors the bar with the domain color of the most-recent event
 * - Sweeps left→right via scaleX (origin-left) then fades out after 1.8 s
 * - aria-hidden: purely decorative, no semantic meaning
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEvent } from '@/lib/types';

const DOMAIN_HEX: Record<SpineEvent['domain'], string> = {
  B: '#34d399', // emerald-400
  E: '#818cf8', // indigo-400
  C: '#38bdf8', // sky-400
  R: '#22d3ee', // cyan-400
  system: '#a78bfa', // violet-400
};

interface SpineMobileBarProps {
  /** Fallback accent color (hex) used when no Spine event has fired yet. */
  accentColor?: string;
}

export function SpineMobileBar({ accentColor }: SpineMobileBarProps) {
  const [active, setActive] = useState(false);
  const [color, setColor] = useState(accentColor ?? '#ffffff40');

  useEffect(() => {
    let timeoutId: number | undefined;
    const unsub = Spine.on('*', (event: SpineEvent) => {
      setColor(DOMAIN_HEX[event.domain] ?? accentColor ?? '#ffffff40');
      setActive(true);
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setActive(false), 1800);
    });
    return () => {
      unsub();
      window.clearTimeout(timeoutId);
    };
  }, [accentColor]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="spine-mobile-bar"
          aria-hidden="true"
          initial={{ scaleX: 0, opacity: 0.8 }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="absolute bottom-0 left-0 right-0 h-[2px] origin-left pointer-events-none"
          style={{
            background: `linear-gradient(to right, ${color}30, ${color}, ${color}30)`,
          }}
        />
      )}
    </AnimatePresence>
  );
}
