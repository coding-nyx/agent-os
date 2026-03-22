# Scout — Intellectual Cartographer

> **ID**: `scout` | **Theme**: Lime | **Core**: No (Extended) | **Soul Priority**: 5 (Isolated) | **Security**: locked

## Purpose
Scout is a search and research tool — explicitly isolated from the Global Soul. It helps the user research topics, synthesize information, and build knowledge graphs. Scout maintains the "Research Workbench" — a canvas for mapping the known, unknown, and rising signals of human knowledge. Scout does not contribute to or modify the Global Soul; it is a utility, not a soul contributor.

## Agent Personality
- **Archetype**: Intellectual Cartographer & Scholarly Partner
- **Tone**: Precise, scholarly, yet enthusiastically curious. Uses phrases like "Our exploration," "The evidence suggests," "A curious cross-reference."
- **Special**: Epistemic framework with confidence scoring:
  - **Speculative (0.0–0.3)**: Anecdotal or unverified
  - **Supported (0.3–0.7)**: Sourced evidence exists but requires more depth
  - **Authoritative (0.7–1.0)**: Peer-reviewed or multiple high-quality confirmations
- **Strict Topic Lock**: When a research session is active, Scout maintains singular focus on that topic and will not engage in off-topic chat.
- **Internal Monologue**: Uses `<thought>` tags for intent analysis, topic focus, historical context, and strategy planning.

## NSV Ownership
- **Writes**: `cognitive.researchLoad`, `cognitive.interestDiversity`
- **Reads**: `biological.cnsFatigue`, `cognitive.(energyBudget, focusScore)`, `emotional.moodTrend`
- **Soul Impact**: None — Scout is a tool

## File Structure
```
src/modules/scout/
├── ScoutPage.tsx                          # Main entry point
├── types.ts                               # Type definitions (ResearchSession, ScoutKnowledgeNode, SourceEntry, ScoutDigest)
├── personas.ts                            # SCOUT_PERSONA system prompt
├── scout-shell-layout.ts                  # Responsive shell state management
├── scout-shell-layout.test.ts
├── components/
│   ├── ScoutDashboard.tsx                 # Overview dashboard
│   ├── ScoutSessionList.tsx               # Research session list
│   ├── ActiveResearchWorkspace.tsx        # Active session workbench
│   ├── ScoutResearchArtifactsPanel.tsx    # Side panel for artifacts
│   ├── ScoutEvidenceSources.tsx           # Evidence/sources display
│   ├── ScoutDocumentCard.tsx              # Document cards
│   ├── ScoutUploadZone.tsx                # Document upload
│   ├── NewSessionDialog.tsx               # New session creation
│   ├── ExportDialog.tsx                   # Export functionality
│   ├── EvidenceView.tsx                   # Evidence viewer
│   ├── MobileBottomNav.tsx                # Mobile navigation
│   ├── SignalBubbleCanvas.tsx             # Visualization canvas
│   ├── deep-research/
│   │   └── DeepResearchPanel.tsx          # Multi-step deep research UI
│   ├── digest/
│   │   └── DigestViewer.tsx               # Newsletter/digest viewer
│   ├── graph/
│   │   └── KnowledgeGraph.tsx             # Knowledge graph visualization
│   └── sources/
│       └── SourceLibraryPane.tsx          # Source library management
├── diagnosis/
│   ├── scout-diagnosis-spec.ts            # Diagnosis specialization (PDF/image analysis)
│   ├── scout-diagnosis-prompt.ts          # Diagnosis prompt builder
│   └── scout-diagnosis-extractor.ts       # Data extraction logic
├── hooks/
│   ├── useDeepResearch.ts                 # Deep research state management
│   ├── useDigests.ts                      # Digest generation hooks
│   ├── useKnowledgeNodes.ts               # Knowledge node CRUD
│   ├── useSessions.ts                     # Research session management
│   └── useSources.ts                      # Source library hooks
├── onboarding/
│   └── ScoutOnboarding.tsx                # Guided intake (research focus, evidence quality, output shape)
└── services/
    ├── actions.ts                         # ActionHub registrations
    ├── scout-digest-service.ts            # Newsletter/digest generation
    ├── scout-document-policy.ts           # Document handling policy
    ├── scout-document-service.ts          # Document processing
    ├── scout-export-service.ts            # Export to various formats
    ├── scout-knowledge-service.ts         # Knowledge node persistence
    ├── scout-news-service.ts              # News/trend tracking
    ├── scout-projection-listener.ts       # Spine event projection
    ├── scout-query-service.ts             # RAG-based library queries
    ├── scout-session-service.ts           # Session CRUD
    ├── scout-sources-service.ts           # Source library persistence
    └── scout-web-search-service.ts        # Web search integration
```

## Key Actions
- `list_sessions` — retrieve recent research sessions
- `resume_session` — switch context to existing session by ID or topic
- `start_session` — create a new persistent research session
- `query_knowledge` — RAG-based semantic search of knowledge base
- `web_search` / `search_web` — execute web search via WebCrawlerService
- `start_deep_research` — initiate multi-step deep research protocol
- `add_sources` — save URLs to source library
- `synthesize_knowledge` — create a knowledge node from findings
- `generate_digest` — trigger newsletter/digest generation
- `handoff_to_atlas` — share finding with Atlas for actionable scheduling

## Spine Events
- **Emits**:
  - `SESSION_STARTED` — when a research session begins/resumes
  - `SOURCE_ADDED` — when sources are added to library
  - `KNOWLEDGE_SYNTHESIZED` — when a new knowledge node is created
  - `RESEARCH_SEARCHING` — during active web search
  - `RESEARCH_RESULTS` — when search results arrive
  - `DEEP_RESEARCH_STARTED` — when deep research protocol initiates
  - `HABIT_SUGGESTED` — when handing off to Atlas
- **Listens**: Reads NSV for cognitive context (fatigue, focus, mood)

## Cross-Module Links
- Reads cognitive/emotional NSV for capacity awareness (avoids deep research when user is fatigued)
- **Nexus** can delegate research queries to Scout via `web_search` action
- **Atlas** receives `HABIT_SUGGESTED` events via `handoff_to_atlas` to convert research findings into actionable tasks/habits
- **Forge** can use Scout's `web_search` for technical research

## Data Shape
- **ResearchSession**: `{ id, userId, topic, status, subQuestions, reasoningHistory, resultNodeId }`
  - Status: `idle | decomposing | awaiting_review | searching | synthesizing | complete | error | cancelled`
- **ScoutKnowledgeNode**: `{ id, claim, confidence, evidence[], highlights[], embedding[], status, parentSessionId }`
  - Status: `pending | verified | contested`
- **SourceEntry**: `{ id, url, normalizedUrl, title, domain, snippet, discoveredVia, readStatus, starred, archived, tags[], citingNodeIds[], highlights[] }`
  - DiscoveredVia: `search | manual | deep_research`
  - ReadStatus: `unread | reading | read`
- **ScoutDigest**: `{ id, generatedAt, summary, topClaims[], trendingInterests[], synthesizedContent }`
  - TrendingInterests track momentum: `rising | steady | cooling`

## Diagnosis Specialization
Scout provides a read-only document analysis mode for research papers, reports, and articles:
- **Supported types**: PDF, PNG, JPEG, WebP, TXT, Markdown
- **Allowed actions**: `extract_finding`, `extract_citation`, `summarize_section`
- No data merge — purely analytical

## Implementation Notes
- ✅ Onboarding with guided intake (research focus, evidence quality, output shape)
- ✅ Research sessions with topic-locked workbench
- ✅ Knowledge graph visualization with confidence scoring
- ✅ Source library with read status, starring, archiving, tagging
- ✅ Deep research protocol with sub-question decomposition
- ✅ Digest/newsletter generation (manual + scheduled)
- ✅ Diagnosis tool for PDF/image research analysis (read-only)
- ✅ RAG-based library queries via ScoutQueryService
- ✅ Export functionality
- ✅ Responsive shell layout (mobile/tablet/desktop)
