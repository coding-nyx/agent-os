/**
 * Unified Dynamic Field System - JSON Schema Utilities
 * 
 * Provides conversion between FieldDefinition and JSON Schema v7,
 * enabling interoperability with standard validation libraries.
 */

import type { FieldDefinition, FieldSchema, ValidationResult } from './types';
import { FieldType } from './types';

/**
 * JSON Schema v7 type
 */
export interface JSONSchema {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: any[];
  items?: JSONSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  multipleOf?: number;
  default?: any;
  description?: string;
  title?: string;
  [key: string]: any;
}

/**
 * Converts a FieldDefinition to JSON Schema v7 format
 * 
 * @param field - The field definition to convert
 * @returns JSON Schema representation
 * 
 * @example
 * ```ts
 * const field: FieldDefinition = {
 *   id: 'age',
 *   name: 'Age',
 *   type: FieldType.NUMBER,
 *   validation: { minimum: 0, maximum: 120 }
 * };
 * const schema = fieldToJsonSchema(field);
 * // { type: 'number', minimum: 0, maximum: 120, title: 'Age' }
 * ```
 */
export function fieldToJsonSchema(field: FieldDefinition): JSONSchema {
  const schema: JSONSchema = {
    title: field.name,
    description: field.description,
  };

  // Map field type to JSON Schema type
  switch (field.type) {
    case FieldType.TEXT:
    case FieldType.TEXTAREA:
      schema.type = 'string';
      break;
    case FieldType.NUMBER:
    case FieldType.RANGE:
      schema.type = 'number';
      break;
    case FieldType.BOOLEAN:
      schema.type = 'boolean';
      break;
    case FieldType.DATE:
      schema.type = 'string';
      schema.format = 'date-time';
      break;
    case FieldType.SELECT:
      schema.type = 'string';
      if (field.options) {
        schema.enum = field.options.map(opt => opt.value);
      }
      break;
    case FieldType.MULTI_SELECT:
      schema.type = 'array';
      schema.items = {
        type: 'string',
      };
      if (field.options) {
        schema.items.enum = field.options.map(opt => opt.value);
      }
      schema.uniqueItems = true;
      break;
    case FieldType.OBJECT:
      schema.type = 'object';
      if (field.properties) {
        schema.properties = {};
        const requiredFields: string[] = [];
        
        Object.entries(field.properties).forEach(([key, nestedField]) => {
          schema.properties![key] = fieldToJsonSchema(nestedField);
          if (nestedField.required) {
            requiredFields.push(key);
          }
        });
        
        if (requiredFields.length > 0) {
          schema.required = requiredFields;
        }
      }
      break;
  }

  // Apply validation rules
  if (field.validation) {
    Object.entries(field.validation).forEach(([key, value]) => {
      if (value !== undefined) {
        schema[key] = value;
      }
    });
  }

  // Apply default value
  if (field.defaultValue !== undefined) {
    schema.default = field.defaultValue;
  }

  return schema;
}

/**
 * Converts JSON Schema to FieldDefinition
 * 
 * @param id - Unique identifier for the field
 * @param schema - JSON Schema to convert
 * @returns FieldDefinition
 * 
 * @example
 * ```ts
 * const schema = { type: 'number', minimum: 0, maximum: 100, title: 'Score' };
 * const field = jsonSchemaToField('score', schema);
 * ```
 */
export function jsonSchemaToField(id: string, schema: JSONSchema): FieldDefinition {
  const field: FieldDefinition = {
    id,
    name: schema.title || id,
    type: FieldType.TEXT, // default
    description: schema.description,
  };

  // Determine field type from JSON Schema type
  const schemaType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  
  switch (schemaType) {
    case 'string':
      if (schema.format === 'date-time' || schema.format === 'date') {
        field.type = FieldType.DATE;
      } else if (schema.enum) {
        field.type = FieldType.SELECT;
        field.options = schema.enum.map(val => ({ value: val, label: String(val) }));
      } else {
        // Check if this looks like a textarea (long maxLength)
        field.type = schema.maxLength && schema.maxLength > 255 
          ? FieldType.TEXTAREA 
          : FieldType.TEXT;
      }
      break;
    case 'number':
    case 'integer':
      // Check if it has multipleOf which suggests a range/slider
      field.type = schema.multipleOf !== undefined ? FieldType.RANGE : FieldType.NUMBER;
      break;
    case 'boolean':
      field.type = FieldType.BOOLEAN;
      break;
    case 'array':
      field.type = FieldType.MULTI_SELECT;
      if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
        if (schema.items.enum) {
          field.options = schema.items.enum.map(val => ({ value: val, label: String(val) }));
        }
      }
      break;
    case 'object':
      field.type = FieldType.OBJECT;
      if (schema.properties) {
        field.properties = {};
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          field.properties![key] = jsonSchemaToField(key, propSchema as JSONSchema);
          // Check if this property is required
          if (schema.required?.includes(key)) {
            field.properties![key].required = true;
          }
        });
      }
      break;
  }

  // Extract validation rules
  const validationKeys = [
    'minimum', 'maximum', 'minLength', 'maxLength', 
    'pattern', 'multipleOf', 'enum', 'items'
  ];
  
  const validation: any = {};
  validationKeys.forEach(key => {
    if (schema[key] !== undefined) {
      validation[key] = schema[key];
    }
  });
  
  if (Object.keys(validation).length > 0) {
    field.validation = validation;
  }

  // Extract default value
  if (schema.default !== undefined) {
    field.defaultValue = schema.default;
  }

  return field;
}

/**
 * Merges core and extension field schemas
 * 
 * @param coreSchema - Schema with core fields
 * @param extensionSchema - Schema with extension fields
 * @returns Merged JSON Schema
 * 
 * @example
 * ```ts
 * const merged = mergeSchemas(coreSchema, extensionSchema);
 * ```
 */
export function mergeSchemas(
  coreSchema: FieldSchema,
  extensionSchema?: FieldSchema
): JSONSchema {
  const schema: JSONSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
    required: [],
  };

  // Convert core fields
  coreSchema.coreFields.forEach(field => {
    schema.properties![field.id] = fieldToJsonSchema(field);
    if (field.required) {
      schema.required!.push(field.id);
    }
  });

  // Convert extension fields from core schema
  coreSchema.extensionFields.forEach(field => {
    schema.properties![field.id] = fieldToJsonSchema(field);
    if (field.required) {
      schema.required!.push(field.id);
    }
  });

  // Add extension schema fields if provided
  if (extensionSchema) {
    extensionSchema.extensionFields.forEach(field => {
      schema.properties![field.id] = fieldToJsonSchema(field);
      if (field.required) {
        schema.required!.push(field.id);
      }
    });
  }

  // Remove required array if empty
  if (schema.required!.length === 0) {
    delete schema.required;
  }

  return schema;
}

/**
 * Validates data against a JSON Schema
 * 
 * @param data - Data to validate
 * @param schema - JSON Schema to validate against
 * @returns Validation result
 * 
 * @example
 * ```ts
 * const result = validateAgainstSchema({ age: 25 }, schema);
 * if (!result.isValid) {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateAgainstSchema(data: any, schema: JSONSchema): ValidationResult {
  const errors: Array<{ field: string; message: string; code: string }> = [];

  function validateValue(
    value: any,
    fieldSchema: JSONSchema,
    path: string = 'root'
  ): void {
    // Check type
    if (fieldSchema.type) {
      const types = Array.isArray(fieldSchema.type) ? fieldSchema.type : [fieldSchema.type];
      const actualType = getJsonSchemaType(value);
      
      // Allow integers to match number type
      const typeMatches = types.includes(actualType) || 
        (types.includes('number') && actualType === 'integer') ||
        (types.includes('integer') && actualType === 'number' && Number.isInteger(value));
      
      if (!typeMatches && value !== null && value !== undefined) {
        errors.push({
          field: path,
          message: `Expected type ${types.join(' or ')}, got ${actualType}`,
          code: 'TYPE_MISMATCH',
        });
        return; // Skip further validation if type is wrong
      }
    }

    // Type-specific validation
    switch (fieldSchema.type) {
      case 'string':
        if (typeof value === 'string') {
          if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
            errors.push({
              field: path,
              message: `Minimum length is ${fieldSchema.minLength}`,
              code: 'MIN_LENGTH',
            });
          }
          if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
            errors.push({
              field: path,
              message: `Maximum length is ${fieldSchema.maxLength}`,
              code: 'MAX_LENGTH',
            });
          }
          if (fieldSchema.pattern) {
            const regex = new RegExp(fieldSchema.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: path,
                message: `Value does not match pattern ${fieldSchema.pattern}`,
                code: 'PATTERN_MISMATCH',
              });
            }
          }
          if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
            errors.push({
              field: path,
              message: `Value must be one of: ${fieldSchema.enum.join(', ')}`,
              code: 'ENUM_MISMATCH',
            });
          }
        }
        break;

      case 'number':
      case 'integer':
        if (typeof value === 'number') {
          if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
            errors.push({
              field: path,
              message: `Minimum value is ${fieldSchema.minimum}`,
              code: 'MINIMUM',
            });
          }
          if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
            errors.push({
              field: path,
              message: `Maximum value is ${fieldSchema.maximum}`,
              code: 'MAXIMUM',
            });
          }
          if (fieldSchema.multipleOf && value % fieldSchema.multipleOf !== 0) {
            errors.push({
              field: path,
              message: `Value must be a multiple of ${fieldSchema.multipleOf}`,
              code: 'MULTIPLE_OF',
            });
          }
        }
        break;

      case 'array':
        if (Array.isArray(value)) {
          if (fieldSchema.items && typeof fieldSchema.items === 'object' && !Array.isArray(fieldSchema.items)) {
            value.forEach((item, index) => {
              validateValue(item, fieldSchema.items as JSONSchema, `${path}[${index}]`);
            });
          }
          if (fieldSchema.uniqueItems) {
            const unique = new Set(value.map(v => JSON.stringify(v)));
            if (unique.size !== value.length) {
              errors.push({
                field: path,
                message: 'Array items must be unique',
                code: 'UNIQUE_ITEMS',
              });
            }
          }
        }
        break;

      case 'object':
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Check required properties
          if (fieldSchema.required) {
            fieldSchema.required.forEach(requiredProp => {
              if (!(requiredProp in value)) {
                errors.push({
                  field: `${path}.${requiredProp}`,
                  message: 'Required property is missing',
                  code: 'REQUIRED',
                });
              }
            });
          }

          // Validate properties
          if (fieldSchema.properties) {
            Object.entries(fieldSchema.properties).forEach(([propKey, propSchema]) => {
              if (propKey in value) {
                validateValue(value[propKey], propSchema as JSONSchema, `${path}.${propKey}`);
              }
            });
          }
        }
        break;
    }
  }

  // Start validation
  validateValue(data, schema);

  return {
    isValid: errors.length === 0,
    errors,
    value: data,
  };
}

/**
 * Helper to determine JSON Schema type from a value
 */
function getJsonSchemaType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  
  const type = typeof value;
  if (type === 'object') return 'object';
  if (type === 'boolean') return 'boolean';
  if (type === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (type === 'string') return 'string';
  
  return 'unknown';
}

/**
 * Converts a complete FieldSchema to a JSON Schema
 * 
 * @param fieldSchema - The field schema to convert
 * @returns JSON Schema
 */
export function fieldSchemaToJsonSchema(fieldSchema: FieldSchema): JSONSchema {
  return mergeSchemas(fieldSchema);
}
