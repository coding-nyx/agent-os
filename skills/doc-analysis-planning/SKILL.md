---
name: doc-analysis-planning
description: Plan AGNES document analysis and notebook features, including PDF/image ingestion, diagnosis tab flows, multi-chat architecture, and module specialization. Use when a user asks to conceptualize, scope, or structure doc-analysis initiatives; to translate abstract ideas into UI/UX, PM tasks, and module contracts; or to produce phased plans with tradeoffs and guardrails.
---

# Doc Analysis Planning

## Overview

Translate doc-analysis ideas into a concrete plan for AGNES: UI/UX structure, product scope, module contracts, and phased implementation paths that respect module boundaries and the llm-engine boundary.

## Workflow

1. Restate the core concept in one sentence.
2. Enumerate required capabilities:
   - Document ingestion (PDF/image, OCR/vision, citations)
   - Analysis modes (summary, diagnosis, notebook, extraction)
   - Context policy (doc-only, consented base context)
   - Multi-chat sessioning
3. Produce a UI/UX plan:
   - Layout and navigation (tabs, panels, chat list)
   - Consent UX (Yes/No buttons in chat)
   - Accessibility checklist
4. Produce a PM plan:
   - User stories and acceptance criteria
   - API contracts for ingest/analysis
   - Dependencies and risks
5. Produce a Module Architect plan:
   - Generic Orchestrator I/O contract (JSON)
   - Plan A/B/C with tradeoffs
   - Specialize for requested modules (Titan, Ledger, Scout, Atlas)
6. End with 2-3 concrete next-step options.

## Guardrails

- Keep module logic in `src/modules/<module>/`.
- Use shared orchestration layers (`Spine`, `NexusHandoffService`, `GlobalProjectionService`) for cross-module coordination.
- Treat `src/llm-engine/*` as a runtime boundary unless explicitly asked to change it.
- Respect vault and encryption flows; never bypass E2EE.

## Output Checklist

- Generic concept summary
- UI/UX architecture + component inventory
- PM scope with acceptance criteria
- Orchestrator JSON input/output contract
- Module specialization for Titan, Ledger, Scout, Atlas
- Phased plans with tradeoffs and risks
