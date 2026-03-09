# NEXUS / AGNES — UI/UX Conformance Analysis

> **Generated:** 2025-07  
> **Scope:** Full-product front-end audit against `NEXUS_PRODUCT_DEFINITION.md`, `BACKLOG.md`, and the design standards established in the codebase.  
> **Methodology:** Static source inspection of all module pages, core layout components, viz library, and shared design primitives.

---

## SECTION 1 — MODULE UI SCORECARD

Each module is scored across five axes:
- **Shell** — Correct layout shell (`ModuleLayout` / `UnifiedModulePage` / `SingleAgentLayout`)
- **Theme** — Per-module color is correct and consistent
- **AI Wire** — Chat panel connected to `useModuleAI`
- **Empty/Load** — Standardized empty and loading states
- **Completeness** — Workspace / dashboard pattern fully expressed

---

### 1.1 Agnes — Therapy *(indigo)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` → `ModuleLayout`; rails used |
| Theme      | ✅ | `themeColor="indigo"` in `UnifiedModulePage` via manifest |
| AI Wire    | ✅ | `useModuleAI` + `NexusChat`; session model (impromptu / new / continue) |
| Empty/Load | ✅ | `EmptyState` used in `AgnesDashboard`; session-start gating is clean |
| Completeness | ⚠️ | `AgnesDashboard` shows belief-graph data as a flat **list of cards**, not the specified 2D interactive graph (see §2) |

**Score: 4 / 5** — Strongest module design overall. Focus-mode immersion is excellent.

---

### 1.2 Atlas — Planning *(sky)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` → `SingleAgentLayout` |
| Theme      | ⚠️ | Manifest should declare `sky`; `SingleAgentLayout` hardcodes `themeColor="sky"` directly. This bypasses `ModuleLayout`'s glow layer which uses manifest color — causes a subtle mismatch between header glow and sidebar accent |
| AI Wire    | ✅ | `useModuleAI` + predictive state banner + Weekly Review |
| Empty/Load | ✅ | `EmptyState` used throughout |
| Completeness | ⚠️ | `QuickAddForm`, `TodaysPlanCard`, `FocusView`, and `ViewSwitcher` all **exist as files** but are **not imported or mounted** inside `EnhancedAtlasDashboard.tsx` (confirmed: only `TaskManager`, `GoalTracker`, `HabitBuilder`, `RoutineEditor`, `EnergyWaveChart`, `HabitTracker`, `GoalProgress`, `TaskTimeline`, `FieldsTab` are wired) |

**Score: 3.5 / 5** — Backend logic is strong; dashboard mount backlog is blocking full feature expression.

---

### 1.3 Titan — Physical *(orange)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` with left/right rail rendering |
| Theme      | ✅ | `orange` consistent throughout |
| AI Wire    | ❌ | **No `useModuleAI` in `TitanPage`**. Only `ScopedChatPanel` is mounted, which serves field-CRUD chat only — not the full sovereign coaching interface Titan's persona demands |
| Empty/Load | ❌ | History tab: `<div className="text-sm text-white/20 italic">No historical records found.</div>` — ad-hoc. Soma tab: custom placeholder. Neither uses `<EmptyState>` |
| Completeness | ⚠️ | Tab navigation is custom pill buttons — does not use `NeuralTabGroup`; tab panels have no `role="tabpanel"` or `aria-controls` (see §4) |

**Score: 2.5 / 5** — Most technically impressive component set but missing its AI voice and has the most accessibility debt.

---

### 1.4 Ledger — Financial *(cyan)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` → `SingleAgentLayout` |
| Theme      | ⚠️ | `themeColor="cyan"` in `SingleAgentLayout` while `ImageCaptureModal` inside it uses `themeColor="indigo"` — inconsistent within the same page |
| AI Wire    | ✅ | `useModuleAI` + CSV import + vision analysis pipeline |
| Empty/Load | ✅ | Loading and onboarding states handled |
| Completeness | ⚠️ | Still a 2-tab shell (Dashboard / Workspace); backlog requires 5-tab shell (Overview, Budget, Goals, Transactions, Fields). Missing: Debt & Savings Modeling, Tax Strategy, Cross-Verification panels |

**Score: 3.5 / 5** — Solid AI integration; shell restructuring is the primary gap.

---

### 1.5 Scout — Research *(lime)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` with `workspaceType="command"` |
| Theme      | ✅ | `lime` consistent |
| AI Wire    | ✅ | Multi-window research with independent `useModuleAI` sessions per window |
| Empty/Load | ✅ | Handled via window initialization |
| Completeness | ✅ | Dual-tab (Research Nodes / Telemetry); multi-window + evidence vault delegation. Best-in-class UX pattern |

**Score: 5 / 5** — Reference implementation for multi-session AI workspaces.

---

### 1.6 Forge — Execution *(rose/unknown)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `UnifiedModulePage` |
| Theme      | ❌ | `NexusChat` hardcodes `themeColor="cyan"` while the page header/code editor uses `rose-300` accents — **no clear canonical color** for Forge |
| AI Wire    | ✅ | `useModuleAI` + `NexusChat` full sidebar |
| Empty/Load | ✅ | Output area shows placeholder text |
| Completeness | ⚠️ | Still a "Coding Tool" with a code editor; backlog requires Life Admin pivot (email drafting, admin tasks). Blocker: the Nexus-Link Bridge is also unimplemented |

**Score: 3 / 5** — Functional but identity crisis: the visual language (rose for "danger/code") conflicts with the planned Life Admin pivot.

---

### 1.7 Hub — Navigation *(violet)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `ModuleLayout` directly; `hideBack=true` correct |
| Theme      | ✅ | `violet` |
| AI Wire    | N/A | Navigation layer — correct to have no AI |
| Empty/Load | ✅ | Spine pulse overlay, WebGL fallback to CARDS view |
| Completeness | ✅ | 3D / GRAPH / CARDS views; keyboard nav fallback in 3D mode |

**Score: 5 / 5** — Technically the most complex page; well-handled.

---

### 1.8 Orchestrator — Nexus *(indigo)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `ModuleLayout` directly |
| Theme      | ❌ | Uses `themeColor="indigo"` — **same as Agnes**. Design spec declares `cyan=nexus/orchestrator`. This creates visual identity collision between the emotional therapist and the sovereign orchestrator |
| AI Wire    | ✅ | `useModuleAI` + `NexusDashboard` |
| Empty/Load | ✅ | Guest mode, onboarding, dashboard states all handled |
| Completeness | ⚠️ | `orchestrator-conflict-ui.md` specifies a Chat Conflict Bar, Action Intercept modal, and Module Consensus mini-flow — none are implemented |

**Score: 3 / 5** — Core AI function works; missing conflict resolution UX and wrong theme color.

---

### 1.9 Documents *(unknown/slate)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `ModuleLayout` with `VaultLockedShell` guard |
| Theme      | ⚠️ | No theme color could be confirmed from the partial file read — `ModuleLayout` is invoked but the `themeColor` prop value needs verification |
| AI Wire    | ✅ | `useModuleAI` + `NexusChat` + document parsing pipeline |
| Empty/Load | ✅ | Notebook and document list have empty checks |
| Completeness | ⚠️ | Multi-tab (chat / notebook / documents) but **not wired as a shared service library** — modules use `NexusHandoffService` delegate pattern to navigate here, which is a page change not an in-context overlay |

**Score: 3.5 / 5** — Functional but Document Intelligence as a shared library (backlog item) is unimplemented.

---

### 1.10 Profile *(violet)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ✅ | `ModuleLayout` |
| Theme      | ✅ | `violet` |
| AI Wire    | N/A | Informational page — correct |
| Empty/Load | ✅ | `loading` state with "SYNCING..." badge |
| Completeness | ⚠️ | Read-only identity surface; no edit capability for pronouns/occupation/name; no avatar; no privacy controls |

**Score: 3.5 / 5** — Sufficient for current scope but thin for a product identity surface.

---

### 1.11 Soma *(emerald — CRITICAL GAP)*

| Axis       | Status | Notes |
|------------|--------|-------|
| Shell      | ❌ | **No `SomaPage.tsx` exists.** The soma module directory contains full component infrastructure (`BiomarkerDashboard`, `ClearancePanel`, `ClearanceStatus`, `SomaDashboard`, `PhysicalAssessmentForm`, etc.) but has no routing entry point |
| Theme      | ❌ | Unresolvable without a page |
| AI Wire    | ❌ | `CollapsibleAIPanel.tsx` exists in soma/components but is not connected to `useModuleAI` |
| Empty/Load | ❌ | No page to host them |
| Completeness | ❌ | `TitanPage` soma tab renders a placeholder card with a `navigate('/soma')` button that leads nowhere |

**Score: 0 / 5** — **Phantom module. All components are orphaned.** This is the single most impactful gap in the application.

---

## SECTION 2 — MISSING UI COMPONENTS

The following items appear in `BACKLOG.md` or design documents and have either zero implementation or only partial stubs.

### 2.1 Belief Graph — 2D Interactive Visualization
**Status: DATA MODEL EXISTS, VISUALIZATION MISSING**

- `belief-graph-service.ts` ✅ — Full `BeliefNode` / `BeliefEdge` / `BeliefGraph` data model
- `AgnesDashboard.tsx` renders `graph.nodes.slice(0, 6)` as **flat `<div>` cards with label + intensity/10** — no spatial layout, no edge rendering, no D3/SVG graph
- The `hasBeliefGraph` flag and summary text are present but treated as a metric, not a visualization

**What's needed:** A `<BeliefGraphCanvas>` component using SVG + Framer Motion (or D3 force-directed layout) to render nodes as circles with valence-coded color (indigo=positive, rose=negative, white=neutral) and edges as curved lines with relation labels.

---

### 2.2 SomaPage — Route Entry Point
**Status: MISSING**

- Route `/soma` has no corresponding page component
- All soma UI components (`BiomarkerDashboard`, `BiomarkerCharts`, `ClearancePanel`, `ClearanceStatus`, `SomaDashboard`, `SomaViewSwitcher`, `VitalsEntryForm`, `PhysicalAssessmentForm`, `BiometricHistory`, `CollapsibleAIPanel`) are stranded without a page host
- `TitanPage` soma tab navigates to `/soma` which will 404

---

### 2.3 Chat Conflict Bar (Orchestrator)
**Status: DESIGNED, NOT BUILT**

- `orchestrator-conflict-ui.md` provides full wireframe specification
- `ConflictResolutionOverlay.tsx` exists in core components — need to verify if it implements the conflict bar pattern
- The inline conflict bar (between user message and assistant reply), action intercept confirmation modal, and module consensus mini-flow are unimplemented

---

### 2.4 PAR-Q Medical Clearance Questionnaire
**Status: CLEARANCE DISPLAY EXISTS, INTAKE FORM MISSING**

- `ClearancePanel.tsx` and `ClearanceStatus.tsx` show clearance state with visual indicators ✅
- The **PAR-Q self-assessment questionnaire** (the intake form that generates clearance records) does not exist
- Without the questionnaire, the clearance system is display-only — users cannot submit new clearance data through the UI

---

### 2.5 Scoped Conversations (Cross-Module)
**Status: PARTIAL — TITAN ONLY**

- `ScopedChatPanel.tsx` exists in `field-management` and is mounted in TitanPage
- The backlog item requires **ephemeral, entity-specific chat modes across all modules** to reduce context noise
- Currently only Titan has a scoped chat panel; Agnes, Atlas, Ledger, Scout use full persistent sessions

---

### 2.6 Soma Agent AI Connection
**Status: MISSING**

- `CollapsibleAIPanel.tsx` in soma/components exists but no connection to `useModuleAI`
- The Soma Agent persona needs to be defined and wired to the panel
- The Soma service layer (`Soma Service Layer` backlog item) is pending

---

### 2.7 Energy Wave Task Overlay
**Status: BASE CHART EXISTS, OVERLAY MISSING**

- `EnergyWaveChart.tsx` renders energy/focus/load SVG paths with a flattened-period indicator ✅
- The backlog enhancement "Overlay scheduled tasks and recovery windows on the energy wave chart" is not implemented
- Scheduled tasks from `AtlasProfile.scheduledTasks` exist as data but are not rendered onto the chart

---

### 2.8 NeuralDraftPanel — Global Mount
**Status: COMPONENT EXISTS, NOT GLOBALLY MOUNTED**

- `NeuralDraftPanel.tsx` is complete — listens to `DRAFT_PROPOSED` Spine events, renders approval flow with cyan glassmorphism styling, emits `DRAFT_APPROVED` / `DRAFT_DISMISSED`
- Not observed mounted in `App.tsx` or any layout shell — the Ghost UI approval flow cannot activate
- Should be added to `App.tsx` or the root `ModuleLayout` as a global overlay

---

## SECTION 3 — DESIGN INCONSISTENCIES

### 3.1 Theme Color Collision: Agnes vs Orchestrator (CRITICAL)

| Module | Assigned | Used |
|--------|----------|------|
| Agnes | indigo | ✅ indigo |
| Orchestrator/Nexus | **cyan** (per spec) | ❌ **indigo** |

Both Agnes and Orchestrator resolve to `themeColor="indigo"` in `ModuleLayout`. The design standard specifies `cyan=nexus/orchestrator`. This means the header glow, security shield accent, and telemetry ticker are visually identical between the emotional therapist and the sovereign orchestrator — undermining the per-module identity model.

**Fix:** Change `OrchestratorPage`'s `ModuleLayout` to `themeColor="cyan"`.

---

### 3.2 Forge Has No Canonical Color

Forge's `NexusChat` hardcodes `themeColor="cyan"` but the page uses `rose-300` accents for the code editor. The `UnifiedModulePage` will derive its `themeColor` from `MODULE_MANIFEST` — but the `NexusChat` override bypasses this. 

**Fix:** Remove the hardcoded `themeColor="cyan"` from `ForgeContent`'s `NexusChat` and use the module manifest color (likely `rose`).

---

### 3.3 ImageCaptureModal Color Mismatch in Ledger

```tsx
// LedgerPage.tsx
<ImageCaptureModal themeColor="indigo" ... />
```
The Ledger page is themed `cyan` but its `ImageCaptureModal` uses `indigo`. Every contextual modal should inherit the host module's theme color.

---

### 3.4 TitanPage Uses Custom Tab Buttons Instead of NeuralTabGroup

`TitanPage.tsx` renders tab navigation as manual `<button>` elements with handcrafted `cn()` conditionals, duplicating the exact pattern that `NeuralTabGroup` was built to encapsulate. The custom implementation also lacks the spring-animated active pill (`motion.div layoutId`) that `NeuralTabGroup` provides.

---

### 3.5 NeuralButton Primary Is Always Indigo

```tsx
// NeuralButton.tsx
primary: 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] ...'
```

The primary `NeuralButton` variant is always indigo, regardless of which module it's rendered in. In Titan (orange), Scout (lime), Forge (rose), the primary CTA button visually belongs to Agnes/Orchestrator rather than its host module. This breaks the per-module identity model at the most interaction-heavy component level.

**Fix:** Accept an optional `accentColor` prop (or read from a theme context) to override the primary variant's base color.

---

### 3.6 SingleAgentLayout Bypasses ModuleLayout Theme

When `SingleAgentLayout` is used (Atlas, Ledger), the sidebar theme classes are set directly from a prop (`themeColor="sky"`, `themeColor="cyan"`). Meanwhile, `ModuleLayout` also receives a `themeColor` via `UnifiedModulePage → manifest.themeColor`. If these two values diverge, the header glow and the chat sidebar accent are different colors on the same page. Atlas is a confirmed case: `ModuleLayout` glow and `SingleAgentLayout` sidebar may use different sky/cyan values.

---

### 3.7 GlassCard `glowColor` Is Hardcoded Indigo

```tsx
// GlassCard.tsx
glowColor = 'rgba(99,102,241,0.2)'  // always indigo
```

Any module using `GlassCard` with `glow={true}` will always glow indigo. This should accept a `themeColor` token or hex value.

---

### 3.8 EnergyWaveChart Has No Empty State

`EnergyWaveChart` with `points=[]` renders an empty SVG container with no visual indicator. It should render an `<EmptyState>` when `points.length === 0`.

---

## SECTION 4 — ACCESSIBILITY ISSUES

### 4.1 TitanPage Tab Panels — Missing ARIA Association (WCAG 4.1.2)

**Location:** `TitanPage.tsx`, lines 125–224

The custom tab navigation renders:
```tsx
<button key={tab.id} onClick={() => setActiveTab(tab.id)} ...>
```
```tsx
<div className="min-h-[400px]">
  {activeTab === 'dashboard' && <...>}
  {activeTab === 'routines' && <...>}
  ...
</div>
```

**Issues:**
- Tab buttons have no `role="tab"`, `aria-selected`, `aria-controls`, or `id` attributes
- The panel container `<div>` has no `role="tabpanel"`, `aria-labelledby`, or `id`
- Screen readers cannot associate buttons with their revealed content
- `NeuralTabGroup` solves this correctly but is not used here

**Remediation:**
```tsx
<button
  role="tab"
  id={`titan-tab-${tab.id}`}
  aria-selected={activeTab === tab.id}
  aria-controls={`titan-panel-${tab.id}`}
  ...
>
// Panel:
<div
  role="tabpanel"
  id={`titan-panel-${activeTab}`}
  aria-labelledby={`titan-tab-${activeTab}`}
>
```

---

### 4.2 BarChart Y-Axis — Potential Duplicate Tick Values (WCAG 1.4.1)

**Location:** `src/core/components/viz/BarChart.tsx`, lines 289–307

```tsx
{[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
  const value = (maxValue * fraction).toFixed(0);
  return <text ...>{value}</text>;
})}
```

When `maxValue ≤ 3`, rounding produces duplicate labels. E.g., `maxValue = 3`:
- 0.75 × 3 = 2.25 → `"2"`
- 0.5 × 3 = 1.5 → `"2"` ← duplicate

This misleads users about the data scale. Y-axis ticks should be deduped and use `Math.ceil` smart-stepping.

---

### 4.3 BarChart SVG Aria Labels Are Generic

Both orientations use:
```tsx
aria-label="Vertical bar chart"  // or "Horizontal bar chart"
```

These labels are identical for all chart instances on a page. Screen reader users cannot distinguish between a bar chart showing sleep quality vs CNS fatigue. The `aria-label` should accept a meaningful description prop.

---

### 4.4 NeuralDraftPanel — Approve/Edit Buttons Lack Visible Focus Ring

**Location:** `NeuralDraftPanel.tsx`, lines 104–116

The Approve and Edit buttons use custom `className` styling without `focus-visible:ring-*` classes. Keyboard users cannot visibly identify which button is focused.

---

### 4.5 Agnes Session Cards — Non-Descriptive Interactive Buttons (WCAG 2.4.6)

**Location:** `AgnesPage.tsx` session-selecting state

Session trigger cards are `<motion.button>` elements. The "Locked" variant is a `<div>` (not a button) and is non-interactive, but the "New Session" and "Impromptu" cards don't have explicit `aria-label` describing their distinct purpose. Relying on visible text inside a button is acceptable **only if** the text is consistently readable — the `opacity-0 group-hover:opacity-100` reveal pattern on the "Initialize →" text means it's invisible by default and screen readers may encounter it as `aria-hidden`.

---

### 4.6 SurfaceCard and GlassCard — No Semantic Role

Custom card primitives are `<div>` elements with no role. When used as interactive containers (clickable areas in Hub's GRAPH view, Scout research windows), they should use `role="button"` or `role="article"` depending on context.

---

### 4.7 TelemetryTicker Reads Aloud (WCAG 1.3.1)

**Location:** `ModuleLayout.tsx`, `TelemetryTicker` component

The ticker cycles through cryptic strings (`"0x772_PING_SENT..."`, `"BIOMETRIC_UDP_STREAM"`) with no `aria-hidden="true"`. Screen readers will announce these strings every 3 seconds during page interaction, causing severe cognitive disruption.

**Fix:** Add `aria-hidden="true"` to the ticker container.

---

### 4.8 NeuralTabGroup Tabs — Role Mismatch (WCAG 4.1.2)

`NeuralTabGroup` wraps buttons in a `<nav role="tablist">`. A `<nav>` landmark is incorrect for a tablist — it should be a plain `<div role="tablist">`. Screen readers that understand landmarks will expose this as a navigation region, not a tab widget, leading to incorrect navigation announcements.

---

## SECTION 5 — AI INTEGRATION GAPS

### 5.1 Titan — No Module AI (HIGH IMPACT)

| What exists | What's missing |
|-------------|----------------|
| `ScopedChatPanel` (field management CRUD only) | Full `useModuleAI` session with Titan's coaching persona |
| `TitanDiagnosisPanel` (image analysis modal) | Persistent conversational coaching interface |
| Spine event listeners (`REDUCE_TRAINING_LOAD`) | AI-generated workout recommendations in-context |

Titan is described in the product definition as "The Sovereign Module" — it should have the most capable physical coaching AI of any module. The absence of a primary AI interface is the largest AI integration gap.

---

### 5.2 Soma — No AI Wiring

`CollapsibleAIPanel.tsx` exists in `soma/components` but is not connected to `useModuleAI`. The planned Soma Agent (specialized for clinical reasoning and lab parsing) has no UI manifestation.

---

### 5.3 Profile — AI Absent (Acceptable)

ProfilePage intentionally has no AI — the page is informational. This is correct.

---

### 5.4 Documents — AI Present but Isolated

Documents has `useModuleAI` wired but it functions as a standalone workspace. The backlog item "Documents as a shared library" — where Ledger, Soma, Atlas can invoke document intelligence without leaving their module — is not implemented. The current pattern requires a full page navigation (`navigate('/documents')`), breaking the user's context.

---

### 5.5 NeuralDraftPanel — Ghost UI Flow Inactive

The Ghost UI / NeuralDrafts system (`NeuralDraftPanel.tsx`) is complete but because it is not mounted globally, no module can surface AI-proposed actions through the dashed-border approval flow. All AI actions currently execute immediately or are described in chat text — there is no visual "draft pending approval" state for destructive or cross-module actions.

---

## SECTION 6 — COMPONENT REUSE VIOLATIONS

### 6.1 Ad-Hoc Empty States in TitanPage

```tsx
// TitanPage.tsx, History tab
<div className="text-sm text-white/20 italic">No historical records found.</div>

// TitanPage.tsx, Soma tab (entire section is a custom empty state)
<div className="bg-black/40 border border-white/5 rounded-3xl p-12 flex flex-col items-center ...">
  <div className="w-20 h-20 ..."><Stethoscope size={40} /></div>
  ...
</div>
```

Both should use `<EmptyState title="..." description="..." icon={...} action={...} />`. The standardized `EmptyState` component exists, is tested, and supports `size`, `action`, and custom `icon` props that cover both cases.

**Modules with non-standard empty states:** Titan (2 instances), Documents (partial), Profile (loading state uses inline skeleton pattern not `<EmptyState>`).

---

### 6.2 `formatRelativeTime` Defined Twice

```
src/modules/soma/components/ClearancePanel.tsx     — lines 24-42
src/modules/soma/components/ClearanceStatus.tsx    — lines 42-58
```

Identical function defined in both files within the same module. Should be extracted to `src/modules/soma/utils.ts` (Titan has this pattern right with `utils.ts`).

---

### 6.3 Custom Tab Buttons in TitanPage vs NeuralTabGroup

`TitanPage.tsx` implements custom pill-style tab buttons with manual `cn()` active state logic — the exact pattern `NeuralTabGroup` was built to abstract. This means:
- No animated sliding active pill (the `layoutId` spring animation)
- No keyboard navigation (Arrow keys, Home, End)
- No `role="tab"` / `aria-selected` (see §4)
- Maintenance divergence from the design system

---

### 6.4 Tab-Content Pattern Divergence

Two different patterns exist for multi-tab content layout:

**Pattern A (NeuralTabGroup):** Used by Ledger, Scout, Atlas, Agnes  
```tsx
<NeuralTabGroup tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} themeColor="..." />
{activeTab === 'x' && <ComponentX />}
```

**Pattern B (Custom):** Used by Titan, Documents  
```tsx
{TABS.map(tab => <button onClick={() => setActiveTab(tab.id)}>)}
{activeTab === 'x' && <ComponentX />}
```

All modules should use Pattern A.

---

### 6.5 Currency/Number Formatting — No Unified Utility

The backlog notes: *"Standardize number/currency formatting across all financial views using a unified utility."*

In `LedgerPage.tsx`:
```tsx
<p>${visionReviewData.monthlyIncome.toLocaleString()}</p>
```

In `TitanPage.tsx`:
```tsx
<div className="text-xs font-black text-orange-400">{s.totalVolume || 0} KG</div>
```

In `SomaDashboard.tsx` various vitals are formatted inline. No `formatCurrency()` / `formatUnit()` utility exists in `src/lib/utils.ts`.

---

### 6.6 Conditional Hook Warning — TitanPage Greeting Logic

The backlog explicitly flags: *"Resolve conditional hook behavior in TitanPage.tsx greeting logic."*

`TitanPage.tsx` calls `getModuleKey('titan').then(setEncryptionKey)` inside `useEffect` but accesses `agentAlias` from `globalSoul` before the profile loads — the greeting logic (currently just a `console.log`) was noted as a conditional hook risk in the backlog. While no explicit `if (condition) useHook()` violation was found in the current snapshot, the pattern of deriving `agentAlias` via type assertion (`(globalSoul as any)?.personality?.moduleAliases?.titan`) is brittle and should use the same `globalSoul?.displayNames?.titan` pattern all other modules use.

---

## SECTION 7 — PRIORITY RECOMMENDATIONS

Ordered by user impact (highest first).

---

### P0 — CRITICAL: Create SomaPage.tsx

**Impact:** Routes to `/soma` currently have no destination. The "Switch to Soma →" CTA in TitanPage leads to a 404. All of Soma's UI components are orphaned.

**Action:** Create `/src/modules/soma/SomaPage.tsx` using `UnifiedModulePage` with `workspaceType="lab"`. Wire `SomaDashboard` as `renderDashboard` and `CollapsibleAIPanel` as `renderContent`. Register the `/soma` route in `App.tsx`. Apply `themeColor="emerald"` to distinguish from Titan's orange.

**Effort:** Medium (components already exist; needs page shell + routing + `useModuleAI` wiring)

---

### P0 — CRITICAL: Mount NeuralDraftPanel Globally

**Impact:** The entire Ghost UI / approval flow system cannot function without this. Destructive AI actions (delete goal, modify medical clearance, financial plan override) are currently unguarded at the UI layer.

**Action:** Add `<NeuralDraftPanel />` to `App.tsx` (or to the root layout shell) as a fixed overlay. Ensure it renders above `z-[100]`.

**Effort:** Low (component is complete; one line in App.tsx)

---

### P1 — HIGH: Fix Orchestrator Theme Color

**Impact:** Orchestrator (`indigo`) is visually identical to Agnes (`indigo`). The sovereign orchestrator of the ecosystem should be immediately recognizable as distinct.

**Action:** Change `OrchestratorPage` both `<ModuleLayout>` instances from `themeColor="indigo"` to `themeColor="cyan"`. Update `MODULE_MANIFEST` entry for orchestrator accordingly.

**Effort:** Low (2 string changes)

---

### P1 — HIGH: Add Full AI Interface to Titan

**Impact:** Titan is the "Sovereign Module" with the highest data density. The absence of a primary coaching AI means users cannot get real-time guidance on their physical data through conversation.

**Action:** Add `useModuleAI` with `TITAN_PERSONA` to `TitanPage`. Mount a collapsed/expandable `NexusChat` sidebar using `SingleAgentLayout` (identical pattern to Atlas/Ledger). The existing `ScopedChatPanel` can remain for field management.

**Effort:** Medium

---

### P1 — HIGH: Fix TitanPage Tab Accessibility

**Impact:** Direct WCAG 4.1.2 violation. Tab navigation is the primary navigation mechanism in Titan (9 tabs covering all physical domains). Keyboard-only users and screen reader users cannot navigate the module.

**Action:** Replace custom tab buttons with `NeuralTabGroup`. Add `role="tabpanel"`, `id`, and `aria-labelledby` to each tab panel `<div>`.

**Effort:** Low-Medium

---

### P2 — MEDIUM: Wire QuickAddForm, TodaysPlanCard, FocusView, ViewSwitcher into Atlas

**Impact:** These components exist and are ready — they are simply not imported or rendered in `EnhancedAtlasDashboard.tsx`. Users miss the Quick-Add FAB, the Today's Plan summary card, focus mode, and the view switcher.

**Action:** Import and mount these components in `EnhancedAtlasDashboard.tsx`. `QuickAddForm` should be a floating FAB in the dashboard tab. `TodaysPlanCard` should appear at the top of the dashboard. `FocusView` and `ViewSwitcher` should be accessible from the header area.

**Effort:** Low (components are complete)

---

### P2 — MEDIUM: Implement Belief Graph Visualization

**Impact:** The data model and service are complete. The flat list in `AgnesDashboard.tsx` gives no insight into belief relationships (edges). The visualization was listed in the product definition as a key Agnes differentiator.

**Action:** Create `<BeliefGraphCanvas>` using SVG force-directed layout (or a lightweight D3 integration). Nodes: circles sized by `intensity`, colored by `valence`. Edges: curved paths labeled with `relation`. Mount inside `AgnesDashboard.tsx` replacing the list.

**Effort:** High (requires force-directed layout logic)

---

### P2 — MEDIUM: Fix BarChart Y-Axis Tick Deduplication

**Action:** Replace the fixed 5-fraction tick array with smart-step logic:
```tsx
const tickCount = 5;
const step = Math.ceil(maxValue / (tickCount - 1));
const ticks = Array.from({ length: tickCount }, (_, i) => i * step).filter(v => v <= maxValue);
const uniqueTicks = [...new Set(ticks)];
```
Also pass a meaningful `aria-label` prop.

**Effort:** Low

---

### P2 — MEDIUM: Add aria-hidden to TelemetryTicker

**Action:** Add `aria-hidden="true"` to the `<div>` wrapper in `TelemetryTicker`. One attribute prevents severe screen reader disruption.

**Effort:** Trivial

---

### P3 — LOW: Standardize EmptyState Usage in Titan

**Action:** Replace the 2 ad-hoc empty-state `<div>`s in TitanPage history and soma tabs with `<EmptyState>` component calls.

**Effort:** Trivial

---

### P3 — LOW: Extract `formatRelativeTime` in Soma

**Action:** Create `src/modules/soma/utils.ts`, export `formatRelativeTime`, import in both `ClearancePanel.tsx` and `ClearanceStatus.tsx`.

**Effort:** Trivial

---

### P3 — LOW: Fix NeuralButton Primary Color to Accept Theme

**Action:** Add optional `accentColor?: string` prop to `NeuralButton`. When provided, use it instead of the hardcoded `indigo-600` for the `primary` variant. All existing call sites default to indigo with no change required.

**Effort:** Low

---

### P3 — LOW: Fix NeuralTabGroup nav → div

**Action:** Change `<nav role="tablist"` to `<div role="tablist"` in `NeuralTabGroup.tsx`. A tablist is not a navigation landmark.

**Effort:** Trivial

---

## Summary Table

| ID | Issue | Module(s) | Severity | Effort |
|----|-------|-----------|----------|--------|
| P0-1 | SomaPage.tsx missing — all soma components orphaned | Soma | 🔴 Critical | Medium |
| P0-2 | NeuralDraftPanel not globally mounted | All | 🔴 Critical | Low |
| P1-1 | Orchestrator uses indigo, collides with Agnes | Orchestrator | 🟠 High | Low |
| P1-2 | Titan has no full AI coaching interface | Titan | 🟠 High | Medium |
| P1-3 | TitanPage tab ARIA violations (WCAG 4.1.2) | Titan | 🟠 High | Low-Med |
| P2-1 | QuickAddForm / TodaysPlanCard / FocusView / ViewSwitcher unmounted | Atlas | 🟡 Medium | Low |
| P2-2 | Belief Graph renders as list, not interactive graph | Agnes | 🟡 Medium | High |
| P2-3 | BarChart Y-axis duplicate ticks + generic aria-label | Soma/Viz | 🟡 Medium | Low |
| P2-4 | TelemetryTicker not aria-hidden | All Modules | 🟡 Medium | Trivial |
| P2-5 | ImageCaptureModal wrong themeColor in Ledger | Ledger | 🟡 Medium | Trivial |
| P2-6 | NexusChat hardcoded themeColor="cyan" in Forge | Forge | 🟡 Medium | Low |
| P2-7 | PAR-Q intake questionnaire missing in Soma | Soma | 🟡 Medium | High |
| P3-1 | Ad-hoc empty states in TitanPage (2 instances) | Titan | 🟢 Low | Trivial |
| P3-2 | formatRelativeTime defined twice in soma | Soma | 🟢 Low | Trivial |
| P3-3 | NeuralButton primary always indigo | All | 🟢 Low | Low |
| P3-4 | NeuralTabGroup uses `<nav>` instead of `<div>` | All | 🟢 Low | Trivial |
| P3-5 | Currency/number formatting not unified | Ledger/Titan | 🟢 Low | Low |
| P3-6 | GlassCard glowColor hardcoded indigo | All | 🟢 Low | Low |
| P3-7 | EnergyWaveChart has no empty state | Atlas | 🟢 Low | Trivial |
| P3-8 | Ledger shell needs 5-tab refactor | Ledger | 🟢 Low | High |

---

*End of conformance analysis.*
