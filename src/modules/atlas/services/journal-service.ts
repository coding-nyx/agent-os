/**
 * Atlas Journal Service
 *
 * Stores E2EE journal entries in the Firestore subcollection:
 *   atlas_journals/{userId}/entries/{entryId}
 *
 * Each document contains:
 *   - encryptedData : Base64 AES-GCM ciphertext of the full JournalEntry JSON
 *   - iv            : Base64 AES-GCM initialisation vector
 *   - metadata      : Plaintext summary so the collection can be listed/sorted
 *                     without a full decrypt on every document.
 */

import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { JournalEntry } from '@/lib/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Shape stored in Firestore — never expose raw to callers. */
interface PersistedJournalDoc {
  encryptedData: string;
  iv: string;
  metadata: {
    date: string;
    mood: number;
    updatedAt: string;
  };
}

function journalEntryHasSignificantContent(entry: JournalEntry): boolean {
  const hasText =
    entry.freeform.trim().length > 0 ||
    entry.morningIntent.trim().length > 0 ||
    entry.eveningReflection.trim().length > 0 ||
    entry.blockers.trim().length > 0 ||
    (entry.gratitude?.length ?? 0) > 0;

  const hasRatings = entry.mood !== 3 || entry.energyLevel !== 3;

  // Tags represent provenance (e.g. check-in). They also prevent saving
  // placeholder "check-in" entries without any user-visible content.
  const hasTags = (entry.tags?.length ?? 0) > 0;

  return hasText || hasRatings || hasTags;
}

function entriesColPath(userId: string) {
  return `atlas_journals/${userId}/entries`;
}

async function decryptEntry(
  raw: PersistedJournalDoc,
  encryptionKey: CryptoKey,
): Promise<JournalEntry | null> {
  if (!raw.encryptedData || !raw.iv) {
    console.warn('[JournalService] Skipping malformed entry — missing encryptedData or IV');
    return null;
  }

  try {
    const plaintext = await decryptWithKey(
      { ciphertext: raw.encryptedData, iv: raw.iv },
      encryptionKey,
    );
    return JSON.parse(plaintext) as JournalEntry;
  } catch (err) {
    const errorMsg = err instanceof Error ? (err.message || err.name) : String(err);
    const date = raw.metadata?.date || 'unknown date';
    
    console.error(`[JournalService] Failed to decrypt entry for ${date}: ${errorMsg}`);
    
    // If it's a cryptographic failure, return a "Locked" placeholder
    // This allows the UI to show that an entry EXISTS but cannot be read.
    const fallback = createEmptyJournalEntry(date);
    return {
      ...fallback,
      mood: raw.metadata?.mood ?? fallback.mood,
      freeform: `[This entry is locked behind a different encryption key and cannot be decrypted with your current master key.]`,
      updatedAt: raw.metadata?.updatedAt || fallback.updatedAt,
      tags: [...fallback.tags, 'locked-entry'],
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a single journal entry for the given user.
 *
 * The full `JournalEntry` is JSON-stringified and encrypted with AES-GCM.
 * Plaintext metadata (date, mood, updatedAt) is stored alongside for fast
 * listing without full decryption on every document.
 */
export async function saveJournalEntry(
  entry: JournalEntry,
  opts: { userId: string; encryptionKey: CryptoKey },
): Promise<boolean> {
  const { userId, encryptionKey } = opts;
  const dataLayer = getNexusDataLayer();

  if (!journalEntryHasSignificantContent(entry)) {
    console.info('[JournalService] Skipping save — entry has no significant content.', {
      date: entry.date,
      id: entry.id,
    });
    return false;
  }

  const encrypted = await encryptWithKey(JSON.stringify(entry), encryptionKey);

  const payload: PersistedJournalDoc = {
    encryptedData: encrypted.ciphertext,
    iv: encrypted.iv,
    metadata: {
      date: entry.date,
      mood: entry.mood,
      updatedAt: entry.updatedAt,
    },
  };

  await dataLayer.setDocument(entriesColPath(userId), entry.id, payload);
  return true;
}

/**
 * Load a single journal entry by date (YYYY-MM-DD).
 *
 * Returns `null` when the document doesn't exist or decryption fails.
 */
export async function loadJournalEntry(
  date: string,
  opts: { userId: string; encryptionKey: CryptoKey },
): Promise<JournalEntry | null> {
  const { userId, encryptionKey } = opts;
  const dataLayer = getNexusDataLayer();
  const raw = await dataLayer.getDocument<PersistedJournalDoc>(entriesColPath(userId), date);
  if (!raw) return null;
  return decryptEntry(raw, encryptionKey);
}

/**
 * Load the most recent journal entries for a user (default: last 30).
 *
 * Entries are ordered newest-first. Any entry that fails to decrypt (e.g.
 * key rotation artefacts) is silently skipped rather than throwing.
 */
export async function loadJournalEntries(opts: {
  userId: string;
  encryptionKey: CryptoKey;
  limit?: number;
}): Promise<JournalEntry[]> {
  const { userId, encryptionKey, limit = 30 } = opts;
  const dataLayer = getNexusDataLayer();
  const docs = await dataLayer.query<PersistedJournalDoc>({
    collection: entriesColPath(userId),
    orderBy: [{ field: 'metadata.date', direction: 'desc' }],
    limit,
  });

  const results: JournalEntry[] = [];
  for (const raw of docs) {
    const entry = await decryptEntry(raw, encryptionKey);
    if (entry !== null) results.push(entry);
  }

  return results; // already sorted newest-first by the Firestore query
}

/**
 * Subscribe to real-time updates of the most recent journal entries.
 *
 * Returns an unsubscribe function. Entries that fail to decrypt are skipped.
 */
export function subscribeJournalEntries(opts: {
  userId: string;
  encryptionKey: CryptoKey;
  onUpdate: (entries: JournalEntry[]) => void;
  limit?: number;
}): () => void {
  const { userId, encryptionKey, onUpdate, limit = 30 } = opts;
  const dataLayer = getNexusDataLayer();
  const unsubscribe = dataLayer.subscribeToQuery<PersistedJournalDoc>(
    {
      collection: entriesColPath(userId),
      orderBy: [{ field: 'metadata.date', direction: 'desc' }],
      limit,
    },
    async (docs) => {
      const results: JournalEntry[] = [];
      for (const raw of docs) {
        const entry = await decryptEntry(raw, encryptionKey);
        if (entry !== null) results.push(entry);
      }
      onUpdate(results); // already sorted newest-first by the Firestore query
    },
  );

  return unsubscribe;
}

/**
 * Delete a single journal entry by date (YYYY-MM-DD).
 */
export async function deleteJournalEntry(
  date: string,
  opts: { userId: string },
): Promise<void> {
  const { userId } = opts;
  const dataLayer = getNexusDataLayer();
  await dataLayer.deleteDocument(entriesColPath(userId), date);
}

/**
 * Build an empty, default-valued `JournalEntry` for the given date.
 *
 * Suitable as a starting point before the user (or an AI brief) populates
 * the fields. `id` and `date` are both set to the supplied YYYY-MM-DD string.
 */
export function createEmptyJournalEntry(date: string): JournalEntry {
  const now = new Date().toISOString();
  return {
    id: date,
    date,
    createdAt: now,
    updatedAt: now,
    morningIntent: '',
    eveningReflection: '',
    freeform: '',
    mood: 3,
    energyLevel: 3,
    gratitude: [],
    blockers: '',
    aiPromptUsed: null,
    tags: [],
    sketch: null,
  };
}

/**
 * Returns true when the morning brief localStorage signal was written today
 * for the given user.  Used by JournalTab to pre-populate `morningIntent`.
 */
export function getMorningBriefShownToday(userId?: string | null): boolean {
  try {
    const key = `atlas_morning_brief_shown_${userId ?? 'guest'}`;
    return localStorage.getItem(key) === new Date().toISOString().split('T')[0];
  } catch {
    return false;
  }
}

/**
 * Non-mutating merge of check-in data into a journal entry.
 * Fields are only overwritten when the current value is still the empty
 * default — never clobbering text the user has already typed.
 */
export function mergeCheckInData(
  entry: JournalEntry,
  checkIn: Partial<{
    energyLevel: number;
    mood: number;
    blockers: string;
    morningIntent: string;
    eveningReflection: string;
  }>,
): JournalEntry {
  const updated: JournalEntry = { ...entry };

  if (checkIn.energyLevel !== undefined && entry.energyLevel === 3) {
    updated.energyLevel = checkIn.energyLevel;
  }

  if (checkIn.mood !== undefined && entry.mood === 3) {
    updated.mood = checkIn.mood;
  }

  if (checkIn.blockers !== undefined && entry.blockers === '') {
    updated.blockers = checkIn.blockers;
  }

  if (checkIn.morningIntent !== undefined && entry.morningIntent === '') {
    updated.morningIntent = checkIn.morningIntent;
  }

  if (
    checkIn.eveningReflection !== undefined &&
    entry.eveningReflection === ''
  ) {
    updated.eveningReflection = checkIn.eveningReflection;
  }

  updated.updatedAt = new Date().toISOString();
  return updated;
}
