import { DiagnosisSpecialization } from '@/core/diagnosis/types';
import { SomaProfile, SomaDiagnosisSummary } from '@/modules/soma/types';
import { mergeSomaDiagnosisData } from './soma-diagnosis-merge';
import { buildDiagnosisAnalysisPrompt, buildDiagnosisSummaryPrompt, SOMA_MEDICAL_DISCLAIMER } from '../prompts/soma-prompt-builder';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';

function parseDiagnosisSummary(raw: string): SomaDiagnosisSummary | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const cleaned = sanitizeJsonPayload(raw);
    const parsed = JSON.parse(cleaned) as Partial<SomaDiagnosisSummary>;
    if (!parsed || typeof parsed !== 'object') return null;
    const summaryText = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summaryText) return null;
    const VALID_CONFIDENCE = new Set(['high', 'moderate', 'low']);
    const confidenceLevel = VALID_CONFIDENCE.has(parsed.confidenceLevel as string)
      ? (parsed.confidenceLevel as SomaDiagnosisSummary['confidenceLevel'])
      : 'moderate';
    return {
      reportType: typeof parsed.reportType === 'string' ? parsed.reportType : 'other',
      summary: summaryText,
      comparisons: Array.isArray(parsed.comparisons) ? parsed.comparisons as SomaDiagnosisSummary['comparisons'] : [],
      whatItMeans: Array.isArray(parsed.whatItMeans) ? parsed.whatItMeans as string[] : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions as string[] : [],
      suggestedMedications: Array.isArray(parsed.suggestedMedications) ? parsed.suggestedMedications as string[] : [],
      confidenceLevel,
      confidenceRationale: typeof parsed.confidenceRationale === 'string' ? parsed.confidenceRationale.trim() : '',
    };
  } catch {
    return null;
  }
}

/**
 * Soma Diagnosis Specialization
 * 
 * Configures the shared diagnosis engine to handle medical reports, 
 * lab results, and biometric data.
 */
export const somaDiagnosisSpec: DiagnosisSpecialization = {
  moduleId: 'soma',
  label: 'Medical Analysis',
  description: 'Extract and analyze biomarkers, conditions, and lab results from medical documents.',
  
  supportedFileTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain'
  ],

  // -- Prompt -----------------------------------------------------------------

  buildSystemPrompt: ({ contextPolicy, profile, extractedData }) => {
    const sProfile = profile as SomaProfile | null;
    
    let contextBlock = '';
    if (contextPolicy === 'with-context' && sProfile) {
      contextBlock = `
[CURRENT MEDICAL CONTEXT]
Known Conditions: ${sProfile.knownConditions.join(', ') || 'None reported'}
Medications: ${sProfile.medications.join(', ') || 'None reported'}
Allergies: ${sProfile.allergies.join(', ') || 'None reported'}
Recent Biomarkers: ${sProfile.biomarkers.slice(0, 10).map(b => `${b.name}: ${b.value}${b.unit ? ` ${b.unit}` : ''}`).join('; ') || 'None recorded'}
`;
    }

    const itemsBlock = extractedData.items.length > 0
      ? `\n[EXTRACTED DATA SO FAR]\n${extractedData.items.map(i => `- ${i.label} (${i.type})`).join('\n')}`
      : '';

    return `
[IDENTITY]
You are Soma's clinical analysis engine. Your role is to interpret medical documents with the directness and confidence of a senior clinician.

[CAPABILITIES]
- Extract structured biomarkers (name, value, unit, reference range)
- Identify medical conditions, medications, and allergies
- Summarize lab panels and imaging reports
- Provide clinical context for findings

[BEHAVIORAL RULES]
- State findings plainly and directly.
- Use "above/below typical range" rather than diagnosing "you have X".
- When an item is extracted, use the relevant action to store it.

${contextBlock}${itemsBlock}

${SOMA_MEDICAL_DISCLAIMER}
`.trim();
  },

  // -- Actions ----------------------------------------------------------------

  allowedActions: [
    'commit_biomarker',
    'parse_lab_report',
    'update_conditions',
    'issue_clearance'
  ],

  /**
   * Called after AI actions to accumulate data for the merge review.
   */
  extractData: (actionType, payload, current) => {
    const next = { ...current, items: [...current.items] };

    switch (actionType) {
      case 'commit_biomarker': {
        next.items.push({
          id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'biomarker',
          label: `Biomarker: ${payload.name}`,
          data: {
            name: payload.name,
            value: payload.value,
            unit: payload.unit,
            source: 'diagnosis'
          },
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
        break;
      }
      case 'parse_lab_report': {
        next.items.push({
          id: `lab-${Date.now()}`,
          type: 'lab_summary',
          label: `Lab Panel: ${payload.panel}`,
          data: {
            panel: payload.panel,
            findings: payload.findings,
            flags: payload.flags
          },
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
        break;
      }
      case 'update_conditions': {
        if (Array.isArray(payload.knownConditions)) {
          payload.knownConditions.forEach((c: string) => {
            next.items.push({
              id: `cond-${Date.now()}-${Math.random()}`,
              type: 'condition',
              label: `Condition: ${c}`,
              data: { condition: c },
              source: 'ai_extraction',
              extractedAt: new Date().toISOString()
            });
          });
        }
        if (Array.isArray(payload.medications)) {
          payload.medications.forEach((m: string) => {
            next.items.push({
              id: `med-${Date.now()}-${Math.random()}`,
              type: 'medication',
              label: `Medication: ${m}`,
              data: { medication: m },
              source: 'ai_extraction',
              extractedAt: new Date().toISOString()
            });
          });
        }
        if (Array.isArray(payload.allergies)) {
          payload.allergies.forEach((a: string) => {
            next.items.push({
              id: `allergy-${Date.now()}-${Math.random()}`,
              type: 'allergy',
              label: `Allergy: ${a}`,
              data: { allergy: a },
              source: 'ai_extraction',
              extractedAt: new Date().toISOString()
            });
          });
        }
        break;
      }
    }

    return next;
  },

  // -- Lifecycle --------------------------------------------------------------

  /* 
  // TODO: DiagnosisSpecialization does not support onAfterExtraction. 
  // This logic needs to be moved or the interface updated.
  onAfterExtraction: async ({ sendMessage, extractedData, result }) => {
    const summaryPrompt = buildDiagnosisSummaryPrompt({
      rawText: result.text,
      documentType: result.metadata.fileType === 'application/pdf' ? 'pdf' : 'text',
      detectedPanels: [], 
      extractedFields: extractedData.items
        .filter((i: any) => i.type === 'biomarker')
        .map((i: any) => ({
          fieldName: i.data.name,
          value: i.data.value,
          unit: i.data.unit,
          category: i.data.category
        }))
    });

    const response = await sendMessage(summaryPrompt);
    const summary = parseDiagnosisSummary(response);
    
    return {
      ...extractedData,
      metadata: {
        ...extractedData.metadata,
        somaSummary: summary
      }
    };
  },
  */

  // -- Merge ------------------------------------------------------------------

  mergeToBase: async (userId, items, encryptionKey) => {
    // Note: In the new system, we might need to pass the summary from metadata if available
    await mergeSomaDiagnosisData(userId, items, encryptionKey);
  },

  // -- Optional Overrides -----------------------------------------------------

  buildFileAnalysisPrompt: (result) => {
    return buildDiagnosisAnalysisPrompt(result.text);
  },

  themeColor: 'emerald',
  
  emptyState: {
    title: 'Biological Analysis',
    subtitle: 'Upload lab reports, imaging, or medical notes for clinical extraction.',
    examples: [
      'Analyze my blood work results',
      'What does this MRI report say?',
      'Extract my new medications'
    ],
    supportedTypes: [
      { label: 'Blood Work', desc: 'Metabolic, lipid, CBC panels' },
      { label: 'Imaging', desc: 'MRI, CT, X-Ray reports' },
      { label: 'Clinical Notes', desc: 'GP summaries, prescriptions' }
    ]
  }
};
