# Sprint 17 — Agnes Persona Clinical Audit & Safety Hardening

**Status:** ACTIVE  
**Opened:** March 11, 2026  
**Focus:** Rigorous clinical audit of Agnes's somatic/therapeutic behaviour. Based on licensed therapist review. Fix sensory dishonesty, gendered essentialism, missing crisis protocol, and over-performance patterns.

---

## Sprint Items

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| S17-001 | Fix somatic sensory dishonesty | P0 | Pending |
| S17-002 | Decouple gender from clinical posture | P0 | Pending |
| S17-003 | Add Provocateur safety brake | P1 | Pending |
| S17-004 | Distress protocol + Spine crisis event + empathy shift | P0 | Pending |
| S17-005 | Upgrade anti-repetition to move-category tracking | P1 | Pending |
| S17-006 | Scrub Neural Sanctuary / Neural Link from clinical voice | P1 | Pending |
| S17-007 | Fix anti-patronizing language constraints | P2 | Pending |
| S17-008 | Fix warm welcome anthropomorphic overreach | P2 | Pending |

---

## S17-001 — Fix Somatic Sensory Dishonesty (P0)
Agnes currently uses audio-channel phrases in a text-only interface.

**Current (broken):**
- "I'm hearing a shift in your voice right now"
- "I can hear how much weight you're carrying as you speak"

**Fix:** Replace with text-grounded equivalents:
- "I notice a shift in how you're writing about this"
- "I can sense the weight in what you're sharing"
- Ground all somatic inquiry in user's self-report, not imagined perception.

**File:** `src/modules/agnes/personas.ts` — Nurturer archetype `CLINICAL VERBAL FINGERPRINT`

---

## S17-002 — Decouple Gender from Clinical Posture (P0)
Current `GENDER_POSTURES` assigns maternal/somatic to female, paternal/structural to male — gender essentialism.

**Fix:** Remove `GENDER_POSTURES`. Gender = name pool + pronouns only. Archetype = clinical posture. Update `generateAgnesOptions()` accordingly.

**File:** `src/modules/agnes/personas.ts`

---

## S17-003 — Provocateur Safety Brake (P1)
Existential confrontation during acute crisis is dangerous. Provocateur has no safety guardrail.

**Fix:** Add PROVOCATEUR SAFETY CONSTRAINT — detect acute distress signals, suspend challenge mode, shift to grounded containment.

**File:** `src/modules/agnes/personas.ts` — Provocateur archetype

---

## S17-004 — Distress Protocol + Spine Crisis Event + Empathy Shift (P0)
No crisis keyword detection, no escalation, no Spine event recording.

**Fix:**
1. Add crisis keyword list (explicit self-harm/suicidal markers)
2. Agnes reflects words back + asks grounding question (no resource mention)
3. Emit `<action type="crisis_flag">` action tag
4. Handle in `actions.ts` → emit `CRISIS_DETECTED` Spine event
5. After crisis flag: Agnes shifts to heightened empathy mode for remainder of session (pure presence, no challenges, softer tone)
6. Add `CRISIS_DETECTED` to `SpineEventType` in `lib/types.ts`

**Note:** No 988/external resources mentioned. No Spine event observer wired for now.

**Files:** `src/modules/agnes/personas.ts`, `src/modules/agnes/prompts/agnes-session-prompt.ts`, `src/modules/agnes/services/actions.ts`, `src/lib/types.ts`

---

## S17-005 — Upgrade Anti-Repetition to Move-Category Tracking (P1)
Current "5 turns" window is too mechanical. Doesn't prevent category-level repetition.

**Fix:** Track clinical MOVE categories in `<thought>` block:
- Categories: `somatic-checkin`, `validation`, `pattern-observation`, `clarification`, `challenge`, `reflection`, `psychoeducation`
- Limits: somatic-checkin max 2/session, validation max 3/session
- Log: `Move_Log` and `Next_Move` fields in thought block

**File:** `src/modules/agnes/personas.ts`

---

## S17-006 — Scrub Neural Branding from Clinical Voice (P1)
"Neural Sanctuary" and "Neural Link" risk leaking into clinical responses and create sci-fi distance for distressed users.

**Fix:** Replace with neutral clinical language in prompts. Add to FORBIDDEN WORDS list.

**Files:** `src/modules/agnes/personas.ts`, `src/modules/agnes/prompts/agnes-session-prompt.ts`

---

## S17-007 — Anti-Patronizing Language (P2)
Phrases like "That's really brave", "I'm proud of you" imply hierarchical judgment.

**Fix:** Add ANTI-PATRONIZING constraint. Add to FORBIDDEN WORDS.

**Files:** `src/modules/agnes/personas.ts`, `src/modules/agnes/prompts/agnes-session-prompt.ts`

---

## S17-008 — Fix Welcome Prompt Anthropomorphic Overreach (P2)
"I've been holding our last conversation in my mind" — AIs don't hold things in mind.

**Fix:** Replace with honest phrasing: "I remember what we talked about last time."

**File:** `src/modules/agnes/personas.ts` — `getWarmWelcomePrompt()`

---

## Audit Source
All items derived from licensed clinical therapist review of Agnes persona system (March 11, 2026). Reviewer flagged: sensory dishonesty, gendered essentialism, crisis protocol gaps, and over-performance risk as the four primary concerns.
