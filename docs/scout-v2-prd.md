# Scout Module v2.0 — Product Requirement Document

**Document Version:** 1.0  
**Author:** Product Management  
**Date:** January 2025  
**Status:** Draft for Engineering Review  
**Module:** Scout (Research Intelligence Agent)

---

## Executive Summary

Scout evolves from a passive research assistant into an **active intelligence system** that autonomously conducts deep research, synthesizes insights, and delivers actionable digests. This PRD defines the complete upgrade path across three tiers (MVP, V2, V3), with full technical specifications compatible with a Firebase-backed SPA architecture.

---

## Section 1: Feature Set Definition

### 1.1 Deep Research Workflow

**One-line:** Multi-step iterative research that breaks complex questions into sub-queries, executes searches in parallel, and synthesizes findings.

**Core Problem:** Users currently get single-step search results without depth. Complex research questions require manual iteration and synthesis.

**User Story:** As a knowledge worker, I want Scout to automatically decompose my research question and explore it deeply, so that I receive comprehensive synthesized insights without manual query refinement.

**Acceptance Criteria:**
1. User can initiate a "deep research" session from any research node
2. System generates 3-7 sub-questions from the initial query within 5 seconds
3. User can approve, edit, or reject sub-questions before execution
4. Search executes in batched parallel calls (max 3 concurrent)
5. Progress UI shows which sub-questions are pending/complete
6. Synthesis triggers automatically when ≥80% of sub-questions complete
7. User can cancel mid-research; partial results are preserved
8. Total depth limited to 2 levels (initial → sub-questions → no further nesting)
9. Complete research session stored as a single knowledge node with evidence array

**Tier:** MVP  
**SPA Feasibility:** Runs entirely client-side using React 19's `useTransition` for non-blocking UI updates. Search calls routed through existing `scoutWebSearch` Cloud Function. State machine managed in component state with `AbortController` for cancellation.

---

### 1.2 Newsletter / Research Digest

**One-line:** Automated synthesis of recent research activity, trending topics, and key findings delivered as a readable digest.

**Core Problem:** Users accumulate research but have no consolidated view of what they've learned or what matters most.

**User Story:** As a researcher, I want to receive a periodic digest of my research activity and top insights, so that I can stay on top of accumulated knowledge without manual review.

**Acceptance Criteria:**
1. Digest includes: Summary stats, Top 5 verified claims, Trending interests, Contested items requiring attention, Reading list highlights
2. User can generate digest on-demand (button click)
3. User can schedule recurring digests (daily/weekly)
4. Scheduled digests written to Firestore by Cloud Function; client displays on next visit
5. Digest exportable as Markdown, PDF (via browser print), or Email (SendGrid)
6. Last 10 digests retained; older auto-deleted
7. Digest generation completes within 30 seconds

**Tier:** MVP (on-demand), V2 (scheduled)  
**SPA Feasibility:** On-demand runs client-side via LLM synthesis. Scheduled uses Firebase Scheduled Functions writing to `scout_digests/{userId}/digests/{digestId}`.

---

### 1.3 Research Scheduling

**One-line:** Queue research tasks to run at specified times or intervals via Firebase cron jobs.

**Core Problem:** Users want hands-off research that runs in the background, especially for monitoring evolving topics.

**User Story:** As a busy professional, I want to schedule research queries to run automatically, so that fresh information is waiting for me without manual initiation.

**Acceptance Criteria:**
1. User can schedule a one-time research job (specific datetime)
2. User can schedule recurring research (daily/weekly on topic)
3. Jobs execute via Firebase Scheduled Function
4. Results written to Firestore and flagged as "new" for client
5. Max 10 active scheduled jobs per user
6. Jobs auto-expire after 30 days if not renewed
7. User can view, pause, resume, or delete scheduled jobs

**Tier:** V2  
**SPA Feasibility:** Client creates job documents in Firestore. Firebase Scheduled Function (every 15 min) queries due jobs and executes them.

---

### 1.4 Source Library

**One-line:** A managed reading list of all sources encountered during research with metadata, status tracking, and organization.

**Core Problem:** Sources are buried in knowledge nodes; users cannot browse, filter, or manage their research bibliography.

**User Story:** As a researcher, I want a dedicated library of all sources I've encountered, so that I can track what I've read, revisit important articles, and manage my research bibliography.

**Acceptance Criteria:**
1. Every search result source automatically added to library
2. Source entry shows: URL, title, domain, snippet, date added, read status, star flag
3. User can filter by: domain, read/unread, starred, date range
4. User can archive sources (hidden but not deleted)
5. Duplicate URLs merged (keep earliest, update metadata)
6. Sources linked to citing knowledge nodes (many-to-many)
7. Export source library as BibTeX or CSV

**Tier:** MVP  
**SPA Feasibility:** New Firestore sub-collection `scout_sources/{userId}/sources/{sourceId}`. Client-side filtering with Firestore compound queries.

---

### 1.5 Knowledge Graph Visualisation

**One-line:** Interactive visual map of research nodes, their relationships, and evidence connections.

**Core Problem:** Users cannot see the structure of their knowledge; connections between claims remain invisible.

**User Story:** As a researcher, I want to visualize my knowledge as a connected graph, so that I can discover relationships, identify gaps, and navigate my research spatially.

**Acceptance Criteria:**
1. Graph renders all knowledge nodes as interactive nodes
2. Edges show: supports, contradicts, relates-to relationships
3. Node color indicates status (pending=yellow, verified=green, contested=red)
4. Node size reflects confidence score
5. User can zoom, pan, and click nodes to expand details
6. Filter panel allows hiding by status or confidence threshold
7. Performance: renders up to 250 nodes smoothly (60fps pan/zoom)
8. Layout algorithm: force-directed with collision detection

**Tier:** V2  
**SPA Feasibility:** Client-side rendering using D3.js force simulation. Data derived from existing `knowledgeNodes` array — no backend changes needed.

---

### 1.6 Export System

**One-line:** Export research findings as Markdown reports, PDF documents, or structured data files.

**Core Problem:** Research is locked in the app; users cannot share findings or integrate with external tools.

**User Story:** As a professional, I want to export my research as shareable documents, so that I can incorporate findings into reports, presentations, or external workflows.

**Acceptance Criteria:**
1. Export single knowledge node as Markdown
2. Export filtered set of nodes as research report (Markdown or PDF)
3. Export full digest as PDF with formatting
4. Export source library as CSV or BibTeX
5. PDF generation via browser print dialog (no external service)
6. Markdown includes YAML frontmatter (title, date, tags)

**Tier:** MVP (Markdown), V2 (PDF, BibTeX)  
**SPA Feasibility:** Client-side template rendering. PDF via `window.print()` with print-optimized CSS.

---

### 1.7 Proactive Intelligence

**One-line:** Scout monitors user interests and surfaces relevant new information without explicit queries.

**Core Problem:** Users must manually initiate all research; Scout doesn't leverage known interests to proactively inform.

**User Story:** As a knowledge-focused user, I want Scout to proactively alert me about developments in my interest areas, so that I stay informed without constant manual searching.

**Acceptance Criteria:**
1. System identifies top 5 interests by momentum score
2. Firebase Scheduled Function queries news for top interests weekly
3. New findings written to `newsBriefs` with "proactive" flag
4. Client shows "New intelligence" badge when proactive items exist
5. User can mute specific interests from proactive monitoring
6. Max 10 proactive briefs per week (prevent overload)

**Tier:** V3  
**SPA Feasibility:** Firebase Scheduled Function handles search; writes to existing `ScoutProfile.newsBriefs`. Client reads via existing real-time listener.

---

## Section 2: Deep Research Workflow — Detailed Flow

### 2.1 State Machine Definition

```
┌─────────────┐
│    IDLE     │
└──────┬──────┘
       │ user submits query
       ▼
┌─────────────────┐
│  DECOMPOSING    │ ← LLM generates sub-questions
└───────┬─────────┘
        │ sub-questions ready
        ▼
┌─────────────────┐
│ AWAITING_REVIEW │ ← User approves/edits sub-questions
└───────┬─────────┘
        │ user confirms
        ▼
┌─────────────────┐
│   SEARCHING     │ ← Parallel search execution
└───────┬─────────┘
        │ ≥80% complete OR timeout
        ▼
┌─────────────────┐
│  SYNTHESIZING   │ ← LLM synthesizes findings
└───────┬─────────┘
        │ synthesis complete
        ▼
┌─────────────────┐
│   COMPLETE      │
└─────────────────┘

Transitions from any state:
  → CANCELLED (user aborts)
  → ERROR (unrecoverable failure)
```

### 2.2 Sub-Question Generation Logic

```typescript
interface SubQuestion {
  id: string;
  text: string;
  intent: 'factual' | 'comparative' | 'temporal' | 'causal';
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  results?: SearchResult[];
}

// Generation prompt template (sent to LLM):
const DECOMPOSITION_PROMPT = `
Given the research question: "{query}"
Generate 3-7 sub-questions that would comprehensively answer this question.
Each sub-question should:
- Be independently searchable
- Cover a distinct aspect (factual, comparative, temporal, causal)
- Be specific enough for a web search

Output JSON array: [{ "text": "...", "intent": "..." }]
`;
```

**Rules:**
- Minimum 3, maximum 7 sub-questions
- At least one must be `factual`, one must be `temporal` (recent developments)
- LLM call timeout: 15 seconds
- If generation fails, fall back to single-query search

### 2.3 Search Queue Management

```typescript
interface SearchQueue {
  pending: SubQuestion[];
  inProgress: SubQuestion[];  // Max 3 concurrent
  completed: SubQuestion[];
  failed: SubQuestion[];
}

// Execution strategy:
// 1. Pop up to 3 from pending → inProgress
// 2. Execute via scoutWebSearch Cloud Function
// 3. On success: move to completed, store results
// 4. On failure: retry once, then move to failed
// 5. Repeat until pending empty
```

**Batching:** Each search request batches up to 3 queries in a single Cloud Function call to reduce cold starts.

### 2.4 Synthesis Trigger Conditions

Synthesis initiates when ANY of:
- All sub-questions completed
- ≥80% sub-questions completed AND 60 seconds elapsed since last completion
- User manually triggers "Synthesize Now"
- 5-minute total timeout reached

### 2.5 UI States

| State | User Sees |
|-------|-----------|
| IDLE | "Start Deep Research" button |
| DECOMPOSING | Spinner + "Breaking down your question..." |
| AWAITING_REVIEW | Editable list of sub-questions with checkboxes |
| SEARCHING | Progress bar + list showing ✓/⏳/✗ per sub-question |
| SYNTHESIZING | "Analyzing findings..." with evidence preview |
| COMPLETE | Full research card with synthesis + expandable evidence |
| CANCELLED | "Research cancelled. Partial results saved." |
| ERROR | Error message + "Retry" button |

### 2.6 React 19 Implementation Pattern

```typescript
function useDeepResearch(initialQuery: string) {
  const [state, setState] = useState<ResearchState>('IDLE');
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [isPending, startTransition] = useTransition();

  const executeSearch = useCallback(async (sq: SubQuestion) => {
    // Non-blocking update via useTransition
    startTransition(() => {
      setSubQuestions(prev =>
        prev.map(q => q.id === sq.id ? {...q, status: 'searching'} : q)
      );
    });

    const results = await callScoutWebSearch(sq.text, abortRef.current?.signal);

    startTransition(() => {
      setSubQuestions(prev =>
        prev.map(q => q.id === sq.id ? {...q, status: 'completed', results} : q)
      );
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState('CANCELLED');
  }, []);

  return { state, subQuestions, isPending, cancel };
}
```

### 2.7 Depth Limits & Safety Guardrails

| Guardrail | Limit | Rationale |
|-----------|-------|-----------|
| Max sub-questions | 7 | Prevent runaway API costs |
| Max search depth | 2 levels | No recursive decomposition |
| Concurrent searches | 3 | Cloud Function rate limits |
| Total timeout | 5 minutes | User patience threshold |
| Results per query | 10 | Tavily API default |
| Daily deep research sessions | 20 per user | Cost control |

---

## Section 3: Newsletter / Research Digest System

### 3.1 Digest Data Structure

```typescript
interface ScoutDigest {
  id: string;
  userId: string;
  generatedAt: string;              // ISO 8601
  generationType: 'manual' | 'scheduled';

  // Content sections
  summary: {
    totalNodes: number;
    newNodesThisPeriod: number;
    verifiedCount: number;
    contestedCount: number;
    periodStart: string;
    periodEnd: string;
  };

  topClaims: Array<{
    nodeId: string;
    claim: string;
    confidence: number;
    evidenceCount: number;
  }>;                               // Max 5

  trendingInterests: Array<{
    topic: string;
    score: number;
    trend: 'rising' | 'steady' | 'cooling';
    relatedNodeCount: number;
  }>;                               // Max 5

  attentionRequired: Array<{
    nodeId: string;
    claim: string;
    reason: 'contested' | 'low_confidence' | 'stale';
  }>;                               // Max 5

  readingHighlights: Array<{
    sourceId: string;
    title: string;
    url: string;
    relevanceScore: number;
  }>;                               // Max 5

  synthesizedInsight: string;       // LLM-generated 2-3 paragraph synthesis

  exportedFormats: ('markdown' | 'pdf' | 'email')[];

  metadata: {
    generationDurationMs: number;
    llmTokensUsed: number;
  };
}

interface DigestSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0=Sunday, for weekly
  hourUtc: number;                          // 0-23
  timezone: string;                         // IANA timezone
  lastRun?: string;
  nextRun?: string;
}
```

### 3.2 Digest Sections & Content Rules

| Section | Source Data | Selection Criteria |
|---------|-------------|-------------------|
| Summary Stats | `ScoutProfile` counts | Computed at generation time |
| Top Claims | `knowledgeNodes` | Status='verified', sorted by confidence DESC |
| Trending Interests | `interests` | Sorted by score DESC, trend='rising' preferred |
| Attention Required | `knowledgeNodes` + `verificationQueue` | Status='contested' OR confidence < 0.5 OR updatedAt > 30 days |
| Reading Highlights | `scout_sources` | starred=true OR readStatus='unread' AND relevance high |
| Synthesized Insight | All above | LLM synthesis prompt with structured input |

### 3.3 Scheduling Architecture

**Firebase Scheduled Function (cron):**

```typescript
// functions/src/scheduled/digestGenerator.ts
export const generateScheduledDigests = functions.pubsub
  .schedule('0 * * * *')  // Every hour, on the hour
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = new Date();

    // Query users with digests due
    const dueSchedules = await db
      .collectionGroup('digest_schedules')
      .where('enabled', '==', true)
      .where('nextRun', '<=', now.toISOString())
      .limit(50)  // Process in batches
      .get();

    for (const doc of dueSchedules.docs) {
      const userId = doc.ref.parent.parent!.id;
      const schedule = doc.data() as DigestSchedule;

      // Generate digest
      const digest = await generateDigestForUser(userId);

      // Write to Firestore
      await db
        .collection('scout_digests')
        .doc(userId)
        .collection('digests')
        .add(digest);

      // Update next run time
      const nextRun = calculateNextRun(schedule);
      await doc.ref.update({
        lastRun: now.toISOString(),
        nextRun: nextRun.toISOString()
      });
    }
  });
```

**Firestore Paths:**
- `scout_digests/{userId}/digests/{digestId}` — individual digest documents
- `scout_knowledge/{userId}/digest_schedule` — single document with `DigestSchedule`

**Client Listener Pattern:**

```typescript
// Real-time subscription for new digests
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(
      collection(db, 'scout_digests', userId, 'digests'),
      orderBy('generatedAt', 'desc'),
      limit(10)
    ),
    (snapshot) => {
      const digests = snapshot.docs.map(d => d.data() as ScoutDigest);
      setDigests(digests);

      // Check for new digest since last visit
      const latest = digests[0];
      if (latest && latest.generatedAt > lastVisit) {
        showNewDigestNotification();
      }
    }
  );
  return unsubscribe;
}, [userId]);
```

### 3.4 Export Formats

| Format | Implementation | Notes |
|--------|----------------|-------|
| Markdown | Template literal + `Blob` + download link | Primary format, YAML frontmatter |
| PDF | `window.print()` with `@media print` CSS | No external dependency |
| Email | Firebase Extension (SendGrid) | Triggered via callable function |

### 3.5 Digest History & TTL

- **Retention:** 10 most recent digests
- **TTL:** 90 days
- **Cleanup:** Cloud Function runs weekly, deletes digests older than TTL
- **Storage estimate:** ~5KB per digest × 10 = 50KB per user

---

## Section 4: Source Library

### 4.1 Data Model

```typescript
interface SourceEntry {
  id: string;
  url: string;
  normalizedUrl: string;          // URL without tracking params, for dedup
  title: string;
  domain: string;                 // Extracted hostname
  snippet: string;                // First 300 chars of content
  favicon?: string;               // Cached favicon URL

  // Metadata
  addedAt: string;
  lastAccessedAt?: string;
  discoveredVia: 'search' | 'manual' | 'deep_research';

  // User state
  readStatus: 'unread' | 'reading' | 'read';
  starred: boolean;
  archived: boolean;
  notes?: string;                 // User annotations
  tags: string[];

  // Relationships
  citingNodeIds: string[];        // Knowledge nodes that cite this source

  // Validation
  lastValidated?: string;
  isValid: boolean;               // Link check result
}
```

### 4.2 Distinction from ScoutKnowledgeNode

| Aspect | SourceEntry | ScoutKnowledgeNode |
|--------|-------------|-------------------|
| Purpose | Bibliography item | Research claim |
| Content | External URL reference | User's synthesized understanding |
| Lifecycle | Persists indefinitely | Verified/contested/superseded |
| Multiplicity | One per URL | Multiple can cite same source |

### 4.3 UX Specification

**Views:**
1. **List View** (default): Sortable table with columns: Title, Domain, Date Added, Status, Stars
2. **Card View**: Visual cards with favicon, title, snippet

**Filters:**
- Domain (multi-select from discovered domains)
- Read status (unread/reading/read/any)
- Starred (yes/no/any)
- Date range (added date)
- Tags (multi-select)

**Actions:**
- Mark as read/unread
- Star/unstar
- Archive/restore
- Add to research node (opens node selector)
- Open URL
- Copy citation

### 4.4 Firestore Schema

**Path:** `scout_sources/{userId}/sources/{sourceId}`

```typescript
// Security rules
match /scout_sources/{userId}/sources/{sourceId} {
  allow read, write: if request.auth.uid == userId;
}
```

**Indexes required:**
- `readStatus` + `addedAt` (DESC) — for unread list
- `starred` + `addedAt` (DESC) — for starred list
- `domain` + `addedAt` (DESC) — for domain filter
- `archived` + `addedAt` (DESC) — for archive exclusion

### 4.5 Edge Cases

| Case | Handling |
|------|----------|
| Duplicate URL | Query by `normalizedUrl` before insert; if exists, update `lastAccessedAt` and merge `citingNodeIds` |
| Broken link | Background validation job (V3); sets `isValid=false`; UI shows warning badge |
| Very long URL | Truncate display to 80 chars; store full URL |
| Missing title | Use domain + path as fallback title |

---

## Section 5: Knowledge Graph Visualisation

### 5.1 Technology Recommendation

**Recommended: D3.js Force-Directed Graph**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| D3 force-directed | Full control, no extra deps, proven at scale, React-friendly | Learning curve | ✅ Selected |
| Cytoscape.js | Graph-specialized, good algorithms | 300KB bundle, overkill | ❌ |
| Plain SVG | Simple, no deps | No physics, manual layout required | ❌ |
| Three.js/WebGL | 3D capable, very performant | Massive overkill, accessibility issues | ❌ |

**Justification:** D3's force simulation handles 250 nodes comfortably, integrates cleanly with React 19 via `useEffect`, and requires no additional dependencies beyond what's likely already bundled.

### 5.2 Node Types

| Type | Visual Shape | Data Source |
|------|-------------|-------------|
| Claim | Circle | `ScoutKnowledgeNode` |
| Source | Square | `SourceEntry` (shown only when connected) |
| Topic | Diamond | `InterestNode` (research focus areas) |
| Synthesis | Hexagon | Digest `synthesizedInsight` (V2) |

### 5.3 Edge Types

| Type | Visual | Inference Rule |
|------|--------|----------------|
| `supports` | Solid green arrow | Source cited in node's `evidence[]` |
| `contradicts` | Dashed red line | Node status='contested' + shared topic |
| `relates-to` | Dotted gray line | Shared keywords in `claim` (TF-IDF similarity > 0.6) |
| `derived-from` | Solid blue arrow | Deep research parent → child relationship |

### 5.4 Required Interactions

1. **Zoom:** Mouse wheel / pinch gesture (`d3-zoom`)
2. **Pan:** Click + drag on background
3. **Select:** Click node → highlight + show detail panel
4. **Expand:** Double-click → show connected nodes only (focus mode)
5. **Filter:** Sidebar checkboxes for status, confidence threshold slider
6. **Search:** Text input highlights matching nodes

### 5.5 Layout Algorithm

```typescript
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(edges).distance(100))
  .force('charge', d3.forceManyBody().strength(-300))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collision', d3.forceCollide().radius(30));
```

### 5.6 Performance Bounds

| Metric | Target | Mitigation Strategy |
|--------|--------|---------------------|
| Max nodes rendered | 250 | Cluster or paginate beyond this |
| Target FPS | 60fps | `requestAnimationFrame`, canvas fallback for >150 nodes |
| Initial layout time | < 2s | Pre-compute positions, cache in sessionStorage |
| Memory footprint | < 50MB | SVG preferred over canvas for accessibility |

---

## Section 6: Scheduling Architecture in a SPA

### 6.1 Job Data Model

**Path:** `scout_research_jobs/{userId}/jobs/{jobId}`

```typescript
interface ResearchJob {
  id: string;
  userId: string;

  // Job definition
  type: 'deep_research' | 'topic_monitor' | 'digest_generation';
  query?: string;                    // For research types
  parameters: Record<string, any>;

  // Scheduling
  scheduleType: 'once' | 'recurring';
  scheduledFor?: string;             // ISO 8601, for one-time jobs
  cronExpression?: string;           // For recurring (e.g., "0 8 * * 1")
  timezone: string;

  // Lifecycle
  status: 'created' | 'queued' | 'processing' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;

  // Results
  resultPath?: string;               // Firestore path to result document
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };

  // Metadata
  executionCount: number;
  lastExecutedAt?: string;
  nextExecutionAt?: string;
  expiresAt: string;                 // Auto-delete date (createdAt + 30 days)
}
```

### 6.2 Job Lifecycle

```
created → queued → processing → completed
                              → failed (retryable) → queued (up to 3 retries)
                              → failed (terminal after 3 retries)
         → paused → queued (on user resume)
```

### 6.3 Cloud Function: Job Processor

```typescript
// functions/src/scheduled/jobProcessor.ts
export const processResearchJobs = functions.pubsub
  .schedule('*/15 * * * *')  // Every 15 minutes
  .timeZone('UTC')
  .onRun(async (context) => {
    const now = new Date();

    // Find due jobs
    const dueJobs = await db
      .collectionGroup('jobs')
      .where('status', '==', 'queued')
      .where('nextExecutionAt', '<=', now.toISOString())
      .limit(20)
      .get();

    const results = await Promise.allSettled(
      dueJobs.docs.map(doc => executeJob(doc))
    );

    console.log(`Processed ${results.length} jobs`);
  });

async function executeJob(doc: QueryDocumentSnapshot): Promise<void> {
  const job = doc.data() as ResearchJob;

  // Atomic status transition (optimistic lock)
  await doc.ref.update({
    status: 'processing',
    startedAt: new Date().toISOString()
  });

  try {
    let resultPath: string;

    switch (job.type) {
      case 'deep_research':
        resultPath = await executeDeepResearch(job);
        break;
      case 'topic_monitor':
        resultPath = await executeTopicMonitor(job);
        break;
      case 'digest_generation':
        resultPath = await executeDigestGeneration(job);
        break;
    }

    const updates: Partial<ResearchJob> = {
      status: 'completed',
      completedAt: new Date().toISOString(),
      resultPath,
      executionCount: job.executionCount + 1,
      lastExecutedAt: new Date().toISOString()
    };

    // Re-queue if recurring
    if (job.scheduleType === 'recurring') {
      updates.status = 'queued';
      updates.nextExecutionAt = calculateNextRun(job.cronExpression!, job.timezone);
    }

    await doc.ref.update(updates);

  } catch (error) {
    const isRetryable = job.executionCount < 3 && error.code !== 'RATE_LIMITED';
    await doc.ref.update({
      status: isRetryable ? 'queued' : 'failed',
      executionCount: job.executionCount + 1,
      error: {
        code: error.code || 'UNKNOWN',
        message: error.message,
        retryable: isRetryable
      }
    });
  }
}
```

### 6.4 Client Job Creation (ActionHub)

```typescript
// New ActionHub action: 'scout:schedule_research'
{
  action: 'scout:schedule_research',
  params: {
    query: string;
    scheduleType: 'once' | 'recurring';
    scheduledFor?: string;       // ISO datetime for one-time jobs
    frequency?: 'daily' | 'weekly';
    dayOfWeek?: number;          // 0-6 for weekly scheduling
    hourLocal: number;           // 0-23 in user's local timezone
  }
}
// ActionHub handler converts hourLocal → hourUtc, writes to Firestore
```

### 6.5 Real-Time Listener for Job Status

```typescript
function useJobStatus(jobId: string) {
  const [job, setJob] = useState<ResearchJob | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'scout_research_jobs', userId, 'jobs', jobId),
      (snapshot) => {
        if (snapshot.exists()) {
          setJob(snapshot.data() as ResearchJob);
        }
      }
    );
    return unsubscribe;
  }, [jobId, userId]);

  return job;
}
```

### 6.6 Digest Schedule UX Flow

User sets "Every Monday at 8am":
1. UI presents: Frequency dropdown (Daily/Weekly) + Day picker (if weekly) + Time picker (local time)
2. Client detects user timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
3. Time converted to UTC for storage in `DigestSchedule.hourUtc`
4. On save: Write/update document at `scout_knowledge/{userId}/digest_schedule`
5. Cloud Function reads `hourUtc` and `dayOfWeek` each hour to determine which users are due

### 6.7 Guardrails

| Guardrail | Limit | Enforcement Point |
|-----------|-------|-------------------|
| Max active jobs per user | 10 | Validate count before creation in ActionHub |
| Max job age | 30 days | `expiresAt` field; weekly cleanup function |
| Rate limit per user | 50 executions/day | Counter in `global_souls/{userId}` |
| Recurring job minimum interval | 1 hour | Cron expression validation on create |
| Failed job retries | 3 | `executionCount` check before re-queue |

---

## Section 7: Prioritised User Story Backlog

| ID | Title | User Story | Complexity | Dependencies | Tier |
|----|-------|------------|------------|--------------|------|
| SCOUT-001 | Source Library Data Model | As a developer, I want the SourceEntry schema and Firestore collection defined, so that all source-related features have a stable foundation. | S | — | MVP |
| SCOUT-002 | Auto-capture Sources | As a user, I want sources from search results automatically added to my library, so that I have a complete bibliography without manual entry. | M | SCOUT-001 | MVP |
| SCOUT-003 | Source Library List View | As a user, I want to view all my sources in a sortable, filterable list, so that I can find and manage my research bibliography. | M | SCOUT-001 | MVP |
| SCOUT-004 | Source Read Status Toggle | As a user, I want to mark sources as read/unread, so that I can track my reading progress. | S | SCOUT-003 | MVP |
| SCOUT-005 | Source Starring | As a user, I want to star important sources, so that I can quickly find my most valuable references. | S | SCOUT-003 | MVP |
| SCOUT-006 | Deep Research State Machine | As a developer, I want the deep research state machine implemented in `useDeepResearch`, so that multi-step research has reliable, testable state management. | M | — | MVP |
| SCOUT-007 | Sub-question Generation | As a user, I want my research query automatically decomposed into sub-questions, so that I get comprehensive coverage of complex topics. | M | SCOUT-006 | MVP |
| SCOUT-008 | Sub-question Review UI | As a user, I want to approve, edit, or reject generated sub-questions before search begins, so that I control the research direction. | S | SCOUT-007 | MVP |
| SCOUT-009 | Parallel Search Execution | As a user, I want sub-questions searched in parallel (max 3 concurrent), so that deep research completes faster than sequential searches. | M | SCOUT-008 | MVP |
| SCOUT-010 | Deep Research Synthesis | As a user, I want search findings automatically synthesized into a coherent summary, so that I get actionable insights without manual compilation. | M | SCOUT-009 | MVP |
| SCOUT-011 | Deep Research Progress UI | As a user, I want to see real-time progress of my deep research session, so that I know what's happening and can estimate completion time. | S | SCOUT-009 | MVP |
| SCOUT-012 | Digest Data Model | As a developer, I want the ScoutDigest TypeScript schema and Firestore path defined, so that digest generation and storage are consistent. | S | — | MVP |
| SCOUT-013 | On-demand Digest Generation | As a user, I want to generate a research digest with one click, so that I can review my accumulated knowledge at any time. | M | SCOUT-012 | MVP |
| SCOUT-014 | Digest Viewer Component | As a user, I want to view my digest in a structured, readable format within the app, so that I can consume insights without exporting. | M | SCOUT-013 | MVP |
| SCOUT-015 | Markdown Export | As a user, I want to export research nodes and digests as Markdown with YAML frontmatter, so that I can use findings in external documents. | S | SCOUT-014 | MVP |
| SCOUT-016 | Knowledge Graph Basic Render | As a user, I want to see my knowledge nodes as an interactive D3 force-directed graph, so that I can understand relationships between claims at a glance. | L | — | V2 |
| SCOUT-017 | Graph Zoom/Pan Controls | As a user, I want smooth zoom and pan on the knowledge graph, so that I can navigate collections of 50+ nodes without losing orientation. | S | SCOUT-016 | V2 |
| SCOUT-018 | Graph Node Click Details | As a user, I want to click a graph node to open a side panel with full claim details and evidence, so that I can drill into specific claims from the visual view. | S | SCOUT-016 | V2 |
| SCOUT-019 | Graph Status Filtering | As a user, I want to filter graph nodes by verification status or confidence threshold, so that I can focus on verified claims or investigate contested ones. | M | SCOUT-016 | V2 |
| SCOUT-020 | Job Scheduler Data Model | As a developer, I want the ResearchJob schema and Firestore collection defined, so that all scheduling features have a consistent foundation. | S | — | V2 |
| SCOUT-021 | Schedule Research UI | As a user, I want to schedule a research query for future execution, so that I can set up research runs without being present. | M | SCOUT-020 | V2 |
| SCOUT-022 | Job Processor Cloud Function | As a developer, I want a scheduled Cloud Function (every 15 min) that processes due jobs, so that scheduled research reliably executes without a persistent server. | L | SCOUT-020 | V2 |
| SCOUT-023 | Job Status Real-time Updates | As a user, I want live status updates for my scheduled jobs via Firestore listener, so that I know when research is running, complete, or failed. | M | SCOUT-022 | V2 |
| SCOUT-024 | Digest Scheduling | As a user, I want to configure recurring digest delivery (e.g., every Monday at 8am in my timezone), so that summaries arrive automatically without manual triggering. | M | SCOUT-022, SCOUT-013 | V2 |
| SCOUT-025 | PDF Export via Print | As a user, I want to export digests and research reports as PDF using the browser print dialog, so that I can share formatted documents without third-party services. | S | SCOUT-014 | V2 |
| SCOUT-026 | Source Archive/Restore | As a user, I want to archive sources I no longer need active, so that my library stays focused while historical sources remain accessible. | S | SCOUT-003 | V2 |
| SCOUT-027 | BibTeX Export | As a researcher, I want to export my source library in BibTeX format, so that I can import references directly into LaTeX or Zotero. | M | SCOUT-003 | V2 |
| SCOUT-028 | Proactive Interest Monitoring | As a user, I want Scout to automatically search my top-momentum interests weekly and surface new findings, so that I stay informed passively. | L | SCOUT-022 | V3 |
| SCOUT-029 | Proactive Intelligence Badge | As a user, I want a "New intelligence" badge in the Scout UI when proactive items exist, so that I know to check for Scout-initiated findings. | M | SCOUT-028 | V3 |
| SCOUT-030 | Interest Muting | As a user, I want to mute specific interests from proactive monitoring, so that I control which topics Scout researches autonomously. | S | SCOUT-028 | V3 |
| SCOUT-031 | Broken Link Detection | As a user, I want sources with broken links visually flagged in my library, so that I can remove stale references. | M | SCOUT-003 | V3 |
| SCOUT-032 | Email Digest Delivery | As a user, I want scheduled digests emailed to my inbox via SendGrid, so that I receive insights without needing to open the app. | M | SCOUT-024 | V3 |

---

## Section 8: Architecture Decisions

### 8.1 New Firestore Collections / Sub-Collections

| Collection Path | Schema | Security Rules Note |
|-----------------|--------|---------------------|
| `scout_sources/{userId}/sources/{sourceId}` | `SourceEntry` | Owner read/write only (`request.auth.uid == userId`) |
| `scout_digests/{userId}/digests/{digestId}` | `ScoutDigest` | Owner read/write only |
| `scout_research_jobs/{userId}/jobs/{jobId}` | `ResearchJob` | Owner read; Cloud Function service account write |
| `scout_knowledge/{userId}/digest_schedule` | `DigestSchedule` (single doc) | Owner read/write only |

> **Note:** All new collections require Firestore composite index configuration. See Section 4.4 for required indexes on `scout_sources`.

### 8.2 New / Modified Cloud Functions

| Function | Trigger | Input | Output | Est. Exec Time |
|----------|---------|-------|--------|----------------|
| `processResearchJobs` | Scheduled (`*/15 * * * *`) | None (polls Firestore) | Writes to job docs + result paths | 30–120s |
| `generateScheduledDigests` | Scheduled (`0 * * * *`) | None (polls Firestore) | Writes `ScoutDigest` to `scout_digests` | 15–45s |
| `cleanupExpiredJobs` | Scheduled (`0 0 * * 0`) | None | Deletes jobs where `expiresAt < now` | 5–10s |
| `validateSourceLinks` *(V3)* | Scheduled (`0 3 * * *`) | None | Updates `isValid` on `SourceEntry` docs | 60–180s |
| `scoutWebSearch` *(modified)* | HTTP POST | `{ queries: string[], depth?: number }` | `SearchResult[][]` | 5–15s |

> **`scoutWebSearch` modification:** Accept `queries` array (batch up to 3) instead of single `query` string to reduce cold starts during deep research parallel execution.

### 8.3 New NSV Fields (global_souls)

| Path | Type | Semantics | Update Trigger |
|------|------|-----------|----------------|
| `cognitive.researchDepth` | `number (0–1)` | Ratio of deep research sessions to total sessions | On deep research `COMPLETE` |
| `cognitive.sourceLibrarySize` | `number` | Total non-archived sources in library | On `scout:add_source` / archive |
| `activity.lastDigestAt` | `string` (ISO) | Timestamp of most recent digest generation | On `DIGEST_GENERATED` event |
| `activity.scheduledJobCount` | `number` | Count of active (non-expired, non-failed) scheduled jobs | On job create/delete/expire |

### 8.4 New Spine Events

| Event Type | Payload Type | Emitter | Listeners |
|------------|-------------|---------|-----------|
| `DEEP_RESEARCH_STARTED` | `{ sessionId: string; query: string; subQuestionCount: number }` | `useDeepResearch` | Telemetry, ScoutDashboard |
| `DEEP_RESEARCH_COMPLETED` | `{ sessionId: string; nodeId: string; synthesisLength: number }` | `useDeepResearch` | Telemetry, KnowledgeGraph, NSV Updater |
| `DIGEST_GENERATED` | `{ digestId: string; generationType: 'manual' \| 'scheduled'; claimCount: number }` | `DigestViewer` | Dashboard, NSV Updater |
| `SOURCE_ADDED` | `{ sourceId: string; url: string; discoveredVia: SourceEntry['discoveredVia'] }` | Source service | SourceLibrary, NSV Updater |
| `JOB_STATUS_CHANGED` | `{ jobId: string; oldStatus: ResearchJob['status']; newStatus: ResearchJob['status'] }` | `useJobStatus` listener | JobList, Dashboard |

### 8.5 New ActionHub Actions

| Action | Params | Effect |
|--------|--------|--------|
| `scout:start_deep_research` | `{ query: string; maxSubQuestions?: number }` | Triggers `useDeepResearch` state machine; emits `DEEP_RESEARCH_STARTED` |
| `scout:schedule_research` | `{ query: string; scheduleType; scheduledFor?; frequency?; dayOfWeek?; hourLocal: number }` | Creates `ResearchJob` document in Firestore |
| `scout:cancel_job` | `{ jobId: string }` | Sets job `status = 'paused'` in Firestore |
| `scout:generate_digest` | `{ period?: 'day' \| 'week' \| 'month' }` | Triggers on-demand digest generation client-side |
| `scout:add_source` | `{ url: string; title?: string; notes?: string }` | Deduplicates by `normalizedUrl`, writes to `scout_sources` |
| `scout:update_source` | `{ sourceId: string; updates: Partial<SourceEntry> }` | Partial update to source document |
| `scout:export_markdown` | `{ type: 'node' \| 'digest' \| 'sources'; id?: string }` | Renders and triggers browser download of `.md` file |
| `scout:set_digest_schedule` | `{ enabled: boolean; frequency; dayOfWeek?; hourLocal: number; timezone: string }` | Writes `DigestSchedule` to Firestore |

### 8.6 New React Components

| Component | Key Props | Responsibility |
|-----------|-----------|----------------|
| `DeepResearchPanel` | `initialQuery?: string; onComplete: (nodeId: string) => void` | Orchestrates the full deep research flow; wraps state machine |
| `SubQuestionEditor` | `questions: SubQuestion[]; onChange; onConfirm` | Editable, reorderable list of generated sub-questions |
| `ResearchProgress` | `queue: SearchQueue; onCancel` | Real-time per-sub-question progress visualization |
| `SourceLibrary` | `initialFilters?: SourceFilters` | Main source library container with view toggle |
| `SourceCard` | `source: SourceEntry; onAction: (action, sourceId) => void` | Individual source display card |
| `SourceFiltersPanel` | `value: SourceFilters; onChange` | Filter controls sidebar for source library |
| `DigestViewer` | `digest: ScoutDigest` | Sectioned digest renderer |
| `DigestHistory` | `onSelect: (digestId: string) => void` | Chronological list of past digests |
| `DigestScheduleSettings` | `schedule: DigestSchedule; onSave` | Frequency/time picker for digest scheduling |
| `KnowledgeGraph` | `nodes: ScoutKnowledgeNode[]; width: number; height: number` | D3 force-directed graph canvas |
| `GraphControls` | `onFilter: (f: GraphFilter) => void; onZoomReset: () => void` | Zoom, pan, filter controls overlay |
| `JobScheduler` | `onSchedule: (job: Partial<ResearchJob>) => void` | Research job creation form |
| `JobList` | `jobs: ResearchJob[]; onAction: (action, jobId) => void` | Tabular list of scheduled/running/completed jobs |
| `ExportDialog` | `type: 'node' \| 'digest' \| 'sources'; id?: string; onClose` | Export format selection modal |

### 8.7 New Hooks

| Hook | Params | Return Value | Purpose |
|------|--------|--------------|---------|
| `useDeepResearch` | `initialQuery?: string` | `{ state, subQuestions, start, cancel, results, isPending }` | Deep research state machine lifecycle |
| `useSources` | `filters?: SourceFilters` | `{ sources, loading, addSource, updateSource, archiveSource }` | Firestore CRUD for source library |
| `useDigests` | `limit?: number` | `{ digests, generate, latestDigest, loading }` | Digest fetching and on-demand generation |
| `useDigestSchedule` | — | `{ schedule, updateSchedule, loading }` | Read/write digest schedule preference |
| `useResearchJobs` | — | `{ jobs, createJob, cancelJob, loading }` | Job management with real-time updates |
| `useKnowledgeGraph` | `nodes: ScoutKnowledgeNode[]` | `{ graphData, simulation, resetLayout }` | Transforms flat node array to D3-compatible graph data |
| `useJobStatus` | `jobId: string` | `ResearchJob \| null` | Single-job real-time Firestore subscription |

---

## Section 9: Out of Scope (Explicit)

| Item | Rationale |
|------|-----------|
| **Real-time collaboration / shared workspaces** | Requires WebSocket infrastructure and a permissions model not in the current architecture; deferred to V4+ |
| **Push notifications (FCM)** | Requires separate FCM setup and service worker; a distinct initiative from this upgrade |
| **Mobile native app** | This cycle targets the web SPA only; mobile is a separate product track |
| **Third-party integrations (Notion, Obsidian, Roam)** | Markdown export provides sufficient interop; bi-directional sync is V4+ |
| **AI model selection UI** | Scout uses the existing shared LLM infrastructure; model switching is a platform-level concern |
| **Offline-first / PWA mode** | Firestore offline persistence provides basic resilience; explicit offline UX design is deferred |
| **Natural-language scheduling ("remind me Friday")** | Parsing natural language cron expressions requires additional NLP infrastructure; V4+ |
| **Source content archiving (Wayback Machine integration)** | Legal complexity around content reproduction and storage costs; links only in this cycle |
| **Automated fact-checking against external databases** | Requires licensed API integrations (Snopes, PolitiFact, etc.); separate initiative |
| **Browser extension for passive source capture** | A separate product with its own extension infrastructure; out of scope |
| **Custom knowledge graph layouts** | Force-directed covers the MVP need; user-defined spatial layouts (hierarchical, radial) are V3+ |
| **Voice input for research queries** | Accessibility improvement requiring Web Speech API integration; separate accessibility sprint |

---

## Appendix A: Migration Notes

### Existing Data Compatibility
- `ScoutProfile.knowledgeNodes` remains unchanged; graph visualisation reads the existing array directly
- `ScoutProfile.newsBriefs` extended with optional `isProactive?: boolean` flag — fully backward compatible
- `ScoutKnowledgeNode` gains optional `parentJobId?: string` field for deep research lineage — non-breaking
- No destructive changes to any existing Firestore documents in this upgrade

### Phased Rollout Strategy

| Phase | Tier | Target Stories | Engineering Estimate |
|-------|------|----------------|----------------------|
| Phase 1 | MVP | SCOUT-001 through SCOUT-015 | 6–8 weeks |
| Phase 2 | V2 | SCOUT-016 through SCOUT-027 | 6–8 weeks |
| Phase 3 | V3 | SCOUT-028 through SCOUT-032 | 3–4 weeks |

---

*End of Document — Scout Module v2.0 PRD*
