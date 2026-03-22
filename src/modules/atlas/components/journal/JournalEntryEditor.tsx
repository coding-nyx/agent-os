/**
 * JournalEntryEditor — Full-featured daily journal editor.
 *
 * Sections (top to bottom):
 *  1. Morning Intent     — rich text editor, pre-populated from check-in
 *  2. AI Prompt          — card with lightbulb, regenerate ghost button
 *  3. Free Write         — rich text editor (open writing)
 *  4. Evening Reflection — rich text editor, pre-populated from check-in
 *  5. Mood & Energy      — compact merged MoodEnergyPicker widget
 *  6. Gratitude          — up to 3 text inputs with "+ Add" button
 *  7. Blockers           — rich text editor, pre-populated from check-in
 *  8. Save               — sticky NeuralButton bar
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, RefreshCw, Plus, X, Sunrise, BookOpen, Moon, Heart, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { Skeleton } from '@/core/components/Skeleton';
import { RichTextEditor } from './RichTextEditor';
import { MoodEnergyPicker } from './MoodEnergyPicker';
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

const LABEL_CLASS = 'flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-2 font-display';
const SECTION_DIVIDER = 'border-t border-white/5 pt-5';

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
      className="space-y-5 pb-24"
    >
      {/* ── 1. Morning Intent ─────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>
          <Sunrise className="w-3.5 h-3.5 text-amber-400/60" aria-hidden />
          Morning Intent
        </p>
        <RichTextEditor
          value={draft.morningIntent}
          onChange={(html) => patch('morningIntent', html)}
          placeholder="What's your intention for today?"
          minHeight="72px"
        />
      </section>

      {/* ── 2. AI Prompt ──────────────────────────────────────────── */}
      {(isLoadingPrompt || aiPrompt) && (
        <section className={SECTION_DIVIDER}>
          <p className={LABEL_CLASS}>
            <Lightbulb className="w-3.5 h-3.5 text-violet-400/60" aria-hidden />
            Today's Prompt
          </p>
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
              <NeuralButton
                type="button"
                variant="ghost"
                size="sm"
                themeColor="emerald"
                onClick={onRegeneratePrompt}
                title="Regenerate prompt"
                className="shrink-0 flex items-center gap-1 text-[11px] !p-0 !h-auto font-medium uppercase tracking-wide"
              >
                <RefreshCw className="w-3 h-3" aria-hidden />
                Regenerate
              </NeuralButton>
            </div>
          )}
        </section>
      )}

      {/* ── 3. Free Write ─────────────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={LABEL_CLASS}>
          <BookOpen className="w-3.5 h-3.5 text-indigo-400/60" aria-hidden />
          Free Write
        </p>
        <RichTextEditor
          value={draft.freeform}
          onChange={(html) => patch('freeform', html)}
          placeholder="How are you feeling? Write freely…"
          minHeight="120px"
        />
      </section>

      {/* ── 4. Evening Reflection ─────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={LABEL_CLASS}>
          <Moon className="w-3.5 h-3.5 text-blue-400/60" aria-hidden />
          Evening Reflection
        </p>
        <RichTextEditor
          value={draft.eveningReflection}
          onChange={(html) => patch('eveningReflection', html)}
          placeholder="What happened today?"
          minHeight="96px"
        />
      </section>

      {/* ── 5. Mood & Energy (merged) ─────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={LABEL_CLASS}>Vibe Check</p>
        <MoodEnergyPicker
          mood={draft.mood}
          energyLevel={draft.energyLevel}
          onMoodChange={(v) => patch('mood', v)}
          onEnergyChange={(v) => patch('energyLevel', v)}
        />
      </section>

      {/* ── 6. Gratitude ──────────────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={LABEL_CLASS}>
          <Heart className="w-3.5 h-3.5 text-rose-400/60" aria-hidden />
          Gratitude
        </p>
        <div className="space-y-2">
          {draft.gratitude.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <NeuralInput
                type="text"
                value={item}
                onChange={(e) => updateGratitude(idx, e.target.value)}
                placeholder={`Grateful for #${idx + 1}…`}
                className="flex-1"
              />
              <NeuralButton
                type="button"
                onClick={() => removeGratitude(idx)}
                variant="secondary"
                size="sm"
                className="shrink-0 w-10 h-10 !p-0"
                aria-label="Remove"
              >
                <X className="w-4 h-4" aria-hidden />
              </NeuralButton>
            </div>
          ))}
          {draft.gratitude.length < 3 && (
            <NeuralButton
              type="button"
              variant="ghost"
              size="sm"
              themeColor="emerald"
              onClick={addGratitude}
              className="!p-0 !h-auto text-xs"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Add what you're grateful for
            </NeuralButton>
          )}
        </div>
      </section>

      {/* ── 7. Blockers ───────────────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={LABEL_CLASS}>
          <AlertCircle className="w-3.5 h-3.5 text-amber-400/60" aria-hidden />
          Blockers
        </p>
        <RichTextEditor
          value={draft.blockers}
          onChange={(html) => patch('blockers', html)}
          placeholder="Any obstacles or friction today?"
          minHeight="72px"
        />
      </section>

      {/* ── 8. Save (sticky) ──────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 px-4 pb-4 pt-3 bg-black/60 backdrop-blur-md border-t border-white/8">
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
              'mt-2 text-[11px] font-semibold tracking-wide text-center',
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
