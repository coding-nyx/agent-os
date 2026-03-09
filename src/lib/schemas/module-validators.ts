/**
 * Module Schema Validators
 *
 * Structural-only validators for schema extensions. All validators return
 * { valid: true, errors: [] } from validateExtension() — domain-level
 * semantic validation is handled exclusively by the LLM at field-creation
 * time (both chat and button paths).
 *
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 *
 * Each validator still provides:
 *   - getRestrictedFieldIds()  → prevents shadowing core/system fields
 *   - isFieldNameAllowed()     → structural name checks (always true currently)
 *   - validateExtension()      → always { valid: true, errors: [] }
 *
 * Structural checks (ID uniqueness, extension count limits, type consistency)
 * remain in SchemaRegistry.validateExtension().
 */

import { ModuleSchemaValidator, ValidationResult } from '../schema-registry';
import { FieldDefinition, FieldType } from '../field-system/types';

/**
 * Therapy Module Validator (Structural Only)
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 */
export class TherapySchemaValidator implements ModuleSchemaValidator {
  private restrictedIds = [
    'userId',
    'currentState',
    'therapeuticGoals',
    'emotionalResilience',
    'stressLevel',
  ];

  validateExtension(_field: FieldDefinition): ValidationResult {
    // Domain validation handled by LLM — see skills/dynamic-field-system.md
    return { valid: true, errors: [] };
  }

  isFieldNameAllowed(_name: string): boolean {
    return true;
  }

  getRestrictedFieldIds(): string[] {
    return this.restrictedIds;
  }
}

/**
 * Trainer Module Validator (Structural Only)
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 */
export class TrainerSchemaValidator implements ModuleSchemaValidator {
  private restrictedIds = [
    'userId',
    'fitnessLevel',
    'fitnessGoals',
    'currentWeight',
    'workoutFrequency',
  ];

  validateExtension(_field: FieldDefinition): ValidationResult {
    // Domain validation handled by LLM — see skills/dynamic-field-system.md
    return { valid: true, errors: [] };
  }

  isFieldNameAllowed(_name: string): boolean {
    return true;
  }

  getRestrictedFieldIds(): string[] {
    return this.restrictedIds;
  }
}

/**
 * Ledger Module Validator (Structural Only)
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 */
export class LedgerSchemaValidator implements ModuleSchemaValidator {
  private restrictedIds = [
    'userId',
    'monthlyIncome',
    'currency',
    'financialGoals',
    'totalDebt',
    'totalSavings',
    'totalInvestments',
    'budgetCategories',
    'riskTolerance',
    'spendingHabits',
    'financialStressLevel',
    'creditScore',
    'paymentSchedule',
    'lastBudgetReview',
    'nextBudgetReview',
  ];

  validateExtension(field: FieldDefinition): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    // Ledger extensions must use numeric/select/date types — not text-based
    const allowedTypes: FieldType[] = [
      FieldType.NUMBER,
      FieldType.RANGE,
      FieldType.SELECT,
      FieldType.MULTI_SELECT,
      FieldType.DATE,
    ];

    if (!allowedTypes.includes(field.type)) {
      errors.push({
        field: 'type',
        message: `Ledger extensions must be NUMBER, RANGE, SELECT, MULTI_SELECT, or DATE (got ${field.type})`,
        code: 'INVALID_FIELD_TYPE',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isFieldNameAllowed(_name: string): boolean {
    return true;
  }

  getRestrictedFieldIds(): string[] {
    return this.restrictedIds;
  }
}

/**
 * Soma Module Validator (Structural Only)
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 */
export class SomaSchemaValidator implements ModuleSchemaValidator {
  private restrictedIds = [
    'userId',
    'age',
    'height',
    'weight',
    'bmi',
    'restingHeartRate',
    'sleepQuality',
  ];

  validateExtension(_field: FieldDefinition): ValidationResult {
    // Domain validation handled by LLM — see skills/dynamic-field-system.md
    return { valid: true, errors: [] };
  }

  isFieldNameAllowed(_name: string): boolean {
    return true;
  }

  getRestrictedFieldIds(): string[] {
    return this.restrictedIds;
  }
}

/**
 * Atlas Module Validator (Structural Only)
 * Domain validation handled by LLM — see skills/dynamic-field-system.md
 * No keyword gates — the LLM is the sole semantic domain validator.
 */
export class AtlasSchemaValidator implements ModuleSchemaValidator {
  private restrictedIds = [
    'userId',
    'energyBudget',
    'planningLoad',
    'taskCompletionRate',
    'streakHealth',
    'urgencyPressure',
    'peakProductivityTime',
    'workStyle',
    'priorityAreas',
    'habitTracking',
    'goalReviewFrequency',
    'procrastinationTriggers',
    'focusScore',
    'openLoopCount',
    'lastReview',
    'nextReview',
  ];

  validateExtension(field: FieldDefinition): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    // Structural: validate field ID format (kebab-case)
    if (field.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field.id)) {
      errors.push({
        field: 'id',
        message: 'Field ID must be kebab-case (lowercase letters, numbers, and hyphens)',
        code: 'INVALID_FIELD_ID_FORMAT',
      });
    }

    // Structural: validate field name is not empty
    if (!field.name || field.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Field name cannot be empty',
        code: 'EMPTY_FIELD_NAME',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  isFieldNameAllowed(_name: string): boolean {
    return true;
  }

  getRestrictedFieldIds(): string[] {
    return this.restrictedIds;
  }
}

// Export all validators
export const MODULE_VALIDATORS = {
  therapy: new TherapySchemaValidator(),
  trainer: new TrainerSchemaValidator(),
  ledger: new LedgerSchemaValidator(),
  soma: new SomaSchemaValidator(),
  atlas: new AtlasSchemaValidator(),
};
