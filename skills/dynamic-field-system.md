# Dynamic Field System — Agent Skill File

> **Concept:** A generalized, module-agnostic pattern for AI-augmented dynamic data dashboards. Each AGNES module implements this pattern to provide a fully functional UI (no AI required) that AI enhances with field creation, data analysis, and context-aware suggestions.

---

## Core Concept

Every module has a **dashboard** displaying structured data fields. Fields come from two sources:

1. **Template Fields (Core Schema)** — Module-defined defaults registered at startup. Immutable schema, always present. Example: Titan always has `fitnessLevel`, `workoutFrequency`, `currentWeight`.

2. **Extension Fields (Custom)** — Created by users or AI at runtime. Completely versatile — any data relevant to the module's domain. Examples in Titan: "Creatine Cycle", "Supplement Stack", "Grip Strength PR", "Sleep Duration". Validated for domain relevance by LLM, structurally validated by code.

---

## Architecture Pattern

### File Structure (Verified)

```
src/lib/field-system/
├── field-system.ts                  # Core field creation/validation logic
├── types.ts                         # FieldDefinition, FieldType, ValidationRules
├── json-schema-utils.ts             # JSON Schema v7 conversion utilities
├── examples.ts                      # Example field definitions and patterns
├── index.ts                         # Public exports
├── field-system.test.ts             # Unit tests
└── README.md

src/lib/schema-registry.ts           # SchemaRegistry singleton service
src/lib/schemas/                     # Module-specific schemas
├── therapy-schema.ts                # Agnes/Therapy module schema
├── trainer-schema.ts                # Titan/Training module schema
├── ledger-schema.ts                 # Ledger/Finance module schema
├── soma-schema.ts                   # Soma/Health module schema
├── atlas-schema.ts                  # Atlas/Productivity module schema
├── module-validators.ts             # Module-specific validators
├── migrations/schema-migrations.ts  # Schema migration definitions
├── init.ts                          # Startup registration
├── index.ts                         # Schema exports
└── examples.ts

src/lib/validation/
├── json-schema-validator.ts         # JSON Schema validation
├── validation-engine.ts             # Core validation engine
├── validators.ts                    # Validator functions
├── module-validators.ts             # Module validator registry
├── types.ts                         # Validation types
└── index.ts
```

### FieldType Enum

```typescript
enum FieldType {
  TEXT = 'text',
  NUMBER = 'number',
  SELECT = 'select',
  MULTI_SELECT = 'multiSelect',
  DATE = 'date',
  TEXTAREA = 'textarea',
  BOOLEAN = 'boolean',
  RANGE = 'range',
  OBJECT = 'object',
}
```

### FieldDefinition Interface

```typescript
interface FieldDefinition {
  /** Unique identifier (alphanumeric, underscore, hyphen) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Field type from FieldType enum */
  type: FieldType;
  /** Description of the field's purpose */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Default value for the field */
  defaultValue?: any;
  /** Validation rules in JSON Schema format */
  validation?: ValidationRules;
  /** Additional metadata for UI and categorization */
  metadata?: FieldMetadata;
  /** For nested object fields */
  properties?: Record<string, FieldDefinition>;
  /** For SELECT/MULTI_SELECT: available options */
  options?: Array<{ value: any; label: string }>;
}

interface ValidationRules {
  minimum?: number;      // For numbers/range
  maximum?: number;      // For numbers/range
  minLength?: number;    // For strings
  maxLength?: number;    // For strings
  pattern?: string;      // Regex for string validation
  enum?: any[];          // Allowed values for select
  items?: { enum?: any[] };  // For multiSelect arrays
  multipleOf?: number;   // Step increment for range
  [key: string]: any;    // Custom JSON Schema rules
}

interface FieldMetadata {
  category?: string;     // Grouping for dashboard sections
  order?: number;        // Display order hint
  uiHint?: string;       // Rendering hint (e.g., 'slider', 'chip-group')
  helpText?: string;     // Help text for users
  placeholder?: string;  // Placeholder text
  icon?: string;         // Icon identifier
  searchable?: boolean;  // Whether field is searchable
  [key: string]: any;    // Custom metadata
}
```

### FieldValue Interface

```typescript
interface FieldValue {
  fieldId: string;           // Reference to field definition
  value: any;                // The actual value
  timestamp: number;         // When set/updated (ms)
  source: 'user' | 'ai';     // Value origin
  isValid?: boolean;         // Validation state
  errors?: string[];         // Validation errors
}
```

### FieldSchema Interface

```typescript
interface FieldSchema {
  version: string;                     // Schema version for compatibility
  coreFields: FieldDefinition[];       // System-defined fields
  extensionFields: FieldDefinition[];  // User/AI-defined fields
  metadata?: {
    createdAt?: number;
    updatedAt?: number;
    createdBy?: string;
    [key: string]: any;
  };
}
```

---

## Schema Registry API

The `SchemaRegistry` is a singleton service managing all module schemas:

```typescript
import { SchemaRegistry } from '@/lib/schema-registry';

// Register a module schema definition
SchemaRegistry.registerSchema(definition: ModuleSchemaDefinition): void

// Register a module-specific validator
SchemaRegistry.registerValidator(moduleId: string, validator: ModuleSchemaValidator): void

// Register schema migrations
SchemaRegistry.registerMigrations(moduleId: string, migrations: SchemaMigration[]): void

// Get complete schema (core + extensions) for a module
SchemaRegistry.getSchema(moduleId: string): FieldSchema | null

// Get only the core schema
SchemaRegistry.getCoreSchema(moduleId: string): FieldSchema | null

// Get extension fields for a module
SchemaRegistry.getExtensions(moduleId: string): FieldDefinition[]

// Check if extensions are allowed
SchemaRegistry.isExtensionAllowed(moduleId: string): boolean

// Validate an extension field before adding
SchemaRegistry.validateExtension(moduleId: string, field: FieldDefinition): ValidationResult

// Add extension fields (validates first)
SchemaRegistry.extendSchema(moduleId: string, fields: FieldDefinition[]): Promise<ValidationResult>

// Remove an extension field
SchemaRegistry.removeExtension(moduleId: string, fieldId: string): Promise<void>

// Load extensions from Firestore for a user
SchemaRegistry.loadExtensions(userId: string, moduleId: string): Promise<void>

// Save extensions to Firestore for a user
SchemaRegistry.saveExtensions(userId: string, moduleId: string): Promise<void>

// Compare two schemas
SchemaRegistry.compareSchemas(schema1: FieldSchema, schema2: FieldSchema): SchemaDiff

// Migrate schema between versions
SchemaRegistry.migrateSchema(moduleId: string, fromVersion: string, toVersion: string): Promise<void>
```

### ModuleSchemaDefinition

```typescript
interface ModuleSchemaDefinition {
  moduleId: string;
  version: string;
  coreSchema: FieldSchema;
  allowExtensions: boolean;
  maxExtensionFields?: number;
}
```

### Max Extension Fields Per Module

| Module | Max Extensions |
|--------|----------------|
| Therapy | — |
| Trainer (Titan) | 20 |
| Soma | 25 |
| Ledger | 15 |
| Atlas | 15 |

---

## Field System Core Functions

```typescript
import {
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
  createFieldValue,
  createEmptySchema,
  addFieldToSchema,
  removeFieldFromSchema,
  getFieldFromSchema,
  compareFieldSchemas,
} from '@/lib/field-system';

// Create a validated FieldDefinition
const field = createFieldDefinition({
  id: 'creatine-cycle',
  name: 'Creatine Cycle',
  type: FieldType.SELECT,
  options: [
    { value: 'loading', label: 'Loading Phase' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'off', label: 'Off Cycle' },
  ],
  metadata: { category: 'supplements' },
});

// Validate a value against field definition
const result = validateFieldValue(field, 'maintenance');
if (!result.isValid) {
  console.error(result.errors);
}

// Serialize for storage (handles Date, arrays, etc.)
const serialized = serializeFieldValue(field, value);

// Deserialize from storage
const deserialized = deserializeFieldValue(field, rawValue);
```

### JSON Schema Utilities

```typescript
import {
  fieldToJsonSchema,
  jsonSchemaToField,
  mergeSchemas,
  validateAgainstSchema,
  fieldSchemaToJsonSchema,
} from '@/lib/field-system';

// Convert FieldDefinition to JSON Schema v7
const jsonSchema = fieldToJsonSchema(field);

// Convert JSON Schema to FieldDefinition
const fieldDef = jsonSchemaToField('age', { type: 'number', minimum: 0 });

// Merge core and extension schemas
const merged = mergeSchemas(coreSchema, extensionSchema);

// Validate data against JSON Schema
const result = validateAgainstSchema(data, schema);
```

---

## Structural Validation (Code — Always Runs)

1. **Field ID uniqueness** — No duplicates with core or other extensions
2. **Extension count limit** — Enforced per module (see table above)
3. **Restricted field IDs** — Cannot shadow core fields like `userId`
4. **Type consistency** — defaultValue matches field type
5. **Valid JSON Schema rules** — Validation rules are structurally correct
6. **Required options** — SELECT/MULTI_SELECT must have options array
7. **Required properties** — OBJECT type must have properties defined

---

## Domain Validation (LLM — Always Runs)

**No keyword lists.** The LLM is the sole semantic domain validator for all field creation paths.

- **Via Chat:** User describes what they want to track → LLM understands domain context → generates `create_field` action if appropriate → explains why not if inappropriate
- **Via Button:** User fills minimal form (name, type, options) → single LLM call validates domain relevance → approved or explained
- **AI Suggestion:** During general conversation, LLM proactively suggests fields → user accepts/dismisses

The LLM validation prompt includes:
- Module identity and domain scope
- Current core schema field list
- Current extension fields
- The proposed field definition
- Instruction: "Is this field relevant to [module domain]? If yes, confirm creation. If no, explain why and suggest the correct module if applicable."

---

## Field Creation Flows

### Flow 1: Via Chat (Field-CRUD Conversation Scope)

```
User: "I want to track my creatine cycle"
  → Isolated field-CRUD conversation (ephemeral, never persisted)
  → System prompt: schema definitions only, NO user wellness data
  → Allowed actions: suggest_field, create_field, delete_field ONLY
  → LLM generates: <action type="create_field">{field JSON}</action>
  → ActionHub → SchemaRegistry.extendSchema() (structural validation)
  → Spine event: SCHEMA_EXTENDED
  → Toast notification
  → Dashboard re-renders with new field
```

### Flow 2: Via Button (LLM Validation Call)

```
User clicks "Add Field" → minimal form opens
  → User fills: name, type, description, options (if select)
  → Submit → single LLM call with field-CRUD prompt
  → LLM approves → SchemaRegistry.extendSchema()
  → Same Spine event → toast → dashboard update
  OR
  → LLM rejects → natural language explanation shown to user
```

### Flow 3: AI Proactive Suggestion

```
During general chat, user mentions supplements
  → LLM generates: <action type="suggest_field">{description, purpose}</action>
  → Inline suggestion card in chat: "Track Supplements? [Add Field] [Dismiss]"
  → User clicks Add → same validation → same flow
```

---

## Three Conversation Scopes

Every module maintains three isolated conversation contexts:

| Scope | System Prompt Contains | Allowed Actions | Persistence |
|-------|----------------------|-----------------|-------------|
| **General** | Full profile + GlobalSoul NSV + memory + extension field values | All module actions | Firestore |
| **Scoped** | Only selected entity data (one routine, one field) | Entity-specific mutations only | Ephemeral (useState) |
| **Field CRUD** | Schema definitions only, NO user data | suggest_field, create_field, delete_field | Ephemeral (useState) |

**Implementation:** `useScopedConversation` hook — lightweight parallel conversation, never persisted.

**Action filtering:** Even if LLM hallucinates an out-of-scope action, the hook blocks it at runtime with a console warning.

---

## Context Injection (Automatic)

Extension field values are **auto-injected into base context** via `enhanceContextForModule()`. The LLM always knows about custom fields without manual iteration.

```typescript
// In GlobalSoulProvider.enhanceContextForModule():
const extensionBlock = serializeExtensionFields(moduleId);
// Produces:
// [CUSTOM TRACKED FIELDS — TRAINER]
// - Creatine Cycle: "maintenance" (select: loading/maintenance/off)
// - Daily Water (ml): 2800 (range: 0-5000)
// - Supplements: ["Protein", "Omega-3"] (multi-select)
```

This block is appended to the system prompt alongside NSV vectors and compacted insights.

### Data Storage

- Field definitions: `custom_schemas/{userId}/modules/{moduleId}` in Firestore
- Field values: `extension_field_values/{userId}/modules/{moduleId}` in Firestore
- Both encrypted client-side before persistence (AES-256-GCM)

---

## Template Registration on Startup

Each module registers its core schema at app initialization (`src/lib/schemas/init.ts`):

```typescript
import { SchemaRegistry } from '../schema-registry';
import {
  THERAPY_CORE_SCHEMA,
  TRAINER_CORE_SCHEMA,
  LEDGER_CORE_SCHEMA,
  SOMA_CORE_SCHEMA,
  ATLAS_CORE_SCHEMA,
} from './index';
import { MODULE_VALIDATORS } from './module-validators';
import { ALL_MIGRATIONS } from './migrations/schema-migrations';

export function initializeSchemas(): void {
  // Register schemas
  SchemaRegistry.registerSchema(THERAPY_CORE_SCHEMA);
  SchemaRegistry.registerSchema(TRAINER_CORE_SCHEMA);
  SchemaRegistry.registerSchema(LEDGER_CORE_SCHEMA);
  SchemaRegistry.registerSchema(SOMA_CORE_SCHEMA);
  SchemaRegistry.registerSchema(ATLAS_CORE_SCHEMA);

  // Register validators
  SchemaRegistry.registerValidator('therapy', MODULE_VALIDATORS.therapy);
  SchemaRegistry.registerValidator('trainer', MODULE_VALIDATORS.trainer);
  SchemaRegistry.registerValidator('ledger', MODULE_VALIDATORS.ledger);
  SchemaRegistry.registerValidator('soma', MODULE_VALIDATORS.soma);
  SchemaRegistry.registerValidator('atlas', MODULE_VALIDATORS.atlas);

  // Register migrations
  SchemaRegistry.registerMigrations('therapy', ALL_MIGRATIONS.therapy);
  SchemaRegistry.registerMigrations('trainer', ALL_MIGRATIONS.trainer);
  SchemaRegistry.registerMigrations('ledger', ALL_MIGRATIONS.ledger);
  SchemaRegistry.registerMigrations('soma', ALL_MIGRATIONS.soma);
  SchemaRegistry.registerMigrations('atlas', ALL_MIGRATIONS.atlas);
}
```

Templates define the base dashboard layout. Extension fields appear in a dedicated "Custom Fields" section or integrated into relevant categories.

---

## Per-Module Core Field Templates

### Titan (Trainer) — Fitness & Training
**moduleId:** `trainer` | **maxExtensions:** 20

| Field ID | Name | Type | Description |
|----------|------|------|-------------|
| `fitnessLevel` | Fitness Level | SELECT | beginner/intermediate/advanced/elite |
| `fitnessGoals` | Fitness Goals | MULTI_SELECT | weight_loss, muscle_gain, strength, etc. |
| `currentWeight` | Current Weight | NUMBER | Weight in kg/lbs |
| `targetWeight` | Target Weight | NUMBER | Target weight |
| `height` | Height | NUMBER | Height in cm/inches |
| `workoutFrequency` | Workout Frequency | SELECT | 1-2/3-4/5-6/daily per week |
| `preferredActivities` | Preferred Activities | MULTI_SELECT | cardio, strength, yoga, etc. |
| `injuries` | Injuries/Limitations | TEXTAREA | Physical limitations |
| `activityLevel` | Daily Activity Level | SELECT | sedentary to extra active |
| `nutritionGoals` | Nutrition Goals | MULTI_SELECT | calorie deficit/surplus, etc. |
| `sleepQuality` | Sleep Quality | RANGE | 0-10 |
| `recoveryScore` | Recovery Score | RANGE | 0-10 |
| `lastWorkout` | Last Workout | DATE | — |
| `nextWorkout` | Next Scheduled | DATE | — |

### Soma — Physical Health & Biometrics
**moduleId:** `soma` | **maxExtensions:** 25

| Field ID | Name | Type | Description |
|----------|------|------|-------------|
| `age` | Age | NUMBER | 0-150 |
| `biologicalSex` | Biological Sex | SELECT | male/female |
| `height` | Height | NUMBER | cm |
| `weight` | Weight | NUMBER | kg |
| `bmi` | BMI | NUMBER | Calculated |
| `restingHeartRate` | Resting Heart Rate | NUMBER | 30-200 bpm |
| `bloodPressure` | Blood Pressure | TEXT | e.g., "120/80" |
| `vo2Max` | VO2 Max | NUMBER | ml/kg/min |
| `bodyFatPercentage` | Body Fat % | NUMBER | 0-100 |
| `muscleMass` | Muscle Mass | NUMBER | kg |
| `sleepHours` | Avg Sleep Hours | NUMBER | 0-24 |
| `sleepQuality` | Sleep Quality | RANGE | 0-10 |
| `dailySteps` | Daily Steps | NUMBER | — |
| `activeMinutes` | Active Minutes | NUMBER | — |
| `hydrationLevel` | Daily Hydration | NUMBER | liters |
| `chronicConditions` | Chronic Conditions | MULTI_SELECT | diabetes, hypertension, etc. |
| `medications` | Current Medications | TEXTAREA | — |
| `supplements` | Supplements | MULTI_SELECT | multivitamin, vitamin_d, etc. |
| `energyLevel` | Energy Level | RANGE | 0-10 |
| `stressPhysical` | Physical Stress | RANGE | 0-10 |
| `lastCheckup` | Last Medical Checkup | DATE | — |
| `nextCheckup` | Next Checkup | DATE | — |

### Atlas — Energy & Productivity
**moduleId:** `atlas` | **maxExtensions:** 15

| Field ID | Name | Type | Description |
|----------|------|------|-------------|
| `energyBudget` | Daily Energy Budget | RANGE | 0-10 |
| `planningLoad` | Planning Load | RANGE | 0-10 complexity |
| `taskCompletionRate` | Task Completion Rate | NUMBER | 0-1 ratio |
| `streakHealth` | Habit Streak Health | RANGE | 0-10 |
| `urgencyPressure` | Urgency Pressure | RANGE | 0-10 |
| `peakProductivityTime` | Peak Productivity Time | SELECT | early_morning to night |
| `workStyle` | Work Style Preference | SELECT | deep_focus/pomodoro/flexible/structured |
| `priorityAreas` | Priority Life Areas | MULTI_SELECT | career, health, relationships, etc. |
| `habitTracking` | Active Habits | MULTI_SELECT | exercise, meditation, journaling, etc. |
| `goalReviewFrequency` | Goal Review Frequency | SELECT | daily/weekly/biweekly/monthly |
| `procrastinationTriggers` | Procrastination Triggers | TEXTAREA | — |
| `focusScore` | Focus Score | RANGE | 0-10 |
| `openLoopCount` | Open Loops | NUMBER | Unfinished commitments |
| `lastReview` | Last Goal Review | DATE | — |
| `nextReview` | Next Goal Review | DATE | — |

### Ledger — Finance
**moduleId:** `ledger` | **maxExtensions:** 15

| Field ID | Name | Type | Description |
|----------|------|------|-------------|
| `monthlyIncome` | Monthly Income | NUMBER | ≥0 |
| `currency` | Currency | SELECT | USD/EUR/GBP/CAD/AUD |
| `financialGoals` | Financial Goals | MULTI_SELECT | emergency_fund, debt_payoff, etc. |
| `budgetCategories` | Budget Categories | MULTI_SELECT | housing, transportation, food, etc. |
| `totalDebt` | Total Debt | NUMBER | ≥0 |
| `totalSavings` | Total Savings | NUMBER | ≥0 |
| `totalInvestments` | Total Investments | NUMBER | ≥0 |
| `riskTolerance` | Risk Tolerance | SELECT | conservative/moderate/aggressive |
| `spendingHabits` | Spending Habits | SELECT | frugal/moderate/liberal |
| `financialStressLevel` | Financial Stress | RANGE | 0-10 |
| `creditScore` | Credit Score | NUMBER | 300-850 |
| `paymentSchedule` | Payment Schedule | SELECT | weekly/biweekly/monthly/irregular |
| `lastBudgetReview` | Last Budget Review | DATE | — |
| `nextBudgetReview` | Next Budget Review | DATE | — |

---

## Interactive Dashboard Pattern

### Component Selection

Dashboard cards (routines, fields, metrics) are **interactive**:
- Tap/click → selects entity → opens ScopedChatPanel with entity-specific context
- Visual: selection glow border, context chip showing selected entity
- Deselect → closes scoped chat, clears ephemeral messages

### Field Cards (Extension Fields)

Each custom field renders as an interactive card:
- Displays current value, type icon, last updated timestamp
- Editable inline (click value to edit)
- Tap → scoped chat for that field's context
- Long press / menu → delete field (with confirmation)

### Dashboard Layout

```
┌──────────────────────────────────────────────┐
│ [Module Header]              [Chat] [Add ⊕]  │
├──────────────────────────────────────────────┤
│ Tab Bar: [Today] [Domain1] [Domain2] [Fields]│
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Core    │ │ Core    │ │ Core    │       │
│  │ Field 1 │ │ Field 2 │ │ Field 3 │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                              │
│  ── Custom Fields ──────────────────────     │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐      │
│  │ Creatine│ │ Supple- │ │ + Add    │      │
│  │ Cycle   │ │ ments   │ │   Field  │      │
│  └─────────┘ └─────────┘ └──────────┘      │
│                                              │
│  [Chat Drawer — slides from right on demand] │
└──────────────────────────────────────────────┘
```

---

## Module-Specific Contextualization

Each module applies this pattern within its own domain scope:

| Module | Domain | Example Custom Fields |
|--------|--------|----------------------|
| **Titan (Trainer)** | Fitness, workout, nutrition | Creatine Cycle, Max Deadlift, Sprint Time, Grip Strength PR |
| **Soma** | Biometrics, vitals, medical | Cortisol Level, Vitamin D Status, Allergy Severity, HRV |
| **Atlas** | Planning, habits, energy | Pomodoro Count, Deep Work Hours, Meeting Load |
| **Ledger** | Budget, debt, investments | Side Hustle Income, Crypto Portfolio, Subscription Cost |

### LLM Domain Validation Examples

```
Titan: "Track my creatine cycle" → ✅ Fitness-relevant supplement tracking
Titan: "Track my mortgage payment" → ❌ Financial data → suggest Ledger
Atlas: "Track deep work hours" → ✅ Productivity metric
Atlas: "Track my blood pressure" → ❌ Health data → suggest Soma
Ledger: "Track subscription costs" → ✅ Financial tracking
Ledger: "Track my mood" → ❌ Emotional data → suggest Agnes
```

---

## Action Hub Integration

Field operations are registered as ActionHub actions:

| Action | Trigger | Effect |
|--------|---------|--------|
| `suggest_field` | LLM proactively suggests | Shows inline suggestion card |
| `create_field` | LLM or user confirms | SchemaRegistry.extendSchema() → Spine SCHEMA_EXTENDED |
| `delete_field` | LLM or user confirms | SchemaRegistry.removeExtension() → Spine SCHEMA_MODIFIED |
| `update_field_value` | LLM or user edits | Updates extension_field_values → Spine FIELD_VALUE_UPDATED |

### Spine Event Flow

```
Action executes → Spine event emitted → SpineToastProvider shows toast
                                      → Dashboard components re-render
                                      → Schema registry cache invalidated
                                      → Context injection picks up new values
```

### Spine Events

| Event Type | Payload | Trigger |
|------------|---------|---------|
| `SCHEMA_EXTENDED` | `{ moduleId, fields[], count }` | Field(s) added |
| `SCHEMA_MODIFIED` | `{ moduleId, action: 'remove_extension', fieldId }` | Field removed |
| `SCHEMA_MIGRATED` | `{ moduleId, fromVersion, toVersion }` | Schema migrated |

---

## Module Validators

Built-in validators are auto-registered at startup (`src/lib/validation/module-validators.ts`):

```typescript
// Available validators
agnesValidator   // Therapy intake/session validation
titanValidator   // Training profiles, fitness levels, injuries
ledgerValidator  // Amounts, currencies, categories
somaValidator    // Sleep hours, heart rate, weight
atlasValidator   // Priorities, deadlines, durations

// Usage via registry
import { validateModuleField, validateModuleProfile } from '@/lib/validation/module-validators';

await validateModuleField('titan', 'fitnessLevel', 'intermediate');
await validateModuleProfile('ledger', financialData);
```

---

## Separated Concerns

### Module-Specific Issues (NOT part of this pattern)

These are bugs/features specific to individual modules:
- Titan: BarChart Y-axis dupes, RoutineBuilder orphaned, dynamic Tailwind, conditional hooks
- Soma: Readiness score algorithm tuning, clearance panel duplication
- Atlas: Energy wave chart rendering, task dependency graph
- Ledger: Transaction categorization, budget rollover logic

### Generalized Pattern (THIS skill file)

These apply to ALL modules identically:
- Dynamic field system (JSON Schema, SchemaRegistry, extension fields)
- LLM-validated field creation (both paths)
- Context injection (enhanceContextForModule with extension fields)
- Scoped conversations (useScopedConversation, 3 scopes)
- Interactive dashboard cards (selection store, scoped chat panels)
- Template registration on startup
- Spine event reactivity for field CRUD
- Field value storage in Firestore (encrypted)
- "Add Field" button integration
- Action filtering per conversation scope

---

## Implementation Checklist (Per Module)

When implementing this pattern for a new module:

1. **Define core schema** in `src/lib/schemas/{module}-schema.ts`
2. **Register schema** in `src/lib/schemas/init.ts`
3. **Create structural validator** in `src/lib/validation/module-validators.ts` (no keyword lists — structural checks only)
4. **Build dashboard page** with tab layout and field card grid
5. **Wire interactive selection** via componentSelectionStore
6. **Add "Add Field" button** → FieldCrudChatPanel or direct LLM validation
7. **Create module prompt modes** — general, scoped, field-crud
8. **Wire context injection** — ensure `enhanceContextForModule()` includes extension field values
9. **Register field actions** — suggest_field, create_field, delete_field for module
10. **Subscribe to Spine events** — SCHEMA_EXTENDED, SCHEMA_MODIFIED
11. **Test flows** — chat creation, button creation, AI suggestion, value editing, deletion
12. **Verify context** — extension fields appear in LLM system prompt

---

## Key Exports Reference

### From `@/lib/field-system`

```typescript
// Types
export type {
  FieldDefinition,
  FieldValue,
  FieldSchema,
  FieldExtensionRequest,
  FieldMetadata,
  ValidationRules,
  ValidationResult,
  ValidationOptions,
  SchemaComparison,
  FieldValueSource,
  CreateFieldParams,
  JSONSchema,
};

// Enum
export { FieldType };

// Functions
export {
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
  compareFieldSchemas,
  createFieldValue,
  createEmptySchema,
  addFieldToSchema,
  removeFieldFromSchema,
  getFieldFromSchema,
  fieldToJsonSchema,
  jsonSchemaToField,
  mergeSchemas,
  validateAgainstSchema,
  fieldSchemaToJsonSchema,
};
```

### From `@/lib/schema-registry`

```typescript
export { SchemaRegistry };  // Singleton instance
export { SchemaRegistryService };  // Class for testing
export type {
  ModuleSchemaDefinition,
  SchemaDiff,
  ModuleSchemaValidator,
  ValidationResult,
  SchemaMigration,
};
```

### From `@/lib/validation/module-validators`

```typescript
export {
  registerModuleValidator,
  getModuleValidator,
  validateModuleField,
  validateModuleProfile,
  hasModuleValidator,
  getRegisteredModules,
  moduleValidatorRegistry,
  // Built-in validators
  agnesValidator,
  titanValidator,
  ledgerValidator,
  somaValidator,
  atlasValidator,
};
export type { ModuleValidator };
```
