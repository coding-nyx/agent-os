import type { DiagnosisContextPolicy, ExtractedDataBag } from '@/core/diagnosis/types';
import type { TitanProfile } from '@/lib/types';
import { TitanPromptBuilderJs } from '@cortex-logic';

const _builder = new TitanPromptBuilderJs();

/**
 * Builds the system prompt for Titan's medical diagnosis mode.
 *
 * Delegates to the KMP TitanPromptBuilder via the JS bridge — the TS session
 * prompt builder is no longer needed.
 */
export function buildTitanDiagnosisPrompt(
  profile: TitanProfile | null,
  contextPolicy: DiagnosisContextPolicy,
  _extractedData?: ExtractedDataBag,
): string {
  const profileJson = profile ? JSON.stringify(profile) : null;
  return _builder.buildDiagnosisPrompt(profileJson, contextPolicy);
}
