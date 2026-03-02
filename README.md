# Titan Fitness - Next.js Trainer Portfolio

A high-performance, energetic portfolio web application for personal trainers and gyms.

## Features

*   **Modern Design:** Built with Next.js, Tailwind CSS, and Shadcn UI.
*   **Dynamic Content:** Manage classes, profile, and certifications via an Admin Panel.
*   **Dual Data Modes:**
    *   **Mock Mode:** Zero-setup development using local storage.
    *   **Firebase Mode:** Production-ready real-time database with auto-seeding.
*   **Admin Panel:** Secure (mock) login to manage content.

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
