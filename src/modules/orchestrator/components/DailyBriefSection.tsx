import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { Spine } from '@/lib/spine/spine-event-bus';
import {
  DOMAIN_PILLARS,
  DOMAIN_ORDER,
  computePillarState,
  generateBriefSentence,
} from '@/lib/state-display-config';
import { TrendArrow, type TrendDirection } from '@/core/components/TrendArrow';
import type { StatusTone } from '@/modules/hub/constants';

const TONE_ACCENT: Record<StatusTone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/5',
  warn: 'border-amber-500/30 bg-amber-500/5',
  bad: 'border-rose-500/30 bg-rose-500/5',
  neutral: 'border-white/10 bg-white/[0.02]',
};

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  neutral: 'bg-white/30',
};

const TONE_TEXT: Record<StatusTone, string> = {
  good: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  neutral: 'text-white/40',
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
}

export function DailyBriefSection({ collapsed = false, onToggleCollapse, onAskAboutDomain }: DailyBriefSectionProps) {
  const { globalSoul } = useGlobalSoul();
  const { profile } = useAuth();
  const reducedMotion = useReducedMotion();

  const nsv = globalSoul?.crossFunctionalState ?? null;
  const displayNames = globalSoul?.displayNames ?? {};
  const userName = profile?.preferredName || 'there';

  const pillars = useMemo(() => {
    return DOMAIN_ORDER.map((domain) => {
      const config = DOMAIN_PILLARS[domain];
      const { word, tone } = computePillarState(nsv, domain);
      const trend: TrendDirection = 'unknown';
      return { domain, config, word, tone, trend };
    });
  }, [nsv]);

  const briefSentence = useMemo(() => {
    const pillarMap: Record<string, { tone: StatusTone; trend: TrendDirection }> = {};
    pillars.forEach((p) => {
      pillarMap[p.domain] = { tone: p.tone, trend: p.trend };
    });
    return generateBriefSentence({ name: userName, pillars: pillarMap, moduleNames: displayNames });
  }, [pillars, userName, displayNames]);

  const greeting = getGreeting(userName);

  // Recent cascade events from Spine
  const cascadeEvents = useMemo(() => {
    return Spine.getRecentEvents()
      .filter((e) => e.source.startsWith('cascade:'))
      .slice(0, 3);
  }, []);

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
      className="w-full"
      aria-label="Daily wellness brief"
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white tracking-tight font-display">{greeting}</h2>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
            aria-label={collapsed ? 'Expand daily brief' : 'Collapse daily brief'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
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
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { delay: i * 0.08, duration: 0.3 }}
                  onClick={() => onAskAboutDomain?.(p.domain)}
                  className={cn(
                    'rounded-xl border px-4 py-3.5 space-y-2 text-left transition-colors',
                    'hover:border-white/15',
                    TONE_ACCENT[p.tone]
                  )}
                  aria-label={`${p.config.label}: ${p.word}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-4 h-4', TONE_TEXT[p.tone])} />
                      <span className="text-[11px] uppercase tracking-[0.12em] font-bold text-white/50">
                        {p.config.label}
                      </span>
                    </div>
                    <TrendArrow trend={p.trend} size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full', TONE_DOT[p.tone])} />
                    <span className={cn('text-base font-bold uppercase tracking-tight font-display', TONE_TEXT[p.tone])}>
                      {p.word}
                    </span>
                  </div>
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
