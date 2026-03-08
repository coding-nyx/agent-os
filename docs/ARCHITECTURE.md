# Nexus: System Architecture & Product Definition

## 1. Product Identity
**Nexus** (Artificial General Neural Ecosystem for Stability - AGNES) is a cohesive, multi-agent wellness platform that unifies mental health support, physical optimization, cognitive planning, and financial stability. It operates entirely on client-side E2E encryption and a shared "Global Soul" memory bridge.

## 2. Core Modules

| Module | Agent Persona | Domain | Purpose |
|--------|---------------|--------|---------|
| **Orchestrator (Nyx)** | Nyx | System | Core onboarding, system configuration, baseline setup, and routing. |
| **Hub / Nexus** | System | Cross-domain | The central command center ("Wellness Hub") where users view holistic profiles, launch modules, and see cross-domain synthesis. |
| **Agnes** | Agnes | Emotional | Empathetic conversational therapy, handling emotional support and belief evolution. |
| **Titan** | Titan | Physical | CNS-aware fitness coach, tracking workouts, macros, biometric logs, and recovery. |
| **Atlas** | Atlas | Planning | Cognitive life planner for tasks, goals, habits, projects, and scheduling. |
| **Ledger** | Ledger | Financial | Financial wellness, interactive budgeting, and stress-correlation via finance. |
| **Pulse** | Pulse | Trends | Trend tracking, news briefs, and signal synthesis on specific topics of interest. |
| **Scout** | Scout | Research | Evidence verification, deep-dive document/topic research. |
| **Forge** | Forge | Productivity | AI productivity tool for code, documents, communications, and life tasks. |

## 3. Application Flow
1. **Landing (Guest Mode):** Users land on the home page with limited trial sessions. Token quota is visible.
2. **Authentication:** Local Storage mock mode or Firebase Auth.
3. **Onboarding:** Core onboarding via Nyx (Orchestrator) captures identity, preferences, agent aliases, and sets up the E2EE Master Vault.
4. **Hub:** The user enters the main Wellness Hub. An adaptive UI displays 3D pods/cards representing each module.
5. **Specialized Interaction:** User selects a module (e.g., Agnes, Titan). Each uses a unified `UnifiedModulePage` wrapping a `NexusChat` interface.
6. **Cross-Domain Synthesis (Global Soul):** During module interaction, the system projects compacted summaries of states into the "Global Soul" context (e.g., physical fatigue from Titan syncs to Agnes).

## 4. Technical Architecture
### Frontend
- **Framework:** React 19 + Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Framer Motion, Shadcn UI
- **State Management:** Zustand, React Context (`VaultContext`, `GlobalSoulContext`, `AuthContext`).
- **Routing:** React Router DOM (Client-side)

### Data & Backend
- **Storage:** Firebase (Firestore, Auth, Storage) + Local Storage fallback
- **Encryption:** Web Crypto API (PBKDF2 + AES-GCM). Data is encrypted before leaving the client. Module-specific profiles and memory are fully encrypted.
- **LLM Engine:** Encapsulated in `src/llm-engine/` and `src/lib/hooks/use-module-ai.ts`. Handles tool calling, streaming responses, quota enforcement, and multi-turn state.

### Module Structure (`src/modules/`)
Each module strictly confines its logic, encapsulating:
- `[Module]Page.tsx`: Entry point using `UnifiedModulePage`.
- `components/`: Specific UI widgets (e.g., Dashboards, metrics).
- `services/`: Specific logic for profile syncing, data fetching, or local actions.
- `personas.ts`: The system prompt defining the LLM's identity for this module.
- `onboarding/`: (Optional) Specialized sub-onboarding flows.

## 5. Design Principles ("Alive UI")
- **Neural Aesthetic:** Wall-E/Eve inspired, futuristic, glowing accents, clean glass-morphism panels.
- **Adaptive UI:** Scalable from robust desktop dashboards down to mobile chat interfaces.
- **State Visibility:** Consistent representation of background processing ("Neural Syncing", tool execution status).
