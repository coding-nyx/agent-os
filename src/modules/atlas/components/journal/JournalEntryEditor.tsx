/**
 * JournalEntryEditor — Full-featured daily journal editor.
 *
 * Sections (top to bottom):
 *  1. Morning Intent    — textarea, pre-populated from check-in
 *  2. AI Prompt         — card with lightbulb, regenerate ghost button
 *  3. Free Write        — open textarea
 *  4. Evening Reflection — textarea, pre-populated from check-in
 *  5. Mood              — 5-pill row (emoji labels)
 *  6. Energy            — 5-pill row (1–5)
 *  7. Gratitude         — up to 3 text inputs with "+ Add" button
 *  8. Blockers          — textarea, pre-populated from check-in
 *  9. Save              — NeuralButton
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, RefreshCw, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { Skeleton } from '@/core/components/Skeleton';
import type { JournalEntry } from '@/lib/types';
import type { AtlasHabit, AtlasGoal } from '../../services/atlas-profile-service';

export interface JournalEntryEditorProps {
  entry: JournalEntry;
  habits: AtlasHabit[];
  goals: AtlasGoal[];
  aiPrompt: string | null;
  isLoadingPrompt: boolean;
  isSaving: boolean;
  saveFeedback: JournalSaveFeedback | null;
  onSave: (entry: JournalEntry) => void;
  onRegeneratePrompt: () => void;
}

export type JournalSaveFeedbackTone = 'success' | 'warning' | 'error';

export interface JournalSaveFeedback {
  tone: JournalSaveFeedbackTone;
  message: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const MOOD_OPTIONS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😔', label: 'Rough' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😊', label: 'Great' },
];

const TEXTAREA_CLASS =
  'w-full bg-black/30 border border-white/10 rounded-lg text-white/90 placeholder:text-white/30 focus:border-violet-500/50 focus:outline-none focus:ring-0 resize-none px-3 py-2.5 text-sm leading-relaxed transition-colors';

const LABEL_CLASS = 'text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-1.5 font-display';

// ── Component ─────────────────────────────────────────────────────────────────

export function JournalEntryEditor({
  entry,
  habits: _habits,
  goals: _goals,
  aiPrompt,
  isLoadingPrompt,
  isSaving,
  saveFeedback,
  onSave,
  onRegeneratePrompt,
}: JournalEntryEditorProps) {
  // Local draft — initialised from the entry prop once on mount.
  const [draft, setDraft] = useState<JournalEntry>(() => ({ ...entry }));

  // Sync if a new entry ID is passed in (e.g. day change or history select).
  const [lastEntryId, setLastEntryId] = useState(entry.id);
  if (entry.id !== lastEntryId) {
    setDraft({ ...entry });
    setLastEntryId(entry.id);
  }

  const patch = useCallback(<K extends keyof JournalEntry>(key: K, value: JournalEntry[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value, updatedAt: new Date().toISOString() }));
  }, []);

  // Gratitude helpers
  const addGratitude = useCallback(() => {
    setDraft((prev) => {
      if (prev.gratitude.length >= 3) return prev;
      return { ...prev, gratitude: [...prev.gratitude, ''], updatedAt: new Date().toISOString() };
    });
  }, []);

  const updateGratitude = useCallback((idx: number, val: string) => {
    setDraft((prev) => {
      const next = [...prev.gratitude];
      next[idx] = val;
      return { ...prev, gratitude: next, updatedAt: new Date().toISOString() };
    });
  }, []);

  const removeGratitude = useCallback((idx: number) => {
    setDraft((prev) => ({
      ...prev,
      gratitude: prev.gratitude.filter((_, i) => i !== idx),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(draft);
  }, [onSave, draft]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 pb-8"
    >
      {/* ── 1. Morning Intent ─────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Morning Intent</p>
        <textarea
          rows={3}
          className={TEXTAREA_CLASS}
          placeholder="What's your intention for today?"
          value={draft.morningIntent}
          onChange={(e) => patch('morningIntent', e.target.value)}
        />
      </section>

      {/* ── 2. AI Prompt ──────────────────────────────────────────── */}
      {(isLoadingPrompt || aiPrompt) && (
        <section>
          <p className={LABEL_CLASS}>Today's Prompt</p>
          {isLoadingPrompt ? (
            <div className="space-y-2 p-4 rounded-lg border border-white/10 bg-black/20">
              <Skeleton className="h-3 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
              <Lightbulb className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/80 leading-relaxed">{aiPrompt}</p>
              </div>
              <button
                type="button"
                onClick={onRegeneratePrompt}
                title="Regenerate prompt"
                className="shrink-0 flex items-center gap-1 text-[11px] text-violet-400/70 hover:text-violet-300 transition-colors font-medium uppercase tracking-wide focus-visible:outline-none"
              >
                <RefreshCw className="w-3 h-3" aria-hidden />
                Regenerate
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── 3. Free Write ─────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Free Write</p>
        <textarea
          rows={5}
          className={TEXTAREA_CLASS}
          placeholder="How are you feeling?"
          value={draft.freeform}
          onChange={(e) => patch('freeform', e.target.value)}
        />
      </section>

      {/* ── 4. Evening Reflection ─────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Evening Reflection</p>
        <textarea
          rows={4}
          className={TEXTAREA_CLASS}
          placeholder="What happened today?"
          value={draft.eveningReflection}
          onChange={(e) => patch('eveningReflection', e.target.value)}
        />
      </section>

      {/* ── 5. Mood ───────────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Mood</p>
        <div className="flex gap-2">
          {MOOD_OPTIONS.map(({ value, emoji, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => patch('mood', value)}
              title={label}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 min-h-11',
                draft.mood === value
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/60',
              )}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="text-[10px] leading-none">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 6. Energy ─────────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Energy Level</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => patch('energyLevel', val)}
              title={`Energy ${val}`}
              className={cn(
                'flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400 min-h-11',
                draft.energyLevel === val
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/60',
              )}
            >
              {val}
            </button>
          ))}
        </div>
      </section>

      {/* ── 7. Gratitude ──────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Gratitude</p>
        <div className="space-y-2">
          {draft.gratitude.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateGratitude(idx, e.target.value)}
                placeholder={`Grateful for #${idx + 1}…`}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg text-white/90 placeholder:text-white/30 focus:border-violet-500/50 focus:outline-none px-3 py-2 text-sm transition-colors"
              />
              <button
                type="button"
                onClick={() => removeGratitude(idx)}
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors focus-visible:outline-none"
                aria-label="Remove"
              >
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {draft.gratitude.length < 3 && (
            <button
              type="button"
              onClick={addGratitude}
              className="flex items-center gap-1.5 text-xs text-violet-400/70 hover:text-violet-300 transition-colors font-medium focus-visible:outline-none"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Add what you're grateful for
            </button>
          )}
        </div>
      </section>

      {/* ── 8. Blockers ───────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Blockers</p>
        <textarea
          rows={3}
          className={TEXTAREA_CLASS}
          placeholder="Any obstacles or friction today?"
          value={draft.blockers}
          onChange={(e) => patch('blockers', e.target.value)}
        />
      </section>

      {/* ── 9. Save ───────────────────────────────────────────────── */}
      <div className="pt-2">
        <NeuralButton
          themeColor="emerald"
          size="md"
          disabled={isSaving}
          loading={isSaving}
          onClick={handleSave}
          className="w-full"
        >
          {isSaving ? 'Saving…' : 'Save Entry'}
        </NeuralButton>

        {saveFeedback && (
          <p
            role="status"
            aria-live="polite"
            className={cn(
              'mt-2 text-[11px] font-semibold tracking-wide',
              saveFeedback.tone === 'success' && 'text-emerald-300/80',
              saveFeedback.tone === 'warning' && 'text-amber-300/80',
              saveFeedback.tone === 'error' && 'text-rose-300/80',
            )}
          >
            {saveFeedback.message}
          </p>
        )}
      </div>
    </motion.div>
  );
}
