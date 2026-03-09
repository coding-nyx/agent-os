/**
 * AGNES Validation Framework - Usage Examples
 * 
 * This file demonstrates practical usage patterns for the validation framework.
 * These examples can be adapted for use in actual AGNES components.
 */

import {
  validate,
  validateAsync,
  validateObject,
  required,
  email,
  minLength,
  maxLength,
  range,
  pattern,
  custom,
  validateModuleField,
  validateJsonSchema,
  type ValidationResult,
  type ValidationContext,
} from '@/lib/validation';

// ============================================================================
// Example 1: Simple Form Field Validation
// ============================================================================

/**
 * Validate a single form field on blur
 */
export function validateEmailField(value: string): ValidationResult {
  return validate(
    value,
    [
      required('Email is required'),
      email('Please enter a valid email address'),
      maxLength(100, 'Email must be less than 100 characters'),
    ],
    'email'
  );
}

// Usage in component:
// const handleEmailBlur = () => {
//   const result = validateEmailField(emailValue);
//   if (!result.valid) {
//     setEmailErrors(result.errors.map(e => e.message));
//   }
// };

// ============================================================================
// Example 2: Form Object Validation
// ============================================================================

interface UserRegistrationForm {
  email: string;
  password: string;
  age?: number;
  preferredName: string;
}

/**
 * Validate entire registration form
 */
export function validateRegistrationForm(
  formData: UserRegistrationForm
): ValidationResult {
  return validateObject(formData, {
    email: [
      required('Email is required'),
      email('Invalid email format'),
      maxLength(100),
    ],
    password: [
      required('Password is required'),
      minLength(8, 'Password must be at least 8 characters'),
      pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain uppercase, lowercase, and numbers'
      ),
    ],
    age: [
      range(13, 120, 'Age must be between 13 and 120'),
    ],
    preferredName: [
      required('Name is required'),
      minLength(2, 'Name must be at least 2 characters'),
      maxLength(50, 'Name must be less than 50 characters'),
    ],
  });
}

// Usage in component:
// const handleSubmit = () => {
//   const result = validateRegistrationForm(formData);
//   if (!result.valid) {
//     // Group errors by field
//     const errorsByField = result.errors.reduce((acc, err) => {
//       if (!acc[err.field]) acc[err.field] = [];
//       acc[err.field].push(err.message);
//       return acc;
//     }, {} as Record<string, string[]>);
//     setFormErrors(errorsByField);
//   } else {
//     // Submit form
//   }
// };

// ============================================================================
// Example 3: Async Validation (Username Availability)
// ============================================================================

/**
 * Check if username is available (async)
 */
async function checkUsernameAvailability(username: string): Promise<boolean> {
  // Simulate API call
  const response = await fetch(`/api/check-username?username=${username}`);
  const { available } = await response.json();
  return available;
}

/**
 * Validate username with availability check
 */
export async function validateUsername(username: string): Promise<ValidationResult> {
  return await validateAsync(
    username,
    [
      required('Username is required'),
      minLength(3, 'Username must be at least 3 characters'),
      maxLength(20, 'Username must be less than 20 characters'),
      pattern(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
      custom(
        async (value) => await checkUsernameAvailability(value),
        'Username is already taken'
      ),
    ],
    'username'
  );
}

// Usage in component:
// const handleUsernameBlur = async () => {
//   setIsValidating(true);
//   const result = await validateUsername(usernameValue);
//   setIsValidating(false);
//   if (!result.valid) {
//     setUsernameErrors(result.errors.map(e => e.message));
//   }
// };

// ============================================================================
// Example 4: Context-Aware Validation
// ============================================================================

interface ProfileUpdateForm {
  fitnessLevel?: string;
  weeklyGoal?: number;
  injuryHistory?: string[];
}

/**
 * Validate profile update based on user's current level
 */
export function validateProfileUpdate(
  formData: ProfileUpdateForm,
  context: ValidationContext
): ValidationResult {
  const currentLevel = context.userProfile?.fitnessLevel || 'beginner';

  return validateObject(
    formData,
    {
      fitnessLevel: [
        required('Please select your fitness level'),
      ],
      weeklyGoal: [
        required('Weekly goal is required'),
        // Conditional validation based on fitness level
        custom((value, ctx) => {
          const level = ctx?.userProfile?.fitnessLevel || 'beginner';
          const maxHours = {
            beginner: 5,
            intermediate: 10,
            advanced: 15,
            elite: 20,
          }[level] || 5;

          if (value > maxHours) {
            return {
              valid: false,
              errors: [{
                field: 'weeklyGoal',
                message: `For ${level} level, maximum weekly goal is ${maxHours} hours`,
                code: 'EXCEEDS_LEVEL_CAPACITY',
              }],
            };
          }
          return { valid: true, errors: [] };
        }, 'Invalid weekly goal for your fitness level'),
      ],
      injuryHistory: [],
    },
    { context }
  );
}

// ============================================================================
// Example 5: Module-Specific Validation (AGNES)
// ============================================================================

interface AgnesIntakeData {
  struggles: string[];
  goals: string[];
  backgroundSummary?: string;
}

/**
 * Validate AGNES therapy intake form
 */
export async function validateAgnesIntake(
  intakeData: AgnesIntakeData
): Promise<ValidationResult> {
  // Use module-specific validator for struggles and goals
  const strugglesResult = await validateModuleField(
    'agnes',
    'struggles',
    intakeData.struggles
  );

  const goalsResult = await validateModuleField(
    'agnes',
    'goals',
    intakeData.goals
  );

  // Standard validation for other fields
  const backgroundResult = validate(
    intakeData.backgroundSummary || '',
    [maxLength(1000, 'Background summary must be less than 1000 characters')],
    'backgroundSummary'
  );

  // Combine all results
  const allErrors = [
    ...strugglesResult.errors,
    ...goalsResult.errors,
    ...backgroundResult.errors,
  ];

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

// ============================================================================
// Example 6: JSON Schema Validation (API Request)
// ============================================================================

/**
 * Validate API request payload using JSON Schema
 */
export function validateApiRequest(requestBody: unknown): ValidationResult {
  const schema = {
    type: 'object' as const,
    required: ['action', 'data'],
    properties: {
      action: {
        type: 'string' as const,
        enum: ['create', 'update', 'delete'],
      },
      data: {
        type: 'object' as const,
        required: ['id'],
        properties: {
          id: { type: 'string' as const, minLength: 1 },
          name: { type: 'string' as const, minLength: 1, maxLength: 100 },
          email: { type: 'string' as const, format: 'email' },
          tags: {
            type: 'array' as const,
            items: { type: 'string' as const },
            maxItems: 10,
          },
        },
      },
      timestamp: {
        type: 'string' as const,
        format: 'date-time',
      },
    },
    additionalProperties: false,
  };

  return validateJsonSchema(requestBody, schema);
}

// Usage in API route:
// export async function POST(request: Request) {
//   const body = await request.json();
//   const result = validateApiRequest(body);
//   
//   if (!result.valid) {
//     return Response.json(
//       { error: 'Validation failed', details: result.errors },
//       { status: 400 }
//     );
//   }
//   
//   // Process valid request
// }

// ============================================================================
// Example 7: Custom Complex Validator
// ============================================================================

/**
 * Validate that two password fields match
 */
export function createPasswordMatchValidator(
  passwordFieldName: string,
  confirmFieldName: string
) {
  return custom((confirmPassword, context) => {
    const password = context?.[passwordFieldName];
    
    if (password !== confirmPassword) {
      return {
        valid: false,
        errors: [{
          field: confirmFieldName,
          message: 'Passwords do not match',
          code: 'PASSWORD_MISMATCH',
        }],
      };
    }
    
    return { valid: true, errors: [] };
  }, 'Passwords must match');
}

// Usage:
// validateObject(formData, {
//   password: [required(), minLength(8)],
//   confirmPassword: [
//     required(),
//     createPasswordMatchValidator('password', 'confirmPassword'),
//   ],
// }, { context: formData });

// ============================================================================
// Example 8: React Hook Form Integration
// ============================================================================

/**
 * Adapter function for React Hook Form
 */
export function createRHFValidator(rules: any[]) {
  return async (value: any) => {
    const result = await validateAsync(value, rules, 'field');
    
    if (result.valid) {
      return true;
    }
    
    // Return first error message for RHF
    return result.errors[0]?.message || 'Validation failed';
  };
}

// Usage in React Hook Form:
// const { register } = useForm();
// 
// <input
//   {...register('email', {
//     validate: createRHFValidator([
//       required('Email is required'),
//       email('Invalid email'),
//     ]),
//   })}
// />

// ============================================================================
// Example 9: Batch Validation with Fail-Fast
// ============================================================================

/**
 * Validate user input with fail-fast for better UX
 */
export function validateUserInputFast(input: any): ValidationResult {
  return validateObject(
    input,
    {
      email: [required(), email()],
      password: [required(), minLength(8)],
      age: [range(0, 120)],
    },
    { failFast: true } // Stop on first error for immediate user feedback
  );
}

/**
 * Validate bulk import without fail-fast to collect all errors
 */
export function validateBulkImport(records: any[]): ValidationResult[] {
  return records.map(record =>
    validateObject(
      record,
      {
        email: [required(), email()],
        name: [required(), minLength(2)],
      },
      { failFast: false } // Collect all errors for comprehensive report
    )
  );
}

// ============================================================================
// Example 10: Warning Support
// ============================================================================

/**
 * Validator that returns warnings for unusual but valid values
 */
export const validateAge = custom((age, context) => {
  if (age < 0 || age > 120) {
    return {
      valid: false,
      errors: [{
        field: 'age',
        message: 'Age must be between 0 and 120',
        code: 'INVALID_AGE',
      }],
    };
  }

  if (age > 100) {
    return {
      valid: true,
      errors: [],
      warnings: ['Age over 100 is unusual. Please verify this is correct.'],
    };
  }

  return { valid: true, errors: [] };
}, 'Invalid age');

// Usage:
// const result = validate(age, [validateAge], 'age');
// if (result.warnings) {
//   console.warn('Warnings:', result.warnings);
// }
