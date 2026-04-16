---
name: ara-product-spec
description: High-level architectural and product specification for Ara, a multi-agent wellness platform.
---

# Ara Product Specification

Ara is a unified wellness platform that bridges mental health and physical optimization through specialized AI agents.

## Core Architecture

### 1. Spine Event Bus (`src/lib/spine/`)
The decoupled communication layer ("nervous system").
- **Domains**: Biological (B), Emotional (E), Cognitive (C), Resource (R), System (S).
- **Cascade Rules**: Cross-module logic (e.g., Emotional state affecting Physical goals).
- **Events**: Modules publish/subscribe to domain-specific events.

### 2. GlobalSoul (`src/lib/global-soul-context.tsx`)
The synthesized state layer ("holistic profile").
- **Neural State Vector (NSV)**: Aggregates metrics from all modules.
- **Global Projection**: Context provided to LLMs to ensure they understand the user's overall state.

### 3. Vault (`src/lib/vault-context.tsx`)
The security layer ("privacy perimeter").
- **E2EE**: Client-side End-to-End Encryption using Web Crypto API.
- **Persistence**: All sensitive data is encrypted before being stored in Firestore.

### 4. Ara Orchestrator (`src/llm-engine/`)
The execution layer ("brain").
- **Multi-Agent**: Manages specialized personas (Agnes, Atlas, Titan, etc.).
- **Action Tags**: Parses `<action type="...">...</action>` for tool calling and state updates.

## Module Ecosystem

| Module | Domain | Purpose |
| :--- | :--- | :--- |
| **Agnes** | Emotional | Therapy, somatic support, emotional resilience. |
| **Atlas** | Cognitive | Planning, habits, burnout prevention, productivity. |
| **Titan** | Physical | Fitness coaching, biomarker tracking, recovery. |
| **Soma** | Biological | Physiological vitals and readiness monitoring. |
| **Ledger** | Resource | Financial planning and resource management. |
| **Scout** | Research | Information gathering and web-based research. |
| **Forge** | Technical | System configuration and technical execution. |
| **Hub** | Dashboard | Central orchestration and data visualization. |
| **Landing** | Onboarding | Platform initialization and "The Link". |
| **Notifications** | Alerts | System-wide alert bridge and reminders. |
| **Profile** | Identity | Global settings and user configuration. |
| **Documents** | Storage | Vault-encrypted document management. |

## Technical Stack
- **Web**: React 19, TypeScript, Tailwind CSS, Framer Motion, Shadcn UI, Three.js.
- **Mobile**: Android (Kotlin/Compose), KMP for shared logic.
- **Backend**: Firebase (Auth, Firestore, Storage, Functions).
- **AI**: DeepSeek, Grok, Gemini via specialized adapters.

## Development Principles
1. **Modular Isolation**: Logic stays within `src/modules/<module>`.
2. **E2EE First**: No sensitive data in plain text.
3. **Event-Driven**: Use Spine for cross-module side effects.
4. **Futuristic Aesthetic**: Glassmorphism, glowing accents, neural visual language.
