import React from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedMemoryResult } from '@/lib/types';

interface MemoryResult {
  moduleId: string;
  date: string;
  summary: string;
  score: number;
}

interface StableFact {
  fact: string;
  confidence: number;
}

interface MemorySearchResultsProps {
  query: string;
  results?: UnifiedMemoryResult[];
  sessions?: MemoryResult[];
  facts?: StableFact[];
  isSearching?: boolean;
  onResultClick?: (result: UnifiedMemoryResult) => void;
  onDismiss?: () => void;
}

const MODULE_COLORS: Record<string, string> = {
  orchestrator: 'text-violet-400',
  agnes: 'text-indigo-400',
  titan: 'text-orange-400',
  soma: 'text-emerald-400',
  ledger: 'text-cyan-400',
  atlas: 'text-sky-400',
  scout: 'text-lime-400',
};

export function MemorySearchResults({
  query,
  results,
  sessions = [],
  facts = [],
  isSearching,
  onResultClick,
  onDismiss,
}: MemorySearchResultsProps) {
  if (isSearching) {
    return (
      <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-4">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Search className="w-4 h-4 animate-pulse" />
          <span>Scanning memory for &quot;{query}&quot;…</span>
        </div>
      </div>
    );
  }

  const normalizedResults = results ?? [
    ...sessions.map<UnifiedMemoryResult>((session, index) => ({
      id: `episodic:${session.moduleId}:${index}:${session.date}`,
      type: 'episodic',
      moduleId: session.moduleId,
      text: session.summary,
      score: session.score,
      timestamp: session.date,
      citation: {
        type: 'episodic',
        moduleId: session.moduleId,
        label: session.summary,
      },
    })),
    ...facts.map<UnifiedMemoryResult>((fact, index) => ({
      id: `semantic:${index}:${fact.fact}`,
      type: 'semantic',
      moduleId: 'ara',
      text: fact.fact,
      score: fact.confidence,
      confidence: fact.confidence,
      timestamp: new Date(0).toISOString(),
      citation: {
        type: 'semantic',
        moduleId: 'ara',
        label: fact.fact,
      },
    })),
  ];

  if (normalizedResults.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/[0.09] bg-white/[0.045] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.09]">
        <Search className="w-3.5 h-3.5 text-white/40" />
        <span className="flex-1 text-xs font-bold text-white/60">Memory Search: &quot;{query}&quot;</span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full border border-white/[0.12] p-1 text-white/35 transition hover:border-white/20 hover:text-white/60"
            aria-label="Dismiss memory results"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="p-3 space-y-2">
        {normalizedResults.map((result) => (
          <button
            type="button"
            key={result.id}
            onClick={() => onResultClick?.(result)}
            className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.045] transition-colors"
            data-testid={`memory-result-${result.id}`}
          >
            <span className="text-[11px] text-white/30 font-mono shrink-0 mt-0.5">
              {new Date(result.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('text-[11px] font-bold uppercase', MODULE_COLORS[result.moduleId] || 'text-white/40')}>
                  [{result.moduleId}]
                </span>
                <span className="rounded-full border border-white/[0.12] bg-white/[0.045] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  {result.type}
                </span>
                <span className="text-[11px] text-white/25">
                  {result.citation.entityId ? `Source ${result.citation.entityId}` : result.citation.label}
                </span>
              </div>
              <p className="text-xs text-white/60 leading-relaxed mt-0.5 line-clamp-2">{result.text}</p>
            </div>
            <span className="text-[11px] text-white/20 font-mono shrink-0">
              {typeof result.confidence === 'number' ? result.confidence.toFixed(2) : result.score.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
