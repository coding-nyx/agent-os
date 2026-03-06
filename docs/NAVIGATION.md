# Navigation Flow

The AGNES / Titan Fitness application uses a **Client-Side Routing** architecture powered by `react-router-dom` v6. Navigation is divided into three distinct layers: Global Routing, Module-Internal Routing, and the "Nyx" Handoff System.

## 1. Global Routing Structure

Defined in `src/App.tsx`, the global router manages high-level page transitions and access control.

### Public Routes
- `/`: The Landing Page. Handles unauthenticated entry and guest session initialization.

### Protected Routes (Requires Auth or Guest Mode)
All routes below are wrapped in a `ProtectedRoute` component which enforces the following logic:
1.  **Authentication Check:** If neither authenticated via Firebase nor in Local Mock (Guest) mode, redirect to `/`.
2.  **Onboarding Gate:** If the user is authenticated but hasn't completed their core profile, they are force-redirected to `/orchestrator` for initialization.

**Available Pages:**
- `/orchestrator`: The primary AI intake and command center.
- `/hub`: Central dashboard for all unlocked modules.
- `/therapy`: Deep therapeutic interface (Agnes).
- `/trainer`: Fitness and biomechanical coaching.
- `/ledger`: Financial and lifestyle quantification.
- `/soma`: Somatic and biological health monitoring.
- `/atlas`: Spatial and environmental context mapping.
- `/scout`: Web research and external data synthesis.
- `/forge`: Creative and structural content generation.
- `/pulse`: Real-time biometric and stress tracking.
- `/profile`: User settings and encryption vault management.

---

## 2. Module Navigation Lifecycle

Each module (e.g., Therapy, Trainer) follows a standard lifecycle managed by the `UnifiedModulePage` component:

1.  **Vault Check:** If the module requires sensitive data access, the `VaultProvider` checks if the module-specific encryption keys are available.
2.  **Onboarding Status:** If the module-specific onboarding (e.g., `TherapyOnboarding`) is not complete, the user is presented with the Intake UI before reaching the main content.
3.  **State Persistence:** Active chat sessions and UI states are persisted in the `ModuleMemoryService` (LocalStorage or Firestore) to allow seamless navigation across modules without losing context.

---

## 3. The "Nyx" Handoff System

Navigation between modules is not just path-based but **context-aware** via the `NyxRoutingService`.

- **Delegation:** The LLM can emit a `<action type="delegate_to_module">` tag.
- **Handoff:** The `NyxHandoffService` stores the intent, target module, and required data.
- **Trigger:** A `NyxRouteBanner` appears in the UI, or the `useModuleAI` hook automatically consumes the handoff upon mounting the target module, allowing the AI to "follow" the user across the application.
