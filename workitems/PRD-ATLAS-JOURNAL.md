# PRD: Atlas Journal — Reflective Intelligence Layer

**Feature:** Structured + free-form journaling, vault-encrypted, integrated with morning/evening check-ins and NSV  
**Status:** ✅ Final — Approved for Implementation  
**Author:** Nexus TPM (Orchestrator Nexus)  
**Sprint Target:** Sprint 20  
**Module:** `atlas`  
**Tab Color:** `sky`  
**Firestore Subcollection:** `journal_entries/{userId}/entries/{entryId}`  

---

## Table of Contents

1. [JournalEntry Schema](#1-journalentry-schema)
2. [Tab Structure](#2-tab-structure)
3. [AI Integration](#3-ai-integration)
4. [NSV Integration](#4-nsv-integration)
5. [Morning/Evening Check-In Linkage](#5-morningevening-check-in-linkage)
6. [User Stories (MVP)](#6-user-stories-mvp)
7. [Out of Scope for MVP](#7-out-of-scope-for-mvp)

---

## 1. JournalEntry Schema

### 1.1 Firestore Collection Path

```
journal_entries/{userId}/entries/{entryId}
```

**Do NOT embed journals in the `atlas_profiles` blob.** The `AtlasProfile` document is re-encrypted and overwritten on every `saveAtlasProfile` call. Embedding journal entries there means the entire growing journal re-encrypts on every profile save — a non-starter at scale. The subcollection model gives each entry its own document, independent encryption, and Firestore's native pagination.

### 1.2 Encryption Strategy

Each `JournalEntry` is individually encrypted **client-side** before being written to Firestore using the **Atlas module key** (`getModuleKey('atlas')`). The Firestore document stores only the opaque encrypted payload:

```typescript
// What lands in Firestore — the raw document shape
interface JournalEntryDocument {
  encryptedData: string;  // base64 ciphertext from encryptWithKey
  iv: string;             // base64 IV from encryptWithKey
  createdAt: string;      // ISO timestamp — stored PLAINTEXT for Firestore ordering queries
  entryType: JournalEntryType; // stored PLAINTEXT for tab filtering without decryption
}
```

> `createdAt` and `entryType` are stored as plaintext **intentionally** — they are metadata required to list and filter entries without decrypting every document. They reveal no sensitive content.

### 1.3 `JournalEntryType` Enum

```typescript
export enum JournalEntryType {
  /**
   * REFLECTION — A structured daily reflection tied to one calendar date.
   * Pre-populated from morning/evening check-in data. Contains somatic and
   * cognitive snapshots alongside free-text fields. One per day maximum.
   */
  REFLECTION = 'reflection',

  /**
   * FREEFORM — An open-ended journal entry driven by AI-generated prompts
   * derived from the user's current NSV state. Not date-locked; multiple
   * allowed per day.
   */
  FREEFORM = 'freeform',

  /**
   * PROGRESS — A structured progress log attached to a specific AtlasTask,
   * AtlasHabit, or AtlasGoal by its ID. Records milestone events, streak
   * achievements, and qualitative notes about execution quality.
   */
  PROGRESS = 'progress',
}
```

### 1.4 Full `JournalEntry` Interface (Decrypted Plaintext Shape)

```typescript
// src/lib/types.ts — add to module types section

export interface JournalEntry {
  // ─── Identity ────────────────────────────────────────────────────────────
  id: string;                        // Firestore document ID (nanoid, 21 chars)
  userId: string;                    // owner — matches auth UID
  entryType: JournalEntryType;       // REFLECTION | FREEFORM | PROGRESS
  date: string;                      // YYYY-MM-DD — calendar date this entry belongs to

  // ─── REFLECTION fields (populated when entryType === REFLECTION) ─────────
  reflection: {
    // Pre-populated from EveningCheckInSubmitData
    eveningTasksCompleted: number;   // from check-in: tasksCompleted
    eveningTotalTasks: number;       // from check-in: totalTasks
    eveningEnergyLevel: number;      // from check-in: energyLevel (1-5)
    eveningBlockers: string;         // from check-in: blockers (free text)

    // Pre-populated from NSV snapshot at morning brief time
    morningCnsFatigue: number;       // NSV biological.cnsFatigue at morning brief
    morningEnergyBudget: number;     // NSV cognitive.energyBudget at morning brief
    morningFocusScore: number;       // NSV cognitive.focusScore at morning brief
    morningStressLoad: number;       // NSV emotional.stressLoad at morning brief
    morningEmotionalResilience: number; // NSV emotional.emotionalResilience at morning brief

    // User-authored fields
    intentions: string;              // What did you intend for this day? (free text)
    winOfTheDay: string;             // One concrete win (free text)
    gratitude: string;               // Gratitude note (free text)
    tomorrowFocus: string;           // Top priority for tomorrow (free text)
    overallMoodRating: number;       // User self-reported mood 1–5 (end of day)
  };

  // ─── FREEFORM fields (populated when entryType === FREEFORM) ─────────────
  freeform: {
    aiPrompt: string;                // The exact AI-generated prompt shown to user
    promptNsvSnapshot: NsvPromptSnapshot; // NSV fields that drove prompt generation
    userResponse: string;            // User's free-text response (required to save)
    aiReflection: string;            // AI's one-paragraph synthesis after user responds (may be empty string until generated)
  };

  // ─── PROGRESS fields (populated when entryType === PROGRESS) ─────────────
  progress: {
    linkedEntityType: 'task' | 'habit' | 'goal'; // what is being logged
    linkedEntityId: string;          // AtlasTask.id | AtlasHabit.id | AtlasGoal.id
    linkedEntityTitle: string;       // Denormalized title at time of logging
    streakCount: number;             // Current streak length at time of log
    milestoneReached: boolean;       // True if this log triggered a milestone
    milestoneLabel: string;          // e.g. "7-day streak", "50% to goal" — empty string if none
    qualitativeNote: string;         // User's free-text note about execution quality
    completionPercentage: number;    // 0–100, relevant for goals; 0 or 100 for habits/tasks
  };

  // ─── Shared metadata ─────────────────────────────────────────────────────
  tags: string[];                    // User-applied tags; empty array if none
  createdAt: string;                 // ISO 8601 timestamp
  updatedAt: string;                 // ISO 8601 timestamp — same as createdAt on first save
  linkedCheckInDate: string;         // YYYY-MM-DD of the originating check-in; empty string if not linked
}

/**
 * Minimal NSV snapshot captured at prompt-generation time for reproducibility.
 * Stored inside freeform entries so the context that produced the prompt is auditable.
 */
export interface NsvPromptSnapshot {
  cnsFatigue: number;
  emotionalResilience: number;
  stressLoad: number;
  energyBudget: number;
  focusScore: number;
  moodTrend: number;
  capturedAt: string; // ISO timestamp
}

/**
 * Intermediate draft state — stored in localStorage only, never Firestore.
 * Cleared on successful save or explicit dismiss.
 */
export interface DailyJournalDraft {
  date: string;                      // YYYY-MM-DD
  entryType: JournalEntryType;
  partialReflection: Partial<JournalEntry['reflection']>;
  partialFreeform: Partial<JournalEntry['freeform']>;
  partialProgress: Partial<JournalEntry['progress']>;
  nsvSnapshotCapturedAt: string;     // ISO timestamp of when NSV was snapshotted
  draftCreatedAt: string;            // ISO timestamp
}
```

### 1.5 Service Layer

A new service file is required:

```
src/modules/atlas/services/atlas-journal-service.ts
```

It exposes:

```typescript
// Load all entries for a given date (decrypted)
loadJournalEntriesForDate(date: string, userId: string, key: CryptoKey): Promise<JournalEntry[]>

// Load paginated entries (most recent first), decrypted
loadJournalEntriesPaginated(userId: string, key: CryptoKey, limit: number, afterCursor?: string): Promise<{ entries: JournalEntry[]; nextCursor: string | null }>

// Save a single entry (encrypts, writes to Firestore subcollection)
saveJournalEntry(entry: JournalEntry, userId: string, key: CryptoKey): Promise<void>

// Update specific fields of an existing entry (re-encrypts full document)
updateJournalEntry(entryId: string, updates: Partial<JournalEntry>, userId: string, key: CryptoKey): Promise<void>

// Hard-delete an entry
deleteJournalEntry(entryId: string, userId: string): Promise<void>
```

---

## 2. Tab Structure

### 2.1 New Tab Placement

The **"Journal"** tab is inserted **after "Routines & Habits" and before "Fields"** in `EnhancedAtlasDashboard.tsx`.

Updated `AtlasTab` type:

```typescript
type AtlasTab = 'dashboard' | 'backlog' | 'routines' | 'journal' | 'fields' | 'review';
```

Updated tabs array (position index 3, zero-indexed):

```typescript
{ id: 'journal', label: 'Journal', icon: BookOpen }
```

Import `BookOpen` from `lucide-react`.

**Rationale:** Journal is a reflective activity — it belongs after the operational tabs (Dashboard, Backlog, Routines) and before administrative tabs (Fields, Review). Users complete tasks/habits first, then reflect.

### 2.2 Vault-Lock Gate

When `isModuleAccessible('atlas')` returns `false` (vault is locked), the Journal tab renders a single centered component `<JournalVaultGate />` instead of any journal content.

`JournalVaultGate` displays:

- A `Lock` icon (lucide, 48px, `text-sky-400`)
- Heading: **"Journal Locked"** (`text-xl font-semibold text-white`)
- Subtext: **"Your journal is end-to-end encrypted. Unlock the Nexus vault to access your entries."** (`text-sm text-neutral-400`)
- A single CTA button: **"Unlock Vault"** — triggers the existing vault unlock flow (calls `useVault().requestUnlock()`)

No journal data is loaded, decrypted, or rendered until the vault gate is cleared. The `useEffect` that fetches journal entries is gated on `isModuleAccessible('atlas') === true`.

### 2.3 Three Sub-Views Within the Journal Tab

The Journal tab renders a secondary horizontal pill-nav (not a full tab bar — use the existing `ViewSwitcher` component pattern) with exactly three sub-views:

---

#### Sub-View 1: Daily Reflection (`reflection`)

**Purpose:** Structured daily reflection for the current day. One entry per calendar date.

**Components rendered:**
- `<JournalReflectionView />` — top-level container (new)
  - `<ReflectionEntryCard />` — renders the reflection form or the read-only completed view
    - If today's `REFLECTION` entry exists and `updatedAt !== createdAt`: shows completed read-only view with edit affordance
    - If today's `REFLECTION` entry exists but is a draft (only pre-populated fields): shows the full form pre-filled
    - If no entry exists yet: shows an empty form (NSV snapshot attached silently on first render)
  - Pre-populated check-in values appear in muted style (`text-neutral-400`) to signal they came from check-in data; user-authored fields use `text-white`
  - All five user-authored fields (`intentions`, `winOfTheDay`, `gratitude`, `tomorrowFocus`, `overallMoodRating`) are required before the "Save Reflection" button becomes active
  - `overallMoodRating` is rendered as a 5-star tap control, not a text input

**Behavior:** On save, calls `saveJournalEntry(...)` then publishes `JOURNAL_REFLECTION_SAVED` Spine event.

---

#### Sub-View 2: Free Write (`freewrite`)

**Purpose:** AI-prompted open journaling. Multiple entries allowed per day.

**Components rendered:**
- `<JournalFreewriteView />` — top-level container (new)
  - `<AIPromptCard />` — displays the current AI-generated prompt
    - Shows prompt text in `text-sky-300 italic`
    - "Regenerate" button (icon: `RefreshCw`) triggers `atlas_journal_generate_prompt` action
    - Prompt is auto-generated on sub-view mount if no active draft exists
  - `<FreewriteEditor />` — a resizable `<textarea>` with character count; min 50 characters to save
  - `<AIReflectionCard />` — shown only after user saves; displays the AI's synthesis paragraph
    - Triggers `atlas_journal_synthesize_response` action on save
  - `<FreewriteHistoryList />` — paginated list of past `FREEFORM` entries (most recent first, 10 per page)
    - Each item shows: date, first 120 chars of `userResponse`, AI prompt prefix

---

#### Sub-View 3: Progress Log (`progress`)

**Purpose:** Habit and goal progress journaling. Logs are created automatically on streak milestones and can be authored manually.

**Components rendered:**
- `<JournalProgressView />` — top-level container (new)
  - `<ProgressEntitySelector />` — horizontal scrollable chip list of all active tasks, habits, and goals
    - Selecting an entity opens `<ProgressLogForm />`
  - `<ProgressLogForm />` — pre-fills `linkedEntityId`, `linkedEntityTitle`, `streakCount`, `completionPercentage`; user writes `qualitativeNote`; milestone detection is automatic
  - `<ProgressLogTimeline />` — chronological list of all `PROGRESS` entries, grouped by entity

---

## 3. AI Integration

### 3.1 Three New ActionHub Actions

All three actions are registered under the `'atlas'` domain in `src/modules/atlas/services/actions.ts` using `ActionHub.registerMultiple`.

---

#### Action 1: `atlas_journal_generate_prompt`

```typescript
ActionHub.register('atlas', 'atlas_journal_generate_prompt', async ({
  userId,
  payload,
  emitSpineEvent,
  encryptionKey,
}) => {
  // payload shape:
  // {
  //   nsvSnapshot: NsvPromptSnapshot;
  //   recentEntryExcerpts: string[]; // last 3 freeform userResponse excerpts (max 200 chars each)
  // }
});
```

**What it does:**
1. Reads `payload.nsvSnapshot` to determine emotional/cognitive state
2. Calls the Atlas AI persona with a system-level directive to generate a single journaling prompt (1–2 sentences, introspective, non-leading)
3. Prompt tone logic (see §3.3)
4. Returns the generated prompt string
5. Stores the prompt in `DailyJournalDraft.partialFreeform.aiPrompt` in localStorage

**Spine event emitted:**

```typescript
Spine.publish({
  type: 'JOURNAL_PROMPT_GENERATED',
  source: 'atlas',
  domain: 'C',       // Cognitive domain
  priority: 'info',
  data: { userId, promptLength: generatedPrompt.length, nsvSnapshot: payload.nsvSnapshot }
});
```

---

#### Action 2: `atlas_journal_synthesize_response`

```typescript
ActionHub.register('atlas', 'atlas_journal_synthesize_response', async ({
  userId,
  payload,
  emitSpineEvent,
  encryptionKey,
}) => {
  // payload shape:
  // {
  //   entryId: string;
  //   aiPrompt: string;
  //   userResponse: string;   // the full text the user wrote
  //   nsvSnapshot: NsvPromptSnapshot;
  // }
});
```

**What it does:**
1. Sends `aiPrompt` + `userResponse` to the Atlas AI persona with instruction to write a 2–3 sentence empathetic synthesis that reflects back the user's themes without adding new advice
2. Updates the journal entry's `freeform.aiReflection` field via `updateJournalEntry`
3. Does NOT re-encrypt the entire entry from scratch — calls `updateJournalEntry` which re-encrypts the full decrypted document with the updated field

**Spine event emitted:**

```typescript
Spine.publish({
  type: 'JOURNAL_SYNTHESIS_COMPLETE',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: { userId, entryId: payload.entryId }
});
```

---

#### Action 3: `atlas_journal_extract_insights`

```typescript
ActionHub.register('atlas', 'atlas_journal_extract_insights', async ({
  userId,
  payload,
  emitSpineEvent,
  encryptionKey,
}) => {
  // payload shape:
  // {
  //   entriesWindow: 7 | 14 | 30;  // days to analyze
  //   decryptedEntries: JournalEntry[]; // pre-decrypted by caller; NOT re-fetched here
  // }
});
```

**What it does:**
1. Receives an array of pre-decrypted entries (caller is responsible for decryption — the action does not fetch or decrypt independently)
2. Sends entry content to Atlas AI persona with instruction to extract: recurring emotional themes, productivity pattern observations, and one actionable nudge
3. Returns a structured `JournalInsightReport`:

```typescript
interface JournalInsightReport {
  themes: string[];           // 2–4 short theme labels
  productivityPattern: string; // 1 sentence
  nudge: string;              // 1 actionable sentence
  analyzedEntryCount: number;
  windowDays: number;
  generatedAt: string;        // ISO timestamp
}
```

4. The returned report is **not persisted** — the calling component displays it inline. Persistence of insights is Out of Scope for MVP.

**Spine event emitted:**

```typescript
Spine.publish({
  type: 'JOURNAL_INSIGHTS_EXTRACTED',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: { userId, windowDays: payload.entriesWindow, entryCount: payload.decryptedEntries.length }
});
```

---

### 3.2 Journal Context in Atlas System Prompt

When the Journal tab is the active Atlas tab (`activeTab === 'journal'`), the Atlas prompt builder (`src/modules/atlas/prompts/atlas-prompt-builder.ts`) appends the following context block to the base system prompt:

```
## Active Context: Journal Mode

The user is currently in their private journal. Your responses should be:
- Introspective and emotionally attuned
- Non-prescriptive — reflect and synthesize, never diagnose or advise clinically
- Brief — journal prompts are 1–2 sentences; syntheses are 2–3 sentences

Current NSV emotional context:
- Emotional Resilience: {emotional.emotionalResilience}/10
- Stress Load: {emotional.stressLoad}/10
- Mood Trend: {emotional.moodTrend} (direction: -1 declining, 0 stable, +1 improving)
- CNS Fatigue: {biological.cnsFatigue}/10

Today's journal status:
- Reflection entry: {exists | not yet written}
- Freeform entries today: {count}
- Progress logs today: {count}
```

This block is injected only when `activeTab === 'journal'`; it is not present in other tab contexts.

---

### 3.3 AI Prompt Tone Logic

The `atlas_journal_generate_prompt` action applies the following deterministic tone rules before calling the AI model:

| Condition | Tone Directive Injected |
|---|---|
| `stressLoad >= 7` OR `cnsFatigue >= 7` | `"Generate a grounding, present-moment prompt. Avoid future-oriented or achievement-focused language."` |
| `emotionalResilience <= 3` | `"Generate a self-compassion prompt. Focus on acknowledging difficulty without judgment."` |
| `moodTrend === -1` (declining) AND `stressLoad >= 5` | `"Generate a perspective-broadening prompt that gently surfaces what is still going well."` |
| `energyBudget >= 7` AND `focusScore >= 7` | `"Generate an ambition-oriented prompt exploring long-term vision or creative thinking."` |
| Default (none of the above apply) | `"Generate a reflective prompt about the user's current work, habits, or personal growth."` |

Only **one** tone directive is injected — evaluated top-to-bottom, first match wins.

---

## 4. NSV Integration

### 4.1 NSV Fields READ by Journal Feature

| NSV Field | Domain.Field | Used For |
|---|---|---|
| CNS Fatigue | `biological.cnsFatigue` | Tone logic in prompt generation; pre-populated in reflection morning snapshot |
| Emotional Resilience | `emotional.emotionalResilience` | Tone logic (self-compassion trigger); morning snapshot |
| Stress Load | `emotional.stressLoad` | Tone logic (grounding trigger); morning snapshot |
| Mood Trend | `emotional.moodTrend` | Tone logic (perspective-broadening trigger); `NsvPromptSnapshot.moodTrend` |
| Energy Budget | `cognitive.energyBudget` | Tone logic (ambition trigger); morning snapshot |
| Focus Score | `cognitive.focusScore` | Tone logic (ambition trigger); morning snapshot |
| Streak Health | `planning.streakHealth` | Used in Progress sub-view to highlight at-risk streaks for logging |

All reads occur at **component mount time** via the existing `useAtlasProfile` hook or the `soul` (`GlobalProjection`) prop passed from `AtlasPage`. No new NSV read pathway is created.

### 4.2 NSV Fields WRITTEN by Journal Feature

| NSV Field | Domain.Field | When | Mechanism |
|---|---|---|---|
| Mood Trend | `emotional.moodTrend` | When user saves a `REFLECTION` entry with `overallMoodRating` | `saveAtlasProfile` is called with updated `soul.emotional.moodTrend` derived from rolling 3-day average of `overallMoodRating` values; rating 4–5 → `+1`, rating 3 → `0`, rating 1–2 → `-1` |
| Task Completion Rate | `cognitive.taskCompletionRate` | Automatically — no change needed; existing evening check-in write path already updates this | N/A — this is a note that the pre-populated `eveningTasksCompleted / eveningTotalTasks` ratio in the reflection entry validates the existing NSV write |

**Constraint:** The Journal feature does **not** introduce any new NSV write pathways beyond the `moodTrend` update on reflection save. Over-writing NSV fields from journal data introduces feedback loops that are Out of Scope for MVP.

### 4.3 New Spine Event Types

Add the following four event types to the `SpineEventType` union in `src/lib/types.ts`:

```typescript
// Atlas Journal Events
| 'JOURNAL_REFLECTION_SAVED'    // domain: C, priority: info — fired when a REFLECTION entry is saved/updated
| 'JOURNAL_PROMPT_GENERATED'    // domain: C, priority: info — fired when AI generates a freeform prompt
| 'JOURNAL_SYNTHESIS_COMPLETE'  // domain: C, priority: info — fired when AI synthesis is written to an entry
| 'JOURNAL_INSIGHTS_EXTRACTED'  // domain: C, priority: info — fired when 7/14/30-day insight report is generated
```

**Full event signatures for each:**

```typescript
// JOURNAL_REFLECTION_SAVED
{
  type: 'JOURNAL_REFLECTION_SAVED',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: {
    userId: string;
    entryId: string;
    date: string;          // YYYY-MM-DD
    overallMoodRating: number;
    moodTrendUpdated: boolean; // whether NSV moodTrend was recalculated
  }
}

// JOURNAL_PROMPT_GENERATED
{
  type: 'JOURNAL_PROMPT_GENERATED',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: {
    userId: string;
    promptLength: number;
    nsvSnapshot: NsvPromptSnapshot;
  }
}

// JOURNAL_SYNTHESIS_COMPLETE
{
  type: 'JOURNAL_SYNTHESIS_COMPLETE',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: {
    userId: string;
    entryId: string;
  }
}

// JOURNAL_INSIGHTS_EXTRACTED
{
  type: 'JOURNAL_INSIGHTS_EXTRACTED',
  source: 'atlas',
  domain: 'C',
  priority: 'info',
  data: {
    userId: string;
    windowDays: 7 | 14 | 30;
    entryCount: number;
  }
}
```

No other modules subscribe to these events in MVP. The events exist for future cross-domain intelligence (e.g., Soul Therapy reacting to mood trend shifts), but no cascade rules are wired in Sprint 20.

---

## 5. Morning/Evening Check-In Linkage

### 5.1 `DailyJournalDraft` — Intermediate State

```typescript
// Stored in localStorage — never written to Firestore
// localStorage key pattern: `atlas_journal_draft_${userId}_${date}`
// Example key: atlas_journal_draft_usr_abc123_2025-07-14

export interface DailyJournalDraft {
  date: string;                                    // YYYY-MM-DD
  entryType: JournalEntryType;                     // Always REFLECTION for check-in-sourced drafts
  partialReflection: Partial<JournalEntry['reflection']>;
  partialFreeform: Partial<JournalEntry['freeform']>;
  partialProgress: Partial<JournalEntry['progress']>;
  nsvSnapshotCapturedAt: string;                   // ISO timestamp of NSV snapshot
  draftCreatedAt: string;                          // ISO timestamp
}
```

Drafts are **cleared** when:
- `saveJournalEntry` succeeds for the corresponding entry
- User explicitly taps "Discard Draft" in `<ReflectionEntryCard />`
- A new day begins (date mismatch detected on Journal tab mount)

Drafts are **not** cleared when:
- The user navigates away from the Journal tab
- The vault is locked
- The app is closed

### 5.2 Evening Check-In Submit Sequence

When `EveningCheckIn.tsx` fires `onSubmit(data: EveningCheckInSubmitData)`:

**Step 1 — Existing behavior (unchanged):**
Persist `data` as a `DailyCheckInEntry` to `profile.dailyCheckIns[]` via `saveAtlasProfile`.

**Step 2 — New behavior: Create or update `DailyJournalDraft`:**

```typescript
const draftKey = `atlas_journal_draft_${userId}_${data.date}`;
const existingDraft: DailyJournalDraft | null = JSON.parse(localStorage.getItem(draftKey) ?? 'null');

const updatedDraft: DailyJournalDraft = {
  date: data.date,
  entryType: JournalEntryType.REFLECTION,
  partialReflection: {
    ...(existingDraft?.partialReflection ?? {}),
    eveningTasksCompleted: data.tasksCompleted,
    eveningTotalTasks: data.totalTasks,
    eveningEnergyLevel: data.energyLevel,
    eveningBlockers: data.blockers,
  },
  partialFreeform: existingDraft?.partialFreeform ?? {},
  partialProgress: existingDraft?.partialProgress ?? {},
  nsvSnapshotCapturedAt: existingDraft?.nsvSnapshotCapturedAt ?? new Date().toISOString(),
  draftCreatedAt: existingDraft?.draftCreatedAt ?? new Date().toISOString(),
};

localStorage.setItem(draftKey, JSON.stringify(updatedDraft));
```

**Step 3 — New behavior: Check for existing today's REFLECTION entry in Firestore:**
- If a `REFLECTION` entry already exists for `data.date` in `journal_entries/{userId}/entries`, call `updateJournalEntry` to merge the four evening fields (`eveningTasksCompleted`, `eveningTotalTasks`, `eveningEnergyLevel`, `eveningBlockers`)
- If no entry exists yet, the draft in localStorage serves as the pre-population source when the user navigates to Journal → Daily Reflection

**Step 4 — Publish Spine event:**
No new event is published here — the existing evening check-in Spine event flow is unchanged. The draft write is a silent local operation.

**Fields that remain for the user to fill after evening check-in pre-population:**
- `intentions` (what they intended at the start of the day — best filled in the morning)
- `winOfTheDay`
- `gratitude`
- `tomorrowFocus`
- `overallMoodRating`

---

### 5.3 Morning Check-In "Get My Daily Brief" Sequence

When `MorningCheckIn.tsx` fires `onSendMessage(buildMorningBriefPrompt(...))` (i.e., the user taps "Get My Daily Brief"):

**Step 1 — Capture NSV snapshot:**

```typescript
const snapshot: NsvPromptSnapshot = {
  cnsFatigue: soul?.biological?.cnsFatigue ?? 0,
  emotionalResilience: soul?.emotional?.emotionalResilience ?? 5,
  stressLoad: soul?.emotional?.stressLoad ?? 0,
  energyBudget: soul?.cognitive?.energyBudget ?? 5,
  focusScore: soul?.cognitive?.focusScore ?? 5,
  moodTrend: soul?.emotional?.moodTrend ?? 0,
  capturedAt: new Date().toISOString(),
};
```

**Step 2 — Write NSV snapshot to `DailyJournalDraft`:**

```typescript
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const draftKey = `atlas_journal_draft_${userId}_${today}`;
const existingDraft: DailyJournalDraft | null = JSON.parse(localStorage.getItem(draftKey) ?? 'null');

const updatedDraft: DailyJournalDraft = {
  date: today,
  entryType: JournalEntryType.REFLECTION,
  partialReflection: {
    ...(existingDraft?.partialReflection ?? {}),
    morningCnsFatigue: snapshot.cnsFatigue,
    morningEnergyBudget: snapshot.energyBudget,
    morningFocusScore: snapshot.focusScore,
    morningStressLoad: snapshot.stressLoad,
    morningEmotionalResilience: snapshot.emotionalResilience,
  },
  partialFreeform: existingDraft?.partialFreeform ?? {},
  partialProgress: existingDraft?.partialProgress ?? {},
  nsvSnapshotCapturedAt: snapshot.capturedAt,
  draftCreatedAt: existingDraft?.draftCreatedAt ?? snapshot.capturedAt,
};

localStorage.setItem(draftKey, JSON.stringify(updatedDraft));
```

**Step 3 — The morning brief AI prompt is sent as before (unchanged).** The NSV snapshot capture is a side effect that does not block or alter the existing morning brief flow.

**Step 4 — When user opens Journal → Daily Reflection sub-view:**
`<JournalReflectionView />` reads `localStorage.getItem(draftKey)` on mount. If a draft exists, it pre-populates all reflection fields found in `partialReflection`. The user sees the morning NSV values and any already-submitted evening check-in values as read-only pre-fills.

---

## 6. User Stories (MVP)

### J-001 — Daily Reflection Pre-Population from Evening Check-In

**As** a Nexus user who has completed their evening check-in,  
**I want** my journal's Daily Reflection to be pre-filled with my check-in data,  
**So that** I don't have to re-enter information I already provided.

**Given** I have submitted tonight's evening check-in with `tasksCompleted`, `totalTasks`, `energyLevel`, and `blockers`,  
**When** I navigate to Atlas → Journal → Daily Reflection,  
**Then** the four evening fields (`eveningTasksCompleted`, `eveningTotalTasks`, `eveningEnergyLevel`, `eveningBlockers`) are pre-filled and visually distinct (muted color `text-neutral-400`) from user-authored fields.

**Acceptance Criteria:**

- [ ] Evening check-in `onSubmit` writes a `DailyJournalDraft` to localStorage key `atlas_journal_draft_{userId}_{date}` containing the four evening fields
- [ ] `<ReflectionEntryCard />` reads the draft on mount and pre-fills the four fields
- [ ] Pre-filled fields are displayed with `text-neutral-400` styling and are **not editable** by the user
- [ ] The five user-authored fields (`intentions`, `winOfTheDay`, `gratitude`, `tomorrowFocus`, `overallMoodRating`) remain empty and editable
- [ ] The "Save Reflection" button is disabled until all five user-authored fields are filled
- [ ] If the Journal tab is opened before any evening check-in is submitted, the four evening fields show placeholder text `"—"` and remain locked

---

### J-002 — Vault-Encrypted Journal Entry Persistence

**As** a privacy-conscious Nexus user,  
**I want** my journal entries to be encrypted client-side before being sent to Firestore,  
**So that** Nexus servers never have access to my plaintext journal content.

**Given** I am on the Journal tab and the vault is unlocked (Atlas module key is available),  
**When** I complete a reflection entry and tap "Save Reflection",  
**Then** the entry is encrypted with `encryptWithKey` using the Atlas `CryptoKey` before any network call is made, and only `{ encryptedData, iv, createdAt, entryType }` is written to `journal_entries/{userId}/entries/{entryId}`.

**Acceptance Criteria:**

- [ ] `saveJournalEntry` calls `encryptWithKey(JSON.stringify(entry), atlasKey)` before calling `dataLayer.setDocument`
- [ ] The Firestore document contains **only** `encryptedData`, `iv`, `createdAt` (plaintext ISO string), and `entryType` (plaintext enum value) — no other fields are stored unencrypted
- [ ] When the vault is locked (`isModuleAccessible('atlas') === false`), the Journal tab renders `<JournalVaultGate />` exclusively — no entry list, no form, no partial data
- [ ] Navigating away and returning to the Journal tab (with vault still unlocked) correctly decrypts and re-renders all entries
- [ ] A Firestore document written by this feature, when read raw (bypassing the app), contains no recognizable plaintext from the journal content

---

### J-003 — AI-Prompted Free Write with NSV-Adaptive Tone

**As** a Nexus user in a high-stress state,  
**I want** the AI to generate a grounding journal prompt suited to my current cognitive/emotional state,  
**So that** journaling feels supportive rather than demanding.

**Given** my NSV shows `stressLoad >= 7` OR `cnsFatigue >= 7`,  
**When** I open Journal → Free Write (or tap "Regenerate"),  
**Then** the AI-generated prompt uses grounding/present-moment language and avoids achievement or future-oriented framing.

**Acceptance Criteria:**

- [ ] `atlas_journal_generate_prompt` reads `NsvPromptSnapshot` fields and injects the correct tone directive per the §3.3 tone logic table (first-match, top-to-bottom)
- [ ] The prompt is displayed in `text-sky-300 italic` inside `<AIPromptCard />`
- [ ] Tapping "Regenerate" dispatches `atlas_journal_generate_prompt` again with the same `NsvPromptSnapshot` (snapshot does not refresh on regenerate — it was captured at sub-view mount)
- [ ] The `NsvPromptSnapshot` used to generate the prompt is stored in `DailyJournalDraft.partialFreeform.promptNsvSnapshot` in localStorage
- [ ] `JOURNAL_PROMPT_GENERATED` Spine event is published after every generation (initial and regenerate)
- [ ] If the Atlas module key is unavailable, the "Regenerate" button is disabled and the prompt is replaced with the text `"Unlock your vault to generate journal prompts."`

---

### J-004 — Progress Log on Habit Milestone

**As** a Nexus user who just hit a 7-day habit streak,  
**I want** a progress log entry to be automatically created in my journal,  
**So that** I have a record of the milestone without having to manually navigate to the Journal tab.

**Given** `ATLAS_HABIT_LOGGED` Spine event fires and the logged habit now has a streak count that is a multiple of 7 (7, 14, 21, etc.),  
**When** the Atlas module processes the event,  
**Then** a `PROGRESS` journal entry is automatically created with `milestoneReached: true`, `milestoneLabel: "{n}-day streak"`, and `qualitativeNote: ""` (empty — auto-created entries have no user note).

**Acceptance Criteria:**

- [ ] A Spine listener on `ATLAS_HABIT_LOGGED` in `AtlasPage.tsx` (or `actions.ts`) checks if `newStreakCount % 7 === 0`
- [ ] On match, calls `saveJournalEntry` with a `PROGRESS` entry where `milestoneReached: true`, `milestoneLabel` is `"${streakCount}-day streak"`, `qualitativeNote: ""`, `completionPercentage: 0` (habits are binary — not percentage-based)
- [ ] The auto-created entry appears in Journal → Progress Log with a visual `🏆` milestone indicator
- [ ] The auto-creation does NOT require the vault to be unlocked at the moment of the Spine event — if the vault is locked, the creation is **deferred** and queued in localStorage as a `DailyJournalDraft` of type `PROGRESS`, to be flushed when the vault next unlocks
- [ ] `JOURNAL_REFLECTION_SAVED` is NOT published for auto-created progress entries (it is only for reflection entries); no Spine event is published for auto-created progress entries in MVP

---

### J-005 — Read Existing Journal Entry While Vault Is Locked

**As** a Nexus user whose vault auto-locks after inactivity,  
**I want** to see a clear, informative locked state on the Journal tab,  
**So that** I understand why my entries are not visible and know exactly how to regain access.

**Given** I previously wrote journal entries and the vault has since auto-locked,  
**When** I navigate to Atlas → Journal (any sub-view),  
**Then** I see `<JournalVaultGate />` with the lock icon, heading "Journal Locked", explanatory text, and an "Unlock Vault" CTA — and no partial entry data is rendered or leaked.

**Acceptance Criteria:**

- [ ] `<JournalVaultGate />` renders whenever `isModuleAccessible('atlas')` returns `false`, regardless of sub-view
- [ ] The component displays: `Lock` icon (48px, `text-sky-400`), heading `"Journal Locked"` (`text-xl font-semibold text-white`), subtext as specified in §2.2, and `"Unlock Vault"` button
- [ ] No `loadJournalEntriesForDate` or `loadJournalEntriesPaginated` calls are made while the vault is locked — confirmed by checking that no Firestore reads to `journal_entries/` occur in the network tab
- [ ] Tapping "Unlock Vault" calls `useVault().requestUnlock()` and does not navigate away from the Journal tab
- [ ] After successful unlock, `isModuleAccessible('atlas')` returns `true`, `<JournalVaultGate />` unmounts, and the active sub-view renders with freshly loaded (and decrypted) entries — no page reload required

---

## 7. Out of Scope for MVP

The following are **explicitly excluded** from Sprint 20. Any implementation touching these areas must be deferred to a future sprint and tracked as a separate backlog item.

| # | Feature | Rationale |
|---|---|---|
| 1 | **Journal entry search / full-text search** | Full-text search over E2EE content requires either a client-side search index (heavy, complex) or server-side decryption (violates E2EE). Both approaches require dedicated architectural planning. |
| 2 | **Journal entry tagging UI and tag-based filtering** | The `tags` field is defined in the schema for future use. The tag input component, tag management, and filter UI are non-trivial and would delay shipping the core flow. |
| 3 | **Cross-module journal access (Therapy, Trainer reading journal entries)** | Cross-module reads of vault-encrypted data require explicit user consent flows and shared key negotiation that do not exist yet. |
| 4 | **Journal insights persistence (saving `JournalInsightReport` to Firestore)** | Insight generation is ephemeral in MVP. Persisting reports requires a new Firestore collection, schema versioning, and UI to browse historical insights — deferred to a later sprint. |
| 5 | **Export / backup of journal entries (PDF, Markdown, ZIP)** | Export requires client-side bulk decryption, formatting, and file generation. Useful feature, but zero user-facing urgency for MVP. |
| 6 | **Multimedia journal entries (photo, audio, video attachments)** | Firebase Storage integration for encrypted binary blobs is a separate infrastructure concern with non-trivial cost and UX implications. |
| 7 | **Shared or collaborative journal entries** | The E2EE model is single-user by design. Multi-user sharing requires re-encryption with multiple keys — a fundamental protocol change, not a feature addition. |
| 8 | **Automated NSV recalibration triggered by journal sentiment analysis** | Sentiment-to-NSV feedback loops risk instability in the NSV pipeline. This requires careful modeling, testing, and a consent/transparency layer before implementation. |
| 9 | **Journal streaks and gamification (entry streaks, badges)** | Not harmful to exclude — the Progress sub-view tracks habit/goal streaks. A separate "journal streak" feature adds engagement mechanics that need product validation before building. |
| 10 | **Notion / Obsidian / external app sync** | Third-party integrations with plaintext export surface area violate the E2EE promise and require legal review of data handling policies. |

---

## Appendix: File Change Manifest

The following files require creation or modification in Sprint 20:

### New Files
- `src/modules/atlas/components/JournalTab.tsx` — Tab root with sub-view switcher
- `src/modules/atlas/components/JournalVaultGate.tsx` — Vault-locked state
- `src/modules/atlas/components/journal/JournalReflectionView.tsx` — Daily Reflection sub-view
- `src/modules/atlas/components/journal/ReflectionEntryCard.tsx` — Reflection form / read-only card
- `src/modules/atlas/components/journal/JournalFreewriteView.tsx` — Free Write sub-view
- `src/modules/atlas/components/journal/AIPromptCard.tsx` — AI prompt display + regenerate
- `src/modules/atlas/components/journal/FreewriteEditor.tsx` — Textarea with char count
- `src/modules/atlas/components/journal/AIReflectionCard.tsx` — AI synthesis display
- `src/modules/atlas/components/journal/FreewriteHistoryList.tsx` — Paginated past entries
- `src/modules/atlas/components/journal/JournalProgressView.tsx` — Progress Log sub-view
- `src/modules/atlas/components/journal/ProgressEntitySelector.tsx` — Entity chip selector
- `src/modules/atlas/components/journal/ProgressLogForm.tsx` — Progress entry form
- `src/modules/atlas/components/journal/ProgressLogTimeline.tsx` — Chronological log
- `src/modules/atlas/services/atlas-journal-service.ts` — Data service (load/save/update/delete)

### Modified Files
- `src/lib/types.ts` — Add `JournalEntry`, `JournalEntryType`, `NsvPromptSnapshot`, `DailyJournalDraft`, `JournalInsightReport`, 4 new `SpineEventType` values
- `src/modules/atlas/components/EnhancedAtlasDashboard.tsx` — Add `'journal'` to `AtlasTab` union and tabs array
- `src/modules/atlas/services/actions.ts` — Register 3 new ActionHub actions
- `src/modules/atlas/prompts/atlas-prompt-builder.ts` — Inject journal context block when Journal tab is active
- `src/modules/atlas/components/EveningCheckIn.tsx` — Add Step 2 draft write after existing `onSubmit` call
- `src/modules/atlas/components/MorningCheckIn.tsx` — Add NSV snapshot capture and draft write on brief trigger

---

*PRD Version: 1.0 — Sprint 20 — Nexus Orchestrator TPM*