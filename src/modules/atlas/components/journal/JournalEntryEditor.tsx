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
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
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
        <NeuralTextarea
          rows={3}
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
      <section>
        <p className={LABEL_CLASS}>Free Write</p>
        <NeuralTextarea
          rows={5}
          placeholder="How are you feeling?"
          value={draft.freeform}
          onChange={(e) => patch('freeform', e.target.value)}
        />
      </section>

      {/* ── 4. Evening Reflection ─────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Evening Reflection</p>
        <NeuralTextarea
          rows={4}
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
            <NeuralButton
              key={value}
              type="button"
              onClick={() => patch('mood', value)}
              title={label}
              variant={draft.mood === value ? 'primary' : 'secondary'}
              themeColor="emerald"
              className="flex-1 flex-col !h-14 !gap-1"
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="text-[10px] leading-none font-medium">{label}</span>
            </NeuralButton>
          ))}
        </div>
      </section>

      {/* ── 6. Energy ─────────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Energy Level</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((val) => (
            <NeuralButton
              key={val}
              type="button"
              onClick={() => patch('energyLevel', val)}
              title={`Energy ${val}`}
              variant={draft.energyLevel === val ? 'primary' : 'secondary'}
              themeColor="emerald"
              className="flex-1 !h-11 font-bold"
            >
              {val}
            </NeuralButton>
          ))}
        </div>
      </section>

      {/* ── 7. Gratitude ──────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Gratitude</p>
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

      {/* ── 8. Blockers ───────────────────────────────────────────── */}
      <section>
        <p className={LABEL_CLASS}>Blockers</p>
        <NeuralTextarea
          rows={3}
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
