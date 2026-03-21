/**
 * EvidenceView.tsx
 * 
 * Specialized split-pane view for examining the relationship between
 * synthesized knowledge nodes and their underlying evidence (sources & highlights).
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BookMarked, Quote, ExternalLink, ShieldCheck, Zap } from 'lucide-react';
import type { ScoutKnowledgeNode, SourceEntry, EvidenceHighlight } from '../types';

interface EvidenceViewProps {
  node: ScoutKnowledgeNode;
  sources: SourceEntry[];
  className?: string;
}

export function EvidenceView({ node, sources, className }: EvidenceViewProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    node.evidence?.[0] || null
  );

  const nodeSources = sources.filter(s => node.evidence.includes(s.id));
  const activeSource = nodeSources.find(s => s.id === selectedSourceId) || nodeSources[0];

  return (
    <div className={cn("flex flex-col h-full bg-[#05050a] rounded-2xl overflow-hidden border border-white/10", className)}>
      {/* Node Header */}
      <div className="p-4 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-lime-500/20 border border-lime-500/30">
            <Zap className="w-4 h-4 text-lime-400" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-lime-400">Synthesized Finding</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold text-white/40">Confidence</span>
            <span className="text-xs font-mono text-lime-400">{Math.round(node.confidence * 100)}%</span>
          </div>
        </div>
        <h3 className="text-base font-semibold text-white leading-relaxed">
          {node.claim}
        </h3>
      </div>

      <div className="flex-1 flex min-h-0 divide-x divide-white/10">
        {/* Source List (Left) */}
        <div className="w-1/3 overflow-y-auto bg-black/20">
          <div className="p-3 border-b border-white/5 bg-white/[0.01]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Supporting Evidence</span>
          </div>
          <div className="p-2 space-y-1">
            {nodeSources.map(source => (
              <button
                key={source.id}
                onClick={() => setSelectedSourceId(source.id)}
                className={cn(
                  "w-full text-left p-3 rounded-xl transition-all border",
                  selectedSourceId === source.id 
                    ? "bg-white/10 border-white/20 shadow-lg" 
                    : "bg-transparent border-transparent hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-4 h-4 rounded bg-cyan-500/20 flex items-center justify-center">
                    <BookMarked className="w-2.5 h-2.5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] text-white/40 font-mono truncate">{source.domain}</span>
                </div>
                <p className={cn(
                  "text-xs font-medium truncate",
                  selectedSourceId === source.id ? "text-white" : "text-white/60"
                )}>
                  {source.title}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Evidence Detail (Right) */}
        <div className="flex-1 overflow-y-auto bg-[#0a0c11]">
          {activeSource ? (
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-bold text-white leading-tight">
                    {activeSource.title}
                  </h4>
                  <a 
                    href={activeSource.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>View full source</span>
                  </a>
                </div>
              </div>

              {/* Source Highlights */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <Quote className="w-3 h-3 text-white/30" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Extracted Highlights</span>
                </div>

                {activeSource.highlights?.length ? (
                  activeSource.highlights.map(highlight => (
                    <motion.div 
                      key={highlight.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/40" />
                      <p className="text-sm text-white/80 leading-relaxed italic">
                        "{highlight.text}"
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] text-white/20 font-mono">Confidence: {Math.round(highlight.confidence * 100)}%</span>
                        {highlight.pageNumber && (
                          <span className="text-[10px] text-white/20 font-mono">Page {highlight.pageNumber}</span>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center">
                    <p className="text-sm text-white/30 italic">
                      "{activeSource.snippet}"
                    </p>
                    <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-white/20">Initial discovery snippet</p>
                  </div>
                )}
              </div>

              {/* Verified Badge */}
              <div className="pt-6 border-t border-white/5 flex justify-end">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Verified Evidence</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-30">
              <BookMarked className="w-12 h-12 mb-4" />
              <p className="text-sm">Select a source to view supporting evidence highlights</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
