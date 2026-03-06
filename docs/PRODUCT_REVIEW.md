# AGNES — Comprehensive Product Review

> **Review Date:** 2025-07-14
> **Reviewer:** Technical Product Manager (Orchestrator Nexus)
> **Scope:** Full platform audit — vision alignment, module maturity, user flows, security, infrastructure
> **Codebase Snapshot:** Commit `e79bcd9` (HEAD)

---

## Executive Summary

AGNES (Artificial General Neural Ecosystem for Stability) is a **multi-agent AI wellness platform** built as a React 19 + Vite SPA with Firebase backend. The platform aspires to unify mental health (Therapy), physical fitness (Trainer), financial wellness (Ledger), biological tracking (Soma), cognitive energy management (Atlas), and several utility modules (Scout, Forge, Pulse) under a single "digital nervous system" metaphor.

**Bottom line:** The project has achieved remarkable engineering depth for its scope — the core architecture (E2EE vault, Spine Event Bus, Global Soul synthesis, LLM Engine with multi-provider fallback) is **production-grade infrastructure**. However, the product layer reveals a classic **"wide but shallow" anti-pattern**: 12 modules exist but only 2-3 deliver complete end-to-end user value. The remaining modules are technically wired but functionally thin — dashboards with AI chat rather than differentiated product experiences.

### Key Metrics

| Metric | Value |
|--------|-------|
| Total source lines | ~45,000 |
| Total modules | 12 (+ orchestrator) |
| Modules production-ready | 2–3 (Therapy, Trainer, Hub) |
| Modules beta/alpha | 7–8 |
| Test coverage ratio | ~8.4% (19 unit tests, 2 E2E tests) |
| Security score | **6.5/10** (critical: exposed secrets in git) |
| Design system completion | 95% (meticulous 1,460-line spec) |
| Infrastructure maturity | 8/10 (E2EE, Spine, Global Soul, LLM all production-grade) |

---

## 1. Product Vision Assessment

### Stated Vision

The README positions AGNES as:
> A unified, multi-agent wellness ecosystem combining mental health, physical optimization, biological tracking, financial planning, and cognitive energy management — all connected through a "Global Soul" that synthesizes cross-domain insights.

The design metaphor is a **digital nervous system** — each module is an "organ," data changes are "nerve impulses," and the hub is a neural constellation map.

### Vision Clarity: ⭐⭐⭐⭐ (4/5)

The vision is **clear, compelling, and well-articulated**. The "digital nervous system" metaphor is consistently applied through the design system, naming conventions, and architecture. The value proposition — "your AI agents know about each other and adapt in concert" — is genuinely differentiated from siloed wellness apps.

### Execution Alignment: ⭐⭐⭐ (3/5)

The gap between vision and execution is **significant but not insurmountable**:

| Vision Claim | Implementation Reality | Gap |
|---|---|---|
| "Unified wellness ecosystem" | 12 modules exist structurally | Only 2-3 deliver real user value |
| "Intelligent cross-module synthesis" | Global Soul + Spine Event Bus are implemented | Synthesis is real but NSV is sparsely populated — most modules don't write back meaningful metrics |
| "10-agent constellation" | All 10+ agents have pages, personas, services | Most are "AI chat + thin dashboard" — not differentiated experiences |
| "Real-time cascading insights" | Cascade rules engine exists with 6+ rules | Rules fire but downstream modules don't always action the signals |
| "Medical-grade clinical guidance" | Soma exists with biomarker management | No medical validation, disclaimers incomplete, PDF lab import untested |
| "Neural Map visualization" | Three.js hub with 3 view modes | Fully working — arguably the most polished feature |

### The Honest Gap

The UPDATE_PLAN.md is **refreshingly self-aware**, describing the current state as a "prompt-stuffing architecture with no real orchestration, no memory retrieval, and no reactive cross-module communication." This was written before significant infrastructure was built (Spine, cascade rules, NSV). The codebase has evolved past that self-assessment, but the product layer hasn't caught up:

> **The infrastructure is ready for a product that hasn't been built on top of it yet.**

The Spine Event Bus, cascade rules, Global Soul projection, and E2EE vault are sophisticated — but the modules largely treat their AI agent as a chatbot rather than leveraging these systems for differentiated UX.

---

## 2. Module Maturity Matrix

### Assessment Criteria

- **Production-Ready:** Complete user flows, error handling, data persistence, differentiated UX beyond chat
- **Beta:** Core features work, some integration gaps, needs polish
- **Alpha:** Structure exists, basic functionality, thin or incomplete flows
- **Scaffold:** Page renders, routing works, but content is a chat wrapper with minimal differentiation

### Matrix

| Module | LOC | Personas | Onboarding | Dashboard | Chat | Vault | Spine | Maturity | Notes |
|--------|-----|----------|------------|-----------|------|-------|-------|----------|-------|
| **Therapy** | 1,960 | 19 archetypes | ✅ Full | ✅ Belief graphs | ✅ | ✅ Mandatory | ✅ Emits emotional | ⭐ **Production** | Most complete module. 19 therapist personas, belief graph visualization, session tracking |
| **Trainer** | 2,003 | TITAN + 6 styles | ✅ 24KB onboarding | ✅ Routines + CNS | ✅ | ✅ | ✅ Emits biological | ⭐ **Production** | Deep onboarding (24KB intake accumulator), routine tracking, CNS fatigue system |
| **Hub** | 979 | — | — | ✅ Three.js neural map | — | ✅ | ✅ Reads all | ⭐ **Production** | Three view modes (cards/graph/3D), live NSV metrics, module access gating |
| **Ledger** | 1,308 | Dr. Ledger | ✅ | ✅ Cash flow | ✅ | ✅ Default locked | ✅ Emits resource | 🟡 **Beta** | Dashboard exists but UPDATE_PLAN called it "dead" — action handlers may be shallow |
| **Soma** | 1,340 | Soma | ✅ | ✅ 297-line dashboard | ✅ | ✅ Default locked | ✅ Emits biological | 🟡 **Beta** | Biomarker management + lab imports. No medical validation layer |
| **Atlas** | 1,078 | Atlas | ❌ Removed | ✅ Energy + recovery | ✅ | ❌ Not locked | ✅ Receives flatten | 🟡 **Beta** | Energy budget + recovery windows. Onboarding removed recently |
| **Orchestrator** | 478 | Nexus | ✅ Entry point | — | ✅ | — | — | 🟡 **Beta** | First-run experience. Missing `actions.ts` handler file |
| **Scout** | 907 | Scout | ❌ Removed | ✅ | ✅ | ❌ Not locked | ✅ | 🟠 **Alpha** | Web search service is a **5-line stub**. Cloud Function exists but service layer incomplete |
| **Forge** | 1,064 | Forge | ❌ Removed | ✅ | ✅ | ❌ Not locked | ✅ | 🟠 **Alpha** | Code execution via Cloud Function. **VM sandbox has no resource limits** — security concern |
| **Pulse** | 937 | Pulse | ❌ Removed | ✅ | ✅ | ❌ Not locked | ✅ | 🟠 **Alpha** | News synthesis. **34-line stub** for news service |
| **Landing** | 163 | — | — | — | — | — | — | ✅ **Complete** | Simple, purpose-built entry page |
| **Profile** | 247 | — | — | ✅ Module health | — | ✅ | — | ✅ **Complete** | Identity display, module status, vault status |

### Key Observations

1. **Therapy & Trainer carry the product.** These two modules have deep, differentiated experiences — Therapy with 19 persona archetypes and belief graph visualization, Trainer with a 24KB onboarding flow and CNS tracking. Everything else is comparatively thin.

2. **Hub is the crown jewel of the UI.** The Three.js neural map with live NSV binding is genuinely impressive and delivers on the "digital nervous system" promise visually.

3. **Scout, Forge, Pulse are scaffolds with stubs.** The service layers for web search (5 lines), news (34 lines), and code execution (no resource limits) are incomplete. These modules were recently stripped of onboarding flows, suggesting a strategic deprioritization.

4. **Atlas, Soma, Ledger are in a middle ground.** They have real dashboards and services but lack the depth of Therapy/Trainer. They feel like v0.5 features.

---

## 3. User Flow Analysis

### Primary Journey: New User

```
Landing Page (/)
    ↓ CTA click
Auth Modal (login/register)
    ↓ registration
Orchestrator (/orchestrator) — First-run onboarding with Nexus
    ↓ onboarding completes (profile.onboardingComplete = true)
Hub (/hub) — Neural Map with module cards
    ↓ select module
Module Page — Per-module onboarding (if applicable) → AI chat + dashboard
```

**Assessment:** ✅ Flow is structurally complete.

| Step | Status | Issues |
|------|--------|--------|
| Landing → Auth | ✅ Working | Auth modal with email/password. Guest mode available. |
| Guest trial | ✅ Working | 10-turn quota, free models only, data syncs on registration |
| Orchestrator onboarding | ✅ Working | AI-guided conversational intake with completion detection |
| Onboarding → Hub redirect | ✅ Working | ProtectedRoute checks `onboardingComplete` flag |
| Hub → Module selection | ✅ Working | Three view modes, vault-gated access |
| Module onboarding | ⚠️ Partial | Only Therapy, Trainer, Ledger, Soma have onboarding. Atlas/Scout/Forge/Pulse had theirs removed |
| Module → Chat interaction | ✅ Working | Streaming AI responses, action parsing, error recovery |

### Primary Journey: Returning User

```
Landing (/) → Already authenticated?
    ↓ yes
Hub (/hub) — Resume from last session
    ↓ select module
Module — Session history loaded from Firestore + session storage
    ↓ interact
AI responses stream with cross-module context (Global Soul enhances prompts)
```

**Assessment:** ✅ Flow works. Session restoration from sessionStorage is implemented.

### Cross-Module Journey: Therapy ↔ Trainer Adaptation

```
Therapy session → emotional resilience drops to 3
    ↓ NSV update written to Global Soul
Spine Event Bus: VITAL_UPDATED fires
    ↓ cascade rule matches (resilience ≤ 3 + fatigue ≥ 8)
BURNOUT_WARNING → BLOCK_HIGH_INTENSITY → Trainer
    ↓
Trainer page: High-intensity workouts should be blocked
Hub: 3D model rotation reflects CNS fatigue level
```

**Assessment:** ⚠️ **Infrastructure is complete, but the last mile is uncertain.**

The cascade rules fire and events propagate. The Hub visualization responds (3D model rotation tied to CNS fatigue). However, **whether the Trainer module actually blocks workout suggestions based on the BLOCK_HIGH_INTENSITY event** depends on the trainer's prompt context consumption — it may receive the signal but not action it in the AI prompt unless explicitly wired.

### Broken or Dead-End Flows

| Flow | Issue | Severity |
|------|-------|----------|
| Orchestrator → missing `actions.ts` | Action handlers from Nexus AI aren't processed. AI can suggest actions but they silently fail. | 🔴 High |
| Scout web search | Service is a 5-line stub. AI can't actually search the web. User gets chat-only experience. | 🟡 Medium |
| Pulse news synthesis | 34-line stub service. No actual news fetching. | 🟡 Medium |
| Forge code execution | Cloud Function exists but lacks resource limits (CPU/memory/timeout). VM escape risk. | 🔴 High (security) |
| Vault password forgotten | **Permanent data loss.** No recovery codes, backup keys, or account recovery flow. | 🔴 High |
| Data export | No UI for users to export their data. GDPR compliance concern. | 🟡 Medium |
| 404 page | Catch-all redirects to `/` silently — no "page not found" message. User may be confused. | 🟢 Low |

---

## 4. Cross-Module Integration (Global Soul)

### Architecture Assessment

The cross-module integration architecture is **genuinely sophisticated**:

```
Module (Therapy/Trainer/etc.)
    ↓ writes metrics
Neural State Vector (NSV)
    ├─ biological: cnsFatigue, sleepQuality, recoveryScore, hormonalContext
    ├─ emotional: emotionalResilience, stressLoad, moodTrend, traumaMarkers
    ├─ cognitive: energyBudget, focusScore, activeLoad, researchLoad
    └─ resource: financialFriction, resonanceROI
    ↓ stored in Firestore (global_souls/{userId})
Global Soul Context (React provider)
    ↓ real-time subscription (onSnapshot)
    ↓ enhanceContext() injects into LLM prompts
All Modules
    ↓ AI agents receive cross-module awareness

Spine Event Bus (parallel channel)
    ↓ VITAL_UPDATED events
Cascade Rules Engine
    ↓ condition-based transformations
Target Module Events (BLOCK_HIGH_INTENSITY, FLATTEN_ENERGY_WAVE, etc.)
```

### What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| NSV data model | ✅ Defined | 4 domains × 2-4 fields each |
| Firestore persistence | ✅ Working | Real-time onSnapshot subscription |
| Context injection into LLM | ✅ Working | `enhanceContext()` adds NSV to system prompts |
| Spine Event Bus | ✅ Implemented | 16+ event types, debouncing, cascade depth limits |
| Cascade rules | ✅ Implemented | 6+ rules (burnout, financial stress, clearance) |
| Hub visualization | ✅ Working | 3D models respond to NSV values |
| Event Firestore logging | ✅ Working | Non-info events persisted for audit |

### What's Thin

| Gap | Impact | Recommendation |
|-----|--------|----------------|
| **NSV is sparsely written.** Most modules read from Global Soul but few actively write back meaningful metrics beyond basic session data. | Cross-module synthesis is only as good as the data flowing in. | Define NSV write contracts per module — what metric does each module own? |
| **No feedback loop visualization.** Users can't see how modules influence each other. | The "digital nervous system" promise is invisible to users. | Add a "Nerve Activity" panel showing recent cross-module events in human-readable form. |
| **Cascade rule effects are opaque.** When BLOCK_HIGH_INTENSITY fires, the user doesn't know why their trainer changed behavior. | Trust and transparency issue. Violates the "Ghost UI" principle in the design system. | Surface cascade effects via NeuralDraft (Ghost UI) — "Trainer adjusted intensity because your therapy session indicated high stress." |
| **No RAG/embedding retrieval.** The UPDATE_PLAN describes a vector embedding pipeline but it's not implemented. Global Soul is prompt-based context injection, not semantic retrieval. | AI responses lack episodic memory. "Tell me what I said last week" fails. | Phase this in — start with session summary retrieval before full RAG. |

---

## 5. Security & Privacy Assessment

### 🔴 CRITICAL: API Keys Exposed in Git

**`.env.local` is tracked in git history.** This file contains live API keys:

| Key | Service | Risk |
|-----|---------|------|
| `VITE_OPENROUTER_API_KEY` (sk-or-v1-...) | OpenRouter LLM API | 🔴 Financial — unauthorized API usage |
| `VITE_GROK_API_KEY` (xai-...) | Grok / X.AI | 🔴 Financial — unauthorized API usage |
| `VITE_GOOGLE_API_KEY` (AIzaSy...) | Google AI | 🔴 Financial — unauthorized API usage |
| `TAVILY_API_KEY` (tvly-...) | Tavily Search | 🟡 Medium — limited scope |
| `VITE_FIREBASE_API_KEY` (AIzaSy...) | Firebase | 🟢 Low — public by design |

**Immediate action required:**
1. Revoke and rotate ALL exposed API keys
2. `git rm --cached .env.local` to untrack the file
3. Use `git filter-branch` or `bfg` to scrub from history
4. Force-push cleaned history

### E2EE Vault Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Algorithm | ✅ PBKDF2 (100K iterations) + AES-GCM 256-bit | Meets NIST standards |
| Salt | ✅ Random 16-byte per vault | Unique per user |
| IV | ✅ Random 12-byte per encryption op | No IV reuse |
| Canary verification | ✅ Encrypts "AGNES" as password validator | Clever, lightweight |
| Persistence modes | ✅ STRICT / SESSION / GRACE | User chooses security level |
| **Password recovery** | ❌ **None** | Forgotten password = permanent data loss |
| **Key rotation** | ❌ **None** | No mechanism to change vault password |
| **Backup keys** | ❌ **None** | No recovery codes generated |
| Coverage — Therapy | ✅ Mandatory | All therapy data encrypted |
| Coverage — Ledger | ✅ Default locked | Financial data encrypted by default |
| Coverage — Soma | ✅ Default locked | Biological data encrypted by default |
| Coverage — Trainer | ⚠️ Optional | Not encrypted by default |
| Coverage — Atlas/Scout/Forge/Pulse | ❌ Not locked | No encryption for these modules |

**Missing: Vault password recovery is a product-critical gap.** Users who forget their vault password lose ALL encrypted data permanently — therapy sessions, financial records, biological markers. There's no warning about this during setup, no recovery codes, and no "forgot password" flow.

### Firebase Security Rules

| Rule Set | Grade | Issues |
|----------|-------|--------|
| Firestore | ✅ B+ | Owner-based access, default deny, regex path validation. Minor: hardcoded admin UID `'super-admin-uid'` |
| Storage | ⚠️ D | **`allow read: if true`** — all uploaded files publicly readable. No per-user path restriction. |

### Cloud Function Security (Forge)

The `forgeExecute` Cloud Function runs user-submitted JavaScript code in a Node.js `vm` sandbox. This has known escape vectors:

- No CPU/memory resource limits
- No execution timeout visible
- `vm` module is not a security boundary (Node.js docs explicitly warn against this)

**Recommendation:** Replace `vm` with `vm2` or a WebAssembly sandbox. Add 5-second execution timeout and 50MB memory cap.

### VITE_ Environment Variable Exposure

All `VITE_`-prefixed variables are bundled into the client-side JavaScript. This means:

- `VITE_OPENROUTER_API_KEY` — embedded in browser JS bundle (anyone can extract it from DevTools)
- `VITE_GROK_API_KEY` — same
- `VITE_GOOGLE_API_KEY` — same

**These should be proxied through Cloud Functions**, not exposed client-side. The only exception is Firebase config keys, which are designed to be public.

---

## 6. Scope Assessment & Recommendations

### The Scope Creep Diagnosis

AGNES exhibits a textbook case of **infrastructure-led scope creep**:

1. **World-class infrastructure** was built (Spine, Global Soul, E2EE, LLM Engine with tool calling)
2. **12 module shells** were scaffolded on top of it
3. **Only 2-3 modules** received the product depth to deliver real user value
4. **The UPDATE_PLAN envisions 7 more phases** of expansion

The result: a sophisticated system where 70% of the surface area is "AI chat + thin dashboard." The infrastructure can support 10 modules, but the product team (and users) would be better served by 3-4 deeply polished ones.

### Module Prioritization

#### Tier 1 — Keep & Deepen (Core Value Proposition)

| Module | Rationale | Next Investment |
|--------|-----------|-----------------|
| **Therapy** | Most complete, 19 personas, differentiated UX. Core emotional pillar. | Session history UI, progress tracking over time, belief graph evolution |
| **Trainer** | Deep onboarding, CNS tracking, routine management. Core physical pillar. | Workout logging persistence, progress charts, rest day recommendations |
| **Hub** | Visual showcase, cross-module synthesis display. The "home" that ties everything together. | Nerve Activity feed (show cross-module events), quick-action cards |
| **Orchestrator** | Critical first-run experience. Gateway to the entire product. | Fix missing `actions.ts`, improve completion detection reliability |

#### Tier 2 — Stabilize & Ship (High Value, Moderate Effort)

| Module | Rationale | Blocker to Remove |
|--------|-----------|-------------------|
| **Ledger** | Financial wellness is a strong value add. Dashboard exists. | Validate that action handlers actually work. Deepen cashflow features. |
| **Soma** | Biological tracking connects therapy ↔ trainer powerfully. | Add medical disclaimers. Test lab PDF import. No clinical claims. |
| **Atlas** | Energy management is unique and complements trainer/therapy. | Restore lightweight onboarding. Connect to trainer for load balancing. |

#### Tier 3 — Defer or Cut (Low Value / High Risk / Incomplete)

| Module | Rationale | Recommendation |
|--------|-----------|----------------|
| **Scout** | Web search — 5-line stub service. Generic utility, not wellness-specific. | **Defer.** Ship when Cloud Function search is battle-tested. |
| **Forge** | Code execution — security risk (vm sandbox), not wellness-related. | **Cut from wellness product.** If kept, isolate as separate tool with proper sandboxing. |
| **Pulse** | News/interest discovery — 34-line stub. Speculative feature. | **Defer.** Ship when a real news aggregation API is integrated. |

### Recommended MVP Scope

**Ship with 7 modules, defer 3:**

```
MVP Ship: Landing → Orchestrator → Hub → Therapy → Trainer → Ledger → Soma
Defer:    Atlas (v1.1), Scout (v1.2), Pulse (v1.2)
Cut:      Forge (separate product or v2.0+)
```

This gives users a **coherent wellness platform** covering emotional (Therapy), physical (Trainer), financial (Ledger), and biological (Soma) wellness — all connected through the Hub.

---

## 7. Missing Critical Features — Gap Analysis

### P0 — Ship Blockers

| Gap | Impact | Effort | Details |
|-----|--------|--------|---------|
| **API key exposure** | 🔴 Security breach | 2 hours | Rotate all keys, scrub git history, proxy through Cloud Functions |
| **Vault password recovery** | 🔴 Permanent data loss risk | 2-3 days | Generate recovery codes during vault creation. Show warning. |
| **Storage rules permissive** | 🔴 All uploads publicly readable | 1 hour | Add per-user path restrictions |
| **Orchestrator missing actions.ts** | 🔴 First-run experience broken for action handling | 2-4 hours | Create action handler file |
| **No CI test gate** | 🔴 Deploys without tests | 2 hours | Add `npm run test` step before build in deploy.yml |

### P1 — High Priority

| Gap | Impact | Effort | Details |
|-----|--------|--------|---------|
| **No data export** | 🟡 GDPR non-compliance, user trust | 1-2 days | Add "Download My Data" button in Profile. Export as JSON/PDF. |
| **No vault key rotation** | 🟡 Users can't change vault password | 2-3 days | Re-encrypt all data with new key derivation |
| **No offline detection** | 🟡 Silent failures when offline | 4-8 hours | Add network status indicator, queue writes |
| **No dedicated 404 page** | 🟡 Silent redirect confuses users | 2 hours | Create NotFoundPage with navigation back to Hub |
| **Test coverage < 10%** | 🟡 Regression risk during development | Ongoing | Target critical paths: auth flow, vault, LLM engine, Spine |
| **No staging environment** | 🟡 Changes go straight to production | 4 hours | Add staging Firebase project + deploy workflow |
| **Client-side API keys** | 🟡 LLM API keys in browser bundle | 1-2 days | Proxy all LLM calls through Cloud Functions |

### P2 — Medium Priority

| Gap | Impact | Effort | Details |
|-----|--------|--------|---------|
| **No analytics/tracking** | 🟢 No product insights | 1-2 days | Add anonymous usage analytics (module visits, session length) |
| **No push notifications** | 🟢 No re-engagement | 2-3 days | Firebase Cloud Messaging for session reminders |
| **No session history browser** | 🟢 Users can't review past sessions | 2-3 days | Per-module session list with date, summary, mood |
| **No progress tracking over time** | 🟢 No longitudinal wellness view | 3-5 days | Charts showing emotional resilience, CNS fatigue, financial health over weeks |
| **No mobile-specific UX** | 🟢 Capacitor configured but no native optimizations | Ongoing | Touch gestures, haptic feedback, push notifications |
| **No rate limiting** | 🟢 API abuse potential | 1 day | Add rate limiting to Cloud Functions |

### P3 — Nice to Have

| Gap | Details |
|-----|---------|
| Email via Cloud Functions | Currently @emailjs/browser (client-side). Move server-side. |
| Bundle analysis in CI | Webpack is in deps alongside Vite — likely unused. Add size tracking. |
| Accessibility audit | DESIGN_SYSTEM.md specifies WCAG AA but no automated testing (axe, lighthouse) |
| Nerve Activity feed in Hub | Visualize recent Spine events in human-readable form |
| Ghost UI (NeuralDraft) | Specified in design system but unclear if actually rendering proposals |

---

## 8. Actionable Backlog

### Sprint 0 — Security Hotfixes (Do Immediately)

| ID | Story | Acceptance Criteria | Points |
|----|-------|---------------------|--------|
| SEC-01 | **As a platform operator**, I need all exposed API keys rotated and git history scrubbed, so that unauthorized API usage is prevented. | **Given** `.env.local` is tracked in git, **When** the fix is applied, **Then** `git ls-files .env.local` returns empty, all 5 API keys are rotated in their respective dashboards, and `git log --all -p -- .env.local` returns no results. | 3 |
| SEC-02 | **As a platform operator**, I need Firebase Storage rules to restrict file access to the owning user, so that uploaded files aren't publicly readable. | **Given** a user uploads a file, **When** another user/anonymous tries to read it, **Then** the read is denied (403). Only `users/{userId}/**` paths are readable by that userId. | 2 |
| SEC-03 | **As a platform operator**, I need LLM API calls proxied through Cloud Functions, so that API keys aren't embedded in the client-side bundle. | **Given** the app makes an LLM call, **When** the request is sent, **Then** it goes to a Cloud Function endpoint (not directly to OpenRouter/Grok/Google), and no `VITE_*_API_KEY` variables for LLM services exist in the built bundle. | 5 |

### Sprint 1 — Foundation Fixes (Week 1-2)

| ID | Story | Acceptance Criteria | Points |
|----|-------|---------------------|--------|
| CORE-01 | **As a new user**, I need the Orchestrator to handle all AI-suggested actions, so that my first-run experience feels responsive. | **Given** the Orchestrator AI suggests an action (e.g., "Let's set up your therapy profile"), **When** the action is parsed, **Then** it routes to the correct handler and the user sees a confirmation. `orchestrator/services/actions.ts` exists with handlers for all defined action types. | 3 |
| CORE-02 | **As a user creating my vault**, I need to receive recovery codes during setup, so that I don't permanently lose data if I forget my password. | **Given** I create a vault password, **When** the vault is initialized, **Then** I am shown 8 single-use recovery codes and prompted to save them. Each code can unlock the vault exactly once and triggers a password reset flow. | 8 |
| CORE-03 | **As a developer**, I need a CI test gate before production deployment, so that broken code doesn't ship. | **Given** a push to `main`, **When** the deploy workflow runs, **Then** `npm run test` executes first and the build+deploy only proceeds if all tests pass. | 2 |
| CORE-04 | **As a returning user**, I need my previous session context restored when I revisit a module, so that I don't have to re-explain my situation. | **Given** I had a therapy session yesterday, **When** I return to the therapy module, **Then** the AI references my previous session summary in its greeting (via compactedInsights from Global Soul). | 3 |

### Sprint 2 — Module Depth (Week 3-4)

| ID | Story | Acceptance Criteria | Points |
|----|-------|---------------------|--------|
| MOD-01 | **As a therapy user**, I want to browse my past sessions with summaries, so that I can track my emotional progress. | **Given** I've completed 5+ therapy sessions, **When** I visit the therapy dashboard, **Then** I see a chronological list of sessions with date, duration, mood indicator, and AI-generated summary. Clicking a session shows the full conversation. | 5 |
| MOD-02 | **As a trainer user**, I want to see my workout consistency and CNS fatigue trends over time, so that I can optimize my training. | **Given** I've logged 10+ workouts, **When** I visit the trainer dashboard, **Then** I see a line chart showing CNS fatigue, workout volume, and recovery score over the last 30 days. | 5 |
| MOD-03 | **As a hub user**, I want to see a "Nerve Activity" feed showing recent cross-module events, so that I understand how my modules connect. | **Given** a cascade event fires (e.g., BURNOUT_WARNING), **When** I'm on the Hub page, **Then** I see a human-readable notification: "Your therapy session detected high stress — Trainer has reduced workout intensity for today." | 5 |
| MOD-04 | **As a user**, I want to export all my data as a downloadable file, so that I own my wellness data. | **Given** I'm on my Profile page, **When** I click "Export My Data," **Then** a JSON file downloads containing all my module data (decrypted if vault is unlocked), session history, and Global Soul projection. | 5 |

### Sprint 3 — Polish & Ship (Week 5-6)

| ID | Story | Acceptance Criteria | Points |
|----|-------|---------------------|--------|
| SHIP-01 | **As a user**, I want to see a proper 404 page when I visit an invalid URL, so that I'm not silently redirected. | **Given** I navigate to `/nonexistent`, **When** the route doesn't match, **Then** I see a themed "Signal Lost" page with a button to return to Hub. | 2 |
| SHIP-02 | **As a user on unstable internet**, I want to see a network status indicator, so that I know when my data isn't syncing. | **Given** I lose network connectivity, **When** the app detects offline status, **Then** a persistent banner shows "Neural link interrupted — operating in local mode" and hides when connectivity returns. | 3 |
| SHIP-03 | **As a platform operator**, I need a staging environment, so that changes can be tested before reaching users. | **Given** a PR is merged to `staging` branch, **When** the staging workflow runs, **Then** the app deploys to `agnes-staging.web.app` with a visual "STAGING" badge. | 3 |
| SHIP-04 | **As a developer**, I need E2E tests for the critical user journey (landing → register → onboarding → hub → module → chat), so that regressions are caught automatically. | **Given** the E2E test suite runs, **When** the critical path test executes, **Then** it completes the full journey from landing page through registration, onboarding completion, hub navigation, and sending a message in therapy module. | 8 |

### Deferred Backlog (v1.1+)

| ID | Story | Phase |
|----|-------|-------|
| DEF-01 | Atlas module: restore onboarding, connect energy budget to trainer load recommendations | v1.1 |
| DEF-02 | Scout module: implement web search service integration with Tavily Cloud Function | v1.2 |
| DEF-03 | Pulse module: integrate news aggregation API, implement interest discovery | v1.2 |
| DEF-04 | RAG pipeline: vector embeddings for episodic memory retrieval | v2.0 |
| DEF-05 | Forge module: replace vm sandbox with secure WebAssembly execution | v2.0 |
| DEF-06 | Push notifications for session reminders and cross-module alerts | v1.1 |
| DEF-07 | Vault key rotation (change password, re-encrypt all data) | v1.1 |
| DEF-08 | Mobile native features (Capacitor: haptics, push, biometric unlock) | v2.0 |

---

## Appendices

### A. Code Quality Indicators

| Indicator | Value | Assessment |
|-----------|-------|------------|
| Console.log statements | 5 files | ✅ Excellent — minimal debug clutter |
| ESLint-disable comments | 0 | ✅ No quality shortcuts |
| Commented-out code | 0 blocks | ✅ Clean codebase |
| TODO/FIXME markers | 0 | ✅ No tech debt markers |
| Broken imports | 0 | ✅ All references resolve |
| TypeScript strict mode | ✅ Enabled | Strong type safety |

### B. Dependency Health

| Category | Status | Notes |
|----------|--------|-------|
| React | 19.2.3 ✅ | Latest |
| Vite | 7.3.0 ✅ | Latest |
| TypeScript | 5.9.3 ✅ | Latest |
| Firebase | 12.7.0 ✅ | Latest |
| Three.js | 0.183.2 ✅ | Latest |
| Tailwind | 4.x ✅ | Latest |
| Webpack | 5.104.1 ⚠️ | Likely unused (Vite is primary bundler). Remove to reduce dep surface. |

### C. Architecture Strengths Worth Preserving

1. **AGENTS.md governance** — The prescriptive rules preventing architectural decay are excellent. Maintain and enforce.
2. **Spine Event Bus** — Production-grade event system with cascade depth limits, debouncing, and Firestore logging. Well-engineered.
3. **E2EE vault with canary pattern** — Clever password verification without storing the password or a hash of it.
4. **LLM Engine as black box** — Clean dependency inversion. Modules don't know about OpenRouter/Grok/Google.
5. **Global Soul real-time subscription** — Firestore `onSnapshot` for live cross-module state is the right pattern.
6. **Design System depth** — 1,460 lines of meticulous design specification. Every color, shadow, animation, and breakpoint defined.

---

*This review should be revisited after Sprint 1 completion to reassess module maturity and security posture.*
