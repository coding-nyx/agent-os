import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useMotionConfig } from '@/lib/hooks/use-motion-config';
import { EVENT_DISPLAY_NAMES } from '@/lib/state-display-config';
import type { SpineEvent, SpineEventType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CascadeChain {
  id: string;
  timestamp: number;
  rootEvent: SpineEvent;
  children: SpineEvent[];
}

// ---------------------------------------------------------------------------
// Domain colors (matching SpineOverlay & SpineSideRail)
// ---------------------------------------------------------------------------

const DOMAIN_DOT_COLOR: Record<SpineEvent['domain'], string> = {
  B: 'bg-emerald-400',
  E: 'bg-indigo-400',
  C: 'bg-sky-400',
  R: 'bg-cyan-400',
  system: 'bg-violet-400'
};

const PRIORITY_BORDER: Record<SpineEvent['priority'], string> = {
  info: 'border-white/10',
  alert: 'border-amber-500/20',
  critical: 'border-rose-500/20'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelative(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function getEventLabel(event: SpineEvent, moduleNames: Record<string, string>): string {
  const baseName = EVENT_DISPLAY_NAMES[event.type] || event.type;

  // Resolve source module name
  const rawSource = event.source.replace(/^cascade:/, '');
  const sourceName = moduleNames[rawSource] || rawSource;

  // Build a human-readable sentence
  switch (event.type as SpineEventType) {
    case 'CLEARANCE_DENIED':
      return `${sourceName} denied activity clearance`;
    case 'BLOCK_HIGH_INTENSITY':
      return `${sourceName} blocked high-intensity training`;
    case 'FLATTEN_ENERGY_WAVE':
      return `${sourceName} lightened your schedule`;
    case 'BURNOUT_WARNING':
      return 'Burnout risk detected';
    case 'FINANCIAL_STRESS':
      return 'Financial stress flagged';
    case 'RECOVERY_AVAILABLE':
      return `${sourceName} opened a recovery window`;
    default:
      return baseName;
  }
}

/**
 * Groups spine events into cascade chains.
 * Events within 2s of each other with `cascade:` in source are grouped.
 */
function groupIntoCascadeChains(events: SpineEvent[]): CascadeChain[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const chains: CascadeChain[] = [];
  const used = new Set<string>();

  for (const event of sorted) {
    if (used.has(event.id)) continue;

    const isCascadeChild = event.source.startsWith('cascade:');
    if (isCascadeChild) continue; // children are attached to their parent

    const chain: CascadeChain = {
      id: event.id,
      timestamp: event.timestamp,
      rootEvent: event,
      children: []
    };

    used.add(event.id);

    // Find cascade children within 3s window
    for (const candidate of sorted) {
      if (used.has(candidate.id)) continue;
      if (!candidate.source.startsWith('cascade:')) continue;
      if (Math.abs(candidate.timestamp - event.timestamp) > 3000) continue;
      chain.children.push(candidate);
      used.add(candidate.id);
    }

    chains.push(chain);
  }

  return chains;
}

// ---------------------------------------------------------------------------
// CascadeChainItem — a single chain (root + children)
// ---------------------------------------------------------------------------

interface CascadeChainItemProps {
  chain: CascadeChain;
  moduleNames: Record<string, string>;
  reducedMotion: boolean;
}

function CascadeChainItem({ chain, moduleNames, reducedMotion }: CascadeChainItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = chain.children.length > 0;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white/[0.02] overflow-hidden transition-colors',
        PRIORITY_BORDER[chain.rootEvent.priority]
      )}
      role="article"
      aria-label={getEventLabel(chain.rootEvent, moduleNames)}
    >
      {/* Root Event */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 mt-1">
            <div
              className={cn('w-2.5 h-2.5 rounded-full shrink-0', DOMAIN_DOT_COLOR[chain.rootEvent.domain])}
              aria-hidden="true"
            />
            {hasChildren && (
              <div className="w-px flex-1 bg-white/10 min-h-[16px]" aria-hidden="true" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white/85 leading-snug">
                {getEventLabel(chain.rootEvent, moduleNames)}
              </p>
              <time
                dateTime={new Date(chain.rootEvent.timestamp).toISOString()}
                className="text-[10px] text-white/35 uppercase tracking-wider shrink-0"
              >
                {formatTime(chain.rootEvent.timestamp)}
              </time>
            </div>

            {/* Event type badge (for power users) */}
            <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-white/5 text-[8px] font-mono text-white/30 uppercase tracking-wider">
              {chain.rootEvent.type}
            </span>
          </div>
        </div>

        {/* Expand/Collapse for cascade children */}
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 hover:text-violet-300 transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse cascade chain' : 'Expand cascade chain'}
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            {chain.children.length} cascaded effect{chain.children.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Cascade Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
            className="border-t border-white/5 bg-white/[0.01]"
          >
            {chain.children.map((child, idx) => (
              <div
                key={child.id}
                className={cn(
                  'px-4 py-3 flex items-start gap-3',
                  idx < chain.children.length - 1 && 'border-b border-white/5'
                )}
              >
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className="w-px h-2 bg-white/10" aria-hidden="true" />
                  <div
                    className={cn('w-2 h-2 rounded-full shrink-0', DOMAIN_DOT_COLOR[child.domain])}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/65 leading-relaxed">
                    {getEventLabel(child, moduleNames)}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/5 text-[7px] font-mono text-white/25 uppercase tracking-wider">
                    {child.type}
                  </span>
                </div>
                <time
                  dateTime={new Date(child.timestamp).toISOString()}
                  className="text-[9px] text-white/30 tracking-wider shrink-0"
                >
                  {formatTime(child.timestamp)}
                </time>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

// ---------------------------------------------------------------------------
// CascadeTimeline — Main Export
// ---------------------------------------------------------------------------

interface CascadeTimelineProps {
  maxChains?: number;
  className?: string;
}

export function CascadeTimeline({ maxChains = 10, className }: CascadeTimelineProps) {
  const { globalSoul } = useGlobalSoul();
  const { shouldReduceMotion, transition } = useMotionConfig();
  const reducedMotion = shouldReduceMotion;
  const [events, setEvents] = useState<SpineEvent[]>([]);

  const moduleNames = globalSoul?.displayNames ?? {};

  // Subscribe to spine events
  useEffect(() => {
    return Spine.on('*', (event) => {
      // Filter out low-priority info events for the timeline
      if (event.priority === 'info' && event.type === 'VITAL_UPDATED') return;
      if (event.type === 'SESSION_STARTED' || event.type === 'SESSION_ENDED') return;

      setEvents(prev => [event, ...prev].slice(0, 50));
    });
  }, []);

  const chains = useMemo(
    () => groupIntoCascadeChains(events).slice(0, maxChains),
    [events, maxChains]
  );

  if (chains.length === 0) {
    return (
      <div className={cn('text-center py-8', className)}>
        <Zap className="w-6 h-6 text-white/20 mx-auto mb-3" aria-hidden="true" />
        <p className="text-xs text-white/40 uppercase tracking-[0.2em] font-bold">
          No recent cascade events
        </p>
        <p className="text-[10px] text-white/30 mt-1">
          Events appear here when your modules coordinate.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn('space-y-3', className)}
      role="feed"
      aria-label="Cascade event timeline"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 italic">
          Cascade Timeline
        </h3>
        <span className="text-[9px] text-white/30 uppercase tracking-wider">
          {chains.length} event{chains.length !== 1 ? 's' : ''}
        </span>
      </div>

      {chains.map(chain => (
        <CascadeChainItem
          key={chain.id}
          chain={chain}
          moduleNames={moduleNames}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}
