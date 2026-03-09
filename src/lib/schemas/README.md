# Schema Registry

The Schema Registry is the central system for managing module schemas, custom field extensions, and schema migrations in AGNES.

## Overview

Each module (Therapy, Trainer, Ledger, Soma, Atlas) has a defined core schema with standard fields. Users can extend these schemas with custom fields to track additional data specific to their needs.

## Architecture

### Components

1. **SchemaRegistry Service** (`schema-registry.ts`)
   - Singleton service managing all schemas
   - Handles registration, validation, and persistence
   - Provides caching for performance

2. **Module Schemas** (`schemas/`)
   - `therapy-schema.ts` - Mental health and therapy tracking
   - `trainer-schema.ts` - Fitness and training tracking
   - `ledger-schema.ts` - Financial tracking and budgeting
   - `soma-schema.ts` - Physical health and biometrics
   - `atlas-schema.ts` - Energy management and planning

3. **Module Validators** (`schemas/module-validators.ts`)
   - Module-specific validation rules
   - Ensures extensions align with module purpose
   - Validates field types and naming

4. **Migrations** (`schemas/migrations/`)
   - Schema version migrations
   - Forward and backward migration support
   - Preserves data integrity during upgrades

5. **React Hook** (`hooks/use-schema-registry.ts`)
   - React interface for schema operations
   - Handles loading, extending, and persisting schemas
   - Manages loading and error states

## Usage

### Basic Schema Access

```typescript
import { SchemaRegistry } from '@/lib/schema-registry';

// Get complete schema (core + extensions)
const schema = SchemaRegistry.getSchema('therapy');

// Get only core schema
const coreSchema = SchemaRegistry.getCoreSchema('therapy');

// Check if extensions are allowed
const canExtend = SchemaRegistry.isExtensionAllowed('therapy');
```

### Using the React Hook

```tsx
import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
import { FieldType } from '@/lib/field-system/types';

function ModuleSettings({ moduleId }: { moduleId: string }) {
  const {
    schema,
    extensions,
    addExtension,
    removeExtension,
    canExtend,
    isLoading,
    error,
  } = useSchemaRegistry(moduleId);

  const handleAddField = async () => {
    try {
      await addExtension({
        id: 'customMood',
        name: 'Custom Mood Tracker',
        type: FieldType.SELECT,
        options: [
          { value: 'happy', label: 'Happy' },
          { value: 'sad', label: 'Sad' },
        ],
      });
    } catch (err) {
      console.error('Failed to add extension:', err);
    }
  };

  if (isLoading) return <div>Loading schema...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Core Fields: {schema?.coreFields.length}</h2>
      <h2>Extensions: {extensions.length}</h2>
      {canExtend && (
        <button onClick={handleAddField}>Add Custom Field</button>
      )}
    </div>
  );
}
```

### Adding Custom Extensions

```typescript
import { createFieldDefinition } from '@/lib/field-system/field-system';
import { FieldType } from '@/lib/field-system/types';

// Create a custom field
const customField = createFieldDefinition({
  id: 'weeklyReflection',
  name: 'Weekly Reflection',
  type: FieldType.TEXTAREA,
  description: 'Personal reflections at the end of each week',
  required: false,
});

// Validate and add to schema
const result = await SchemaRegistry.extendSchema('therapy', [customField]);

if (result.valid) {
  // Save to Firestore
  await SchemaRegistry.saveExtensions(userId, 'therapy');
  console.log('Extension added successfully');
} else {
  console.error('Validation errors:', result.errors);
}
```

### Schema Migrations

```typescript
import { SchemaMigration } from '@/lib/schema-registry';

// Define a migration
const migration: SchemaMigration = {
  from: '1.0.0',
  to: '1.1.0',
  up: (schema) => {
    // Add new field
    return {
      ...schema,
      version: '1.1.0',
      coreFields: [
        ...schema.coreFields,
        {
          id: 'newFeature',
          name: 'New Feature',
          type: FieldType.TEXT,
        },
      ],
    };
  },
  down: (schema) => {
    // Remove field to rollback
    return {
      ...schema,
      version: '1.0.0',
      coreFields: schema.coreFields.filter(f => f.id !== 'newFeature'),
    };
  },
};

// Register migration
SchemaRegistry.registerMigrations('therapy', [migration]);

// Execute migration
await SchemaRegistry.migrateSchema('therapy', '1.0.0', '1.1.0');
```

## Module-Specific Rules

### Therapy Module
- Extensions should relate to emotional/mental health
- Keywords: therapy, emotional, psychological, mood, anxiety, etc.
- Maximum 20 extension fields

### Trainer Module
- Extensions should relate to fitness/health/nutrition
- Keywords: fitness, workout, training, nutrition, muscle, etc.
- Maximum 20 extension fields

### Ledger Module
- Extensions must be financial/numeric types
- Must use NUMBER, RANGE, SELECT, MULTI_SELECT, or DATE types
- Keywords: financial, money, budget, expense, etc.
- Maximum 15 extension fields

### Soma Module
- Extensions must be biometric/measurement types
- Must use NUMBER, RANGE, SELECT, MULTI_SELECT, DATE, or BOOLEAN
- Keywords: health, biometric, vital, medical, measurement, etc.
- Maximum 25 extension fields

### Atlas Module
- Extensions should relate to productivity/planning
- Keywords: planning, goal, task, habit, focus, energy, etc.
- Maximum 15 extension fields

## Firestore Structure

Custom schemas are stored per-user:

```
custom_schemas/
  {userId}/
    modules/
      {moduleId}/
        - moduleId: string
        - extensionFields: FieldDefinition[]
        - version: string
        - lastModified: timestamp
        - encryptedData?: string (optional)
```

## Spine Events

The Schema Registry emits Spine events for important operations:

- `SCHEMA_EXTENDED` - When new extension fields are added
- `SCHEMA_MODIFIED` - When schema is changed (e.g., field removed)
- `SCHEMA_MIGRATED` - When schema is migrated to new version

## Testing

Run tests with:

```bash
npm test src/lib/schema-registry.test.ts
```

The test suite covers:
- Schema registration and retrieval
- Extension validation and limits
- Schema comparison and migrations
- Caching behavior
- Error handling

## Integration Points

1. **Field System** - Uses field definitions and validation from `field-system`
2. **Validation Framework** - Integrates with `validation-engine` for field validation
3. **Spine Event Bus** - Emits events for schema changes
4. **Firebase** - Persists custom schemas to Firestore
5. **GlobalSoul** - Schema changes can update global metadata

## Best Practices

1. **Lazy Loading** - Schemas are loaded on-demand, not at startup
2. **Caching** - Use built-in caching to avoid repeated lookups
3. **Validation** - Always validate extensions before adding
4. **Versioning** - Use semantic versioning for schema versions
5. **Migrations** - Provide both `up` and `down` migrations
6. **Module Alignment** - Ensure extensions align with module purpose

## Future Enhancements

- [ ] Schema templating (pre-built extension sets)
- [ ] AI-suggested extensions based on usage patterns
- [ ] Schema export/import for sharing
- [ ] Cross-module field references
- [ ] Automated migration generation
- [ ] Schema visualization tools
