/**
 * Unified Dynamic Field System - Type Definitions
 * 
 * This module provides the foundational types for AGNES's dynamic field system,
 * supporting extensible data structures across all modules.
 */

/**
 * Supported field types in the dynamic field system
 */
export enum FieldType {
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

/**
 * Source of a field value, tracking its origin
 */
export type FieldValueSource = 'user' | 'ai';

/**
 * Validation rules in JSON Schema v7 format
 */
export interface ValidationRules {
  /** Minimum value (for numbers) or length (for strings) */
  minimum?: number;
  /** Maximum value (for numbers) or length (for strings) */
  maximum?: number;
  /** Minimum length for strings */
  minLength?: number;
  /** Maximum length for strings */
  maxLength?: number;
  /** Pattern (regex) for string validation */
  pattern?: string;
  /** Enum values for select fields */
  enum?: any[];
  /** Array of allowed values for multiSelect */
  items?: {
    enum?: any[];
  };
  /** For range fields: step increment */
  multipleOf?: number;
  /** Custom JSON Schema rules */
  [key: string]: any;
}

/**
 * Extended metadata for field definitions
 */
export interface FieldMetadata {
  /** Category or grouping */
  category?: string;
  /** Display order hint */
  order?: number;
  /** UI hint for rendering */
  uiHint?: string;
  /** Help text for users */
  helpText?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Icon identifier */
  icon?: string;
  /** Whether field is searchable */
  searchable?: boolean;
  /** Custom metadata */
  [key: string]: any;
}

/**
 * Core definition of a dynamic field
 */
export interface FieldDefinition {
  /** Unique identifier for the field */
  id: string;
  /** Human-readable name */
  name: string;
  /** Field type */
  type: FieldType;
  /** Description of the field's purpose */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Default value for the field */
  defaultValue?: any;
  /** Validation rules in JSON Schema format */
  validation?: ValidationRules;
  /** Additional metadata */
  metadata?: FieldMetadata;
  /** For nested object fields */
  properties?: Record<string, FieldDefinition>;
  /** For select/multiSelect: available options */
  options?: Array<{ value: any; label: string }>;
}

/**
 * A value instance for a field
 */
export interface FieldValue {
  /** Reference to the field definition */
  fieldId: string;
  /** The actual value */
  value: any;
  /** When the value was set/updated */
  timestamp: number;
  /** Source of the value */
  source: FieldValueSource;
  /** Optional validation state */
  isValid?: boolean;
  /** Optional validation errors */
  errors?: string[];
}

/**
 * Complete field schema definition
 */
export interface FieldSchema {
  /** Schema version for compatibility tracking */
  version: string;
  /** Core fields defined by the system */
  coreFields: FieldDefinition[];
  /** User or AI-defined extension fields */
  extensionFields: FieldDefinition[];
  /** Schema metadata */
  metadata?: {
    /** When schema was created */
    createdAt?: number;
    /** When schema was last updated */
    updatedAt?: number;
    /** Author/creator */
    createdBy?: string;
    /** Custom metadata */
    [key: string]: any;
  };
}

/**
 * Request to create a new extension field
 */
export interface FieldExtensionRequest {
  /** Suggested field ID */
  id: string;
  /** Field name */
  name: string;
  /** Field type */
  type: FieldType;
  /** Field description */
  description?: string;
  /** Whether field is required */
  required?: boolean;
  /** Default value */
  defaultValue?: any;
  /** Validation rules */
  validation?: ValidationRules;
  /** Additional metadata */
  metadata?: FieldMetadata;
  /** Requestor (user or AI agent) */
  requestedBy: string;
  /** Reason for the field */
  justification?: string;
  /** For select fields: options */
  options?: Array<{ value: any; label: string }>;
}

/**
 * Result of schema comparison
 */
export interface SchemaComparison {
  /** Whether schemas are identical */
  isIdentical: boolean;
  /** Fields added in new schema */
  added: string[];
  /** Fields removed in new schema */
  removed: string[];
  /** Fields modified in new schema */
  modified: Array<{
    fieldId: string;
    changes: string[];
  }>;
  /** Version change */
  versionChange?: {
    from: string;
    to: string;
  };
}

/**
 * Options for field validation
 */
export interface ValidationOptions {
  /** Whether to perform strict validation */
  strict?: boolean;
  /** Whether to coerce types */
  coerceTypes?: boolean;
  /** Custom error messages */
  customMessages?: Record<string, string>;
}

/**
 * Result of field validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  /** Coerced value (if coercion was enabled) */
  value?: any;
}
