import { useCallback } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';
import { ModuleId, MODULE_MANIFEST } from '@/lib/module-manifest';

type FastTrackPayload = Record<string, unknown>;

type FastTrackValidationOptions = {
  requiredFields: string[];
  objective: string;
};

export type FastTrackValidationResult = {
  accepted: boolean;
  confidence: number;
  reason: string;
  missingFields: string[];
  issues: string[];
  fallbackToGuided: boolean;
};

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function parseValidationResponse(raw: string): Partial<FastTrackValidationResult> | null {
  try {
    const parsed = JSON.parse(sanitizeJsonPayload(raw)) as Record<string, unknown>;
    return {
      accepted: parsed.accepted === true,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'validation_failed',
      missingFields: Array.isArray(parsed.missingFields)
        ? parsed.missingFields.filter((v): v is string => typeof v === 'string')
        : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((v): v is string => typeof v === 'string') : []
    };
  } catch {
    return null;
  }
}

function createValidationPrompt(
  moduleId: ModuleId,
  objective: string,
  requiredFields: string[],
  payload: FastTrackPayload
): string {
  return [
    'You validate onboarding fast-track payloads.',
    'Return ONLY strict JSON in this shape:',
    '{"accepted":true|false,"confidence":0.0-1.0,"reason":"short_reason","missingFields":["field.path"],"issues":["issue"]}',
    `Module: ${moduleId}`,
    `Objective: ${objective}`,
    `Required fields: ${requiredFields.join(', ')}`,
    `Payload: ${JSON.stringify(payload)}`,
    'Rules:',
    '- accepted=true only if payload is coherent and sufficient to skip guided intake.',
    '- confidence must reflect data completeness and plausibility.',
    '- if uncertain, set accepted=false with a short reason.'
  ].join('\n');
}

export function useFastTrackValidation(moduleId: ModuleId) {
  const { sendMessage } = useAI();

  const validateFastTrack = useCallback(
    async (payload: FastTrackPayload, options: FastTrackValidationOptions): Promise<FastTrackValidationResult> => {
      const modulePolicy = MODULE_MANIFEST[moduleId].onboarding.fastTrack;

      const missingFields = options.requiredFields.filter((field) => isMissingValue(resolvePath(payload, field)));
      if (missingFields.length > 0) {
        return {
          accepted: false,
          confidence: 0,
          reason: 'missing_required_fields',
          missingFields,
          issues: [],
          fallbackToGuided: true
        };
      }

      if (!modulePolicy.enabled) {
        return {
          accepted: false,
          confidence: 0,
          reason: 'fast_track_disabled',
          missingFields: [],
          issues: ['Fast-track is disabled for this module'],
          fallbackToGuided: true
        };
      }

      const context: ConversationContext = {
        systemPrompt: 'You are a strict onboarding payload validator.',
        memoryContext: [],
        summary: 'Fast-track validation',
        history: []
      };

      try {
        const prompt = createValidationPrompt(moduleId, options.objective, options.requiredFields, payload);
        const { response } = await sendMessage(prompt, context);
        const parsed = parseValidationResponse(response.publicText || response.fullText);
        if (!parsed) {
          return {
            accepted: false,
            confidence: 0,
            reason: 'validator_unparseable',
            missingFields: [],
            issues: ['Validation response could not be parsed'],
            fallbackToGuided: true
          };
        }

        const confidence = parsed.confidence ?? 0;
        const accepted = parsed.accepted === true && confidence >= modulePolicy.confidenceThreshold;

        return {
          accepted,
          confidence,
          reason: accepted ? 'validated' : parsed.reason || 'below_confidence_threshold',
          missingFields: parsed.missingFields ?? [],
          issues: parsed.issues ?? [],
          fallbackToGuided: !accepted
        };
      } catch {
        return {
          accepted: false,
          confidence: 0,
          reason: 'validator_unavailable',
          missingFields: [],
          issues: ['Validator unavailable'],
          fallbackToGuided: true
        };
      }
    },
    [moduleId, sendMessage]
  );

  return { validateFastTrack };
}
