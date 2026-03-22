# Hub — Central Dashboard

> **ID**: `hub` | **Theme**: violet | **Core**: No | **Soul Priority**: — | **Security**: open

## Purpose
Hub is the user's command center — a single view showing the health and status of all active modules, recent activity across the platform, and quick access to any module. It aggregates NSV data for a holistic overview and provides three distinct visualization modes.

## NSV Ownership
- **Writes**: (none)
- **Reads**: Read-only access for aggregation and display from `GlobalProjection`

## Cross-Module Links
- Aggregates status and health from all active modules
- Provides quick-launch navigation to any module
- Displays NSV-derived holistic wellness overview via DailyBrief
- Listens to Spine events for real-time pulse animations

## Data Shape
No owned data — renders aggregated views from Global Soul (NSV snapshot, overall wellness score), module activity feeds, and module health indicators.

---

## View Modes

Hub provides **3 switchable view modes** with keyboard shortcuts (`1`, `2`, `3`):

### 1. Cards View (default)
Grid layout of module cards organized into two sections:
- **Soul Core Interface**: Core modules (Agnes, Titan, Soma, Ledger, Atlas)
- **Synaptic Plugins**: Extension modules (Forge, Scout)

Each `ModuleCard` displays:
- Module icon and title (with custom display name support)
- Description text
- Real-time stat with tone indicator (good/warn/bad/neutral)
- Lock status for inaccessible modules

### 2. Graph View
2D neural network visualization with:
- **Central Nexus**: Pulsing orbital button that opens Nexus chat
- **Node Cards**: Pentagon layout for core modules, orbiting plugins
- **Neural Edges**: Animated bezier curves connecting nodes to center
- **Edge Pulse**: Intensity driven by Spine event priority
- **Hover Tooltips**: Expanded info cards on hover

Responsive: On mobile (`<1024px`), nodes collapse to icon-only orbs.

### 3. 3D View (React Three Fiber)
Immersive 3D canvas with:
- **Floating Pods**: Interactive 3D models for each module
- **GLB Models**: WallE (Titan), Eve (Agnes), Atlas, Forge, Nexus
- **PolyPod Fallbacks**: Procedural geometry for Scout, Ledger
- **Star-topology Neural Flows**: Animated tube geometry connecting center to pods
- **Soul-reactive animations**: Models respond to NSV state (e.g., Eve jitters at low resilience, WallE droops at high fatigue)
- **Post-processing**: Bloom, Vignette effects
- **Graceful fallback**: Switches to Cards view on WebGL error

---

## DailyBrief Component

Wellness summary displayed at top of Cards view:

### Greeting
Time-based greeting using user's preferred name:
- "Good morning, {name}." (before 12pm)
- "Good afternoon, {name}." (12pm-5pm)
- "Good evening, {name}." (after 5pm)

### Pillar Cards
Four domain pillars derived from `DOMAIN_PILLARS` config:
| Pillar | Domain | NSV Source |
|--------|--------|------------|
| Body | biological | cnsFatigue, recoveryScore |
| Mind | cognitive | energyBudget |
| Heart | emotional | emotionalResilience |
| Flow | resource | resonanceROI, financialFriction |

Each pillar card shows:
- Icon and label
- Single-word state descriptor (e.g., "Rested", "Drained")
- Tone-colored indicator (emerald/amber/rose)
- Trend arrow (up/down/stable/unknown) from `useNsvTrends()`

### Brief Sentence
Auto-generated natural language summary from `generateBriefSentence()`.

### Cascade Alert Banner
(Planned) Displays recent cross-module coordination events.

---

## Hooks

### `useModules(): ModuleItem[]`
Returns ordered list of modules from `HUB_MODULE_ORDER` with metadata:
```ts
interface ModuleItem {
  id: string;
  title: string;
  icon: React.ComponentType;
  color: string;
  description: string;
  route: string;
  isPlugin: boolean;
}
```

### `useModuleStats(globalSoul, moduleAccess): Record<string, ModuleStat>`
Computes real-time stats per module from GlobalProjection:

| Module | Label | Source | Tone Logic |
|--------|-------|--------|------------|
| agnes | Resilience | emotional.emotionalResilience | higher = better |
| titan | CNS Fatigue | biological.cnsFatigue | lower = better (inverted) |
| soma | Readiness | biological.recoveryScore | ≥80% good, ≥60% warn |
| ledger | Resonance ROI | resource.resonanceROI | ≥0.8 good, ≥0.5 warn |
| atlas | Energy Budget | cognitive.energyBudget | higher = better |
| scout | Research Load | cognitive.researchLoad | always neutral |
| forge | Link | (static) | "LOCAL" when accessible |

### `useHubLayout(modules): { podLayout, spinePoints, orchestratorNodes }`
Computes spatial layouts for 3D and Graph views:
- **podLayout**: 3D positions for floating pods (pentagon + orbit)
- **spinePoints**: THREE.Vector3 array for spine loop
- **orchestratorNodes**: 2D positions with bezier path strings

---

## HubControls Components

### `HubViewSwitcher`
Tab-style view mode selector with:
- Icon buttons (LayoutList, Share2, Box)
- Keyboard shortcuts (1, 2, 3)
- ARIA tablist semantics
- Auto-hides 3D option on WebGL error

### `ReactiveGauge`
Animated metric display for bottom dashboard:
- Label with icon
- Numeric value with trend arrow
- Progress bar (hidden on mobile)
- Sync pulse animation on value change

### `HubBottomDashboard`
Persistent footer showing:
- **Locked state**: Module count + "Sync Now" button
- **Unlocked state**: NeuralIntegrity indicator
- **Gauges**: Wellness, Stability, Resilience scores

---

## 3D Models (GLB Assets)

| Model | Module | File | Soul-reactive |
|-------|--------|------|---------------|
| WallE | Titan | `/assets/models/walle.glb` | Droops at high cnsFatigue |
| Eve | Agnes | `/assets/models/eve.glb` | Jitters at low resilience |
| Ledger | Ledger | PolyPod fallback (icosa) | — |
| Atlas | Atlas | `/assets/models/atlas.glb` | Slow rotation |
| Forge | Forge | `/assets/models/forge.glb` | Slow rotation |
| Nexus | Center | `/assets/models/nexus.glb` | Central anchor |
| PolyPod | Scout | Procedural dodecahedron | Rotation only |

---

## File Structure
```
src/modules/hub/
├── HubPage.tsx                      # Main entry with 3 view modes
├── constants.ts                     # Types (StatusTone, ModuleItem, etc.)
├── hooks/
│   └── index.ts                     # useModules, useModuleStats, useHubLayout
└── components/
    ├── DailyBrief.tsx               # Daily wellness summary
    ├── DailyBrief.test.tsx          # Tests
    ├── HubControls.tsx              # ViewSwitcher, ReactiveGauge, BottomDashboard
    ├── cards/
    │   └── CardsView.tsx            # Card grid view + ModuleCard
    ├── graph/
    │   └── GraphView.tsx            # 2D graph visualization + NodeCard
    └── three/
        ├── ThreeDView.tsx           # 3D canvas (React Three Fiber)
        └── models/
            └── index.tsx            # WallE, Eve, Ledger, Atlas, Forge, Nexus, PolyPod
```

---

## Spine Event Integration

Hub listens to Spine events via `useSpineEvent('*', callback, { minPriority: 'alert' })`:
- **Edge Pulse**: Animates neural connections on alert/critical events
- **Decay**: Pulse intensity decays over 1.6 seconds
- **Priority Boost**: Critical events get 1.5x intensity, alerts get 1.2x

---

## Implementation Notes
- Display-only module — no agent personality, no actions, no onboarding
- View mode persisted to `localStorage` as `nexus-hub-view`
- WebGL errors gracefully fallback to Cards view
- Mobile responsive: bottom dashboard collapsible, 3D orbitals simplified
- Reduced motion support via `useReducedMotion()` hook
