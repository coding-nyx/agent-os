import { useEffect, useRef, useState } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { FieldType, type FieldDefinition } from '@/lib/field-system/types';
import type { ModuleOnboardingSpec } from './onboarding-types';

interface OnboardingSchemaResult {
  fields: FieldDefinition[];
  sections: string[];
  isLoading: boolean;
  error: string | null;
}

/** Builds a minimal FieldDefinition[] from spec dataPoints without LLM */
function buildFallbackFields(spec: ModuleOnboardingSpec): FieldDefinition[] {
  return spec.dataPoints.map((dp) => ({
    id: dp.id,
    name: dp.label,
    type: dp.type,
    required: dp.required,
    options: dp.options,
    metadata: {
      section: 'General',
      placeholder: dp.hint ?? dp.label,
      helpText: dp.hint,
      ...(dp.autocomplete?.length ? { autocomplete: dp.autocomplete } : {}),
    },
  }));
}

/**
 * Re-applies spec constraints (type, options, autocomplete) to each field
 * that matches a canonical dataPoint. LLM/cache may drop or alter these.
 */
function applySpecConstraints(fields: FieldDefinition[], spec: ModuleOnboardingSpec): FieldDefinition[] {
  return fields.map((f) => {
    const dp = spec.dataPoints.find((d) => d.id === f.id);
    if (!dp) return f;
    return {
      ...f,
      type: dp.type, // enforce canonical type — LLM must not change it
      options: dp.options ?? f.options,
      metadata: {
        ...f.metadata,
        ...(dp.autocomplete?.length ? { autocomplete: dp.autocomplete } : {}),
      },
    };
  });
}

function extractSections(fields: FieldDefinition[]): string[] {
  const seen = new Set<string>();
  for (const f of fields) {
    const s = (f.metadata?.section as string) || 'General';
    seen.add(s);
  }
  return [...seen];
}

const SCHEMA_PROMPT = (spec: ModuleOnboardingSpec) => `
You are generating an intake form for ${spec.displayName} onboarding.
Goal: ${spec.goal}
Context: ${spec.context}

Required canonical field IDs (use these EXACT IDs — do not rename them):
${spec.dataPoints.map((d) => `- ${d.id} (${d.type}): ${d.label}${d.hint ? `. Hint: ${d.hint}` : ''}`).join('\n')}

You may add 0–2 supplementary fields ONLY if they would meaningfully improve the intake. Do not duplicate canonical fields.

For each field produce a JSON object with these keys:
  id (string), name (string), type (one of: text|number|select|multiSelect|date|textarea|boolean|range),
  description (string, optional), required (boolean), defaultValue (any, optional),
  validation (object, optional), options (array of {value, label}, required for select/multiSelect),
  metadata: { section (string, group name for multi-section layout), placeholder (string), helpText (string, optional) }

Group related fields under 2–4 section names. Keep section names short (1–2 words, Title Case).

Return ONLY a valid JSON array of FieldDefinition objects. No markdown, no explanation.
`.trim();

/**
 * Generates onboarding field definitions via LLM with sessionStorage caching.
 * Falls back to bare FieldDefinitions from spec.dataPoints if LLM is unavailable.
 */
export function useOnboardingSchema(spec: ModuleOnboardingSpec): OnboardingSchemaResult {
  const { generateJSON, isInitialized } = useAI();
  const [fields, setFields] = useState<FieldDefinition[]>(() => buildFallbackFields(spec));
  const [sections, setSections] = useState<string[]>(['General']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef(false);
  // Bump version when spec dataPoints structure changes to invalidate stale caches
  const cacheKey = `onboarding_schema_${spec.moduleId}_v2`;

  useEffect(() => {
    if (requestedRef.current || !isInitialized) return;
    requestedRef.current = true;

    // Check sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed: FieldDefinition[] = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const constrained = applySpecConstraints(parsed, spec);
          setFields(constrained);
          setSections(extractSections(constrained));
          return;
        }
      }
    } catch {
      // cache miss or parse error — fall through to LLM
    }

    setIsLoading(true);
    setError(null);

    generateJSON<FieldDefinition[]>(SCHEMA_PROMPT(spec), {
      temperature: 0.3,
      maxTokens: 2048,
    })
      .then((result) => {
        if (!Array.isArray(result) || result.length === 0) throw new Error('Empty schema from LLM');

        // Ensure canonical IDs are present (LLM must not drop them)
        const resultIds = new Set(result.map((f) => f.id));
        const missing = spec.dataPoints.filter((dp) => !resultIds.has(dp.id));
        const merged: FieldDefinition[] = [
          ...result,
          ...missing.map((dp) => ({
            id: dp.id,
            name: dp.label,
            type: dp.type,
            required: dp.required,
            metadata: { section: result[0]?.metadata?.section ?? 'General', placeholder: dp.label },
          })),
        ];

        const constrained = applySpecConstraints(merged, spec);
        setFields(constrained);
        setSections(extractSections(constrained));

        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(constrained));
        } catch {
          // sessionStorage write failure is non-fatal
        }
      })
      .catch((err) => {
        console.warn('[useOnboardingSchema] LLM schema generation failed, using fallback:', err);
        const fallback = buildFallbackFields(spec);
        setFields(fallback);
        setSections(extractSections(fallback));
        setError('Using default fields (AI offline)');
      })
      .finally(() => setIsLoading(false));
  }, [isInitialized, spec, generateJSON, cacheKey]);

  return { fields, sections, isLoading, error };
}
