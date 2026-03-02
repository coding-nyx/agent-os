# Agent Protocol

*   **Plan First:** Always formulate a detailed plan and explain it to the user.
    *   **In-Depth Analysis:** Before proposing a plan, analyze the project deeply. Consider the repercussions, specific code changes, and functionality shifts.
    *   **Dual Planning Strategy:** You must provide **two distinct plans** for the user to choose from:
        1.  **Plan A (Immediate/Localized):** A quick, direct fix or solution to the immediate problem. Focuses on speed and minimal disruption.
        2.  **Plan B (Grand Scheme/Integrated):** A comprehensive approach that integrates the solution into the broader product architecture. Focuses on long-term stability, scalability, and "doing it right" as part of the larger system.
*   **Get Approval:** Do not execute any changes to the codebase without explicit user approval of the selected plan.
*   **UI/UX Focus:** Always strive to make the UI more beautiful and easily accessible. Prioritize user experience and visual appeal in all changes.

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