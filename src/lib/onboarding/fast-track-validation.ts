import { useCallback } from 'react';
import { useAI } from '@/cortex-bridge/ai-context';
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';
import { ModuleId, MODULE_MANIFEST } from '@/lib/module-manifest';
import { OnboardingValidationJs } from '@cortex-logic';

const _onboardingValidation = new OnboardingValidationJs();

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

function isMissingValue(valueJson: string | null | undefined): boolean {
  return _onboardingValidation.isMissingValue(valueJson ?? null);
}

function parseValidationResponse(raw: string): Partial<FastTrackValidationResult> | null {
  const result = _onboardingValidation.parseValidationResponse(sanitizeJsonPayload(raw));
  return result ? JSON.parse(result) as Partial<FastTrackValidationResult> : null;
}

function createValidationPrompt(
  moduleId: ModuleId,
  objective: string,
  requiredFields: string[],
  payload: FastTrackPayload
): string {
  return _onboardingValidation.createValidationPrompt(moduleId, objective, requiredFields, JSON.stringify(payload));
}

export function useFastTrackValidation(moduleId: ModuleId) {
  const { sendMessage } = useAI();

  const validateFastTrack = useCallback(
    async (payload: FastTrackPayload, options: FastTrackValidationOptions): Promise<FastTrackValidationResult> => {
      const modulePolicy = MODULE_MANIFEST[moduleId].onboarding.fastTrack;

      const missingFields = options.requiredFields.filter((field) =>
        isMissingValue(_onboardingValidation.resolvePath(JSON.stringify(payload), field))
      );
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
