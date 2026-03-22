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

export interface DiagnosisSummaryPromptInput {
  rawText: string;
  documentType: string;
  detectedPanels: string[];
  extractedFields: Array<{
    fieldName: string;
    value: string | number;
    unit?: string;
    referenceRange?: string;
    category?: string;
  }>;
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

/**
 * Serialize Soma extension fields into a compact human-readable block.
 * Shared by Soma/Titan prompt builders.
 */
export function serializeSomaExtensionFields(
  fields: SomaPromptContext['extensionFields']
): string {
  if (!Array.isArray(fields) || fields.length === 0) {
    return 'No custom biomarker fields configured.';
  }

  return fields
    .map((f) => {
      const value =
        f.value === null || f.value === undefined || f.value === ''
          ? 'not set'
          : typeof f.value === 'string'
            ? `"${f.value}"`
            : String(f.value);
      const unit = f.unit ? ` ${f.unit}` : '';
      const range = f.range ? ` (range: ${f.range})` : '';
      return `${f.name}: ${value}${unit}${range}`;
    })
    .join('\n');
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

/**
 * Build the second-pass diagnosis summary prompt.
 * Expects strict JSON output matching SomaDiagnosisSummary-like structure.
 */
export function buildDiagnosisSummaryPrompt(input: DiagnosisSummaryPromptInput): string {
  const panelLines = input.detectedPanels.length > 0
    ? input.detectedPanels.map((p) => `- ${p}`).join('\n')
    : '- none';

  const extractedLines = input.extractedFields.length > 0
    ? input.extractedFields
        .slice(0, 120)
        .map((f) => {
          const unit = f.unit ? ` ${f.unit}` : '';
          const range = f.referenceRange ? ` (ref: ${f.referenceRange})` : '';
          const category = f.category ? ` [${f.category}]` : '';
          return `- ${f.fieldName}: ${f.value}${unit}${range}${category}`;
        })
        .join('\n')
    : '- none';

  const rawPreview = input.rawText.length > 20000
    ? `${input.rawText.slice(0, 20000)}\n[...TRUNCATED...]`
    : input.rawText;

  return `You are Soma's clinical summarizer.

Generate a concise medical summary from extracted findings.
Return ONLY valid JSON with this shape:
{
  "reportType": "lab_report|medical_report|xray|mri|ct|ultrasound|prescription|other",
  "summary": "2-6 sentence plain-language clinical summary",
  "comparisons": [
    { "item": "field name", "value": "value", "referenceRange": "optional", "status": "high|low|normal|unknown", "note": "optional" }
  ],
  "whatItMeans": ["clinical interpretation point"],
  "recommendedActions": ["actionable non-diagnostic follow-up"],
  "suggestedMedications": ["optional medication discussion item"],
  "confidenceLevel": "high|moderate|low",
  "confidenceRationale": "one short rationale"
}

Rules:
- Do not diagnose diseases.
- Be explicit about uncertainty.
- Keep medication mentions as "discuss with prescriber".
- Do not include markdown fences.

Document type: ${input.documentType}

Detected panels:
${panelLines}

Extracted fields:
${extractedLines}

Raw text preview:
---BEGIN DOCUMENT---
${rawPreview}
---END DOCUMENT---`;
}
