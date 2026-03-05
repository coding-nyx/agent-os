# Agnes - AI Wellness Platform

A futuristic, highly versatile AI wellness platform featuring specialized AI agents (Therapy, Trainer, and more) with Wall-E and Eve-inspired 3D avatars.

## Features

*   **Futuristic Design:** Built with React, Vite, Tailwind CSS, and Shadcn UI.
*   **Modular Architecture:** Separate products (AI Therapy, AI Trainer, etc.) running as isolated sub-modules.
*   **Decoupled AI Engine:** A standalone `llm-engine` designed for future extraction to a dedicated Node.js backend.
*   **Dual Data Modes:** Local mock storage or Firebase real-time database.

## Quick Start

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Setup Environment:**
    ```bash
    cp .env.example .env.local
    ```
    *   Edit `.env.local` to add your Firebase keys (optional for Mock Mode).

    

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000).

## Documentation

*   [Deployment & CI/CD Guide](docs/DEPLOYMENT.md) - Learn how to deploy to Vercel and set up environment variables.

## Admin Access

*   URL: `/admin/login`
*   Default Password: `admin123`

## Tech Stack

*   **Framework:** Next.js 14 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS, Framer Motion
*   **Database:** Firebase Firestore (or LocalStorage Mock)
*   **UI Components:** Shadcn UI
