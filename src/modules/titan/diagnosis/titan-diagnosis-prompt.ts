import type { DiagnosisContextPolicy, ExtractedDataBag } from '@/core/diagnosis/types';
import type { TitanProfile } from '@/lib/types';
import { TitanPromptBuilderJs } from '@cortex-logic';

// TitanPromptBuilderJs is lazy-guarded in the cortex-logic runtime (null if the
// KMP build omits the class). Construct lazily so a missing export doesn't throw
// "null is not a constructor" at module-load time for the whole Titan module.
let _builder: InstanceType<NonNullable<typeof TitanPromptBuilderJs>> | null = null;
function getBuilder() {
  if (!TitanPromptBuilderJs) throw new Error('[TitanDiagnosis] TitanPromptBuilderJs is not available in the current cortex-logic build.');
  if (!_builder) _builder = new TitanPromptBuilderJs() as InstanceType<NonNullable<typeof TitanPromptBuilderJs>>;
  return _builder;
}

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
  return getBuilder().buildDiagnosisPrompt(profileJson, contextPolicy);
}
