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
- Perform detailed radiological analysis on X-rays and medical images.

[CRITICAL INSTRUCTION FOR IMAGES]
If the input text starts with [VISUAL DESCRIPTION], it means a specialized vision model has already analyzed the image for you. 
- Treat this description as YOUR OWN direct observation.
- Do NOT say "I cannot see the image" or "Based on the description".
- You ARE the radiologist. Interpret the findings provided in the description as authoritative clinical facts.
- Use the 'medical_image_analysis' tool to structure these findings immediately.

[BEHAVIORAL RULES]
- State findings plainly and directly.
- Use "above/below typical range" rather than diagnosing "you have X".
- When an item is extracted, use the relevant action to store it.
- For X-rays/Imaging (when seeing [VISUAL DESCRIPTION]):
  - Identify Modality (X-Ray, MRI, CT) and Body Part.
  - List detailed Findings (observations about bone density, fractures, soft tissue, etc.).
  - Provide a clinical Impression (summary of key pathological findings).
  - Flag any abnormalities with severity (mild/moderate/severe).

[AVAILABLE TOOLS]
- commit_biomarker: Save a specific biomarker value.
  <action type="commit_biomarker">{"name":"...","value":...,"unit":"...","source":"..."}</action>
- parse_lab_report: Save a summary of a lab panel.
  <action type="parse_lab_report">{"panel":"...","findings":["..."],"flags":["..."]}</action>
- update_conditions: Update known medical conditions or medications.
  <action type="update_conditions">{"knownConditions":["..."],"medications":["..."],"allergies":["..."]}</action>
- medical_image_analysis: Save structured analysis of an X-ray, MRI, or other medical image.
  <action type="medical_image_analysis">{"reportType":"...","modality":"X-Ray|MRI|CT|Ultrasound","bodyPart":"...","findings":["..."],"impression":"...","clinicalFlags":[{"flag":"...","severity":"mild|moderate|severe"}]}</action>
  (Note: Provide the payload as valid JSON inside the action tag).

${contextBlock}${itemsBlock}

${SOMA_MEDICAL_DISCLAIMER}
`.trim();
  },

  // -- Actions ----------------------------------------------------------------

  allowedActions: [
    'commit_biomarker',
    'parse_lab_report',
    'update_conditions',
    'issue_clearance',
    'medical_image_analysis'
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
      case 'medical_image_analysis': {
        // Safe access for nested payloads (some models wrap in <result> or <root>)
        const data = (payload.result || payload.root || payload) as any;

        // Handle nested XML list structures (e.g. <findings><finding>...</finding></findings> becomes {findings: {finding: [...]}})
        const normalizeList = (obj: any, key: string, singularKey: string) => {
            if (Array.isArray(obj[key])) return obj[key];
            if (obj[key] && obj[key][singularKey]) {
                const inner = obj[key][singularKey];
                return Array.isArray(inner) ? inner : [inner];
            }
            return [];
        };

        const findings = normalizeList(data, 'findings', 'finding');
        const clinicalFlags = normalizeList(data, 'clinicalFlags', 'clinicalFlag');

        next.items.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'medical_image_analysis',
          label: `Imaging: ${data.modality || 'X-Ray'} - ${data.bodyPart || 'Unknown'}`,
          data: {
            reportType: data.reportType || 'Radiology Report',
            modality: data.modality,
            bodyPart: data.bodyPart,
            findings: findings,
            impression: data.impression,
            clinicalFlags: clinicalFlags,
            biomarkers: [] // Explicitly empty as biomarkers are handled separately
          },
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
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
