/**
 * SoulActivityTag — real-time Spine event indicator.
 *
 * Subscribes to all Spine events. Shows the last event type with a 3-second
 * TTL; fades out after inactivity. Zero render cost when debugMode is off.
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';

const ACTIVE_TTL_MS = 3000;

interface SoulActivityTagProps {
  moduleTitle: string;
  debugMode: boolean;
}

export function SoulActivityTag({ moduleTitle, debugMode }: SoulActivityTagProps) {
  if (!debugMode) return null;

  return <SoulActivityTagInner moduleTitle={moduleTitle} />;
}

/** Inner component — only mounted when debugMode is true. */
function SoulActivityTagInner({ moduleTitle: _moduleTitle }: { moduleTitle: string }) {
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const ttlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEvent = (event: SpineEvent) => {
    setLastEventType(event.type);
    setIsActive(true);

    if (ttlTimerRef.current) clearTimeout(ttlTimerRef.current);
    ttlTimerRef.current = setTimeout(() => {
      setIsActive(false);
    }, ACTIVE_TTL_MS);
  };

  // Subscribe to all Spine events
  useSpineEvent('*', handleEvent);

  // Seed with most recent event from the bus if any
  useEffect(() => {
    const recent = Spine.getRecentEvents();
    if (recent.length > 0) {
      const latest = recent[recent.length - 1];
      setLastEventType(latest.type);
    }
    return () => {
      if (ttlTimerRef.current) clearTimeout(ttlTimerRef.current);
    };
  }, []);

  const statusLabel = isActive ? 'Soul: active' : 'Soul: idle';
  const dotColor = isActive ? 'bg-emerald-400' : 'bg-white/20';

  return (
    <AnimatePresence>
      <motion.div
        key="soul-tag"
        initial={{ opacity: 0 }}
        animate={{ opacity: isActive ? 1 : 0.5 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-1.5 shrink-0 hidden sm:flex"
        aria-label={statusLabel}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${dotColor} ${isActive ? 'animate-pulse' : ''}`}
        />
        <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-mono whitespace-nowrap">
          {lastEventType && isActive ? (
            <>{statusLabel} · <span className="opacity-70">{lastEventType}</span></>
          ) : (
            statusLabel
          )}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
