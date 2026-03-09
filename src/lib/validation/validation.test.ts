/**
 * Tests for AGNES Validation Framework
 */

import { describe, it, expect } from 'vitest';
import {
  required,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  email,
  url,
  oneOf,
  range,
  integer,
  custom,
} from './validators';
import {
  validate,
  validateAsync,
  validateObject,
  combineResults,
  hasErrors,
  getErrorMessages,
  getFieldErrors,
} from './validation-engine';
import {
  registerModuleValidator,
  getModuleValidator,
  validateModuleField,
  agnesValidator,
  titanValidator,
} from './module-validators';
import { validateJsonSchema } from './json-schema-validator';

describe('Core Validators', () => {
  describe('required', () => {
    it('should pass for non-empty values', () => {
      const validator = required();
      const result1 = validator.validator('test') as ValidationResult;
      const result2 = validator.validator(123) as ValidationResult;
      const result3 = validator.validator(true) as ValidationResult;
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
      expect(result3.valid).toBe(true);
    });

    it('should fail for empty values', () => {
      const validator = required();
      expect((validator.validator(null) as ValidationResult).valid).toBe(false);
      expect((validator.validator(undefined) as ValidationResult).valid).toBe(false);
      expect((validator.validator('') as ValidationResult).valid).toBe(false);
      expect((validator.validator('   ') as ValidationResult).valid).toBe(false);
    });

    it('should use custom message', () => {
      const validator = required('Custom required message');
      const result = validator.validator(null) as ValidationResult;
      expect(result.errors[0].message).toBe('Custom required message');
    });
  });

  describe('minLength', () => {
    it('should pass for strings meeting minimum length', () => {
      const validator = minLength(3);
      expect((validator.validator('abc') as ValidationResult).valid).toBe(true);
      expect((validator.validator('abcd') as ValidationResult).valid).toBe(true);
    });

    it('should fail for strings below minimum length', () => {
      const validator = minLength(3);
      const result = validator.validator('ab') as ValidationResult;
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MIN_LENGTH');
    });

    it('should pass for null/undefined', () => {
      const validator = minLength(3);
      expect((validator.validator(null) as ValidationResult).valid).toBe(true);
      expect((validator.validator(undefined) as ValidationResult).valid).toBe(true);
    });
  });

  describe('maxLength', () => {
    it('should pass for strings within maximum length', () => {
      const validator = maxLength(5);
      expect((validator.validator('abc') as ValidationResult).valid).toBe(true);
      expect((validator.validator('abcde') as ValidationResult).valid).toBe(true);
    });

    it('should fail for strings exceeding maximum length', () => {
      const validator = maxLength(5);
      const result = validator.validator('abcdef') as ValidationResult;
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('MAX_LENGTH');
    });
  });

  describe('min/max', () => {
    it('should validate minimum numeric value', () => {
      const validator = min(10);
      expect((validator.validator(10) as ValidationResult).valid).toBe(true);
      expect((validator.validator(15) as ValidationResult).valid).toBe(true);
      expect((validator.validator(5) as ValidationResult).valid).toBe(false);
    });

    it('should validate maximum numeric value', () => {
      const validator = max(100);
      expect((validator.validator(50) as ValidationResult).valid).toBe(true);
      expect((validator.validator(100) as ValidationResult).valid).toBe(true);
      expect((validator.validator(150) as ValidationResult).valid).toBe(false);
    });
  });

  describe('range', () => {
    it('should validate numeric range', () => {
      const validator = range(1, 10);
      expect((validator.validator(5) as ValidationResult).valid).toBe(true);
      expect((validator.validator(1) as ValidationResult).valid).toBe(true);
      expect((validator.validator(10) as ValidationResult).valid).toBe(true);
      expect((validator.validator(0) as ValidationResult).valid).toBe(false);
      expect((validator.validator(11) as ValidationResult).valid).toBe(false);
    });
  });

  describe('integer', () => {
    it('should pass for integers', () => {
      const validator = integer();
      expect((validator.validator(0) as ValidationResult).valid).toBe(true);
      expect((validator.validator(42) as ValidationResult).valid).toBe(true);
      expect((validator.validator(-5) as ValidationResult).valid).toBe(true);
    });

    it('should fail for non-integers', () => {
      const validator = integer();
      expect((validator.validator(3.14) as ValidationResult).valid).toBe(false);
      expect((validator.validator('abc') as ValidationResult).valid).toBe(false);
    });
  });

  describe('pattern', () => {
    it('should validate regex patterns', () => {
      const validator = pattern(/^[A-Z]\d{3}$/);
      expect((validator.validator('A123') as ValidationResult).valid).toBe(true);
      expect((validator.validator('abc') as ValidationResult).valid).toBe(false);
      expect((validator.validator('1234') as ValidationResult).valid).toBe(false);
    });
  });

  describe('email', () => {
    it('should validate email format', () => {
      const validator = email();
      expect((validator.validator('test@example.com') as ValidationResult).valid).toBe(true);
      expect((validator.validator('user.name@domain.co.uk') as ValidationResult).valid).toBe(true);
      expect((validator.validator('invalid') as ValidationResult).valid).toBe(false);
      expect((validator.validator('test@') as ValidationResult).valid).toBe(false);
      expect((validator.validator('@example.com') as ValidationResult).valid).toBe(false);
    });
  });

  describe('url', () => {
    it('should validate URL format', () => {
      const validator = url();
      expect((validator.validator('https://example.com') as ValidationResult).valid).toBe(true);
      expect((validator.validator('http://localhost:3000') as ValidationResult).valid).toBe(true);
      expect((validator.validator('not-a-url') as ValidationResult).valid).toBe(false);
    });
  });

  describe('oneOf', () => {
    it('should validate enum values', () => {
      const validator = oneOf(['red', 'green', 'blue']);
      expect((validator.validator('red') as ValidationResult).valid).toBe(true);
      expect((validator.validator('green') as ValidationResult).valid).toBe(true);
      expect((validator.validator('yellow') as ValidationResult).valid).toBe(false);
    });
  });

  describe('custom', () => {
    it('should use custom validation function', async () => {
      const validator = custom((value) => value > 0 && value < 100, 'Must be between 0 and 100');
      // Since custom can return Promise, we need to handle it asynchronously
      await expect((validator.validator(50) as Promise<ValidationResult>)).resolves.toMatchObject({ valid: true });
      await expect((validator.validator(0) as Promise<ValidationResult>)).resolves.toMatchObject({ valid: false });
      await expect((validator.validator(100) as Promise<ValidationResult>)).resolves.toMatchObject({ valid: false });
    });

    it('should support async validation', async () => {
      const validator = custom(
        async (value) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return value === 'valid';
        },
        'Invalid async value'
      );
      
      const result = await validator.validator('valid');
      expect(result.valid).toBe(true);
      
      const invalidResult = await validator.validator('invalid');
      expect(invalidResult.valid).toBe(false);
    });
  });
});

describe('Validation Engine', () => {
  describe('validate', () => {
    it('should validate with multiple rules', () => {
      const result = validate(
        'test@example.com',
        [required(), email()],
        'email'
      );
      expect(result.valid).toBe(true);
    });

    it('should collect all errors', () => {
      const result = validate(
        'abcd',
        [required(), minLength(5), maxLength(3)],
        'field'
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2); // minLength fails (4 < 5), maxLength fails (4 > 3)
    });

    it('should map field names correctly', () => {
      const result = validate('', [required()], 'username');
      expect(result.errors[0].field).toBe('username');
    });
  });

  describe('validateAsync', () => {
    it('should handle async validators', async () => {
      const asyncValidator = custom(async (value) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return value === 'valid';
      });

      const result = await validateAsync('valid', [asyncValidator], 'field');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateObject', () => {
    it('should validate object fields', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        age: 25,
      };

      const result = validateObject(obj, {
        name: [required(), minLength(2)],
        email: [required(), email()],
        age: [required(), min(0), max(120)],
      });

      expect(result.valid).toBe(true);
    });

    it('should collect errors from multiple fields', () => {
      const obj = {
        name: '',
        email: 'invalid-email',
        age: -5,
      };

      const result = validateObject(obj, {
        name: [required()],
        email: [email()],
        age: [min(0)],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('should support failFast option', () => {
      const obj = {
        name: '',
        email: 'invalid',
      };

      const result = validateObject(
        obj,
        {
          name: [required()],
          email: [email()],
        },
        { failFast: true }
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1); // Only first error
    });
  });

  describe('combineResults', () => {
    it('should combine multiple validation results', () => {
      const result1 = { valid: true, errors: [] };
      const result2 = { valid: false, errors: [{ field: 'f1', message: 'e1', code: 'C1' }] };
      const result3 = { valid: false, errors: [{ field: 'f2', message: 'e2', code: 'C2' }] };

      const combined = combineResults([result1, result2, result3]);
      expect(combined.valid).toBe(false);
      expect(combined.errors.length).toBe(2);
    });
  });

  describe('utility functions', () => {
    it('hasErrors should detect errors', () => {
      expect(hasErrors({ valid: true, errors: [] })).toBe(false);
      expect(hasErrors({ valid: false, errors: [{ field: 'f', message: 'm', code: 'c' }] })).toBe(true);
    });

    it('getErrorMessages should extract messages', () => {
      const result = {
        valid: false,
        errors: [
          { field: 'f1', message: 'Error 1', code: 'E1' },
          { field: 'f2', message: 'Error 2', code: 'E2' },
        ],
      };
      const messages = getErrorMessages(result);
      expect(messages).toEqual(['Error 1', 'Error 2']);
    });

    it('getFieldErrors should filter by field', () => {
      const result = {
        valid: false,
        errors: [
          { field: 'email', message: 'Invalid email', code: 'E1' },
          { field: 'name', message: 'Required', code: 'E2' },
          { field: 'email', message: 'Too long', code: 'E3' },
        ],
      };
      const emailErrors = getFieldErrors(result, 'email');
      expect(emailErrors.length).toBe(2);
      expect(emailErrors.every(e => e.field === 'email')).toBe(true);
    });
  });
});

describe('Module Validators', () => {
  describe('registry', () => {
    it('should register and retrieve validators', () => {
      const mockValidator = {
        validate: () => ({ valid: true, errors: [] }),
      };

      registerModuleValidator('test-module', mockValidator);
      const retrieved = getModuleValidator('test-module');
      
      expect(retrieved).toBe(mockValidator);
    });

    it('should return undefined for unregistered modules', () => {
      expect(getModuleValidator('non-existent')).toBeUndefined();
    });
  });

  describe('agnesValidator', () => {
    it('should validate struggles field', () => {
      const result1 = agnesValidator.validate('struggles', ['anxiety', 'insomnia']);
      expect(result1.valid).toBe(true);

      const result2 = agnesValidator.validate('struggles', 'anxiety and insomnia');
      expect(result2.valid).toBe(true);

      const result3 = agnesValidator.validate('struggles', 123);
      expect(result3.valid).toBe(false);
    });

    it('should validate goals field', () => {
      const result1 = agnesValidator.validate('goals', ['sleep better', 'reduce stress']);
      expect(result1.valid).toBe(true);

      const result2 = agnesValidator.validate('goals', 'improve wellbeing');
      expect(result2.valid).toBe(true);

      const result3 = agnesValidator.validate('goals', { invalid: true });
      expect(result3.valid).toBe(false);
    });

    it('should validate encrypted profile', () => {
      if (agnesValidator.validateProfile) {
        const validProfile = {
          encryptedData: 'encrypted-string',
          iv: 'initialization-vector',
        };
        const result1 = agnesValidator.validateProfile(validProfile);
        expect(result1.valid).toBe(true);

        const invalidProfile = {
          encryptedData: 123,
        };
        const result2 = agnesValidator.validateProfile(invalidProfile);
        expect(result2.valid).toBe(false);
      }
    });
  });

  describe('titanValidator', () => {
    it('should validate fitness level', () => {
      const result1 = titanValidator.validate('fitnessLevel', 'intermediate');
      expect(result1.valid).toBe(true);

      const result2 = titanValidator.validate('fitnessLevel', 'expert');
      expect(result2.valid).toBe(false);
    });

    it('should validate weekly availability', () => {
      const result1 = titanValidator.validate('weeklyAvailability', 5);
      expect(result1.valid).toBe(true);

      const result2 = titanValidator.validate('weeklyAvailability', 0);
      expect(result2.valid).toBe(false);

      const result3 = titanValidator.validate('weeklyAvailability', 8);
      expect(result3.valid).toBe(false);
    });

    it('should validate injuries array', () => {
      const result1 = titanValidator.validate('injuries', ['knee', 'shoulder']);
      expect(result1.valid).toBe(true);

      const result2 = titanValidator.validate('injuries', 'knee');
      expect(result2.valid).toBe(false);
    });
  });

  describe('validateModuleField', () => {
    it('should use registered module validator', async () => {
      const result = await validateModuleField('agnes', 'struggles', ['anxiety']);
      expect(result.valid).toBe(true);
    });

    it('should return success for unregistered modules', async () => {
      const result = await validateModuleField('unknown-module', 'field', 'value');
      expect(result.valid).toBe(true);
    });
  });
});

describe('JSON Schema Validator', () => {
  it('should validate basic types', () => {
    const schema = { type: 'string' as const };
    expect(validateJsonSchema('test', schema).valid).toBe(true);
    expect(validateJsonSchema(123, schema).valid).toBe(false);
  });

  it('should validate object properties', () => {
    const schema = {
      type: 'object' as const,
      required: ['name'],
      properties: {
        name: { type: 'string' as const, minLength: 1 },
        age: { type: 'number' as const, minimum: 0 },
      },
    };

    const valid = { name: 'John', age: 25 };
    expect(validateJsonSchema(valid, schema).valid).toBe(true);

    const missing = { age: 25 };
    expect(validateJsonSchema(missing, schema).valid).toBe(false);

    const invalid = { name: '', age: -5 };
    const result = validateJsonSchema(invalid, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate arrays', () => {
    const schema = {
      type: 'array' as const,
      items: { type: 'number' as const },
      minItems: 1,
      maxItems: 5,
    };

    expect(validateJsonSchema([1, 2, 3], schema).valid).toBe(true);
    expect(validateJsonSchema([], schema).valid).toBe(false);
    expect(validateJsonSchema([1, 2, 3, 4, 5, 6], schema).valid).toBe(false);
    expect(validateJsonSchema([1, 'two', 3], schema).valid).toBe(false);
  });

  it('should validate enum values', () => {
    const schema = {
      type: 'string' as const,
      enum: ['red', 'green', 'blue'],
    };

    expect(validateJsonSchema('red', schema).valid).toBe(true);
    expect(validateJsonSchema('yellow', schema).valid).toBe(false);
  });

  it('should validate string formats', () => {
    const emailSchema = { type: 'string' as const, format: 'email' };
    expect(validateJsonSchema('test@example.com', emailSchema).valid).toBe(true);
    expect(validateJsonSchema('not-an-email', emailSchema).valid).toBe(false);

    const urlSchema = { type: 'string' as const, format: 'url' };
    expect(validateJsonSchema('https://example.com', urlSchema).valid).toBe(true);
    expect(validateJsonSchema('not-a-url', urlSchema).valid).toBe(false);
  });

  it('should validate nested objects', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        user: {
          type: 'object' as const,
          required: ['email'],
          properties: {
            email: { type: 'string' as const, format: 'email' },
            age: { type: 'integer' as const, minimum: 0 },
          },
        },
      },
    };

    const valid = {
      user: {
        email: 'test@example.com',
        age: 25,
      },
    };
    expect(validateJsonSchema(valid, schema).valid).toBe(true);

    const invalid = {
      user: {
        email: 'not-an-email',
        age: 3.5,
      },
    };
    const result = validateJsonSchema(invalid, schema);
    expect(result.valid).toBe(false);
  });

  it('should handle additionalProperties', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const },
      },
      additionalProperties: false,
    };

    expect(validateJsonSchema({ name: 'John' }, schema).valid).toBe(true);
    expect(validateJsonSchema({ name: 'John', age: 25 }, schema).valid).toBe(false);
  });

  it('should validate unique items', () => {
    const schema = {
      type: 'array' as const,
      items: { type: 'number' as const },
      uniqueItems: true,
    };

    expect(validateJsonSchema([1, 2, 3], schema).valid).toBe(true);
    expect(validateJsonSchema([1, 2, 2, 3], schema).valid).toBe(false);
  });
});
