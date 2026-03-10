import React from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  sessions: MemoryResult[];
  facts: StableFact[];
  isSearching?: boolean;
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

export function MemorySearchResults({ query, sessions, facts, isSearching }: MemorySearchResultsProps) {
  if (isSearching) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <Search className="w-4 h-4 animate-pulse" />
          <span>Scanning memory for &quot;{query}&quot;…</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0 && facts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <Search className="w-3.5 h-3.5 text-white/40" />
        <span className="text-xs font-bold text-white/60">Memory Search: &quot;{query}&quot;</span>
      </div>

      {/* Session results */}
      {sessions.length > 0 && (
        <div className="p-3 space-y-2">
          {sessions.map((session, i) => (
            <div key={i} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors">
              <span className="text-[10px] text-white/30 font-mono shrink-0 mt-0.5">
                {new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <div className="flex-1 min-w-0">
                <span className={cn('text-[10px] font-bold uppercase', MODULE_COLORS[session.moduleId] || 'text-white/40')}>
                  [{session.moduleId}]
                </span>
                <p className="text-xs text-white/60 leading-relaxed mt-0.5 line-clamp-2">{session.summary}</p>
              </div>
              <span className="text-[10px] text-white/20 font-mono shrink-0">{session.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stable facts */}
      {facts.length > 0 && (
        <div className="px-4 py-3 border-t border-white/5">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 block mb-2">
            Stable Facts
          </span>
          <div className="space-y-1">
            {facts.map((fact, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="text-white/20">•</span>
                <span className="text-xs text-white/50">{fact.fact}</span>
                <span className="text-[10px] text-white/20 font-mono">({fact.confidence.toFixed(2)})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
