# NYX: NEURAL INTERFACE DESIGN SYSTEM v3.0

> Single source of truth for every visual element, interaction, and flow in the AGNES/Nyx ecosystem.

---

## 0. APP OVERVIEW

### What is AGNES/Nyx?

AGNES is an **AI wellness platform** — a personal nervous system of specialized AI agents that work together to optimize the user's biological, emotional, cognitive, and resource health. Think of it as a private constellation of AI specialists, each an expert in their domain, all sharing context through an encrypted neural spine.

**Target users:** Health-conscious individuals who want AI-driven guidance across therapy, fitness, nutrition, energy management, and personal development — all in one unified, privacy-first platform.

### The 10-Agent Ecosystem

| Agent | Role | Domain | One-Liner |
|-------|------|--------|-----------|
| **Nyx** | System Consciousness | All | Routes intent, synthesizes cross-module state, proposes changes |
| **Agnes** | Psychotherapist | Emotional | Attachment-aware therapy with archetype selection (Nurturer/Analyst/Provocateur) |
| **Titan** | Performance Coach | Physical | CNS-aware training with biometric integration and hormonal sync |
| **Soma** | Physician | Biological | Source of truth for biomarkers, lab parsing, medical clearance |
| **Dr. Ledger** | Chief Medical Officer | Analytical | Cross-module synthesis, anomaly detection, health gap analysis |
| **Atlas** | Energy Architect | Cognitive | Maps 24h energy waves, optimizes task placement, auto-flattens on fatigue |
| **Scout** | Knowledge Node | Research | Fact-checks claims, builds knowledge graphs, feeds other agents |
| **Forge** | Coding Agent | Technical | Sandboxed code execution via local nyx-link daemon |
| **Pulse** | Interest Observer | Discovery | Maps interest landscapes, synthesizes trends, feeds Scout topics |
| **Bridge** | Alert Daemon | Infrastructure | Routes critical events to WhatsApp/Email/Push (no UI page) |

### Core Principles

- **Privacy-first**: All sensitive data is E2EE (End-to-End Encrypted) client-side before reaching Firestore
- **Module isolation**: Each agent owns its domain. Cross-module data flows through the Neural State Vector (NSV) and SpineEventBus
- **Living system**: The UI is never static. Nerve endings pulse, data flows visibly between modules, the Soul Orb reflects system health
- **AI as conversation**: Every module interaction is conversational. Onboarding is hybrid (quick form → conversational refinement). Dashboards complement but never replace the chat

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite (SPA) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + Framer Motion |
| 3D | Three.js / React Three Fiber (optional premium view) |
| State | React Context + SpineEventBus (custom event system) |
| Database | Firebase Firestore (E2EE documents) |
| Auth | Firebase Auth + guest mode |
| AI | OpenRouter (multi-model), Google GenAI (embeddings) |
| Icons | Lucide React (exclusively) |
| UI Primitives | Shadcn/Radix (extended with Neural components) |

---

## 0.1 NAVIGATION ARCHITECTURE

### Route Map

```
/                    Landing Page (unauthenticated hero + CTAs)
/orchestrator        Nyx Onboarding & Chat (core profile setup)
/hub                 Neural Map Hub (module constellation, stats, 3D toggle)
/therapy             Agnes — Psychotherapy module
/trainer             Titan — Performance coaching module
/soma                Soma — Biological data & lab parsing (NEW)
/ledger              Dr. Ledger — CMO synthesis module
/atlas               Atlas — Energy architecture (NEW)
/scout               Scout — Research & knowledge (NEW)
/forge               Forge — Coding agent (NEW)
/pulse               Pulse — Interest mapping (NEW)
```

Bridge has NO route — it's a Firebase Cloud Function daemon.

### Navigation Elements

```
┌─────────────────────────────────────────────────────────────────┐
│                        NAVIGATION MAP                           │
│                                                                 │
│  ┌──────────┐     ┌──────────────┐     ┌──────────────────────┐│
│  │ LANDING  │────▶│  AUTH MODAL   │────▶│        HUB           ││
│  │    /     │     │ (overlay)    │     │       /hub           ││
│  └──────────┘     └──────────────┘     └──────┬───────────────┘│
│                                                │                │
│                    ┌───────────────────────────┼──────────┐     │
│                    │                           │          │     │
│               Click module node          Click Soul   Click    │
│               on Neural Map              Orb / FAB    [⚙]     │
│                    │                           │          │     │
│          ┌─────────┼─────────┐                 │     ┌────┴──┐ │
│          ▼         ▼         ▼                 ▼     │System │ │
│     ┌────────┐┌────────┐┌────────┐      ┌────────┐  │Command│ │
│     │ Agnes  ││ Titan  ││ Soma   │      │  Nyx   │  │Center │ │
│     │/therapy││/trainer││ /soma  │      │Overlay │  │(menu) │ │
│     └───┬────┘└───┬────┘└───┬────┘      │(panel) │  └───────┘ │
│         │         │         │           └────────┘             │
│     ┌───┴────┐┌───┴────┐┌──┴─────┐                            │
│     │Ledger  ││ Atlas  ││ Scout  │     All modules share:      │
│     │/ledger ││/atlas  ││/scout  │     • ModuleLayout shell    │
│     └───┬────┘└───┬────┘└───┬────┘     • Back → SyncTransition│
│         │         │         │          • → Returns to /hub     │
│     ┌───┴────┐┌───┴────┐                                      │
│     │ Forge  ││ Pulse  │     Nyx Overlay FAB visible on        │
│     │/forge  ││/pulse  │     ALL module pages (bottom-right)   │
│     └────────┘└────────┘                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Behaviors

| From | To | Trigger | Transition | Guard |
|------|----|---------|------------|-------|
| Landing | Auth Modal | "Initialize Neural Link" button | Modal slides up (300ms) | None |
| Auth Modal | Hub | Vault unlocked / Guest selected | Modal fades, Hub enters (500ms) | Auth + Vault |
| Hub | Any Module | Click module node on Neural Map | Page transition (500ms fade+slide) | ProtectedRoute (auth + vault) |
| Any Module | Hub | Back button (◀) in header | SyncTransition overlay (3.2s) | Active session warning if chat open |
| Any Module | Nyx Overlay | Click "Consult Nyx" FAB | Panel slides up (400ms spring) | None (always available) |
| Nyx Overlay | Module | Nyx suggests "Open Therapy" → user taps | Navigate + overlay collapses | ProtectedRoute |
| Any Module | Ghost Panel | SpineEventBus draft proposal | Panel slides from right (400ms) | None (automatic) |
| Hub | Settings | Click ⚙ SystemCommandCenter | Dropdown appears (200ms) | None |
| Settings | Landing | "Terminate Link" (logout) | Redirect (instant) | Confirmation |

### Persistent UI Elements (visible on every page)

| Element | Position | Visibility |
|---------|----------|------------|
| **Nyx FAB** | Bottom-right, fixed | All module pages + Hub (not Landing) |
| **SystemCommandCenter** | Top-right, in header | All authenticated pages |
| **NeuralIntegrity bar** | In ModuleLayout header | All module pages |
| **Nerve endings** | Below header, extending down | All module pages |

### Back-Button Philosophy

- **No browser back.** All navigation is explicit via UI controls.
- Module exit always goes through **SyncTransition** (the "soul sync" animation) before returning to Hub.
- Exception: Nyx Overlay dismissal is instant (collapse to FAB).
- The Hub is the only "home" — there is no breadcrumb trail. The mental model is: Hub → Module → Hub.

---

## 1. DESIGN PHILOSOPHY

**Core Metaphor: The Nervous System.** The app IS the user's digital nervous system. Every module is an organ, every data change is a nerve impulse, and the UI breathes with the rhythm of the user's biological and psychological state.

**Three Pillars:**
- **Transparency** — Glass surfaces reveal depth. Nothing hides. The user always sees what's happening underneath.
- **Depth** — Layered surfaces create spatial hierarchy. The void (`#020205`) is infinite. Cards float above it. Modals hover above cards.
- **Motion** — Nothing is static. Everything breathes, pulses, or flows. Idle states have subtle animations. Active states have dramatic ones.

**Dark-only.** The obsidian canvas is the void from which consciousness emerges. There is no light mode. The darkness is not an absence — it is the substrate.

---

## 2. COLOR SYSTEM

### 2.1 Module Palette

| Module | Role | Color | Hex | Tailwind | HSL | Domain |
|--------|------|-------|-----|----------|-----|--------|
| **Nyx** | System Consciousness | Violet | `#8B5CF6` | `violet-500` | `258 89% 66%` | System |
| **Agnes** | Psychotherapist | Indigo | `#6366F1` | `indigo-500` | `239 84% 67%` | Emotional |
| **Titan** | Performance Coach | Amber | `#F59E0B` | `amber-500` | `38 92% 50%` | Physical |
| **Soma** | Physician | Emerald | `#10B981` | `emerald-500` | `160 84% 39%` | Biological |
| **Dr. Ledger** | Chief Medical Officer | Cyan | `#06B6D4` | `cyan-500` | `189 94% 43%` | Analytical |
| **Atlas** | Energy Architect | Sky | `#0EA5E9` | `sky-500` | `199 89% 48%` | Cognitive |
| **Scout** | Knowledge Node | Lime | `#84CC16` | `lime-500` | `84 81% 44%` | Research |
| **Forge** | Coding Agent | Rose | `#F43F5E` | `rose-500` | `350 89% 60%` | Technical |
| **Pulse** | Interest Observer | Fuchsia | `#D946EF` | `fuchsia-500` | `292 84% 61%` | Discovery |
| **Bridge** | Alert Daemon | Slate | `#64748B` | `slate-500` | `215 16% 47%` | Infrastructure |

### 2.2 Semantic Colors

| Purpose | Color | Hex | Tailwind |
|---------|-------|-----|----------|
| Success | Emerald | `#10B981` | `emerald-500` |
| Warning | Amber | `#F59E0B` | `amber-500` |
| Error / Critical | Red | `#EF4444` | `red-500` |
| Info | Sky | `#0EA5E9` | `sky-500` |

### 2.3 Surface Colors

| Layer | Name | Value | Usage |
|-------|------|-------|-------|
| L0 | Void | `#020205` | Page background, canvas |
| L1 | Surface | `#05050a` | Elevated containers, modal backdrops |
| L2 | Card | `rgba(255,255,255,0.03)` | Glass cards, panels |
| L3 | Interactive | `rgba(255,255,255,0.06)` | Hovered cards, active inputs |
| L4 | Overlay | `rgba(0,0,0,0.60)` | Modal backdrop, dimming layer |
| — | Border | `rgba(255,255,255,0.10)` | Default card/input borders |
| — | Border Hover | `rgba(255,255,255,0.15)` | Hovered borders |
| — | Text Primary | `rgba(255,255,255,0.95)` | Headings, primary text |
| — | Text Secondary | `rgba(255,255,255,0.60)` | Body text, descriptions |
| — | Text Muted | `rgba(255,255,255,0.40)` | Captions, disabled text |

### 2.4 Color DNA Per Module

For each module color `{C}`, derive the full usage scale:

| Token | Tailwind | Opacity | Usage |
|-------|----------|---------|-------|
| `{C}-bg` | `bg-{C}-500/5` | 5% | Tinted background areas |
| `{C}-border` | `border-{C}-500/20` | 20% | Card borders, input borders |
| `{C}-border-hover` | `border-{C}-500/40` | 40% | Hover state borders |
| `{C}-glow` | `shadow-[0_0_30px_rgba({R},{G},{B},0.3)]` | 30% | Card/button glow effect |
| `{C}-glow-subtle` | `shadow-[0_0_20px_rgba({R},{G},{B},0.15)]` | 15% | Subtle ambient glow |
| `{C}-glow-intense` | `shadow-[0_0_50px_rgba({R},{G},{B},0.5)]` | 50% | Active/focus state glow |
| `{C}-solid` | `bg-{C}-500` | 100% | Solid buttons, active indicators |
| `{C}-solid-hover` | `bg-{C}-600` | 100% | Hovered solid elements |
| `{C}-text` | `text-{C}-400` | — | Colored text on dark bg |

### 2.5 Glow Specifications (exact rgba for box-shadow)

| Module | Glow CSS |
|--------|----------|
| Nyx | `shadow-[0_0_30px_rgba(139,92,246,0.3)]` |
| Agnes | `shadow-[0_0_30px_rgba(99,102,241,0.3)]` |
| Titan | `shadow-[0_0_30px_rgba(245,158,11,0.3)]` |
| Soma | `shadow-[0_0_30px_rgba(16,185,129,0.3)]` |
| Ledger | `shadow-[0_0_30px_rgba(6,182,212,0.3)]` |
| Atlas | `shadow-[0_0_30px_rgba(14,165,233,0.3)]` |
| Scout | `shadow-[0_0_30px_rgba(132,204,22,0.3)]` |
| Forge | `shadow-[0_0_30px_rgba(244,63,94,0.3)]` |
| Pulse | `shadow-[0_0_30px_rgba(217,70,239,0.3)]` |
| Bridge | `shadow-[0_0_30px_rgba(100,116,139,0.3)]` |

---

## 3. TYPOGRAPHY

### 3.1 Font Stack

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| Headings | Space Grotesk | 700 (Bold) | `system-ui, sans-serif` |
| Body | Inter | 400 / 500 / 700 | `system-ui, sans-serif` |
| Telemetry | `'Inter', monospace` | 500 | `'Courier New', monospace` |

### 3.2 Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Font | Usage |
|-------|------|--------|-------------|----------------|------|-------|
| `display-xl` | 48px / `text-5xl` | 700 | 1.1 | `-0.02em` | Space Grotesk | Landing hero title |
| `display` | 36px / `text-4xl` | 700 | 1.15 | `-0.01em` | Space Grotesk | Page titles |
| `heading-lg` | 24px / `text-2xl` | 700 | 1.25 | `0` | Space Grotesk | Section headers |
| `heading` | 20px / `text-xl` | 700 | 1.3 | `0` | Space Grotesk | Card titles |
| `heading-sm` | 16px / `text-base` | 700 | 1.4 | `0` | Space Grotesk | Sub-headings |
| `body-lg` | 16px / `text-base` | 400 | 1.6 | `0` | Inter | Chat messages, body |
| `body` | 14px / `text-sm` | 400 | 1.5 | `0` | Inter | Default body text |
| `body-bold` | 14px / `text-sm` | 700 | 1.5 | `0` | Inter | Emphasized body |
| `caption` | 12px / `text-xs` | 500 | 1.4 | `0` | Inter | Labels, metadata |
| `telemetry` | 10px / `text-[10px]` | 500 | 1.2 | `0.2em` | Inter mono | System status, `UPPERCASE` |
| `micro` | 8px / `text-[8px]` | 500 | 1.2 | `0.15em` | Inter mono | Tiny labels |

### 3.3 Usage Rules

- **Italic**: Module names when referenced in text (e.g., "*Agnes* suggests...")
- **Uppercase + tracking**: ONLY for telemetry/system labels (e.g., `E2EE_ACTIVE`, `SOMA_CLEARANCE`)
- **Space Grotesk**: ONLY for headings and display text. Never for body.
- **Bold italic uppercase** (existing pattern in NeuralButton): Keep for button labels

---

## 4. MATERIAL SYSTEM

### 4.1 Layer Hierarchy

```
L4  Overlay/Modal     ──  bg-[#05050a] border-white/10 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.5)]
L3  Interactive/Panel  ──  bg-white/[0.06] backdrop-blur-2xl border-white/15 rounded-2xl
L2  Card/Container     ──  bg-white/[0.03] backdrop-blur-2xl border-white/10 rounded-[32px]
L1  Surface            ──  bg-[#05050a] border-white/5 rounded-2xl
L0  Void/Canvas        ──  bg-[#020205] (no border, no blur)
```

### 4.2 Glass Card Specification

```
Default:    bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px]
Hover:      bg-white/[0.05] border-white/15 shadow-{module-glow-subtle}
Active:     bg-white/[0.06] border-{module}-500/30 shadow-{module-glow}
Focused:    bg-white/[0.04] border-{module}-500/40 ring-2 ring-{module}-500/20
Disabled:   bg-white/[0.02] border-white/5 opacity-50
```

### 4.3 Peripheral Nerve Endings

The signature visual element. Thin glowing lines that extend from the module header downward, connecting to key UI sections.

```
Structure:  1px wide, linear-gradient(to bottom, {moduleColor}26, transparent)
Idle:       opacity 0.15, subtle pulse 0.10→0.20 over 4s, infinite
Event:      light dot (4px circle, {moduleColor} at 80%) travels top→bottom in 400ms ease-out
            Line opacity brightens to 0.6, fades back to 0.15 over 800ms
Alert:      line turns red-500/40, rapid pulse 200ms interval × 3
Count:      2-3 lines per module page, positioned at left ~8%, center ~50%, right ~92%
Connection: Lines visually "attach" to card borders they pass near
```

### 4.4 Ghost Panel Material (NeuralDraft)

```
Container:  border: 2px dashed {sourceModuleColor}/50
            bg-white/[0.02] backdrop-blur-xl
            rounded-2xl
Shimmer:    background-image: linear-gradient(110deg, transparent 25%, {moduleColor}08 50%, transparent 75%)
            background-size: 200% 100%
            animation: shimmer 3s ease-in-out infinite
Opacity:    0.85 container, content inside at full opacity
```

---

## 5. COMPONENT LIBRARY

### 5.1 NeuralButton

**Purpose:** Primary interactive button with glow and module-color support.

| Variant | Background | Border | Text | Glow |
|---------|-----------|--------|------|------|
| `primary` | `bg-{C}-600` | `border-{C}-500/30` | `text-white font-black italic uppercase` | `shadow-[0_0_20px_rgba({R},{G},{B},0.3)]` |
| `secondary` | `bg-white/5` | `border-white/10` | `text-white/80 font-bold` | None |
| `ghost` | `bg-transparent` | `border-transparent` | `text-white/60` | None |
| `danger` | `bg-red-950/50` | `border-red-500/30` | `text-red-400 font-bold` | `shadow-[0_0_20px_rgba(239,68,68,0.2)]` |

**States:**
```
Hover:   brightness-110, scale 1.02, glow opacity +0.2
Active:  scale 0.98, bg-{C}-700
Loading: opacity 0.7, spinner inside, pointer-events-none
```

**Sizes:** `sm` (h-8 px-3 text-xs), `md` (h-10 px-5 text-sm), `lg` (h-12 px-6 text-base), `xl` (h-14 px-8 text-lg)

### 5.2 NeuralInput

**Purpose:** Text input with icon support and module-themed focus glow.

```
Base:     bg-black/40 border border-white/10 rounded-2xl h-12 px-4 text-white/90
Focus:    border-{C}-500/50 ring-2 ring-{C}-500/20 shadow-{C}-glow-subtle
Icon:     left-positioned, text-white/40, 20px
Label:    text-xs text-white/40 uppercase tracking-[0.1em] mb-1
Error:    border-red-500/50 ring-red-500/20, error text below in text-red-400 text-xs
```

### 5.3 NeuralModal

**Purpose:** Centered glass dialog with themed header.

```
Backdrop: bg-black/60 backdrop-blur-sm
Container: bg-[#05050a] border border-white/10 rounded-[32px] shadow-[0_0_50px_rgba(0,0,0,0.5)]
Header:   bg-{C}-500/10 px-8 pt-6 pb-4
           Title: Space Grotesk 700, text-xl
           Subtitle: Inter 400, text-sm, text-white/60
Body:     px-8 py-6
Footer:   px-8 pb-6, flex gap-3 justify-end
Width:    sm(400px) md(500px) lg(640px) xl(780px) 2xl(900px)
Entry:    scale 0.9, opacity 0 → scale 1, opacity 1 (300ms spring)
Exit:     scale 0.95, opacity 0 (200ms ease-out)
```

### 5.4 GlassCard

**Purpose:** Frosted glass container with optional glow and nerve-ending accent.

```
Base:     bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-6
Glow:     optional shadow-[0_0_30px_rgba({R},{G},{B},0.15)]
Nerve:    optional left-border gradient line (1px, {C}/20 → transparent)
Hover:    bg-white/[0.05] border-white/15 scale-[1.005] transition-all duration-300
```

### 5.5 NeuralIntegrity

**Purpose:** Security/wellness score progress bar.

```
Container: flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl
Label:    text-[10px] uppercase tracking-[0.2em] text-white/40
Bar:      h-1.5 bg-white/10 rounded-full overflow-hidden
Fill:     h-full bg-{C}-400 rounded-full, width = score%
Badge:    text-[8px] uppercase tracking-widest text-{C}-400
```

### 5.6 NeuralDraft (Ghost UI Side Panel)

**Purpose:** Displays cross-module draft proposals for user approval.

```
Panel:    fixed right-0 top-0 h-full w-[320px] z-50
          bg-white/[0.02] backdrop-blur-xl border-l border-dashed border-{C}-500/50
          Entry: x: 320 → x: 0 (400ms ease-out)
          Exit:  x: 0 → x: 320 (300ms ease-in)

Header:   p-4 border-b border-white/10
          Source badge: bg-{sourceColor}-500/10 text-{sourceColor}-400 text-xs rounded-full px-2 py-0.5
          Title: text-base font-bold text-white/90

Body:     p-4, before/after comparison cards
          Before: bg-white/[0.02] rounded-xl p-3, text-white/40
          After:  bg-{C}-500/5 border border-{C}-500/20 rounded-xl p-3, text-white/80

Actions:  p-4 flex gap-2
          Approve: NeuralButton primary emerald, "✓ Approve"
          Dismiss: NeuralButton ghost, "✗ Dismiss"
          Edit:    NeuralButton secondary, "✎ Edit"

Shimmer:  3s infinite animation on dashed border
Auto-dismiss: 30s timeout with progress bar at bottom
Stack:    Multiple proposals stack vertically with 8px gap
```

### 5.7 VitalsGrid

**Purpose:** Grid display of biometric/wellness metrics.

```
Grid:     grid grid-cols-2 lg:grid-cols-4 gap-3
Cell:     GlassCard (compact: p-3 rounded-xl)
          Label: telemetry style (10px uppercase tracking)
          Value: heading-lg, colored by domain
          Bar:   h-1 bg-white/10 rounded, fill colored by domain
          Status: text-[8px], "OPTIMAL" (emerald) / "WARNING" (amber) / "CRITICAL" (red)
```

### 5.8 NyxOverlay

**Purpose:** Floating Nyx consultation panel accessible from any module.

```
FAB:      fixed bottom-6 right-6 z-40
          w-14 h-14 rounded-full bg-violet-600 border border-violet-500/30
          shadow-[0_0_30px_rgba(139,92,246,0.4)]
          Icon: Sparkles (Lucide) or Nyx logo, text-white
          Pulse: subtle scale 1.0→1.05 over 3s when idle
          Badge: red dot if pending proposals

Panel:    fixed bottom-24 right-6 w-[380px] max-h-[60vh] z-50
          GlassCard with violet accent: border-violet-500/20
          Entry: y: 100%, opacity: 0 → y: 0, opacity: 1 (400ms spring)

Header:   "Nyx" + violet dot + "System Consciousness"
Chat:     Mini ChatInterface, violet theme
Input:    Bottom-pinned, violet focus ring
Close:    "−" button → collapse to FAB
```

### 5.9 ModuleNode (Neural Map)

**Purpose:** Individual module node on the Hub neural map.

```
Circle:   w-14 h-14 (56px) rounded-full
          bg-{C}-500/10 border-2 border-{C}-500/30
          Glow ring: shadow-[0_0_15px_rgba({R},{G},{B},0.2)]
Icon:     Lucide icon, 24px, text-{C}-400, centered
Label:    Below circle, text-xs text-white/60, mt-2, text-center
Status dot: 6px circle, top-right corner

States:
  Idle:    border-{C}-500/30, subtle pulse (scale 1.0→1.02, 3s)
  Hover:   scale 1.1, border-{C}-500/60, glow intensifies to 0.4
  Active:  border-{C}-500/80, solid glow, label text-white
  Locked:  opacity 0.3, Lock icon overlay, grayscale filter
  Alert:   border-red-500/60, red pulse animation (200ms × 3)
```

### 5.10 ConnectionLine (Neural Map)

**Purpose:** Animated SVG path between module nodes.

```
SVG Path: <path> with quadratic bezier curve
          stroke: {sourceColor} at 20% opacity
          stroke-width: 1
          fill: none

Active flow animation:
  Traveling dot: 4px circle, {sourceColor} at 80%
  Motion: follows path via SVG `<animateMotion>`, 2s duration, ease-in-out
  Pause: 1s between loops
  Direction: from source → target module

Alert:    stroke: red-500/40, faster pulse (1s loop)
```

### 5.11 SoulOrb (Hub Center)

**Purpose:** Central element reflecting system health.

```
2D Mode:
  Circle:  w-20 h-20 (80px) rounded-full
  Gradient: conic-gradient of all active module colors, blended
  Rotate:  8s infinite linear rotation
  Glow:    shadow-[0_0_40px_rgba(139,92,246,0.3)]
  Health:  brightness scales with wellness index (0.5 at 0% → 1.5 at 100%)
  Click:   Opens Nyx overlay panel

3D Mode:
  Geometry: SphereGeometry(1, 64, 64)
  Material: ShaderMaterial with animated gradient
  Float:   y oscillation ±0.2 over 4s
  Emissive: intensity scales with wellness index
```

### 5.12 Additional Components

**TelemetryTicker:**
```
Container: overflow-hidden h-5, text-[10px] uppercase tracking-[0.2em] text-white/30
Content:   Rotating random system logs: "0x772_PING_SENT", "E2EE_TUNNEL_STABLE", etc.
Animation: translateY cycle through 4-5 messages, 3s per message
Icon:      Terminal (Lucide), 10px, mr-1
```

**BootLoader:**
```
Fullscreen: bg-[#020205] flex items-center justify-center
Scanner:   2px horizontal line, violet gradient, sweeps top→bottom (2s)
Text:      "INITIALIZING NEURAL LINK..." types in at 50ms/char, telemetry style
Logo:      Centered, subtle pulse
```

**SyncTransition:**
```
Overlay:  fixed inset-0 bg-[#020205]/95 backdrop-blur-xl z-50
Title:    "Soul Synchronization" — Space Grotesk, text-xl
Logs:     8 sequential messages (400ms each): "EXTRACTING_NEURAL_BREAKTHROUGHS..." etc.
Progress: h-1 bg-white/10, fill bg-{C}-500, animates 0→100% over 3.2s
Exit:     Navigates to /hub on completion
```

**ChatBubble:**
```
User:      bg-{C}-500/10 border border-{C}-500/20 rounded-3xl rounded-br-sm p-4
           text-white/90, float right, max-w-[80%]
Assistant: bg-white/5 border border-white/10 rounded-3xl rounded-bl-sm p-4
           text-white/80, float left, max-w-[80%]
Entry:     opacity 0, y: 10 → opacity 1, y: 0 (200ms), stagger 50ms
Streaming: text appears character-by-character, cursor blink at end
```

**UnifiedAuthModal** (5 states):
```
IDENTITY_CHOICE:  Guest button + divider + Login/Register buttons
LOGIN:            Email + Password fields + submit
REGISTER:         Email + Password fields + submit
VERIFY:           "Check your email" + polling indicator
VAULT_HANDSHAKE:  Master password field(s) + "GENERATE NEURAL KEYS" / "DECRYPT & SYNC"
```

## 6. THE NEURAL MAP HUB

### 6.1 Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│  ◀ Logo  "Neural Nexus"    [Identity Badge]    [3D] [⚙]│  ← Top Nav (64px)
├──────────────────────────────────────────────────────────┤
│                                                          │
│                    ╭── Atlas ──╮                          │
│                   ╱    (Sky)    ╲                         │
│              Scout╱              ╲Ledger                  │
│             (Lime)     ╭────╮    (Cyan)                   │
│                ╲      │ ◉  │      ╱                      │
│       Forge ────╲     │Soul│     ╱──── Pulse              │
│       (Rose)     ╲    │Orb │    ╱     (Fuchsia)           │
│                   ╲   ╰────╯   ╱                          │
│              Agnes ╲    │    ╱ Titan                       │
│             (Indigo) ╲  │  ╱  (Amber)                     │
│                       ╲ │ ╱                                │
│                        Soma                                │
│                      (Emerald)                             │
│                                                            │
├──────────────────────────────────────────────────────────┤
│  ♡ Wellness: 82  ⚡ CNS: 74  🧠 Resilience: 89  💤 Sleep: 7.2h │
└──────────────────────────────────────────────────────────┘
```

**Arrangement:**
- **Center**: Soul Orb (80px, gradient, clickable → opens Nyx)
- **Inner ring** (r ≈ 180px): Core agents that interact directly with user
  - Top: Nyx (Violet) — system node, slightly larger (64px)
  - Left: Agnes (Indigo) — therapy
  - Right: Titan (Amber) — training
  - Bottom: Soma (Emerald) — biological data
- **Outer ring** (r ≈ 320px): Support & analytical agents
  - Top-left: Atlas (Sky) — energy architecture
  - Top-right: Ledger (Cyan) — CMO synthesis
  - Bottom-left: Scout (Lime) — research
  - Bottom-right: Forge (Rose) — coding
  - Far right: Pulse (Fuchsia) — interests
- **Bridge**: No visible node — ambient infrastructure daemon. Represented only by occasional status text in TelemetryTicker.

### 6.2 Connection Map (SVG Paths)

```
Nyx ──── Agnes        (violet→indigo)    Nyx delegates therapy queries
Nyx ──── Titan        (violet→amber)     Nyx delegates fitness queries
Nyx ──── Soma         (violet→emerald)   Nyx delegates health queries
Nyx ──── Ledger       (violet→cyan)      Nyx requests synthesis
Nyx ──── Atlas        (violet→sky)       Nyx requests energy analysis
Nyx ──── Scout        (violet→lime)      Nyx requests research
Nyx ──── Forge        (violet→rose)      Nyx delegates coding
Nyx ──── Pulse        (violet→fuchsia)   Nyx requests trends
Agnes ── Soma         (indigo→emerald)   Therapy reads biomarkers
Agnes ── Atlas        (indigo→sky)       Therapy affects energy
Titan ── Soma         (amber→emerald)    Trainer needs clearance
Titan ── Atlas        (amber→sky)        Training affects energy
Ledger ── Soma        (cyan→emerald)     CMO reads diagnostics
Ledger ── Agnes       (cyan→indigo)      CMO reads emotional state
Ledger ── Titan       (cyan→amber)       CMO reads performance
Scout ── Forge        (lime→rose)        Scout feeds research to Forge
Scout ── Pulse        (lime→fuchsia)     Scout ingests Pulse interests
```

Each connection rendered as a quadratic bezier SVG `<path>` with a traveling light dot when data flows.

### 6.3 Stats Bar (Bottom)

```
Container: fixed bottom-0 w-full h-14
           bg-black/40 backdrop-blur-xl border-t border-white/5
Content:   flex justify-center gap-8 items-center
Stat:      VitalsGrid cell (inline variant)
           Label: telemetry (10px uppercase)
           Value: heading-sm, colored by domain
           Divider: 1px h-6 bg-white/10 between stats
```

### 6.4 The 3D Toggle

```
Location: Top-right, next to SystemCommandCenter
Button:   NeuralButton ghost, icon toggle (Layers ↔ Box)
Behavior: When toggled ON, Canvas replaces 2D SVG map
          Same node positions but rendered as 3D floating pods
          Camera: position [0, 0, 10], fov 45
          Fog: [#020205, 5, 18]
          Three.js modules: lazy-loaded (React.lazy)
Transition: Crossfade 500ms between 2D and 3D views
```

### 6.5 Responsive Hub

```
Desktop (>1024px):  Full neural map with all nodes + connections
Tablet (768-1024):  Compact map, inner ring only, outer ring as horizontal scroll below
Mobile (<768px):    Vertical card list grouped by category:
                    ┌─ Core Agents ─────────────────┐
                    │ [Agnes] [Titan] [Soma]         │
                    ├─ Analysis ────────────────────┤
                    │ [Ledger] [Atlas]               │
                    ├─ Tools ───────────────────────┤
                    │ [Scout] [Forge] [Pulse]        │
                    └──────────────────────────────┘
                    Each card: GlassCard with icon, name, status, tap to enter
```

---

## 7. MODULE WORKSPACE LAYOUT

### 7.1 ModuleLayout Structure

```
┌────────────────────────────────────────────────────────────────┐
│ ◀ │ MODULE_NAME ● Optimal │ ░░ TELEMETRY ░░ │ 🔒 E2EE_ACTIVE │  Header (64px)
├────────────────────────────────────────────────────────────────┤
│ │                                                          │ │ │
│ │  ┌──────────────────────┐  ┌──────────────────────┐      │ │ │  Nerve endings
│ │  │                      │  │                      │      │ │ │  (1px glow lines)
│ │  │     CHAT AREA        │  │   DASHBOARD PANEL    │      │ │ │
│ │  │     (60-70%)         │  │   (30-40%)           │      │ │ │
│ │  │                      │  │   VitalsGrid         │      │ │ │
│ │  │  ┌─ Assistant ──┐    │  │   Module metrics     │      │ │ │
│ │  │  │ Glass bubble │    │  │   Charts             │      │ │ │
│ │  │  └──────────────┘    │  │                      │      │ │ │
│ │  │         ┌─ User ───┐ │  │                      │      │ │ │
│ │  │         │ Colored  │ │  │                      │      │ │ │
│ │  │         └──────────┘ │  └──────────────────────┘      │ │ │
│ │  │                      │                                │ │ │
│ │  │ ┌──────────────────┐ │                                │ │ │
│ │  │ │ 💬 Type message  │ │                                │ │ │
│ │  │ └──────────────────┘ │                                │ │ │
│ │  └──────────────────────┘                                │ │ │
│ │                                                          │ │ │
├────────────────────────────────────────────────────────────────┤
│ ═══════════════ accent bar ({moduleColor}/40) ════════════════│  Footer (4px)
└────────────────────────────────────────────────────────────────┘

                                              [Consult Nyx ◉]  ← NyxOverlay FAB (fixed)
                                         ┌─────────────────────┐
                                         │ NeuralDraft panel   │  ← Ghost UI (when active)
                                         │ (slides from right) │
                                         └─────────────────────┘
```

### 7.2 Nerve Ending Positions

```
Line 1: x = 8% width,  top = header bottom, height = 100% viewport
Line 2: x = 50% width, top = header bottom, height = 60% viewport
Line 3: x = 92% width, top = header bottom, height = 80% viewport
```

Each line curves subtly toward the nearest UI card using CSS `border-radius` or SVG path.

### 7.3 Background Effects

```
Grid pattern: radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px)
              background-size: 32px 32px
Glow blob 1: absolute top-[-20%] right-[-10%], w-[400px] h-[400px]
              bg-{C}-500/10 rounded-full blur-[120px] animate-pulse
Glow blob 2: absolute bottom-[-15%] left-[-10%], w-[300px] h-[300px]
              bg-{C}-500/5 rounded-full blur-[100px] opacity-50
```

### 7.4 Desktop / Tablet / Mobile

```
Desktop (>1024px):  Split view — Chat 60% | Dashboard 40%
Tablet (768-1024):  Chat full width, Dashboard as collapsible drawer (swipe up from bottom)
Mobile (<768px):    Chat full width, Dashboard accessible via tab toggle above chat
                    NyxOverlay → full-screen overlay with back button
                    Ghost panel → bottom sheet (full width, 60% height)
```

---

## 8. COMPLETE USER JOURNEY FLOWS

### 8.1 First-Time User

```
[Landing Page]
  │  Hero: "AGNES Neural Ecosystem v3.0"
  │  CTA: "Initialize Neural Link"
  ▼
[Auth Modal: IDENTITY_CHOICE]
  ├─ "Guest Link" ─────────────────────────────────────┐
  │                                                     ▼
  │                                              [Hub: Neural Map]
  │                                                Guest mode: limited
  │                                                modules, trial quotas
  │
  ├─ "Initialize" (Register) ──────────────────────────┐
  │                                                     ▼
  │                                              [Auth: REGISTER]
  │                                                email + password
  │                                                     │
  │                                                     ▼
  │                                              [Auth: VERIFY]
  │                                                "Check your email"
  │                                                polling every 3s
  │                                                     │
  │                                                     ▼
  │                                              [Auth: VAULT_HANDSHAKE]
  │                                                Define master password ×2
  │                                                "GENERATE NEURAL KEYS"
  │                                                     │
  │                                                     ▼
  │                                              [Hub: Neural Map]
  │                                                All modules available
  │                                                Nyx auto-prompts onboarding
  │                                                     │
  │                                                     ▼
  │                                              [Orchestrator: Onboarding]
  │                                                Quick form: name, pronouns, goals
  │                                                     │
  │                                                     ▼
  │                                              [Orchestrator: Chat with Nyx]
  │                                                Conversational refinement
  │                                                "Return to Hub" when ready
  │                                                     │
  │                                                     ▼
  │                                              [Hub: Neural Map]
  │                                                Core profile established
  │                                                Ready to explore modules
  │
  └─ "Recognize" (Login) ──→ [See 8.2 Returning User]
```

### 8.2 Returning User

```
[Landing Page]
  ▼
[Auth: LOGIN]
  │  email + password
  ▼
[Auth: VAULT_HANDSHAKE]
  │  Enter master password (1 field)
  │  "DECRYPT & SYNC"
  ▼
[Hub: Neural Map]
  │  Profile loaded, modules show prior state
  │  Stats bar reflects last-known NSV values
  ▼
  User clicks any module node → [Module Entry Flow: 8.4]
```

### 8.3 Guest User

```
[Landing Page] → [Auth: IDENTITY_CHOICE] → "Guest Link"
  ▼
[Hub: Neural Map]
  │  Guest mode:
  │  - Modules show "Trial" badges
  │  - Chat has message quota (e.g., 10 per module)
  │  - No vault encryption
  │  - Profile stored in localStorage
  │  - Quota exhausted → Auth modal prompts registration
  ▼
  Click module → [Module Entry Flow] (with isGuestTrial=true)
```

### 8.4 Module Entry (Generic Pattern)

```
[Hub] → Click module node
  ▼
[ProtectedRoute Check]
  ├─ Not authenticated → [Auth Modal] → retry
  ├─ Vault locked (not guest) → [Vault Lock Overlay] → "Initialize Handshake" → [Auth Modal: VAULT_HANDSHAKE]
  └─ OK → continue
  ▼
[Load Module Profile from Firestore]
  ├─ Profile exists + onboarding complete → [Module: Active Session]
  └─ No profile / onboarding incomplete → [Module: Onboarding]
  ▼
[Module: Onboarding] (Hybrid pattern)
  │  Phase 1: Quick form (2-4 fields)
  │  Phase 2: Submit → transition to chat
  │  Phase 3: AI acknowledges form data, asks deeper questions
  │  Phase 4: After 3-5 exchanges, AI signals completion
  │  → Profile saved (encrypted if not guest)
  ▼
[Module: Active Session]
  │  Chat + Dashboard (module-specific)
  │  Nerve endings visible, Nyx FAB accessible
  ▼
[Exit] → Back button → SyncTransition (3.2s) → [Hub]
```

### 8.5 Therapy (Agnes) Flow

```
[Hub] → Click Agnes node → [ProtectedRoute]
  ▼
[Therapy: Session Selection]
  ├─ "Impromptu Session" ────→ [Chat: Emergency Agent]
  │   (No encryption, no intake,     no profile needed)
  │   chat with basic Agnes persona
  │
  ├─ "New Session" ──────────┐
  │                           ▼
  │   ┌─ Onboarding done? ──┐
  │   │ No → [TherapyOnboarding]        │
  │   │   Step 1: Identity Anchor       │
  │   │   Step 2: Background            │
  │   │   Step 3: Current Struggles     │
  │   │   Step 4: Goals                 │
  │   │   Step 5: Therapist Preferences │
  │   │   → Save encrypted profile      │
  │   │ Yes → skip                      │
  │   └────────────────────────────────┘
  │                           ▼
  │                    [Therapy: Chat Session]
  │                      Agnes persona with full context
  │                      Shows <thought> blocks if enabled
  │
  └─ "Continue Session" ──→ [Therapy: Chat Session]
       (Resume prior messages)

[Therapy: Chat Session]
  │  Chat with Agnes + optional "End Session" button
  ▼
[End Session] → AI generates summary
  ▼
[Summary Modal]
  ├─ "Discard & Close" → discard history → [Therapy: Session Selection]
  └─ "Merge & Close" → save to module_memory → [Therapy: Session Selection]
  ▼
[Exit] → Back button → SyncTransition → [Hub]
```

### 8.6 Trainer (Titan) Flow

```
[Hub] → Click Titan node → [ProtectedRoute]
  ▼
[Trainer: Onboarding?]
  ├─ Not done → [TrainerOnboarding]
  │   Quick form: fitness level, goals, injuries
  │   → Chat refinement: Titan asks deeper questions
  │   → Save encrypted profile
  └─ Done → skip
  ▼
[Trainer: Active]
  ├─ TitanDashboard: CNS_FATIGUE, RESILIENCE, SLEEP, BIO_SYNC gauges
  ├─ TrainerRoutinePanel: personalized routines (lock if CNS critical)
  ├─ Chat with Titan: data-driven, references biometrics
  └─ Hormonal sync context (if female: cycle-aware programming)
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.7 Soma Flow (NEW)

```
[Hub] → Click Soma node → [ProtectedRoute]
  ▼
[Soma: Onboarding]
  │  Quick form: age, sex, known conditions, medications
  │  → Chat refinement: Soma asks about lab history, symptoms
  ▼
[Soma: Active]
  ├─ Lab Upload Zone: Drop PDF/CSV of blood work
  │   → Scanner animation (2s)
  │   → Diagnostic Parser extracts biomarkers
  │   → Confirmation card: "Parsed Insights" vs "Existing Ground Truth"
  │   → "Commit to Soul" button → Spine pulse (emerald) → updates NSV [B]
  │
  ├─ Biometric Vitality Grid: 12-16 metrics
  │   Optimal zone: emerald glow | Deficit zone: amber pulse | Critical: red
  │
  ├─ Clearance Panel:
  │   When Titan requests clearance for high-intensity training,
  │   Soma evaluates biomarkers → issues/denies clearance
  │   → Ghost UI proposal appears in Trainer with result
  │
  └─ Chat with Soma: clinical, conservative, evidence-based
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.8 Ledger Flow

```
[Hub] → Click Ledger node → [ProtectedRoute]
  ▼
[Ledger: Onboarding]
  │  Quick form: health concerns, medication tracking
  │  → Chat refinement
  ▼
[Ledger: Active]
  ├─ LedgerDashboard: Cross-functional synthesis
  │   Reads ALL NSV domains [B, E, C, R]
  │   Anomaly detection: emotional→physical correlations
  │   Neural gap flags: burnout, recovery deficit, integrity gaps
  │
  ├─ Chat with Ledger: CMO persona, synthesizes across modules
  │   Disclaimer: "AI ≠ doctor"
  │
  └─ Read-only: Ledger NEVER writes to NSV directly
      Instead flags concerns → Ghost UI proposals to relevant modules
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.9 Atlas Flow (NEW)

```
[Hub] → Click Atlas node → [ProtectedRoute]
  ▼
[Atlas: Onboarding]
  │  Quick form: work schedule type, energy complaint
  │  → Chat refinement: Atlas maps daily energy patterns
  ▼
[Atlas: Active]
  ├─ Energy Wave Visualizer:
  │   24h timeline showing predicted energy curve
  │   Peaks (sky glow) and troughs (dimmed)
  │   Current hour highlighted
  │
  ├─ Schedule Optimizer:
  │   Recommended task placement based on energy wave
  │   "Deep work" windows, "recovery" slots, "social" windows
  │
  ├─ Auto-Flatten Response:
  │   When Soma reports CNS fatigue or Agnes reports emotional crash,
  │   Atlas auto-flattens the energy schedule → Ghost UI proposal
  │
  └─ Chat with Atlas: analytical, maps energy to activities
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.10 Scout Flow (NEW)

```
[Hub] → Click Scout node → [ProtectedRoute]
  ▼
[Scout: Onboarding]
  │  Quick form: research interests, learning style
  │  → Chat refinement: Scout profiles knowledge preferences
  ▼
[Scout: Active]
  ├─ Knowledge Graph (future): visual map of explored topics
  │   Nodes = topics, edges = relationships
  │   Color-coded by domain
  │
  ├─ Research Panel:
  │   Recent queries, saved insights, fact-check results
  │   Source citations with confidence scores
  │
  ├─ Chat with Scout: research-oriented, cites sources
  │   Other modules can invoke Scout for fact-checking
  │   Results cached in RAG semantic memory
  │
  └─ Verify mode: "Is this claim true?" → structured analysis
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.11 Forge Flow (NEW)

```
[Hub] → Click Forge node → [ProtectedRoute]
  ▼
[Forge: Onboarding]
  │  Quick form: coding languages, IDE preference
  │  → Chat refinement: Forge profiles technical context
  ▼
[Forge: Active]
  ├─ Code Editor Panel (future: Monaco/CodeMirror):
  │   Read/write files via nyx-link daemon
  │   Syntax highlighting, file tree
  │
  ├─ Nyx-Link Status:
  │   Connection badge: "LINKED" (emerald) / "DISCONNECTED" (red)
  │   Local daemon: ws://localhost:PORT
  │   File access permissions display
  │
  ├─ Chat with Forge: coding agent, executes via nyx-link
  │   Output panel: stdout/stderr display
  │   Rose-themed code blocks
  │
  └─ Isolated: Forge runs in sandboxed context
      No direct access to other module data
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.12 Pulse Flow (NEW)

```
[Hub] → Click Pulse node → [ProtectedRoute]
  ▼
[Pulse: Onboarding]
  │  Quick form: top 3 interests, discovery preference
  │  → Chat refinement: Pulse maps interest landscape
  ▼
[Pulse: Active]
  ├─ Interest Map:
  │   Bubble chart of interests sized by engagement
  │   Fuchsia gradient intensity = recency
  │   Clickable: shows related content/trends
  │
  ├─ Trend Feed:
  │   Synthesized trends from user's interest domains
  │   Powered by Scout research
  │   "Save" / "Explore" / "Dismiss" actions per trend
  │
  └─ Chat with Pulse: curious, exploratory, makes connections
      Feeds topic interests to Scout for deeper research
  ▼
[Exit] → SyncTransition → [Hub]
```

### 8.13 Cross-Module Event Flow

```
Example: Soma commits new blood work showing iron deficiency

[Soma: "Commit to Soul"]
  │
  ▼  SpineEventBus.emit('nsv:update', { domain: 'B', field: 'ironLevel', value: 'LOW' })
  │
  ├─→ [Hub: Neural Map]
  │     Soma node flashes emerald
  │     Light dot travels Soma→Titan connection (emerald, 2s)
  │     Light dot travels Soma→Ledger connection (emerald, 2s)
  │     Light dot travels Soma→Atlas connection (emerald, 2s)
  │
  ├─→ [Trainer page] (if open)
  │     Nerve endings pulse emerald (400ms)
  │     Ghost UI slides in: "Soma flagged iron deficiency.
  │       Recommendation: Reduce HIIT intensity by 30%.
  │       [✓ Approve] [✗ Dismiss] [✎ Edit]"
  │
  ├─→ [Atlas page] (if open)
  │     Nerve endings pulse emerald
  │     Energy wave auto-flattens afternoon peak
  │     Ghost UI: "Energy curve adjusted for iron deficit.
  │       [✓ Approve] [✗ Dismiss]"
  │
  └─→ [Ledger]
        Anomaly synthesis updates
        Neural gap: "Iron deficit correlating with reported fatigue pattern"
        (No Ghost UI — Ledger is read-only, flags internally)
```

### 8.14 Ghost UI Flow

```
[SpineEventBus emits draft proposal]
  ▼
[Ghost UI Side Panel slides in from right]  (400ms ease-out)
  │  Dashed border in source module color
  │  Shimmer animation on border
  │  Content:
  │    Source badge: "From Soma" (emerald)
  │    Title: "Routine Intensity Reduction"
  │    Before: current values
  │    After:  proposed values
  │    Auto-dismiss progress bar (30s)
  ▼
[User Action]
  ├─ Approve (✓) → commit change to NSV → panel slides out
  │   Nerve endings pulse with confirmation color
  │   Toast: "Change committed" (200ms fade)
  │
  ├─ Dismiss (✗) → discard proposal → panel slides out
  │   No state change
  │
  └─ Edit (✎) → inline edit form appears
      User modifies values → Approve → commit modified change
```

### 8.15 Nyx Overlay Flow

```
[Any module page]
  │  Click [Consult Nyx ◉] FAB (bottom-right)
  ▼
[Nyx Overlay Panel] slides up (400ms spring)
  │  Violet-themed mini chat
  │  User types query: "What's my overall wellness trend?"
  ▼
[Nyx processes]
  │  Reads NSV across all domains
  │  May delegate to Scout for research
  │  May propose changes via Ghost UI
  ▼
[Response in overlay]
  │  Synthesized answer with data from multiple modules
  │  If action needed → Ghost UI panel opens alongside
  ▼
[Minimize] → click "−" → overlay collapses to FAB
[Navigate] → if Nyx suggests "Open Therapy" → user taps → navigate to /therapy
```

### 8.16 Session End & Exit Flow

```
[Module: Chat Session]
  │  Click "End Session" (or Back arrow)
  ▼
[If active chat exists]
  │  AI generates session summary
  ▼
[Summary Modal]
  │  Glass card with summary text
  │  Insights extracted, metrics noted
  ├─ "Discard & Close" → clear session → continue
  └─ "Merge & Close" → save to module_memory (encrypted) → continue
  ▼
[SyncTransition Overlay] (3.2s)
  │  "Soul Synchronization"
  │  Progress logs:
  │    "EXTRACTING_NEURAL_BREAKTHROUGHS..."
  │    "COMPRESSING_EMOTIONAL_GRAPH..."
  │    "ENCRYPTING_SESSION_ARTIFACTS..."
  │    "SYNCING_TO_GLOBAL_SOUL..."
  │    (8 messages × 400ms = 3.2s)
  │  Progress bar: 0% → 100%
  ▼
[Hub: Neural Map]
  │  Module node briefly glows with returning data
  │  Stats bar updates with new values
```

### 8.17 Vault Lock/Unlock Flow

```
[Locked State] (not guest, vault not unlocked)
  │  Module pages show glass overlay:
  │    Lock icon, "Vault Encrypted"
  │    "Initialize Handshake" button
  ▼
[Click "Initialize Handshake"]
  ▼
[Auth Modal: VAULT_HANDSHAKE]
  ├─ New vault: 2 password fields + "GENERATE NEURAL KEYS"
  └─ Existing: 1 password field + "DECRYPT & SYNC"
  ▼
[Vault unlocked]
  │  Master key derived (PBKDF2-SHA256)
  │  Module keys derived via getModuleKey()
  │  Status dot: amber → emerald
  │  E2EE badge: "E2EE_ACTIVE"
  ▼
[Persistence modes] (in SystemCommandCenter Settings):
  STRICT:  key cleared on page refresh
  SESSION: key survives refresh, cleared on tab close
  GRACE:   extended grace period
```

### 8.18 Settings & Destruction Flow

```
[SystemCommandCenter] (gear icon, top-right)
  ▼
[Dropdown Menu]
  ├─ Identity: email, connection status badge
  ├─ "System Prefs" → [Settings Submenu]
  │   ├─ Vault Persistence: STRICT / SESSION toggle
  │   └─ "Destroy Neural Soul" → [Purge Protocol]
  │       ├─ Confirmation 1: "This action is irreversible"
  │       ├─ Confirmation 2: Type "PURGE" to confirm
  │       └─ Execute: SoulTerminationService.terminateSoul()
  │           → Wipes ALL encrypted data from Firestore
  │           → Clears all localStorage
  │           → Redirects to Landing
  ├─ "Purge Local Key" → clears masterKeyRef (re-lock vault)
  └─ "Terminate Link" → logout → [Landing]
```

---

## 9. ANIMATION SYSTEM

### 9.1 Motion Principles

- **Never linear.** All motion uses easing curves.
- **Elastic for entrances**, smooth for exits.
- **Respect `prefers-reduced-motion`**: disable nerve pulses, simplify transitions to simple fades.

### 9.2 Easing Curves

| Name | Value | Usage |
|------|-------|-------|
| `ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page transitions, card entrances |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Micro-interactions |
| `spring` | `{ stiffness: 300, damping: 30 }` | Buttons, modals, interactive |
| `spring-gentle` | `{ stiffness: 200, damping: 25 }` | Panels, overlays |
| `breath` | `ease-in-out` | Idle pulses, nerve endings |

### 9.3 Duration Hierarchy

| Token | Duration | Usage |
|-------|----------|-------|
| `micro` | 150ms | Button hover/press, tooltip |
| `small` | 300ms | Card enter, modal, bubble |
| `medium` | 500ms | Page transition, panel slide |
| `large` | 800ms | Nerve pulse fade, dramatic entrance |
| `dramatic` | 1200ms | SyncTransition steps, first-load |

### 9.4 Transition Recipes

```
Page Enter:       { opacity: 0, y: 20 } → { opacity: 1, y: 0 }     500ms ease-out-quint
Page Exit:        SyncTransition overlay, 3200ms total
Modal Enter:      { scale: 0.9, opacity: 0 } → { scale: 1, opacity: 1 }  300ms spring
Modal Exit:       { scale: 0.95, opacity: 0 }  200ms ease-out
Ghost Panel In:   { x: 320 } → { x: 0 }  400ms ease-out
Ghost Panel Out:  { x: 0 } → { x: 320 }  300ms ease-in
Nyx Overlay In:   { y: '100%', opacity: 0 } → { y: 0, opacity: 1 }  400ms spring-gentle
Nyx Overlay Out:  { y: '100%', opacity: 0 }  300ms ease-out
Card Enter:       { opacity: 0, scale: 0.95 } → { opacity: 1, scale: 1 }  300ms ease-out
Button Hover:     scale 1.02  150ms spring
Button Press:     scale 0.98  150ms spring
Chat Bubble:      { opacity: 0, y: 10 } → { opacity: 1, y: 0 }  200ms, stagger 50ms
Hub Crossfade:    2D ↔ 3D opacity swap  500ms
```

### 9.5 Nerve Ending Animations

```
Idle Pulse:
  opacity: 0.10 → 0.20 → 0.10
  duration: 4s, infinite, ease-in-out
  Each nerve line staggered by 1.3s

Event Pulse:
  1. Light dot (4px circle, moduleColor at 80%) appears at top of line
  2. Dot travels top → bottom following line path (400ms, ease-out)
  3. As dot passes, line segment brightens to 0.6 opacity
  4. After dot reaches end, line fades back to 0.15 (800ms, ease-out)
  5. If alert: dot is red, line turns red, 3 rapid pulses (200ms each)

CSS Implementation:
  @keyframes nerve-pulse {
    0%, 100% { opacity: 0.10; }
    50% { opacity: 0.20; }
  }
  @keyframes nerve-event {
    0% { background-position: 0% 0%; opacity: 0.6; }
    100% { background-position: 0% 100%; opacity: 0.15; }
  }
```

### 9.6 Neural Map Animations

```
Node Idle:      scale 1.0 → 1.02, 3s infinite, each node staggered
Connection Dot: follows SVG path via <animateMotion>, 2s duration, 1s pause
Soul Orb:       conic-gradient rotation, 8s infinite linear
Data Flow:      source node flash → dot travels connection → target node receives pulse
```

### 9.7 Loading States

```
BootLoader:     Scanner line sweeps top→bottom (2s), text types 50ms/char
Skeleton:       Shimmer gradient sweep left→right (1.5s, infinite)
                background: linear-gradient(110deg, transparent 25%, white/5 50%, transparent 75%)
                background-size: 200% 100%
Spinner:        Module-colored ring rotation (1s, linear, infinite)
```

---

## 10. RESPONSIVE DESIGN

### 10.1 Breakpoints

| Name | Min Width | CSS |
|------|-----------|-----|
| Mobile | 0 | default |
| Tablet | 768px | `md:` |
| Desktop | 1024px | `lg:` |
| Wide | 1280px | `xl:` |

### 10.2 Component Adaptations

| Component | Mobile | Tablet | Desktop |
|-----------|--------|--------|---------|
| Hub | Card list | Compact map | Full neural map |
| Module workspace | Chat full, dash as tab | Chat + drawer | Split 60/40 |
| Ghost panel | Bottom sheet | Side panel 280px | Side panel 320px |
| Nyx overlay | Full screen | Panel 340px | Panel 380px |
| VitalsGrid | 2 columns | 3 columns | 4 columns |
| Auth modal | Full screen | Centered 480px | Centered 480px |

---

## 11. ACCESSIBILITY

- **Keyboard**: All interactive elements focusable, Tab order matches visual order
- **Focus rings**: `ring-2 ring-{module}-500/50 rounded`, visible on `:focus-visible`
- **Contrast**: All text meets WCAG AA (4.5:1 on `#020205` background)
- **Motion**: `@media (prefers-reduced-motion: reduce)` → disable nerve pulses, simplify to opacity-only transitions
- **Screen reader**: `aria-label` on all module nodes, `aria-live="polite"` on chat message container, `role="alert"` on Ghost UI proposals
- **Tooltips**: Visible on hover AND focus, 200ms delay, positioned to avoid viewport overflow

---

## 12. ONBOARDING PATTERN (Hybrid)

### 12.1 Quick Form Phase

Each module gets a GuidedIntakeFrame with 2-4 essential fields:

| Module | Fields |
|--------|--------|
| Nyx | name, pronouns, primary goal |
| Agnes | name, emotional state, therapy experience |
| Titan | fitness level, primary goal, injury history |
| Soma | age, sex, known conditions |
| Ledger | health concerns, medications |
| Atlas | work schedule type, energy complaint |
| Scout | research interests, learning style |
| Forge | coding languages, IDE preference |
| Pulse | top 3 interests, discovery mode |

```
Container:  GlassCard, module-themed border
Progress:   step indicators (1-3 dots), module color
Fields:     NeuralInput components, stacked
Submit:     NeuralButton primary, "Continue to {ModuleName}"
Animation:  Each step slides in from right (300ms)
```

### 12.2 Conversational Refinement Phase

```
Transition: Form fades out (200ms), chat fades in (300ms)
First msg:  AI acknowledges form data:
            "I see you're interested in {goal}. Tell me more about..."
Duration:   3-5 conversational exchanges
Completion: AI signals done → profile saved (encrypted) → onboardingComplete: true
Indicator:  Subtle progress badge: "Building your profile..." → "Profile complete ✓"
```

---

## 13. ICON MAPPING (Lucide React)

| Module | Icon | Lucide Name |
|--------|------|-------------|
| Nyx | Sparkles | `Sparkles` |
| Agnes | Brain | `Brain` |
| Titan | Dumbbell | `Dumbbell` |
| Soma | HeartPulse | `HeartPulse` |
| Ledger | ClipboardList | `ClipboardList` |
| Atlas | Zap | `Zap` |
| Scout | Search | `Search` |
| Forge | Code | `Code` |
| Pulse | Radio | `Radio` |
| Bridge | Bell | `Bell` |

---

## 14. DESIGN TOKENS SUMMARY

```css
/* Surfaces */
--void:         #020205;
--surface:      #05050a;
--card:         rgba(255,255,255,0.03);
--interactive:  rgba(255,255,255,0.06);
--overlay:      rgba(0,0,0,0.60);

/* Borders */
--border:       rgba(255,255,255,0.10);
--border-hover: rgba(255,255,255,0.15);

/* Text */
--text-primary:   rgba(255,255,255,0.95);
--text-secondary: rgba(255,255,255,0.60);
--text-muted:     rgba(255,255,255,0.40);

/* Radius */
--radius-sm:  8px;    /* rounded-lg */
--radius-md:  12px;   /* rounded-xl */
--radius-lg:  16px;   /* rounded-2xl */
--radius-xl:  32px;   /* rounded-[32px] */
--radius-full: 9999px; /* rounded-full */

/* Spacing */
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-6: 24px; --space-8: 32px;
--space-10: 40px; --space-12: 48px;

/* Motion */
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
--duration-micro: 150ms;
--duration-small: 300ms;
--duration-medium: 500ms;
--duration-large: 800ms;
```
