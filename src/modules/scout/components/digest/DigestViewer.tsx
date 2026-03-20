/**
 * DigestViewer.tsx
 *
 * Shows the latest digest and history of past digests for Scout.
 */

import React, { useState } from 'react';
import { FileText, RefreshCw, Trash2, Download, ChevronDown, ChevronUp, Sparkles, TrendingUp, BookOpen, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { ScoutDigestDecrypted } from '../../services/scout-digest-service';
import type { ScoutProfile } from '../../services/scout-knowledge-service';
import ReactMarkdown from 'react-markdown';

interface DigestViewerProps {
  digests: ScoutDigestDecrypted[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  profile: ScoutProfile | null;
  onGenerate: () => void;
  onDelete: (id: string) => void;
  onExport?: (digest: ScoutDigestDecrypted) => void;
}

// ---------------------------------------------------------------------------
// DigestCard
// ---------------------------------------------------------------------------

function DigestCard({
  digest,
  isLatest,
  onDelete,
  onExport,
}: {
  digest: ScoutDigestDecrypted;
  isLatest?: boolean;
  onDelete: () => void;
  onExport?: () => void;
}) {
  const [expanded, setExpanded] = useState(isLatest);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "rounded-3xl border transition-all overflow-hidden",
        isLatest ? 'border-fuchsia-500/30 bg-fuchsia-500/5 shadow-[0_0_30px_-10px_rgba(217,70,239,0.2)]' : 'border-white/5 bg-white/[0.02]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center",
            isLatest ? "bg-fuchsia-500/20 text-fuchsia-400" : "bg-white/5 text-white/30"
          )}>
            <BookOpen size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className={cn("text-sm font-bold", isLatest ? "text-white" : "text-white/70")}>
                Intelligence Briefing
              </h4>
              {isLatest && (
                <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-[10px] font-black uppercase tracking-widest text-fuchsia-400">
                  Latest
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-white/40 uppercase tracking-widest">
                {new Date(digest.generatedAt).toLocaleDateString()}
              </span>
              <span className="text-white/10 text-[10px]">•</span>
              <span className="text-[10px] text-white/40 uppercase tracking-widest">
                {digest.summary.totalNodes} Nodes Analyzed
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {onExport && (
              <NeuralButton
                variant="ghost"
                onClick={onExport}
                className="p-2 h-auto w-auto min-h-0 min-w-0 border-none hover:bg-white/10 text-white/30 hover:text-white"
                title="Export"
              >
                <Download size={16} />
              </NeuralButton>
            )}
            <NeuralButton
              variant="ghost"
              onClick={onDelete}
              themeColor="red"
              className="p-2 h-auto w-auto min-h-0 min-w-0 border-none hover:bg-red-500/10 text-white/30 hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={16} />
            </NeuralButton>
          </div>
          <NeuralButton
            variant="secondary"
            onClick={() => setExpanded(!expanded)}
            className="p-2 h-auto w-auto min-h-0 min-w-0 bg-white/5 hover:bg-white/10 text-white/40"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </NeuralButton>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5"
          >
            <div className="p-8 space-y-10">
              {/* Top Claims Grid */}
              <section className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-400 flex items-center gap-2">
                  <TrendingUp size={12} />
                  Core Insights
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {digest.topClaims.map((claim, idx) => (
                    <div key={idx} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2">
                      <p className="text-xs font-bold text-white/80 leading-snug">{claim.claim}</p>
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-white/30 uppercase tracking-widest">Confidence</span>
                          <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-fuchsia-500" style={{ width: `${claim.confidence * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-[10px] text-white/20 uppercase tracking-widest">{claim.evidenceCount} Sources</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Synthesized Newsletter Content */}
              <section className="prose prose-invert prose-xs max-w-none">
                <div className="relative">
                   <div className="absolute -left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-fuchsia-500/40 to-transparent" />
                  <div className="text-white/70 leading-relaxed space-y-4">
                    <ReactMarkdown
                    components={{
                      p: ({children}) => <p className="text-sm leading-relaxed mb-4">{children}</p>,
                      h1: ({children}) => <h1 className="text-xl font-display font-bold text-white mb-6">{children}</h1>,
                      h2: ({children}) => <h2 className="text-lg font-display font-bold text-white/90 mt-8 mb-4">{children}</h2>,
                      h3: ({children}) => <h3 className="text-md font-display font-bold text-white/80 mt-6 mb-3">{children}</h3>,
                      li: ({children}) => <li className="text-sm mb-2">{children}</li>,
                    }}
                    >
                      {digest.synthesizedContent}
                    </ReactMarkdown>
                  </div>
                </div>
              </section>

              {/* Summary Stats */}
              <div className="flex items-center gap-8 py-6 border-t border-white/5">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Verified</p>
                  <p className="text-lg font-bold text-emerald-400">{digest.summary.verifiedCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Contested</p>
                  <p className="text-lg font-bold text-amber-400">{digest.summary.contestedCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Total Findings</p>
                  <p className="text-lg font-bold text-white/60">{digest.summary.totalNodes}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DigestViewer({
  digests,
  isLoading,
  isGenerating,
  error,
  profile,
  onGenerate,
  onDelete,
  onExport,
}: DigestViewerProps) {
  return (
    <div className="h-full flex flex-col space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-fuchsia-400">Newsletter Library</h3>
          <p className="text-xs text-white/30 mt-1">
            Synthesized intelligence briefings from your research cycles.
          </p>
        </div>
        <NeuralButton
          onClick={onGenerate}
          disabled={isGenerating}
          themeColor="fuchsia"
          variant="outline"
          className="flex items-center gap-3 px-6 py-3 border-fuchsia-500/20 hover:bg-fuchsia-500/20 text-fuchsia-400 group disabled:opacity-40"
        >
          {isGenerating ? (
            <RefreshCw size={18} className="animate-spin" />
          ) : (
            <Sparkles size={18} className="group-hover:scale-110 transition-transform" />
          )}
          <span className="text-xs font-black uppercase tracking-widest">Generate Briefing</span>
        </NeuralButton>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          {error}
        </div>
      )}

      {/* Digest list */}
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pb-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-white/20 gap-4">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest">Consulting Archives...</span>
          </div>
        ) : digests.length === 0 && !isGenerating ? (
          <EmptyState
            title="No briefings archived"
            description="Generate your first intelligence briefing to see a synthesized view of your collective knowledge."
            size="md"
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 rounded-3xl border border-fuchsia-500/30 bg-fuchsia-500/5 flex flex-col items-center justify-center text-center gap-4"
              >
                <RefreshCw size={32} className="text-fuchsia-400 animate-spin" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Synthesizing Briefing...</h4>
                  <p className="text-xs text-white/40">Aggregating knowledge nodes and vetting sources.</p>
                </div>
              </motion.div>
            )}
            {digests.map((digest, i) => (
              <DigestCard
                key={digest.id}
                digest={digest}
                isLatest={i === 0 && !isGenerating}
                onDelete={() => onDelete(digest.id)}
                onExport={onExport ? () => onExport(digest) : undefined}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
