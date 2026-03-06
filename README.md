# AGNES: Holistic AI Wellness Ecosystem

AGNES (Artificial General Neural Ecosystem for Stability) is a unified, multi-agent wellness platform featuring specialized AI agents (Therapy, Trainer, Ledger) with a futuristic, Wall-E and Eve-inspired aesthetic. It combines mental health support and physical optimization into a single, cohesive "Global Soul," secured by client-side End-to-End Encryption (E2EE).

## Project Overview

AGNES operates as a unified platform with one primary orchestrator and specialized domain modules. The system is designed with strict module boundaries, a shared base context for consistent personalization, and a persistent memory model that syncs across modules.

### Core Design Principles
- **Unified Experience:** Consistent design language and navigation across all modules.
- **Modular Integrity:** Module-specific logic and state are strictly confined to their respective directories.
- **Data Sovereignty:** All sensitive user data is encrypted client-side using a Master Vault key (PBKDF2 + AES-GCM).
- **Intelligent Synthesis:** A "Global Soul" layer that extracts and syncs cross-functional insights between modules (e.g., syncing physical fatigue from the Trainer to the Therapy agent).

## Tech Stack

- **Framework:** React 19
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS, Framer Motion, Shadcn UI
- **Routing:** React Router DOM (Client-side routing)
- **Database/Auth:** Firebase (Firestore, Auth, Storage) with a Local Storage "Mock Mode" fallback.
- **State Management:** Zustand, React Context
- **Encryption:** Web Crypto API (E2EE Master Vault)

## Application Flow

### 1. Guest Mode
Users can explore the platform and try limited trial sessions of any module (Therapy, Trainer, Ledger) directly from the home page. Guest trials have a visible token quota; once exhausted, the interface locks, and the user must authenticate to continue and persist their memory.

### 2. Logged-In & Onboarding
Upon authentication, users complete a core onboarding with **Nyx**, the system orchestrator. This captures identity, preferences, and agent personality settings (naming and gender defaults). This "Base Context" then personalizes all subsequent module interactions.

### 3. The Wellness Hub
The central command center where users view their holistic wellness profile and launch specialized modules. It features an adaptive UI (3D pods for capable desktops, 2D cards for mobile).

### 4. Specialized Modules
- **Agnes (Therapy):** An empathetic conversational agent focused on mental wellness and emotional support.
- **AI Trainer (Titan):** A data-driven fitness coach handling workout routines, macro tracking, and biometric logs.
- **AI Ledger:** A medical-grade agent providing cautious, clinical guidance and cross-module health synthesis.

### 5. Global Memory & Synthesis
Each session generates a compacted summary that is projected into the "Global Soul." This allows the orchestrator and other modules to maintain a "big picture" understanding of the user's progress and state without repetitive context window noise.

## Quick Start

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Setup Environment:**
    ```bash
    cp .env.example .env.local
    ```
    *Edit `.env.local` to add your Firebase keys (required for cloud persistence).*

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000).

## Commands

- `npm run dev`: Start Vite development server.
- `npm run build`: Type-check and build for production (outputs to `out/`).
- `npm run lint`: Run ESLint checks.
- `npm run preview`: Preview the production build locally.

## Admin Access
- URL: `/admin/login`
- Default Password: `admin123` (Configurable in system settings).
