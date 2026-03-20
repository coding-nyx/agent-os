# WI-1.18 — Scout: Placeholder Cleanup

## Type
Module Audit / Data Integrity

## Module
`src/modules/scout/`

## Data Model Reference
- `ScoutProfile` — research sessions, knowledge nodes, sources, digests
- `GlobalSoul.crossFunctionalState.cognitive` — interestDiversity

## Key Audit Targets

### ScoutDashboard
- Research session count — from profile
- Knowledge node count — from `loadKnowledgeNodes`
- Source count — from profile sources
- Active research topics — from sessions

### SourceLibraryPane
- Sources must come from profile or service
- No hardcoded "Example Source" entries

### DigestViewer
- Digests must be generated from real research
- No hardcoded digest content

### ActiveResearchWorkspace
- Research artifacts from real sessions
- No demo research data

### DeepResearchPanel
- Results from actual deep research operations
- Progress indicators from real pipeline state

### SignalBubbleCanvas
- Bubbles should represent real knowledge nodes or be purely decorative
- If decorative: acceptable, but must not imply data connection

## Acceptance Criteria
- [ ] All research metrics from real data
- [ ] No hardcoded demo research content
- [ ] Sources, digests, and artifacts data-driven
- [ ] `npm run build` passes
