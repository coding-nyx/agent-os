/**
 * Example usage of the unified dynamic field system
 * 
 * This file demonstrates practical patterns for using the field system
 * in different scenarios.
 */

import {
  FieldType,
  createFieldDefinition,
  createEmptySchema,
  addFieldToSchema,
  validateFieldValue,
  serializeFieldValue,
  deserializeFieldValue,
  compareFieldSchemas,
  fieldToJsonSchema,
  mergeSchemas,
  type FieldSchema,
  type FieldValue,
} from './index';

// ============================================================================
// Example 1: User Profile Schema
// ============================================================================

export function createUserProfileSchema(): FieldSchema {
  let schema = createEmptySchema('1.0.0');

  // Core identity fields
  const emailField = createFieldDefinition({
    id: 'email',
    name: 'Email',
    type: FieldType.TEXT,
    required: true,
    validation: {
      pattern: '^[^@]+@[^@]+\\.[^@]+$',
      minLength: 5,
      maxLength: 255,
    },
    metadata: {
      category: 'identity',
      order: 1,
      helpText: 'Your primary email address',
    },
  });

  const displayNameField = createFieldDefinition({
    id: 'displayName',
    name: 'Display Name',
    type: FieldType.TEXT,
    required: true,
    validation: {
      minLength: 2,
      maxLength: 50,
    },
    metadata: {
      category: 'identity',
      order: 2,
      helpText: 'Name shown to other users',
    },
  });

  const birthDateField = createFieldDefinition({
    id: 'birthDate',
    name: 'Birth Date',
    type: FieldType.DATE,
    required: false,
    metadata: {
      category: 'personal',
      order: 3,
    },
  });

  const bioField = createFieldDefinition({
    id: 'bio',
    name: 'Bio',
    type: FieldType.TEXTAREA,
    required: false,
    validation: {
      maxLength: 500,
    },
    defaultValue: '',
    metadata: {
      category: 'personal',
      order: 4,
      placeholder: 'Tell us about yourself...',
    },
  });

  // Add fields to schema
  schema = addFieldToSchema(schema, emailField, true);
  schema = addFieldToSchema(schema, displayNameField, true);
  schema = addFieldToSchema(schema, birthDateField, true);
  schema = addFieldToSchema(schema, bioField, true);

  return schema;
}

// ============================================================================
// Example 2: Wellness Goal Schema
// ============================================================================

export function createWellnessGoalSchema(): FieldSchema {
  let schema = createEmptySchema('1.0.0');

  const goalNameField = createFieldDefinition({
    id: 'goalName',
    name: 'Goal Name',
    type: FieldType.TEXT,
    required: true,
    validation: {
      minLength: 3,
      maxLength: 100,
    },
    metadata: {
      category: 'goal',
      order: 1,
    },
  });

  const goalTypeField = createFieldDefinition({
    id: 'goalType',
    name: 'Goal Type',
    type: FieldType.SELECT,
    required: true,
    options: [
      { value: 'physical', label: 'Physical Health' },
      { value: 'mental', label: 'Mental Health' },
      { value: 'nutrition', label: 'Nutrition' },
      { value: 'sleep', label: 'Sleep' },
      { value: 'mindfulness', label: 'Mindfulness' },
      { value: 'other', label: 'Other' },
    ],
    metadata: {
      category: 'goal',
      order: 2,
    },
  });

  const targetValueField = createFieldDefinition({
    id: 'targetValue',
    name: 'Target Value',
    type: FieldType.NUMBER,
    required: true,
    validation: {
      minimum: 0,
    },
    metadata: {
      category: 'goal',
      order: 3,
      helpText: 'Numeric target for your goal',
    },
  });

  const priorityField = createFieldDefinition({
    id: 'priority',
    name: 'Priority',
    type: FieldType.RANGE,
    required: false,
    defaultValue: 5,
    validation: {
      minimum: 1,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'goal',
      order: 4,
      helpText: 'How important is this goal? (1-10)',
    },
  });

  const tagsField = createFieldDefinition({
    id: 'tags',
    name: 'Tags',
    type: FieldType.MULTI_SELECT,
    required: false,
    options: [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'urgent', label: 'Urgent' },
      { value: 'longterm', label: 'Long-term' },
    ],
    metadata: {
      category: 'organization',
      order: 5,
    },
  });

  schema = addFieldToSchema(schema, goalNameField, true);
  schema = addFieldToSchema(schema, goalTypeField, true);
  schema = addFieldToSchema(schema, targetValueField, true);
  schema = addFieldToSchema(schema, priorityField, true);
  schema = addFieldToSchema(schema, tagsField, true);

  return schema;
}

// ============================================================================
// Example 3: Complex Nested Schema (Medical Record)
// ============================================================================

export function createMedicalRecordSchema(): FieldSchema {
  let schema = createEmptySchema('1.0.0');

  const recordTypeField = createFieldDefinition({
    id: 'recordType',
    name: 'Record Type',
    type: FieldType.SELECT,
    required: true,
    options: [
      { value: 'appointment', label: 'Appointment' },
      { value: 'test', label: 'Test Result' },
      { value: 'prescription', label: 'Prescription' },
      { value: 'note', label: 'General Note' },
    ],
  });

  const dateField = createFieldDefinition({
    id: 'date',
    name: 'Date',
    type: FieldType.DATE,
    required: true,
  });

  const providerField = createFieldDefinition({
    id: 'provider',
    name: 'Healthcare Provider',
    type: FieldType.OBJECT,
    required: false,
    properties: {
      name: createFieldDefinition({
        id: 'name',
        name: 'Provider Name',
        type: FieldType.TEXT,
        required: true,
      }),
      specialty: createFieldDefinition({
        id: 'specialty',
        name: 'Specialty',
        type: FieldType.TEXT,
        required: false,
      }),
      phone: createFieldDefinition({
        id: 'phone',
        name: 'Phone',
        type: FieldType.TEXT,
        required: false,
        validation: {
          pattern: '^\\+?[1-9]\\d{1,14}$',
        },
      }),
    },
  });

  const notesField = createFieldDefinition({
    id: 'notes',
    name: 'Notes',
    type: FieldType.TEXTAREA,
    required: false,
    validation: {
      maxLength: 2000,
    },
  });

  const isConfidentialField = createFieldDefinition({
    id: 'isConfidential',
    name: 'Confidential',
    type: FieldType.BOOLEAN,
    defaultValue: false,
    metadata: {
      helpText: 'Mark this record as confidential',
    },
  });

  schema = addFieldToSchema(schema, recordTypeField, true);
  schema = addFieldToSchema(schema, dateField, true);
  schema = addFieldToSchema(schema, providerField, true);
  schema = addFieldToSchema(schema, notesField, true);
  schema = addFieldToSchema(schema, isConfidentialField, true);

  return schema;
}

// ============================================================================
// Example 4: Dynamic Extension Fields
// ============================================================================

export function extendSchemaWithCustomField(
  baseSchema: FieldSchema,
  customFieldRequest: {
    id: string;
    name: string;
    type: FieldType;
    description?: string;
  }
): FieldSchema {
  const customField = createFieldDefinition({
    id: customFieldRequest.id,
    name: customFieldRequest.name,
    type: customFieldRequest.type,
    description: customFieldRequest.description,
    required: false,
    metadata: {
      category: 'custom',
      createdBy: 'user',
    },
  });

  return addFieldToSchema(baseSchema, customField, false);
}

// ============================================================================
// Example 5: Validation Workflow
// ============================================================================

export function validateUserInput(
  schema: FieldSchema,
  data: Record<string, any>
): {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  validatedData: Record<string, any>;
} {
  const errors: Array<{ field: string; message: string }> = [];
  const validatedData: Record<string, any> = {};

  // Get all fields from schema
  const allFields = [...schema.coreFields, ...schema.extensionFields];

  for (const field of allFields) {
    const value = data[field.id];

    // Validate the field value
    const result = validateFieldValue(field, value);

    if (!result.isValid) {
      // Collect errors
      result.errors.forEach(error => {
        errors.push({
          field: field.id,
          message: `${field.name}: ${error.message}`,
        });
      });
    } else {
      // Serialize valid value
      validatedData[field.id] = serializeFieldValue(field, value);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedData,
  };
}

// ============================================================================
// Example 6: Storage Integration
// ============================================================================

export interface StorageAdapter {
  save(key: string, data: string): Promise<void>;
  load(key: string): Promise<string | null>;
}

export class FieldDataManager {
  constructor(
    private schema: FieldSchema,
    private storage: StorageAdapter
  ) {}

  async saveData(userId: string, data: Record<string, any>): Promise<void> {
    // Validate all fields
    const validation = validateUserInput(this.schema, data);
    
    if (!validation.isValid) {
      throw new Error(
        `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
      );
    }

    // Store as JSON
    const json = JSON.stringify(validation.validatedData);
    await this.storage.save(`user:${userId}:data`, json);
  }

  async loadData(userId: string): Promise<Record<string, any>> {
    const json = await this.storage.load(`user:${userId}:data`);
    
    if (!json) {
      return {};
    }

    const rawData = JSON.parse(json);
    const deserializedData: Record<string, any> = {};

    // Deserialize all fields
    const allFields = [...this.schema.coreFields, ...this.schema.extensionFields];
    
    for (const field of allFields) {
      if (field.id in rawData) {
        deserializedData[field.id] = deserializeFieldValue(
          field,
          rawData[field.id]
        );
      }
    }

    return deserializedData;
  }
}

// ============================================================================
// Example 7: Schema Migration
// ============================================================================

export function migrateSchema(
  oldSchema: FieldSchema,
  newSchema: FieldSchema,
  oldData: Record<string, any>
): Record<string, any> {
  const comparison = compareFieldSchemas(oldSchema, newSchema);
  const newData: Record<string, any> = { ...oldData };

  // Handle removed fields
  for (const removedField of comparison.removed) {
    delete newData[removedField];
  }

  // Handle added fields with default values
  const allNewFields = [...newSchema.coreFields, ...newSchema.extensionFields];
  for (const addedFieldId of comparison.added) {
    const field = allNewFields.find(f => f.id === addedFieldId);
    if (field && field.defaultValue !== undefined) {
      newData[field.id] = field.defaultValue;
    }
  }

  // Handle modified fields (revalidate)
  for (const modification of comparison.modified) {
    const field = allNewFields.find(f => f.id === modification.fieldId);
    if (field && modification.fieldId in newData) {
      const result = validateFieldValue(field, newData[modification.fieldId]);
      if (!result.isValid) {
        // Use default value if existing value is no longer valid
        newData[modification.fieldId] = field.defaultValue;
      }
    }
  }

  return newData;
}

// ============================================================================
// Example 8: JSON Schema Export
// ============================================================================

export function exportSchemaAsJsonSchema(schema: FieldSchema) {
  const jsonSchema = mergeSchemas(schema);
  
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: `AGNES Schema v${schema.version}`,
    ...jsonSchema,
    metadata: schema.metadata,
  };
}

// ============================================================================
// Example Usage
// ============================================================================

// Example: Create and use a user profile
async function exampleUsage(storage: StorageAdapter) {
  // Create schema
  const schema = createUserProfileSchema();

  // Create data manager
  const manager = new FieldDataManager(schema, storage);

  // Save user data
  await manager.saveData('user123', {
    email: 'user@example.com',
    displayName: 'John Doe',
    birthDate: new Date('1990-01-01'),
    bio: 'Software developer and wellness enthusiast',
  });

  // Load user data
  const userData = await manager.loadData('user123');
  console.log('Loaded user data:', userData);

  // Extend schema with custom field
  const extendedSchema = extendSchemaWithCustomField(schema, {
    id: 'favoriteColor',
    name: 'Favorite Color',
    type: FieldType.TEXT,
    description: "User's favorite color",
  });

  // Export as JSON Schema
  const jsonSchema = exportSchemaAsJsonSchema(extendedSchema);
  console.log('JSON Schema:', JSON.stringify(jsonSchema, null, 2));
}
