# Orchestrator Conflict Detection & Resolution UX

## 1) Problem & Goal
- **Problem:** The orchestrator detects cross-domain conflicts via NSV signals, but the user lacks a clear UI to understand, arbitrate, and resolve conflicts before taking actions. Current UI shows top patterns, but does not provide explicit resolution flows, module consensus, or notifications tied to ActionHub actions.
- **Goal (Sprint1-011):** Deliver wireframes/flows for conflict detection & resolution that leverage ActionHub outputs, scoped conversation UX, and notification patterns. No code changes; specification only.

## 2) Scope (MVP) & Non-Goals
- **In-scope MVP**
  - Surface detected conflicts (from `useNexusSynthesis`) with severity, domains, and suggested actions.
  - Intercept outbound actions (ActionHub) when conflicts are relevant; present user with choices to proceed, defer, or consult modules.
  - Scoped conversation UX that keeps the user within Orchestrator while still allowing module consultation.
  - Notifications via Spine toast for high-severity conflict events and resolutions.
- **Non-goals (for now)**
  - Auto-blocking user actions (only gated confirmation).
  - Designing module-specific UIs; focus on orchestrator shell and routing.
  - New detection logic (reuse existing eight patterns and severities).

## 3) Key Inputs & Entities
- **Signals:** Neural State Vector from `globalSoul.crossFunctionalState`.
- **Conflict patterns (existing):** COMPOUND_STRESS, BURNOUT_TRAJECTORY, RECOVERY_WINDOW (positive), SLEEP_PERFORMANCE_GAP, FINANCIAL_EMOTIONAL_LOOP, TRAINING_RECOVERY_CONFLICT, PLANNING_COLLAPSE, INTEREST_HYPERFOCUS. Severities: `critical | warning | positive`. Detection returns **top 3** alerts.
- **Suggested action types (existing):** `ask_nexus`, `consult_module`, `navigate`.
- **ActionHub context:** `ActionContext` includes `moduleId`, `payload`, `navigateTo`, `sendMessage`, `delegateToModule`, `emitSpineEvent`, `updateGlobalSoul`, `getLatestNSV`.
- **Notifications:** Spine events (`alert`/`critical` priority) rendered as toasts; cascade events prefixed `cascade:` and labeled.

## 4) UX Principles
1. **Sovereign first:** Nexus leads with its synthesis; modules are consultants.
2. **Prevent silent failure:** Every critical/warning conflict tied to an outbound action must be acknowledged (proceed/adjust/consult).
3. **Scoped focus:** Keep the user in Orchestrator unless they explicitly navigate/delegate.
4. **Explainability:** Show involved domains, thresholds hit, and recommended mitigations in plain language.
5. **Low-friction exit:** Provide “Proceed anyway” with rationale logging; do not trap the user.

## 5) Core Flows (Text Wireframes)

### 5.1 Passive Detection (Home/Dashboard)
- **Placement:** Under “⚡ Nexus Synthesis” panel (existing). Use existing severity styling.
- **Card content:** Title, short description, domains chips, “Suggested actions” row (buttons for `ask_nexus`, `consult_module`, `navigate`).
- **Density:** Show top 3 (existing slice) with collapse toggle. Add “View all patterns” link (non-blocking navigation to a detailed modal/list in future).
- **Empty states:** Loading shimmer while `isAnalyzing`; empty quietly hides the panel.

### 5.2 Conversation Intercept (Scoped Chat)
- **Trigger:** When user sends a message that triggers an ActionHub action (via `onActionParsed`) and an active `critical|warning` conflict is present involving overlapping domains.
- **UI pattern:** Inline “Conflict bar” above the assistant reply bubble:
  - Badge: severity color; label: conflict title.
  - Copy: single sentence explaining the detected tension.
  - Buttons: `Ask Nexus` (inject prompt), `Consult [module]` (fires `query_module` to specialist), `Proceed anyway` (acknowledge + continue action).
  - “Why?” link opens a mini-sheet with involved domains, thresholds hit, and suggested mitigation.
- **Focus mode:** Conflict bar remains visible even when chat is in focus mode; header actions stay hidden per current behavior.

### 5.3 Action Intercept (ActionHub-Aware Confirmation)
- **Applies to:** High-impact action categories (navigation to training/financial flows, module delegation, global updates).
- **Flow:**
  1) **Action parsed:** `onActionParsed` receives action; orchestration layer checks active conflicts + relevant domains.
  2) **If conflict present (critical/warning):** Show a confirmation modal before dispatching ActionHub execute.
     - Modal content: conflict summary, domains, risk statement, recommended alternative.
     - Primary: “Proceed and note risk” (executes action; emits `SpineEvent` with `priority='alert'|'critical'` and `source='orchestrator'`).
     - Secondary: “Consult module first” (fires `query_module` or `delegate_to_module`).
     - Tertiary: “Adjust plan” (injects Nexus prompt to re-plan; may navigate to `/atlas` for planning conflicts or `/ledger` for financial).
  3) **If no conflict or only positive:** Execute normally; if positive (`RECOVERY_WINDOW`), optionally show a lightweight suggestion chip instead of a blocker.
- **Logging:** Any “Proceed and note risk” emits a spine event for auditability and to drive toasts.

### 5.4 Notifications
- **Toast behavior:** Use existing `SpineToastProvider` styling and durations. Fire `alert` for warnings, `critical` for critical conflicts, `info` suppressed. Cascade prefixed conflicts show violet “Cascade Event” label.
- **Entry points:** 
  - Conflict detected during action intercept → toast after modal decision.
  - Conflict resolved/cleared → toast with `alert` priority and “Resolved” label.
- **Accessibility:** `role="alert"` for critical; `role="status"` for alert; `Escape` to dismiss; max 4 visible.

### 5.5 Module Consensus Mini-Flow (Optional inline)
- **Trigger:** User taps “Consult [module]” from conflict bar or modal.
- **Behavior:** Fire `<action type="query_module">` with context of conflict. Render returned summary as a module-tagged message in chat; Nexus then synthesizes and recommends next step.
- **Guardrails:** Limit to 2 consensus prompts per user message to avoid churn; avoid first message auto-routing rule is preserved.

## 6) Wireframe Callouts (by surface)
- **Synthesis Panel (home):**
  - Header: “⚡ Nexus Synthesis” + count + collapse caret.
  - Cards: severity dot + title; description; domains chips (pill: emotional/biological/etc.); action row (buttons).
  - Recent events (optional footer): last 3 spine events that are `cascade:` or `alert/critical`.
- **Chat Conflict Bar:**
  - Layout: full-width bar between user message and assistant reply.
  - Left: severity badge + title. Middle: one-line explanation. Right: buttons (primary ghost style).
  - “Why?” link toggles inline details drawer (thresholds and suggested mitigation).
- **Action Confirmation Modal:**
  - Title: “Potential conflict: [Pattern]”
  - Body: domains + risk statement + recommended action.
  - Buttons: Primary (solid) proceed, Secondary (outline) consult, Tertiary (ghost) adjust.
  - Footer: small note “Logged to timeline” with icon.
- **Toast:**
  - Mirrors existing toast component; include “Cascade Event” tag when source `cascade:*`; show module display name under title.

## 7) Integration Notes (ActionHub + UI glue)
- **Detection hook:** `useNexusSynthesis` → `alerts` (top 3), `recentSpineEvents`, `isAnalyzing`.
- **Relevance check for actions:** Map action types to domains (e.g., training→biological/cognitive, ledger→resource/emotional, atlas→planning/cognitive). If overlap with an active `warning|critical` alert, require confirmation modal; if `positive`, show suggestion chip.
- **Action dispatch:** After user choice, call `ActionHub.execute(moduleId, actionType, context)` as normal.
- **Event emission:** On proceed or resolution, call `emitSpineEvent` with `priority` matching alert severity; set `source='orchestrator'` or `source='cascade:orchestrator'` if derived.
- **Conversation injection:** `onInjectChat` to prefill Nexus prompt for `ask_nexus`; `onConsultModule` to open module route or fire `delegate_to_module`; `onNavigate` for deep-link routes.

## 8) User Stories (Given/When/Then with Acceptance Criteria)
1) **View conflicts on dashboard**
   - Given active conflict alerts exist,
   - When I open the Orchestrator home,
   - Then I see up to three conflict cards with severity, domains, and suggested actions.
   - **AC:** Cards use existing severity styles; collapse toggle works; no alerts hides panel.

2) **Chat conflict awareness**
   - Given a critical or warning conflict is active,
   - When I send a message that triggers an action in overlapping domains,
   - Then a conflict bar appears before the assistant reply with actions to ask Nexus, consult a module, or proceed.
   - **AC:** Bar persists in focus mode; “Why?” reveals thresholds/domains; “Proceed” continues action.

3) **Action intercept confirmation**
   - Given an ActionHub action would change plans/training/finance,
   - When a relevant conflict is active,
   - Then I see a confirmation modal with proceed/consult/adjust options before the action executes.
   - **AC:** Proceed logs a spine event; consult triggers `query_module` or delegation; adjust injects a replan prompt.

4) **Notification delivery**
   - Given I proceed through a conflict or a conflict is resolved,
   - When the event is emitted,
   - Then I receive a toast using alert/critical styling with source labeling (cascade-aware).
   - **AC:** Max 4 visible; ESC dismiss; ARIA roles set by priority.

5) **Module consensus flow**
   - Given I choose “Consult [module]”,
   - When the module responds,
   - Then the module’s perspective appears in chat tagged with module name, followed by Nexus synthesis.
   - **AC:** Max 2 consult prompts per user turn; no auto-routing on first or late (>3) messages per existing rule.

## 9) Open Questions / Risks
- Should “Proceed anyway” require reason input for auditability? (Not in MVP to reduce friction.)
- Do we need a “snooze” duration for conflict alerts? (Currently none; could add in future.)
- Should positive signals (RECOVERY_WINDOW) trigger auto-suggestions in chat? (Currently optional chip.)

## 10) Implementation Handoff Notes
- Reuse existing components where possible: `SynthesisPanel` for cards, `SpineToastProvider` for notifications, `NexusChat` hooks for focus mode and `onActionParsed`.
- New elements likely needed: Conflict bar component (chat), confirmation modal tied to ActionHub, domain-to-action mapping utility.
- Ensure spine events for proceed/resolution are emitted to keep notifications and timelines consistent.
