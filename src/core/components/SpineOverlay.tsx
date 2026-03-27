import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity } from 'lucide-react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';
import { useLocation } from 'react-router-dom';
import { useActiveLayout, useSpineVisible, useSetSpineVisible } from '@/lib/stores/ui-store';
import { cn } from '@/lib/utils';

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
  const activeLayout = useActiveLayout();
  const spineVisible = useSpineVisible();
  const setSpineVisible = useSetSpineVisible();

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

  // Read the CSS custom property published by SingleAgentLayout when a chat
  // sidebar is open. Falls back to the hardcoded clamp for pages that don't
  // use SingleAgentLayout.
  const rightOffset =
    activeLayout === 'split'
      ? 'calc(var(--spine-sidebar-width, clamp(320px, 32vw, 520px)) + 24px)'
      : '1.5rem';

  return (
    // Framer owns only opacity; `right` is driven by a CSS transition so the
    // browser can interpolate between the two string values natively.
    <motion.div
      className="fixed inset-y-0 z-[var(--z-overlay)] pointer-events-none hidden lg:flex items-center group/spine"
      style={{
        right: rightOffset,
        transition: 'right 0.45s cubic-bezier(0.32, 0, 0.67, 0)',
      }}
      animate={{ opacity: isHub ? 0 : 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Hover toggle — reveals on hovering anywhere over the spine area */}
      <button
        className={cn(
          'pointer-events-auto absolute -left-7 top-1/2 -translate-y-1/2',
          'w-5 h-5 rounded-full flex items-center justify-center',
          'border border-white/[0.12] bg-slate-900/70 backdrop-blur-sm',
          'opacity-0 group-hover/spine:opacity-100 transition-opacity duration-300',
          'focus:opacity-100 focus-visible:ring-1 focus-visible:ring-white/30',
        )}
        onClick={() => setSpineVisible(!spineVisible)}
        aria-label={spineVisible ? 'Hide spine indicator' : 'Show spine indicator'}
      >
        <Activity className={cn('w-2.5 h-2.5', spineVisible ? 'text-white/40' : 'text-white/15')} />
      </button>

      {spineVisible && (
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
      )}
    </motion.div>
  );
}
