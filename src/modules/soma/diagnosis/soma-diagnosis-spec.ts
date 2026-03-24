import { DiagnosisSpecialization, ExtractedDataBag } from '@/core/diagnosis/types';
import { SomaProfile, SomaDiagnosisSummary } from '@/modules/soma/types';
import { mergeSomaDiagnosisData } from './soma-diagnosis-merge';
import { buildDiagnosisAnalysisPrompt, buildDiagnosisSummaryPrompt, SOMA_MEDICAL_DISCLAIMER } from '../prompts/soma-prompt-builder';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';

// ── Content-Based Deduplication ───────────────────────────────────────────────

/**
 * Generate a stable, content-based ID for an extracted item.
 * This prevents duplicates when rebuildExtractedDataFromMessages replays history.
 */
function generateStableId(type: string, data: Record<string, unknown>): string {
  // Create a deterministic string from the core payload (excluding timestamps)
  const coreData = { ...data };
  delete coreData.extractedAt;
  delete coreData.source;
  
  const keyString = JSON.stringify({ type, ...coreData }, Object.keys({ type, ...coreData }).sort());
  
  // Simple hash function (djb2) - not cryptographic, just for deduplication
  let hash = 5381;
  for (let i = 0; i < keyString.length; i++) {
    hash = ((hash << 5) + hash) + keyString.charCodeAt(i);
    hash |= 0; // Convert to 32-bit integer
  }
  
  // Convert to positive hex string with type prefix
  const hashHex = (hash >>> 0).toString(16);
  return `${type.slice(0, 3)}-${hashHex}`;
}

/**
 * Check if an item with the same stable ID already exists in the bag.
 */
function itemExists(bag: ExtractedDataBag, stableId: string): boolean {
  return bag.items.some(item => item.id === stableId);
}

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

function inferDiagnosisDocType(rawText: string, fileType: string): string {
  const haystack = rawText.toLowerCase();
  if (fileType === 'image') {
    if (/\bx[\s-]?ray\b/.test(haystack)) return 'xray';
    if (/\bmri\b/.test(haystack)) return 'mri';
    if (/\bct\b|\bcat scan\b/.test(haystack)) return 'ct';
    if (/\bultrasound\b|\bsonography\b/.test(haystack)) return 'ultrasound';
  }
  if (/\bprescription\b|\brx\b|\bdosage\b|\btablet\b|\bcapsule\b/.test(haystack)) return 'prescription';
  if (/\blab\b|\bcbc\b|\bhemoglobin\b|\bcholesterol\b|\bglucose\b|\bcreatinine\b|\btsh\b/.test(haystack)) return 'lab_report';
  if (/\bx[\s-]?ray\b/.test(haystack)) return 'xray';
  if (/\bmri\b/.test(haystack)) return 'mri';
  if (/\bct\b|\bcat scan\b/.test(haystack)) return 'ct';
  if (/\bultrasound\b|\bsonography\b/.test(haystack)) return 'ultrasound';
  return 'medical_report';
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

    // Check what has already been extracted to prevent re-extraction loops
    const hasImageAnalysis = extractedData.items.some(i => i.type === 'medical_image_analysis');
    const hasBiomarkers = extractedData.items.some(i => i.type === 'biomarker');
    const hasLabSummary = extractedData.items.some(i => i.type === 'lab_summary');
    const extractionComplete = hasImageAnalysis || hasBiomarkers || hasLabSummary;

    const itemsBlock = extractedData.items.length > 0
      ? `\n[EXTRACTED DATA - ALREADY SAVED]\n${extractedData.items.map(i => `- ${i.label} (${i.type})`).join('\n')}`
      : '';

    // When extraction is complete, switch to conversational mode
    const extractionStatusBlock = extractionComplete
      ? `
[EXTRACTION STATUS: COMPLETE]
Data extraction from the document has been completed. The items listed above are already saved.
DO NOT emit any more action tags for data that has already been extracted.
You are now in CONVERSATIONAL MODE - answer the user's questions about the findings without re-extracting.
If the user uploads a NEW document, you may extract data from that new document only.
`
      : '';

    // Only include extraction instructions if extraction hasn't happened yet
    const extractionInstructions = !extractionComplete
      ? `
[CRITICAL INSTRUCTION FOR IMAGES]
If the input text starts with [VISUAL DESCRIPTION], it means a specialized vision model has already analyzed the image for you. 
- Treat this description as YOUR OWN direct observation.
- Do NOT say "I cannot see the image" or "Based on the description".
- You ARE the radiologist. Interpret the findings provided in the description as authoritative clinical facts.
- Use the 'medical_image_analysis' tool to structure these findings immediately.

[BEHAVIORAL RULES]
- State findings plainly and directly.
- Use "above/below typical range" rather than diagnosing "you have X".
- Stay bounded to the extracted evidence; name uncertainty and missing data explicitly.
- Do not prescribe treatment, recommend dosage changes, or overstate certainty.
- If exercise safety is relevant, use granted / conditional / denied clearance framing and point toward recovery follow-up when appropriate.
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
- diagnosis_summary: Emit ONE structured clinical summary AFTER all other extraction actions.
  <action type="diagnosis_summary">{"reportType":"lab_report|xray|mri|ct|ultrasound|prescription|medical_report|other","summary":"2-4 sentence plain-language clinical summary","comparisons":[{"item":"...","value":"...","referenceRange":"optional","status":"below|within|above|unknown","note":"optional"}],"whatItMeans":["clinical significance point"],"recommendedActions":["actionable follow-up step"],"suggestedMedications":["medication to discuss with provider"],"confidenceLevel":"high|moderate|low","confidenceRationale":"1-2 sentences explaining confidence level"}</action>
  (Emit exactly ONE diagnosis_summary action, as the FINAL action after all data extraction.)
`
      : `
[CONVERSATIONAL MODE]
Extraction is complete. Answer questions about the findings conversationally.
Do NOT emit action tags unless the user explicitly uploads a new document.
`;

    return `
[IDENTITY]
You are Soma's clinical analysis engine. Your role is to interpret medical documents with the directness of a senior clinician while remaining tightly bounded to the available evidence.

[CAPABILITIES]
- Extract structured biomarkers (name, value, unit, reference range)
- Identify medical conditions, medications, and allergies
- Summarize lab panels and imaging reports
- Provide clinical context for findings
- Perform detailed radiological analysis on X-rays and medical images.
${extractionInstructions}
${contextBlock}${itemsBlock}${extractionStatusBlock}
${SOMA_MEDICAL_DISCLAIMER}
`.trim();
  },

  // -- Actions ----------------------------------------------------------------

  allowedActions: [
    'commit_biomarker',
    'parse_lab_report',
    'update_conditions',
    'issue_clearance',
    'medical_image_analysis',
    'diagnosis_summary',
  ],

  /**
   * Called after AI actions to accumulate data for the merge review.
   * Uses content-based stable IDs to prevent duplicates on history replay.
   */
  extractData: (actionType, payload, current) => {
    const next = { ...current, items: [...current.items] };

    switch (actionType) {
      case 'commit_biomarker': {
        const itemData = {
          name: payload.name,
          value: payload.value,
          unit: payload.unit,
          source: 'diagnosis'
        };
        const stableId = generateStableId('biomarker', itemData);
        
        // Skip if already exists (deduplication)
        if (itemExists(current, stableId)) break;
        
        next.items.push({
          id: stableId,
          type: 'biomarker',
          label: `Biomarker: ${payload.name}`,
          data: itemData,
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
        break;
      }
      case 'parse_lab_report': {
        const itemData = {
          panel: payload.panel,
          findings: payload.findings,
          flags: payload.flags
        };
        const stableId = generateStableId('lab_summary', itemData);
        
        if (itemExists(current, stableId)) break;
        
        next.items.push({
          id: stableId,
          type: 'lab_summary',
          label: `Lab Panel: ${payload.panel}`,
          data: itemData,
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
        break;
      }
      case 'update_conditions': {
        if (Array.isArray(payload.knownConditions)) {
          payload.knownConditions.forEach((c: string) => {
            const itemData = { condition: c };
            const stableId = generateStableId('condition', itemData);
            
            if (itemExists(current, stableId) || next.items.some(i => i.id === stableId)) return;
            
            next.items.push({
              id: stableId,
              type: 'condition',
              label: `Condition: ${c}`,
              data: itemData,
              source: 'ai_extraction',
              extractedAt: new Date().toISOString()
            });
          });
        }
        if (Array.isArray(payload.medications)) {
          payload.medications.forEach((m: string) => {
            const itemData = { medication: m };
            const stableId = generateStableId('medication', itemData);
            
            if (itemExists(current, stableId) || next.items.some(i => i.id === stableId)) return;
            
            next.items.push({
              id: stableId,
              type: 'medication',
              label: `Medication: ${m}`,
              data: itemData,
              source: 'ai_extraction',
              extractedAt: new Date().toISOString()
            });
          });
        }
        if (Array.isArray(payload.allergies)) {
          payload.allergies.forEach((a: string) => {
            const itemData = { allergy: a };
            const stableId = generateStableId('allergy', itemData);
            
            if (itemExists(current, stableId) || next.items.some(i => i.id === stableId)) return;
            
            next.items.push({
              id: stableId,
              type: 'allergy',
              label: `Allergy: ${a}`,
              data: itemData,
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

        const itemData = {
          reportType: data.reportType || 'Radiology Report',
          modality: data.modality,
          bodyPart: data.bodyPart,
          findings: findings,
          impression: data.impression,
          clinicalFlags: clinicalFlags,
          biomarkers: [] // Explicitly empty as biomarkers are handled separately
        };
        const stableId = generateStableId('medical_image_analysis', itemData);
        
        // Skip if already exists (deduplication) - critical for preventing loops
        if (itemExists(current, stableId)) {
          console.log('[SomaDiagnosisSpec] Skipping duplicate medical_image_analysis:', stableId);
          break;
        }
        
        next.items.push({
          id: stableId,
          type: 'medical_image_analysis',
          label: `Imaging: ${data.modality || 'X-Ray'} - ${data.bodyPart || 'Unknown'}`,
          data: itemData,
          source: 'ai_extraction',
          extractedAt: new Date().toISOString()
        });
        break;
      }
      case 'diagnosis_summary': {
        // Payload is already parsed JSON — validate and store in metadata.
        const p = payload as Partial<SomaDiagnosisSummary>;
        if (typeof p.summary === 'string' && p.summary.trim() && p.confidenceLevel) {
          const VALID_CONFIDENCE = new Set<string>(['high', 'moderate', 'low']);
          const summary: SomaDiagnosisSummary = {
            reportType: typeof p.reportType === 'string' ? p.reportType : 'other',
            summary: p.summary.trim(),
            comparisons: Array.isArray(p.comparisons) ? p.comparisons : [],
            whatItMeans: Array.isArray(p.whatItMeans) ? p.whatItMeans : [],
            recommendedActions: Array.isArray(p.recommendedActions) ? p.recommendedActions : [],
            suggestedMedications: Array.isArray(p.suggestedMedications) ? p.suggestedMedications : [],
            confidenceLevel: VALID_CONFIDENCE.has(p.confidenceLevel as string)
              ? (p.confidenceLevel as SomaDiagnosisSummary['confidenceLevel'])
              : 'moderate',
            confidenceRationale: typeof p.confidenceRationale === 'string' ? p.confidenceRationale.trim() : '',
          };
          // Store in metadata, not items (summary is not a merge-able item)
          return { ...current, items: next.items, metadata: { ...current.metadata, somaSummary: summary } };
        }
        return current;
      }
    }

    return next;
  },

  // -- Lifecycle --------------------------------------------------------------

  /**
   * Generate a clinical summary after extraction completes.
   * This is called by useDiagnosis after the initial document analysis.
   */
  onAfterExtraction: async ({ sendMessage, extractedData, rawText, documentType }) => {
    // Skip summary generation if no meaningful data was extracted
    if (extractedData.items.length === 0) {
      return extractedData;
    }

    // Build fields for the summary prompt
    const extractedFields = extractedData.items
      .filter((i) => i.type === 'biomarker' || i.type === 'lab_summary')
      .map((i) => ({
        fieldName: typeof i.data.name === 'string' ? i.data.name : i.label,
        value: i.data.value as string | number,
        unit: typeof i.data.unit === 'string' ? i.data.unit : undefined,
        referenceRange: typeof i.data.referenceRange === 'string' ? i.data.referenceRange : undefined,
        category: typeof i.data.category === 'string' ? i.data.category : i.type
      }));

    // Include imaging findings in the summary
    const imagingItems = extractedData.items.filter(i => i.type === 'medical_image_analysis');
    const detectedPanels = imagingItems.length > 0 
      ? imagingItems.map(i => `${i.data.modality || 'Imaging'}: ${i.data.bodyPart || 'Unknown'}`)
      : [];

    const summaryPrompt = buildDiagnosisSummaryPrompt({
      rawText: rawText.slice(0, 20000), // Truncate for prompt limits
      documentType,
      detectedPanels,
      extractedFields
    });

    try {
      const response = await sendMessage(summaryPrompt);
      const summary = parseDiagnosisSummary(response);
      
      if (summary) {
        return {
          ...extractedData,
          metadata: {
            ...extractedData.metadata,
            somaSummary: summary
          }
        };
      }
    } catch (err) {
      console.error('[SomaDiagnosisSpec] Failed to generate summary:', err);
    }

    return extractedData;
  },

  // -- Merge ------------------------------------------------------------------

  mergeToBase: async (userId, items, encryptionKey) => {
    // Note: In the new system, we might need to pass the summary from metadata if available
    await mergeSomaDiagnosisData(userId, items, encryptionKey);
  },

  // -- Optional Overrides -----------------------------------------------------

  buildFileAnalysisPrompt: (result) => {
    const inferredType = inferDiagnosisDocType(result.text, result.metadata.fileType);
    const contextHint = `Detected medical document type: ${inferredType}`;
    const isImagingType = ['xray', 'mri', 'ct', 'ultrasound'].includes(inferredType);
    const hasVisualDescription = result.text.includes('[VISUAL DESCRIPTION]');

    if (isImagingType || hasVisualDescription) {
      return [
        'You are Soma clinical imaging extraction engine.',
        `Detected medical document type: ${inferredType}.`,
        'The input may include a [VISUAL DESCRIPTION] block generated by vision OCR.',
        'Treat that visual description as authoritative imaging evidence.',
        'Emit exactly two action tags and no prose:',
        '1. <action type="medical_image_analysis">{"reportType":"...","modality":"X-Ray|MRI|CT|Ultrasound","bodyPart":"...","findings":["..."],"impression":"...","clinicalFlags":[{"flag":"...","severity":"mild|moderate|severe"}]}</action>',
        '2. <action type="diagnosis_summary">{"reportType":"xray|mri|ct|ultrasound","summary":"2-4 sentence plain-language summary","comparisons":[],"whatItMeans":["..."],"recommendedActions":["..."],"suggestedMedications":[],"confidenceLevel":"high|moderate|low","confidenceRationale":"..."}</action>',
        'If data is uncertain, still emit both action tags and mark uncertain phrases in findings.',
        '',
        '---BEGIN DOCUMENT---',
        result.text,
        '---END DOCUMENT---',
      ].join('\n');
    }

    return buildDiagnosisAnalysisPrompt(result.text, contextHint);
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
