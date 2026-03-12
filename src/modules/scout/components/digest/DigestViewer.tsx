/**
 * DigestViewer.tsx
 *
 * Shows the latest digest and history of past digests for Scout.
 * Generate button triggers LLM synthesis. Export button opens ExportDialog.
 */

import React, { useState } from 'react';
import { FileText, RefreshCw, Trash2, Download, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmptyState } from '@/core/components/EmptyState';
import type { ScoutDigestDecrypted } from '../../services/scout-digest-service';
import type { ScoutProfile } from '../../services/scout-knowledge-service';

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
// DigestCard — shows a single digest with expand/collapse
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`rounded-xl border ${
        isLatest ? 'border-white/20 bg-white/[0.06]' : 'border-white/8 bg-white/[0.03]'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <FileText className={`w-4 h-4 flex-shrink-0 ${isLatest ? 'text-white/70' : 'text-white/30'}`} />
          <div>
            <div className={`text-sm font-medium ${isLatest ? 'text-white/80' : 'text-white/50'}`}>
              {new Date(digest.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
              {isLatest && (
                <span className="ml-2 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Latest</span>
              )}
            </div>
            <div className="text-xs text-white/30 mt-0.5">
              {digest.nodeCount} nodes · {digest.sourceCount} sources · {digest.triggerSource}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onExport && (
            <button
              onClick={(e) => { e.stopPropagation(); onExport(); }}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
              title="Export digest"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-red-400/80 transition-colors"
            title="Delete digest"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-white/30" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-white/30" />
          )}
        </div>
      </button>

      {/* Body */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
              {/* Executive Summary */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Summary</h4>
                <p className="text-sm text-white/70 leading-relaxed">{digest.sections.executiveSummary}</p>
              </div>

              {/* Key Themes */}
              {digest.sections.keyThemes.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Key Themes</h4>
                  <div className="flex flex-wrap gap-2">
                    {digest.sections.keyThemes.map((theme) => (
                      <span
                        key={theme}
                        className="px-2.5 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-white/60"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Knowledge Gaps */}
              {digest.sections.knowledgeGaps.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Knowledge Gaps</h4>
                  <ul className="space-y-1">
                    {digest.sections.knowledgeGaps.map((gap) => (
                      <li key={gap} className="text-xs text-amber-300/60 flex items-start gap-2">
                        <span className="mt-0.5">⚠</span>
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended Actions */}
              {digest.sections.recommendedActions.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Recommended Actions</h4>
                  <ul className="space-y-1">
                    {digest.sections.recommendedActions.map((action) => (
                      <li key={action} className="text-xs text-emerald-300/70 flex items-start gap-2">
                        <span className="mt-0.5">→</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
  const hasNodes = (profile?.knowledgeNodes?.length ?? 0) > 0;

  return (
    <div className="h-full flex flex-col space-y-4 p-6">
      {/* Header / Generate button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white/80 uppercase tracking-widest">Research Digest</h3>
          <p className="text-xs text-white/30 mt-0.5">
            AI-synthesized intelligence from your research activity
          </p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating || !hasNodes}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all
            bg-gradient-to-r from-violet-500/20 to-indigo-500/20 border border-violet-500/30
            text-violet-300 hover:from-violet-500/30 hover:to-indigo-500/30
            disabled:opacity-40 disabled:cursor-not-allowed"
          title={!hasNodes ? 'Add research nodes to generate a digest' : undefined}
        >
          {isGenerating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {isGenerating ? 'Generating…' : 'Generate Digest'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Generating state */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl border border-violet-500/20 bg-violet-500/5 flex items-center gap-3"
        >
          <RefreshCw className="w-4 h-4 text-violet-400 animate-spin flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm text-violet-300/80 font-medium">Synthesizing research…</p>
            <p className="text-xs text-violet-300/40">Analysing {profile?.knowledgeNodes?.length ?? 0} nodes</p>
          </div>
        </motion.div>
      )}

      {/* Digest list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-white/20 text-sm">Loading digests…</div>
        ) : digests.length === 0 && !isGenerating ? (
          <EmptyState
            title="No digests yet"
            description={
              hasNodes
                ? 'Generate your first digest to get an AI-synthesized view of your research.'
                : 'Start researching — add knowledge nodes to unlock digest generation.'
            }
            size="md"
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {digests.map((digest, i) => (
              <DigestCard
                key={digest.id}
                digest={digest}
                isLatest={i === 0}
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
