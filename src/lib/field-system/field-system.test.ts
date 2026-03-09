/**
 * Test suite for the unified dynamic field system
 */

import { describe, it, expect } from 'vitest';
import {
  FieldType,
  createFieldDefinition,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
  compareFieldSchemas,
  createFieldValue,
  createEmptySchema,
  addFieldToSchema,
  fieldToJsonSchema,
  jsonSchemaToField,
  mergeSchemas,
  validateAgainstSchema,
} from './index';

describe('Field System - Type Creation', () => {
  it('should create a valid text field', () => {
    const field = createFieldDefinition({
      id: 'username',
      name: 'Username',
      type: FieldType.TEXT,
      required: true,
    });

    expect(field.id).toBe('username');
    expect(field.name).toBe('Username');
    expect(field.type).toBe(FieldType.TEXT);
    expect(field.required).toBe(true);
  });

  it('should create a number field with validation', () => {
    const field = createFieldDefinition({
      id: 'age',
      name: 'Age',
      type: FieldType.NUMBER,
      validation: {
        minimum: 0,
        maximum: 120,
      },
    });

    expect(field.validation?.minimum).toBe(0);
    expect(field.validation?.maximum).toBe(120);
  });

  it('should create a select field with options', () => {
    const field = createFieldDefinition({
      id: 'status',
      name: 'Status',
      type: FieldType.SELECT,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    });

    expect(field.options).toHaveLength(2);
    expect(field.options?.[0].value).toBe('active');
  });

  it('should throw error for invalid field ID', () => {
    expect(() => {
      createFieldDefinition({
        id: '',
        name: 'Test',
        type: FieldType.TEXT,
      });
    }).toThrow('Field ID is required');
  });

  it('should throw error for select without options', () => {
    expect(() => {
      createFieldDefinition({
        id: 'status',
        name: 'Status',
        type: FieldType.SELECT,
      });
    }).toThrow('requires options');
  });
});

describe('Field System - Validation', () => {
  it('should validate required field', () => {
    const field = createFieldDefinition({
      id: 'email',
      name: 'Email',
      type: FieldType.TEXT,
      required: true,
    });

    const result1 = validateFieldValue(field, '');
    expect(result1.isValid).toBe(false);
    expect(result1.errors[0].code).toBe('REQUIRED');

    const result2 = validateFieldValue(field, 'test@example.com');
    expect(result2.isValid).toBe(true);
  });

  it('should validate number ranges', () => {
    const field = createFieldDefinition({
      id: 'score',
      name: 'Score',
      type: FieldType.NUMBER,
      validation: {
        minimum: 0,
        maximum: 100,
      },
    });

    const result1 = validateFieldValue(field, -10);
    expect(result1.isValid).toBe(false);
    expect(result1.errors[0].code).toBe('MINIMUM');

    const result2 = validateFieldValue(field, 150);
    expect(result2.isValid).toBe(false);
    expect(result2.errors[0].code).toBe('MAXIMUM');

    const result3 = validateFieldValue(field, 50);
    expect(result3.isValid).toBe(true);
  });

  it('should validate string patterns', () => {
    const field = createFieldDefinition({
      id: 'email',
      name: 'Email',
      type: FieldType.TEXT,
      validation: {
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
      },
    });

    const result1 = validateFieldValue(field, 'invalid-email');
    expect(result1.isValid).toBe(false);

    const result2 = validateFieldValue(field, 'valid@example.com');
    expect(result2.isValid).toBe(true);
  });

  it('should validate string length', () => {
    const field = createFieldDefinition({
      id: 'username',
      name: 'Username',
      type: FieldType.TEXT,
      validation: {
        minLength: 3,
        maxLength: 20,
      },
    });

    const result1 = validateFieldValue(field, 'ab');
    expect(result1.isValid).toBe(false);
    expect(result1.errors[0].code).toBe('MIN_LENGTH');

    const result2 = validateFieldValue(field, 'a'.repeat(25));
    expect(result2.isValid).toBe(false);
    expect(result2.errors[0].code).toBe('MAX_LENGTH');

    const result3 = validateFieldValue(field, 'validuser');
    expect(result3.isValid).toBe(true);
  });

  it('should allow null for non-required fields', () => {
    const field = createFieldDefinition({
      id: 'optional',
      name: 'Optional Field',
      type: FieldType.TEXT,
      required: false,
    });

    const result = validateFieldValue(field, null);
    expect(result.isValid).toBe(true);
  });
});

describe('Field System - Serialization', () => {
  it('should serialize date fields', () => {
    const field = createFieldDefinition({
      id: 'birthdate',
      name: 'Birth Date',
      type: FieldType.DATE,
    });

    const date = new Date('2024-01-01T00:00:00.000Z');
    const serialized = serializeFieldValue(field, date);
    
    expect(typeof serialized).toBe('string');
    expect(serialized).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should deserialize date fields', () => {
    const field = createFieldDefinition({
      id: 'birthdate',
      name: 'Birth Date',
      type: FieldType.DATE,
    });

    const deserialized = deserializeFieldValue(field, '2024-01-01T00:00:00.000Z');
    
    expect(deserialized).toBeInstanceOf(Date);
    expect(deserialized.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('should handle serialization round-trip', () => {
    const field = createFieldDefinition({
      id: 'score',
      name: 'Score',
      type: FieldType.NUMBER,
    });

    const original = 42;
    const serialized = serializeFieldValue(field, original);
    const deserialized = deserializeFieldValue(field, serialized);
    
    expect(deserialized).toBe(original);
  });

  it('should serialize multiSelect as array', () => {
    const field = createFieldDefinition({
      id: 'tags',
      name: 'Tags',
      type: FieldType.MULTI_SELECT,
      options: [
        { value: 'tag1', label: 'Tag 1' },
        { value: 'tag2', label: 'Tag 2' },
      ],
    });

    const serialized = serializeFieldValue(field, ['tag1', 'tag2']);
    expect(Array.isArray(serialized)).toBe(true);
    expect(serialized).toEqual(['tag1', 'tag2']);
  });

  it('should handle null values', () => {
    const field = createFieldDefinition({
      id: 'optional',
      name: 'Optional',
      type: FieldType.TEXT,
    });

    const serialized = serializeFieldValue(field, null);
    expect(serialized).toBe(null);

    const deserialized = deserializeFieldValue(field, null);
    expect(deserialized).toBe(null);
  });
});

describe('Field System - Schema Management', () => {
  it('should create empty schema', () => {
    const schema = createEmptySchema('1.0.0');
    
    expect(schema.version).toBe('1.0.0');
    expect(schema.coreFields).toEqual([]);
    expect(schema.extensionFields).toEqual([]);
    expect(schema.metadata?.createdAt).toBeDefined();
  });

  it('should add fields to schema', () => {
    let schema = createEmptySchema('1.0.0');
    
    const field1 = createFieldDefinition({
      id: 'field1',
      name: 'Field 1',
      type: FieldType.TEXT,
    });

    const field2 = createFieldDefinition({
      id: 'field2',
      name: 'Field 2',
      type: FieldType.NUMBER,
    });

    schema = addFieldToSchema(schema, field1, true);
    schema = addFieldToSchema(schema, field2, false);

    expect(schema.coreFields).toHaveLength(1);
    expect(schema.extensionFields).toHaveLength(1);
    expect(schema.metadata?.updatedAt).toBeDefined();
  });

  it('should compare schemas', () => {
    const schema1 = createEmptySchema('1.0.0');
    const field1 = createFieldDefinition({
      id: 'field1',
      name: 'Field 1',
      type: FieldType.TEXT,
    });
    const schema1Updated = addFieldToSchema(schema1, field1, true);

    const schema2 = createEmptySchema('1.0.0');
    const field2 = createFieldDefinition({
      id: 'field2',
      name: 'Field 2',
      type: FieldType.NUMBER,
    });
    const schema2Updated = addFieldToSchema(schema2, field2, true);

    const comparison = compareFieldSchemas(schema1Updated, schema2Updated);

    expect(comparison.isIdentical).toBe(false);
    expect(comparison.added).toContain('field2');
    expect(comparison.removed).toContain('field1');
  });

  it('should detect field modifications', () => {
    const schema1 = createEmptySchema('1.0.0');
    const field1 = createFieldDefinition({
      id: 'email',
      name: 'Email',
      type: FieldType.TEXT,
      required: false,
    });
    const schema1Updated = addFieldToSchema(schema1, field1, true);

    const schema2 = createEmptySchema('1.0.0');
    const field2 = createFieldDefinition({
      id: 'email',
      name: 'Email Address',
      type: FieldType.TEXT,
      required: true,
    });
    const schema2Updated = addFieldToSchema(schema2, field2, true);

    const comparison = compareFieldSchemas(schema1Updated, schema2Updated);

    expect(comparison.isIdentical).toBe(false);
    expect(comparison.modified).toHaveLength(1);
    expect(comparison.modified[0].fieldId).toBe('email');
    expect(comparison.modified[0].changes).toContain('name: "Email" → "Email Address"');
  });
});

describe('Field System - JSON Schema Conversion', () => {
  it('should convert field to JSON Schema', () => {
    const field = createFieldDefinition({
      id: 'age',
      name: 'Age',
      type: FieldType.NUMBER,
      validation: {
        minimum: 0,
        maximum: 120,
      },
    });

    const schema = fieldToJsonSchema(field);

    expect(schema.type).toBe('number');
    expect(schema.minimum).toBe(0);
    expect(schema.maximum).toBe(120);
    expect(schema.title).toBe('Age');
  });

  it('should convert JSON Schema to field', () => {
    const schema = {
      type: 'string' as const,
      title: 'Email',
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
      minLength: 5,
    };

    const field = jsonSchemaToField('email', schema);

    expect(field.id).toBe('email');
    expect(field.name).toBe('Email');
    expect(field.type).toBe(FieldType.TEXT);
    expect(field.validation?.pattern).toBe('^[^@]+@[^@]+\\.[^@]+$');
    expect(field.validation?.minLength).toBe(5);
  });

  it('should handle bidirectional conversion', () => {
    const originalField = createFieldDefinition({
      id: 'score',
      name: 'Score',
      type: FieldType.NUMBER,
      description: 'User score',
      validation: {
        minimum: 0,
        maximum: 100,
      },
    });

    const schema = fieldToJsonSchema(originalField);
    const convertedField = jsonSchemaToField('score', schema);

    expect(convertedField.name).toBe(originalField.name);
    expect(convertedField.type).toBe(originalField.type);
    expect(convertedField.description).toBe(originalField.description);
    expect(convertedField.validation?.minimum).toBe(originalField.validation?.minimum);
  });

  it('should merge schemas', () => {
    const coreSchema = createEmptySchema('1.0.0');
    const field1 = createFieldDefinition({
      id: 'name',
      name: 'Name',
      type: FieldType.TEXT,
      required: true,
    });
    const coreSchemaUpdated = addFieldToSchema(coreSchema, field1, true);

    const extensionSchema = createEmptySchema('1.0.0');
    const field2 = createFieldDefinition({
      id: 'custom',
      name: 'Custom Field',
      type: FieldType.NUMBER,
    });
    const extensionSchemaUpdated = addFieldToSchema(extensionSchema, field2, false);

    const merged = mergeSchemas(coreSchemaUpdated, extensionSchemaUpdated);

    expect(merged.properties).toHaveProperty('name');
    expect(merged.properties).toHaveProperty('custom');
    expect(merged.required).toContain('name');
  });

  it('should validate against JSON Schema', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, minLength: 3 },
        age: { type: 'number' as const, minimum: 0 },
      },
      required: ['name'],
    };

    const result1 = validateAgainstSchema({ name: 'John', age: 25 }, schema);
    expect(result1.isValid).toBe(true);

    const result2 = validateAgainstSchema({ name: 'Jo', age: 25 }, schema);
    expect(result2.isValid).toBe(false);
    expect(result2.errors[0].code).toBe('MIN_LENGTH');

    const result3 = validateAgainstSchema({ age: 25 }, schema);
    expect(result3.isValid).toBe(false);
    expect(result3.errors[0].code).toBe('REQUIRED');
  });
});

describe('Field System - Edge Cases', () => {
  it('should handle empty strings', () => {
    const field = createFieldDefinition({
      id: 'text',
      name: 'Text',
      type: FieldType.TEXT,
      required: true,
    });

    const result = validateFieldValue(field, '');
    expect(result.isValid).toBe(false);
  });

  it('should handle type coercion in serialization', () => {
    const field = createFieldDefinition({
      id: 'num',
      name: 'Number',
      type: FieldType.NUMBER,
    });

    const serialized = serializeFieldValue(field, '42');
    expect(serialized).toBe(42);
  });

  it('should handle invalid date strings', () => {
    const field = createFieldDefinition({
      id: 'date',
      name: 'Date',
      type: FieldType.DATE,
    });

    const deserialized = deserializeFieldValue(field, 'invalid-date');
    expect(deserialized).toBe(null);
  });

  it('should use default value when deserializing null', () => {
    const field = createFieldDefinition({
      id: 'status',
      name: 'Status',
      type: FieldType.TEXT,
      defaultValue: 'active',
    });

    const deserialized = deserializeFieldValue(field, null);
    expect(deserialized).toBe('active');
  });

  it('should validate nested object fields', () => {
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
      },
    });

    const schema = fieldToJsonSchema(addressField);
    
    const result1 = validateAgainstSchema(
      { street: '123 Main St', city: 'Boston' },
      schema
    );
    expect(result1.isValid).toBe(true);

    const result2 = validateAgainstSchema(
      { street: '123 Main St' },
      schema
    );
    expect(result2.isValid).toBe(false);
  });
});

describe('Field System - FieldValue Creation', () => {
  it('should create field value with timestamp', () => {
    const fieldValue = createFieldValue('email', 'test@example.com', 'user');
    
    expect(fieldValue.fieldId).toBe('email');
    expect(fieldValue.value).toBe('test@example.com');
    expect(fieldValue.source).toBe('user');
    expect(fieldValue.timestamp).toBeDefined();
    expect(fieldValue.timestamp).toBeGreaterThan(0);
  });

  it('should default to user source', () => {
    const fieldValue = createFieldValue('name', 'John');
    expect(fieldValue.source).toBe('user');
  });
});
