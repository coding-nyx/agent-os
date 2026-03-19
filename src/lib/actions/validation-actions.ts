/**
 * AI-Assisted Validation Actions
 * 
 * Provides intelligent validation assistance using LLM capabilities:
 * 1. suggest_field_fix - AI suggests corrections for invalid data
 * 2. validate_with_context - AI validates using domain knowledge
 * 3. explain_validation_error - AI explains validation errors in plain language
 * 
 * @module validation-actions
 */

import { ActionHub, ActionContext } from './action-hub';
import { 
  validate, 
  ValidationResult as FrameworkValidationResult,
  ValidationError,
  createValidResult,
  createInvalidResult 
} from '@/lib/validation';
import { FieldDefinition, ValidationResult as FieldValidationResult } from '@/lib/field-system/types';

// ==================== Type Definitions ====================

/**
 * AI validation suggestion with confidence scoring
 */
export interface ValidationSuggestion {
  originalValue: any;
  suggestedValue: any;
  explanation: string;
  confidence: number; // 0.0 - 1.0
  isValid: boolean;
  reasoning: string;
}

/**
 * Context-aware validation result
 */
export interface ContextualValidationResult {
  isValid: boolean;
  isSuspicious: boolean;
  confidence: number;
  reasoning: string;
  warnings?: string[];
  suggestions?: string[];
  domainContext?: string;
}

/**
 * User-friendly error explanation
 */
export interface ErrorExplanation {
  technicalError: string;
  plainLanguageExplanation: string;
  remediationSteps: string[];
  examples?: string[];
  confidence: number;
}

// ==================== System Prompts ====================

/**
 * System prompt for AI validator
 */
export const AI_VALIDATOR_PROMPT = `You are a data validation expert for the AGNES wellness platform.
Your role is to:
1. Suggest corrections for invalid field values
2. Validate data using domain knowledge (health, fitness, finance)
3. Explain validation errors in plain language
4. Flag suspicious values even if technically valid

Always provide:
- Clear explanations suitable for non-technical users
- Confidence scores (0.0-1.0) for your suggestions
- Actionable remediation steps

Be cautious with health/medical data - err on the side of requesting verification.
Use domain knowledge appropriately:
- Health metrics: normal ranges, suspicious patterns, measurement units
- Financial data: reasonable ranges, common patterns, risk indicators
- Dates/times: logical constraints, future/past validity
- Text fields: common patterns, formatting conventions

Return responses in valid JSON format only.`;

// ==================== Helper Functions ====================

/**
 * Safely parse JSON from LLM response
 */
function parseJsonFromResponse(response: string): any {
  try {
    // Try direct parse first
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Try to find any JSON object in the response
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }
    
    throw new Error('No valid JSON found in response');
  }
}

/**
 * Load user's module profile for context
 */
async function loadUserContext(
  userId: string | undefined,
  moduleId: string,
  encryptionKey: CryptoKey | null | undefined
): Promise<Record<string, unknown> | null> {
  if (!userId || !encryptionKey) return null;

  try {
    const { getNexusDataLayer } = await import('@/lib/data-layer/provider');
    const { decryptWithKey } = await import('@/lib/encryption');

    const record = await getNexusDataLayer().getDocument<Record<string, unknown>>(
      'intake_profiles',
      `${userId}_${moduleId}`
    );

    if (!record) return null;

    const data = record as Record<string, unknown>;

    // Decrypt if encrypted
    if (data?.encrypted && encryptionKey) {
      try {
        const decrypted = await decryptWithKey(
          data.encrypted as Parameters<typeof decryptWithKey>[0],
          encryptionKey
        );
        return JSON.parse(decrypted) as Record<string, unknown>;
      } catch (error) {
        console.error(`[AI Validation] Failed to decrypt profile:`, error);
        return null;
      }
    }

    return data;
  } catch (error) {
    console.error(`[AI Validation] Failed to load user context:`, error);
    return null;
  }
}

/**
 * Get domain-specific context hints
 */
function getDomainContext(moduleId: string, fieldName?: string): string {
  const domainHints: Record<string, string> = {
    titan: 'Health and wellness data: heart rate (60-100 resting), blood pressure (90-120/60-80 normal), weight, fitness metrics, biomarkers.',
    soma: 'Physical activity and movement: workout duration, exercise intensity, recovery time, step count.',
    ledger: 'Financial data: income, expenses, budgets. Check for reasonable amounts and patterns.',
    atlas: 'Goals and aspirations: realistic timeframes, measurable targets, logical priorities.',
    agnes: 'Beliefs and values: coherent reasoning, logical connections, personal growth patterns.',
    scout: 'Task and project management: deadlines, priorities, dependencies.',
    forge: 'Skills and learning: time commitments, difficulty levels, prerequisites.'
  };

  return domainHints[moduleId] || 'General user data validation.';
}

// ==================== Action: suggest_field_fix ====================

/**
 * AI suggests corrections for invalid field values
 * 
 * @action suggest_field_fix
 * @payload {
 *   fieldDefinition: FieldDefinition,
 *   invalidValue: any,
 *   validationError: ValidationError
 * }
 */
export async function suggestFieldFix(context: ActionContext): Promise<void> {
  const { payload, userId, moduleId, sendMessage, pushAssistantMessage, encryptionKey } = context;

  if (!sendMessage) {
    pushAssistantMessage?.('⚠️ AI service unavailable for validation assistance.');
    return;
  }

  // Extract payload
  const fieldDefinition = payload.fieldDefinition as FieldDefinition | undefined;
  const invalidValue = payload.invalidValue;
  const validationError = payload.validationError as ValidationError | undefined;

  if (!fieldDefinition || !validationError) {
    pushAssistantMessage?.('⚠️ Missing required field definition or validation error.');
    return;
  }

  try {
    // Load user context for better suggestions
    const userContext = await loadUserContext(userId, moduleId, encryptionKey);
    const domainContext = getDomainContext(moduleId, fieldDefinition.name);

    // Build LLM prompt
    const promptContent = `Suggest a correction for this invalid field value:

Field Information:
- Name: ${fieldDefinition.name}
- Type: ${fieldDefinition.type}
- Description: ${fieldDefinition.description || 'N/A'}
- Required: ${fieldDefinition.required || false}
- Validation Rules: ${JSON.stringify(fieldDefinition.validation || {})}

Invalid Value: ${JSON.stringify(invalidValue)}
Validation Error: ${validationError.message} (Code: ${validationError.code})

Domain Context: ${domainContext}

${userContext ? `User Profile Context: ${JSON.stringify(userContext, null, 2)}` : ''}

Provide a corrected value with explanation. Return JSON:
{
  "correctedValue": <the corrected value>,
  "explanation": "Clear explanation of what was wrong and how it was fixed",
  "confidence": 0.85,
  "reasoning": "Why this correction is appropriate based on context"
}

If the value cannot be reliably corrected, set confidence below 0.5 and explain why.`;

    const { response } = await sendMessage(promptContent, {
      systemPrompt: AI_VALIDATOR_PROMPT,
      memoryContext: [],
      summary: '',
      history: []
    });

    // Parse AI response
    let suggestion: any;
    try {
      suggestion = parseJsonFromResponse(response.fullText);
    } catch (e) {
      console.error('[suggestFieldFix] Failed to parse AI response:', e);
      pushAssistantMessage?.('⚠️ Failed to parse AI suggestion. Please try again.');
      return;
    }

    // Validate the suggested fix using standard validation
    let revalidation: FrameworkValidationResult | FieldValidationResult;
    
    // Use appropriate validation based on field definition
    if (fieldDefinition.validation) {
      // Use field-system validation if available
      const { validateFieldValue } = await import('@/lib/field-system/field-system');
      revalidation = validateFieldValue(fieldDefinition, suggestion.correctedValue);
    } else {
      // Fallback to simple validation
      revalidation = createValidResult();
    }

    const isValid = 'isValid' in revalidation ? revalidation.isValid : revalidation.valid;

    // Build result message
    const result: ValidationSuggestion = {
      originalValue: invalidValue,
      suggestedValue: suggestion.correctedValue,
      explanation: suggestion.explanation || 'No explanation provided',
      confidence: suggestion.confidence || 0.5,
      isValid,
      reasoning: suggestion.reasoning || ''
    };

    // Emit result as spine event
    context.emitSpineEvent('ai_validation_suggestion', {
      fieldId: fieldDefinition.id,
      suggestion: result
    });

    // Push message to user
    const confidenceEmoji = result.confidence > 0.8 ? '✅' : result.confidence > 0.5 ? '⚠️' : '❓';
    pushAssistantMessage?.(
      `${confidenceEmoji} **Suggested Fix** (${Math.round(result.confidence * 100)}% confidence)\n\n` +
      `**Original:** ${JSON.stringify(invalidValue)}\n` +
      `**Suggested:** ${JSON.stringify(result.suggestedValue)}\n` +
      `**Explanation:** ${result.explanation}\n\n` +
      (isValid ? '✓ This value passes validation.' : '⚠️ Warning: Suggested value still may need adjustment.')
    );

  } catch (error) {
    console.error('[suggestFieldFix] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to generate field fix suggestion.');
  }
}

// ==================== Action: validate_with_context ====================

/**
 * AI validates field value using domain knowledge and user context
 * 
 * @action validate_with_context
 * @payload {
 *   fieldDefinition: FieldDefinition,
 *   value: any,
 *   includeProfile?: boolean
 * }
 */
export async function validateWithContext(context: ActionContext): Promise<void> {
  const { payload, userId, moduleId, sendMessage, pushAssistantMessage, encryptionKey } = context;

  if (!sendMessage) {
    pushAssistantMessage?.('⚠️ AI service unavailable for contextual validation.');
    return;
  }

  const fieldDefinition = payload.fieldDefinition as FieldDefinition | undefined;
  const value = payload.value;
  const includeProfile = payload.includeProfile !== false; // Default true

  if (!fieldDefinition) {
    pushAssistantMessage?.('⚠️ Missing required field definition.');
    return;
  }

  try {
    // Load user context
    const userContext = includeProfile 
      ? await loadUserContext(userId, moduleId, encryptionKey)
      : null;
    
    const domainContext = getDomainContext(moduleId, fieldDefinition.name);

    // First, run standard validation
    let standardValidation: FrameworkValidationResult | FieldValidationResult;
    
    if (fieldDefinition.validation) {
      const { validateFieldValue } = await import('@/lib/field-system/field-system');
      standardValidation = validateFieldValue(fieldDefinition, value);
    } else {
      standardValidation = createValidResult();
    }

    const standardIsValid = 'isValid' in standardValidation 
      ? standardValidation.isValid 
      : standardValidation.valid;

    // Build contextual validation prompt
    const promptContent = `Validate this field value using domain knowledge and user context:

Field Information:
- Name: ${fieldDefinition.name}
- Type: ${fieldDefinition.type}
- Description: ${fieldDefinition.description || 'N/A'}
- Validation Rules: ${JSON.stringify(fieldDefinition.validation || {})}

Value to Validate: ${JSON.stringify(value)}
Standard Validation Result: ${standardIsValid ? 'PASSED' : 'FAILED'}

Domain Context: ${domainContext}

${userContext ? `User Profile Context: ${JSON.stringify(userContext, null, 2)}` : 'No user profile context available.'}

Analyze if this value is:
1. Technically valid (meets format/type requirements)
2. Contextually valid (makes sense given domain knowledge)
3. Suspicious or potentially erroneous (even if technically valid)

Return JSON:
{
  "isValid": true/false,
  "isSuspicious": true/false,
  "confidence": 0.85,
  "reasoning": "Detailed explanation of validation assessment",
  "warnings": ["Array of warnings if value is suspicious"],
  "suggestions": ["Recommendations for the user"],
  "domainContext": "Relevant domain knowledge applied"
}

Examples:
- Heart rate of 300 bpm: technically valid number, but medically dangerous
- Income of $1 million/month for a college student: suspicious pattern
- Future date for "date of birth": logically invalid`;

    const { response } = await sendMessage(promptContent, {
      systemPrompt: AI_VALIDATOR_PROMPT,
      memoryContext: [],
      summary: '',
      history: []
    });

    // Parse AI response
    let validationResult: any;
    try {
      validationResult = parseJsonFromResponse(response.fullText);
    } catch (e) {
      console.error('[validateWithContext] Failed to parse AI response:', e);
      pushAssistantMessage?.('⚠️ Failed to parse validation result. Please try again.');
      return;
    }

    const result: ContextualValidationResult = {
      isValid: validationResult.isValid ?? standardIsValid,
      isSuspicious: validationResult.isSuspicious ?? false,
      confidence: validationResult.confidence ?? 0.7,
      reasoning: validationResult.reasoning || 'No reasoning provided',
      warnings: validationResult.warnings || [],
      suggestions: validationResult.suggestions || [],
      domainContext: validationResult.domainContext
    };

    // Emit result
    context.emitSpineEvent('ai_contextual_validation', {
      fieldId: fieldDefinition.id,
      value,
      result
    });

    // Build user message
    let message = `**Contextual Validation Result**\n\n`;
    
    if (result.isValid && !result.isSuspicious) {
      message += `✅ **Valid** - Value passes all checks\n`;
    } else if (result.isValid && result.isSuspicious) {
      message += `⚠️ **Valid but Suspicious** - Value is technically correct but unusual\n`;
    } else {
      message += `❌ **Invalid** - Value does not pass validation\n`;
    }

    message += `**Confidence:** ${Math.round(result.confidence * 100)}%\n\n`;
    message += `**Analysis:** ${result.reasoning}\n`;

    if (result.warnings && result.warnings.length > 0) {
      message += `\n**Warnings:**\n${result.warnings.map(w => `- ${w}`).join('\n')}\n`;
    }

    if (result.suggestions && result.suggestions.length > 0) {
      message += `\n**Suggestions:**\n${result.suggestions.map(s => `- ${s}`).join('\n')}\n`;
    }

    pushAssistantMessage?.(message);

  } catch (error) {
    console.error('[validateWithContext] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to perform contextual validation.');
  }
}

// ==================== Action: explain_validation_error ====================

/**
 * AI explains validation errors in plain, user-friendly language
 * 
 * @action explain_validation_error
 * @payload {
 *   validationError: ValidationError | ValidationResult,
 *   fieldDefinition?: FieldDefinition
 * }
 */
export async function explainValidationError(context: ActionContext): Promise<void> {
  const { payload, moduleId, sendMessage, pushAssistantMessage } = context;

  if (!sendMessage) {
    pushAssistantMessage?.('⚠️ AI service unavailable for error explanation.');
    return;
  }

  const validationError = payload.validationError as ValidationError | FrameworkValidationResult | undefined;
  const fieldDefinition = payload.fieldDefinition as FieldDefinition | undefined;

  if (!validationError) {
    pushAssistantMessage?.('⚠️ Missing validation error to explain.');
    return;
  }

  try {
    // Extract error details
    let errorMessage: string;
    let errorCode: string;
    let fieldName: string;

    if ('valid' in validationError) {
      // It's a ValidationResult
      if (validationError.errors.length === 0) {
        pushAssistantMessage?.('✅ No validation errors to explain.');
        return;
      }
      const firstError = validationError.errors[0];
      errorMessage = firstError.message;
      errorCode = firstError.code;
      fieldName = firstError.field;
    } else {
      // It's a ValidationError
      errorMessage = validationError.message;
      errorCode = validationError.code;
      fieldName = validationError.field;
    }

    const domainContext = getDomainContext(moduleId, fieldName);

    // Build explanation prompt
    const promptContent = `Explain this validation error in plain, user-friendly language:

Field: ${fieldName}
${fieldDefinition ? `Field Type: ${fieldDefinition.type}` : ''}
${fieldDefinition?.description ? `Field Description: ${fieldDefinition.description}` : ''}

Technical Error Message: "${errorMessage}"
Error Code: ${errorCode}
${fieldDefinition?.validation ? `Validation Rules: ${JSON.stringify(fieldDefinition.validation)}` : ''}

Domain Context: ${domainContext}

Provide a clear explanation that:
1. Explains what went wrong in simple terms (avoid technical jargon)
2. Provides specific steps to fix the error
3. Includes 1-2 examples of valid values
4. Is friendly and helpful in tone

Return JSON:
{
  "plainLanguageExplanation": "User-friendly explanation of the error",
  "remediationSteps": [
    "Step 1: Clear action the user should take",
    "Step 2: Another specific step"
  ],
  "examples": [
    "Example of a valid value",
    "Another example if helpful"
  ],
  "confidence": 0.9
}

Example transformations:
- "pattern '^[0-9]{5}$' failed" → "ZIP code must be exactly 5 digits (e.g., 90210)"
- "minimum value is 0" → "This value cannot be negative. Please enter a positive number or zero."
- "required field" → "This field is required. Please provide a value before continuing."`;

    const { response } = await sendMessage(promptContent, {
      systemPrompt: AI_VALIDATOR_PROMPT,
      memoryContext: [],
      summary: '',
      history: []
    });

    // Parse AI response
    let explanation: any;
    try {
      explanation = parseJsonFromResponse(response.fullText);
    } catch (e) {
      console.error('[explainValidationError] Failed to parse AI response:', e);
      pushAssistantMessage?.('⚠️ Failed to generate error explanation. Please try again.');
      return;
    }

    const result: ErrorExplanation = {
      technicalError: errorMessage,
      plainLanguageExplanation: explanation.plainLanguageExplanation || errorMessage,
      remediationSteps: explanation.remediationSteps || ['Please correct the value and try again.'],
      examples: explanation.examples || [],
      confidence: explanation.confidence || 0.7
    };

    // Emit result
    context.emitSpineEvent('ai_error_explanation', {
      fieldName,
      errorCode,
      explanation: result
    });

    // Build user message
    let message = `**Error Explanation**\n\n`;
    message += `❌ **Problem:** ${result.plainLanguageExplanation}\n\n`;
    
    if (result.remediationSteps.length > 0) {
      message += `**How to Fix:**\n${result.remediationSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n`;
    }

    if (result.examples && result.examples.length > 0) {
      message += `\n**Valid Examples:**\n${result.examples.map(ex => `- ${ex}`).join('\n')}\n`;
    }

    pushAssistantMessage?.(message);

  } catch (error) {
    console.error('[explainValidationError] Error:', error);
    pushAssistantMessage?.('⚠️ Failed to explain validation error.');
  }
}

// ==================== Action Registration Helper ====================

/**
 * Register all validation actions with a module
 */
export function registerValidationActions(moduleId: string): void {
  ActionHub.registerMultiple(moduleId, {
    suggest_field_fix: suggestFieldFix,
    validate_with_context: validateWithContext,
    explain_validation_error: explainValidationError
  });
}

/**
 * Register validation actions globally (available to all modules)
 */
export function registerGlobalValidationActions(): void {
  ActionHub.registerMultiple('nexus', {
    suggest_field_fix: suggestFieldFix,
    validate_with_context: validateWithContext,
    explain_validation_error: explainValidationError
  });
}
