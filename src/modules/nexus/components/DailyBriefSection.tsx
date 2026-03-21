import React, { useMemo, useState } from 'react';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import {
  DOMAIN_PILLARS,
  DOMAIN_ORDER,
  computePillarState,
  generateBriefSentence,
} from '@/lib/state-display-config';
import { TrendArrow, type TrendDirection } from '@/core/components/TrendArrow';
import { useNsvTrends } from '../hooks/useNsvTrends';
import { GlassCard } from '@/core/components/GlassCard';
import type { StatusTone } from '@/modules/hub/constants';

const TONE_ACCENT: Record<StatusTone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/5',
  warn: 'border-amber-500/30 bg-amber-500/5',
  bad: 'border-rose-500/30 bg-rose-500/5',
  neutral: 'border-white/35 bg-white/[0.08]',
};

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  neutral: 'bg-white/70',
};

const TONE_TEXT: Record<StatusTone, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  neutral: 'text-white/75',
};

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}.`;
  if (hour < 17) return `Good afternoon, ${name}.`;
  return `Good evening, ${name}.`;
}

interface DailyBriefSectionProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onAskAboutDomain?: (domain: string) => void;
  headerActions?: React.ReactNode;
}

export function DailyBriefSection({ collapsed = false, onToggleCollapse, onAskAboutDomain, headerActions }: DailyBriefSectionProps) {
  const { globalSoul } = useGlobalSoul();
  const auth = useAuth();
  const profile = auth?.profile;
  const reducedMotion = useReducedMotion();

  const nsv = globalSoul?.crossFunctionalState ?? null;
  const displayNames = globalSoul?.displayNames ?? {};
  const userName = profile?.preferredName || 'there';

  const trends = useNsvTrends();

  const pillars = useMemo(() => {
    return DOMAIN_ORDER.map((domain) => {
      const config = DOMAIN_PILLARS[domain];
      const { word, tone } = computePillarState(nsv, domain);
      const trend: TrendDirection = trends[domain] ?? 'unknown';
      return { domain, config, word, tone, trend };
    });
  }, [nsv, trends]);

  const briefSentence = useMemo(() => {
    const pillarMap: Record<string, { tone: StatusTone; trend: TrendDirection }> = {};
    pillars.forEach((p) => {
      pillarMap[p.domain] = { tone: p.tone, trend: p.trend };
    });
    return generateBriefSentence({ name: userName, pillars: pillarMap, moduleNames: displayNames });
  }, [pillars, userName, displayNames]);

  const greeting = getGreeting(userName);

  // Recent cascade events — reactive via Spine subscription
  const [cascadeEvents, setCascadeEvents] = useState(() =>
    Spine.getRecentEvents()
      .filter((e) => e.source.startsWith('cascade:'))
      .slice(0, 3)
  );
  useSpineEvent('*', () => {
    setCascadeEvents(
      Spine.getRecentEvents()
        .filter((e) => e.source.startsWith('cascade:'))
        .slice(0, 3)
    );
  });

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
      className="w-full"
      aria-label="Daily wellness brief"
      data-testid="daily-brief"
      data-collapsed={String(collapsed)}
    >
      {/* Header row — Always visible greeting that serves as the toggle trigger */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-nowrap">
        <button
          type="button"
          onClick={onToggleCollapse}
          disabled={!onToggleCollapse}
          className={cn(
            "flex items-center gap-3 transition-opacity focus:outline-none text-left select-none group min-w-0 flex-1",
            onToggleCollapse ? "cursor-pointer hover:opacity-80" : "cursor-default"
          )}
        >
          <h2 className="text-xl font-bold text-white tracking-tight font-display leading-none truncate whitespace-nowrap">{greeting}</h2>
          {onToggleCollapse && (
            <div className="text-white/20 group-hover:text-white/40 transition-colors pt-0.5">
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          )}
        </button>
        {headerActions && (
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* Pillar cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {pillars.map((p, i) => {
              const Icon = p.config.icon;
              return (
                <motion.button
                  key={p.domain}
                  type="button"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { delay: i * 0.08, duration: 0.3 }}
                  whileHover={reducedMotion ? undefined : { scale: 1.02 }}
                  onClick={() => onAskAboutDomain?.(p.domain)}
                  className="p-0 border-none h-auto bg-transparent text-left"
                  aria-label={`${p.config.label}: ${p.word}`}
                >
                  <GlassCard className={cn('w-full cursor-pointer px-4 py-3.5 space-y-2 hover:border-white/15 transition-colors', TONE_ACCENT[p.tone])}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('w-4 h-4', p.tone === 'neutral' ? 'text-white/70' : TONE_TEXT[p.tone])} />
                        <span className={cn(
                          "text-[11px] uppercase tracking-[0.12em] font-bold",
                          p.tone === 'neutral' ? "text-white/70" : "text-white/50"
                        )}>
                          {p.config.label}
                        </span>
                      </div>
                      {p.tone !== 'neutral' && <TrendArrow trend={p.trend} size="sm" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.tone !== 'neutral' && <div className={cn('w-2 h-2 rounded-full', TONE_DOT[p.tone])} />}
                      <span className={cn(
                        'text-base font-bold uppercase tracking-tight font-display', 
                        p.tone === 'neutral' ? 'text-white/85' : TONE_TEXT[p.tone]
                      )}>
                        {p.word}
                      </span>
                    </div>
                  </GlassCard>
                </motion.button>
              );
            })}
          </div>

          {/* Brief sentence */}
          <p className="text-sm text-white/50 leading-relaxed">{briefSentence}</p>

          {/* Cascade events */}
          {cascadeEvents.length > 0 && (
            <div className="mt-3 rounded-xl border border-violet-500/15 bg-violet-500/5 px-4 py-2.5">
              <p className="text-xs text-white/50">
                ⚡ Modules coordinated recently — {cascadeEvents.length} cascade event{cascadeEvents.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
