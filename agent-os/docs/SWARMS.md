# Swarm Coordination Architecture

ARA Agent OS provides profile-scoped swarm coordination for large, complex, and multi-stage tasks. Swarms execute specialized teams of worker bots working in tandem, rather than routing every query through multi-agent overhead.

## Core Concepts

### 1. Profile Isolation & Control
* **Toggleable per profile**: Swarms are configured independently on each agent profile. Enabling swarms on Ara does not enable them on Ledger or Scout.
* **Triggering Policies**:
  * **Intelligent & Explicit**: The profile evaluates task complexity. Everyday, single-step questions are handled directly by the agent. For large, multi-faceted tasks (deep literature research, multi-file code architecture and testing, or strategic multi-variable analysis)—or when explicitly invoked by the user—the agent deploys a swarm.
  * **Explicit Only**: The agent never spawns a swarm autonomously; swarms are launched only when the user explicitly requests one.
* **Identity Integration**:
  * When swarms are enabled, the agent's `SOUL.md` is updated with a managed capability block (`<!-- ara:agent-swarms:start --> ... <!-- ara:agent-swarms:end -->`).
  * Disabling swarms cleanly removes the capability block while preserving user-authored identity edits.

### 2. Built-in Swarm Presets

| Preset | Specialized Worker Roles | Typical Use Case |
| --- | --- | --- |
| **Research Swarm** (`research`) | • **Lead Researcher**: Scopes questions into sub-hypotheses.<br>• **Source & Evidence Analyst**: Gathers empirical evidence and citations.<br>• **Fact Checker & Synthesizer**: Audits claims for contradictions and produces synthesis. | In-depth domain investigations, comparative literature reviews, multi-source fact checking. |
| **Coding Swarm** (`coding`) | • **System Architect**: Designs contracts, data structures, and file boundaries.<br>• **Implementation Engineer**: Writes idiomatic, error-resilient code.<br>• **Reviewer & QA Engineer**: Checks edge cases, security, regressions, and writes tests. | Architectural refactoring, multi-component feature implementation, test-suite expansion. |
| **Analysis Swarm** (`analysis`) | • **Data & Context Analyst**: Maps key variables and baseline context.<br>• **Critical Evaluator**: Stress-tests failure modes, risks, and trade-offs.<br>• **Strategic Advisor**: Formulates prioritized action plans and roadmaps. | Strategic business analysis, risk evaluation, decision matrices. |
| **Custom Swarm** (`custom`) | • Dynamic worker roles defined per task or workflow. | Domain-specific or arbitrary multi-bot pipelines. |

### 3. Execution in Tandem

When a swarm is spawned:
1. **Queued State**: A `swarm_run` entity is created in PostgreSQL with unique ID and idempotency key (`operation_id`).
2. **Parallel Subtasks**: Worker bots execute subtasks in tandem (`asyncio.gather`), each focusing on their designated objective with role-tailored prompting.
3. **Real-time Event Emission**: Emits `swarm.started`, `swarm.worker_started`, `swarm.worker_completed`, and `swarm.completed` over SSE (`/api/v1/events`).
4. **Unified Synthesis**: The coordinator aggregates all worker findings into an authoritative, structured report with specialist attribution.

### 4. Interfaces

* **Dashboard Surface**:
  * In each Agent profile, navigate to the **Swarms** tab.
  * Toggle coordination On/Off.
  * Choose Triggering Policy (`Intelligent` vs `Explicit`).
  * Enable or disable individual presets.
  * Deploy a swarm with a single click.
  * Inspect live worker outputs and final synthesized reports.
* **Native MCP Tools**:
  * `ara_list_swarms`: Query enabled presets and trigger policies.
  * `ara_spawn_swarm`: Launch a coordinated worker swarm for large tasks.
  * `ara_get_swarm`: Poll worker logs and consolidated outcomes.
* **REST API**:
  * `GET /api/v1/swarms/presets`
  * `GET /api/v1/profiles/{id}/swarms`
  * `PUT /api/v1/profiles/{id}/swarms`
  * `POST /api/v1/profiles/{id}/swarms/spawn`
  * `GET /api/v1/swarms/{swarm_id}`
