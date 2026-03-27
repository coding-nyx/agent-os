import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';

const DOMAIN_TEXT: Record<SpineEvent['domain'], string> = {
  B: 'BIO',
  E: 'EMO',
  C: 'COG',
  R: 'RES',
  system: 'SYS'
};

const DOMAIN_COLOR: Record<SpineEvent['domain'], string> = {
  B: 'text-emerald-300',
  E: 'text-indigo-300',
  C: 'text-sky-300',
  R: 'text-cyan-300',
  system: 'text-violet-300'
};

const DOMAIN_DOT: Record<SpineEvent['domain'], string> = {
  B: 'bg-emerald-400',
  E: 'bg-indigo-400',
  C: 'bg-sky-400',
  R: 'bg-cyan-400',
  system: 'bg-violet-400'
};

export function SpineSideRail() {
  const [events, setEvents] = useState<SpineEvent[]>([]);

  useEffect(() => {
    return Spine.on('*', (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 4));
    });
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="absolute right-4 top-28 hidden xl:flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {events.map((event) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-44 rounded-xl border border-white/[0.09] bg-slate-900/80 backdrop-blur-sm px-3 py-2 shadow-lg shadow-black/40"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOMAIN_DOT[event.domain]}`} />
              <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${DOMAIN_COLOR[event.domain]}`}>
                {DOMAIN_TEXT[event.domain]}
              </span>
              <span className="ml-auto text-[11px] text-white/40 uppercase tracking-[0.08em] truncate max-w-[80px]">{event.type}</span>
            </div>
            <div className="text-[11px] text-white/45 uppercase tracking-[0.08em] truncate">
              {event.source}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
