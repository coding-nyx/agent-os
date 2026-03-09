# AI Field Suggestion Actions

## Overview

This module implements AI-powered custom field management that allows the AI to dynamically create, suggest, and manage custom fields across all AGNES modules. Fields are validated through the schema registry and persist per-user.

## Features

### 1. **`suggest_field`** - AI Field Proposal
Generates a field definition from a user's idea and validates it against module constraints.

**Input:**
```typescript
{
  description: string,      // What the field should track
  purpose: string,          // Why it's needed
  exampleValue?: any,       // Example data
  suggestedType?: FieldType // Optional type hint
}
```

**Output:**
- Validated `FieldDefinition`
- Confidence score
- Reasoning
- User-friendly explanation

**Example:**
```typescript
// User: "I want to track my daily mood on a scale from 1-10"
await suggestFieldAction({
  payload: {
    description: "Track my daily mood",
    purpose: "Monitor emotional patterns over time"
  }
});
// AI generates: mood-scale field (range 1-10)
```

### 2. **`create_field`** - Direct Field Creation
Creates a custom field in the schema registry after validation.

**Input:**
```typescript
// Option A: Direct field definition
{
  fieldDefinition: {
    id: string,
    name: string,
    type: FieldType,
    description?: string,
    validation?: ValidationRules,
    options?: Array<{ value: any, label: string }>
  }
}

// Option B: Generate from idea
{
  fieldIdea: {
    description: string,
    purpose: string
  }
}
```

**Validation Chain:**
1. LLM generates field definition
2. Module validator checks constraints
3. Schema registry validates uniqueness
4. Field added to schema
5. Persisted to Firestore (if authenticated)
6. Spine event emitted

**Example:**
```typescript
await createFieldAction({
  moduleId: 'therapy',
  payload: {
    fieldIdea: {
      description: "Track coping strategies I use",
      purpose: "Remember what works for me"
    }
  }
});
// Creates: coping-strategies (multiSelect)
```

### 3. **`delete_field`** - Remove Custom Field
Safely removes a custom extension field (core fields protected).

**Input:**
```typescript
{
  fieldId: string  // ID of the field to delete
}
```

**Safety:**
- Cannot delete core fields
- Only removes extension fields
- Validates field exists
- Updates Firestore
- Emits Spine event

## Module-Specific Field Generation

The AI generates context-appropriate fields based on the module:

### Therapy
- **Types**: RANGE (mood scales), TEXTAREA (reflections), SELECT (emotional states), MULTI_SELECT (triggers)
- **Focus**: Psychological wellness, emotional tracking
- **Example**: "anxiety-level" (range 1-10)

### Trainer
- **Types**: NUMBER (reps, weights), RANGE (RPE), SELECT (exercise types)
- **Focus**: Fitness metrics, workout tracking
- **Example**: "workout-intensity" (range 1-10)

### Ledger
- **Types**: NUMBER (amounts), SELECT (categories), TEXT (notes)
- **Focus**: Financial tracking, budgeting
- **Example**: "transaction-category" (select)

### Soma
- **Types**: NUMBER (measurements), DATE (tracking), MULTI_SELECT (symptoms)
- **Focus**: Biometric data, health metrics
- **Example**: "daily-symptoms" (multiSelect)

### Atlas
- **Types**: SELECT (priorities), RANGE (energy), DATE (deadlines), MULTI_SELECT (tags)
- **Focus**: Planning, task management
- **Example**: "task-priority" (select: low/medium/high)

## Architecture

### LLM Field Generation

Uses a specialized system prompt that teaches the AI to generate complete, validated field definitions:

```typescript
const FIELD_GENERATOR_PROMPT = `
You are a field definition generator for the AGNES platform.
Output JSON with:
- id: kebab-case unique ID
- name: Human-readable name
- type: TEXT|NUMBER|SELECT|MULTI_SELECT|DATE|TEXTAREA|BOOLEAN|RANGE
- description: Clear explanation
- validation: JSON Schema rules
...
`;
```

### Validation Pipeline

```
User Idea → LLM Generation → Field Validation → Module Validation → Schema Registry → Firestore
                                     ↓                    ↓                ↓
                              FieldDefinition     Module Rules    Uniqueness Check
```

### Integration Points

1. **Schema Registry** (`/lib/schema-registry.ts`)
   - Validates extensions
   - Manages core + extension fields
   - Enforces module limits

2. **Field System** (`/lib/field-system/`)
   - Field types and validation
   - Serialization/deserialization
   - JSON Schema conversion

3. **Spine Events** (`/lib/spine/spine-event-bus.ts`)
   - `FIELD_CREATED` - Field added
   - `FIELD_DELETED` - Field removed
   - `SCHEMA_EXTENDED` - Schema modified

4. **Action Hub** (`/lib/actions/action-hub.ts`)
   - Registers actions globally
   - Available to all modules

## Usage Examples

### Example 1: AI suggests a field during conversation

```typescript
// User: "Can you help me track my workout RPE?"
// AI detects need for custom field

{
  "actions": [{
    "type": "suggest_field",
    "payload": {
      "description": "Rate of Perceived Exertion for workouts",
      "purpose": "Track workout intensity subjectively"
    }
  }]
}

// AI: "I've suggested a 'Workout RPE' field (scale 1-10).
//      Would you like me to add this to your Trainer module?"
```

### Example 2: Direct field creation

```typescript
// User: "Add a field to track my coffee intake"

{
  "actions": [{
    "type": "create_field",
    "payload": {
      "fieldIdea": {
        "description": "Daily coffee consumption",
        "purpose": "Monitor caffeine intake"
      }
    }
  }]
}

// AI creates: coffee-intake (number, with validation)
// AI: "✅ I've created the 'Coffee Intake' field in your Soma module!"
```

### Example 3: Removing an unused field

```typescript
// User: "I don't need the mood-journal field anymore"

{
  "actions": [{
    "type": "delete_field",
    "payload": {
      "fieldId": "mood-journal"
    }
  }]
}

// AI: "✅ I've deleted the 'Mood Journal' field from your Therapy module."
```

## Testing

Comprehensive test suite covers:

- ✅ Field generation from ideas
- ✅ LLM response parsing (JSON, markdown)
- ✅ Module validation (duplicate IDs, max limits)
- ✅ Extension vs core field distinction
- ✅ Concurrent field operations
- ✅ Module-specific field appropriateness
- ✅ Firestore persistence (mocked)
- ✅ Spine event emission
- ✅ Error handling and edge cases

**Run tests:**
```bash
npm test -- field-suggestion-actions.test.ts
```

## Security & Validation

### Module Validators
Each module can define custom validation rules:
```typescript
{
  validateExtension(field: FieldDefinition): ValidationResult
  isFieldNameAllowed(name: string): boolean
  getRestrictedFieldIds(): string[]
}
```

### Limits
- Max extension fields per module (configurable)
- Field ID uniqueness enforced
- Core fields cannot be deleted
- Validation rules checked before creation

### Privacy
- Custom fields stored per-user
- Encrypted in Firestore (when vault is enabled)
- Only extension fields are user-modifiable

## Future Enhancements

1. **Field Templates** - Pre-defined field templates for common use cases
2. **Field Migration** - Update existing field definitions
3. **Field Dependencies** - Conditional field visibility
4. **Bulk Operations** - Create/delete multiple fields at once
5. **Field History** - Track field usage over time
6. **AI Field Suggestions** - Proactive suggestions based on usage patterns

## Related Documentation

- [Schema Registry Implementation](../../SCHEMA_REGISTRY_IMPLEMENTATION.md)
- [Field System Architecture](../field-system/ARCHITECTURE.md)
- [Action Hub](./action-hub.ts)
- [Module Manifest](../module-manifest.ts)
