# Design System: The "Neural Sanctuary"

The Titan Fitness / AGNES application uses a distinctive "Neural Sanctuary" aesthetic. It prioritizes dark, immersive interfaces, high-fidelity motion, and biological/mathematical metaphors.

## 1. Visual Foundation

- **Typography:** Inter (Standard) / Geist Mono (System/Technical readouts). High use of `tracking-widest` and `uppercase` for a "technical but serene" feel.
- **Color Palette:**
  - **Core Black:** `#05050a` (Main background)
  - **Indigo:** Focus color for Therapy and Global AI.
  - **Emerald/Orange/Cyan:** Accent colors for specific module domains.
  - **Translucency:** Heavy use of `backdrop-blur-3xl` and `white/5` or `white/10` borders to simulate depth.

## 2. Core Components (`src/core/components/`)

The application avoids standard UI libraries in favor of custom primitives that maintain the neural aesthetic.

### A. NexusChat
The primary conversational interface.
- Supports generic AI providers.
- Handles both streaming and complete message states.
- Includes "Internal Signal" toggles for viewing reasoning traces.
- Context-aware background glows based on the module theme.

### B. NeuralModal / NeuralButton
Extended versions of standard primitives.
- **NeuralModal:** Uses Framer Motion for organic entry/exit. Includes high-fidelity glass-morphism.
- **NeuralButton:** Features custom hover states with "glow" effects and support for loading states with `Loader2` integration.

### C. UnifiedModulePage
A specialized container for modules that handles the standard application lifecycle:
- Loading states.
- Onboarding gates.
- Encryption vault synchronization.
- Module-specific background patterns.

---

## 3. Theming Engine

The application uses a Tailwind-based theme mapping. Each module can define a `themeColor`:

- **Indigo:** Therapy / Orchestrator (Clinical, Secure, Deep).
- **Orange:** Trainer / Soma (Action, Vitality, Biomechanics).
- **Cyan:** Ledger / Scout (Analytical, Quantitative, Precise).

These themes automatically cascade down to components like `ChatInterface`, `NeuralButton`, and `NexusChat` via props, ensuring visual consistency without code duplication.

## 4. Animation Principles

Animations are managed via `framer-motion` and follow these rules:
- **Organic Entry:** `y: 20` to `y: 0` with `opacity: 0` to `1`.
- **Micro-interactions:** Buttons and cards use `scale: 1.02` on hover.
- **Loading states:** Always use a "pulsing" or "scanning" animation (`animate-pulse`) to represent active neural processing.
