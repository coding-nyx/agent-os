/**
 * DeepResearchPanel.tsx
 *
 * Portaled overlay for the multi-step deep research workflow.
 * States: form → reviewing → searching → synthesizing → complete
 */

import React, { useEffect, useState } from 'react';
import { X, Brain, Search, CheckCircle, AlertCircle, RefreshCw, Edit2, ArrowRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UseDeepResearchReturn, SubQuestion, DeepResearchResult } from '../../hooks/useDeepResearch';

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
          <input
            autoFocus
            className="flex-1 bg-white/5 border border-white/20 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button onClick={save} className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
        </div>
      ) : (
        <div className="flex-1 flex items-start justify-between gap-2">
          <p className="text-sm text-white/70 leading-relaxed">{question.question}</p>
          <button
            onClick={() => setEditing(true)}
            className="mt-0.5 p-1 rounded hover:bg-white/10 text-white/20 hover:text-white/50 flex-shrink-0"
          >
            <Edit2 className="w-3 h-3" />
          </button>
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
      if (!window.confirm('Research is in progress. Are you sure you want to stop?')) return;
      deepResearch.abort();
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0a0c11] border border-white/10 rounded-2xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white/80 uppercase tracking-widest">Deep Research</h2>
              <p className="text-xs text-white/30">Multi-angle investigation with synthesis</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Idle / Form ─────────────────────────────────────────────── */}
          {(deepResearch.status === 'idle' || deepResearch.status === 'error') && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs text-white/40 uppercase tracking-wider">Research Query</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25"
                    placeholder="What do you want to research deeply?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
                    autoFocus
                  />
                  <button
                    onClick={handleStart}
                    disabled={!query.trim()}
                    className="px-5 py-3 text-sm font-bold text-black bg-white rounded-xl hover:bg-white/90 disabled:opacity-40 flex items-center gap-2"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Research
                  </button>
                </div>
              </div>

              {deepResearch.error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{deepResearch.error}</p>
                </div>
              )}

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
                <p className="text-xs font-medium text-white/40 uppercase tracking-wider">How it works</p>
                <div className="space-y-1.5 text-xs text-white/30">
                  <div className="flex items-center gap-2"><Brain className="w-3 h-3 text-violet-400/60" /> AI generates targeted sub-questions</div>
                  <div className="flex items-center gap-2"><Edit2 className="w-3 h-3 text-blue-400/60" /> You review and edit the questions</div>
                  <div className="flex items-center gap-2"><Search className="w-3 h-3 text-emerald-400/60" /> Parallel web searches for each question</div>
                  <div className="flex items-center gap-2"><CheckCircle className="w-3 h-3 text-amber-400/60" /> AI synthesizes a research node from all results</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Generating questions ─────────────────────────────────────── */}
          {deepResearch.status === 'generating_questions' && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                <Brain className="w-6 h-6 text-violet-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-white/70">Generating sub-questions…</p>
                <p className="text-xs text-white/30">Decomposing "{query}" into targeted angles</p>
              </div>
            </div>
          )}

          {/* ── Reviewing sub-questions ───────────────────────────────────── */}
          {deepResearch.status === 'reviewing' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/70">Review sub-questions</p>
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
            <div className="space-y-5">
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
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <Zap className="w-6 h-6 text-amber-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-white/70">Synthesising results…</p>
                <p className="text-xs text-white/30">Building knowledge node from {deepResearch.results.length} search sets</p>
              </div>
            </div>
          )}

          {/* ── Complete ─────────────────────────────────────────────────── */}
          {deepResearch.status === 'complete' && deepResearch.result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-300/80">Research complete</p>
              </div>

              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.04] space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-white/80">{deepResearch.result.synthesisNode.title}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    deepResearch.result.synthesisNode.status === 'verified'
                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                      : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                  }`}>
                    {deepResearch.result.synthesisNode.status}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{deepResearch.result.synthesisNode.claim}</p>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  <span>Confidence: {Math.round((deepResearch.result.synthesisNode.confidence ?? 0) * 100)}%</span>
                  <span>{deepResearch.result.capturedSources.length} sources captured</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="border-t border-white/8 p-4 flex items-center justify-end gap-2">
          {deepResearch.status === 'reviewing' && (
            <>
              <button
                onClick={() => deepResearch.reset()}
                className="px-4 py-2 text-xs font-medium text-white/40 border border-white/10 rounded-xl hover:bg-white/5"
              >
                Start Over
              </button>
              <button
                onClick={handleConfirm}
                disabled={editedQuestions.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-black bg-white rounded-xl hover:bg-white/90 disabled:opacity-40"
              >
                Search All
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {(deepResearch.status === 'searching' || deepResearch.status === 'synthesizing' || deepResearch.status === 'generating_questions') && (
            <button
              onClick={deepResearch.abort}
              className="px-4 py-2 text-xs font-medium text-red-400/70 border border-red-500/20 rounded-xl hover:bg-red-500/10"
            >
              Abort
            </button>
          )}

          {deepResearch.status === 'complete' && deepResearch.result && (
            <>
              <button
                onClick={() => { deepResearch.reset(); }}
                className="px-4 py-2 text-xs font-medium text-white/40 border border-white/10 rounded-xl hover:bg-white/5"
              >
                Discard
              </button>
              <button
                onClick={handleAccept}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-black bg-emerald-400 rounded-xl hover:bg-emerald-300"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Accept Node
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
