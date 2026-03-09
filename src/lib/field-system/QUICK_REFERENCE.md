# Field System Quick Reference

## Import

```typescript
import {
  FieldType,
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
} from '@/lib/field-system';
```

## Field Types

| Type | Description | Example |
|------|-------------|---------|
| `TEXT` | Single-line text | Email, username |
| `TEXTAREA` | Multi-line text | Bio, notes |
| `NUMBER` | Numeric value | Age, score |
| `RANGE` | Slider (min-max-step) | Priority (1-10) |
| `BOOLEAN` | True/false | Enabled, confirmed |
| `DATE` | Date/time | Birth date, created at |
| `SELECT` | Single choice | Status, category |
| `MULTI_SELECT` | Multiple choices | Tags, interests |
| `OBJECT` | Nested structure | Address, provider info |

## Common Patterns

### Required Text Field
```typescript
createFieldDefinition({
  id: 'email',
  name: 'Email',
  type: FieldType.TEXT,
  required: true,
  validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' }
});
```

### Number with Range
```typescript
createFieldDefinition({
  id: 'age',
  name: 'Age',
  type: FieldType.NUMBER,
  validation: { minimum: 0, maximum: 120 }
});
```

### Select with Options
```typescript
createFieldDefinition({
  id: 'status',
  name: 'Status',
  type: FieldType.SELECT,
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]
});
```

### Date Field
```typescript
createFieldDefinition({
  id: 'birthdate',
  name: 'Birth Date',
  type: FieldType.DATE,
  required: false
});
```

## Validation

```typescript
const result = validateFieldValue(field, value);

if (result.isValid) {
  // Value is valid
  console.log('Valid!');
} else {
  // Show errors
  result.errors.forEach(err => {
    console.error(`${err.field}: ${err.message} (${err.code})`);
  });
}
```

## Serialization

```typescript
// Before storage
const serialized = serializeFieldValue(field, value);
const json = JSON.stringify(serialized);
// Save json...

// After loading
const json = /* load from storage */;
const serialized = JSON.parse(json);
const value = deserializeFieldValue(field, serialized);
```

## Schema Management

```typescript
// Create schema
let schema = createEmptySchema('1.0.0');

// Add field
schema = addFieldToSchema(schema, field, true);

// Get field
const field = getFieldFromSchema(schema, 'fieldId');

// Remove field
schema = removeFieldFromSchema(schema, 'fieldId');

// Compare schemas
const diff = compareFieldSchemas(oldSchema, newSchema);
```

## JSON Schema

```typescript
// Convert to JSON Schema
const jsonSchema = fieldToJsonSchema(field);

// Convert from JSON Schema
const field = jsonSchemaToField('fieldId', jsonSchema);

// Validate with JSON Schema
const result = validateAgainstSchema(data, jsonSchema);
```

## Validation Rules

### String
- `minLength`, `maxLength` - Length constraints
- `pattern` - Regex pattern (string)
- `enum` - Allowed values array

### Number
- `minimum`, `maximum` - Value range
- `multipleOf` - Must be multiple of

### Array
- `items.enum` - Allowed item values
- `uniqueItems` - No duplicates

### Object
- `properties` - Nested fields
- `required` - Required property names

## Error Codes

- `REQUIRED` - Required field missing
- `TYPE_MISMATCH` - Wrong type
- `MIN_LENGTH` / `MAX_LENGTH` - String length
- `MINIMUM` / `MAXIMUM` - Number range
- `PATTERN_MISMATCH` - Regex failed
- `ENUM_MISMATCH` - Not in options
- `UNIQUE_ITEMS` - Duplicate array items

## Metadata

Add UI hints to fields:

```typescript
createFieldDefinition({
  // ... field config ...
  metadata: {
    category: 'personal',
    order: 1,
    helpText: 'Your primary email',
    placeholder: 'user@example.com',
    icon: 'email',
    searchable: true,
    uiHint: 'password' // For special UI rendering
  }
});
```

## Best Practices

1. ✅ Always validate before storage
2. ✅ Use serialization for storage
3. ✅ Provide default values for optional fields
4. ✅ Version your schemas
5. ✅ Use metadata for UI hints
6. ❌ Don't skip validation
7. ❌ Don't store unvalidated data
8. ❌ Don't modify schemas without versioning
