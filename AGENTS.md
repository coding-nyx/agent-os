# AI Agent Protocol & Project Standards (AGENTS.md)

This document serves as the foundational instruction set for all AI agents (Gemini, Copilot, Codex, etc.) interacting with the AGNES codebase.

## Core Mandates

### 1. Code Separability & Modular Integrity
- **Confine Changes:** Logic related to a specific module (e.g., `src/modules/therapy`) MUST remain within that module's scope.
- **Avoid Leakage:** Do not allow module-specific logic to leak into global providers, common utilities, or unrelated modules.
- **Cross-Module Communication:** Shared data should be handled via established services (e.g., `GlobalSoulService`) or generalized interfaces.

### 2. LLM Engine as External API
- **Black Box Treatment:** Treat `src/llm-engine/` as a separate entity or external API.
- **Interface Only:** Interact with the engine through its public hooks and functions.
- **No Structural Refactoring:** Structural changes to the engine are forbidden unless explicitly requested for performance optimization or foundational architectural shifts.

### 3. Engineering Excellence
- **TypeScript Strictness:** Maintain type safety. Avoid `any` unless necessary for Web Crypto API compatibility.
- **UI/UX Focus:** Prioritize modern, "alive," and polished aesthetics (Framer Motion, Glassmorphism, Tailwind).
- **Security First:** Never expose secrets or bypass E2EE (End-to-End Encryption) protocols.

## Project Architecture Overview

- **Entry Point:** `src/main.tsx` -> `src/App.tsx` (Vite SPA).
- **Modules (`src/modules/`):** Isolated feature domains (Therapy, Trainer, Ledger, Hub).
- **Core (`src/core/`):** Common layout and UI components.
- **Lib (`src/lib/`):** Shared services, contexts (Auth, Vault), and utilities.
- **LLM Engine (`src/llm-engine/`):** The orchestration layer for AI interactions.

## Interaction Protocols

1. **Plan First:** Analyze the project context deeply and propose a plan before execution.
2. **Dual Strategy:** For complex tasks, provide a "Plan A" (Immediate) and "Plan B" (Integrated).
3. **Validation:** Always verify changes with `npm run build` (tsc) to ensure system integrity.
