# AGNES Validation Framework - Quick Reference

## Import Statement
```typescript
import {
  // Types
  ValidationResult,
  ValidationError,
  ValidationRule,
  ValidationContext,
  
  // Core Validators
  required,
  minLength,
  maxLength,
  min,
  max,
  range,
  integer,
  pattern,
  email,
  url,
  oneOf,
  custom,
  
  // Validation Engine
  validate,
  validateAsync,
  validateObject,
  validateObjectAsync,
  combineResults,
  hasErrors,
  getErrorMessages,
  getFieldErrors,
  
  // Module Validators
  validateModuleField,
  validateModuleProfile,
  registerModuleValidator,
  
  // JSON Schema
  validateJsonSchema,
} from '@/lib/validation';
```

## Common Patterns

### 1. Email Validation
```typescript
validate(email, [required(), email(), maxLength(100)], 'email');
```

### 2. Password Validation
```typescript
validate(password, [
  required(),
  minLength(8),
  pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Must contain uppercase, lowercase, and number'),
], 'password');
```

### 3. Age Validation
```typescript
validate(age, [required(), integer(), range(0, 120)], 'age');
```

### 4. Phone Number Validation
```typescript
validate(phone, [
  required(),
  pattern(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
], 'phone');
```

### 5. Username Validation
```typescript
validate(username, [
  required(),
  minLength(3),
  maxLength(20),
  pattern(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
], 'username');
```

### 6. URL Validation
```typescript
validate(websiteUrl, [url('Please enter a valid URL')], 'website');
```

### 7. Enum/Select Validation
```typescript
validate(status, [
  required(),
  oneOf(['active', 'inactive', 'pending'], 'Invalid status'),
], 'status');
```

### 8. Optional Field with Constraints
```typescript
// Don't use required(), just constraints
validate(nickname, [minLength(2), maxLength(20)], 'nickname');
```

### 9. Form Object Validation
```typescript
validateObject(formData, {
  firstName: [required(), minLength(2)],
  lastName: [required(), minLength(2)],
  email: [required(), email()],
  age: [integer(), range(18, 120)],
  website: [url()], // optional
});
```

### 10. Async Validation (Availability Check)
```typescript
await validateAsync(username, [
  required(),
  minLength(3),
  custom(async (value) => {
    const response = await fetch(`/api/check/${value}`);
    const { available } = await response.json();
    return available;
  }, 'Already taken'),
], 'username');
```

## Error Handling Patterns

### Pattern 1: Display Errors
```typescript
const result = validate(value, rules, 'field');
if (!result.valid) {
  setErrors(result.errors.map(e => e.message));
}
```

### Pattern 2: Group Errors by Field
```typescript
const result = validateObject(formData, rules);
if (!result.valid) {
  const errorsByField = result.errors.reduce((acc, err) => {
    if (!acc[err.field]) acc[err.field] = [];
    acc[err.field].push(err.message);
    return acc;
  }, {});
  setFormErrors(errorsByField);
}
```

### Pattern 3: Get Specific Field Errors
```typescript
const result = validateObject(formData, rules);
const emailErrors = getFieldErrors(result, 'email');
```

### Pattern 4: Check if Any Errors
```typescript
const result = validate(value, rules);
if (hasErrors(result)) {
  // Handle errors
}
```

## Module-Specific Validation

### AGNES (Therapy)
```typescript
await validateModuleField('agnes', 'struggles', ['anxiety', 'insomnia']);
await validateModuleField('agnes', 'goals', ['better sleep']);
```

### TITAN (Training)
```typescript
await validateModuleField('titan', 'fitnessLevel', 'intermediate');
await validateModuleField('titan', 'weeklyAvailability', 5);
```

### LEDGER (Finance)
```typescript
await validateModuleField('ledger', 'amount', 100.50);
await validateModuleField('ledger', 'currency', 'USD');
```

### SOMA (Health)
```typescript
await validateModuleField('soma', 'sleepHours', 7.5);
await validateModuleField('soma', 'heartRate', 72);
```

### ATLAS (Tasks)
```typescript
await validateModuleField('atlas', 'priority', 'high');
await validateModuleField('atlas', 'deadline', '2024-12-31');
```

## JSON Schema Examples

### Simple Object Schema
```typescript
const schema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', minLength: 2 },
    email: { type: 'string', format: 'email' },
  },
};

validateJsonSchema(data, schema);
```

### Array Schema
```typescript
const schema = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
  maxItems: 10,
};

validateJsonSchema(tags, schema);
```

### Nested Object Schema
```typescript
const schema = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 0 },
      },
    },
  },
};

validateJsonSchema(data, schema);
```

## Context-Aware Validation

```typescript
const context = {
  userProfile: currentUser,
  moduleContext: { fitnessLevel: 'advanced' },
};

validateObject(
  formData,
  {
    weeklyGoal: [
      required(),
      custom((value, ctx) => {
        const level = ctx?.moduleContext?.fitnessLevel;
        const maxHours = { beginner: 5, advanced: 15 }[level];
        return value <= maxHours;
      }, 'Goal exceeds your level capacity'),
    ],
  },
  { context }
);
```

## Custom Validators

### Cross-Field Validation
```typescript
const passwordMatchValidator = custom((confirmPassword, context) => {
  return context?.password === confirmPassword;
}, 'Passwords must match');

validateObject(
  formData,
  {
    password: [required(), minLength(8)],
    confirmPassword: [required(), passwordMatchValidator],
  },
  { context: formData }
);
```

### Conditional Validation
```typescript
const conditionalRequired = custom((value, context) => {
  const needsValue = context?.someFlag === true;
  if (needsValue && !value) {
    return {
      valid: false,
      errors: [{
        field: 'conditionalField',
        message: 'This field is required when flag is set',
        code: 'CONDITIONAL_REQUIRED',
      }],
    };
  }
  return { valid: true, errors: [] };
});
```

## Validation Options

### Fail Fast (Better UX)
```typescript
validateObject(formData, rules, { failFast: true });
```

### Collect All Errors (Bulk Import)
```typescript
validateObject(importData, rules, { failFast: false });
```

### Include Warnings
```typescript
validateObject(formData, rules, { includeWarnings: true });
```

## Error Codes Reference

### Core Validation Errors
- `REQUIRED` - Required field is missing
- `MIN_LENGTH` - String below minimum length
- `MAX_LENGTH` - String exceeds maximum length
- `MIN_VALUE` - Number below minimum
- `MAX_VALUE` - Number exceeds maximum
- `OUT_OF_RANGE` - Number outside range
- `NOT_INTEGER` - Value is not an integer
- `PATTERN_MISMATCH` - Doesn't match regex
- `INVALID_EMAIL` - Invalid email format
- `INVALID_URL` - Invalid URL format
- `INVALID_OPTION` - Not in allowed list
- `CUSTOM_VALIDATION_FAILED` - Custom validator failed

### Module-Specific Codes
- `AGNES_INVALID_STRUGGLES`
- `AGNES_INVALID_GOALS`
- `TITAN_INVALID_FITNESS_LEVEL`
- `LEDGER_INVALID_AMOUNT`
- `SOMA_INVALID_SLEEP_HOURS`
- `ATLAS_INVALID_PRIORITY`

### JSON Schema Codes
- `TYPE_MISMATCH` - Wrong type
- `ENUM_MISMATCH` - Not in enum
- `FORMAT_EMAIL` - Invalid email
- `FORMAT_URL` - Invalid URL
- `ANY_OF_FAILED` - Composition failed
- `ONE_OF_FAILED` - Composition failed

## Testing Patterns

```typescript
import { describe, it, expect } from 'vitest';
import { validate, required, email } from '@/lib/validation';

describe('Email validation', () => {
  it('should validate correct email', () => {
    const result = validate('test@example.com', [email()], 'email');
    expect(result.valid).toBe(true);
  });

  it('should fail for invalid email', () => {
    const result = validate('invalid', [email()], 'email');
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_EMAIL');
  });
});
```

## Performance Tips

1. **Use sync validators when possible** - They're faster
2. **Fail fast for user input** - Better UX
3. **Debounce async validators** - Reduce API calls
4. **Cache validation results** - For repeated checks
5. **Use module validators** - Domain-specific optimization

## Integration Examples

### React Component
```typescript
function MyForm() {
  const [errors, setErrors] = useState({});

  const handleBlur = (field: string, value: any) => {
    const result = validate(value, rules[field], field);
    if (!result.valid) {
      setErrors({ ...errors, [field]: result.errors });
    }
  };

  const handleSubmit = () => {
    const result = validateObject(formData, allRules);
    if (!result.valid) {
      setErrors(groupErrorsByField(result.errors));
      return;
    }
    // Submit form
  };
}
```

### API Route
```typescript
export async function POST(req: Request) {
  const body = await req.json();
  const result = validateObject(body, requestRules);
  
  if (!result.valid) {
    return Response.json(
      { error: 'Validation failed', details: result.errors },
      { status: 400 }
    );
  }
  
  // Process valid request
}
```

### Firebase Function
```typescript
export const createUser = onCall(async (request) => {
  const result = validateObject(request.data, userRules);
  
  if (!result.valid) {
    throw new HttpsError('invalid-argument', 'Validation failed', {
      errors: result.errors,
    });
  }
  
  // Create user
});
```
