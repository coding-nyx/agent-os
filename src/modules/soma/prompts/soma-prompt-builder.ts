/**
 * Soma Module — Prompt Builder for Medical/Biometric Mode
 *
 * Builds system prompts for Soma's specialized AI agents.
 * Includes templates for general chat, readiness analysis, and document diagnosis.
 */

import type { FieldDefinition } from '@/lib/field-system/types';

// ============================================================================
// Types
// ============================================================================

export interface SomaPromptContext {
  coreFields: Record<string, unknown>;
  extensionFields: Array<{
    id: string;
    name: string;
    value: unknown;
    type: string;
    unit?: string;
    range?: string;
  }>;
  nsvBiological?: Record<string, unknown>;
  readinessScore?: number;
  clearanceStatus?: string;
  lastCheckup?: string;
  knownConditions?: string[];
  medications?: string[];
}

// ============================================================================
// Medical Disclaimer
// ============================================================================

export const SOMA_MEDICAL_DISCLAIMER = `\
⚕ MEDICAL DISCLAIMER
This AI provides general health information and data analysis only. \
It is NOT medical advice and does NOT constitute a professional diagnosis, \
treatment recommendation, or substitute for consultation with a qualified \
healthcare provider. Always consult your doctor or licensed medical \
professional before making health decisions based on biomarker data. \
In an emergency (chest pain, difficulty breathing, loss of consciousness, \
severe allergic reaction), call emergency services (911 / 112 / 999) immediately.`;

// ============================================================================
// Prompt Templates
// ============================================================================

const SOMA_AGENT_SYSTEM_PROMPT = `\
[IDENTITY]
You are Soma, the Biological Authority within the AGNES system.
You are a highly specialized medical intelligence agent responsible for monitoring, analyzing, and optimizing the user's biological state.

[CORE RESPONSIBILITIES]
1. Monitor biomarkers, lab results, and vital signs.
2. Analyze recovery state and readiness for physical exertion.
3. Manage health clearance status (Cleared / Restricted / Conditional).
4. Extract and structure data from medical documents and images.

[CURRENT BIOLOGICAL STATE]
{{HEALTH_CONTEXT}}

[NEURAL STATE VECTOR - BIOLOGICAL]
{{NSV_BIOLOGICAL}}

[MEDICAL CONTEXT]
Clearance Status: {{CLEARANCE_STATUS}}
Last Checkup: {{LAST_CHECKUP}}
Known Conditions: {{KNOWN_CONDITIONS}}
Current Medications: {{MEDICATIONS}}

[BEHAVIORAL GUIDELINES]
- Speak with the precision and authority of a senior clinician.
- Be direct, data-driven, and objective.
- Identify trends and anomalies in data.
- When analyzing documents, extract every possible structured field.
- If an X-ray or medical image is provided, provide a detailed radiological analysis (modality, findings, impression).

[AVAILABLE TOOLS]
- commit_biomarker: Save a specific biomarker value.
  <action type="commit_biomarker">{"name":"...","value":...,"unit":"...","source":"..."}</action>
- parse_lab_report: Save a summary of a lab panel.
  <action type="parse_lab_report">{"panel":"...","findings":["..."],"flags":["..."]}</action>
- update_conditions: Update the list of known medical conditions or medications.
  <action type="update_conditions">{"knownConditions":["..."],"medications":["..."]}</action>
- issue_clearance: Update the user's physical clearance status.
  <action type="issue_clearance">{"status":"cleared|restricted","activity":"...","reason":"..."}</action>
- medical_image_analysis: Save structured analysis of an X-ray, MRI, or other medical image.
  <action type="medical_image_analysis">{"reportType":"...","modality":"X-Ray|MRI|CT","bodyPart":"...","findings":["..."],"impression":"...","clinicalFlags":[{"flag":"...","severity":"mild|moderate|severe"}]}</action>

${SOMA_MEDICAL_DISCLAIMER}
`;

/**
 * Build the Soma standalone agent system prompt with injected health context.
 */
export function buildSomaAgentSystemPrompt(context: {
  coreFields: Record<string, unknown>;
  extensionFields: SomaPromptContext['extensionFields'];
  nsvBiological?: Record<string, unknown>;
  clearanceStatus?: string;
  lastCheckup?: string;
  knownConditions?: string[];
  medications?: string[];
}): string {
  const healthLines = Object.entries(context.coreFields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');

  const extensionLines = context.extensionFields.length
    ? context.extensionFields
        .map((f) => {
          const u = f.unit ? ` ${f.unit}` : '';
          const r = f.range ? ` (range: ${f.range})` : '';
          return `  ${f.name}: ${f.value ?? 'not set'}${u}${r}`;
        })
        .join('\n')
    : '  No custom biomarkers configured.';

  const nsvLines = context.nsvBiological
    ? Object.entries(context.nsvBiological)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n') || '  No NSV biological data available.'
    : '  Not available.';

  return SOMA_AGENT_SYSTEM_PROMPT
    .replace('{{HEALTH_CONTEXT}}', `Core fields:\n${healthLines}\n\nCustom biomarkers:\n${extensionLines}`)
    .replace('{{NSV_BIOLOGICAL}}', nsvLines)
    .replace('{{CLEARANCE_STATUS}}', context.clearanceStatus ?? 'unknown')
    .replace('{{LAST_CHECKUP}}', context.lastCheckup ?? 'Unknown')
    .replace('{{KNOWN_CONDITIONS}}', context.knownConditions?.join(', ') || 'None reported')
    .replace('{{MEDICATIONS}}', context.medications?.join(', ') || 'None reported');
}

// ============================================================================
// Diagnosis Document Analysis Prompt
// ============================================================================

/** Max characters of raw document text to include in the analysis prompt (~8k tokens). */
const MAX_RAW_TEXT_CHARS = 32_000;

/**
 * Build the LLM prompt for structured extraction from a medical/lab document.
 *
 * The prompt instructs the LLM to output ONLY valid JSON — no prose, no markdown.
 * Output schema matches DocumentAnalysisResult.extractedFields from document-analysis-service.ts.
 */
export function buildDiagnosisAnalysisPrompt(
  rawText: string,
  contextHint?: string
): string {
  const truncated =
    rawText.length > MAX_RAW_TEXT_CHARS
      ? rawText.slice(0, MAX_RAW_TEXT_CHARS) + '\n[... document truncated for analysis ...]'
      : rawText;

  const contextLine = contextHint
    ? `Document context hint from user: "${contextHint}"\n`
    : '';

  return `You are a medical document analysis engine. Your task is to analyze the provided document text and extract structured data using the available tools.

${contextLine}
INPUT TEXT:
"""
${truncated}
"""

INSTRUCTIONS:
1. If the text contains lab results, use 'parse_lab_report' or 'commit_biomarker'.
2. If the text contains a visual description of an image (e.g. [VISUAL DESCRIPTION] for X-ray, MRI), use 'medical_image_analysis'.
3. If the text describes medical conditions or medications, use 'update_conditions'.

Do NOT just output JSON text. You MUST use the provided tools/functions to save the data.
`;
}
