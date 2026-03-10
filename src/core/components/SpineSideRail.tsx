import { useEffect, useState } from 'react';
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

export function SpineSideRail() {
  const [events, setEvents] = useState<SpineEvent[]>([]);

  useEffect(() => {
    return Spine.on('*', (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 4));
    });
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="absolute right-6 top-28 hidden xl:flex flex-col gap-3 pointer-events-none">
      {events.map((event) => (
        <div
          key={event.id}
          className="w-48 rounded-2xl border border-white/10 bg-black/40 px-3 py-2"
        >
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${DOMAIN_COLOR[event.domain]}`}>
              {DOMAIN_TEXT[event.domain]}
            </span>
            <span className="text-[9px] text-white/50 uppercase tracking-[0.12em]">{event.type}</span>
          </div>
          <div className="mt-1 text-[9px] text-white/45 uppercase tracking-[0.12em]">
            {event.source}
          </div>
        </div>
      ))}
    </div>
  );
}
