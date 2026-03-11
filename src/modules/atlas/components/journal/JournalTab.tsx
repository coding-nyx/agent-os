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

// ── Types ─────────────────────────────────────────────────────────────────────

type JournalView = 'today' | 'freeform' | 'history';

export interface JournalTabProps {
  profile: AtlasProfile | null;
  userId: string | null;
  encryptionKey: CryptoKey | null;
  isLocked: boolean;
  onSendMessage: (msg: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
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

// ── Sub-view pill nav ─────────────────────────────────────────────────────────

const VIEWS: { id: JournalView; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'freeform', label: 'Free Write' },
  { id: 'history', label: 'History' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function JournalTab({
  profile,
  userId,
  encryptionKey,
  isLocked,
  onSendMessage,
}: JournalTabProps) {
  const [activeView, setActiveView] = useState<JournalView>('today');
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);

  // Track if we've already requested an AI prompt this session.
  const promptRequestedRef = useRef(false);

  // ── Vault gate ──────────────────────────────────────────────────────────────
  if (isLocked || !encryptionKey || !userId) {
    return <JournalVaultGate />;
  }

  // ── Load today's entry on mount ─────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Subscribe to entries list ───────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── AI prompt: request on freeform view switch ──────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // ── Handle save ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (updated: JournalEntry) => {
      if (!userId || !encryptionKey) return;
      setIsSaving(true);

      try {
        const isNew = !entries.find((e) => e.id === updated.id);
        await saveJournalEntry(updated, { userId, encryptionKey });

        // Update local today entry if it's today's date
        if (updated.date === todayDateString()) {
          setTodayEntry(updated);
        }

        const streak = computeStreak([updated, ...entries.filter((e) => e.id !== updated.id)]);

        Spine.publish({
          type: isNew ? 'JOURNAL_ENTRY_CREATED' : 'JOURNAL_ENTRY_UPDATED',
          source: 'atlas-journal',
          domain: 'C',
          priority: 'info',
          data: { date: updated.date, reflectionStreak: streak },
        });
      } catch (err) {
        console.error('[JournalTab] Failed to save journal entry:', err);
      } finally {
        setIsSaving(false);
      }
    },
    [userId, encryptionKey, entries],
  );

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

  // ── Derived ──────────────────────────────────────────────────────────────────
  const habits = profile?.habits ?? [];
  const goals = profile?.goals ?? [];
  const today = todayDateString();
  const editorEntry = todayEntry ?? createEmptyJournalEntry(today);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Section header ─────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-violet-400" aria-hidden />
          <h3 className="text-sm font-bold text-violet-300 font-display uppercase tracking-widest">
            Journal
          </h3>
        </div>

        {/* Sub-view pill nav */}
        <div className="flex gap-1.5 bg-black/20 rounded-xl p-1 w-fit">
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelectedEntry(null);
                setActiveView(id);
              }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400',
                activeView === id
                  ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                  : 'text-white/40 hover:text-white/70 border border-transparent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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
              {/* Back button */}
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="flex items-center gap-1.5 text-xs text-violet-400/70 hover:text-violet-300 mb-4 transition-colors font-medium focus-visible:outline-none"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
                Back to History
              </button>

              <JournalEntryEditor
                entry={selectedEntry}
                habits={habits}
                goals={goals}
                aiPrompt={null}
                isLoadingPrompt={false}
                isSaving={isSaving}
                onSave={handleSave}
                onRegeneratePrompt={handleRegeneratePrompt}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
