/**
 * Schema Registry Usage Examples
 * Demonstrates how to use the schema registry in various scenarios
 */

import { SchemaRegistry } from './schema-registry';
import { createFieldDefinition } from './field-system/field-system';
import { FieldType } from './field-system/types';
import { initializeSchemas } from './schemas/init';

// Example 1: Initialize schemas (done once at app startup)
export function example1_Initialize() {
  initializeSchemas();
  console.log('✓ All schemas initialized');
}

// Example 2: Get a schema
export function example2_GetSchema() {
  const therapySchema = SchemaRegistry.getSchema('therapy');
  
  if (therapySchema) {
    console.log(`Therapy schema v${therapySchema.version}`);
    console.log(`Core fields: ${therapySchema.coreFields.length}`);
    console.log(`Extension fields: ${therapySchema.extensionFields.length}`);
    
    // List all fields
    const allFields = [...therapySchema.coreFields, ...therapySchema.extensionFields];
    allFields.forEach(field => {
      console.log(`  - ${field.name} (${field.type})`);
    });
  }
}

// Example 3: Add a custom extension field
export async function example3_AddExtension(userId: string) {
  // Create a custom field
  const customField = createFieldDefinition({
    id: 'weeklyCheckIn',
    name: 'Weekly Check-In Score',
    type: FieldType.RANGE,
    description: 'Self-reported weekly wellness score',
    validation: {
      minimum: 0,
      maximum: 10,
    },
    metadata: {
      category: 'self-assessment',
      helpText: 'Rate your overall wellness this week from 0-10',
    },
  });

  // Validate and add
  const result = await SchemaRegistry.extendSchema('therapy', [customField]);
  
  if (result.valid) {
    console.log('✓ Extension field added');
    
    // Save to Firestore
    await SchemaRegistry.saveExtensions(userId, 'therapy');
    console.log('✓ Saved to Firestore');
  } else {
    console.error('✗ Validation failed:', result.errors);
  }
}

// Example 4: Add multiple extension fields at once
export async function example4_AddMultipleExtensions(userId: string) {
  const fields = [
    createFieldDefinition({
      id: 'morningMood',
      name: 'Morning Mood',
      type: FieldType.SELECT,
      options: [
        { value: 'great', label: '😊 Great' },
        { value: 'good', label: '🙂 Good' },
        { value: 'okay', label: '😐 Okay' },
        { value: 'low', label: '😞 Low' },
      ],
    }),
    createFieldDefinition({
      id: 'gratitudeNote',
      name: 'Daily Gratitude',
      type: FieldType.TEXTAREA,
      description: 'What are you grateful for today?',
    }),
    createFieldDefinition({
      id: 'selfCareActivities',
      name: 'Self-Care Activities',
      type: FieldType.MULTI_SELECT,
      options: [
        { value: 'meditation', label: 'Meditation' },
        { value: 'exercise', label: 'Exercise' },
        { value: 'reading', label: 'Reading' },
        { value: 'music', label: 'Listening to Music' },
        { value: 'nature', label: 'Time in Nature' },
      ],
    }),
  ];

  const result = await SchemaRegistry.extendSchema('therapy', fields);
  
  if (result.valid) {
    console.log(`✓ Added ${fields.length} extension fields`);
    await SchemaRegistry.saveExtensions(userId, 'therapy');
  }
}

// Example 5: Remove an extension field
export async function example5_RemoveExtension(userId: string) {
  try {
    await SchemaRegistry.removeExtension('therapy', 'weeklyCheckIn');
    console.log('✓ Extension field removed');
    
    // Save changes
    await SchemaRegistry.saveExtensions(userId, 'therapy');
  } catch (error) {
    console.error('✗ Failed to remove extension:', error);
  }
}

// Example 6: Load user's custom extensions
export async function example6_LoadExtensions(userId: string) {
  console.log('Loading custom extensions from Firestore...');
  
  await SchemaRegistry.loadExtensions(userId, 'therapy');
  
  const extensions = SchemaRegistry.getExtensions('therapy');
  console.log(`Loaded ${extensions.length} custom fields:`);
  extensions.forEach(field => {
    console.log(`  - ${field.name} (${field.type})`);
  });
}

// Example 7: Validate an extension before adding
export function example7_ValidateExtension() {
  const testField = createFieldDefinition({
    id: 'testField',
    name: 'Test Field',
    type: FieldType.TEXT,
  });

  const validationResult = SchemaRegistry.validateExtension('therapy', testField);
  
  if (validationResult.valid) {
    console.log('✓ Field validation passed');
  } else {
    console.log('✗ Validation errors:');
    validationResult.errors.forEach(err => {
      console.log(`  - ${err.field}: ${err.message} (${err.code})`);
    });
  }
}

// Example 8: Compare two schemas
export function example8_CompareSchemas() {
  const schema1 = SchemaRegistry.getSchema('therapy');
  
  // Make a modified copy
  const schema2 = {
    ...schema1!,
    version: '2.0.0',
    coreFields: [
      ...schema1!.coreFields,
      {
        id: 'newFeature',
        name: 'New Feature',
        type: FieldType.TEXT,
      },
    ],
  };

  const diff = SchemaRegistry.compareSchemas(schema1!, schema2);
  
  console.log('Schema Comparison:');
  console.log(`Identical: ${diff.isIdentical}`);
  if (diff.versionChange) {
    console.log(`Version: ${diff.versionChange.from} → ${diff.versionChange.to}`);
  }
  if (diff.added.length > 0) {
    console.log(`Added fields: ${diff.added.join(', ')}`);
  }
  if (diff.removed.length > 0) {
    console.log(`Removed fields: ${diff.removed.join(', ')}`);
  }
  if (diff.modified.length > 0) {
    console.log('Modified fields:');
    diff.modified.forEach(mod => {
      console.log(`  - ${mod.fieldId}: ${mod.changes.join(', ')}`);
    });
  }
}

// Example 9: Check extension limits
export function example9_CheckLimits() {
  const canExtend = SchemaRegistry.isExtensionAllowed('therapy');
  const currentExtensions = SchemaRegistry.getExtensions('therapy');
  
  console.log(`Module allows extensions: ${canExtend}`);
  console.log(`Current extension count: ${currentExtensions.length}`);
  
  // Note: Max limit is defined in the module schema definition
  // For therapy, it's 20 fields
}

// Example 10: Get only core schema (without extensions)
export function example10_GetCoreSchema() {
  const coreSchema = SchemaRegistry.getCoreSchema('therapy');
  
  if (coreSchema) {
    console.log('Core schema fields:');
    coreSchema.coreFields.forEach(field => {
      const required = field.required ? '* ' : '  ';
      console.log(`${required}${field.name} (${field.type})`);
    });
  }
}

// Example 11: Using with React Hook
export function example11_ReactUsage() {
  // This would be used in a React component:
  /*
  import { useSchemaRegistry } from '@/lib/hooks/use-schema-registry';
  
  function TherapySettings() {
    const {
      schema,
      extensions,
      addExtension,
      removeExtension,
      canExtend,
      isLoading,
      error,
    } = useSchemaRegistry('therapy');

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
      <div>
        <h2>Therapy Module Schema</h2>
        <p>Core fields: {schema?.coreFields.length}</p>
        <p>Custom fields: {extensions.length}</p>
        
        {canExtend && (
          <button onClick={() => addCustomField()}>
            Add Custom Field
          </button>
        )}
        
        <ul>
          {extensions.map(ext => (
            <li key={ext.id}>
              {ext.name}
              <button onClick={() => removeExtension(ext.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  */
  
  console.log('See comment in code for React usage example');
}

// Example 12: Schema migrations (advanced)
export async function example12_MigrateSchema() {
  const currentVersion = SchemaRegistry.getSchemaVersion('therapy');
  console.log(`Current version: ${currentVersion}`);
  
  // Migrate to new version (if migration exists)
  try {
    await SchemaRegistry.migrateSchema('therapy', '1.0.0', '1.1.0');
    console.log('✓ Schema migrated successfully');
    
    const newVersion = SchemaRegistry.getSchemaVersion('therapy');
    console.log(`New version: ${newVersion}`);
  } catch (error) {
    console.log('No migration available or not needed');
  }
}

// Run all examples
export async function runAllExamples(userId: string) {
  console.log('=== Schema Registry Examples ===\n');
  
  console.log('Example 1: Initialize');
  example1_Initialize();
  
  console.log('\nExample 2: Get Schema');
  example2_GetSchema();
  
  console.log('\nExample 3: Add Extension');
  await example3_AddExtension(userId);
  
  console.log('\nExample 4: Add Multiple Extensions');
  await example4_AddMultipleExtensions(userId);
  
  console.log('\nExample 5: Remove Extension');
  await example5_RemoveExtension(userId);
  
  console.log('\nExample 6: Load Extensions');
  await example6_LoadExtensions(userId);
  
  console.log('\nExample 7: Validate Extension');
  example7_ValidateExtension();
  
  console.log('\nExample 8: Compare Schemas');
  example8_CompareSchemas();
  
  console.log('\nExample 9: Check Limits');
  example9_CheckLimits();
  
  console.log('\nExample 10: Get Core Schema');
  example10_GetCoreSchema();
  
  console.log('\nExample 11: React Usage');
  example11_ReactUsage();
  
  console.log('\nExample 12: Schema Migration');
  await example12_MigrateSchema();
}
