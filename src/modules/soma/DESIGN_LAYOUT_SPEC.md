# Soma Biological Authority — Design & Layout Specification

Complete design instructions, layout rules, component customization, responsive behavior, data-structure linkage, events, and agent integration for the Soma module. This document is the single source of truth for visual and structural implementation.

---

## 1. Overview

- **Module ID:** `soma`
- **Route:** `/soma`
- **Layout:** `SingleAgentLayout` (main content + optional agent sidebar; mobile = overlay chat)
- **Theme accent:** Emerald (`themeColor="emerald"`, `--soma: #10b981`)
- **Purpose:** Biological authority domain — biomarkers, vitals, physical assessments, medical profile (conditions, medications, allergies), clearances, lab import/diagnosis, and readiness scoring. Wired to Soma agent and `SomaProfile` (E2EE in `soma_profiles`).

---

## 2. Design Tokens

All spacing, typography, and layout in Soma MUST use the following. Prefer CSS custom properties where defined; otherwise use the Tailwind equivalents below. Soma currently uses `--soma` in `src/index.css`; extend with token set for consistency.

### 2.1 Spacing

| Token | Value / Tailwind | Usage |
|-------|------------------|--------|
| **Page horizontal** | `px-4` → `md:px-8` | Horizontal padding of page (header, tab strip, tab panel). Use for all full-width content. |
| **Page vertical (top)** | `pt-6` → `md:pt-6` | Header top padding. |
| **Section gap** | `space-y-6` | Gap between major sections (dashboard cards, tab panel blocks). |
| **Block gap** | `gap-4` / `space-y-4` | Gap within a section (e.g. stat grid, clearance list). |
| **Touch target** | `min-h-[44px]` (2.75rem) | Minimum touch target for chips, tab buttons, primary actions. |
| **Card inner** | `p-6` or `p-4` → `md:p-6` | SurfaceCard padding for dashboard blocks. |

**Rule:** Use `px-4 md:px-8` for page-level horizontal alignment. Use `space-y-6` for vertical rhythm in tab content.

### 2.2 Typography

| Role | Tailwind | Usage |
|------|----------|--------|
| **Page title** | `text-2xl font-bold tracking-tight font-display text-white` | "Soma" hero in header. |
| **Subtitle** | `text-sm text-white/60` | "Physical readiness & biometric tracking". |
| **Section title** | `text-xl` → `text-2xl font-bold tracking-tight font-display text-white` | Card titles (Physical Readiness, Medical Profile, etc.). |
| **Section subtitle** | `text-sm text-white/60` | Card subtitles (e.g. "Soma readiness score"). |
| **Label (small caps)** | `text-xs font-semibold text-white/50 uppercase tracking-wider` | Panel labels, stat labels, metadata. |
| **Body** | `text-sm text-white/80` or `text-white/70` | List items, summaries. |
| **Caption / meta** | `text-xs text-white/40` or `text-white/30` | Dates, units, empty-state hints. |

**Rule:** Subtitle and body MUST use at least `text-white/60` for accessibility. Do not use `text-white/40` or lower for primary body copy.

### 2.3 Radii & Surfaces

| Token | Tailwind | Usage |
|-------|----------|--------|
| **Card** | `rounded-xl`, `rounded-2xl` | SurfaceCard, panels, diagnosis workspace header. |
| **Pill** | `rounded-full` | Quick-entry chips, status badges, tab pills. |
| **Input / chip** | `rounded-lg`, `rounded-xl` | Inline micro-forms, chip row. |

### 2.4 Module Accent (Emerald)

| Token | Value | Usage |
|-------|--------|--------|
| `--soma` | `#10b981` (emerald-500) | Soma primary accent: active tab, links, primary actions, focus rings, readiness ring, quick-entry active state. Use Tailwind `emerald-*` or `var(--soma)` consistently. |

**Semantic usage:**
- **Success / granted:** `emerald-400` / `emerald-500/10` / `bg-emerald-500/20`
- **Warning / conditional:** `amber-400` / `amber-500/10`
- **Error / denied:** `red-400` / `red-500/10`
- **Neutral / secondary:** `white/40`, `white/10`, `border-white/5`

---

## 3. Layout Structure (Placement)

Soma is rendered inside `SingleAgentLayout`. The Soma-specific layout is a single column with the following **vertical order**. No element may be reordered without updating this spec.

### 3.1 High-Level Stack (Top to Bottom)

1. **Optional: Diagnosis active banner** (cross-tab)
   - **Placement:** Full width, top of Soma content, **only when** `activeSessionId != null` and `activeView !== 'labs'`.
   - **Component:** `DiagnosisActiveBanner`. Floating/cross-tab signal to "Review" (navigate to Labs) or "End" (open close modal).
   - **Responsive:** Same behavior at all widths; banner is compact (single row).

2. **Header**
   - **Placement:** First child of dashboard root. `px-4 md:px-8 pt-6 pb-2 md:pb-4`.
   - **Content:** Title "Soma", subtitle "Physical readiness & biometric tracking". No SectionHeader component; plain `h1` + `p`.
   - **Semantic:** Can be wrapped in `<header>` for accessibility.

3. **Tab bar**
   - **Placement:** Below header. `px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5`.
   - **Component:** `NeuralTabGroup` with `themeColor="emerald"`, `variant="pill"`. Tabs: Dashboard, Vitals, Assessments, History, Labs.
   - **Scroll:** Container may use `overflow-x-auto` with scroll padding so first tab is not clipped on small screens.

4. **Tab panel**
   - **Placement:** Fills remaining height. `px-4 md:px-8 pt-4 md:pt-6 pb-8 space-y-6`.
   - **Role:** `role="tabpanel"`, `id` and `aria-labelledby` linked to tab bar.
   - **Content:** Rendered by `activeView` (see §4).

5. **Chat / FAB (SingleAgentLayout)**
   - **Position:** Fixed, bottom-right. Same as Atlas/Titan: bottom offset accounts for module bar and safe-area.
   - **Soma theme:** `themeColor="emerald"`. FAB uses emerald accent.
   - **Placeholder:** "Ask about biomarkers, labs, or recovery..."

### 3.2 Page Wrapper (SomaPage)

- **Outer:** `SingleAgentLayout` wraps everything. Main content area: `div.h-full.overflow-y-auto.no-scrollbar.pb-20` (pb-20 reserves space for FAB on mobile).
- **Content:** Single child `SomaDashboard` with `profile`, `soul`, `readinessScore`, and all handlers.

### 3.3 Onboarding Gate

- **When:** `user?.uid && encryptionKey && !profile?.medicalOnboardingComplete`.
- **Placement:** Full viewport; no header/tabs. `SomaOnboarding` only.
- **After completion:** Profile is saved with `medicalOnboardingComplete: true`; re-render shows main dashboard.

---

## 4. Tab Content Layout (by Tab)

### 4.1 Dashboard Tab

**Order (top to bottom):**

1. **QuickEntryChips** — Horizontal scrollable row of pills (Heart Rate, Weight, SpO₂). Each chip: today's value or "+". Tap expands inline micro-form; save persists via `onAddVitalReading`. Full width; `space-y-2` with chip row + AnimatePresence form below.
2. **Readiness Score Hero** — `SurfaceCard className="p-6"`. Left: icon + "Physical Readiness" title + subtitle; right: "Show / Hide AI Insights" toggle. Below: ProgressRing (140px) when `hasReadinessData`, else "No readiness data yet" placeholder. Right side: 2×2 grid of stat cards (Biomarkers count, Clearances granted/total, Lab Panels, Conditions). Grid: `grid-cols-2 gap-4`.
3. **CollapsibleAIPanel** — Only when `showAIPanel`. Insights from `aiInsights` (derived from profile: clearances, labs, conditions). No mock data.
4. **Medical Profile Card** — `SurfaceCard className="p-6"`. Icon + "Medical Profile" title. Grid `grid-cols-1 md:grid-cols-3`: Conditions, Medications, Allergies. Each column: label (small caps) + list or "None recorded". Data: `profile.knownConditions`, `profile.medications`, `profile.allergies`.
5. **Recent Biomarkers** — Only when `profile.biomarkers.length > 0`. Card with icon + title "Recent Biomarkers". Grid `grid-cols-2 md:grid-cols-3 gap-3`; last 6 biomarkers, reversed. Each cell: name, value+unit, date.
6. **Medical Clearances** — Card. If no clearances: `EmptyState` (icon ShieldCheck, "No clearances"). Else: list of up to 8 clearances; each row: status icon (CheckCircle2 / AlertCircle), activity + reason, status pill (granted/denied/conditional).
7. **Heart Rate Trend** — Only when `heartRateHistory.length > 0`. Card + `TimeSeriesChart` (cyan, 200px height). Data from `profile.vitalReadings` (last 14).
8. **Weight Trend** — Only when `weightHistory.length > 0`. Card + `TimeSeriesChart` (purple, 200px height). Data from `profile.vitalReadings` (last 30).
9. **Medical Summary** — Only when `profile.medicalSummary`. Single card; body text only.

**Section spacing:** `space-y-6` between all dashboard blocks.

### 4.2 Vitals Tab

- **Component:** `VitalsEntryForm` only. Full-width form; submits to `onAddVitalReading({ timestamp, ...vitals })`. No sidebar.
- **Padding:** Inherits tab panel `px-4 md:px-8 pt-4 md:pt-6 pb-8`.

### 4.3 Assessments Tab

- **Component:** `PhysicalAssessmentForm` with `profile` and `onSubmit`. Submit maps to `onAddAssessment` with `id`, `timestamp`, and assessment payload. No sidebar.
- **Padding:** Same as Vitals.

### 4.4 History Tab

- **Component:** `BiometricHistory`. Props: `vitalHistory={profile.vitalReadings ?? []}`, `assessmentHistory` (mapped from `profile.physicalAssessments` to UI shape). No sidebar.
- **Padding:** Same as above.

### 4.5 Labs Tab (Diagnosis Workspace)

**States:**

- **idle:** `DiagnosisUploadZone` — upload CTA; `onFileSelected` starts session.
- **uploading / parsing:** `DiagnosisProgressCard` (phase, progress, onCancel). Cancel best-effort closes session.
- **reviewed:** Two layouts:
  - **Inline session header:** One row: icon + "Active Analysis" + "N fields extracted" + "Merge / Close" button. Full width; `rounded-2xl`, emerald tint. No fixed/z-50.
  - **Mobile (< lg):** Tab switcher (Findings | Analysis). Single-panel view; AnimatePresence between `DiagnosisResultsScreen` (findings) and `DiagnosisChatPanel` (analysis). Min heights ~65dvh / 60dvh.
  - **Desktop (lg+):** Two columns: left `DiagnosisResultsScreen` (flex-1), right `DiagnosisChatPanel` (w-[400px] xl:w-[460px]).
- **error:** Red banner with `diagnosisError` message.

**Close/merge modal:** `DiagnosisCloseModal` mounted at SomaDashboard root; `isOpen={showCloseModal}`; actions Merge / Discard / Cancel. Merge calls `handleCloseDiagnosis(true)`, Discard `handleCloseDiagnosis(false)`.

---

## 5. Component Customization Rules

### 5.1 QuickEntryChips

- **Chip row:** `flex gap-2 overflow-x-auto pb-1 scrollbar-none`. Each button: `min-h-[44px]`, `rounded-full`, `whitespace-nowrap`, `flex-shrink-0`. States: default (border-white/10), has value (emerald tint), expanded (emerald border), flash (emerald pulse after save).
- **Inline micro-form:** AnimatePresence; motion.div with slide-down. Inner: card-style `rounded-xl p-4`; label row with icon + "Log {label}" + unit; number input + Save button; error text `text-red-400`. Save button: `min-h-[44px]`, emerald primary.
- **Data:** `allReadings` = profile.vitalReadings (persisted + in-session); `getTodayValue(key)` for chip display; save via `addVitalReading` + `onAddVitalReading`.

### 5.2 Readiness / Stat Cards

- **ProgressRing:** size 140; color by score (green ≥80, amber ≥60, else orange). Label "Readiness". When no data: placeholder circle, "No readiness data yet".
- **Stat grid:** `grid grid-cols-2 gap-4`. Each cell: `rounded-xl p-4 border border-white/5 bg-white/[0.03]`. Label (uppercase, token), value (text-2xl bold), caption (text-xs text-white/40).

### 5.3 CollapsibleAIPanel

- **Content:** List of insights (type: info | warning | success; message). No placeholders; driven by `aiInsights` from profile (clearances, lab flags, conditions).

### 5.4 Medical Profile / Clearances / Biomarkers

- **Lists:** Use `text-sm text-white/80` for items; empty state `text-sm text-white/30 italic` ("None recorded").
- **Clearance row:** `flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5`. Status pill: `rounded-full text-xs font-semibold uppercase` with emerald/red/amber background.

### 5.5 NeuralTabGroup (Soma)

- **Theme:** `themeColor="emerald"`, `variant="pill"`. Tab strip: same horizontal padding as header. Min touch target for tab buttons.

### 5.6 DiagnosisActiveBanner

- **When:** `activeSessionId && activeView !== 'labs'`. Shown so user can jump to Labs or end session from any tab.
- **Placement:** Top of content; does not affect header/tab bar order.

### 5.7 DiagnosisCloseModal

- **Mount:** At SomaDashboard root so it overlays all content. Props: sessionId, selectedItemCount, totalItemCount, suggestedMedicationCount, onMerge, onDiscard, onCancel, isProcessing.
- **Actions:** Merge (handleCloseDiagnosis(true)), Discard (handleCloseDiagnosis(false)), Cancel (setShowCloseModal(false)).

### 5.8 EmptyState (core)

- **Soma usage:** "No clearances" uses icon ShieldCheck, size sm. "Set up Soma to get started" (pre-onboarding) uses size lg. Use neutral/positive icons for empty states; AlertCircle only for warnings/errors.

### 5.9 Buttons (primary actions)

- **Touch target:** Min height/width 44px for primary actions and chip buttons.
- **Emerald primary:** `bg-emerald-500/20 border border-emerald-500/40 text-emerald-300` for primary buttons in Soma.

---

## 6. Responsive Design Specification

### 6.1 Breakpoints (Tailwind Defaults)

| Breakpoint | Min width | Soma usage |
|------------|-----------|------------|
| (default) | 0 | Mobile-first. Single column, stacked layout, touch targets 44px. |
| `md` | 768px | Page padding increases to `px-8`; tab panel `pt-6`; stat grids 2 cols; Medical Profile 3 cols. |
| `lg` | 1024px | **Labs tab:** Two-column layout (Findings + Chat). Mobile Labs: tab switcher hidden, side-by-side shown. |

### 6.2 Small (0–767px)

- **Header:** Title and subtitle stack; padding `px-4 pt-6 pb-2`.
- **Tabs:** Horizontal scroll if needed; pill tabs, min touch target. Padding `px-4 pb-3`.
- **Tab panel:** `px-4 pt-4 pb-8`. Single column. Dashboard: stat grid 2 cols; cards full width. Labs: Findings vs Analysis tab switcher; one panel at a time (min-h 65dvh / 60dvh).
- **FAB/Chat:** Fixed bottom-right; content has `pb-20` to avoid overlap.
- **QuickEntryChips:** Chip row scrolls horizontally; micro-form stacks input + button.

### 6.3 Medium (768px–1023px)

- **Header / tab bar:** `px-8`, `pb-4` / `pb-6`.
- **Tab panel:** `px-8 pt-6 pb-8`. Dashboard: Medical Profile 3 cols; Biomarkers 3 cols. Labs: still single-panel mobile layout (tab switcher) until lg.
- **Diagnosis header:** Same inline block; full width.

### 6.4 Large (1024px+)

- **Labs tab (reviewed):** Two-column layout. Left: `DiagnosisResultsScreen` (flex-1). Right: `DiagnosisChatPanel` (w-[400px] xl:w-[460px]). Tab switcher hidden.
- **Dashboard:** No structural change beyond md; optional larger card padding.

### 6.5 Touch and Accessibility

- **Minimum touch target:** 44px (2.75rem) for chips, tab buttons, primary actions. Use `min-h-[44px]` or `min-h-[2.75rem]`.
- **Focus:** Visible focus ring on interactive elements (e.g. `focus-visible:ring-2 focus-visible:ring-emerald-500/50`). No `outline: none` without replacement.
- **Reduced motion:** Respect `prefers-reduced-motion` for AnimatePresence and chip expand/collapse (shorten or disable transitions).

---

## 7. Data Structure Linkage

### 7.1 Primary Profile: SomaProfile

- **Source:** `src/lib/types.ts` (SomaProfile), persisted in `soma_profiles` (Firestore) with E2EE.
- **Load/save:** `loadSomaProfile`, `saveSomaProfile`, `subscribeSomaProfile`, `syncGuestSomaProfileToUser` from `soma-profile-service.ts`.
- **Normalization:** `normalizeSomaProfile(userId, raw)` ensures arrays (biomarkers, clearances, vitalReadings, etc.) are bounded and typed.

**Key fields:**

| Field | Type | Usage |
|-------|------|--------|
| `medicalOnboardingComplete` | boolean | Gates main dashboard vs SomaOnboarding. |
| `knownConditions` | string[] | Medical Profile card. |
| `medications` | string[] | Medical Profile card. |
| `allergies` | string[] | Medical Profile card. |
| `biomarkers` | BiomarkerRecord[] | Recent Biomarkers card; readiness input. |
| `labSummaries` | LabSummaryRecord[] | AI insights (flagged panels); readiness context. |
| `clearances` | ClearanceRecord[] | Medical Clearances card; AI insights; readiness. |
| `vitalReadings` | VitalReading[] | QuickEntryChips, Heart/Weight trends, readiness. |
| `physicalAssessments` | PhysicalAssessment[] | History tab (BiometricHistory). |
| `medicalSummary` | string? | Medical Summary card. |

### 7.2 Core Types (lib/types)

- **BiomarkerRecord:** id, name, value, unit?, source?, recordedAt, agentReview?.
- **ClearanceRecord:** id, activity, status ('granted'|'denied'|'conditional'), reason, issuedAt.
- **LabSummaryRecord:** id, panel, findings, flags, recordedAt.
- **VitalReading:** timestamp (ms), heartRate?, bloodPressure?, temperature?, spo2?, weight?.
- **PhysicalAssessment:** timestamp, height?, weight?, bmi?, bodyFatPercentage?, muscleMass?, vo2Max?, strength?, flexibility?, endurance?, agentReview?.

### 7.3 Diagnosis Session (Labs Tab)

- **Session:** `diagnosis-session-service` — startDiagnosisSession, triggerParse, getActiveDiagnosisSession, closeDiagnosis. Persisted per user; encryption key required.
- **State:** diagnosisPhase ('idle'|'uploading'|'parsing'|'reviewed'|'error'), activeSessionId, analysisResult (DocumentAnalysisResult), diagnosisSummary (SomaDiagnosisSummary), selectedFieldIds.
- **Merge on close:** Selected extracted fields merged into profile (e.g. biomarkers/labSummaries) via closeDiagnosis(uid, sessionId, selectedItems, encryptionKey, true).

### 7.4 Readiness Score

- **Source:** `useSomaHealth(userId, encryptionKey)` returns `readinessScore` (number | null). Computed from profile biomarkers (resting heart rate, sleep quality, energy level, physical stress) and optional overrides. Algorithm in `soma-field-actions.ts` (ComputeReadinessPayload, ReadinessResult).
- **Dashboard:** Displayed in Readiness Score Hero; no mock value. When no data, show "No readiness data yet".

### 7.5 View Linkage Summary

| View | Data source | Mutations |
|------|-------------|-----------|
| Dashboard | profile (all fields), readinessScore, heartRateHistory, weightHistory, aiInsights | onUpdateProfile, onAddVitalReading, onAddAssessment (from chips/forms) |
| Vitals | — | onAddVitalReading (VitalsEntryForm submit) |
| Assessments | profile | onAddAssessment (PhysicalAssessmentForm submit) |
| History | profile.vitalReadings, profile.physicalAssessments | Read-only display |
| Labs | diagnosis session state, analysisResult, diagnosisSummary | handleFileSelected, handleCloseDiagnosis (merge/discard) |

---

## 8. Events

### 8.1 Spine Events (Soma-Fired)

- **SOMA_BIOMARKER_COMMITTED** — After biomarker write.
- **SOMA_READINESS_UPDATED** — After readiness recompute.
- **SOMA_CLEARANCE_CHANGED** — Clearance add/update/delete.
- **SOMA_FIELD_CREATED / UPDATED / DELETED** — Custom field CRUD.
- **SOMA_VITAL_LOGGED** — After vital reading persisted.
- **SOMA_LAB_REPORT_PARSED** — After lab/diagnosis parse.
- **SOMA_PROFILE_UPDATED** — Profile save.

Defined and emitted in `soma-field-actions.ts`; other modules (e.g. Titan) may subscribe.

### 8.2 Spine Events (Soma-Subscribes)

- **TITAN_BODY_WEIGHT_LOGGED** — Mirror weight into Soma `vitalReadings` so vitals and readiness stay in sync. Handler in SomaPage: addVitalReading({ timestamp, weight }).
- **WORKOUT_COMPLETED** — When RPE ≥ 8, Soma agent is notified via `ai.handleSendMessage` so readiness assessment can factor training load. Only when `profile.medicalOnboardingComplete`.

### 8.3 In-App Events (No Spine)

- **Queued upload:** `onUploadDocument(file)` from SingleAgentLayout sets `queuedUpload`; useEffect in SomaDashboard calls `handleFileSelected(queuedUpload)` and then `onQueuedUploadHandled()`. Used for "upload from chat" or FAB document flow.
- **Diagnosis close modal:** User chooses Merge or Discard; `handleCloseDiagnosis(merge)` updates session and clears local diagnosis state.

---

## 9. Agent Integration

### 9.1 Module AI Setup

- **Hook:** `useModuleAI({ moduleId: 'soma', systemPrompt, encryptionKey })` in SomaContent.
- **System prompt:** `buildSomaAgentSystemPrompt` from `soma-prompt-builder.ts`. Inputs: coreFields (restingHeartRate, bloodPressure, weight, readinessScore, clearanceStatus, lastCheckup), extensionFields, nsvBiological, knownConditions, medications.
- **Initial message:** When no messages and not processing, set single assistant message: "Biological link active. I am {agentAlias}. ..." + SOMA_MEDICAL_DISCLAIMER.

### 9.2 Document Analysis (Labs)

- **Callback:** `handleAnalyzeDocument(content: MessageContent)` passed to SomaDashboard. Used by diagnosis pipeline: raw LLM call with system "You are a medical document analysis engine. Return only valid JSON as instructed." Used for parsing uploaded lab/diagnosis documents; result consumed by triggerParse and diagnosis session.
- **Flow:** User uploads file → startDiagnosisSession → triggerParse(uid, sessionId, encryptionKey, onAnalyzeDocument, file) → analysisResult + diagnosisSummary → UI shows Findings + Analysis chat.

### 9.3 ActionHub (Soma Field Actions)

- **Registration:** `registerSomaFieldActions()` in SomaPage (top-level). Registers Soma-specific actions with ActionHub for:
  - Field CRUD (biomarkers, clearances, lab summaries, conditions, medications, allergies).
  - Readiness computation (compute_readiness, etc.).
  - Spine event emission on commits.
- **Execution:** LLM output is parsed for action tags; ActionHub dispatches; Soma actions read/write via loadSomaProfile/saveSomaProfile/addVitalReading and emit Spine events.
- **Schema:** Actions are schema-guarded per module; Soma actions only when context is soma.

### 9.4 Cross-Module Context

- **Titan → Soma:** Body weight (TITAN_BODY_WEIGHT_LOGGED) and high-RPE workout (WORKOUT_COMPLETED) feed into Soma for vitals and readiness.
- **Soma → Titan:** Clearance status and Soma snapshot (e.g. SomaSnapshotWidget in Titan) read from Soma profile or SomaDataService; no direct Firestore access from Titan to soma_profiles (use snapshot or service API).

### 9.5 Auth and Vault

- **Auth:** SomaContent uses `useAuth()`; profile load/save and diagnosis sessions require `user?.uid`.
- **Vault:** `encryptionKey` from UnifiedModulePage; all profile and diagnosis persistence is E2EE. QuickEntryChips and diagnosis flow use `getMasterKey()` from useVault(); vault locked state can show VaultLockedShell or block save with message.

---

## 10. File Reference

| Concern | File(s) |
|--------|--------|
| Design tokens (CSS) | `src/index.css` (:root, `--soma`) |
| Page wrapper, onboarding gate, Spine handlers | `src/modules/soma/SomaPage.tsx` |
| Dashboard layout, tabs, all tab content | `src/modules/soma/components/SomaDashboard.tsx` |
| Quick-entry chips (vitals) | Inline in SomaDashboard.tsx (QuickEntryChips) |
| Vitals form | `src/modules/soma/components/VitalsEntryForm.tsx` |
| Physical assessment form | `src/modules/soma/components/PhysicalAssessmentForm.tsx` |
| Biometric history | `src/modules/soma/components/BiometricHistory.tsx` |
| AI insights panel | `src/modules/soma/components/CollapsibleAIPanel.tsx` |
| Diagnosis upload / progress / results / chat / close | `src/modules/soma/components/DiagnosisUploadZone.tsx`, `DiagnosisProgressCard.tsx`, `DiagnosisResultsScreen.tsx`, `DiagnosisChatPanel.tsx`, `DiagnosisCloseModal.tsx`, `DiagnosisActiveBanner.tsx` |
| Shell (chat, FAB) | `src/core/layout/SingleAgentLayout.tsx` |
| Tabs | `src/core/components/NeuralTabGroup.tsx` |
| Cards, empty state | `src/core/components/SurfaceCard.tsx`, `EmptyState.tsx` |
| Charts | `src/core/components/viz/TimeSeriesChart.tsx`, `ProgressRing.tsx` |
| Profile service | `src/modules/soma/services/soma-profile-service.ts` |
| Diagnosis session service | `src/modules/soma/services/diagnosis-session-service.ts` |
| Readiness, Spine, actions | `src/modules/soma/actions/soma-field-actions.ts` |
| System prompt / disclaimer | `src/modules/soma/prompts/soma-prompt-builder.ts` |
| Types | `src/modules/soma/types.ts`, `src/lib/types.ts` (SomaProfile, VitalReading, PhysicalAssessment, BiomarkerRecord, ClearanceRecord, LabSummaryRecord) |
| Onboarding | `src/modules/soma/onboarding/SomaOnboarding.tsx` |
| Readiness hook | `src/modules/soma/hooks/use-soma-health.ts` |

---

## 11. Changelog

- **Initial spec:** Design tokens (emerald, spacing, typography), layout placement (header, tab bar, tab panel, diagnosis banner), tab-by-tab content order, component customization (QuickEntryChips, cards, NeuralTabGroup, diagnosis workspace mobile/desktop), responsive breakpoints, full data-structure linkage (SomaProfile, diagnosis session, readiness), Spine events (Soma-fired and Soma-subscribed), agent integration (useModuleAI, document analysis, ActionHub, cross-module context), and file reference. Aligns with implemented Soma layout and E2EE profile/session flow.
