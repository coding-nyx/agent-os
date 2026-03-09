/**
 * AGNES Validation Framework - JSON Schema Validator
 * Validates data against JSON Schema specifications
 * Uses a minimal implementation without external dependencies
 */

import type { ValidationResult } from './types';

/**
 * Simplified JSON Schema interface
 * Supports common validation keywords
 */
export interface JsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  const?: any;
  additionalProperties?: boolean | JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  format?: string;
  $ref?: string;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
  description?: string;
  title?: string;
  default?: any;
}

/**
 * Context for schema resolution and validation
 */
interface ValidationSchemaContext {
  rootSchema: JsonSchema;
  definitions?: Record<string, JsonSchema>;
  path: string[];
}

/**
 * Validates data against a JSON Schema
 * @param data - The data to validate
 * @param schema - The JSON Schema to validate against
 * @returns ValidationResult
 */
export function validateJsonSchema(data: any, schema: JsonSchema): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: string[] = [];

  const context: ValidationSchemaContext = {
    rootSchema: schema,
    definitions: {},
    path: [],
  };

  validateValue(data, schema, context, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Internal recursive validation function
 */
function validateValue(
  value: any,
  schema: JsonSchema,
  context: ValidationSchemaContext,
  errors: ValidationResult['errors'],
  warnings: string[]
): void {
  const fieldPath = context.path.join('.') || 'root';

  // Handle $ref
  if (schema.$ref) {
    const refSchema = resolveRef(schema.$ref, context);
    if (refSchema) {
      validateValue(value, refSchema, context, errors, warnings);
    } else {
      errors.push({
        field: fieldPath,
        message: `Cannot resolve reference: ${schema.$ref}`,
        code: 'UNRESOLVED_REF',
      });
    }
    return;
  }

  // Handle allOf
  if (schema.allOf) {
    for (const subSchema of schema.allOf) {
      validateValue(value, subSchema, context, errors, warnings);
    }
    return;
  }

  // Handle anyOf
  if (schema.anyOf) {
    const subErrors: ValidationResult['errors'][] = [];
    let hasValid = false;

    for (const subSchema of schema.anyOf) {
      const subErrorList: ValidationResult['errors'] = [];
      validateValue(value, subSchema, context, subErrorList, []);
      if (subErrorList.length === 0) {
        hasValid = true;
        break;
      }
      subErrors.push(subErrorList);
    }

    if (!hasValid) {
      errors.push({
        field: fieldPath,
        message: 'Value does not match any of the schemas',
        code: 'ANY_OF_FAILED',
        metadata: { subErrors },
      });
    }
    return;
  }

  // Handle oneOf
  if (schema.oneOf) {
    let validCount = 0;

    for (const subSchema of schema.oneOf) {
      const subErrorList: ValidationResult['errors'] = [];
      validateValue(value, subSchema, context, subErrorList, []);
      if (subErrorList.length === 0) {
        validCount++;
      }
    }

    if (validCount !== 1) {
      errors.push({
        field: fieldPath,
        message: `Value must match exactly one schema, but matches ${validCount}`,
        code: 'ONE_OF_FAILED',
      });
    }
    return;
  }

  // Handle not
  if (schema.not) {
    const subErrorList: ValidationResult['errors'] = [];
    validateValue(value, schema.not, context, subErrorList, []);
    if (subErrorList.length === 0) {
      errors.push({
        field: fieldPath,
        message: 'Value must not match the schema',
        code: 'NOT_FAILED',
      });
    }
    return;
  }

  // Handle const
  if (schema.const !== undefined) {
    if (value !== schema.const) {
      errors.push({
        field: fieldPath,
        message: `Value must be exactly ${JSON.stringify(schema.const)}`,
        code: 'CONST_MISMATCH',
      });
    }
    return;
  }

  // Handle enum
  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push({
        field: fieldPath,
        message: `Value must be one of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`,
        code: 'ENUM_MISMATCH',
        metadata: { enum: schema.enum },
      });
    }
    return;
  }

  // Type validation
  if (schema.type) {
    const actualType = getJsonType(value);
    
    if (schema.type === 'integer' && actualType === 'number' && !Number.isInteger(value)) {
      errors.push({
        field: fieldPath,
        message: 'Value must be an integer',
        code: 'TYPE_MISMATCH',
        metadata: { expected: 'integer', actual: actualType },
      });
      return;
    }

    if (schema.type !== actualType && !(schema.type === 'integer' && actualType === 'number')) {
      errors.push({
        field: fieldPath,
        message: `Type must be ${schema.type}`,
        code: 'TYPE_MISMATCH',
        metadata: { expected: schema.type, actual: actualType },
      });
      return;
    }
  }

  // Type-specific validation
  if (typeof value === 'string') {
    validateString(value, schema, fieldPath, errors);
  } else if (typeof value === 'number') {
    validateNumber(value, schema, fieldPath, errors);
  } else if (Array.isArray(value)) {
    validateArray(value, schema, context, errors, warnings);
  } else if (typeof value === 'object' && value !== null) {
    validateObject(value, schema, context, errors, warnings);
  }
}

/**
 * Validates string values
 */
function validateString(
  value: string,
  schema: JsonSchema,
  fieldPath: string,
  errors: ValidationResult['errors']
): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      field: fieldPath,
      message: `String length must be at least ${schema.minLength}`,
      code: 'MIN_LENGTH',
      metadata: { minLength: schema.minLength, actual: value.length },
    });
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      field: fieldPath,
      message: `String length must be at most ${schema.maxLength}`,
      code: 'MAX_LENGTH',
      metadata: { maxLength: schema.maxLength, actual: value.length },
    });
  }

  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      errors.push({
        field: fieldPath,
        message: `String does not match pattern: ${schema.pattern}`,
        code: 'PATTERN_MISMATCH',
        metadata: { pattern: schema.pattern },
      });
    }
  }

  // Format validation (basic)
  if (schema.format) {
    validateFormat(value, schema.format, fieldPath, errors);
  }
}

/**
 * Validates number values
 */
function validateNumber(
  value: number,
  schema: JsonSchema,
  fieldPath: string,
  errors: ValidationResult['errors']
): void {
  if (schema.minimum !== undefined && value < schema.minimum) {
    errors.push({
      field: fieldPath,
      message: `Number must be at least ${schema.minimum}`,
      code: 'MINIMUM',
      metadata: { minimum: schema.minimum, actual: value },
    });
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    errors.push({
      field: fieldPath,
      message: `Number must be at most ${schema.maximum}`,
      code: 'MAXIMUM',
      metadata: { maximum: schema.maximum, actual: value },
    });
  }
}

/**
 * Validates array values
 */
function validateArray(
  value: any[],
  schema: JsonSchema,
  context: ValidationSchemaContext,
  errors: ValidationResult['errors'],
  warnings: string[]
): void {
  const fieldPath = context.path.join('.') || 'root';

  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({
      field: fieldPath,
      message: `Array must have at least ${schema.minItems} items`,
      code: 'MIN_ITEMS',
      metadata: { minItems: schema.minItems, actual: value.length },
    });
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({
      field: fieldPath,
      message: `Array must have at most ${schema.maxItems} items`,
      code: 'MAX_ITEMS',
      metadata: { maxItems: schema.maxItems, actual: value.length },
    });
  }

  if (schema.uniqueItems) {
    const seen = new Set();
    const duplicates: any[] = [];
    
    for (const item of value) {
      const key = JSON.stringify(item);
      if (seen.has(key)) {
        duplicates.push(item);
      }
      seen.add(key);
    }

    if (duplicates.length > 0) {
      errors.push({
        field: fieldPath,
        message: 'Array items must be unique',
        code: 'UNIQUE_ITEMS',
        metadata: { duplicates },
      });
    }
  }

  // Validate items
  if (schema.items) {
    value.forEach((item, index) => {
      const itemContext = {
        ...context,
        path: [...context.path, `[${index}]`],
      };
      validateValue(item, schema.items!, itemContext, errors, warnings);
    });
  }
}

/**
 * Validates object values
 */
function validateObject(
  value: Record<string, any>,
  schema: JsonSchema,
  context: ValidationSchemaContext,
  errors: ValidationResult['errors'],
  warnings: string[]
): void {
  const fieldPath = context.path.join('.') || 'root';

  // Check required properties
  if (schema.required) {
    for (const requiredProp of schema.required) {
      if (!(requiredProp in value)) {
        errors.push({
          field: `${fieldPath}.${requiredProp}`,
          message: `Required property '${requiredProp}' is missing`,
          code: 'REQUIRED',
        });
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in value) {
        const propContext = {
          ...context,
          path: [...context.path, propName],
        };
        validateValue(value[propName], propSchema, propContext, errors, warnings);
      }
    }
  }

  // Check additional properties
  if (schema.additionalProperties === false) {
    const allowedProps = new Set(Object.keys(schema.properties || {}));
    for (const propName of Object.keys(value)) {
      if (!allowedProps.has(propName)) {
        errors.push({
          field: `${fieldPath}.${propName}`,
          message: `Additional property '${propName}' is not allowed`,
          code: 'ADDITIONAL_PROPERTIES',
        });
      }
    }
  } else if (typeof schema.additionalProperties === 'object') {
    const allowedProps = new Set(Object.keys(schema.properties || {}));
    for (const [propName, propValue] of Object.entries(value)) {
      if (!allowedProps.has(propName)) {
        const propContext = {
          ...context,
          path: [...context.path, propName],
        };
        validateValue(propValue, schema.additionalProperties, propContext, errors, warnings);
      }
    }
  }
}

/**
 * Validates format keywords (basic implementation)
 */
function validateFormat(
  value: string,
  format: string,
  fieldPath: string,
  errors: ValidationResult['errors']
): void {
  switch (format) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({
          field: fieldPath,
          message: 'Invalid email format',
          code: 'FORMAT_EMAIL',
        });
      }
      break;

    case 'uri':
    case 'url':
      try {
        new URL(value);
      } catch {
        errors.push({
          field: fieldPath,
          message: 'Invalid URL format',
          code: 'FORMAT_URL',
        });
      }
      break;

    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
        errors.push({
          field: fieldPath,
          message: 'Invalid date format (expected YYYY-MM-DD)',
          code: 'FORMAT_DATE',
        });
      }
      break;

    case 'date-time':
      if (isNaN(Date.parse(value))) {
        errors.push({
          field: fieldPath,
          message: 'Invalid date-time format',
          code: 'FORMAT_DATETIME',
        });
      }
      break;

    case 'uuid':
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        errors.push({
          field: fieldPath,
          message: 'Invalid UUID format',
          code: 'FORMAT_UUID',
        });
      }
      break;
  }
}

/**
 * Gets JSON type of a value
 */
function getJsonType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Resolves $ref references (basic implementation)
 */
function resolveRef(ref: string, context: ValidationSchemaContext): JsonSchema | null {
  // Handle #/definitions/... refs
  if (ref.startsWith('#/definitions/')) {
    const defName = ref.substring('#/definitions/'.length);
    return context.definitions?.[defName] || null;
  }

  // Handle #/properties/... refs
  if (ref.startsWith('#/properties/')) {
    const propPath = ref.substring('#/properties/'.length).split('/');
    let current: any = context.rootSchema.properties;
    
    for (const segment of propPath) {
      if (!current || typeof current !== 'object') return null;
      current = current[segment];
    }
    
    return current as JsonSchema || null;
  }

  // Ref resolution not fully supported
  return null;
}

/**
 * Creates a simple schema from TypeScript-like type description
 * Utility for quick schema creation in code
 */
export function createSchema(options: {
  type: JsonSchema['type'];
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}): JsonSchema {
  const schema: JsonSchema = {
    type: options.type,
  };

  if (options.min !== undefined) schema.minimum = options.min;
  if (options.max !== undefined) schema.maximum = options.max;
  if (options.minLength !== undefined) schema.minLength = options.minLength;
  if (options.maxLength !== undefined) schema.maxLength = options.maxLength;
  if (options.pattern) schema.pattern = options.pattern;
  if (options.enum) schema.enum = options.enum;
  if (options.properties) schema.properties = options.properties;
  if (options.items) schema.items = options.items;

  return schema;
}
