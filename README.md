# Nexus: Holistic AI Wellness Ecosystem

**Nexus** (Artificial General Neural Ecosystem for Stability - AGNES) is a unified, multi-agent wellness platform featuring specialized AI agents (Therapy, Trainer, Ledger, etc.) with a futuristic, Wall-E and Eve-inspired aesthetic. It combines mental health support, physical optimization, cognitive planning, and financial stability into a single, cohesive "Global Soul," secured by client-side End-to-End Encryption (E2EE).

For a detailed breakdown of the system architecture, product definition, and module functionalities, please see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
