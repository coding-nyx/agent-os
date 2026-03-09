/**
 * Tests for AI-Assisted Validation Actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  suggestFieldFix,
  validateWithContext,
  explainValidationError,
  AI_VALIDATOR_PROMPT,
  registerValidationActions,
  registerGlobalValidationActions
} from './validation-actions';
import { ActionHub, ActionContext } from './action-hub';
import { FieldDefinition, FieldType } from '@/lib/field-system/types';
import { ValidationError } from '@/lib/validation';

// ==================== Mock Setup ====================

const createMockContext = (overrides?: Partial<ActionContext>): ActionContext => ({
  userId: 'test-user-123',
  isGuest: false,
  moduleId: 'titan',
  payload: {},
  encryptionKey: null,
  emitSpineEvent: vi.fn(),
  updateGlobalSoul: vi.fn(),
  delegateToModule: vi.fn(),
  pushAssistantMessage: vi.fn(),
  sendMessage: vi.fn(),
  ...overrides
});

const createMockFieldDefinition = (overrides?: Partial<FieldDefinition>): FieldDefinition => ({
  id: 'heart_rate',
  name: 'Heart Rate',
  type: FieldType.NUMBER,
  description: 'Resting heart rate in beats per minute',
  required: true,
  validation: {
    minimum: 40,
    maximum: 200
  },
  ...overrides
});

// ==================== Test: suggestFieldFix ====================

describe('suggestFieldFix', () => {
  let mockContext: ActionContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it('should handle missing sendMessage', async () => {
    mockContext.sendMessage = undefined;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      invalidValue: 'invalid',
      validationError: {
        field: 'heart_rate',
        message: 'Must be a number',
        code: 'INVALID_TYPE'
      }
    };

    await suggestFieldFix(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('AI service unavailable')
    );
  });

  it('should handle missing field definition', async () => {
    mockContext.payload = {
      invalidValue: 'test',
      validationError: { field: 'test', message: 'Error', code: 'TEST' }
    };

    await suggestFieldFix(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Missing required field definition')
    );
  });

  it('should suggest valid correction for numeric field', async () => {
    const fieldDef = createMockFieldDefinition();
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          correctedValue: 72,
          explanation: 'Converted string to number within valid range',
          confidence: 0.95,
          reasoning: 'Heart rate of 72 bpm is within normal resting range (60-100 bpm)'
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: fieldDef,
      invalidValue: '72',
      validationError: {
        field: 'heart_rate',
        message: 'Must be a number',
        code: 'INVALID_TYPE'
      }
    };

    await suggestFieldFix(mockContext);

    // Verify LLM was called with proper context
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Heart Rate'),
      expect.objectContaining({
        systemPrompt: AI_VALIDATOR_PROMPT
      })
    );

    // Verify spine event was emitted
    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_validation_suggestion',
      expect.objectContaining({
        fieldId: 'heart_rate',
        suggestion: expect.objectContaining({
          originalValue: '72',
          suggestedValue: 72,
          confidence: 0.95,
          isValid: true
        })
      })
    );

    // Verify user message
    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Suggested Fix')
    );
    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('95% confidence')
    );
  });

  it('should handle low confidence suggestions', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          correctedValue: null,
          explanation: 'Cannot reliably determine correction without more context',
          confidence: 0.3,
          reasoning: 'Ambiguous input'
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      invalidValue: 'xyz',
      validationError: {
        field: 'heart_rate',
        message: 'Invalid format',
        code: 'INVALID_FORMAT'
      }
    };

    await suggestFieldFix(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('30% confidence')
    );
  });

  it('should handle JSON parsing errors from LLM', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: 'This is not valid JSON'
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      invalidValue: 'test',
      validationError: {
        field: 'heart_rate',
        message: 'Invalid',
        code: 'INVALID'
      }
    };

    await suggestFieldFix(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse')
    );
  });

  it('should extract JSON from markdown code blocks', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: '```json\n{"correctedValue": 75, "explanation": "Fixed", "confidence": 0.9, "reasoning": "Valid"}\n```'
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      invalidValue: '75x',
      validationError: {
        field: 'heart_rate',
        message: 'Invalid format',
        code: 'INVALID_FORMAT'
      }
    };

    await suggestFieldFix(mockContext);

    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_validation_suggestion',
      expect.objectContaining({
        suggestion: expect.objectContaining({
          suggestedValue: 75
        })
      })
    );
  });
});

// ==================== Test: validateWithContext ====================

describe('validateWithContext', () => {
  let mockContext: ActionContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it('should handle missing sendMessage', async () => {
    mockContext.sendMessage = undefined;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      value: 180
    };

    await validateWithContext(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('AI service unavailable')
    );
  });

  it('should validate normal value as valid', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          isValid: true,
          isSuspicious: false,
          confidence: 0.95,
          reasoning: 'Heart rate of 72 bpm is within normal resting range',
          warnings: [],
          suggestions: [],
          domainContext: 'Normal adult resting heart rate: 60-100 bpm'
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      value: 72
    };

    await validateWithContext(mockContext);

    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_contextual_validation',
      expect.objectContaining({
        fieldId: 'heart_rate',
        value: 72,
        result: expect.objectContaining({
          isValid: true,
          isSuspicious: false
        })
      })
    );

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Valid')
    );
  });

  it('should flag suspicious but valid values', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          isValid: true,
          isSuspicious: true,
          confidence: 0.85,
          reasoning: 'Heart rate of 180 bpm is extremely high for resting measurement',
          warnings: [
            'This heart rate is unusually high for a resting measurement',
            'May indicate exercise, stress, or medical condition'
          ],
          suggestions: [
            'Verify this was measured while at rest',
            'Consider consulting a healthcare provider if consistently this high'
          ],
          domainContext: 'Normal resting: 60-100 bpm, Exercising: 100-170 bpm'
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      value: 180
    };

    await validateWithContext(mockContext);

    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_contextual_validation',
      expect.objectContaining({
        result: expect.objectContaining({
          isValid: true,
          isSuspicious: true
        })
      })
    );

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Valid but Suspicious')
    );
    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Warnings:')
    );
  });

  it('should invalidate contextually inappropriate values', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          isValid: false,
          isSuspicious: true,
          confidence: 0.95,
          reasoning: 'Heart rate of 300 bpm is medically impossible for sustained periods',
          warnings: [
            'This value exceeds physiologically possible limits',
            'May indicate measurement error'
          ],
          suggestions: [
            'Check if measurement device is functioning correctly',
            'Retake measurement in a calm state'
          ],
          domainContext: 'Maximum sustained human heart rate: ~220 bpm'
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition({
        validation: { minimum: 40, maximum: 250 } // Technically allows 300
      }),
      value: 300
    };

    await validateWithContext(mockContext);

    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_contextual_validation',
      expect.objectContaining({
        result: expect.objectContaining({
          isValid: false,
          isSuspicious: true
        })
      })
    );

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Invalid')
    );
  });

  it('should include user profile context when available', async () => {
    // Note: Testing with actual profile loading would require mocking Firebase
    // This test verifies the call is made correctly
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          isValid: true,
          isSuspicious: false,
          confidence: 0.9,
          reasoning: 'Value is appropriate for user context',
          warnings: [],
          suggestions: []
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.userId = 'test-user';
    mockContext.encryptionKey = {} as CryptoKey; // Mock key
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      value: 150,
      includeProfile: true
    };

    await validateWithContext(mockContext);

    // Should still work even if profile loading fails
    expect(mockSendMessage).toHaveBeenCalled();
  });
});

// ==================== Test: explainValidationError ====================

describe('explainValidationError', () => {
  let mockContext: ActionContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it('should handle missing sendMessage', async () => {
    mockContext.sendMessage = undefined;
    mockContext.payload = {
      validationError: {
        field: 'test',
        message: 'Error',
        code: 'TEST_ERROR'
      }
    };

    await explainValidationError(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('AI service unavailable')
    );
  });

  it('should explain pattern validation errors', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          plainLanguageExplanation: 'ZIP code must be exactly 5 digits',
          remediationSteps: [
            'Enter a 5-digit ZIP code',
            'Remove any letters or special characters',
            'Do not include ZIP+4 extension'
          ],
          examples: ['90210', '10001', '60601'],
          confidence: 0.95
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      validationError: {
        field: 'zipCode',
        message: "pattern '^[0-9]{5}$' failed",
        code: 'PATTERN_MISMATCH'
      },
      fieldDefinition: {
        id: 'zipCode',
        name: 'ZIP Code',
        type: FieldType.TEXT,
        validation: {
          pattern: '^[0-9]{5}$'
        }
      }
    };

    await explainValidationError(mockContext);

    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_error_explanation',
      expect.objectContaining({
        fieldName: 'zipCode',
        errorCode: 'PATTERN_MISMATCH',
        explanation: expect.objectContaining({
          plainLanguageExplanation: 'ZIP code must be exactly 5 digits',
          examples: expect.arrayContaining(['90210'])
        })
      })
    );

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('ZIP code must be exactly 5 digits')
    );
    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('Valid Examples:')
    );
  });

  it('should explain required field errors', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          plainLanguageExplanation: 'This field is required and cannot be left empty',
          remediationSteps: [
            'Enter a value for this field',
            'Make sure the field contains data before submitting'
          ],
          examples: [],
          confidence: 0.95
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      validationError: {
        field: 'email',
        message: 'Field is required',
        code: 'REQUIRED'
      }
    };

    await explainValidationError(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('required and cannot be left empty')
    );
  });

  it('should handle ValidationResult with multiple errors', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({
      response: {
        fullText: JSON.stringify({
          plainLanguageExplanation: 'Password must be at least 8 characters',
          remediationSteps: ['Use at least 8 characters'],
          examples: ['myP@ssw0rd', 'SecurePass123'],
          confidence: 0.9
        })
      }
    });

    mockContext.sendMessage = mockSendMessage;
    mockContext.payload = {
      validationError: {
        valid: false,
        errors: [
          {
            field: 'password',
            message: 'Minimum length is 8 characters',
            code: 'MIN_LENGTH'
          },
          {
            field: 'password',
            message: 'Must contain special character',
            code: 'PATTERN_MISMATCH'
          }
        ]
      }
    };

    await explainValidationError(mockContext);

    // Should explain the first error
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Minimum length is 8 characters'),
      expect.any(Object)
    );
  });

  it('should handle no errors gracefully', async () => {
    mockContext.payload = {
      validationError: {
        valid: true,
        errors: []
      }
    };

    await explainValidationError(mockContext);

    expect(mockContext.pushAssistantMessage).toHaveBeenCalledWith(
      expect.stringContaining('No validation errors')
    );
  });
});

// ==================== Test: Helper Functions ====================

describe('Helper Functions', () => {
  it('should register validation actions for a module', () => {
    const registerMultipleSpy = vi.spyOn(ActionHub, 'registerMultiple');

    registerValidationActions('titan');

    expect(registerMultipleSpy).toHaveBeenCalledWith(
      'titan',
      expect.objectContaining({
        suggest_field_fix: expect.any(Function),
        validate_with_context: expect.any(Function),
        explain_validation_error: expect.any(Function)
      })
    );
    
    registerMultipleSpy.mockRestore();
  });

  it('should register validation actions globally', () => {
    const registerMultipleSpy = vi.spyOn(ActionHub, 'registerMultiple');

    registerGlobalValidationActions();

    expect(registerMultipleSpy).toHaveBeenCalledWith(
      'orchestrator',
      expect.objectContaining({
        suggest_field_fix: expect.any(Function),
        validate_with_context: expect.any(Function),
        explain_validation_error: expect.any(Function)
      })
    );
    
    registerMultipleSpy.mockRestore();
  });
});

// ==================== Test: System Prompt ====================

describe('AI_VALIDATOR_PROMPT', () => {
  it('should include key validation responsibilities', () => {
    expect(AI_VALIDATOR_PROMPT).toContain('validation expert');
    expect(AI_VALIDATOR_PROMPT).toContain('domain knowledge');
    expect(AI_VALIDATOR_PROMPT).toContain('health');
    expect(AI_VALIDATOR_PROMPT).toContain('finance');
    expect(AI_VALIDATOR_PROMPT).toContain('Confidence scores');
  });

  it('should emphasize caution with health data', () => {
    expect(AI_VALIDATOR_PROMPT).toContain('cautious with health/medical data');
    expect(AI_VALIDATOR_PROMPT).toContain('verification');
  });

  it('should require JSON format', () => {
    expect(AI_VALIDATOR_PROMPT).toContain('JSON');
  });
});

// ==================== Integration Tests ====================

describe('Integration Tests', () => {
  it('should handle complete validation workflow', async () => {
    const mockSendMessage = vi.fn()
      .mockResolvedValueOnce({
        // First call: validate_with_context
        response: {
          fullText: JSON.stringify({
            isValid: false,
            isSuspicious: true,
            confidence: 0.9,
            reasoning: 'Value is out of range',
            warnings: ['Value exceeds normal limits'],
            suggestions: ['Enter a value between 40-200']
          })
        }
      })
      .mockResolvedValueOnce({
        // Second call: explain_validation_error
        response: {
          fullText: JSON.stringify({
            plainLanguageExplanation: 'Heart rate must be between 40 and 200',
            remediationSteps: ['Enter a valid heart rate'],
            examples: ['72', '85', '120'],
            confidence: 0.95
          })
        }
      })
      .mockResolvedValueOnce({
        // Third call: suggest_field_fix
        response: {
          fullText: JSON.stringify({
            correctedValue: 72,
            explanation: 'Corrected to normal resting value',
            confidence: 0.75,
            reasoning: 'Assumed typo, suggested normal value'
          })
        }
      });

    const mockContext = createMockContext({
      sendMessage: mockSendMessage,
      payload: {}
    });

    // 1. Contextual validation
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      value: 720 // Typo: 0 extra digit
    };
    await validateWithContext(mockContext);
    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_contextual_validation',
      expect.any(Object)
    );

    // 2. Explain error
    mockContext.payload = {
      validationError: {
        field: 'heart_rate',
        message: 'Value exceeds maximum',
        code: 'MAX_EXCEEDED'
      }
    };
    await explainValidationError(mockContext);
    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_error_explanation',
      expect.any(Object)
    );

    // 3. Suggest fix
    mockContext.payload = {
      fieldDefinition: createMockFieldDefinition(),
      invalidValue: 720,
      validationError: {
        field: 'heart_rate',
        message: 'Value exceeds maximum',
        code: 'MAX_EXCEEDED'
      }
    };
    await suggestFieldFix(mockContext);
    expect(mockContext.emitSpineEvent).toHaveBeenCalledWith(
      'ai_validation_suggestion',
      expect.any(Object)
    );

    // Verify all three actions were called
    expect(mockSendMessage).toHaveBeenCalledTimes(3);
  });
});
