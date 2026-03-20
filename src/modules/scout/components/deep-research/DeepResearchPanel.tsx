/**
 * DeepResearchPanel.tsx
 *
 * Right-side slide-over for the multi-step deep research workflow.
 * Replaces the old centered modal (max-w-2xl max-h-[85vh]) with a full-height
 * slide-over that gives each workflow step room to breathe.
 *
 * States: form → reviewing → searching → synthesizing → complete
 */

import React, { useEffect, useState } from 'react';
import { X, Brain, Search, CheckCircle, AlertCircle, RefreshCw, Edit2, ArrowRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UseDeepResearchReturn, SubQuestion, DeepResearchResult } from '../../hooks/useDeepResearch';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

interface DeepResearchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  onResultAccepted: (result: DeepResearchResult) => void;
  deepResearch: UseDeepResearchReturn;
}

// ---------------------------------------------------------------------------
// Sub-question editor row
// ---------------------------------------------------------------------------

function SubQuestionRow({
  question,
  index,
  onChange,
}: {
  question: SubQuestion;
  index: number;
  onChange: (q: SubQuestion) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.question);

  const save = () => {
    onChange({ ...question, question: draft.trim() || question.question });
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/[0.03]">
      <span className="text-xs font-bold text-white/20 mt-0.5 w-4 flex-shrink-0">{index + 1}</span>
      {editing ? (
        <div className="flex-1 flex items-center gap-2">
          <NeuralInput
            autoFocus
            className="flex-1 bg-white/5 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none min-h-0 h-8"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          />
          <NeuralButton variant="ghost" themeColor="emerald" onClick={save} className="text-xs text-emerald-400 hover:text-emerald-300 h-8 px-2">Save</NeuralButton>
        </div>
      ) : (
        <div className="flex-1 flex items-start justify-between gap-2">
          <p className="text-sm text-white/70 leading-relaxed">{question.question}</p>
          <NeuralButton
            variant="ghost"
            onClick={() => setEditing(true)}
            className="mt-0.5 p-1 rounded hover:bg-white/10 text-white/20 hover:text-white/50 flex-shrink-0 h-auto w-auto min-h-0 min-w-0 border-none"
          >
            <Edit2 className="w-3 h-3" />
          </NeuralButton>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress indicator for searching phase
// ---------------------------------------------------------------------------

function SearchProgress({ current, total, label }: { current: number; total: number; label?: string }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/40">{label || 'Searching…'}</span>
        <span className="text-white/30">{current}/{total}</span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function DeepResearchPanel({
  isOpen,
  onClose,
  initialQuery = '',
  onResultAccepted,
  deepResearch,
}: DeepResearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [editedQuestions, setEditedQuestions] = useState<SubQuestion[]>([]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (deepResearch.status === 'reviewing') {
      setEditedQuestions(deepResearch.subQuestions);
    }
  }, [deepResearch.status, deepResearch.subQuestions]);

  const handleClose = () => {
    if (deepResearch.status !== 'idle' && deepResearch.status !== 'complete' && deepResearch.status !== 'error') {
      setShowStopConfirm(true);
      return;
    }
    onClose();
  };

  const handleStopAndClose = () => {
    deepResearch.abort();
    setShowStopConfirm(false);
    onClose();
  };

  const handleStart = () => {
    if (query.trim()) deepResearch.start(query.trim());
  };

  const handleConfirm = () => {
    deepResearch.confirmSubQuestions(editedQuestions);
  };

  const handleAccept = () => {
    if (deepResearch.result) {
      onResultAccepted(deepResearch.result);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Deep Research Panel"
    >
      {/* Backdrop — click to close (with in-progress guard) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Slide-over panel — full height, right-anchored.
           Mobile: full width.  md+: fixed 600px.  lg+: 680px.
           Slides in from the right so the user keeps spatial context of the
           research workspace behind it.                                        */}
      <motion.div
        initial={{ opacity: 0, x: '100%' }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
        className="relative ml-auto flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-[#0a0c11] shadow-2xl md:w-[600px] lg:w-[680px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white/90 uppercase tracking-widest">Deep Research</h2>
              <p className="text-xs text-white/30 mt-0.5">Multi-angle investigation with synthesis</p>
            </div>
          </div>
          <NeuralButton
            variant="ghost"
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors h-auto w-auto min-h-0 min-w-0 border-none"
            aria-label="Close deep research panel"
          >
            <X className="w-4 h-4" />
          </NeuralButton>
        </div>

        {/* Body — full remaining height, scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 pb-28 sm:pb-32">

          {/* ── Idle / Form ─────────────────────────────────────────────── */}
          {(deepResearch.status === 'idle' || deepResearch.status === 'error') && (
            <div className="space-y-6">
              <div className="space-y-2">
                <NeuralInput
                  label="Research Query"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 focus:bg-white/[0.07] transition-all"
                  placeholder="What do you want to research deeply?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
                  autoFocus
                  aria-label="Research query"
                />
                <div className="flex justify-end pt-2">
                  <NeuralButton
                    onClick={handleStart}
                    disabled={!query.trim()}
                    themeColor="white"
                    className="px-6 py-3 text-sm font-bold text-black bg-white rounded-xl hover:bg-white/90 disabled:opacity-40 flex items-center justify-center gap-2 flex-shrink-0 transition-opacity h-auto"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Research
                  </NeuralButton>
                </div>
              </div>

              {deepResearch.error && (
                <div className="flex items-start gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-relaxed">{deepResearch.error}</p>
                </div>
              )}

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3">
                <p className="text-xs font-bold text-white/40 uppercase tracking-wider">How it works</p>
                <div className="space-y-2.5 text-xs text-white/30">
                  <div className="flex items-center gap-2.5">
                    <Brain className="w-3.5 h-3.5 text-violet-400/60 flex-shrink-0" />
                    <span>AI generates targeted sub-questions</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Edit2 className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0" />
                    <span>You review and edit the questions</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Search className="w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0" />
                    <span>Parallel web searches for each question</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <CheckCircle className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />
                    <span>AI synthesizes a research node from all results</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Generating questions ─────────────────────────────────────── */}
          {deepResearch.status === 'generating_questions' && (
            <div className="flex flex-col items-center justify-center gap-5 py-20">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Brain className="w-7 h-7 text-violet-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-semibold text-white/70">Generating sub-questions…</p>
                <p className="text-xs text-white/30">Decomposing "{query}" into targeted angles</p>
              </div>
            </div>
          )}

          {/* ── Reviewing sub-questions ───────────────────────────────────── */}
          {deepResearch.status === 'reviewing' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white/80">Review sub-questions</p>
                <p className="text-xs text-white/30">Edit any question, then confirm to start searching</p>
              </div>
              <div className="space-y-2">
                {editedQuestions.map((q, i) => (
                  <SubQuestionRow
                    key={q.id}
                    question={q}
                    index={i}
                    onChange={(updated) =>
                      setEditedQuestions((prev) => prev.map((item) => item.id === updated.id ? updated : item))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Searching ─────────────────────────────────────────────────── */}
          {deepResearch.status === 'searching' && (
            <div className="space-y-6">
              <SearchProgress
                current={deepResearch.progress.current}
                total={deepResearch.progress.total}
                label="Searching the web…"
              />
              <div className="space-y-2">
                {editedQuestions.map((q, i) => (
                  <div key={q.id} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                    <Search className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                    <p className="text-xs text-white/50 flex-1 line-clamp-1">{q.question}</p>
                    {i < deepResearch.progress.current ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60 flex-shrink-0" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-white/20 animate-spin flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Synthesizing ─────────────────────────────────────────────── */}
          {deepResearch.status === 'synthesizing' && (
            <div className="flex flex-col items-center justify-center gap-5 py-20">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Zap className="w-7 h-7 text-amber-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-sm font-semibold text-white/70">Synthesising results…</p>
                <p className="text-xs text-white/30">Building knowledge node from {deepResearch.results.length} search sets</p>
              </div>
            </div>
          )}

          {/* ── Complete ─────────────────────────────────────────────────── */}
          {deepResearch.status === 'complete' && deepResearch.result && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300/80">Research complete</p>
              </div>

              <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.04] space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white/90 leading-snug">{deepResearch.result.synthesisNode.title}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    deepResearch.result.synthesisNode.status === 'verified'
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                  }`}>
                    {deepResearch.result.synthesisNode.status}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{deepResearch.result.synthesisNode.claim}</p>
                <div className="flex items-center gap-4 text-xs text-white/30 pt-1 border-t border-white/5">
                  <span>Confidence: {Math.round((deepResearch.result.synthesisNode.confidence ?? 0) * 100)}%</span>
                  <span>{deepResearch.result.capturedSources.length} sources captured</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="border-t border-white/[0.08] bg-[#0a0c11]/95 px-6 py-4 pb-[calc(var(--space-4)+env(safe-area-inset-bottom,0px))] backdrop-blur-xl">
          {deepResearch.status === 'reviewing' && (
            <div className="flex w-full flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
              <NeuralButton
                variant="outline"
                onClick={() => deepResearch.reset()}
                className="w-full sm:w-auto"
              >
                Start Over
              </NeuralButton>
              <NeuralButton
                onClick={handleConfirm}
                disabled={editedQuestions.length === 0}
                themeColor="white"
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                Search All
                <ArrowRight className="w-3.5 h-3.5" />
              </NeuralButton>
            </div>
          )}

          {(deepResearch.status === 'searching' || deepResearch.status === 'synthesizing' || deepResearch.status === 'generating_questions') && (
            <div className="flex w-full justify-end">
              <NeuralButton
                variant="outline"
                themeColor="red"
                onClick={deepResearch.abort}
                className="w-full sm:w-auto"
              >
                Abort
              </NeuralButton>
            </div>
          )}

          {deepResearch.status === 'complete' && deepResearch.result && (
            <div className="flex w-full flex-col-reverse items-stretch justify-end gap-2 sm:flex-row sm:items-center">
              <NeuralButton
                variant="outline"
                onClick={() => { deepResearch.reset(); }}
                className="w-full sm:w-auto"
              >
                Discard
              </NeuralButton>
              <NeuralButton
                onClick={handleAccept}
                themeColor="emerald"
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Accept Node
              </NeuralButton>
            </div>
          )}
        </div>
      </motion.div>

      <ConfirmDialog
        isOpen={showStopConfirm}
        onClose={() => setShowStopConfirm(false)}
        onConfirm={handleStopAndClose}
        title="Stop research?"
        description="Research is in progress. Are you sure you want to stop?"
        variant="warning"
        confirmLabel="Stop"
      />
    </div>
  );
}
