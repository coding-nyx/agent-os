/**
 * Tests for AI Field Suggestion Actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  suggestFieldAction,
  createFieldAction,
  deleteFieldAction,
  generateFieldFromIdea,
  FIELD_GENERATOR_PROMPT,
  type FieldIdea,
} from './field-suggestion-actions';
import { ActionContext } from './action-hub';
import { SchemaRegistry, SchemaRegistryService } from '@/lib/schema-registry';
import { FieldType } from '@/lib/field-system/types';
import type { ConversationContext } from '@/llm-engine/types';
import type { StructuredResponse } from '@/llm-engine/engine/types';

// ==================== Mocks ====================

// Helper to create a mock StructuredResponse
function createMockStructuredResponse(content: string): StructuredResponse {
  return {
    fullText: content,
    publicText: content,
    internalThoughts: null,
    actions: [],
    isInterrupted: false,
  };
}

const mockSendMessage = vi.fn();
const mockPushAssistantMessage = vi.fn();
const mockEmitSpineEvent = vi.fn();
const mockUpdateGlobalSoul = vi.fn();
const mockDelegateToModule = vi.fn();

function createMockContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    userId: 'test-user-123',
    isGuest: false,
    moduleId: 'therapy',
    payload: {},
    encryptionKey: null,
    sendMessage: mockSendMessage,
    pushAssistantMessage: mockPushAssistantMessage,
    emitSpineEvent: mockEmitSpineEvent,
    updateGlobalSoul: mockUpdateGlobalSoul,
    delegateToModule: mockDelegateToModule,
    ...overrides,
  };
}

// ==================== Test Setup ====================

beforeEach(() => {
  // Reset singleton instance
  SchemaRegistryService.reset();
  
  // Register a test schema
  SchemaRegistry.registerSchema({
    moduleId: 'therapy',
    version: '1.0.0',
    coreSchema: {
      version: '1.0.0',
      coreFields: [
        {
          id: 'session-notes',
          name: 'Session Notes',
          type: FieldType.TEXTAREA,
          description: 'Notes from therapy session',
        },
      ],
      extensionFields: [],
    },
    allowExtensions: true,
    maxExtensionFields: 10,
  });

  // Register a non-extensible schema for testing
  SchemaRegistry.registerSchema({
    moduleId: 'locked-module',
    version: '1.0.0',
    coreSchema: {
      version: '1.0.0',
      coreFields: [],
      extensionFields: [],
    },
    allowExtensions: false,
  });

  // Clear mocks
  vi.clearAllMocks();
});

afterEach(() => {
  SchemaRegistry.clearCache();
});

// ==================== Test Suites ====================

describe('field-suggestion-actions', () => {
  
  describe('generateFieldFromIdea', () => {
    it('should generate a valid field definition from an idea', async () => {
      const fieldIdea: FieldIdea = {
        description: 'Track my daily mood on a scale from 1 to 10',
        purpose: 'Monitor emotional patterns over time',
        suggestedType: FieldType.RANGE,
      };

      // Mock LLM response
      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'mood-scale',
            name: 'Daily Mood',
            type: 'range',
            description: 'Track your emotional state on a scale from 1 (very low) to 10 (very high)',
            required: false,
            validation: {
              minimum: 1,
              maximum: 10,
              multipleOf: 1,
            },
            metadata: {
              category: 'emotional-tracking',
              helpText: 'Rate your overall mood for the day',
            },
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      const result = await generateFieldFromIdea(fieldIdea, 'therapy', mockSendMessage);

      expect(result.field).toBeDefined();
      expect(result.field.id).toBe('mood-scale');
      expect(result.field.name).toBe('Daily Mood');
      expect(result.field.type).toBe(FieldType.RANGE);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();

      // Verify sendMessage was called with correct prompt structure
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Track my daily mood'),
        expect.objectContaining({
          systemPrompt: expect.stringContaining('field definition generator'),
        })
      );
    });

    it('should handle LLM response with markdown code blocks', async () => {
      const fieldIdea: FieldIdea = {
        description: 'Track workout intensity',
        purpose: 'Monitor exercise effort levels',
      };

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: '```json\n{\n  "id": "workout-intensity",\n  "name": "Workout Intensity",\n  "type": "range"\n}\n```',
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      const result = await generateFieldFromIdea(fieldIdea, 'trainer', mockSendMessage);

      expect(result.field).toBeDefined();
      expect(result.field.id).toBe('workout-intensity');
    });

    it('should throw error if LLM returns invalid field definition', async () => {
      const fieldIdea: FieldIdea = {
        description: 'Invalid field',
        purpose: 'Test error handling',
      };

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: '{"incomplete": "field"}',
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      await expect(
        generateFieldFromIdea(fieldIdea, 'therapy', mockSendMessage)
      ).rejects.toThrow('LLM did not return a valid field definition');
    });

    it('should throw error if sendMessage is not available', async () => {
      const fieldIdea: FieldIdea = {
        description: 'Test field',
        purpose: 'Test',
      };

      await expect(
        generateFieldFromIdea(fieldIdea, 'therapy', undefined as any)
      ).rejects.toThrow('sendMessage function not available');
    });
  });

  describe('suggestFieldAction', () => {
    it('should suggest a valid field and return success', async () => {
      const context = createMockContext({
        payload: {
          description: 'Track coping strategies I use',
          purpose: 'Remember what works for me',
        },
      });

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'coping-strategies',
            name: 'Coping Strategies',
            type: 'multiSelect',
            description: 'Track which coping strategies you use',
            options: [
              { value: 'breathing', label: 'Deep Breathing' },
              { value: 'journaling', label: 'Journaling' },
              { value: 'meditation', label: 'Meditation' },
            ],
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      await suggestFieldAction(context);

      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Coping Strategies')
      );
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Would you like me to add this field')
      );
    });

    it('should report validation errors from module validator', async () => {
      const context = createMockContext({
        payload: {
          description: 'Duplicate field',
          purpose: 'Test validation',
        },
      });

      // Mock LLM to return a field with ID that matches existing core field
      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'session-notes', // Conflicts with core field
            name: 'Test Field',
            type: 'text',
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      await suggestFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('validation issues')
      );
    });

    it('should handle missing field description', async () => {
      const context = createMockContext({
        payload: {},
      });

      await suggestFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('createFieldAction', () => {
    it('should create a field from a direct field definition', async () => {
      const context = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'anxiety-level',
            name: 'Anxiety Level',
            type: 'range',
            description: 'Rate your anxiety level',
            validation: {
              minimum: 1,
              maximum: 10,
            },
          },
        },
      });

      await createFieldAction(context);

      // Verify field was added to schema
      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema).toBeDefined();
      expect(schema!.extensionFields).toHaveLength(1);
      expect(schema!.extensionFields[0].id).toBe('anxiety-level');

      // Verify Spine event was emitted
      expect(mockEmitSpineEvent).toHaveBeenCalledWith(
        'FIELD_CREATED',
        expect.objectContaining({
          moduleId: 'therapy',
          fieldId: 'anxiety-level',
        })
      );

      // Verify success message
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('created the custom field')
      );
    });

    it('should create a field from a field idea', async () => {
      const context = createMockContext({
        payload: {
          fieldIdea: {
            description: 'Track stress triggers',
            purpose: 'Identify patterns in what causes stress',
          },
        },
      });

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'stress-triggers',
            name: 'Stress Triggers',
            type: 'multiSelect',
            description: 'Common triggers that increase stress',
            options: [
              { value: 'work', label: 'Work Pressure' },
              { value: 'social', label: 'Social Situations' },
              { value: 'health', label: 'Health Concerns' },
            ],
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      await createFieldAction(context);

      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.extensionFields).toHaveLength(1);
      expect(schema!.extensionFields[0].id).toBe('stress-triggers');
    });

    it('should reject invalid field definition', async () => {
      const context = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'session-notes', // Conflicts with core field
            name: 'Test',
            type: 'text',
          },
        },
      });

      await createFieldAction(context);

      // Schema should still have 0 extensions
      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.extensionFields).toHaveLength(0);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining("couldn't create the field")
      );
    });

    it('should reject field for non-extensible module', async () => {
      const context = createMockContext({
        moduleId: 'locked-module',
        payload: {
          fieldDefinition: {
            id: 'test-field',
            name: 'Test Field',
            type: 'text',
          },
        },
      });

      await createFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('does not allow extensions')
      );
    });

    it('should handle maximum extension limit', async () => {
      const context = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'test-field',
            name: 'Test Field',
            type: 'text',
          },
        },
      });

      // Add fields up to the limit
      for (let i = 0; i < 10; i++) {
        await SchemaRegistry.extendSchema('therapy', [{
          id: `field-${i}`,
          name: `Field ${i}`,
          type: FieldType.TEXT,
        }]);
      }

      // Try to add one more (should fail)
      await createFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('Maximum extension fields')
      );
    });
  });

  describe('deleteFieldAction', () => {
    beforeEach(async () => {
      // Add an extension field to delete
      await SchemaRegistry.extendSchema('therapy', [{
        id: 'custom-field',
        name: 'Custom Field',
        type: FieldType.TEXT,
        description: 'A test custom field',
      }]);
    });

    it('should delete an extension field successfully', async () => {
      const context = createMockContext({
        payload: {
          fieldId: 'custom-field',
        },
      });

      await deleteFieldAction(context);

      // Verify field was removed
      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.extensionFields).toHaveLength(0);

      // Verify Spine event was emitted
      expect(mockEmitSpineEvent).toHaveBeenCalledWith(
        'FIELD_DELETED',
        expect.objectContaining({
          moduleId: 'therapy',
          fieldId: 'custom-field',
        })
      );

      // Verify success message
      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('deleted the custom field')
      );
    });

    it('should prevent deletion of core fields', async () => {
      const context = createMockContext({
        payload: {
          fieldId: 'session-notes', // Core field
        },
      });

      await deleteFieldAction(context);

      // Core field should still exist
      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.coreFields.find(f => f.id === 'session-notes')).toBeDefined();

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining("cannot delete")
      );
    });

    it('should handle non-existent field', async () => {
      const context = createMockContext({
        payload: {
          fieldId: 'non-existent-field',
        },
      });

      await deleteFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining("couldn't find")
      );
    });

    it('should require fieldId parameter', async () => {
      const context = createMockContext({
        payload: {},
      });

      await deleteFieldAction(context);

      expect(mockPushAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('Module-specific field generation', () => {
    it('should generate therapy-appropriate fields', async () => {
      const fieldIdea: FieldIdea = {
        description: 'Track my emotional state',
        purpose: 'Monitor mental health',
      };

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'emotional-state',
            name: 'Emotional State',
            type: 'select',
            description: 'Current emotional state',
            options: [
              { value: 'calm', label: 'Calm' },
              { value: 'anxious', label: 'Anxious' },
              { value: 'happy', label: 'Happy' },
              { value: 'sad', label: 'Sad' },
            ],
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      const result = await generateFieldFromIdea(fieldIdea, 'therapy', mockSendMessage);

      expect(result.field.type).toBe(FieldType.SELECT);
      expect(result.field.options).toHaveLength(4);
    });

    it('should generate trainer-appropriate fields', async () => {
      // Register trainer schema
      SchemaRegistry.registerSchema({
        moduleId: 'trainer',
        version: '1.0.0',
        coreSchema: {
          version: '1.0.0',
          coreFields: [],
          extensionFields: [],
        },
        allowExtensions: true,
      });

      const fieldIdea: FieldIdea = {
        description: 'Track workout RPE',
        purpose: 'Monitor exercise intensity',
      };

      mockSendMessage.mockResolvedValue({
        response: {
          publicText: JSON.stringify({
            id: 'workout-rpe',
            name: 'Workout RPE',
            type: 'range',
            description: 'Rate of Perceived Exertion (1-10)',
            validation: {
              minimum: 1,
              maximum: 10,
            },
          }),
        fullText: "", internalThoughts: null, actions: [], isInterrupted: false } as StructuredResponse,
        updatedHistory: [],
      });

      const result = await generateFieldFromIdea(fieldIdea, 'trainer', mockSendMessage);

      expect(result.field.type).toBe(FieldType.RANGE);
      expect(result.field.validation?.minimum).toBe(1);
      expect(result.field.validation?.maximum).toBe(10);
    });
  });

  describe('Integration with SchemaRegistry', () => {
    it('should persist fields in memory cache', async () => {
      const context = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'test-persistence',
            name: 'Test Persistence',
            type: 'text',
          },
        },
      });

      await createFieldAction(context);

      // Get schema without clearing cache - field should persist
      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.extensionFields.find(f => f.id === 'test-persistence')).toBeDefined();
      
      // Note: When cache is cleared, extensions are lost unless reloaded from Firestore
      // This is expected behavior - tests run without Firebase persistence
    });

    it('should handle concurrent field operations', async () => {
      const context1 = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'concurrent-1',
            name: 'Concurrent 1',
            type: 'text',
          },
        },
      });

      const context2 = createMockContext({
        payload: {
          fieldDefinition: {
            id: 'concurrent-2',
            name: 'Concurrent 2',
            type: 'text',
          },
        },
      });

      // Execute both concurrently
      await Promise.all([
        createFieldAction(context1),
        createFieldAction(context2),
      ]);

      const schema = SchemaRegistry.getSchema('therapy');
      expect(schema!.extensionFields).toHaveLength(2);
      expect(schema!.extensionFields.find(f => f.id === 'concurrent-1')).toBeDefined();
      expect(schema!.extensionFields.find(f => f.id === 'concurrent-2')).toBeDefined();
    });
  });
});
