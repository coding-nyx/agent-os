/**
 * AGNES Schema Registry
 * Manages core schemas, custom field extensions, and schema migrations
 */

import {
  FieldSchema,
  FieldDefinition,
  ValidationResult as FieldValidationResult,
  FieldType,
} from './field-system/types';
import { validateFieldValue } from './field-system/field-system';
import { getNexusDataLayer } from './data-layer/provider';
import { Spine } from './spine/spine-event-bus';

/**
 * Module schema definition with extension settings
 */
export interface ModuleSchemaDefinition {
  moduleId: string;
  version: string;
  coreSchema: FieldSchema;
  allowExtensions: boolean;
  maxExtensionFields?: number;
}

/**
 * Schema difference result
 */
export interface SchemaDiff {
  isIdentical: boolean;
  added: string[];
  removed: string[];
  modified: Array<{
    fieldId: string;
    changes: string[];
  }>;
  versionChange?: {
    from: string;
    to: string;
  };
}

/**
 * Module-specific validator interface
 */
export interface ModuleSchemaValidator {
  validateExtension(field: FieldDefinition): ValidationResult;
  isFieldNameAllowed(name: string): boolean;
  getRestrictedFieldIds(): string[];
}

/**
 * Validation result compatible with validation framework
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

/**
 * Schema migration definition
 */
export interface SchemaMigration {
  from: string;
  to: string;
  up: (schema: FieldSchema) => FieldSchema;
  down: (schema: FieldSchema) => FieldSchema;
}

/**
 * Firestore schema storage format
 */
interface FirestoreCustomSchema {
  moduleId: string;
  extensionFields: FieldDefinition[];
  version: string;
  lastModified: string;
  encryptedData?: string;
}

/**
 * Schema Registry Service
 * Singleton pattern for managing module schemas
 */
class SchemaRegistryService {
  private static instance: SchemaRegistryService | null = null;
  
  private schemas = new Map<string, ModuleSchemaDefinition>();
  private validators = new Map<string, ModuleSchemaValidator>();
  private migrations = new Map<string, SchemaMigration[]>();
  private schemaCache = new Map<string, FieldSchema>();
  private extensionCache = new Map<string, FieldDefinition[]>();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): SchemaRegistryService {
    if (!SchemaRegistryService.instance) {
      SchemaRegistryService.instance = new SchemaRegistryService();
    }
    return SchemaRegistryService.instance;
  }

  /**
   * Register a module schema definition
   */
  registerSchema(definition: ModuleSchemaDefinition): void {
    if (this.schemas.has(definition.moduleId)) {
      console.warn(
        `[SchemaRegistry] Schema for module ${definition.moduleId} already registered. Overwriting.`
      );
    }
    
    this.schemas.set(definition.moduleId, definition);
    this.schemaCache.delete(definition.moduleId); // Invalidate cache
    
    console.log(
      `[SchemaRegistry] Registered schema for ${definition.moduleId} v${definition.version}`
    );
  }

  /**
   * Register a module validator
   */
  registerValidator(moduleId: string, validator: ModuleSchemaValidator): void {
    this.validators.set(moduleId, validator);
  }

  /**
   * Register migrations for a module
   */
  registerMigrations(moduleId: string, migrations: SchemaMigration[]): void {
    this.migrations.set(moduleId, migrations);
  }

  /**
   * Get complete schema (core + extensions) for a module
   */
  getSchema(moduleId: string): FieldSchema | null {
    // Check cache first
    const cached = this.schemaCache.get(moduleId);
    if (cached) {
      return cached;
    }

    const definition = this.schemas.get(moduleId);
    if (!definition) {
      return null;
    }

    // Get any loaded extensions
    const extensions = this.extensionCache.get(moduleId) || [];
    
    // Combine core schema with extensions
    const schema: FieldSchema = {
      ...definition.coreSchema,
      extensionFields: extensions,
    };

    // Cache the result
    this.schemaCache.set(moduleId, schema);
    
    return schema;
  }

  /**
   * Get only the core schema for a module
   */
  getCoreSchema(moduleId: string): FieldSchema | null {
    const definition = this.schemas.get(moduleId);
    return definition ? definition.coreSchema : null;
  }

  /**
   * Get extension fields for a module
   */
  getExtensions(moduleId: string): FieldDefinition[] {
    return this.extensionCache.get(moduleId) || [];
  }

  /**
   * Check if extensions are allowed for a module
   */
  isExtensionAllowed(moduleId: string): boolean {
    const definition = this.schemas.get(moduleId);
    return definition?.allowExtensions || false;
  }

  /**
   * Validate an extension field
   */
  validateExtension(
    moduleId: string,
    field: FieldDefinition
  ): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    // Check if module exists
    const definition = this.schemas.get(moduleId);
    if (!definition) {
      errors.push({
        field: 'moduleId',
        message: `Module ${moduleId} not found`,
        code: 'MODULE_NOT_FOUND',
      });
      return { valid: false, errors };
    }

    // Check if extensions are allowed
    if (!definition.allowExtensions) {
      errors.push({
        field: 'module',
        message: `Module ${moduleId} does not allow extensions`,
        code: 'EXTENSIONS_NOT_ALLOWED',
      });
      return { valid: false, errors };
    }

    // Check max extension limit
    const currentExtensions = this.extensionCache.get(moduleId) || [];
    if (
      definition.maxExtensionFields &&
      currentExtensions.length >= definition.maxExtensionFields
    ) {
      errors.push({
        field: 'extensions',
        message: `Maximum extension fields (${definition.maxExtensionFields}) reached`,
        code: 'MAX_EXTENSIONS_REACHED',
      });
      return { valid: false, errors };
    }

    // Check for field ID conflicts
    const schema = this.getSchema(moduleId);
    if (schema) {
      const allFields = [...schema.coreFields, ...schema.extensionFields];
      if (allFields.some(f => f.id === field.id)) {
        errors.push({
          field: 'id',
          message: `Field ID ${field.id} already exists`,
          code: 'DUPLICATE_FIELD_ID',
        });
        return { valid: false, errors };
      }
    }

    // Validate field definition itself
    const fieldValidation = validateFieldValue(field, field.defaultValue);
    if (!fieldValidation.isValid) {
      fieldValidation.errors.forEach(err => {
        errors.push({
          field: err.field,
          message: err.message,
          code: err.code,
        });
      });
    }

    // Module-specific validation
    const validator = this.validators.get(moduleId);
    if (validator) {
      const moduleValidation = validator.validateExtension(field);
      if (!moduleValidation.valid) {
        errors.push(...moduleValidation.errors);
      }

      // Check restricted field IDs
      const restrictedIds = validator.getRestrictedFieldIds();
      if (restrictedIds.includes(field.id)) {
        errors.push({
          field: 'id',
          message: `Field ID ${field.id} is restricted for this module`,
          code: 'RESTRICTED_FIELD_ID',
        });
      }

      // Check field name
      if (!validator.isFieldNameAllowed(field.name)) {
        errors.push({
          field: 'name',
          message: `Field name "${field.name}" is not allowed for this module`,
          code: 'INVALID_FIELD_NAME',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Add an extension field to a module
   */
  async extendSchema(
    moduleId: string,
    fields: FieldDefinition[]
  ): Promise<ValidationResult> {
    const errors: ValidationResult['errors'] = [];

    // Validate each field
    for (const field of fields) {
      const validation = this.validateExtension(moduleId, field);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Add to cache
    const currentExtensions = this.extensionCache.get(moduleId) || [];
    const newExtensions = [...currentExtensions, ...fields];
    this.extensionCache.set(moduleId, newExtensions);
    
    // Invalidate schema cache
    this.schemaCache.delete(moduleId);

    // Emit Spine event
    Spine.emit({
      type: 'SCHEMA_EXTENDED',
      source: 'schema-registry',
      domain: 'system',
      priority: 'alert',
      data: {
        moduleId,
        fields: fields.map(f => f.id),
        count: fields.length,
      },
      cascadeDepth: 0,
    });

    return { valid: true, errors: [] };
  }

  /**
   * Remove an extension field from a module
   */
  async removeExtension(moduleId: string, fieldId: string): Promise<void> {
    const extensions = this.extensionCache.get(moduleId) || [];
    const filtered = extensions.filter(f => f.id !== fieldId);
    
    if (filtered.length === extensions.length) {
      throw new Error(`Extension field ${fieldId} not found in module ${moduleId}`);
    }

    this.extensionCache.set(moduleId, filtered);
    this.schemaCache.delete(moduleId);

    // Emit Spine event
    Spine.emit({
      type: 'SCHEMA_MODIFIED',
      source: 'schema-registry',
      domain: 'system',
      priority: 'alert',
      data: {
        moduleId,
        action: 'remove_extension',
        fieldId,
      },
      cascadeDepth: 0,
    });
  }

  /**
   * Get schema version for a module
   */
  getSchemaVersion(moduleId: string): string {
    const definition = this.schemas.get(moduleId);
    return definition?.version || '0.0.0';
  }

  /**
   * Compare two schemas
   */
  compareSchemas(schema1: FieldSchema, schema2: FieldSchema): SchemaDiff {
    const diff: SchemaDiff = {
      isIdentical: true,
      added: [],
      removed: [],
      modified: [],
    };

    // Check version
    if (schema1.version !== schema2.version) {
      diff.isIdentical = false;
      diff.versionChange = {
        from: schema1.version,
        to: schema2.version,
      };
    }

    // Get all fields
    const allFields1 = [...schema1.coreFields, ...schema1.extensionFields];
    const allFields2 = [...schema2.coreFields, ...schema2.extensionFields];

    const fieldMap1 = new Map(allFields1.map(f => [f.id, f]));
    const fieldMap2 = new Map(allFields2.map(f => [f.id, f]));

    // Find added fields
    fieldMap2.forEach((field, id) => {
      if (!fieldMap1.has(id)) {
        diff.added.push(id);
        diff.isIdentical = false;
      }
    });

    // Find removed and modified fields
    fieldMap1.forEach((field1, id) => {
      const field2 = fieldMap2.get(id);
      
      if (!field2) {
        diff.removed.push(id);
        diff.isIdentical = false;
      } else {
        const changes = this.compareFields(field1, field2);
        if (changes.length > 0) {
          diff.modified.push({ fieldId: id, changes });
          diff.isIdentical = false;
        }
      }
    });

    return diff;
  }

  /**
   * Compare two field definitions
   */
  private compareFields(field1: FieldDefinition, field2: FieldDefinition): string[] {
    const changes: string[] = [];

    if (field1.name !== field2.name) {
      changes.push(`name: "${field1.name}" → "${field2.name}"`);
    }

    if (field1.type !== field2.type) {
      changes.push(`type: ${field1.type} → ${field2.type}`);
    }

    if (field1.required !== field2.required) {
      changes.push(`required: ${field1.required} → ${field2.required}`);
    }

    if (JSON.stringify(field1.defaultValue) !== JSON.stringify(field2.defaultValue)) {
      changes.push('defaultValue changed');
    }

    if (JSON.stringify(field1.validation) !== JSON.stringify(field2.validation)) {
      changes.push('validation rules changed');
    }

    return changes;
  }

  /**
   * Migrate schema from one version to another
   */
  async migrateSchema(
    moduleId: string,
    fromVersion: string,
    toVersion: string
  ): Promise<void> {
    const migrations = this.migrations.get(moduleId);
    if (!migrations) {
      throw new Error(`No migrations registered for module ${moduleId}`);
    }

    // Find migration path
    const migration = migrations.find(
      m => m.from === fromVersion && m.to === toVersion
    );

    if (!migration) {
      throw new Error(
        `No migration found from ${fromVersion} to ${toVersion} for ${moduleId}`
      );
    }

    // Get current schema
    const schema = this.getSchema(moduleId);
    if (!schema) {
      throw new Error(`Schema not found for module ${moduleId}`);
    }

    // Apply migration
    const migratedSchema = migration.up(schema);
    
    // Update cache
    this.schemaCache.set(moduleId, migratedSchema);

    // Emit event
    Spine.emit({
      type: 'SCHEMA_MIGRATED',
      source: 'schema-registry',
      domain: 'system',
      priority: 'critical',
      data: {
        moduleId,
        fromVersion,
        toVersion,
      },
      cascadeDepth: 0,
    });

    console.log(
      `[SchemaRegistry] Migrated ${moduleId} schema from ${fromVersion} to ${toVersion}`
    );
  }

  /**
   * Load extensions from Firestore for a user
   */
  async loadExtensions(userId: string, moduleId: string): Promise<void> {
    try {
      const dataLayer = getNexusDataLayer();
      const data = await dataLayer.getDocument<FirestoreCustomSchema>(
        `custom_schemas/${userId}/modules`,
        moduleId
      );

      if (data) {
        this.extensionCache.set(moduleId, data.extensionFields || []);
        this.schemaCache.delete(moduleId); // Invalidate cache
        
        console.log(
          `[SchemaRegistry] Loaded ${data.extensionFields?.length || 0} extensions for ${moduleId}`
        );
      } else {
        // No custom schema, use empty extensions
        this.extensionCache.set(moduleId, []);
      }
    } catch (error) {
      console.error(`[SchemaRegistry] Failed to load extensions for ${moduleId}:`, error);
      // Use empty extensions on error
      this.extensionCache.set(moduleId, []);
    }
  }

  /**
   * Save extensions to Firestore for a user
   */
  async saveExtensions(userId: string, moduleId: string): Promise<void> {
    const extensions = this.extensionCache.get(moduleId) || [];
    const definition = this.schemas.get(moduleId);
    
    if (!definition) {
      throw new Error(`Module ${moduleId} not found`);
    }

    const data: FirestoreCustomSchema = {
      moduleId,
      extensionFields: extensions,
      version: definition.version,
      lastModified: new Date().toISOString(),
    };

    try {
      const dataLayer = getNexusDataLayer();
      await dataLayer.setDocument(`custom_schemas/${userId}/modules`, moduleId, data);
      
      console.log(
        `[SchemaRegistry] Saved ${extensions.length} extensions for ${moduleId}`
      );
    } catch (error) {
      console.error(`[SchemaRegistry] Failed to save extensions for ${moduleId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.schemaCache.clear();
    this.extensionCache.clear();
  }

  /**
   * Reset the registry (useful for testing)
   */
  static reset(): void {
    SchemaRegistryService.instance = null;
  }
}

// Export singleton instance
export const SchemaRegistry = SchemaRegistryService.getInstance();

// Export class for testing
export { SchemaRegistryService };
