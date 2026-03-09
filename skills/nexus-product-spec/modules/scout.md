# Scout — Knowledge Cartographer

> **ID**: `scout` | **Theme**: Lime | **Core**: No (Extended) | **Soul Priority**: 5 (Isolated) | **Security**: locked

## Purpose
Scout is a search and research tool — explicitly isolated from the Global Soul. It helps the user research topics, synthesize information, and build knowledge graphs. Scout does not contribute to or modify the Global Soul; it is a utility, not a soul contributor.

## Agent Personality
- **Archetype**: Knowledge cartographer
- **Tone**: Rigorous, source-aware, confidence-scored
- **Special**: Epistemology framework — every piece of information gets a confidence score (0.0–1.0). Source hierarchy: peer-reviewed > government > news > expert opinion > secondary. Tracks topic momentum: rising | steady | cooling | dormant.

## NSV Ownership
- **Writes**: `cognitive.researchLoad`, `cognitive.interestDiversity`
- **Reads**: `biological.cnsFatigue`, `cognitive.(energyBudget, focusScore)`, `emotional.moodTrend`
- **Soul Impact**: None — Scout is a tool

## Key Actions
- `search_web` — execute a web search
- `add_node` — add to knowledge graph
- `verify` — fact-check a claim
- `update_graph` — modify knowledge graph structure
- `commit_research` — finalize a research thread

## Spine Events
- **Emits**: (minimal — research-scoped events only)
- **Listens**: (minimal — reads NSV for cognitive context)

## Cross-Module Links
- Reads cognitive/emotional NSV for capacity awareness (avoids deep research when user is fatigued)
- Used by other modules as a research backend (e.g., Nexus can delegate research queries to Scout)

## Data Shape
Research threads (with relevance scores), knowledge nodes (with confidence ratings), source citations (with quality ratings), momentum signals per topic. Has a diagnosis flow for research portfolio analysis — stale topics, deeper investigation needs, completion status.

## Implementation Notes
- ✅ Onboarding, knowledge graph, research threads implemented
- ✅ Diagnosis tool for research portfolio analysis implemented
