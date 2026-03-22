/**
 * JournalTab — Main container for the Atlas Journal feature.
 *
 * Three sub-views:
 *  - today     : JournalEntryEditor for today's entry
 *  - freeform  : JournalEntryEditor (blank today merge)
 *  - history   : JournalHistoryList with slide-over detail
 *
 * The vault gate is handled by the parent (EnhancedAtlasDashboard)
 * which passes isLocked/encryptionKey — but we also render
 * JournalVaultGate as a fallback for direct usage.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { QuickReminderModal } from '@/core/components/QuickReminderModal';
import { JournalVaultGate } from './JournalVaultGate';
import { JournalEntryEditor } from './JournalEntryEditor';
import { JournalHistoryList } from './JournalHistoryList';
import {
  saveJournalEntry,
  loadJournalEntry,
  subscribeJournalEntries,
  createEmptyJournalEntry,
} from '../../services/journal-service';
import type { AtlasProfile } from '../../services/atlas-profile-service';
import type { JournalEntry } from '@/lib/types';
import type { JournalSaveFeedback } from './JournalEntryEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

type JournalView = 'today' | 'freeform' | 'history';

export interface JournalTabProps {
  profile: AtlasProfile | null;
  userId: string | null;
  encryptionKey: CryptoKey | null;
  isLocked: boolean;
  onSendMessage: (msg: string) => void;
  focusEntryId?: string;
  activeView: JournalView;
  onViewChange: (view: JournalView) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function formatFullDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Compute reflection streak: consecutive days (including today) with entries. */
function computeStreak(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0;
  // entries are newest-first from subscribeJournalEntries
  const today = todayDateString();
  let streak = 0;
  let cursor = new Date(today);

  for (let i = 0; i < 365; i++) {
    const dateStr = cursor.toISOString().split('T')[0];
    const found = entries.find((e) => e.date === dateStr);
    if (!found) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function JournalTab({
  profile,
  userId,
  encryptionKey,
  isLocked,
  onSendMessage,
  focusEntryId,
  activeView,
  onViewChange,
}: JournalTabProps) {
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<JournalSaveFeedback | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [remindEntry, setRemindEntry] = useState<JournalEntry | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isRegisteredModalOpen, setIsRegisteredModalOpen] = useState(false);
  const [registeredQuote, setRegisteredQuote] = useState<string>('');
  const [registeredEntryDateLabel, setRegisteredEntryDateLabel] = useState<string>('');
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [pendingOverwriteEntry, setPendingOverwriteEntry] = useState<JournalEntry | null>(null);
  const skipOverwriteConfirmRef = useRef(false);

  // Track if we've already requested an AI prompt this session.
  const promptRequestedRef = useRef(false);

  // ── Load today's entry on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (isLocked || !encryptionKey || !userId) return;

    let cancelled = false;
    const today = todayDateString();

    loadJournalEntry(today, { userId, encryptionKey })
      .then((loaded) => {
        if (cancelled) return;
        setTodayEntry(loaded ?? createEmptyJournalEntry(today));
      })
      .catch((err) => {
        console.error('[JournalTab] Failed to load today entry:', err);
        if (!cancelled) setTodayEntry(createEmptyJournalEntry(today));
      });

    return () => { cancelled = true; };
  // userId and encryptionKey are stable references within a session
  }, [userId, encryptionKey, isLocked]);

  // ── Subscribe to entries list ───────────────────────────────────────────────
  useEffect(() => {
    if (isLocked || !encryptionKey || !userId) {
      setIsLoadingEntries(false);
      return () => {};
    }

    setIsLoadingEntries(true);
    const unsubscribe = subscribeJournalEntries({
      userId,
      encryptionKey,
      onUpdate: (updated) => {
        setEntries(updated);
        setIsLoadingEntries(false);
      },
    });
    return unsubscribe;
  }, [userId, encryptionKey, isLocked]);

  useEffect(() => {
    if (!focusEntryId) return;
    const target = entries.find((e) => e.id === focusEntryId);
    if (target) {
      onViewChange('history');
      setSelectedEntry(target);
    }
  }, [entries, focusEntryId, onViewChange]);

  // ── AI prompt: request on freeform view switch ──────────────────────────────
  useEffect(() => {
    if (activeView === 'freeform' && !promptRequestedRef.current) {
      promptRequestedRef.current = true;
      setIsLoadingPrompt(true);
      setAiPrompt(null);
      onSendMessage('__journal_prompt_request__');

      // Fallback placeholder after 3 s if no external response arrives.
      const timer = setTimeout(() => {
        setIsLoadingPrompt(false);
        setAiPrompt(
          'Take a moment to reflect: What was one small win today, and what would you do differently?',
        );
      }, 3000);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activeView, onSendMessage]);

  // ── Vault gate ──────────────────────────────────────────────────────────────
  if (isLocked || !encryptionKey || !userId) {
    return <JournalVaultGate />;
  }

  // ── Handle save ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (updated: JournalEntry) => {
      if (!userId || !encryptionKey) return;

      // The journal is stored 1 entry per day (doc id is YYYY-MM-DD).
      // If an entry already exists for this date, saving again overwrites it.
      if (skipOverwriteConfirmRef.current) {
        skipOverwriteConfirmRef.current = false;
      } else {
        const existingForDay = entries.some((e) => e.id === updated.id);
        const isTodayEditor = activeView === 'today' || activeView === 'freeform';
        if (existingForDay && isTodayEditor && updated.date === todayDateString()) {
          setPendingOverwriteEntry(updated);
          setIsOverwriteConfirmOpen(true);
          return;
        }
      }

      setIsSaving(true);
      setSaveFeedback(null);
      setIsRegisteredModalOpen(false);

      try {
        const isNew = !entries.find((e) => e.id === updated.id);
        const saved = await saveJournalEntry(updated, { userId, encryptionKey });
        if (!saved) {
          setSaveFeedback({
            tone: 'warning',
            message: 'Nothing to save.',
          });
          return;
        }

        // Update local today entry if it's today's date
        if (updated.date === todayDateString()) {
          setTodayEntry(updated);
        }

        const streak = computeStreak([updated, ...entries.filter((e) => e.id !== updated.id)]);

        // Optimistically update in-memory history so the UI reflects creation immediately.
        setEntries((prev) => {
          const filtered = prev.filter((e) => e.id !== updated.id);
          const next = [updated, ...filtered];
          next.sort((a, b) => b.date.localeCompare(a.date));
          return next;
        });
        if (selectedEntry?.id === updated.id) {
          setSelectedEntry(updated);
        }

        Spine.publish({
          type: isNew ? 'JOURNAL_ENTRY_CREATED' : 'JOURNAL_ENTRY_UPDATED',
          source: 'atlas-journal',
          domain: 'C',
          priority: 'info',
          data: { date: updated.date, reflectionStreak: streak },
        });

        // UX: clear editor content + navigate to history + show modal.
        if (updated.date === todayDateString()) {
          // JournalEntryEditor keeps local draft unless entry.id changes; switching tabs
          // immediately unmounts it, so the user sees cleared state after we return later.
          setTodayEntry(createEmptyJournalEntry(todayDateString()));
        }
        setSelectedEntry(null);
        onViewChange('history');
        const quotes = [
          'Small honesty, big momentum.',
          'What you name becomes what you can work with.',
          'Reflection is training for clarity.',
          'You showed up for yourself today.',
        ];
        const pick = quotes[Math.floor(Math.random() * quotes.length)] ?? quotes[0];
        setRegisteredQuote(pick);
        setRegisteredEntryDateLabel(formatFullDate(updated.date));
        setIsRegisteredModalOpen(true);
      } catch (err) {
        console.error('[JournalTab] Failed to save journal entry:', err);
        setSaveFeedback({
          tone: 'error',
          message: 'Save failed. Try again.',
        });
      } finally {
        setIsSaving(false);
      }
    },
    [userId, encryptionKey, entries, selectedEntry, activeView, onViewChange],
  );

  const handleConfirmOverwrite = useCallback(async () => {
    if (!pendingOverwriteEntry) return;
    setIsOverwriteConfirmOpen(false);
    const entryToSave = pendingOverwriteEntry;
    setPendingOverwriteEntry(null);
    skipOverwriteConfirmRef.current = true;
    await handleSave(entryToSave);
  }, [pendingOverwriteEntry, handleSave]);

  // ── Regenerate prompt ────────────────────────────────────────────────────────
  const handleRegeneratePrompt = useCallback(() => {
    promptRequestedRef.current = false;
    setIsLoadingPrompt(true);
    setAiPrompt(null);
    onSendMessage('__journal_prompt_request__');

    const timer = setTimeout(() => {
      setIsLoadingPrompt(false);
      setAiPrompt(
        'What emotion has dominated your day, and where do you think it came from?',
      );
    }, 3000);

    // No cleanup needed here since this is a one-shot callback.
    void timer;
  }, [onSendMessage]);

  // Clear feedback after a short delay
  const saveFeedbackTimeoutId = useRef<number | null>(null);
  useEffect(() => {
    if (!saveFeedback) return;
    if (saveFeedbackTimeoutId.current) clearTimeout(saveFeedbackTimeoutId.current);
    saveFeedbackTimeoutId.current = window.setTimeout(() => setSaveFeedback(null), 2200);
    return () => {
      if (saveFeedbackTimeoutId.current) clearTimeout(saveFeedbackTimeoutId.current);
      saveFeedbackTimeoutId.current = null;
    };
  }, [saveFeedback]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const habits = profile?.habits ?? [];
  const goals = profile?.goals ?? [];
  const today = todayDateString();
  const editorEntry = todayEntry ?? createEmptyJournalEntry(today);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Scrollable content area ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 md:px-6 pt-5">
        <AnimatePresence mode="wait">
          {/* ── TODAY VIEW ───────────────────────────────────────────── */}
          {activeView === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <JournalEntryEditor
                entry={editorEntry}
                habits={habits}
                goals={goals}
                aiPrompt={null}
                isLoadingPrompt={false}
                isSaving={isSaving}
                saveFeedback={saveFeedback}
                onSave={handleSave}
                onRegeneratePrompt={handleRegeneratePrompt}
              />
            </motion.div>
          )}

          {/* ── FREE WRITE VIEW ──────────────────────────────────────── */}
          {activeView === 'freeform' && (
            <motion.div
              key="freeform"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <JournalEntryEditor
                entry={editorEntry}
                habits={habits}
                goals={goals}
                aiPrompt={aiPrompt}
                isLoadingPrompt={isLoadingPrompt}
                isSaving={isSaving}
                saveFeedback={saveFeedback}
                onSave={handleSave}
                onRegeneratePrompt={handleRegeneratePrompt}
              />
            </motion.div>
          )}

          {/* ── HISTORY VIEW ─────────────────────────────────────────── */}
          {activeView === 'history' && !selectedEntry && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <JournalHistoryList
                entries={entries}
                onSelect={setSelectedEntry}
                isLoading={isLoadingEntries}
              />
            </motion.div>
          )}

          {/* ── HISTORY DETAIL (selected entry) ──────────────────────── */}
          {activeView === 'history' && selectedEntry && (
            <motion.div
              key={`detail-${selectedEntry.id}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <NeuralButton
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  variant="ghost"
                  size="sm"
                  themeColor="emerald"
                  className="!p-0 !h-auto text-xs"
                >
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
                  Back to History
                </NeuralButton>
                <NeuralButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  themeColor="emerald"
                  onClick={() => setRemindEntry(selectedEntry)}
                  className="text-[10px] uppercase tracking-[0.14em] text-white/50 hover:text-white/80"
                >
                  Remind me
                </NeuralButton>
              </div>

              <JournalEntryEditor
                entry={selectedEntry}
                habits={habits}
                goals={goals}
                aiPrompt={null}
                isLoadingPrompt={false}
                isSaving={isSaving}
                saveFeedback={saveFeedback}
                onSave={handleSave}
                onRegeneratePrompt={handleRegeneratePrompt}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        isOpen={isOverwriteConfirmOpen}
        onClose={() => {
          setIsOverwriteConfirmOpen(false);
          setPendingOverwriteEntry(null);
        }}
        onConfirm={() => {
          void handleConfirmOverwrite();
        }}
        title="Overwrite today's journal entry?"
        description="You already have an entry for this date. Saving again will replace it."
        confirmLabel="Overwrite"
        cancelLabel="Cancel"
        variant="warning"
      />

      <NeuralModal
        isOpen={isRegisteredModalOpen}
        onClose={() => setIsRegisteredModalOpen(false)}
        title="Successfully registered your journal entry"
        subtitle={registeredEntryDateLabel ? `For ${registeredEntryDateLabel}` : 'For today'}
        icon={BookOpen}
        themeColor="emerald"
        maxWidth="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-white/80 leading-relaxed">
            {registeredQuote}
          </p>
          <p className="text-[11px] text-white/40 uppercase tracking-widest">
            Journal History Updated
          </p>
        </div>
      </NeuralModal>
      <QuickReminderModal
        open={!!remindEntry}
        moduleId="atlas"
        defaultTitle={remindEntry ? `Journal: ${formatFullDate(remindEntry.date)}` : ''}
        defaultNote={remindEntry?.freeform || remindEntry?.eveningReflection || remindEntry?.morningIntent || ''}
        deepLink={
          remindEntry
            ? { route: '/atlas', focusId: `journal:${remindEntry.id}` }
            : undefined
        }
        source={
          remindEntry
            ? { moduleId: 'atlas', entityType: 'journal', entityId: remindEntry.id, label: remindEntry.date }
            : undefined
        }
        tags={remindEntry?.tags}
        onClose={() => setRemindEntry(null)}
      />
    </div>
  );
}
