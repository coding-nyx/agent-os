/**
 * AI Field Suggestion Actions
 * 
 * Enables AI to propose and create custom fields directly with module validation.
 * These actions allow the AI to:
 * 1. Suggest new custom fields based on user needs
 * 2. Create validated custom fields in the schema registry
 * 3. Delete custom fields that are no longer needed
 * 
 * All fields go through module-specific validation before being added.
 * 
 * @module field-suggestion-actions
 */

import { ActionHub, ActionContext } from './action-hub';
import { SchemaRegistry } from '@/lib/schema-registry';
import { FieldDefinition, FieldType } from '@/lib/field-system/types';
import { createFieldDefinition } from '@/lib/field-system/field-system';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import type { StructuredResponse } from '@/lib/ai-adapters/engine-types';

// ==================== Type Definitions ====================

/**
 * Field idea provided by user or AI
 */
export interface FieldIdea {
  description: string;
  purpose: string;
  exampleValue?: any;
  suggestedType?: FieldType;
}

/**
 * Generated field definition with confidence
 */
export interface GeneratedField {
  field: FieldDefinition;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  contextualNotes?: string;
}

/**
 * Result from field suggestion/creation
 */
export interface FieldActionResult {
  success: boolean;
  field?: FieldDefinition;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  validationDetails?: any;
}

// ==================== System Prompts ====================

/**
 * System prompt for field generation
 */
const FIELD_GENERATOR_PROMPT = `You are a field definition generator for the AGNES wellness platform.
Your role is to generate complete, validated FieldDefinition objects based on user ideas or needs.

Given a field idea and module context, you must output a JSON object with:

{
  "id": "kebab-case-unique-id",
  "name": "Human Readable Name",
  "type": "text|number|select|multiSelect|date|textarea|boolean|range",
  "description": "Clear explanation of what this field captures",
  "required": true/false,
  "validation": {
    // JSON Schema validation rules (optional)
    // e.g., "minimum": 0, "maximum": 100, "pattern": "regex"
  },
  "options": [
    // For select/multiSelect only
    { "value": "option1", "label": "Option 1" },
    { "value": "option2", "label": "Option 2" }
  ],
  "metadata": {
    "category": "Optional category",
    "helpText": "Additional help for users",
    "placeholder": "Example placeholder text"
  }
}

**Context-Aware Field Types by Module:**

- **therapy**: Psychological/emotional fields
  - Mood scales, therapy session notes, coping strategies, triggers
  - Use: RANGE for scales (1-10), TEXTAREA for reflections, SELECT for categories
  
- **trainer**: Fitness/health fields
  - Exercise sets, workout intensity, body measurements, recovery metrics
  - Use: NUMBER for reps/weights, RANGE for RPE, SELECT for exercise types

- **ledger**: Financial fields
  - Transaction categories, payment methods, budget allocations
  - Use: NUMBER for amounts, SELECT for categories, TEXT for notes

- **soma**: Biometric/health fields
  - Health metrics, symptoms, vital signs, medication tracking
  - Use: NUMBER for measurements, DATE for tracking, MULTI_SELECT for symptoms

- **atlas**: Planning/scheduling fields
  - Task priorities, energy levels, time blocks, project tags
  - Use: SELECT for priorities, RANGE for energy, DATE for deadlines

**Field ID Rules:**
- Must be kebab-case (lowercase, hyphens only)
- Must be unique within the module
- Should be descriptive (e.g., "workout-intensity", "mood-scale", "transaction-category")
- No special characters except hyphens

**Validation Rules (JSON Schema):**
- For numbers: minimum, maximum, multipleOf
- For text: minLength, maxLength, pattern (regex)
- For dates: minimum, maximum (ISO date strings)
- For select: enum array matching option values

**Important:**
- Be conservative with "required" - default to false unless explicitly critical
- Add helpful descriptions that explain WHY a field exists
- Include placeholder text or help text when it would aid users
- For subjective scales, use RANGE type with min/max in validation
- For lists of symptoms/tags, use MULTI_SELECT
- For open-ended input, use TEXTAREA instead of TEXT

Output ONLY valid JSON. No markdown, no explanations outside the JSON.`;

/**
 * Module-specific field guidance
 */
const MODULE_FIELD_GUIDANCE: Record<string, string> = {
  therapy: `Focus on emotional wellness and therapeutic tracking.
Common field types: mood scales (range 1-10), session notes (textarea), trigger identification (multiSelect), coping strategies (text).
Be sensitive - these are personal mental health fields.`,

  trainer: `Focus on fitness and physical training data.
Common field types: exercise metrics (number), workout RPE (range 1-10), exercise categories (select), body measurements (number with units).
Consider tracking progress over time.`,

  ledger: `Focus on financial tracking and budgeting.
Common field types: amounts (number), categories (select), payment methods (select), notes (text).
Ensure currency and numeric precision.`,

  soma: `Focus on biometric and health tracking.
Common field types: vital signs (number), symptom tracking (multiSelect), medication logs (text), health dates (date).
Be medically appropriate - don't suggest diagnostic fields.`,

  atlas: `Focus on planning, scheduling, and task management.
Common field types: priorities (select), energy levels (range), deadlines (date), tags (multiSelect).
Support productivity and time management.`,

  default: `This is a general-purpose module.
Use standard field types appropriate for structured data entry.
Focus on clarity and user-friendliness.`,
};

// ==================== Helper Functions ====================

/**
 * Convert FieldIdea to prompt for LLM field generation
 */
function createFieldGenerationPrompt(
  fieldIdea: FieldIdea,
  moduleId: string
): string {
  const guidance = MODULE_FIELD_GUIDANCE[moduleId] || MODULE_FIELD_GUIDANCE.default;

  return `Generate a FieldDefinition for this field idea:

**Field Idea:**
${fieldIdea.description}

**Purpose:**
${fieldIdea.purpose}

${fieldIdea.exampleValue ? `**Example Value:**\n${JSON.stringify(fieldIdea.exampleValue, null, 2)}\n` : ''}

${fieldIdea.suggestedType ? `**Suggested Type:**\n${fieldIdea.suggestedType}\n` : ''}

**Module Context:** ${moduleId}
${guidance}

Generate a complete FieldDefinition as JSON. Output ONLY the JSON object, no markdown or explanations.`;
}

/**
 * Generate field definition using LLM
 */
async function generateFieldFromIdea(
  fieldIdea: FieldIdea,
  moduleId: string,
  sendMessage: ActionContext['sendMessage']
): Promise<GeneratedField> {
  if (!sendMessage) {
    throw new Error('sendMessage function not available in action context');
  }

  const prompt = createFieldGenerationPrompt(fieldIdea, moduleId);

  const context: ConversationContext = {
    systemPrompt: FIELD_GENERATOR_PROMPT,
    memoryContext: [],
    summary: `Generating custom field for ${moduleId} module`,
    history: [],
  };

  try {
    const { response } = await sendMessage(prompt, context);

    // Extract field definition from response
    let fieldDef: any;
    
    if (response.actions && response.actions.length > 0) {
      // Check if structured response has field data
      const fieldAction = response.actions.find(a => a.payload);
      if (fieldAction) {
        fieldDef = fieldAction.payload;
      }
    }

    // If not in actions, try parsing from text
    if (!fieldDef && (response.publicText || response.fullText)) {
      // Extract JSON from publicText or fullText (handles markdown code blocks)
      const responseText = response.publicText || response.fullText;
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                       responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, responseText];
      
      const jsonStr = jsonMatch[1]?.trim() || responseText.trim();
      fieldDef = JSON.parse(jsonStr);
    }

    if (!fieldDef || !fieldDef.id || !fieldDef.name || !fieldDef.type) {
      throw new Error('LLM did not return a valid field definition');
    }

    // Create validated FieldDefinition using field-system
    const field = createFieldDefinition({
      id: fieldDef.id,
      name: fieldDef.name,
      type: fieldDef.type as FieldType,
      description: fieldDef.description,
      required: fieldDef.required || false,
      defaultValue: fieldDef.defaultValue,
      validation: fieldDef.validation,
      metadata: fieldDef.metadata,
      options: fieldDef.options,
    });

    return {
      field,
      confidence: 0.85, // High confidence since it passed validation
      reasoning: fieldDef.description || 'Field generated based on user requirements',
      contextualNotes: response.publicText || response.fullText,
    };
  } catch (error) {
    console.error('[FieldSuggestion] LLM field generation failed:', error);
    throw new Error(`Failed to generate field: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse field definition from payload (direct creation)
 */
function parseFieldDefinitionFromPayload(payload: Record<string, unknown>): FieldDefinition {
  // If fieldDefinition is provided directly
  if (payload.fieldDefinition && typeof payload.fieldDefinition === 'object') {
    const def = payload.fieldDefinition as any;
    return createFieldDefinition({
      id: def.id,
      name: def.name,
      type: def.type as FieldType,
      description: def.description,
      required: def.required,
      defaultValue: def.defaultValue,
      validation: def.validation,
      metadata: def.metadata,
      options: def.options,
      properties: def.properties,
    });
  }

  // If individual fields are provided
  if (payload.id && payload.name && payload.type) {
    return createFieldDefinition({
      id: payload.id as string,
      name: payload.name as string,
      type: payload.type as FieldType,
      description: payload.description as string | undefined,
      required: payload.required as boolean | undefined,
      defaultValue: payload.defaultValue,
      validation: payload.validation as any,
      metadata: payload.metadata as any,
      options: payload.options as any,
    });
  }

  throw new Error('Invalid field definition in payload');
}

// ==================== Action Handlers ====================

/**
 * Action: suggest_field
 * AI proposes a new custom field based on a field idea
 * 
 * Input:
 *   - fieldIdea: { description, purpose, exampleValue?, suggestedType? }
 *   - moduleId: string
 * 
 * Output:
 *   - Generated FieldDefinition with validation status
 */
async function suggestFieldAction(context: ActionContext): Promise<void> {
  const { payload, moduleId, sendMessage, pushAssistantMessage } = context;

  try {
    // Parse field idea from payload
    const fieldIdea: FieldIdea = {
      description: (payload.description || payload.fieldIdea) as string,
      purpose: payload.purpose as string || 'User requested custom field',
      exampleValue: payload.exampleValue,
      suggestedType: payload.suggestedType as FieldType | undefined,
    };

    if (!fieldIdea.description) {
      throw new Error('Field description is required');
    }

    // Generate field using LLM
    const generated = await generateFieldFromIdea(fieldIdea, moduleId, sendMessage);

    // Validate with module
    const validation = SchemaRegistry.validateExtension(moduleId, generated.field);

    const result: FieldActionResult = {
      success: validation.valid,
      field: generated.field,
      message: validation.valid 
        ? `Suggested field: "${generated.field.name}" (${generated.field.type})`
        : `Field suggestion has validation errors`,
      errors: validation.errors,
      validationDetails: {
        confidence: generated.confidence,
        reasoning: generated.reasoning,
      },
    };

    // Return result to user
    if (pushAssistantMessage) {
      if (result.success) {
        pushAssistantMessage(
          `I've suggested a custom field for you:\n\n` +
          `**${generated.field.name}** (${generated.field.type})\n` +
          `${generated.field.description}\n\n` +
          `${generated.reasoning}\n\n` +
          `Would you like me to add this field to your ${moduleId} module?`
        );
      } else {
        pushAssistantMessage(
          `I generated a field suggestion, but it has some validation issues:\n\n` +
          result.errors!.map(e => `- ${e.message}`).join('\n') +
          `\n\nLet me try again with adjusted parameters.`
        );
      }
    }

    console.log('[FieldSuggestion] suggest_field result:', result);
  } catch (error) {
    console.error('[FieldSuggestion] suggest_field error:', error);
    if (pushAssistantMessage) {
      pushAssistantMessage(
        `I encountered an error while suggesting a field: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Action: create_field
 * AI creates a custom field directly (with user visibility)
 * 
 * Input:
 *   - fieldDefinition?: FieldDefinition (or individual field properties)
 *   - fieldIdea?: FieldIdea (to generate from idea)
 *   - moduleId: string
 * 
 * Output:
 *   - Created field added to schema registry
 *   - Spine event emitted
 */
async function createFieldAction(context: ActionContext): Promise<void> {
  const { payload, moduleId, userId, sendMessage, pushAssistantMessage, emitSpineEvent } = context;

  try {
    let fieldDef: FieldDefinition;

    // Check if we need to generate from idea or use provided definition
    if (payload.fieldIdea) {
      // Generate from idea
      const fieldIdea = payload.fieldIdea as FieldIdea;
      const generated = await generateFieldFromIdea(fieldIdea, moduleId, sendMessage);
      fieldDef = generated.field;
    } else {
      // Parse from payload
      fieldDef = parseFieldDefinitionFromPayload(payload);
    }

    // Validate with module
    const validation = SchemaRegistry.validateExtension(moduleId, fieldDef);

    if (!validation.valid) {
      const result: FieldActionResult = {
        success: false,
        message: `Field rejected by ${moduleId} module validation`,
        errors: validation.errors,
      };

      if (pushAssistantMessage) {
        pushAssistantMessage(
          `I couldn't create the field "${fieldDef.name}" because:\n\n` +
          validation.errors.map(e => `- ${e.message}`).join('\n')
        );
      }

      console.error('[FieldSuggestion] create_field validation failed:', result);
      return;
    }

    // Add to schema registry
    const extensionResult = await SchemaRegistry.extendSchema(moduleId, [fieldDef]);

    if (!extensionResult.valid) {
      const result: FieldActionResult = {
        success: false,
        message: 'Failed to add field to schema registry',
        errors: extensionResult.errors,
      };

      if (pushAssistantMessage) {
        pushAssistantMessage(
          `I couldn't add the field to the schema registry:\n\n` +
          extensionResult.errors.map(e => `- ${e.message}`).join('\n')
        );
      }

      console.error('[FieldSuggestion] create_field extension failed:', result);
      return;
    }

    // Save to Firestore if user is authenticated
    if (userId) {
      try {
        await SchemaRegistry.saveExtensions(userId, moduleId);
      } catch (error) {
        console.warn('[FieldSuggestion] Failed to save extensions to Firestore:', error);
        // Non-fatal - field is still in memory cache
      }
    }

    // Emit Spine event (already emitted by extendSchema, but we can emit additional info)
    emitSpineEvent('FIELD_CREATED', {
      moduleId,
      fieldId: fieldDef.id,
      fieldName: fieldDef.name,
      fieldType: fieldDef.type,
    });

    const result: FieldActionResult = {
      success: true,
      field: fieldDef,
      message: `Created custom field: ${fieldDef.name}`,
    };

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `✅ I've created the custom field **${fieldDef.name}** in your ${moduleId} module!\n\n` +
        `**Type:** ${fieldDef.type}\n` +
        `**Description:** ${fieldDef.description || 'No description'}\n\n` +
        `You can now use this field to track ${fieldDef.description?.toLowerCase() || 'custom data'}.`
      );
    }

    console.log('[FieldSuggestion] create_field success:', result);
  } catch (error) {
    console.error('[FieldSuggestion] create_field error:', error);
    if (pushAssistantMessage) {
      pushAssistantMessage(
        `I encountered an error while creating the field: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Action: delete_field
 * Remove a custom extension field
 * 
 * Input:
 *   - fieldId: string
 *   - moduleId: string
 * 
 * Output:
 *   - Field removed from schema registry
 *   - Spine event emitted
 */
async function deleteFieldAction(context: ActionContext): Promise<void> {
  const { payload, moduleId, userId, pushAssistantMessage, emitSpineEvent } = context;

  try {
    const fieldId = payload.fieldId as string;

    if (!fieldId) {
      throw new Error('fieldId is required');
    }

    // Get current schema to verify field exists and is an extension
    const schema = SchemaRegistry.getSchema(moduleId);
    if (!schema) {
      throw new Error(`Module ${moduleId} not found`);
    }

    // Check if field is an extension (not core)
    const isCore = schema.coreFields.some(f => f.id === fieldId);
    if (isCore) {
      const result: FieldActionResult = {
        success: false,
        message: `Cannot delete core field: ${fieldId}`,
        errors: [{
          field: 'fieldId',
          message: 'Core fields cannot be deleted',
          code: 'CORE_FIELD_DELETION',
        }],
      };

      if (pushAssistantMessage) {
        pushAssistantMessage(
          `I cannot delete "${fieldId}" because it's a core field of the ${moduleId} module. ` +
          `Only custom extension fields can be deleted.`
        );
      }

      console.error('[FieldSuggestion] delete_field failed:', result);
      return;
    }

    // Check if field exists as extension
    const field = schema.extensionFields.find(f => f.id === fieldId);
    if (!field) {
      const result: FieldActionResult = {
        success: false,
        message: `Extension field ${fieldId} not found`,
        errors: [{
          field: 'fieldId',
          message: `Field ${fieldId} does not exist in ${moduleId} extensions`,
          code: 'FIELD_NOT_FOUND',
        }],
      };

      if (pushAssistantMessage) {
        pushAssistantMessage(
          `I couldn't find a custom field with ID "${fieldId}" in your ${moduleId} module.`
        );
      }

      console.error('[FieldSuggestion] delete_field failed:', result);
      return;
    }

    // Remove from schema registry
    await SchemaRegistry.removeExtension(moduleId, fieldId);

    // Save to Firestore if user is authenticated
    if (userId) {
      try {
        await SchemaRegistry.saveExtensions(userId, moduleId);
      } catch (error) {
        console.warn('[FieldSuggestion] Failed to save extensions to Firestore:', error);
        // Non-fatal - field is still removed from memory cache
      }
    }

    // Emit Spine event (already emitted by removeExtension, but we can emit additional info)
    emitSpineEvent('FIELD_DELETED', {
      moduleId,
      fieldId,
      fieldName: field.name,
    });

    const result: FieldActionResult = {
      success: true,
      message: `Deleted custom field: ${field.name}`,
    };

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `✅ I've deleted the custom field **${field.name}** from your ${moduleId} module.`
      );
    }

    console.log('[FieldSuggestion] delete_field success:', result);
  } catch (error) {
    console.error('[FieldSuggestion] delete_field error:', error);
    if (pushAssistantMessage) {
      pushAssistantMessage(
        `I encountered an error while deleting the field: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// ==================== Action Registration ====================

/**
 * Register all field suggestion actions with the ActionHub
 */
export function registerFieldSuggestionActions(): void {
  // Register for orchestrator (global actions)
  ActionHub.registerMultiple('nexus', {
    suggest_field: suggestFieldAction,
    create_field: createFieldAction,
    delete_field: deleteFieldAction,
  });

  // Register generic baseline for modules that don't have their own field-action implementation.
  // atlas, titan, and ledger are excluded — they register module-specific handlers that take precedence.
  const modules = ['therapy', 'trainer', 'soma', 'scout', 'forge'];
  
  modules.forEach(moduleId => {
    ActionHub.registerMultiple(moduleId, {
      suggest_field: suggestFieldAction,
      create_field: createFieldAction,
      delete_field: deleteFieldAction,
    });
  });

  console.log('[FieldSuggestion] Registered field suggestion actions for all modules');
}

// ==================== Exports ====================

export {
  suggestFieldAction,
  createFieldAction,
  deleteFieldAction,
  generateFieldFromIdea,
  FIELD_GENERATOR_PROMPT,
  MODULE_FIELD_GUIDANCE,
};
