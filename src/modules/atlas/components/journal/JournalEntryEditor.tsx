/**
 * JournalEntryEditor — Full-featured daily journal editor.
 *
 * Sections (top to bottom):
 *  1. Morning Intent     — collapsible, collapsed by default unless pre-filled
 *  2. Free Write         — always expanded (primary writing area)
 *  3. AI Prompt          — card with lightbulb, regenerate ghost button
 *  4. Evening Reflection — collapsible, collapsed by default unless pre-filled
 *  5. Sketch             — drawing canvas (pencil/stylus support)
 *  6. Mood & Energy      — compact merged MoodEnergyPicker widget
 *  7. Gratitude          — up to 3 text inputs with "+ Add" button
 *  8. Blockers           — rich text editor, pre-populated from check-in
 *  9. Save               — sticky NeuralButton bar
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, RefreshCw, Plus, X, Sunrise, Moon, Heart, AlertCircle, ChevronDown, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { Skeleton } from '@/core/components/Skeleton';
import { RichTextEditor } from './RichTextEditor';
import { MoodEnergyPicker } from './MoodEnergyPicker';
import { DrawingCanvas } from './DrawingCanvas';
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

const LABEL_CLASS = 'flex items-center gap-1.5 text-[11px] font-semibold text-white/50 uppercase tracking-widest font-display';
const SECTION_DIVIDER = 'border-t border-white/[0.09] pt-5';

// Strip HTML tags and return plain text preview (max N chars)
function htmlPreview(html: string, max = 60): string {
  const plain = html.replace(/<[^>]*>/g, '').trim();
  if (!plain) return '';
  return plain.length > max ? plain.slice(0, max).trimEnd() + '…' : plain;
}

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

  // Collapsed state — morning/evening collapsed by default unless pre-filled
  const [morningOpen, setMorningOpen] = useState(() => {
    const plain = entry.morningIntent.replace(/<[^>]*>/g, '').trim();
    return plain.length > 0;
  });
  const [eveningOpen, setEveningOpen] = useState(() => {
    const plain = entry.eveningReflection.replace(/<[^>]*>/g, '').trim();
    return plain.length > 0;
  });
  const [sketchOpen, setSketchOpen] = useState(() => !!entry.sketch);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-5 pb-24"
    >
      {/* ══ Unified writing card ═══════════════════════════════════ */}
      <section className="rounded-xl border border-white/[0.12] bg-slate-900/60 overflow-hidden">

        {/* ── Header: Morning Intent (collapsible) ─────────────────── */}
        <button
          type="button"
          onClick={() => setMorningOpen((o) => !o)}
          aria-expanded={morningOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.045] transition-colors"
        >
          <Sunrise className="w-3.5 h-3.5 text-amber-400/60 shrink-0" aria-hidden />
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest font-display shrink-0">
            Morning Intent
          </span>
          {!morningOpen && (
            <span className="text-[11px] text-white/25 truncate text-left flex-1 min-w-0">
              {htmlPreview(draft.morningIntent) || 'Tap to add…'}
            </span>
          )}
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-white/25 shrink-0 transition-transform duration-200 ml-auto',
              morningOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        <AnimatePresence initial={false}>
          {morningOpen && (
            <motion.div
              key="morning"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-white/[0.09]"
            >
              <RichTextEditor
                value={draft.morningIntent}
                onChange={(html) => patch('morningIntent', html)}
                placeholder="What's your intention for today?"
                minHeight="72px"
                className="rounded-none border-0 bg-transparent"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Body: Free Write (always visible, no label) ──────────── */}
        <div className="border-t border-white/[0.09]">
          <RichTextEditor
            value={draft.freeform}
            onChange={(html) => patch('freeform', html)}
            placeholder="How are you feeling? Write freely…"
            minHeight="160px"
            className="rounded-none border-0 bg-transparent"
          />
        </div>

        {/* ── Footer: Evening Reflection (collapsible) ─────────────── */}
        <AnimatePresence initial={false}>
          {eveningOpen && (
            <motion.div
              key="evening"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-white/[0.09]"
            >
              <RichTextEditor
                value={draft.eveningReflection}
                onChange={(html) => patch('eveningReflection', html)}
                placeholder="How did the day go?"
                minHeight="96px"
                className="rounded-none border-0 bg-transparent"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setEveningOpen((o) => !o)}
          aria-expanded={eveningOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 border-t border-white/[0.09] hover:bg-white/[0.045] transition-colors"
        >
          <Moon className="w-3.5 h-3.5 text-blue-400/60 shrink-0" aria-hidden />
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest font-display shrink-0">
            Evening Reflection
          </span>
          {!eveningOpen && (
            <span className="text-[11px] text-white/25 truncate text-left flex-1 min-w-0">
              {htmlPreview(draft.eveningReflection) || 'Tap to add…'}
            </span>
          )}
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 text-white/25 shrink-0 transition-transform duration-200 ml-auto',
              eveningOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

      </section>

      {/* ── AI Prompt ──────────────────────────────────────────────── */}
      {(isLoadingPrompt || aiPrompt) && (
        <section>
          <p className={cn(LABEL_CLASS, 'mb-2')}>
            <Lightbulb className="w-3.5 h-3.5 text-violet-400/60" aria-hidden />
            Today's Prompt
          </p>
          {isLoadingPrompt ? (
            <div className="space-y-2 p-4 rounded-lg border border-white/[0.12] bg-slate-900/50">
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

      {/* ── 5. Sketch (pencil/stylus canvas, collapsible) ─────────── */}
      <section className={SECTION_DIVIDER}>
        <button
          type="button"
          onClick={() => setSketchOpen((o) => !o)}
          aria-expanded={sketchOpen}
          className="w-full flex items-center justify-between gap-2 mb-2 group"
        >
          <span className={LABEL_CLASS}>
            <PenLine className="w-3.5 h-3.5 text-violet-400/60" aria-hidden />
            Sketch
          </span>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!sketchOpen && (
              <span className="text-[11px] text-white/30 truncate text-left">
                {draft.sketch ? 'Drawing saved' : 'Tap to draw…'}
              </span>
            )}
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-white/30 shrink-0 transition-transform duration-200 ml-auto',
                sketchOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </div>
        </button>
        <AnimatePresence initial={false}>
          {sketchOpen && (
            <motion.div
              key="sketch"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <DrawingCanvas
                value={draft.sketch ?? null}
                onChange={(png) => patch('sketch', png)}
                height={260}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── 6. Mood & Energy (merged) ─────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={cn(LABEL_CLASS, 'mb-2')}>Vibe Check</p>
        <MoodEnergyPicker
          mood={draft.mood}
          energyLevel={draft.energyLevel}
          onMoodChange={(v) => patch('mood', v)}
          onEnergyChange={(v) => patch('energyLevel', v)}
        />
      </section>

      {/* ── 7. Gratitude ──────────────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={cn(LABEL_CLASS, 'mb-2')}>
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

      {/* ── 8. Blockers ───────────────────────────────────────────── */}
      <section className={SECTION_DIVIDER}>
        <p className={cn(LABEL_CLASS, 'mb-2')}>
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

      {/* ── 9. Save (sticky) ──────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 px-4 pb-4 pt-3 bg-slate-900/90 backdrop-blur-md border-t border-white/[0.09]">
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
