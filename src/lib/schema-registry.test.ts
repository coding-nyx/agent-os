/**
 * Schema Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SchemaRegistry,
  SchemaRegistryService,
  ModuleSchemaDefinition,
} from './schema-registry';
import { FieldType } from './field-system/types';
import { createFieldDefinition } from './field-system/field-system';

// Mock Firebase
vi.mock('./firebase', () => ({
  getFirebase: () => ({
    db: null,
    auth: null,
    app: null,
    storage: null,
  }),
}));

// Mock Spine
vi.mock('./spine/spine-event-bus', () => ({
  Spine: {
    emit: vi.fn(),
  },
}));

describe('SchemaRegistry', () => {
  // Test schema definition
  const testSchema: ModuleSchemaDefinition = {
    moduleId: 'test',
    version: '1.0.0',
    allowExtensions: true,
    maxExtensionFields: 5,
    coreSchema: {
      version: '1.0.0',
      coreFields: [
        {
          id: 'userId',
          name: 'User ID',
          type: FieldType.TEXT,
          required: true,
        },
        {
          id: 'testField',
          name: 'Test Field',
          type: FieldType.TEXT,
        },
      ],
      extensionFields: [],
    },
  };

  beforeEach(() => {
    // Reset singleton for each test
    SchemaRegistryService.reset();
    SchemaRegistry.clearCache();
  });

  afterEach(() => {
    SchemaRegistryService.reset();
  });

  describe('Schema Registration', () => {
    it('should register a schema', () => {
      SchemaRegistry.registerSchema(testSchema);
      
      const schema = SchemaRegistry.getSchema('test');
      expect(schema).not.toBeNull();
      expect(schema?.version).toBe('1.0.0');
      expect(schema?.coreFields).toHaveLength(2);
    });

    it('should return null for unregistered module', () => {
      const schema = SchemaRegistry.getSchema('nonexistent');
      expect(schema).toBeNull();
    });

    it('should get core schema only', () => {
      SchemaRegistry.registerSchema(testSchema);
      
      const coreSchema = SchemaRegistry.getCoreSchema('test');
      expect(coreSchema).not.toBeNull();
      expect(coreSchema?.coreFields).toHaveLength(2);
      expect(coreSchema?.extensionFields).toHaveLength(0);
    });

    it('should get schema version', () => {
      SchemaRegistry.registerSchema(testSchema);
      
      const version = SchemaRegistry.getSchemaVersion('test');
      expect(version).toBe('1.0.0');
    });

    it('should return 0.0.0 for unregistered module version', () => {
      const version = SchemaRegistry.getSchemaVersion('nonexistent');
      expect(version).toBe('0.0.0');
    });
  });

  describe('Extension Management', () => {
    beforeEach(() => {
      SchemaRegistry.registerSchema(testSchema);
    });

    it('should check if extensions are allowed', () => {
      expect(SchemaRegistry.isExtensionAllowed('test')).toBe(true);
      expect(SchemaRegistry.isExtensionAllowed('nonexistent')).toBe(false);
    });

    it('should validate and add extension field', async () => {
      const extensionField = createFieldDefinition({
        id: 'customField',
        name: 'Custom Field',
        type: FieldType.TEXT,
        description: 'A custom extension field',
      });

      const result = await SchemaRegistry.extendSchema('test', [extensionField]);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const extensions = SchemaRegistry.getExtensions('test');
      expect(extensions).toHaveLength(1);
      expect(extensions[0].id).toBe('customField');
    });

    it('should reject duplicate field ID', async () => {
      const duplicateField = createFieldDefinition({
        id: 'userId', // Already exists in core schema
        name: 'Duplicate',
        type: FieldType.TEXT,
      });

      const result = await SchemaRegistry.extendSchema('test', [duplicateField]);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('DUPLICATE_FIELD_ID');
    });

    it('should enforce max extension fields limit', async () => {
      // Add 5 fields (the limit)
      for (let i = 0; i < 5; i++) {
        const field = createFieldDefinition({
          id: `ext${i}`,
          name: `Extension ${i}`,
          type: FieldType.TEXT,
        });
        await SchemaRegistry.extendSchema('test', [field]);
      }

      // Try to add one more
      const extraField = createFieldDefinition({
        id: 'extra',
        name: 'Extra Field',
        type: FieldType.TEXT,
      });

      const result = await SchemaRegistry.extendSchema('test', [extraField]);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MAX_EXTENSIONS_REACHED');
    });

    it('should remove extension field', async () => {
      const field = createFieldDefinition({
        id: 'toRemove',
        name: 'To Remove',
        type: FieldType.TEXT,
      });

      await SchemaRegistry.extendSchema('test', [field]);
      expect(SchemaRegistry.getExtensions('test')).toHaveLength(1);

      await SchemaRegistry.removeExtension('test', 'toRemove');
      expect(SchemaRegistry.getExtensions('test')).toHaveLength(0);
    });

    it('should throw error when removing non-existent field', async () => {
      await expect(
        SchemaRegistry.removeExtension('test', 'nonexistent')
      ).rejects.toThrow('Extension field nonexistent not found');
    });

    it('should reject extensions for module without extension support', async () => {
      const noExtSchema: ModuleSchemaDefinition = {
        ...testSchema,
        moduleId: 'noext',
        allowExtensions: false,
      };
      SchemaRegistry.registerSchema(noExtSchema);

      const field = createFieldDefinition({
        id: 'test',
        name: 'Test',
        type: FieldType.TEXT,
      });

      const result = await SchemaRegistry.extendSchema('noext', [field]);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('EXTENSIONS_NOT_ALLOWED');
    });
  });

  describe('Schema Comparison', () => {
    it('should detect identical schemas', () => {
      const schema1 = testSchema.coreSchema;
      const schema2 = { ...testSchema.coreSchema };

      const diff = SchemaRegistry.compareSchemas(schema1, schema2);
      
      expect(diff.isIdentical).toBe(true);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('should detect added fields', () => {
      const schema1 = testSchema.coreSchema;
      const schema2 = {
        ...schema1,
        coreFields: [
          ...schema1.coreFields,
          {
            id: 'newField',
            name: 'New Field',
            type: FieldType.TEXT,
          },
        ],
      };

      const diff = SchemaRegistry.compareSchemas(schema1, schema2);
      
      expect(diff.isIdentical).toBe(false);
      expect(diff.added).toContain('newField');
      expect(diff.removed).toHaveLength(0);
    });

    it('should detect removed fields', () => {
      const schema1 = testSchema.coreSchema;
      const schema2 = {
        ...schema1,
        coreFields: schema1.coreFields.filter(f => f.id !== 'testField'),
      };

      const diff = SchemaRegistry.compareSchemas(schema1, schema2);
      
      expect(diff.isIdentical).toBe(false);
      expect(diff.removed).toContain('testField');
      expect(diff.added).toHaveLength(0);
    });

    it('should detect modified fields', () => {
      const schema1 = testSchema.coreSchema;
      const schema2 = {
        ...schema1,
        coreFields: schema1.coreFields.map(f =>
          f.id === 'testField'
            ? { ...f, name: 'Modified Field' }
            : f
        ),
      };

      const diff = SchemaRegistry.compareSchemas(schema1, schema2);
      
      expect(diff.isIdentical).toBe(false);
      expect(diff.modified).toHaveLength(1);
      expect(diff.modified[0].fieldId).toBe('testField');
      expect(diff.modified[0].changes).toContain(
        'name: "Test Field" → "Modified Field"'
      );
    });

    it('should detect version changes', () => {
      const schema1 = { ...testSchema.coreSchema, version: '1.0.0' };
      const schema2 = { ...testSchema.coreSchema, version: '2.0.0' };

      const diff = SchemaRegistry.compareSchemas(schema1, schema2);
      
      expect(diff.isIdentical).toBe(false);
      expect(diff.versionChange).toEqual({
        from: '1.0.0',
        to: '2.0.0',
      });
    });
  });

  describe('Schema Migrations', () => {
    beforeEach(() => {
      SchemaRegistry.registerSchema(testSchema);
      
      // Register test migrations
      SchemaRegistry.registerMigrations('test', [
        {
          from: '1.0.0',
          to: '2.0.0',
          up: (schema) => ({
            ...schema,
            version: '2.0.0',
            coreFields: [
              ...schema.coreFields,
              {
                id: 'migratedField',
                name: 'Migrated Field',
                type: FieldType.TEXT,
              },
            ],
          }),
          down: (schema) => ({
            ...schema,
            version: '1.0.0',
            coreFields: schema.coreFields.filter(
              f => f.id !== 'migratedField'
            ),
          }),
        },
      ]);
    });

    it('should migrate schema to new version', async () => {
      await SchemaRegistry.migrateSchema('test', '1.0.0', '2.0.0');
      
      const schema = SchemaRegistry.getSchema('test');
      expect(schema?.version).toBe('2.0.0');
      expect(schema?.coreFields.some(f => f.id === 'migratedField')).toBe(true);
    });

    it('should throw error if no migrations registered', async () => {
      await expect(
        SchemaRegistry.migrateSchema('nonexistent', '1.0.0', '2.0.0')
      ).rejects.toThrow('No migrations registered');
    });

    it('should throw error if migration path not found', async () => {
      await expect(
        SchemaRegistry.migrateSchema('test', '1.0.0', '3.0.0')
      ).rejects.toThrow('No migration found');
    });
  });

  describe('Validation', () => {
    beforeEach(() => {
      SchemaRegistry.registerSchema(testSchema);
    });

    it('should validate field definition', async () => {
      const validField = createFieldDefinition({
        id: 'valid',
        name: 'Valid Field',
        type: FieldType.NUMBER,
        validation: {
          minimum: 0,
          maximum: 100,
        },
      });

      const result = SchemaRegistry.validateExtension('test', validField);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid field ID format', async () => {
      expect(() => {
        createFieldDefinition({
          id: 'invalid field!', // Invalid characters
          name: 'Invalid',
          type: FieldType.TEXT,
        });
      }).toThrow('Field ID must contain only alphanumeric characters');
    });

    it('should reject empty field name', () => {
      expect(() => {
        createFieldDefinition({
          id: 'test',
          name: '', // Empty name
          type: FieldType.TEXT,
        });
      }).toThrow('Field name is required');
    });
  });

  describe('Caching', () => {
    it('should cache schemas', () => {
      SchemaRegistry.registerSchema(testSchema);
      
      // First call
      const schema1 = SchemaRegistry.getSchema('test');
      
      // Second call should return cached version
      const schema2 = SchemaRegistry.getSchema('test');
      
      expect(schema1).toBe(schema2); // Same reference
    });

    it('should invalidate cache when adding extension', async () => {
      SchemaRegistry.registerSchema(testSchema);
      
      const schema1 = SchemaRegistry.getSchema('test');
      
      const field = createFieldDefinition({
        id: 'new',
        name: 'New Field',
        type: FieldType.TEXT,
      });
      await SchemaRegistry.extendSchema('test', [field]);
      
      const schema2 = SchemaRegistry.getSchema('test');
      
      expect(schema1).not.toBe(schema2); // Different reference
      expect(schema2?.extensionFields).toHaveLength(1);
    });

    it('should clear all caches', () => {
      SchemaRegistry.registerSchema(testSchema);
      SchemaRegistry.getSchema('test'); // Cache it
      
      SchemaRegistry.clearCache();
      
      // Schema should still be accessible (not removed, just cache cleared)
      const schema = SchemaRegistry.getSchema('test');
      expect(schema).not.toBeNull();
    });
  });
});
