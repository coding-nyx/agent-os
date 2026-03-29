import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { JournalEntry } from '@/lib/types';
import {
  saveJournalEntry,
  loadJournalEntry,
  createEmptyJournalEntry,
} from '../journal-service';
import {
  JournalTone,
  JOURNAL_PROMPTS,
  JOURNAL_FORWARD,
  MOOD_LABELS,
  BLOCKER_STOP_WORDS,
  deriveNsvTone,
  dateToWeekday
} from './shared';

const JOURNAL_PROMPT_NEUTRAL = "What's been on your mind today? There's no right starting point — just write what feels real.";

export const journalActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  atlas_journal_generate_prompt: async ({ userId, pushAssistantMessage, payload }) => {
    const VALID_TONES = new Set<JournalTone>([
      'grounding', 'self-compassion', 'perspective', 'ambition', 'reflective',
    ]);

    if (typeof payload?.tone === 'string' && VALID_TONES.has(payload.tone as JournalTone)) {
      const prompt = JOURNAL_PROMPTS[payload.tone as JournalTone];
      if (pushAssistantMessage) pushAssistantMessage(prompt);
      return;
    }

    if (userId) {
      const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
      if (projection === null) {
        // Fetch failed — use neutral prompt rather than assuming user state
        if (pushAssistantMessage) pushAssistantMessage(JOURNAL_PROMPT_NEUTRAL);
        return;
      }
      const tone = deriveNsvTone(
        projection?.crossFunctionalState as unknown as Record<string, unknown> | null
      );
      const prompt = JOURNAL_PROMPTS[tone];
      if (pushAssistantMessage) pushAssistantMessage(prompt);
      return;
    }

    if (pushAssistantMessage) pushAssistantMessage(JOURNAL_PROMPT_NEUTRAL);
  },

  atlas_journal_synthesize_response: async ({ userId, pushAssistantMessage, emitSpineEvent, updateGlobalSoul, payload }) => {
    const VALID_TONES = new Set<JournalTone>([
      'grounding', 'self-compassion', 'perspective', 'ambition', 'reflective',
    ]);

    const entry = (payload?.entry ?? {}) as Partial<JournalEntry>;

    let tone: JournalTone = 'reflective';
    if (typeof payload?.tone === 'string' && VALID_TONES.has(payload.tone as JournalTone)) {
      tone = payload.tone as JournalTone;
    } else if (userId) {
      const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
      if (projection !== null) {
        tone = deriveNsvTone(
          projection?.crossFunctionalState as unknown as Record<string, unknown> | null
        );
      }
      // If projection is null (fetch failed), use default 'reflective' — no tone assumption
    }

    const moodIdx = typeof entry.mood === 'number'
      ? Math.max(1, Math.min(5, Math.round(entry.mood))) : 3;
    const moodLabel = MOOD_LABELS[moodIdx];

    let sentence1: string;
    if (moodLabel !== 'okay') {
      sentence1 = `A ${moodLabel} day — that's honest, and honesty here matters.`;
    } else {
      sentence1 = `A steady day — sometimes holding the line is the win.`;
    }

    let sentence2 = '';
    if (typeof entry.freeform === 'string' && entry.freeform.trim().length > 0) {
      const snippet = entry.freeform.trim().slice(0, 60);
      const ellipsis = entry.freeform.trim().length > 60 ? '...' : '';
      sentence2 = ` You wrote: "${snippet}${ellipsis}" — there's real self-awareness in that.`;
    } else if (typeof entry.morningIntent === 'string' && entry.morningIntent.trim().length > 0) {
      sentence2 = ` You set out to: "${entry.morningIntent.trim().slice(0, 60)}" — that intention shaped the day.`;
    }

    const journalDate = typeof entry.date === 'string' ? entry.date : new Date().toISOString().slice(0, 10);

    // Persist reflectionStreak to NSV before pushing the message — on failure, omit streak claim
    let streakSaved = false;
    if (userId) {
      try {
        const projection = await GlobalProjectionService.getProjection(userId).catch(() => null);
        const currentStreak = projection?.crossFunctionalState?.planning?.reflectionStreak ?? 0;
        await updateGlobalSoul({ planning: { reflectionStreak: currentStreak + 1 } });
        streakSaved = true;
      } catch (e) {
        console.error('[Atlas] NSV write failed (reflectionStreak):', e);
      }
    }

    const sentence3 = streakSaved
      ? ` ${JOURNAL_FORWARD[tone]}`
      : ` ${JOURNAL_FORWARD[tone]}`;
    const response = `${sentence1}${sentence2}${sentence3}`;

    if (pushAssistantMessage) pushAssistantMessage(response);

    emitSpineEvent('JOURNAL_ENTRY_CREATED', {
      priority: 'info',
      domain: 'C',
      date: journalDate,
      reflectionStreak: streakSaved ? 1 : 0,
    });
  },

  atlas_journal_create_entry: async ({ userId, encryptionKey, pushAssistantMessage, emitSpineEvent, payload }) => {
    if (!userId || !encryptionKey) return;

    const date = typeof payload?.date === 'string' ? payload.date.trim() : '';
    if (!date || isNaN(Date.parse(date))) return;

    const now = new Date().toISOString();

    // Merge payload fields over a default-valued entry so every required field
    // is always populated, regardless of what the LLM chose to omit.
    const base = createEmptyJournalEntry(date);

    const boundedMood = (v: unknown): number => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return base.mood;
      return Math.max(1, Math.min(5, Math.round(v)));
    };
    const boundedEnergy = (v: unknown): number => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return base.energyLevel;
      return Math.max(1, Math.min(5, Math.round(v)));
    };
    const safeString = (v: unknown, fallback = ''): string =>
      typeof v === 'string' ? v : fallback;
    const safeStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];

    const entry: JournalEntry = {
      ...base,
      freeform: safeString(payload?.freeform, base.freeform),
      mood: boundedMood(payload?.mood),
      energyLevel: boundedEnergy(payload?.energyLevel),
      morningIntent: safeString(payload?.morningIntent, base.morningIntent),
      eveningReflection: safeString(payload?.eveningReflection, base.eveningReflection),
      gratitude: safeStringArray(payload?.gratitude),
      blockers: safeString(payload?.blockers, base.blockers),
      tags: safeStringArray(payload?.tags),
      updatedAt: now,
    };

    await saveJournalEntry(entry, { userId, encryptionKey });

    emitSpineEvent('JOURNAL_ENTRY_CREATED', {
      priority: 'info',
      domain: 'C',
      date,
    });

    if (pushAssistantMessage) pushAssistantMessage(`Journal entry saved for ${date}.`);
  },

  atlas_journal_update_entry: async ({ userId, encryptionKey, pushAssistantMessage, emitSpineEvent, payload }) => {
    if (!userId || !encryptionKey) return;

    const entryId = typeof payload?.entryId === 'string' ? payload.entryId.trim() : '';
    if (!entryId) return;

    const patch = (payload?.patch ?? {}) as Record<string, unknown>;

    const existing = await loadJournalEntry(entryId, { userId, encryptionKey });
    if (!existing) return;

    const now = new Date().toISOString();

    // Apply each recognised patch field with type validation to prevent
    // persisting corrupt data from an LLM that misunderstands the schema.
    const updated: JournalEntry = { ...existing };

    if (typeof patch.freeform === 'string') updated.freeform = patch.freeform;
    if (typeof patch.morningIntent === 'string') updated.morningIntent = patch.morningIntent;
    if (typeof patch.eveningReflection === 'string') updated.eveningReflection = patch.eveningReflection;
    if (typeof patch.blockers === 'string') updated.blockers = patch.blockers;
    if (typeof patch.aiPromptUsed === 'string' || patch.aiPromptUsed === null) {
      updated.aiPromptUsed = patch.aiPromptUsed as string | null;
    }
    if (typeof patch.mood === 'number' && Number.isFinite(patch.mood)) {
      updated.mood = Math.max(1, Math.min(5, Math.round(patch.mood)));
    }
    if (typeof patch.energyLevel === 'number' && Number.isFinite(patch.energyLevel)) {
      updated.energyLevel = Math.max(1, Math.min(5, Math.round(patch.energyLevel)));
    }
    if (Array.isArray(patch.gratitude)) {
      updated.gratitude = (patch.gratitude as unknown[]).filter((x): x is string => typeof x === 'string');
    }
    if (Array.isArray(patch.tags)) {
      updated.tags = (patch.tags as unknown[]).filter((x): x is string => typeof x === 'string');
    }
    if (typeof patch.sketch === 'string' || patch.sketch === null) {
      updated.sketch = patch.sketch as string | null;
    }

    updated.updatedAt = now;

    await saveJournalEntry(updated, { userId, encryptionKey });

    emitSpineEvent('JOURNAL_ENTRY_UPDATED', {
      priority: 'info',
      domain: 'C',
      date: entryId,
    });

    if (pushAssistantMessage) pushAssistantMessage('Journal entry updated.');
  },

  atlas_journal_extract_insights: async ({ pushAssistantMessage, emitSpineEvent, payload }) => {
    type InsightEntry = { date: string; mood: number; energyLevel: number; blockers: string };

    const rawEntries: unknown[] = Array.isArray(payload?.entries) ? payload.entries : [];

    const entries: InsightEntry[] = rawEntries
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map(e => ({
        date: typeof e.date === 'string' ? e.date : '',
        mood: typeof e.mood === 'number' ? Math.max(1, Math.min(5, e.mood)) : 3,
        energyLevel: typeof e.energyLevel === 'number' ? Math.max(1, Math.min(5, e.energyLevel)) : 3,
        blockers: typeof e.blockers === 'string' ? e.blockers : '',
      }))
      .filter(e => e.date.length > 0);

    if (entries.length === 0) {
      if (pushAssistantMessage) {
        pushAssistantMessage("No journal entries found to analyse for this week.");
      }
      return;
    }

    const avgMood = entries.reduce((s, e) => s + e.mood, 0) / entries.length;
    const avgEnergy = entries.reduce((s, e) => s + e.energyLevel, 0) / entries.length;

    const mid = Math.ceil(entries.length / 2);
    const firstHalf = entries.slice(0, mid);
    const secondHalf = entries.slice(mid);
    const firstAvg = firstHalf.reduce((s, e) => s + e.mood, 0) / (firstHalf.length || 1);
    const secondAvg = secondHalf.reduce((s, e) => s + e.mood, 0) / (secondHalf.length || 1);
    const trendDelta = secondAvg - firstAvg;
    const trendLabel = trendDelta > 0.3 ? '📈 (trending up)'
      : trendDelta < -0.3 ? '📉 (trending down)'
        : '➡️ (stable)';

    const bestEntry = entries.reduce((best, e) =>
      (e.mood + e.energyLevel) > (best.mood + best.energyLevel) ? e : best
    );
    const bestDay = dateToWeekday(bestEntry.date);

    const wordFreq = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.blockers.trim()) continue;
      const words = entry.blockers
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !BLOCKER_STOP_WORDS.has(w));
      for (const word of words) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
      }
    }

    const topBlockers = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => `"${word}"`);

    const blockersLine = topBlockers.length > 0
      ? `- Recurring blockers: ${topBlockers.join(', ')}`
      : '- No recurring blockers identified';

    const summary = [
      '**Your week in review:**',
      `- Avg mood: ${avgMood.toFixed(1)}/5 ${trendLabel}`,
      `- Avg energy: ${avgEnergy.toFixed(1)}/5`,
      blockersLine,
      `- Best day: ${bestDay} (mood ${bestEntry.mood}, energy ${bestEntry.energyLevel})`,
    ].join('\n');

    if (pushAssistantMessage) pushAssistantMessage(summary);

    emitSpineEvent('JOURNAL_ENTRY_UPDATED', {
      priority: 'info',
      domain: 'C',
      date: new Date().toISOString().slice(0, 10),
      source: 'atlas_journal_extract_insights',
    });
  },
};
