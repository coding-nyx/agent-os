# Sprint 17 Implementation Summary

## Overview
Sprint 17 implements surgical persona/prompt text fixes and adds a new Spine crisis event type with its handler for the Agnes AI therapist module.

## Files Modified

### 1. `src/modules/agnes/personas.ts`

#### S17-001: Fixed Somatic Sensory Dishonesty
- Updated Nurturer archetype's CLINICAL VERBAL FINGERPRINT
- Changed from claiming to "hear" or "see" to grounding in user's self-report
- Now uses phrases like "I notice a shift in how you're writing" instead of "I'm hearing a shift in your voice"

#### S17-002: Decoupled Gender from Clinical Posture
- Removed entire `GENDER_POSTURES` object
- Added minimal `PRESENTATION_OPTIONS` for names and pronouns only
- Rewrote `generateAgnesOptions()` to use archetype's `basePrompt` verbatim
- Gender now only affects name pool and pronouns, not clinical approach

#### S17-003: Provocateur Safety Brake
- Added safety constraint to Provocateur archetype
- Suspends existential challenge mode when user expresses hopelessness or distress
- Shifts to grounded containment instead

#### S17-004: Distress Protocol (Part A)
- Added protocol #5 to `AGNES_PERSONA` INTERACTION PROTOCOLS
- Monitors for crisis keywords in every message
- Emits `crisis_flag` action when detected
- Enters POST_CRISIS_MODE for remainder of session

#### S17-005: Upgrade Anti-Repetition to Move-Category Tracking
- Updated ANTI-REPETITION constraint to track move categories
- Added Move_Log and Next_Move to thought block format
- Hard limits: somatic-checkin max 2 per session, validation max 3
- Move categories: somatic-checkin | validation | pattern-observation | clarification | challenge | reflection | psychoeducation

#### S17-006: Scrub Neural Branding from Clinical Voice
- Replaced "Neural Sanctuary" → "grounded AI therapist within this app"
- Replaced "Neural Link" → "secure therapeutic relationship"

#### S17-008: Fix Warm Welcome Anthropomorphic Overreach
- Changed "I've been holding our last conversation in my mind" → "I remember what we talked about last time"

#### S17-007: Anti-Patronizing Language
- Added ANTI-PATRONIZING constraint
- Limits "brave" compliments to once per session
- Prohibits "I'm proud of you"

### 2. `src/modules/agnes/prompts/agnes-session-prompt.ts`

#### S17-004: Distress Protocol (Part B)
- Added crisis_flag to AVAILABLE ACTIONS (action #7)
- Expanded FORBIDDEN WORDS to include: "Neural Sanctuary", "Neural Link", "sanctuary", "brave", "proud of you", "I'm proud"

### 3. `src/modules/agnes/services/actions.ts`

#### S17-004: Crisis Flag Handler (Part C)
- Added import for Spine from spine-event-bus
- Registered `crisis_flag` action handler
- Emits `CRISIS_DETECTED` Spine event with:
  - priority: 'critical'
  - domain: 'E' (emotional)
  - source: 'agnes'
  - data: { trigger, severity, timestamp }

### 4. `src/lib/types.ts`

#### S17-004: Add CRISIS_DETECTED Event Type (Part D)
- Added `'CRISIS_DETECTED'` to `SpineEventType` union type

### 5. `src/lib/state-display-config.ts`

#### S17-004: Add Display Name
- Added display name for `CRISIS_DETECTED`: `'Crisis Detected'`

## Build Status
✅ Build completed successfully with no errors

## Testing Notes
- All changes are text/prompt modifications except for the new crisis_flag action
- Crisis detection triggers on keywords: "suicide", "kill myself", "end it all", "no point in living", "better off dead", "can't do this anymore", "want to disappear", "hurt myself"
- No new UI components or external dependencies added
- No Spine event subscribers/observers were added (as per requirements)

## Compliance
- Did NOT change THERAPIST_ONBOARDING_PERSONA (separate flow)
- Did NOT add 988 crisis hotline or external resource mentions
- Did NOT wire any Spine event subscriber/observer for crisis event
- Kept THERAPIST_ARCHETYPES array structure intact
- Kept generateAgnesOptions() returning GeneratedAgnes[] with same shape
