# Agent Protocol

*   **Plan First:** Always formulate a detailed plan and explain it to the user.
    *   **In-Depth Analysis:** Before proposing a plan, analyze the project deeply. Consider the repercussions, specific code changes, and functionality shifts.
    *   **Dual Planning Strategy:** You must provide **two distinct plans** for the user to choose from:
        1.  **Plan A (Immediate/Localized):** A quick, direct fix or solution to the immediate problem. Focuses on speed and minimal disruption.
        2.  **Plan B (Grand Scheme/Integrated):** A comprehensive approach that integrates the solution into the broader product architecture. Focuses on long-term stability, scalability, and "doing it right" as part of the larger system.
*   **Get Approval:** Do not execute any changes to the codebase without explicit user approval of the selected plan.
*   **UI/UX Focus:** Always strive to make the UI more beautiful and easily accessible. Prioritize user experience and visual appeal in all changes.

# Engineering Standards

*   **Code Separability & Modular Concern:** Maintain strict separation of concerns. If a task involves a specific module (e.g., `src/modules/therapy`), all related logic and state changes should be confined to that directory. Do not modify global state or unrelated modules unless absolutely critical for the requested functionality.
*   **Zero Duplication & Component Reuse (DRY):** Strictly avoid code duplication. If a UI component (e.g., `ChatInterface`) or logic block is needed across multiple modules with slight variations, it MUST be refactored into a reusable core component with configurable props or hooks. Never copy-paste existing code to create "new" versions of the same functionality.
*   **Concurrency & Race Integrity:** Always account for data and network races. Use functional updates for state (e.g., `setProfile(prev => ...)`), implement cleanup functions in `useEffect` to cancel stale network requests or prevent out-of-order state updates, and ensure atomic operations when dealing with shared resources or persistent storage.
*   **Data Structure & Performance Optimization:** Prioritize efficient data structures and algorithms. Minimize O(n^2) operations, avoid unnecessary re-renders by using `useMemo` and `useCallback` judiciously, and ensure that large datasets (like chat history or biometric logs) are handled with performance-first patterns (virtualization, pagination, or optimized filtering).
*   **LLM Engine as External Entity:** Treat the `src/llm-engine/` as an external API or separate entity. Interaction should primarily happen via established interfaces. Avoid structural modifications to the engine unless it's necessary for critical optimization or required by a specific architectural directive. Refrain from deep engine changes in favor of interface consumption whenever possible.

# Project Overview: AGNES

**AGNES** (Artificial General Neural Ecosystem for Stability) is a unified, multi-agent wellness platform that bridges mental health and physical optimization. It features specialized AI agents (Therapy, Trainer, Ledger) operating within a futuristic, Wall-E and Eve-inspired aesthetic, secured by client-side End-to-End Encryption (E2EE).

The project has evolved from its "Nexus" origins into a holistic "neural ecosystem" where mental and physical states are linked via a centralized event bus (**Spine**) and a synthesized state layer (**GlobalSoul**).

## Tech Stack

*   **Framework:** React 19 (Vite SPA)
*   **Language:** TypeScript (Strict)
*   **Styling:** Tailwind CSS, Framer Motion, Shadcn UI
*   **AI Engine:** Nexus (OpenRouter-based multi-agent orchestrator)
*   **Event Bus:** Spine (Decoupled pub/sub with cascade logic)
*   **Encryption:** Web Crypto API (PBKDF2 + AES-GCM Vault)
*   **Database/Auth:** Firebase (Firestore, Auth, Storage)
*   **State Management:** Zustand, React Context

## Core Architecture & Systems

### 1. Nexus Orchestrator (`src/llm-engine/`)
The "brain" of AGNES. It manages interactions with LLMs (DeepSeek, Grok, Gemini), parses action tags, and handles tool calling. It is treated as an external API with no direct access to app-layer persistence or vault keys.

### 2. Spine Event Bus (`src/lib/spine/`)
The "nervous system." Facilitates decoupled communication between modules.
*   **Cascade Rules:** Implements cross-module logic (e.g., blocking high-intensity training if emotional resilience is low).

### 3. GlobalSoul (`src/lib/global-soul-context.tsx`)
The "synthesized state." Aggregates metrics (Neural State Vectors) and compacted insights from all modules into a unified wellness profile used to enhance AI context.

### 4. Vault (`src/lib/vault-context.tsx`)
The "security layer." Manages client-side E2EE. All sensitive data is encrypted before being sent to Firestore.

### 5. Specialized Modules (`src/modules/`)
*   **Hub:** Central command center and 3D visualization.
*   **Orchestrator (Nyx):** Onboarding, routing, and identity.
*   **Therapy (Agnes):** Mental wellness and emotional support.
*   **Trainer (Titan):** Fitness coaching and biometric tracking.
*   **Ledger:** Clinical health synthesis and record management.
*   **Soma:** Physical readiness and biometric clearance.
*   **Atlas:** Energy mapping and environmental stability.
*   **Scout:** External data exploration and research.
*   **Forge:** Habit formation and behavioral reinforcement.
*   **Pulse:** Real-time biometric stream monitoring.
*   **Profile:** User identity and global preference management.

## Key Directories

*   `src/core/`: Common layout, UI components, and theme providers.
*   `src/lib/`: Core logic, services (Auth, Firebase, Spine, GlobalSoul), and contexts.
*   `src/llm-engine/`: The AI orchestration layer (Agents, Memory, Orchestrator).
*   `src/modules/`: Isolated feature domains (Therapy, Trainer, Ledger, etc.).
*   `workitems/`: Sprint management system (`backlog/`, `sprints/`).

## Development & Deployment

### Commands
*   `npm run dev`: Start Vite development server.
*   `npm run build`: Type-check and build for production (outputs to `out/`).
*   `npm run preview`: Preview the production build locally.

### Configuration
*   **Vite:** `vite.config.ts` handles vendor chunking (React must load before R3F).
*   **Firebase:** `firebase.json` manages Hosting, Firestore rules, and indexes.

## Sprint Management
AGNES uses a Markdown-based sprint system located in `workitems/`.
*   **Backlog:** `workitems/backlog/BACKLOG.md`
*   **Current Sprint:** `workitems/sprints/SPRINT_1.md` (or latest)