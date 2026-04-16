/**
 * DebugActivityOverlay — real-time system event overlay for debug mode.
 *
 * Fixed bottom-right panel showing AI state, spine events, profile writes,
 * uploads, and actions. Collapsible to a small pill. Zero render cost when
 * debug mode is OFF.
 *
 * Z-index: var(--z-overlay) — below modals, above content.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, ChevronDown, Copy, Filter } from 'lucide-react';
import { useDebugMode } from '@/lib/hooks/use-debug-mode';
import { useDebugEventStream, useDebugEventCount } from '@/lib/hooks/use-debug-event-stream';
import type { DebugEvent, DebugEventCategory } from '@/lib/ara-logger';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ara_debug_overlay_expanded';

const CATEGORY_COLORS: Record<DebugEventCategory, string> = {
  action: 'text-violet-400',
  spine: 'text-emerald-400',
  error: 'text-red-400',
  profile: 'text-sky-400',
  upload: 'text-amber-400',
  handoff: 'text-fuchsia-400',
  vault: 'text-rose-400',
  ai: 'text-indigo-400',
};

const CATEGORY_BG: Record<DebugEventCategory, string> = {
  action: 'bg-violet-500/15',
  spine: 'bg-emerald-500/15',
  error: 'bg-red-500/15',
  profile: 'bg-sky-500/15',
  upload: 'bg-amber-500/15',
  handoff: 'bg-fuchsia-500/15',
  vault: 'bg-rose-500/15',
  ai: 'bg-indigo-500/15',
};

const CATEGORY_LABELS: Record<DebugEventCategory, string> = {
  action: 'ACT',
  spine: 'SPN',
  error: 'ERR',
  profile: 'PRF',
  upload: 'UPL',
  handoff: 'HND',
  vault: 'VLT',
  ai: 'AI',
};

const ALL_CATEGORIES: DebugEventCategory[] = [
  'ai', 'action', 'spine', 'profile', 'upload', 'handoff', 'vault', 'error',
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function EventRow({ event }: { event: DebugEvent }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => event.detail && setShowDetail((v) => !v)}
        className="w-full flex items-start gap-1.5 py-1 px-1.5 text-left hover:bg-white/[0.045] rounded transition-colors"
      >
        <span
          className={cn(
            'shrink-0 text-[11px] font-black uppercase tracking-wider mt-0.5 px-1 py-0.5 rounded',
            CATEGORY_BG[event.category],
            CATEGORY_COLORS[event.category],
          )}
        >
          {CATEGORY_LABELS[event.category]}
        </span>
        <span className="text-[11px] text-white/30 font-mono shrink-0 mt-0.5 tabular-nums">
          {formatTime(event.timestamp)}
        </span>
        <span className="text-[11px] text-white/60 font-mono break-all leading-tight flex-1 min-w-0">
          {event.moduleId && (
            <span className="text-white/30">{event.moduleId}:</span>
          )}
          {event.label}
        </span>
      </button>
      <AnimatePresence>
        {showDetail && !!event.detail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <pre className="text-[11px] text-white/30 font-mono px-2 pb-1.5 break-all whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto no-scrollbar">
              {typeof event.detail === 'string'
                ? event.detail
                : JSON.stringify(event.detail, null, 2)?.slice(0, 800) ?? ''}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DebugActivityOverlay() {
  const { debugMode } = useDebugMode();

  if (!debugMode) return null;

  return <DebugActivityOverlayInner />;
}

function DebugActivityOverlayInner() {
  const [isExpanded, setIsExpanded] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [activeFilter, setActiveFilter] = useState<DebugEventCategory | '*'>('*');
  const [showFilterBar, setShowFilterBar] = useState(false);
  const events = useDebugEventStream(true, activeFilter);
  const { sinceLastOpen, resetCounter } = useDebugEventCount(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevEventCountRef = useRef(events.length);

  // Persist expanded state
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(isExpanded)); } catch { /* noop */ }
    if (isExpanded) resetCounter();
  }, [isExpanded, resetCounter]);

  // Auto-scroll to bottom on new events when expanded
  useEffect(() => {
    if (!isExpanded || !scrollRef.current) return;
    if (events.length > prevEventCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevEventCountRef.current = events.length;
  }, [events.length, isExpanded]);

  const handleCopy = useCallback(() => {
    const text = events
      .map((e) => `[${formatTime(e.timestamp)}] ${CATEGORY_LABELS[e.category]} ${e.moduleId ? e.moduleId + ':' : ''}${e.label}`)
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }, [events]);

  const toggleExpand = () => setIsExpanded((v) => !v);

  return (
    <div
      className="fixed z-[var(--z-overlay)] pointer-events-auto"
      style={{
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
        right: 'calc(8px + env(safe-area-inset-right, 0px))',
      }}
    >
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-[340px] sm:w-[400px] max-h-[50vh] flex flex-col rounded-xl border border-amber-500/20 bg-slate-900/95 backdrop-blur-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.09] shrink-0">
              <Bug className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-400/80 flex-1">
                Debug Activity
              </span>
              <span className="text-[11px] font-mono text-white/30 tabular-nums">
                {events.length} events
              </span>
              <button
                type="button"
                onClick={() => setShowFilterBar((v) => !v)}
                className="p-1 rounded hover:bg-white/[0.045] transition-colors"
                aria-label="Toggle filters"
              >
                <Filter className="w-3 h-3 text-white/40" />
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded hover:bg-white/[0.045] transition-colors"
                aria-label="Copy events"
              >
                <Copy className="w-3 h-3 text-white/40" />
              </button>
              <button
                type="button"
                onClick={toggleExpand}
                className="p-1 rounded hover:bg-white/[0.045] transition-colors"
                aria-label="Collapse debug overlay"
              >
                <ChevronDown className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {/* Filter bar */}
            <AnimatePresence>
              {showFilterBar && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden border-b border-white/[0.09]"
                >
                  <div className="flex flex-wrap gap-1 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setActiveFilter('*')}
                      className={cn(
                        'text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full transition-colors',
                        activeFilter === '*'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-white/[0.045] text-white/30 hover:text-white/50',
                      )}
                    >
                      ALL
                    </button>
                    {ALL_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveFilter(cat)}
                        className={cn(
                          'text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full transition-colors',
                          activeFilter === cat
                            ? cn(CATEGORY_BG[cat], CATEGORY_COLORS[cat])
                            : 'bg-white/[0.045] text-white/30 hover:text-white/50',
                        )}
                      >
                        {CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Event list */}
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-1.5 py-1"
            >
              {events.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <span className="text-[11px] text-white/20 font-mono">
                    Waiting for events…
                  </span>
                </div>
              ) : (
                events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))
              )}
            </div>
          </motion.div>
        ) : (
          /* Collapsed — icon only */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            type="button"
            onClick={toggleExpand}
            className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-amber-500/20 bg-slate-900/90 backdrop-blur-xl shadow-lg hover:bg-slate-900/95 transition-colors"
            aria-label="Expand debug overlay"
          >
            <Bug className="w-3.5 h-3.5 text-amber-400/70" />
            {sinceLastOpen > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center px-0.5 rounded-full bg-amber-500/30 text-amber-400 text-[11px] font-black tabular-nums border border-black/50">
                {sinceLastOpen > 99 ? '99+' : sinceLastOpen}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
