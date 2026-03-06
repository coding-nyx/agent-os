# Forge Evolution Plan (v3.0 - Unified Architecture)

## 1. Vision & Strategy
**Forge** is the unified technical engine of the AGNES ecosystem. It bridges the gap between high-level visual design (Web SPA) and low-level system execution (CLI/Terminal) through a single "Claude-like" agentic interface linked to the **Nexus Orchestrator**.

## 2. Core Components

### A. Forge CLI (`forge`)
- **Role:** Terminal-based agentic editing ("Claude Code" style).
- **Capabilities:** Multi-file refactoring, shell execution loop, and codebase indexing.
- **Authentication:** Firebase Auth (`forge login`) to sync with the AGNES cloud account.
- **Context:** Shares the same "Digital Brain" (Nexus memory) as the web application.

### B. Forge Studio (Web UI - `/forge`)
- **Role:** Visual collaboration and real-time artifact rendering.
- **The Canvas:** An isolated Iframe/WASM environment for live-rendering React components and data visualizations.
- **Interaction:** High-level architectural planning and "Pair Programming" mode with the Forge persona.

### C. Forge Daemon (`forged`)
- **Role:** The secure local bridge (formerly `nyx-link`).
- **Function:** A WebSocket server that executes shell commands and manages file I/O within the project root.
- **Security:** Strict directory jailing and a command allow-list to prevent unauthorized system access.

## 3. Communication Architecture (The Cloud Proxy)
To ensure the CLI and SPA share the same state and intelligence, both use a centralized **AGNES Cloud Gateway**:
1. **Request:** CLI/SPA sends a natural language prompt + local file context + Firebase ID Token.
2. **Orchestration:** Cloud Function verifies auth, fetches user memory from Firestore, and invokes the `ForgePersona` (S_REASONING tier).
3. **Planning:** Forge generates a multi-step plan (Read -> Edit -> Run -> Validate).
4. **Local Execution:**
   - **CLI:** Terminal prompts the user for approval `[Y/n]`.
   - **SPA:** User clicks "Apply" on the Forge Dashboard.
5. **Execution:** The approved command/edit is sent to the local `forged` daemon via WebSocket.
6. **Loop:** Output is streamed back to the Cloud Gateway to inform the next agentic step.

## 4. Security & Integrity Guardrails
- **Static Analysis:** All generated code is scanned for malicious patterns (e.g., shell escapes, unauthorized network calls) before execution.
- **Directory Jail:** The `forged` daemon is locked to the project root (detected via `.git` or `package.json`).
- **Auth Scoping:** Forge does not have access to E2EE modules (Therapy, Soma, Ledger) unless the user explicitly provides a "Sanitized Data Context."

## 5. Implementation Roadmap
1. **Phase 1 (The Bridge):** Rename `nyx-link` to `forged`, implement Firebase Auth verification, and harden the directory jail.
2. **Phase 2 (The Agent):** Scaffold the `forge` CLI in Node.js/TypeScript with basic `login` and `ask` commands.
3. **Phase 3 (The Studio):** Implement the "Forge Canvas" in the SPA with dynamic React rendering and real-time streaming from the Cloud Gateway.
4. **Phase 4 (The Loop):** Enable full agentic editing loops (Plan -> Approve -> Execute -> Verify) across both CLI and Web.
