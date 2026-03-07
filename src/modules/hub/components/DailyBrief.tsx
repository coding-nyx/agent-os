import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { TrendArrow, type TrendDirection } from '@/core/components/TrendArrow';
import {
  DOMAIN_PILLARS,
  DOMAIN_ORDER,
  computePillarState,
  generateBriefSentence
} from '@/lib/state-display-config';
import type { StatusTone } from '../constants';

// ---------------------------------------------------------------------------
// Pillar Card — one per domain (Body, Mind, Heart, Flow)
// ---------------------------------------------------------------------------

interface PillarCardProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  word: string;
  tone: StatusTone;
  trend: TrendDirection;
  accentColor: string;
  index: number;
  reducedMotion: boolean;
}

const TONE_ACCENT: Record<StatusTone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/5',
  warn: 'border-amber-500/30 bg-amber-500/5',
  bad: 'border-rose-500/30 bg-rose-500/5',
  neutral: 'border-white/10 bg-white/[0.02]'
};

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  neutral: 'bg-white/30'
};

const TONE_TEXT: Record<StatusTone, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  neutral: 'text-white/40'
};

function PillarCard({
  label,
  icon: Icon,
  word,
  tone,
  trend,
  accentColor,
  index,
  reducedMotion
}: PillarCardProps) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { delay: index * 0.1, duration: 0.4 }}
      className={cn(
        'rounded-2xl border p-4 min-w-[120px] space-y-2 transition-colors',
        TONE_ACCENT[tone]
      )}
      role="status"
      aria-label={`${label}: ${word}, ${trend === 'up' ? 'trending up' : trend === 'down' ? 'trending down' : trend === 'stable' ? 'stable' : 'not calibrated'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', TONE_TEXT[tone])} />
          <span className="text-[10px] uppercase tracking-[0.2em] font-black text-white/50">
            {label}
          </span>
        </div>
        <TrendArrow trend={trend} size="sm" />
      </div>
      <div className="flex items-center gap-2">
        <div
          className={cn('w-2 h-2 rounded-full', TONE_DOT[tone])}
          aria-hidden="true"
        />
        <span className={cn('text-lg font-black italic uppercase tracking-tight', TONE_TEXT[tone])}>
          {word}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Cascade Alert Banner (collapsed single-sentence)
// ---------------------------------------------------------------------------

interface CascadeEvent {
  type: string;
  source: string;
  timestamp: number;
}

function CascadeAlertBanner({
  events,
  moduleNames
}: {
  events: CascadeEvent[];
  moduleNames: Record<string, string>;
}) {
  if (events.length === 0) return null;

  // Find the most recent cascade chain
  const latest = events[0];
  const sources = events
    .map(e => {
      const raw = e.source.replace('cascade:', '');
      return moduleNames[raw] || raw;
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  const timeAgo = formatTimeAgo(latest.timestamp);

  return (
    <div
      role="alert"
      className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-start gap-3"
    >
      <Zap className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 leading-relaxed">
          Your modules coordinated{' '}
          <span className="text-white/90 font-bold">{timeAgo}</span>
          {sources.length > 0 && (
            <>
              {' — '}
              <span className="text-violet-300 font-bold">{sources.join(' → ')}</span>
            </>
          )}
        </p>
        <button
          className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-violet-400 hover:text-violet-300 transition-colors"
          aria-label="View cascade timeline"
        >
          View timeline →
        </button>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ---------------------------------------------------------------------------
// Greeting helper
// ---------------------------------------------------------------------------

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 17) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}

// ---------------------------------------------------------------------------
// DailyBrief — Main Export
// ---------------------------------------------------------------------------

export function DailyBrief() {
  const { globalSoul } = useGlobalSoul();
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();

  const nsv = globalSoul?.crossFunctionalState ?? null;
  const displayNames = globalSoul?.displayNames ?? {};
  const userName = profile?.preferredName || 'there';

  const pillars = useMemo(() => {
    return DOMAIN_ORDER.map(domain => {
      const config = DOMAIN_PILLARS[domain];
      const { word, tone } = computePillarState(nsv, domain);
      // TODO: trend requires historical comparison — default to 'unknown' for now
      const trend: TrendDirection = 'unknown';
      return { domain, config, word, tone, trend };
    });
  }, [nsv]);

  const briefSentence = useMemo(() => {
    const pillarMap: Record<string, { tone: StatusTone; trend: TrendDirection }> = {};
    pillars.forEach(p => {
      pillarMap[p.domain] = { tone: p.tone, trend: p.trend };
    });
    return generateBriefSentence({
      name: userName,
      pillars: pillarMap,
      moduleNames: displayNames
    });
  }, [pillars, userName, displayNames]);

  const greeting = getGreeting(userName);

  // Cascade events — read from recent spine events
  // For now, no events — CascadeTimeline will provide these
  const cascadeEvents: CascadeEvent[] = [];

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
      className="w-full max-w-[1200px] mx-auto mb-10"
      aria-label="Daily wellness brief"
    >
      <h2 className="text-2xl md:text-3xl font-black italic text-white tracking-tight mb-6">
        {greeting}
      </h2>

      {/* Pillar Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {pillars.map((p, i) => (
          <PillarCard
            key={p.domain}
            label={p.config.label}
            icon={p.config.icon}
            word={p.word}
            tone={p.tone}
            trend={p.trend}
            accentColor={p.config.accentColor}
            index={i}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>

      {/* Brief Sentence */}
      <p
        className="mt-5 text-sm text-white/60 leading-relaxed max-w-2xl"
        role="status"
        aria-live="polite"
      >
        {briefSentence}
      </p>

      {/* Cascade Alert */}
      <CascadeAlertBanner events={cascadeEvents} moduleNames={displayNames} />
    </motion.section>
  );
}
