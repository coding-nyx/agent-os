/**
 * AGNES Validation Framework - Module Validators Registry
 * Manages module-specific validation logic
 */

import type { ValidationResult, ValidationContext } from './types';

/**
 * Interface for module-specific validators
 * Each module can implement custom validation logic for its fields
 */
export interface ModuleValidator {
  /**
   * Validates a field value within module context
   * @param field - The field name being validated
   * @param value - The value to validate
   * @param context - Additional context for validation
   * @returns ValidationResult or Promise<ValidationResult>
   */
  validate(
    field: string,
    value: any,
    context?: ValidationContext
  ): ValidationResult | Promise<ValidationResult>;

  /**
   * Optional: Validates an entire module profile/data object
   * @param data - The module data to validate
   * @param context - Additional context for validation
   * @returns ValidationResult or Promise<ValidationResult>
   */
  validateProfile?(
    data: any,
    context?: ValidationContext
  ): ValidationResult | Promise<ValidationResult>;
}

/**
 * Registry for module-specific validators
 * Uses lazy loading to avoid importing all modules upfront
 */
class ModuleValidatorRegistry {
  private validators = new Map<string, ModuleValidator>();

  /**
   * Registers a validator for a specific module
   * @param moduleId - The module identifier (e.g., 'agnes', 'titan', 'atlas')
   * @param validator - The validator implementation
   */
  register(moduleId: string, validator: ModuleValidator): void {
    this.validators.set(moduleId, validator);
  }

  /**
   * Retrieves a validator for a specific module
   * @param moduleId - The module identifier
   * @returns The validator if registered, undefined otherwise
   */
  get(moduleId: string): ModuleValidator | undefined {
    return this.validators.get(moduleId);
  }

  /**
   * Checks if a validator is registered for a module
   * @param moduleId - The module identifier
   * @returns true if validator exists
   */
  has(moduleId: string): boolean {
    return this.validators.has(moduleId);
  }

  /**
   * Unregisters a validator for a module
   * @param moduleId - The module identifier
   * @returns true if validator was removed
   */
  unregister(moduleId: string): boolean {
    return this.validators.delete(moduleId);
  }

  /**
   * Clears all registered validators
   */
  clear(): void {
    this.validators.clear();
  }

  /**
   * Gets all registered module IDs
   * @returns Array of module IDs
   */
  getRegisteredModules(): string[] {
    return Array.from(this.validators.keys());
  }
}

// Singleton instance
const registry = new ModuleValidatorRegistry();

/**
 * Registers a module validator
 * @param moduleId - The module identifier
 * @param validator - The validator implementation
 */
export function registerModuleValidator(moduleId: string, validator: ModuleValidator): void {
  registry.register(moduleId, validator);
}

/**
 * Gets a module validator
 * @param moduleId - The module identifier
 * @returns The validator if registered, undefined otherwise
 */
export function getModuleValidator(moduleId: string): ModuleValidator | undefined {
  return registry.get(moduleId);
}

/**
 * Validates a field using the appropriate module validator
 * @param moduleId - The module identifier
 * @param field - The field name
 * @param value - The value to validate
 * @param context - Additional context
 * @returns ValidationResult or Promise<ValidationResult>
 */
export async function validateModuleField(
  moduleId: string,
  field: string,
  value: any,
  context?: ValidationContext
): Promise<ValidationResult> {
  const validator = registry.get(moduleId);
  
  if (!validator) {
    // No validator registered - return success (validation is optional)
    return { valid: true, errors: [] };
  }

  return await validator.validate(field, value, context);
}

/**
 * Validates an entire module profile using the appropriate module validator
 * @param moduleId - The module identifier
 * @param data - The module data to validate
 * @param context - Additional context
 * @returns ValidationResult or Promise<ValidationResult>
 */
export async function validateModuleProfile(
  moduleId: string,
  data: any,
  context?: ValidationContext
): Promise<ValidationResult> {
  const validator = registry.get(moduleId);
  
  if (!validator || !validator.validateProfile) {
    // No validator or no profile validation method - return success
    return { valid: true, errors: [] };
  }

  return await validator.validateProfile(data, context);
}

// Export the registry instance for advanced use cases
export { registry as moduleValidatorRegistry };

/**
 * Helper to check if a module has a validator registered
 * @param moduleId - The module identifier
 * @returns true if validator exists
 */
export function hasModuleValidator(moduleId: string): boolean {
  return registry.has(moduleId);
}

/**
 * Gets all registered module IDs
 * @returns Array of module IDs with validators
 */
export function getRegisteredModules(): string[] {
  return registry.getRegisteredModules();
}

// ============================================================================
// BUILT-IN MODULE VALIDATORS
// ============================================================================

/**
 * AGNES (Therapy) Module Validator
 * Validates therapy intake and session data
 */
export const agnesValidator: ModuleValidator = {
  validate(field: string, value: any): ValidationResult {
    // Field-specific validation for AGNES
    switch (field) {
      case 'struggles':
        if (!Array.isArray(value) && typeof value !== 'string') {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Struggles must be a string or array of strings',
              code: 'AGNES_INVALID_STRUGGLES',
            }],
          };
        }
        break;

      case 'goals':
        if (!Array.isArray(value) && typeof value !== 'string') {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Goals must be a string or array of strings',
              code: 'AGNES_INVALID_GOALS',
            }],
          };
        }
        break;

      case 'selectedAgnesId':
        if (value && typeof value !== 'string') {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Selected Agnes ID must be a string',
              code: 'AGNES_INVALID_AGNES_ID',
            }],
          };
        }
        break;
    }

    return { valid: true, errors: [] };
  },

  validateProfile(data: any): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    // Validate required encrypted profile fields
    if (!data.encryptedData || typeof data.encryptedData !== 'string') {
      errors.push({
        field: 'encryptedData',
        message: 'Encrypted data is required',
        code: 'AGNES_MISSING_ENCRYPTED_DATA',
      });
    }

    if (!data.iv || typeof data.iv !== 'string') {
      errors.push({
        field: 'iv',
        message: 'Initialization vector is required',
        code: 'AGNES_MISSING_IV',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * TITAN (Training) Module Validator
 * Validates training profiles and workout data
 */
export const titanValidator: ModuleValidator = {
  validate(field: string, value: any): ValidationResult {
    switch (field) {
      case 'fitnessLevel': {
        const validLevels = ['beginner', 'intermediate', 'advanced', 'elite'];
        if (value && !validLevels.includes(value)) {
          return {
            valid: false,
            errors: [{
              field,
              message: `Fitness level must be one of: ${validLevels.join(', ')}`,
              code: 'TITAN_INVALID_FITNESS_LEVEL',
              metadata: { validLevels },
            }],
          };
        }
        break;
      }

      case 'weeklyAvailability':
        if (value !== undefined && (typeof value !== 'number' || value < 1 || value > 7)) {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Weekly availability must be between 1 and 7 days',
              code: 'TITAN_INVALID_WEEKLY_AVAILABILITY',
            }],
          };
        }
        break;

      case 'injuries':
        if (value && !Array.isArray(value)) {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Injuries must be an array',
              code: 'TITAN_INVALID_INJURIES',
            }],
          };
        }
        break;
    }

    return { valid: true, errors: [] };
  },
};

/**
 * LEDGER (Finance) Module Validator
 * Validates financial data and transactions
 */
export const ledgerValidator: ModuleValidator = {
  validate(field: string, value: any): ValidationResult {
    switch (field) {
      case 'amount':
        if (value !== undefined) {
          const num = Number(value);
          if (isNaN(num)) {
            return {
              valid: false,
              errors: [{
                field,
                message: 'Amount must be a valid number',
                code: 'LEDGER_INVALID_AMOUNT',
              }],
            };
          }
        }
        break;

      case 'currency': {
        // Common currency codes
        const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
        if (value && !validCurrencies.includes(value.toUpperCase())) {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Invalid currency code',
              code: 'LEDGER_INVALID_CURRENCY',
            }],
            warnings: [`Uncommon currency: ${value}. Common currencies: ${validCurrencies.join(', ')}`],
          };
        }
        break;
      }

      case 'category':
        if (value && typeof value !== 'string') {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Category must be a string',
              code: 'LEDGER_INVALID_CATEGORY',
            }],
          };
        }
        break;
    }

    return { valid: true, errors: [] };
  },
};

/**
 * SOMA (Body/Health) Module Validator
 * Validates health metrics and body data
 */
export const somaValidator: ModuleValidator = {
  validate(field: string, value: any): ValidationResult {
    switch (field) {
      case 'sleepHours':
        if (value !== undefined) {
          const num = Number(value);
          if (isNaN(num) || num < 0 || num > 24) {
            return {
              valid: false,
              errors: [{
                field,
                message: 'Sleep hours must be between 0 and 24',
                code: 'SOMA_INVALID_SLEEP_HOURS',
              }],
            };
          }
        }
        break;

      case 'heartRate':
        if (value !== undefined) {
          const num = Number(value);
          if (isNaN(num) || num < 30 || num > 250) {
            return {
              valid: false,
              errors: [{
                field,
                message: 'Heart rate must be between 30 and 250 bpm',
                code: 'SOMA_INVALID_HEART_RATE',
              }],
            };
          }
        }
        break;

      case 'weight':
        if (value !== undefined) {
          const num = Number(value);
          if (isNaN(num) || num <= 0) {
            return {
              valid: false,
              errors: [{
                field,
                message: 'Weight must be a positive number',
                code: 'SOMA_INVALID_WEIGHT',
              }],
            };
          }
        }
        break;
    }

    return { valid: true, errors: [] };
  },
};

/**
 * ATLAS (Task Management) Module Validator
 * Validates tasks, habits, and planning data
 */
export const atlasValidator: ModuleValidator = {
  validate(field: string, value: any): ValidationResult {
    switch (field) {
      case 'priority': {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (value && !validPriorities.includes(value.toLowerCase())) {
          return {
            valid: false,
            errors: [{
              field,
              message: `Priority must be one of: ${validPriorities.join(', ')}`,
              code: 'ATLAS_INVALID_PRIORITY',
              metadata: { validPriorities },
            }],
          };
        }
        break;
      }

      case 'deadline':
        if (value && isNaN(Date.parse(value))) {
          return {
            valid: false,
            errors: [{
              field,
              message: 'Deadline must be a valid date',
              code: 'ATLAS_INVALID_DEADLINE',
            }],
          };
        }
        break;

      case 'estimatedDuration':
        if (value !== undefined) {
          const num = Number(value);
          if (isNaN(num) || num <= 0) {
            return {
              valid: false,
              errors: [{
                field,
                message: 'Estimated duration must be a positive number',
                code: 'ATLAS_INVALID_DURATION',
              }],
            };
          }
        }
        break;
    }

    return { valid: true, errors: [] };
  },
};

// Auto-register built-in validators
registerModuleValidator('agnes', agnesValidator);
registerModuleValidator('titan', titanValidator);
registerModuleValidator('ledger', ledgerValidator);
registerModuleValidator('soma', somaValidator);
registerModuleValidator('atlas', atlasValidator);
