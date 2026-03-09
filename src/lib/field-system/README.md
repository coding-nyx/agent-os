# Unified Dynamic Field System

The field system provides the foundation for all dynamic field functionality in AGNES, enabling extensible data structures across modules.

## Overview

The field system allows you to:
- Define typed fields with validation rules
- Serialize/deserialize field values for storage
- Convert between field definitions and JSON Schema
- Compare field schemas to detect changes
- Validate data against field definitions

## Installation

```typescript
import {
  FieldType,
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
} from '@/lib/field-system';
```

## Core Concepts

### Field Types

Supported field types:
- `TEXT` - Single-line text input
- `TEXTAREA` - Multi-line text input
- `NUMBER` - Numeric values
- `RANGE` - Numeric slider with step
- `BOOLEAN` - True/false values
- `DATE` - Date/time values
- `SELECT` - Single selection from options
- `MULTI_SELECT` - Multiple selections from options
- `OBJECT` - Nested object with properties

### Field Definition

A field definition describes the structure and constraints of a field:

```typescript
const emailField = createFieldDefinition({
  id: 'email',
  name: 'Email Address',
  type: FieldType.TEXT,
  required: true,
  validation: {
    pattern: '^[^@]+@[^@]+\\.[^@]+$',
    minLength: 5,
  },
  metadata: {
    helpText: 'Your primary email address',
    category: 'contact',
  }
});
```

### Field Schema

A schema is a collection of field definitions:

```typescript
let schema = createEmptySchema('1.0.0');
schema = addFieldToSchema(schema, emailField, true); // core field
schema = addFieldToSchema(schema, customField, false); // extension field
```

## Usage Examples

### Creating Fields

```typescript
// Text field with validation
const usernameField = createFieldDefinition({
  id: 'username',
  name: 'Username',
  type: FieldType.TEXT,
  required: true,
  validation: {
    minLength: 3,
    maxLength: 20,
    pattern: '^[a-zA-Z0-9_]+$',
  },
});

// Number field with range
const ageField = createFieldDefinition({
  id: 'age',
  name: 'Age',
  type: FieldType.NUMBER,
  validation: {
    minimum: 0,
    maximum: 120,
  },
});

// Select field with options
const statusField = createFieldDefinition({
  id: 'status',
  name: 'Status',
  type: FieldType.SELECT,
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'pending', label: 'Pending' },
  ],
});

// Date field
const birthdateField = createFieldDefinition({
  id: 'birthdate',
  name: 'Birth Date',
  type: FieldType.DATE,
  required: false,
});

// Nested object field
const addressField = createFieldDefinition({
  id: 'address',
  name: 'Address',
  type: FieldType.OBJECT,
  properties: {
    street: createFieldDefinition({
      id: 'street',
      name: 'Street',
      type: FieldType.TEXT,
      required: true,
    }),
    city: createFieldDefinition({
      id: 'city',
      name: 'City',
      type: FieldType.TEXT,
      required: true,
    }),
    zipCode: createFieldDefinition({
      id: 'zipCode',
      name: 'ZIP Code',
      type: FieldType.TEXT,
      validation: {
        pattern: '^\\d{5}(-\\d{4})?$',
      },
    }),
  },
});
```

### Validating Values

```typescript
// Validate a value
const result = validateFieldValue(emailField, 'user@example.com');

if (result.isValid) {
  console.log('Valid!');
} else {
  console.error('Validation errors:', result.errors);
  // errors: [{ field: 'email', message: '...', code: 'PATTERN_MISMATCH' }]
}

// Check required fields
const emptyResult = validateFieldValue(emailField, '');
// emptyResult.isValid === false
// emptyResult.errors[0].code === 'REQUIRED'
```

### Serialization

```typescript
// Serialize for storage (converts to JSON-compatible format)
const date = new Date('2024-01-01');
const serialized = serializeFieldValue(birthdateField, date);
// serialized === "2024-01-01T00:00:00.000Z"

// Deserialize from storage
const deserialized = deserializeFieldValue(birthdateField, serialized);
// deserialized instanceof Date === true
```

### Working with Schemas

```typescript
// Create a schema
let schema = createEmptySchema('1.0.0');

// Add fields
schema = addFieldToSchema(schema, emailField, true);
schema = addFieldToSchema(schema, usernameField, true);
schema = addFieldToSchema(schema, customField, false);

// Get a field
const field = getFieldFromSchema(schema, 'email');

// Remove a field
schema = removeFieldFromSchema(schema, 'customField');

// Compare schemas
const comparison = compareFieldSchemas(oldSchema, newSchema);
console.log('Added:', comparison.added);
console.log('Removed:', comparison.removed);
console.log('Modified:', comparison.modified);
```

### JSON Schema Conversion

```typescript
// Convert field to JSON Schema
const jsonSchema = fieldToJsonSchema(emailField);
// {
//   type: 'string',
//   title: 'Email Address',
//   pattern: '^[^@]+@[^@]+\\.[^@]+$',
//   minLength: 5
// }

// Convert JSON Schema to field
const field = jsonSchemaToField('email', jsonSchema);

// Validate using JSON Schema
const validationResult = validateAgainstSchema(
  { email: 'test@example.com' },
  jsonSchema
);

// Merge multiple schemas
const mergedSchema = mergeSchemas(coreSchema, extensionSchema);
```

## Validation Rules

The system uses JSON Schema v7 validation rules:

### String Validation
- `minLength` - Minimum string length
- `maxLength` - Maximum string length
- `pattern` - Regular expression pattern (string)
- `enum` - Array of allowed values

### Number Validation
- `minimum` - Minimum value (inclusive)
- `maximum` - Maximum value (inclusive)
- `multipleOf` - Value must be a multiple of this number

### Array Validation
- `items.enum` - Allowed values for array items
- `uniqueItems` - Whether array items must be unique

### Object Validation
- `properties` - Nested field definitions
- `required` - Array of required property names

## Best Practices

### 1. Use Type-Safe Field Creation

```typescript
// Good - validates at creation time
const field = createFieldDefinition({
  id: 'status',
  name: 'Status',
  type: FieldType.SELECT,
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
});

// Bad - will throw error (select requires options)
const badField = createFieldDefinition({
  id: 'status',
  name: 'Status',
  type: FieldType.SELECT,
  // Missing options!
});
```

### 2. Validate Before Storage

```typescript
// Always validate before storing
const result = validateFieldValue(field, userInput);
if (result.isValid) {
  const serialized = serializeFieldValue(field, userInput);
  await storage.save(serialized);
} else {
  throw new Error(`Validation failed: ${result.errors.map(e => e.message).join(', ')}`);
}
```

### 3. Handle Default Values

```typescript
const field = createFieldDefinition({
  id: 'theme',
  name: 'Theme',
  type: FieldType.SELECT,
  defaultValue: 'light',
  options: [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ],
});

// When deserializing, null values return the default
const value = deserializeFieldValue(field, null);
// value === 'light'
```

### 4. Use Metadata for UI Hints

```typescript
const field = createFieldDefinition({
  id: 'password',
  name: 'Password',
  type: FieldType.TEXT,
  metadata: {
    uiHint: 'password', // Tell UI to mask input
    helpText: 'Must be at least 8 characters',
    category: 'security',
    order: 2,
  },
  validation: {
    minLength: 8,
  },
});
```

### 5. Version Your Schemas

```typescript
// Track schema versions for migrations
const v1Schema = createEmptySchema('1.0.0');
// ... add fields ...

const v2Schema = createEmptySchema('2.0.0');
// ... add new fields or modify existing ones ...

// Compare to detect what changed
const changes = compareFieldSchemas(v1Schema, v2Schema);
if (!changes.isIdentical) {
  console.log('Schema migration needed!');
  // Perform migration logic
}
```

## Integration with E2EE

The field system is designed to work seamlessly with AGNES's encryption layer:

```typescript
// All field values are JSON-serializable
const serialized = serializeFieldValue(field, value);
const encrypted = await encrypt(JSON.stringify(serialized));
await storage.save(encrypted);

// Later...
const decrypted = await decrypt(storedData);
const serialized = JSON.parse(decrypted);
const value = deserializeFieldValue(field, serialized);
```

## Error Handling

All validation errors include:
- `field` - The field identifier
- `message` - Human-readable error message
- `code` - Machine-readable error code

Common error codes:
- `REQUIRED` - Required field is missing
- `TYPE_MISMATCH` - Value type doesn't match field type
- `MIN_LENGTH` / `MAX_LENGTH` - String length validation
- `MINIMUM` / `MAXIMUM` - Number range validation
- `PATTERN_MISMATCH` - Regex pattern validation failed
- `ENUM_MISMATCH` - Value not in allowed options
- `UNIQUE_ITEMS` - Array contains duplicate items

## TypeScript Support

The field system is fully typed:

```typescript
import type {
  FieldDefinition,
  FieldSchema,
  FieldValue,
  ValidationResult,
  SchemaComparison,
} from '@/lib/field-system';

// Type-safe field definitions
const field: FieldDefinition = { /* ... */ };

// Type-safe validation results
const result: ValidationResult = validateFieldValue(field, value);
if (result.isValid) {
  // TypeScript knows result.errors might be empty
}
```

## Testing

The field system includes comprehensive tests covering:
- Field creation and validation
- Serialization/deserialization
- Schema management
- JSON Schema conversion
- Edge cases (null, undefined, type coercion)

Run tests:
```bash
npm run test src/lib/field-system/field-system.test.ts
```

## Architecture

```
field-system/
├── types.ts              # TypeScript interfaces and types
├── field-system.ts       # Core field operations
├── json-schema-utils.ts  # JSON Schema conversion
├── index.ts              # Public API exports
└── field-system.test.ts  # Comprehensive test suite
```

## Future Enhancements

Potential future additions:
- Computed/derived fields
- Field dependencies (conditional validation)
- Custom validators via plugins
- Field templates/presets
- Internationalization of labels/errors
- Field history/audit trail
