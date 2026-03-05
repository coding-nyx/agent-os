# Agnes - AI Wellness Platform: Architecture & Plan

## 1. Vision
Agnes is a futuristic, highly versatile AI wellness platform featuring specialized AI agents with Wall-E and Eve-inspired 3D avatars. It provides a modular, easily extendable system where users interact with personalized AI for their mental, physical, and general wellness.

## 2. Architecture & Tech Stack
- **Frontend Framework:** React (Vite) + Tailwind CSS + Shadcn UI.
- **State & Data Management:** Zustand (for global state), Firebase (for cloud persistence), LocalStorage (for mock/offline mode).
- **AI Engine (`llm-engine`):** A completely isolated, backend-agnostic module that acts as the brain. Currently running in-browser via OpenRouter, designed with strict boundaries to be trivially extractable to a Node.js/Express server.
- **Routing:** React Router DOM.
- **Design System:** "Futuristic, calm, Wall-E/Eve inspired". Dark modes with pastel neon accents, rounded borders, glowing animations, and minimal floating elements.

## 3. Modular Product Structure
Each product is a standalone sub-module located in `src/products/`. They share core UI components (`src/components/ui`) and the unified data/auth layer (`src/lib`), but their business logic and specific UI are isolated.

**Current Core Products:**
1.  **AI Therapy (Agnes):** A compassionate, empathetic conversational agent focused on mental wellness, cognitive behavioral techniques, and emotional support. (Avatar: Eve-inspired, smooth, floating, calming blue/white).
2.  **AI Trainer (Titan/Burn-E):** A motivational, data-driven fitness coach that handles workout routines, macro tracking, and exercise logs. (Avatar: Wall-E/Burn-E inspired, industrial, energetic orange/yellow).

**Planned Future Products:**
3.  **AI Nutritionist (Nourish):** A specialized agent that takes the physical data from the AI Trainer and emotional data from AI Therapy to build sustainable eating habits, generate grocery lists, and track micronutrients. (Avatar: Plant/Greenhouse bot inspired, organic green).
4.  **AI Sleep & Meditation Coach (Somni):** A dedicated agent focused on circadian rhythms, breathwork exercises, guided sleep stories, and ambient noise generation. (Avatar: Moon/Cloud inspired, deep indigo/purple).
5.  **Coding Agent / Productivity Assistant:** (As requested, expanding beyond pure wellness into mental clarity/workflow). A focused assistant to help unblock technical or creative work to reduce stress.

## 4. UI/UX Flow (User Journey)
1.  **Introduction / Home Page:**
    - A stunning, futuristic 3D or pseudo-3D animated landing page introducing the "Agnes Wellness Hub".
    - Interactive "showroom" displaying the available AI avatars (Therapy, Trainer, etc.) floating in pods.
2.  **Trial Viewing / Product Display:**
    - Users can click on an avatar pod to see a brief video or interactive demo of that specific agent's capabilities without logging in.
3.  **Login & Onboarding:**
    - A seamless, passwordless or sleek biometric-style login modal.
    - Global Onboarding: Asking for basic health data, goals, and preferred communication style.
    - Product-Specific Onboarding: When a user activates a new agent (e.g., AI Trainer), they go through a quick 3-step setup specific to that domain (e.g., weight, fitness goals).
4.  **User Dashboard (The Hub):**
    - A central command center.
    - Overview of holistic wellness: A combined score or chart merging mental health check-ins with physical activity.
    - Quick-launch buttons to enter specific product chats.
5.  **Product Pages (The Chat Interfaces):**
    - The core interaction zone. A distraction-free chat interface with the active avatar visible, typing indicators, and inline interactive widgets (e.g., a widget to log a workout inside the chat).
6.  **Admin Page (For Platform Managers):**
    - A hidden route for managing global prompts, monitoring system usage, and tuning the personas of the AI agents.

## 5. Next Execution Steps (Phase 2 & 3)
- Create a futuristic shell (Home Page, Hub Dashboard).
- Implement 3D-like floating avatar placeholders for the UI.
- Wire the new navigation flow from the Home Page to the Hub and into the extracted product modules.
- Ensure the `llm-engine` API is fully standardized across all current and future modules.
