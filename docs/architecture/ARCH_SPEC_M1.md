# AGNES Architecture Spec — Milestone 1

**Author:** System Architect  
**Date:** 2025-07-15  
**Scope:** Atlas Planner, Forge Separation, Pulse Removal  
**Status:** DRAFT

---

## TOPIC 1: ATLAS AS PLANNER

### 1.1 Problem

Atlas currently stores tasks as a flat `AtlasTaskNode[]` (max 100 items) with no concept of goals, habits, deadlines, projects, or priorities. To become a real planner, Atlas needs hierarchical task organization, temporal awareness, and calendar integration — all within the E2EE vault constraint.

### 1.2 Expanded AtlasProfile

```typescript
// --- NEW: Planning domain types ---

export type Priority = 1 | 2 | 3 | 4 | 5; // 1=critical, 5=someday

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  interval: number;           // every N units
  daysOfWeek?: number[];      // 0=Sun..6=Sat (for weekly)
  endDate?: string;           // ISO — null = forever
};

export interface Goal {
  id: string;
  title: string;
  description?: string;
  targetDate?: string;        // ISO deadline
  priority: Priority;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  projectIds: string[];       // links to Project[]
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  goalId?: string;            // optional parent Goal
  title: string;
  description?: string;
  deadline?: string;          // ISO
  priority: Priority;
  status: 'active' | 'paused' | 'completed' | 'archived';
  taskIds: string[];          // ordered list of task IDs
  createdAt: string;
  updatedAt: string;
}

export interface Habit {
  id: string;
  title: string;
  recurrence: RecurrenceRule;
  energyCost: number;         // 0-100
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt?: string;   // ISO
  status: 'active' | 'paused';
  createdAt: string;
}

// --- EXPANDED: AtlasTaskNode ---

export interface AtlasTaskNode {
  id: string;
  title: string;
  energyCost: number;
  status: 'queued' | 'active' | 'done' | 'deferred' | 'cancelled';
  priority: Priority;
  dependencies?: string[];
  projectId?: string;         // optional parent Project
  deadline?: string;          // ISO
  estimatedMinutes?: number;
  scheduledSlot?: string;     // energy wave slot ID
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// --- EXPANDED: AtlasProfile ---

export interface AtlasProfile {
  onboardingComplete: boolean;

  // Existing
  energyWave: EnergyWavePoint[];
  recoveryWindows: RecoveryWindow[];
  flattenedUntil?: string;
  summary: string;

  // NEW: Planning hierarchy
  goals: Goal[];
  projects: Project[];
  habits: Habit[];
  taskGraph: AtlasTaskNode[];   // expanded type

  // NEW: Calendar sync state
  calendarSync?: CalendarSyncState;

  // Metadata
  createdAt: string;
  updatedAt: string;
  version: number;              // schema version for migrations
}
```

### 1.3 Hierarchy & Data Flow

```
┌─────────────────────────────────────────────────┐
│                  AtlasProfile                   │
│  (single encrypted document per user)           │
├─────────────────────────────────────────────────┤
│                                                 │
│   Goal ──┬── Project ──┬── TaskNode             │
│   Goal ──┘   Project ──┘   TaskNode             │
│              Project ──── TaskNode              │
│                           TaskNode (orphan OK)  │
│                                                 │
│   Habit (independent, links to nothing)         │
│                                                 │
│   EnergyWave ◄─── scheduledSlot ───► TaskNode   │
│   RecoveryWindow                                │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Key design decision:** Flat arrays with ID references (not nested objects). This keeps the profile serializable, diffable, and avoids deep-clone issues with E2EE encrypt/decrypt cycles.

### 1.4 New Cascade Rules

```typescript
// Add to SpineEventType union:
| 'DEADLINE_APPROACHING'    // task/project deadline within 24h
| 'PLANNING_OVERLOAD'       // too many active tasks vs energy budget
| 'HABIT_STREAK_BROKEN'     // missed recurrence window
| 'GOAL_AT_RISK'            // goal's target date approaching, low completion %

// New CascadeRule definitions:

const PLANNING_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'deadline-to-energy-check',
    trigger: 'DEADLINE_APPROACHING',
    condition: (e) => {
      const task = e.data.task as AtlasTaskNode;
      return task.energyCost > 60; // high-cost deadline task
    },
    transform: (e) => ({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'atlas',
      domain: 'C',
      data: { reason: 'High-energy deadline task needs protected time', ...e.data },
      priority: 'alert',
    }),
  },
  {
    id: 'overload-to-flatten',
    trigger: 'PLANNING_OVERLOAD',
    condition: (e) => (e.data.activeTaskCount as number) > 8,
    transform: (e) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'atlas',
      domain: 'C',
      data: { reason: 'Planning overload — reducing commitments', ...e.data },
      priority: 'alert',
    }),
  },
  {
    id: 'streak-to-burnout-check',
    trigger: 'HABIT_STREAK_BROKEN',
    condition: (e) => (e.data.previousStreak as number) > 14,
    transform: (e) => ({
      type: 'BURNOUT_WARNING',
      source: 'atlas',
      domain: 'E',
      data: { reason: 'Long habit streak broken — possible burnout signal', ...e.data },
      priority: 'alert',
    }),
  },
];
```

**Integration point:** The Atlas LLM persona (183-line planner) gets 4 new actions:

```typescript
// Add to atlas persona's action set:
| 'create_goal'           // { title, targetDate?, priority }
| 'create_project'        // { title, goalId?, deadline?, priority }
| 'create_habit'          // { title, recurrence, energyCost }
| 'schedule_task_to_slot' // { taskId, slotId } — assigns task to energy wave
```

### 1.5 Storage Architecture — E2EE at Scale

**Problem:** A user with 500+ tasks, 20 projects, 50 habits creates a profile document that could reach 200KB+ encrypted. Decrypt-modify-encrypt on every change is expensive.

**Solution: Chunked Profile with Lazy Loading**

```
Firestore Layout:
  atlas_profiles/{userId}          ← core profile (goals, projects, habits, wave, summary)
  atlas_profiles/{userId}/chunks/
    tasks_0                        ← tasks[0..99]    (each chunk independently encrypted)
    tasks_1                        ← tasks[100..199]
    tasks_2                        ← tasks[200..299]

Each chunk: { ciphertext, iv, salt, version, chunkIndex, totalChunks }
```

```typescript
// Chunking interface
export interface ProfileChunkMeta {
  collection: 'tasks' | 'habits';  // extensible
  chunkIndex: number;
  totalChunks: number;
  itemCount: number;
}

export interface ChunkedProfileService {
  /** Load core profile (no tasks — they load lazily) */
  loadCore(userId: string, key: CryptoKey): Promise<AtlasProfileCore>;

  /** Load a specific task chunk */
  loadTaskChunk(userId: string, key: CryptoKey, chunkIndex: number): Promise<AtlasTaskNode[]>;

  /** Load all tasks (for full graph operations) */
  loadAllTasks(userId: string, key: CryptoKey): Promise<AtlasTaskNode[]>;

  /** Save only the modified chunk */
  saveTaskChunk(userId: string, key: CryptoKey, chunkIndex: number, tasks: AtlasTaskNode[]): Promise<void>;
}
```

**Chunk size:** 100 items per chunk. At ~200 bytes/task JSON, that's ~20KB pre-encryption per chunk — well within Firestore's 1MB document limit.

**When to chunk vs. inline:**
- `goals` and `projects`: Inline in core profile (rarely >50 items)
- `habits`: Inline in core profile (rarely >30 items)
- `taskGraph`: Chunked when >100 items, inline when ≤100 (backward compatible)

### 1.6 Calendar Integration — Abstract Adapter

```typescript
// --- Calendar Adapter Interface ---

export interface CalendarEvent {
  id: string;
  externalId?: string;        // provider's ID
  title: string;
  startTime: string;          // ISO
  endTime: string;            // ISO
  isAllDay: boolean;
  source: CalendarProvider;
  syncedAt: string;
}

export type CalendarProvider = 'google' | 'apple' | 'outlook' | 'manual';

export interface CalendarSyncState {
  provider?: CalendarProvider;
  lastSyncAt?: string;
  syncEnabled: boolean;
  calendarId?: string;        // which calendar to sync with
}

/** Abstract adapter — implementations live in separate packages */
export interface CalendarAdapter {
  readonly provider: CalendarProvider;

  /** Authenticate with the calendar provider */
  connect(credentials: CalendarCredentials): Promise<void>;

  /** Fetch events for a date range */
  fetchEvents(start: string, end: string): Promise<CalendarEvent[]>;

  /** Push a task as a calendar event */
  createEvent(event: Omit<CalendarEvent, 'id' | 'externalId' | 'syncedAt'>): Promise<CalendarEvent>;

  /** Update an existing synced event */
  updateEvent(externalId: string, patch: Partial<CalendarEvent>): Promise<void>;

  /** Delete a synced event */
  deleteEvent(externalId: string): Promise<void>;

  disconnect(): Promise<void>;
}

// Credentials are opaque to Atlas — each adapter defines its own
export type CalendarCredentials = Record<string, unknown>;
```

**Data flow for calendar sync:**

```
┌──────────┐    fetchEvents()    ┌──────────────────┐    OAuth    ┌─────────┐
│  Atlas   │ ◄────────────────── │ CalendarAdapter   │ ◄────────► │ Google  │
│  Planner │ ──────────────────► │ (GoogleCalendar   │            │ API     │
│          │    createEvent()    │  impl)            │            │         │
└──────────┘                    └──────────────────┘            └─────────┘
      │
      │  Maps CalendarEvent ←→ EnergyWavePoint
      │  Detects conflicts with RecoveryWindows
      ▼
┌──────────┐
│  Spine   │  Emits DEADLINE_APPROACHING when synced
│  Events  │  deadline is within threshold
└──────────┘
```

**Implementation note:** Calendar adapters are NOT part of the E2EE vault. Calendar events are fetched in-memory, mapped to task scheduling decisions, but never persisted in Firestore. Only `CalendarSyncState` (provider + last sync time) is stored in the profile. This avoids encrypting external data and respects the vault boundary.

---

## TOPIC 2: FORGE SEPARATION

### 2.1 Problem

Forge is a code execution environment. AGNES is a personal neural assistant. They share auth but have fundamentally different security models:
- AGNES: E2EE vault, sensitive personal data, zero-trust
- Forge: Code execution, file I/O, network access — offensive surface area

Running them in the same security boundary is a liability.

### 2.2 Decision Matrix

| Concern | Shared | Separate | **Recommendation** |
|---------|--------|----------|---------------------|
| Firebase Project | Simple billing | Blast radius isolation | **Separate** |
| Auth (Firebase Auth) | Single sign-on | Separate user pools | **Shared** (same Auth, separate projects via multi-tenant) |
| Firestore | Easy cross-read | Data isolation | **Separate** |
| Repository | Shared types | Independent deploy | **Monorepo** (shared types package) |
| Hosting | Single domain | Independent scaling | **Separate** domains |

### 2.3 Infrastructure Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MONOREPO (pnpm workspaces)              │
├──────────────┬──────────────┬───────────────────────────────┤
│  apps/agnes  │  apps/forge  │  packages/shared              │
│  (React+Vite)│  (React+Vite)│  ├── types/   (NSV, Spine)   │
│              │              │  ├── auth/    (Firebase Auth)  │
│              │              │  └── bridge/  (Soul Bridge)    │
├──────────────┼──────────────┤                               │
│  Firebase    │  Firebase    │                               │
│  Project A   │  Project B   │                               │
│  (agnes-prod)│  (forge-prod)│                               │
└──────────────┴──────────────┴───────────────────────────────┘
```

**Shared Firebase Auth** via Identity Platform multi-tenancy:
- Both projects use the same Identity Platform tenant
- User signs in once, gets tokens valid for both
- No duplicate auth infrastructure

### 2.4 Soul Bridge — Technical Design

The Soul Bridge allows Forge to read AGNES NSV state (read-only). Three options evaluated:

| Approach | Latency | Security | Complexity |
|----------|---------|----------|------------|
| Shared Firestore path | <100ms | Bad — breaks project isolation | Low |
| REST API (Cloud Function) | 200-500ms | Good — explicit auth boundary | Medium |
| Cloud Function + Pub/Sub push | <100ms after setup | Best — event-driven, no polling | High |

**Recommendation: Cloud Function API** — simple, auditable, sufficient for Forge's needs.

```typescript
// --- Soul Bridge Contract ---

// packages/shared/bridge/soul-bridge.ts

export interface SoulBridgeResponse {
  nsv: SoulBridgeNSV;
  timestamp: string;
  ttl: number;          // seconds — Forge should cache this long
}

/** Read-only NSV subset. Forge NEVER sees raw biological/emotional data. */
export interface SoulBridgeNSV {
  cognitive: {
    energyBudget: number | null;
    focusScore: number | null;
    activeLoad: number | null;
    planningLoad: number | null;
    taskCompletionRate: number | null;
  };
  resource: {
    financialFriction: number | null;
  };
  /** Derived flags — Forge doesn't need raw values */
  flags: {
    isBurnoutWarning: boolean;
    isCognitiveOverload: boolean;
    isRecoveryMode: boolean;
  };
}

export interface SoulBridgeError {
  code: 'UNAUTHORIZED' | 'USER_NOT_FOUND' | 'VAULT_LOCKED' | 'RATE_LIMITED';
  message: string;
}
```

**Cloud Function (AGNES-side):**

```typescript
// functions/src/soul-bridge.ts (deployed to AGNES Firebase project)

export const soulBridge = onCall({
  cors: ['https://forge.agnes.app'],
  enforceAppCheck: true,
}, async (request) => {
  // 1. Verify caller is authenticated
  if (!request.auth) throw new HttpsError('unauthenticated', 'No auth');

  // 2. Verify caller has Forge scope (custom claim)
  if (!request.auth.token.forgeAccess) {
    throw new HttpsError('permission-denied', 'No Forge access');
  }

  // 3. Read NSV from Firestore (server-side, no E2EE needed for NSV)
  const nsv = await getNSV(request.auth.uid);

  // 4. Return filtered, read-only subset
  return {
    nsv: filterForSoulBridge(nsv),
    timestamp: new Date().toISOString(),
    ttl: 300, // 5 minutes
  } satisfies SoulBridgeResponse;
});
```

**Dependency direction (critical):**

```
    Forge ──reads──► Soul Bridge API ──reads──► AGNES Firestore

    Forge NEVER writes to AGNES.
    AGNES has ZERO knowledge of Forge.
    Arrow is unidirectional. No circular dependency.
```

### 2.5 Code Execution Sandboxing

**Rejected approaches:**
- `Node.js vm` / `vm2` — Not a security boundary. CVEs. Never use for untrusted code.
- Raw Docker — Requires container orchestration, cold start issues

**Recommended: Cloud Run Jobs + gVisor**

```
┌───────────────────────────────────────────────────────┐
│                 Forge Execution Pipeline               │
│                                                        │
│  User Code ──► Cloud Function ──► Cloud Run Job        │
│  Submission    (validator)        (gVisor sandbox)      │
│                                                        │
│  ┌─────────────────────────────────────────────┐       │
│  │ Cloud Run Job Container                      │       │
│  │  ┌─────────────────────────────────────┐    │       │
│  │  │ gVisor (runsc) kernel               │    │       │
│  │  │  ┌──────────────────────────┐       │    │       │
│  │  │  │ User code execution      │       │    │       │
│  │  │  │ • No network (--no-net)  │       │    │       │
│  │  │  │ • 512MB RAM limit        │       │    │       │
│  │  │  │ • 30s timeout            │       │    │       │
│  │  │  │ • Read-only /usr, /lib   │       │    │       │
│  │  │  │ • Writable /tmp only     │       │    │       │
│  │  │  └──────────────────────────┘       │    │       │
│  │  └─────────────────────────────────────┘    │       │
│  └─────────────────────────────────────────────┘       │
│                                                        │
│  Results ◄── Cloud Storage bucket (ephemeral, 1h TTL)  │
└───────────────────────────────────────────────────────┘
```

**5-Layer Safety Architecture (from Forge persona):**

```typescript
export interface ForgeSafetyConfig {
  layer1_inputValidation: {
    maxCodeLength: number;       // 50KB
    blockedPatterns: RegExp[];   // rm -rf, curl, wget, etc.
    allowedLanguages: string[];  // ['javascript', 'typescript', 'python']
  };
  layer2_staticAnalysis: {
    checkImports: boolean;       // block require('child_process'), etc.
    checkNetworkCalls: boolean;  // block fetch, XMLHttpRequest
  };
  layer3_resourceLimits: {
    maxMemoryMB: number;         // 512
    maxCpuSeconds: number;       // 30
    maxOutputBytes: number;      // 1MB
  };
  layer4_networkIsolation: {
    allowNetwork: boolean;       // false for sandboxed execution
    allowedHosts?: string[];     // whitelist if network enabled
  };
  layer5_auditLog: {
    logExecution: boolean;       // always true
    retentionDays: number;       // 30
  };
}
```

### 2.6 Monorepo Structure

```
agnes/                          # root (pnpm workspaces)
├── pnpm-workspace.yaml
├── packages/
│   └── shared/                 # @agnes/shared
│       ├── types/
│       │   ├── nsv.ts          # NeuralStateVector, NeuralStateVectorPatch
│       │   ├── spine.ts        # SpineEvent, SpineEventType, CascadeRule
│       │   ├── module.ts       # ModuleId, ModuleManifestEntry
│       │   └── bridge.ts       # SoulBridgeNSV, SoulBridgeResponse
│       ├── auth/
│       │   └── firebase-auth.ts
│       └── package.json
├── apps/
│   ├── agnes/                  # current src/ moves here
│   │   ├── src/
│   │   ├── functions/
│   │   ├── firebase.json
│   │   └── package.json
│   └── forge/                  # new app
│       ├── src/
│       ├── functions/
│       ├── firebase.json
│       └── package.json
└── package.json
```

**Migration path:** This is a FUTURE state. For now, Forge stays in `src/modules/forge/` until the separation is ready. The monorepo migration happens as a dedicated milestone.

---

## TOPIC 3: PULSE REMOVAL

### 3.1 Why Remove

Pulse (trend/news tracking) has significant overlap with Scout (research/knowledge). The PM has designated Pulse for removal, with its useful types absorbed into Scout.

### 3.2 Files to Delete

```
DELETE these files/directories:

src/modules/pulse/
├── PulsePage.tsx                    # main page
├── components/
│   ├── PulseDashboard.tsx           # dashboard
│   └── PulseBubbleCanvas.tsx        # bubble visualization
├── services/
│   ├── pulse-profile-service.ts     # profile CRUD
│   ├── pulse-news-service.ts        # news fetching
│   └── actions.ts                   # LLM actions
├── onboarding/
│   └── PulseOnboarding.tsx          # onboarding flow
└── personas.ts                      # LLM persona
```

### 3.3 Manifest & Route Changes

```typescript
// src/lib/module-manifest.ts

// BEFORE:
export const MODULE_IDS = [
  'orchestrator', 'agnes', 'titan', 'soma', 'ledger',
  'atlas', 'scout', 'forge', 'pulse', 'bridge'
] as const;

export const HUB_MODULE_ORDER: ModuleId[] = [
  'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'pulse'
];

// AFTER:
export const MODULE_IDS = [
  'orchestrator', 'agnes', 'titan', 'soma', 'ledger',
  'atlas', 'scout', 'forge', 'bridge'
] as const;

export const HUB_MODULE_ORDER: ModuleId[] = [
  'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge'
];

// ALSO: Remove the 'pulse' entry from MODULE_MANIFEST map
// ALSO: Remove the pulse route from router config
```

### 3.4 Scout Absorption — Type Migration

```typescript
// Types that migrate FROM Pulse TO Scout:

// pulse/services/pulse-profile-service.ts → scout/services/scout-knowledge-service.ts

/** Rename: InterestNode → ScoutInterestNode (absorbed into Scout) */
export interface ScoutInterestNode {
  id: string;
  topic: string;
  score: number;
  trend: 'rising' | 'steady' | 'cooling';
  lastSeenAt: string;
  // NEW: link to knowledge graph
  relatedNodeIds?: string[];
}

/** Rename: PulseNewsBrief → ScoutNewsBrief */
export interface ScoutNewsBrief {
  id: string;              // NEW: add ID
  topic: string;
  summary: string;
  source?: string;
  sourceUrl?: string;      // NEW: add URL
  updatedAt: string;
  // NEW: link to verification queue
  verificationStatus?: 'unverified' | 'pending' | 'verified';
}

// EXPANDED ScoutProfile:
export interface ScoutProfile {
  onboardingComplete: boolean;
  researchFocus: string[];
  knowledgeNodes: ScoutKnowledgeNode[];
  verificationQueue: Array<{
    id: string;
    claim: string;
    status: 'pending' | 'verified' | 'contested';
    reason?: string;
  }>;

  // NEW: Absorbed from Pulse
  interests: ScoutInterestNode[];
  newsBriefs: ScoutNewsBrief[];
  newsUpdatedAt?: string;

  summary: string;
  createdAt: string;
  updatedAt: string;
}
```

**Service migration map:**

```
┌──────────────────────────────┐    ┌─────────────────────────────────┐
│  PULSE (delete)              │    │  SCOUT (absorb)                 │
├──────────────────────────────┤    ├─────────────────────────────────┤
│  pulse-profile-service.ts    │───►│  scout-knowledge-service.ts     │
│    saveProfile()             │    │    + saveInterests()            │
│    loadProfile()             │    │    + loadInterests()            │
│                              │    │                                 │
│  pulse-news-service.ts       │───►│  scout-web-search-service.ts    │
│    fetchNewsBriefs()         │    │    + fetchNewsBriefs()          │
│                              │    │    + verifyNewsClaim()          │
│                              │    │                                 │
│  actions.ts                  │───►│  actions.ts                     │
│    update_interests          │    │    + update_interests           │
│    refresh_news              │    │    + refresh_news               │
│                              │    │                                 │
│  personas.ts                 │───►│  personas.ts                    │
│    (merge relevant prompts)  │    │    (add interest/news context)  │
│                              │    │                                 │
│  PulseBubbleCanvas.tsx       │    │  (DROP — not needed in Scout)   │
│  PulseDashboard.tsx          │    │  ScoutDashboard.tsx (add tab)   │
└──────────────────────────────┘    └─────────────────────────────────┘
```

### 3.5 Spine Event Cleanup

Pulse currently doesn't define custom SpineEventTypes, but it may subscribe to events. After removal:

1. **No SpineEventType changes needed** — Pulse doesn't own any event types
2. **Remove Pulse from event subscribers** — any `spine.on()` registrations in Pulse components
3. **Remove `pulse` from source/target checks** — grep for `source: 'pulse'` or `target: 'pulse'` in cascade rules

```bash
# Cleanup verification commands:
grep -r "pulse" src/lib/spine/     # check for pulse references in Spine
grep -r "'pulse'" src/modules/     # check for pulse string literals in other modules
grep -r "PulseProfile" src/        # verify no lingering type imports
```

### 3.6 Data Migration

```typescript
// One-time migration for existing users with Pulse data:

export async function migratePulseToScout(
  userId: string,
  key: CryptoKey
): Promise<void> {
  // 1. Load existing Pulse profile
  const pulseData = await loadEncryptedProfile<PulseProfile>(
    'pulse_profiles', userId, key
  );
  if (!pulseData) return; // no pulse data, nothing to migrate

  // 2. Load existing Scout profile
  const scoutData = await loadEncryptedProfile<ScoutProfile>(
    'scout_profiles', userId, key
  );
  if (!scoutData) return;

  // 3. Merge interests and news briefs
  scoutData.interests = pulseData.interests.map(i => ({
    ...i,
    relatedNodeIds: [],
  }));
  scoutData.newsBriefs = pulseData.newsBriefs.map(n => ({
    ...n,
    id: n.id ?? crypto.randomUUID(),
    verificationStatus: 'unverified' as const,
  }));
  scoutData.newsUpdatedAt = pulseData.newsUpdatedAt;

  // 4. Save merged Scout profile
  await saveEncryptedProfile('scout_profiles', userId, key, scoutData);

  // 5. Mark Pulse profile as migrated (don't delete yet — safety)
  await markAsMigrated('pulse_profiles', userId);
}
```

### 3.7 Removal Checklist

```
[ ] 1. Add ScoutInterestNode and ScoutNewsBrief types to scout-knowledge-service.ts
[ ] 2. Expand ScoutProfile with interests, newsBriefs, newsUpdatedAt
[ ] 3. Migrate fetchNewsBriefs() to scout-web-search-service.ts
[ ] 4. Add update_interests and refresh_news to Scout actions.ts
[ ] 5. Update Scout persona to handle interest/news context
[ ] 6. Add "Interests" tab to ScoutDashboard.tsx
[ ] 7. Write and run migratePulseToScout() migration
[ ] 8. Remove 'pulse' from MODULE_IDS and HUB_MODULE_ORDER
[ ] 9. Remove pulse entry from MODULE_MANIFEST
[ ] 10. Remove pulse route from router
[ ] 11. Delete src/modules/pulse/ directory
[ ] 12. Remove any pulse imports from other modules
[ ] 13. Clean up localStorage key: nexus_pulse_profile_guest
[ ] 14. Run full test suite, verify no broken imports
```

---

## CROSS-CUTTING: DEPENDENCY MAP

```
                    ┌─────────────────────┐
                    │   packages/shared    │
                    │   (types, auth)      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │   AGNES    │   │   FORGE    │   │  Calendar   │
     │   App      │   │   App      │   │  Adapters   │
     └──────┬─────┘   └──────┬─────┘   └──────┬─────┘
            │                │                │
            │                │                │
            ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │  Firebase   │   │  Firebase   │   │  External   │
     │  Project A  │   │  Project B  │   │  APIs       │
     │  (AGNES)    │   │  (Forge)    │   │  (Google,   │
     └─────────────┘   └──────┬─────┘   │   Apple)    │
            ▲                 │         └────────────┘
            │                 │
            │    Soul Bridge  │
            │◄────────────────┘
            │  (Cloud Function,
            │   read-only)

ALLOWED DEPENDENCIES:
  Forge → shared/types      ✓
  Forge → shared/auth       ✓
  Forge → Soul Bridge API   ✓  (read-only NSV)
  Agnes → shared/types      ✓
  Agnes → shared/auth       ✓
  Agnes → Calendar Adapters ✓  (via abstract interface)

PROHIBITED:
  Forge → Agnes Firestore   ✗  (must use Soul Bridge)
  Agnes → Forge             ✗  (Agnes has zero knowledge of Forge)
  Calendar → Agnes internals ✗  (adapter pattern isolates)
  shared → Agnes or Forge    ✗  (shared depends on nothing)
```

---

## DESIGN PATTERNS APPLIED

| Pattern | Where | Why |
|---------|-------|-----|
| **Adapter** | Calendar integration | Decouple Atlas from calendar providers; swap Google for Apple without touching planner logic |
| **Facade** | Soul Bridge | Single clean interface hiding AGNES internals from Forge |
| **Strategy** | Forge sandbox | Different execution strategies (Cloud Run, future Wasm) behind same interface |
| **Observer** | Spine cascade rules | New planning events integrate naturally into existing event system |
| **Chunk/Pagination** | E2EE task storage | Handle large datasets within encryption constraints |
| **Strangler Fig** | Pulse → Scout migration | Gradually absorb Pulse functionality before deleting the module |

---

## RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Chunked E2EE adds complexity | High — bugs = data loss | Start with inline-only (≤100 tasks). Chunking is Phase 2 when users hit limits |
| Soul Bridge latency spikes | Medium — Forge feels slow | 5-min TTL cache on Forge side. NSV changes are slow (minutes, not seconds) |
| Calendar OAuth token storage | High — security sensitive | Tokens stored in Cloud Function env, NEVER in client. Refresh via server-side flow |
| Pulse data loss during migration | High — user trust | Migration copies, never moves. Pulse data marked as migrated but retained 90 days |
| Monorepo migration disrupts dev | Medium — velocity hit | Defer monorepo until Forge MVP is validated. Keep Forge in modules/ initially |

---

*End of Architecture Spec — Milestone 1*
