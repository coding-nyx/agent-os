# AGNES Validation Framework

A comprehensive, module-agnostic field validation system for the AGNES platform.

## Overview

The validation framework provides:

- **Type-safe validation interfaces** - Consistent ValidationResult format
- **Reusable core validators** - Common validation patterns (required, email, range, etc.)
- **Sync and async support** - Handle both synchronous and asynchronous validation
- **Module-specific validators** - Custom validation logic for each AGNES module
- **JSON Schema support** - Standards-based validation with minimal dependencies
- **Composable rules** - Combine multiple validators for complex requirements

## Quick Start

### Basic Field Validation

```typescript
import { validate, required, email } from '@/lib/validation';

const result = validate(userEmail, [required(), email()], 'email');

if (!result.valid) {
  console.error('Validation failed:', result.errors);
  // [{ field: 'email', message: 'Invalid email address', code: 'INVALID_EMAIL' }]
}
```

### Object Validation

```typescript
import { validateObject, required, minLength, range } from '@/lib/validation';

const formData = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 25,
};

const result = validateObject(formData, {
  name: [required(), minLength(2)],
  email: [required(), email()],
  age: [range(0, 120)],
});

if (!result.valid) {
  result.errors.forEach(error => {
    console.error(`${error.field}: ${error.message}`);
  });
}
```

### Async Validation

```typescript
import { validateAsync, custom } from '@/lib/validation';

const checkUsernameAvailable = custom(
  async (username) => {
    const exists = await api.checkUsername(username);
    return !exists;
  },
  'Username already taken'
);

const result = await validateAsync(username, [
  required(),
  minLength(3),
  checkUsernameAvailable,
], 'username');
```

## Core Validators

### String Validators

```typescript
import { required, minLength, maxLength, pattern, email, url } from '@/lib/validation';

// Required field
required('This field is required')

// Length constraints
minLength(3, 'Must be at least 3 characters')
maxLength(100, 'Must be at most 100 characters')

// Pattern matching
pattern(/^[A-Z]\d{3}$/, 'Must match format: A123')

// Format validators
email('Invalid email address')
url('Invalid URL')
```

### Numeric Validators

```typescript
import { min, max, range, integer } from '@/lib/validation';

// Minimum/maximum values
min(0, 'Must be non-negative')
max(100, 'Must be at most 100')

// Range validation
range(1, 10, 'Must be between 1 and 10')

// Integer validation
integer('Must be a whole number')
```

### Enum Validators

```typescript
import { oneOf } from '@/lib/validation';

// Allowed values
oneOf(['red', 'green', 'blue'], 'Must be a valid color')
oneOf([1, 2, 3], 'Must be 1, 2, or 3')
```

### Custom Validators

```typescript
import { custom } from '@/lib/validation';

// Synchronous custom validator
const isEven = custom(
  (value) => Number(value) % 2 === 0,
  'Must be an even number'
);

// Asynchronous custom validator
const checkUniqueness = custom(
  async (value) => {
    const result = await api.check(value);
    return result.isUnique;
  },
  'Value must be unique'
);

// Return full ValidationResult for complex logic
const complexValidator = custom((value, context) => {
  if (value < 0) {
    return {
      valid: false,
      errors: [{
        field: 'value',
        message: 'Must be non-negative',
        code: 'NEGATIVE_VALUE',
      }],
    };
  }
  
  if (value > 100) {
    return {
      valid: true,
      errors: [],
      warnings: ['Value is unusually high'],
    };
  }
  
  return { valid: true, errors: [] };
});
```

## Validation Engine

### Single Field Validation

```typescript
import { validate, validateAsync } from '@/lib/validation';

// Synchronous validation
const result = validate(value, rules, fieldName, context);

// Asynchronous validation
const result = await validateAsync(value, rules, fieldName, context);
```

### Object Validation

```typescript
import { validateObject, validateObjectAsync } from '@/lib/validation';

const rules = {
  email: [required(), email()],
  password: [required(), minLength(8)],
  age: [min(0), max(120)],
};

// Synchronous
const result = validateObject(data, rules);

// Asynchronous
const result = await validateObjectAsync(data, rules);

// With options
const result = validateObject(data, rules, {
  failFast: true,           // Stop on first error
  includeWarnings: true,    // Include warnings in result
  context: { userId: '123' } // Pass context to validators
});
```

### Combining Results

```typescript
import { combineResults } from '@/lib/validation';

const result1 = validate(field1, rules1);
const result2 = validate(field2, rules2);
const result3 = validate(field3, rules3);

const combined = combineResults([result1, result2, result3]);
// All errors and warnings merged into single result
```

### Utility Functions

```typescript
import {
  hasErrors,
  getErrorMessages,
  getFieldErrors,
  createValidResult,
  createInvalidResult,
} from '@/lib/validation';

// Check if result has errors
if (hasErrors(result)) {
  // Handle validation failure
}

// Extract error messages
const messages = getErrorMessages(result);
// ['Invalid email', 'Password too short']

// Get errors for specific field
const emailErrors = getFieldErrors(result, 'email');

// Create result objects
const success = createValidResult();
const failure = createInvalidResult('email', 'Invalid format', 'INVALID_EMAIL');
```

## Module Validators

Module-specific validators handle domain-specific validation logic for each AGNES module.

### Using Module Validators

```typescript
import { validateModuleField, validateModuleProfile } from '@/lib/validation';

// Validate a single field
const result = await validateModuleField(
  'agnes',            // module ID
  'struggles',        // field name
  ['anxiety', 'insomnia'], // value
  { userProfile }     // optional context
);

// Validate entire module profile
const profileResult = await validateModuleProfile(
  'titan',
  profileData,
  { userProfile }
);
```

### Built-in Module Validators

#### AGNES (Therapy)
- Validates `struggles`, `goals`, `selectedAgnesId`
- Validates encrypted profile structure

#### TITAN (Training)
- Validates `fitnessLevel` (beginner/intermediate/advanced/elite)
- Validates `weeklyAvailability` (1-7 days)
- Validates `injuries` array

#### LEDGER (Finance)
- Validates `amount` numeric values
- Validates `currency` codes (with warnings for uncommon currencies)
- Validates `category` strings

#### SOMA (Body/Health)
- Validates `sleepHours` (0-24)
- Validates `heartRate` (30-250 bpm)
- Validates `weight` (positive number)

#### ATLAS (Task Management)
- Validates `priority` (low/medium/high/urgent)
- Validates `deadline` date format
- Validates `estimatedDuration` (positive number)

### Registering Custom Module Validators

```typescript
import { registerModuleValidator, ModuleValidator } from '@/lib/validation';

const myModuleValidator: ModuleValidator = {
  validate(field: string, value: any, context?) {
    switch (field) {
      case 'customField':
        if (!isValid(value)) {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Invalid custom field',
              code: 'CUSTOM_VALIDATION_ERROR',
            }],
          };
        }
        break;
    }
    return { valid: true, errors: [] };
  },
  
  validateProfile(data: any, context?) {
    // Validate entire profile
    const errors = [];
    
    if (!data.requiredField) {
      errors.push({
        field: 'requiredField',
        message: 'Required field missing',
        code: 'REQUIRED',
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

registerModuleValidator('my-module', myModuleValidator);
```

## JSON Schema Validation

Validate data against JSON Schema specifications using a minimal built-in implementation.

### Basic Usage

```typescript
import { validateJsonSchema } from '@/lib/validation';

const schema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    email: {
      type: 'string',
      format: 'email',
    },
    age: {
      type: 'integer',
      minimum: 0,
      maximum: 120,
    },
  },
  additionalProperties: false,
};

const data = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 25,
};

const result = validateJsonSchema(data, schema);
```

### Supported Keywords

#### Type Keywords
- `type`: string, number, integer, boolean, object, array, null

#### String Keywords
- `minLength`, `maxLength`
- `pattern`: regex pattern
- `format`: email, url, uri, date, date-time, uuid

#### Numeric Keywords
- `minimum`, `maximum`

#### Array Keywords
- `items`: schema for array items
- `minItems`, `maxItems`
- `uniqueItems`: ensure all items are unique

#### Object Keywords
- `properties`: define property schemas
- `required`: array of required property names
- `additionalProperties`: boolean or schema for additional properties

#### Generic Keywords
- `enum`: array of allowed values
- `const`: single allowed value

#### Composition Keywords
- `allOf`: must match all schemas
- `anyOf`: must match at least one schema
- `oneOf`: must match exactly one schema
- `not`: must not match schema

### Schema Helper

```typescript
import { createSchema } from '@/lib/validation';

const schema = createSchema({
  type: 'string',
  minLength: 3,
  maxLength: 50,
  pattern: '^[A-Za-z]+$',
});

const arraySchema = createSchema({
  type: 'array',
  items: createSchema({ type: 'number', min: 0 }),
  minLength: 1,
  maxLength: 10,
});
```

## Validation Context

Pass contextual information to validators for conditional validation:

```typescript
import { validateObject, ValidationContext } from '@/lib/validation';

const context: ValidationContext = {
  userProfile: {
    uid: '123',
    role: 'admin',
  },
  moduleContext: {
    currentStep: 'intake',
  },
};

const result = validateObject(
  data,
  rules,
  { context }
);

// In custom validator:
const roleBasedValidator = custom((value, context) => {
  const userRole = context?.userProfile?.role;
  
  if (userRole === 'admin') {
    // Admin-specific validation
    return value.length > 0;
  }
  
  // Regular user validation
  return value.length > 5;
}, 'Invalid value for user role');
```

## Error Handling

### ValidationError Structure

```typescript
interface ValidationError {
  field: string;      // Field name that failed
  message: string;    // Human-readable error message
  code: string;       // Machine-readable error code
  metadata?: any;     // Additional context
}
```

### ValidationResult Structure

```typescript
interface ValidationResult {
  valid: boolean;              // Overall validation status
  errors: ValidationError[];   // Array of errors (empty if valid)
  warnings?: string[];         // Optional warnings
}
```

### Example Error Handling

```typescript
const result = validateObject(formData, rules);

if (!result.valid) {
  // Group errors by field
  const errorsByField = result.errors.reduce((acc, error) => {
    if (!acc[error.field]) acc[error.field] = [];
    acc[error.field].push(error);
    return acc;
  }, {} as Record<string, ValidationError[]>);
  
  // Display field-specific errors
  Object.entries(errorsByField).forEach(([field, errors]) => {
    console.error(`${field}:`, errors.map(e => e.message).join(', '));
  });
  
  // Log error codes for debugging
  result.errors.forEach(error => {
    console.debug(`Error ${error.code} on field ${error.field}`, error.metadata);
  });
}

// Handle warnings
if (result.warnings && result.warnings.length > 0) {
  result.warnings.forEach(warning => {
    console.warn(warning);
  });
}
```

## Best Practices

### 1. Use Specific Field Names

```typescript
// ❌ Don't
validate(email, rules, 'field');

// ✅ Do
validate(email, rules, 'email');
```

### 2. Combine Validators in Logical Order

```typescript
// Check required first, then format
[required(), email(), maxLength(100)]

// Check type before range
[integer(), range(1, 10)]
```

### 3. Provide User-Friendly Messages

```typescript
// ❌ Generic
required()

// ✅ Specific
required('Please enter your email address')
```

### 4. Use Async Validators Sparingly

```typescript
// Async validators are slower - use only when necessary
// for database checks, API calls, etc.

// ❌ Don't make sync validation async
const unnecessaryAsync = custom(
  async (value) => value.length > 0,
  'Required'
);

// ✅ Use sync for simple checks
const syncValidator = required();
```

### 5. Handle Validation Context

```typescript
// Pass relevant context for conditional validation
const context = {
  userProfile: currentUser,
  moduleState: currentModule,
};

validateObject(data, rules, { context });
```

### 6. Fail Fast for User Input

```typescript
// Stop on first error for better UX
validateObject(formData, rules, { failFast: true });
```

### 7. Validate All for Data Import

```typescript
// Collect all errors for bulk data validation
validateObject(importedData, rules, { failFast: false });
```

## Integration Examples

### React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { validateObject } from '@/lib/validation';

function MyForm() {
  const { register, handleSubmit, setError } = useForm();
  
  const onSubmit = (data) => {
    const result = validateObject(data, validationRules);
    
    if (!result.valid) {
      result.errors.forEach(error => {
        setError(error.field, {
          type: error.code,
          message: error.message,
        });
      });
      return;
    }
    
    // Process valid data
  };
  
  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}
```

### API Endpoint Validation

```typescript
import { validateObject } from '@/lib/validation';

export async function POST(req: Request) {
  const body = await req.json();
  
  const result = validateObject(body, requestSchema);
  
  if (!result.valid) {
    return Response.json(
      { error: 'Validation failed', details: result.errors },
      { status: 400 }
    );
  }
  
  // Process valid request
  return Response.json({ success: true });
}
```

### Form Component

```typescript
function FormField({ name, value, onChange, rules }) {
  const [errors, setErrors] = useState<string[]>([]);
  
  const handleBlur = () => {
    const result = validate(value, rules, name);
    setErrors(result.errors.map(e => e.message));
  };
  
  return (
    <div>
      <input
        name={name}
        value={value}
        onChange={onChange}
        onBlur={handleBlur}
      />
      {errors.map((error, i) => (
        <div key={i} className="error">{error}</div>
      ))}
    </div>
  );
}
```

## Testing

The validation framework includes comprehensive tests. Run them with:

```bash
npm run test src/lib/validation/validation.test.ts
```

## Architecture

```
src/lib/validation/
├── types.ts                    # Type definitions
├── validators.ts               # Core validator functions
├── validation-engine.ts        # Validation execution engine
├── module-validators.ts        # Module-specific validators
├── json-schema-validator.ts    # JSON Schema validation
├── index.ts                    # Public API exports
├── validation.test.ts          # Comprehensive tests
└── README.md                   # This file
```

## Error Codes Reference

### Core Validation Errors
- `REQUIRED` - Required field is missing
- `MIN_LENGTH` - String below minimum length
- `MAX_LENGTH` - String exceeds maximum length
- `MIN_VALUE` - Number below minimum value
- `MAX_VALUE` - Number exceeds maximum value
- `OUT_OF_RANGE` - Number outside allowed range
- `NOT_INTEGER` - Value is not an integer
- `PATTERN_MISMATCH` - Value doesn't match regex pattern
- `INVALID_EMAIL` - Invalid email format
- `INVALID_URL` - Invalid URL format
- `INVALID_OPTION` - Value not in allowed list
- `CUSTOM_VALIDATION_FAILED` - Custom validator failed

### Module-Specific Error Codes
See individual module validators for domain-specific error codes (e.g., `AGNES_INVALID_STRUGGLES`, `TITAN_INVALID_FITNESS_LEVEL`).

### JSON Schema Error Codes
- `TYPE_MISMATCH` - Value type doesn't match schema
- `ENUM_MISMATCH` - Value not in enum
- `FORMAT_EMAIL`, `FORMAT_URL`, etc. - Format validation failed
- `ANY_OF_FAILED`, `ONE_OF_FAILED` - Composition validation failed

## License

Part of the AGNES platform. See root LICENSE file.
