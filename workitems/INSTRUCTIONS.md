# Workitems Instructions & Prioritization Rules

These instructions govern how tasks in the backlog are triaged and how sprints are formulated within the Nexus (AGNES) project.

## 1. Prioritization Hierarchy
When planning sprints or selecting the next issue to work on, the following priority order **MUST** be strictly observed:

1. **Highest Priority: Structure & Architecture**
   - *Examples:* Data layer decoupling, Spine event bus contracts, interface abstractions, database schema shifts, module dependency decoupling.
   - *Reasoning:* A solid foundation prevents technical debt from accumulating in UI or feature logic. Structural integrity must be achieved before building features on top of it.
2. **High Priority: Security & Privacy**
   - *Examples:* E2EE Vault gating rules, episodic encryption hooks, data scoping, authentication flow fixes.
3. **Medium Priority: LLM Resilience & UX Standardization**
   - *Examples:* Pending completion recovery, Ghost UI, systemic EmptyState and formatting standardization, scoped conversational contexts.
4. **Low Priority: New Features & Visual Polish**
   - *Examples:* New AI chat abilities, detailed dashboard charts, animations, icebox features.

## 2. Sprint Planning Rules
- No new UI/UX features should be scheduled if structural/architectural blockers exist in the backlog.
- Design spikes and architectural decision records (ADRs) must be completed before the related implementation is brought into a sprint.
- Always review the `BACKLOG.md` under "Core Platform & Spine" and "Vision Alignment & Architectural Integrity" before looking at module-specific tasks.