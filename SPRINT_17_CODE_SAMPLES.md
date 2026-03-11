# Sprint 17 - Key Code Samples

## Crisis Detection Flow

### 1. Crisis Keywords Definition (in AGNES_PERSONA)
```typescript
CRISIS KEYWORDS: "suicide", "kill myself", "end it all", "no point in living", 
"better off dead", "can't do this anymore", "want to disappear", "hurt myself".
```

### 2. Action Emission (AI emits this in response)
```xml
<action type="crisis_flag">{"severity": "high", "trigger": "exact phrase used"}</action>
```

### 3. Action Handler (src/modules/agnes/services/actions.ts)
```typescript
ActionHub.register('agnes', 'crisis_flag', async ({ payload }) => {
  Spine.publish({
    type: 'CRISIS_DETECTED',
    source: 'agnes',
    domain: 'E',
    priority: 'critical',
    data: {
      trigger: (payload as any)?.trigger || 'unknown',
      severity: (payload as any)?.severity || 'high',
      timestamp: new Date().toISOString()
    }
  });
});
```

### 4. Type Definition (src/lib/types.ts)
```typescript
export type SpineEventType =
  | 'VITAL_UPDATED'
  | 'REDUCE_TRAINING_LOAD'
  // ... other types ...
  | 'MEDICAL_ALERT'
  | 'CRISIS_DETECTED'  // ← NEW
  | 'DRAFT_PROPOSED'
  // ... more types ...
```

### 5. Display Name (src/lib/state-display-config.ts)
```typescript
export const EVENT_DISPLAY_NAMES: Record<SpineEventType, string> = {
  // ... other mappings ...
  MEDICAL_ALERT: 'Medical alert',
  CRISIS_DETECTED: 'Crisis Detected',  // ← NEW
  DRAFT_PROPOSED: 'Suggestion proposed',
  // ... more mappings ...
};
```

## Move-Category Tracking Structure

### Thought Block Format
```xml
<thought>
Analysis: [Assess the user's current emotional state and the subtext of their message.]
History_Check: [What have I asked in the last 3 turns? Am I about to repeat myself?]
Move_Log: [Last 3 clinical moves: e.g., validation → clarification → somatic-checkin]
Next_Move: [Chosen category for this response — must differ from the last move]
Strategy: [What is the specific clinical move here? Pick ONE and stick to it.]
</thought>
```

### Move Categories
- somatic-checkin
- validation
- pattern-observation
- clarification
- challenge
- reflection
- psychoeducation

## Gender Presentation Options (Simplified)

```typescript
const PRESENTATION_OPTIONS = {
  female: { pronouns: 'she/her' },
  male: { pronouns: 'he/him' },
  'non-binary': { pronouns: 'they/them' }
};
```

## System Prompt Identity Line (New Format)

```typescript
IDENTITY:
You are ${name} (${pronouns}), a therapist embodying ${archetype.name}.
```

Example output:
```
You are Dr. Elena (she/her), a therapist embodying The Nurturer.
```

## Provocateur Safety Constraint

```text
PROVOCATEUR SAFETY CONSTRAINT:
If the user expresses hopelessness, acute distress, suicidal ideation, or says things 
like "I can't do this anymore" or "what's the point" — immediately SUSPEND existential 
challenge mode. Do not ask about agency or freedom. Shift to grounded containment: 
"Let's slow down. You're carrying something very heavy right now. I want to stay with 
you in this moment — not push forward."
```

## Forbidden Words List (Complete)

```text
"baseline", "context", "protocol", "initialized", "synced", "parameters", "established", 
"access", "data points", "metrics", "neural", "system", "module", "configuration", 
"Neural Sanctuary", "Neural Link", "sanctuary" (when used clinically), "brave" (as compliment), 
"proud of you", "I'm proud"
```

## Anti-Patronizing Constraint

```text
ANTI-PATRONIZING: Do NOT say "That's really brave of you to share" more than once per session. 
Do NOT say "I'm proud of you" — this implies hierarchical judgment. 
Prefer: "Thank you for trusting me with that."
```
