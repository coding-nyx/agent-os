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

# Project Overview

This is a **React Single Page Application (SPA)** built with **Vite** and **TypeScript**, designed as a portfolio and management platform for personal trainers and gyms ("Titan Fitness").

**Note:** While the project contains Next.js artifacts (e.g., `src/app`, `next` dependency) and the README mentions Next.js 14, the current active configuration, build scripts, and entry point (`src/main.tsx`) indicate it primarily runs as a **Vite SPA**.

## Tech Stack

*   **Framework:** React 19
*   **Build Tool:** Vite
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Framer Motion
*   **Routing:** React Router DOM (`src/App.tsx`)
*   **State Management:** Zustand, React Context
*   **Database/Auth:** Firebase (Firestore, Auth) with a Local Storage "Mock Mode" fallback.
*   **UI Library:** Shadcn UI (Radix UI primitives).

## Architecture

### Entry Point
*   **Vite:** `index.html` -> `src/main.tsx` -> `src/App.tsx`
*   **Routing:** Client-side routing is handled in `src/App.tsx` using `react-router-dom`.
*   **Data Layer:** The app abstracts data fetching via `src/lib/data-provider.tsx` and `src/lib/services/firebase-service.ts`. It can toggle between live Firebase data and local mock data.

### Key Directories
*   `src/components/`: Reusable UI components (buttons, layout, specific features).
*   `src/pages/`: Page-level components corresponding to routes (e.g., `HomePage`, `TrainerPage`, `AdminPage`).
*   `src/lib/`: Core logic, utilities, and context providers.
    *   `firebase.ts`: Firebase initialization.
    *   `auth-context.tsx`: Authentication state management.
*   `src/app/`: Next.js App Router directory (appears to be secondary or part of a migration; contains `layout.tsx` and `page.tsx`).
*   `public/`: Static assets.

## Development

### Prerequisites
*   Node.js (v20+ recommended)
*   npm

### Commands
*   **Start Dev Server:**
    ```bash
    npm run dev
    # Runs 'vite'
    ```
*   **Build for Production:**
    ```bash
    npm run build
    # Runs 'tsc && vite build' (Outputs to 'out' directory)
    ```
*   **Preview Build:**
    ```bash
    npm run preview
    ```
*   **Lint:**
    ```bash
    npm run lint
    ```

## Configuration

*   **Vite:** `vite.config.ts` - Configures aliases (`@` -> `src`) and build output.
*   **Firebase:** `firebase.json` - Configures Firestore rules, indexes, and Hosting rewrites (SPA fallback to `index.html`).
*   **Environment Variables:**
    *   Copy `.env.example` to `.env.local` to configure Firebase credentials.
    *   The app checks for valid Firebase config; if missing or invalid, it may default to Mock Mode.

## Deployment
The project is configured for **Firebase Hosting**. The `vite.config.ts` sets the output directory to `out`, and `firebase.json` points hosting to `out`.