# Dynamic Field System — Agent Skill File

> **Concept:** A generalized, module-agnostic pattern for AI-augmented dynamic data dashboards. Each AGNES module implements this pattern to provide a fully functional UI (no AI required) that AI enhances with field creation, data analysis, and context-aware suggestions.

---

## Core Concept

Every module has a **dashboard** displaying structured data fields. Fields come from two sources:

1. **Template Fields (Core Schema)** — Module-defined defaults registered at startup. Immutable schema, always present. Example: Titan always has `fitnessLevel`, `workoutFrequency`, `currentWeight`.

2. **Extension Fields (Custom)** — Created by users or AI at runtime. Completely versatile — any data relevant to the module's domain. Examples in Titan: "Creatine Cycle", "Supplement Stack", "Grip Strength PR", "Sleep Duration". Validated for domain relevance by LLM, structurally validated by code.

---

## Architecture Pattern

### Field Definition (JSON Schema v7)

```typescript
interface FieldDefinition {
  id: string;               // kebab-case unique ID
  name: string;             // Human-readable display name
  type: FieldType;          // TEXT | NUMBER | RANGE | SELECT | MULTI_SELECT | BOOLEAN | DATE | TEXTAREA | OBJECT
  description?: string;     // What this field tracks
  required?: boolean;
  defaultValue?: any;
  validation?: ValidationRules;  // min, max, pattern, enum, etc.
  metadata?: {
    category?: string;      // Grouping for dashboard sections
    order?: number;         // Display order within category
    uiHint?: string;        // Rendering hint (e.g., 'slider', 'chip-group')
    helpText?: string;
    placeholder?: string;
    icon?: string;          // Lucide icon name
    searchable?: boolean;
  };
  options?: Array<{ value: any; label: string }>;  // For SELECT/MULTI_SELECT
}
```

### Schema Registry (Singleton)

- `SchemaRegistry.registerSchema(moduleId, schema)` — Register core + extension schemas
- `SchemaRegistry.addExtensionField(moduleId, field)` — Add a custom field (structural validation only)
- `SchemaRegistry.removeExtensionField(moduleId, fieldId)` — Remove a custom field
- `SchemaRegistry.getSchema(moduleId)` → `{ coreFields, extensionFields, version }`
- Max extension fields per module: configurable (trainer=20, soma=25, ledger=15, atlas=15)

### Structural Validation (Code — Always Runs)

1. Field ID uniqueness (no duplicates with core or other extensions)
2. Extension count limit
3. Restricted field IDs (cannot shadow core fields like `userId`)
4. Type consistency (defaultValue matches field type)
5. Valid JSON Schema validation rules

### Domain Validation (LLM — Always Runs)

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
  → ActionHub → SchemaRegistry.addExtensionField() (structural validation)
  → Spine event: FIELD_CREATED
  → Toast notification
  → Dashboard re-renders with new field
```

### Flow 2: Via Button (LLM Validation Call)

```
User clicks "Add Field" → minimal form opens
  → User fills: name, type, description, options (if select)
  → Submit → single LLM call with field-CRUD prompt
  → LLM approves → SchemaRegistry.addExtensionField()
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

- Field definitions: `custom_schemas/{moduleId}` in SchemaRegistry
- Field values: `extension_field_values/{userId}/modules/{moduleId}` in Firestore
- Both encrypted client-side before persistence (AES-256-GCM)

---

## Template Registration on Startup

Each module registers its core schema at app initialization (`src/lib/schemas/init.ts`):

```typescript
export function initializeSchemas() {
  SchemaRegistry.registerSchema('trainer', TRAINER_CORE_SCHEMA);
  SchemaRegistry.registerSchema('soma', SOMA_CORE_SCHEMA);
  SchemaRegistry.registerSchema('ledger', LEDGER_CORE_SCHEMA);
  SchemaRegistry.registerSchema('atlas', ATLAS_CORE_SCHEMA);
  
  // Register validators (structural only — no keyword gates)
  SchemaRegistry.registerValidator('trainer', trainerStructuralValidator);
  SchemaRegistry.registerValidator('soma', somaStructuralValidator);
  // ...
  
  // Load persisted extensions from Firestore
  SchemaRegistry.loadExtensions(userId);
}
```

Templates define the base dashboard layout. Extension fields appear in a dedicated "Custom Fields" section or integrated into relevant categories.

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

| Module | Domain | Example Core Fields | Example Custom Fields |
|--------|--------|--------------------|-----------------------|
| **Titan (Training)** | Fitness, workout, nutrition | fitnessLevel, workoutFrequency, currentWeight | Creatine Cycle, Max Deadlift, Sprint Time |
| **Titan-Soma (Health)** | Biometrics, vitals, medical | restingHeartRate, bloodPressure, vo2Max | Cortisol Level, Vitamin D Status, Allergy Severity |
| **Atlas (Productivity)** | Planning, habits, energy | energyBudget, focusScore, taskCompletionRate | Pomodoro Count, Deep Work Hours, Meeting Load |
| **Ledger (Financial)** | Budget, debt, investments | monthlyIncome, totalDebt, totalSavings | Side Hustle Income, Crypto Portfolio, Subscription Cost |

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
| `create_field` | LLM or user confirms | SchemaRegistry.addExtensionField() → Spine FIELD_CREATED |
| `delete_field` | LLM or user confirms | SchemaRegistry.removeExtensionField() → Spine FIELD_DELETED |
| `update_field_value` | LLM or user edits | Updates extension_field_values → Spine FIELD_VALUE_UPDATED |

### Spine Event Flow

```
Action executes → Spine event emitted → SpineToastProvider shows toast
                                      → Dashboard components re-render
                                      → Schema registry cache invalidated
                                      → Context injection picks up new values
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
3. **Create structural validator** (no keyword lists — structural checks only)
4. **Build dashboard page** with tab layout and field card grid
5. **Wire interactive selection** via componentSelectionStore
6. **Add "Add Field" button** → FieldCrudChatPanel or direct LLM validation
7. **Create module prompt modes** — general, scoped, field-crud
8. **Wire context injection** — ensure `enhanceContextForModule()` includes extension field values
9. **Register field actions** — suggest_field, create_field, delete_field for module
10. **Subscribe to Spine events** — FIELD_CREATED, FIELD_DELETED, FIELD_VALUE_UPDATED
11. **Test flows** — chat creation, button creation, AI suggestion, value editing, deletion
12. **Verify context** — extension fields appear in LLM system prompt

---

## File Locations

```
src/lib/field-system/          — Core field types, validation, JSON Schema utils
src/lib/schema-registry.ts     — Schema registration and extension management
src/lib/schemas/               — Module-specific schema definitions
src/lib/schemas/init.ts        — Startup registration
src/lib/schemas/module-validators.ts — Structural validators (LLM replaces keyword validation)
src/lib/validation/            — Generic validation engine
src/lib/actions/field-suggestion-actions.ts — AI field CRUD actions
src/lib/hooks/use-scoped-conversation.ts   — Scoped conversation hook (NEW)
src/lib/hooks/use-extension-field-values.ts — Extension field values hook (NEW)
src/lib/stores/component-selection-store.ts — Selection store (NEW)
src/lib/global-soul-context.tsx — Context injection (enhanceContextForModule)
src/core/components/FieldCrudChatPanel.tsx  — Field CRUD chat panel (NEW)
src/core/components/ScopedChatPanel.tsx     — Scoped chat panel (NEW)
```
