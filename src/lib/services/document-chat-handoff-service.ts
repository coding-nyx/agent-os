import {
  runDocumentPipeline,
  type DocumentFileType,
  type DocumentParsed,
  type DocumentPipelinePolicy,
  type DocumentPipelineStage,
} from './document-pipeline';

export type DocumentChatModuleId = 'soma' | 'ledger' | 'scout' | 'nexus';
export type DocumentRouteModuleId = 'soma' | 'ledger' | 'scout' | 'nexus';

export interface DocumentClassificationResult {
  docType: string;
  targetModule: DocumentRouteModuleId;
  confidence: number;
  reasons: string[];
  unresolved: boolean;
}

export interface DocumentChatInsight {
  fileName: string;
  fileType: DocumentFileType;
  detectedTitle: string | null;
  pageCount: number;
  wordCount: number;
  category: string;
  docType: string;
  targetModule?: DocumentRouteModuleId;
  targetConfidence?: number;
  requiresUserTypeSelection?: boolean;
  summary: string;
  keyPoints: string[];
  followUpTopics: string[];
  preview: string;
  warnings: string[];
}

export interface DocumentChatBatchResult {
  insights: DocumentChatInsight[];
  prompt: string;
  warnings: string[];
}

export interface DocumentChatStage extends DocumentPipelineStage {
  fileIndex: number;
  fileCount: number;
  fileName: string;
}

interface DocumentChatAnalysis {
  category: string;
  summary: string;
  keyPoints: string[];
  followUpTopics: string[];
  classification: DocumentClassificationResult;
  requiresUserTypeSelection: boolean;
}

const MAX_PREVIEW_CHARS = 900;
const LOW_CONFIDENCE_THRESHOLD = 0.55;
const OCR_REFUSAL_PATTERNS = [
  "i'm sorry",
  'i cannot extract text',
  "i can't extract text",
  'unable to extract text',
  'cannot extract text from that image',
  'no readable text',
  'image cannot be processed',
];

const MODULE_ANALYST_PROMPTS: Record<DocumentChatModuleId, string> = {
  soma: 'You triage and summarize medical documents for a health-focused assistant. Detect items like x-rays, prescriptions, lab reports, medical reports, discharge notes, and hospital bills.',
  ledger: 'You triage and summarize financial documents for a money-focused assistant. Detect items like receipts, invoices, statements, hospital bills, claims, balances, due dates, and anomalies.',
  scout: 'You triage and summarize research and evidence documents for a research assistant. Detect items like papers, notes, reports, memos, datasets, articles, and evidence bundles.',
  nexus: 'You triage and summarize general documents for an orchestrator assistant. Detect likely topic, likely owning domain, and the most useful discussion path for the user.',
};

const MODULE_CONVERSATION_GUIDANCE: Record<DocumentChatModuleId, string> = {
  soma: 'Discuss the uploaded medical document set in plain language. Identify what each document is, connect related findings across files, call out contradictions or missing context, and explain what matters medically right now. If a billing document appears, mention its administrative relevance separately from clinical meaning. Do not emit action tags.',
  ledger: 'Discuss the uploaded financial document set in plain language. Explain charges, balances, due dates, line items, suspicious patterns, and any next review questions. If multiple files relate to the same event, connect them. Do not emit action tags.',
  scout: 'Discuss the uploaded research or evidence document set in plain language. Summarize what each file contributes, highlight corroboration or disagreement across files, and suggest the most useful follow-up questions. Do not emit action tags.',
  nexus: 'Discuss the uploaded document set in plain language. Explain what the files appear to be about, how they relate, and which module or line of inquiry is most relevant. Do not emit action tags.',
};

const SOMA_TYPE_INSTRUCTIONS: Record<string, string> = {
  lab_report: 'Extract biomarkers, values, units, ranges, and notable out-of-range findings.',
  medical_report: 'Summarize diagnosis context, clinical observations, and next clinical follow-up questions.',
  xray: 'Interpret radiology findings from x-ray context and call out clinically relevant impressions.',
  mri: 'Interpret MRI findings with emphasis on anatomical regions and reported abnormalities.',
  ct: 'Interpret CT findings with key observations and urgent flags if present in the report.',
  ultrasound: 'Interpret ultrasound findings and highlight any measurements or notable abnormalities.',
  prescription: 'Prioritize medication extraction and dosage instructions. If text appears handwritten or noisy, focus on deciphering prescriber handwriting safely and flag uncertain tokens explicitly.',
  other_medical: 'Provide a careful medical-document summary and identify missing context to verify with a clinician.',
};

function stripCodeFences(input: string): string {
  return input
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function inferCategoryFallback(parsed: DocumentParsed): string {
  const haystack = `${parsed.fileName}\n${parsed.detectedTitle ?? ''}\n${parsed.rawText.slice(0, 1200)}`.toLowerCase();

  if (/\bx[\s-]?ray\b|\bmri\b|\bct\b|\bultrasound\b/.test(haystack)) return 'imaging';
  if (/\bprescription\b|\brx\b|\btablet\b|\bcapsule\b|\bdosage\b/.test(haystack)) return 'prescription';
  if (/\blab\b|\bcbc\b|\bhemoglobin\b|\bcholesterol\b|\bglucose\b/.test(haystack)) return 'lab_report';
  if (/\bhospital bill\b|\bmedical bill\b|\binsurance claim\b/.test(haystack)) return 'hospital_bill';
  if (/\breceipt\b/.test(haystack)) return 'receipt';
  if (/\binvoice\b/.test(haystack)) return 'invoice';
  if (/\bstatement\b|\bbalance\b|\bpayment due\b/.test(haystack)) return 'statement';
  if (/\bstudy\b|\babstract\b|\bmethod\b|\breferences\b/.test(haystack)) return 'research_paper';
  if (/\breport\b/.test(haystack)) return 'report';

  return 'other';
}

function inferDocTypeFallback(parsed: DocumentParsed, moduleId: DocumentChatModuleId): string {
  const haystack = `${parsed.fileName}\n${parsed.detectedTitle ?? ''}\n${parsed.rawText.slice(0, 2000)}`.toLowerCase();

  if (moduleId === 'soma') {
    if (/\bx[\s-]?ray\b/.test(haystack)) return 'xray';
    if (/\bmri\b/.test(haystack)) return 'mri';
    if (/\bct\b|\bcat scan\b/.test(haystack)) return 'ct';
    if (/\bultrasound\b|\bsonography\b/.test(haystack)) return 'ultrasound';
    if (/\bprescription\b|\brx\b|\bdosage\b|\btablet\b|\bcapsule\b/.test(haystack)) return 'prescription';
    if (/\blab\b|\bcbc\b|\bhemoglobin\b|\bcholesterol\b|\bglucose\b|\bcreatinine\b|\btsh\b/.test(haystack)) return 'lab_report';
    if (/\bclinical\b|\bdischarge\b|\bimpression\b|\bdiagnosis\b|\bphysician\b/.test(haystack)) return 'medical_report';
    return 'other_medical';
  }

  if (moduleId === 'ledger') {
    if (/\breceipt\b/.test(haystack)) return 'receipt';
    if (/\binvoice\b/.test(haystack)) return 'invoice';
    if (/\bstatement\b|\bbalance\b|\bpayment due\b/.test(haystack)) return 'statement';
    return 'financial_document';
  }

  if (moduleId === 'scout') {
    if (/\bstudy\b|\bpaper\b|\babstract\b|\bmethod\b|\breferences\b/.test(haystack)) return 'research_paper';
    if (/\breport\b|\bmemo\b|\bbrief\b/.test(haystack)) return 'report';
    return 'research_document';
  }

  if (/\breceipt\b|\binvoice\b|\bpayment due\b|\bstatement\b/.test(haystack)) return 'financial_document';
  if (/\blab\b|\bprescription\b|\bx[\s-]?ray\b|\bmri\b|\bmedical\b/.test(haystack)) return 'medical_document';
  if (/\bstudy\b|\bpaper\b|\babstract\b/.test(haystack)) return 'research_document';
  return 'generic_document';
}

function inferTargetModule(docType: string, sourceModuleId: DocumentChatModuleId): DocumentRouteModuleId {
  if (sourceModuleId !== 'nexus') return sourceModuleId;

  if (['xray', 'mri', 'ct', 'ultrasound', 'lab_report', 'medical_report', 'prescription', 'other_medical', 'medical_document'].includes(docType)) {
    return 'soma';
  }
  if (['receipt', 'invoice', 'statement', 'financial_document', 'hospital_bill'].includes(docType)) {
    return 'ledger';
  }
  if (['research_paper', 'research_document', 'report'].includes(docType)) {
    return 'scout';
  }
  return 'nexus';
}

function isLikelyOcrFailureText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  return OCR_REFUSAL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function getParsedTextForDisplay(parsed: DocumentParsed): string {
  if (parsed.fileType === 'image' && isLikelyOcrFailureText(parsed.rawText)) {
    return '';
  }
  return parsed.rawText;
}

function parseAnalysisResponse(response: string, parsed: DocumentParsed): { analysis: Omit<DocumentChatAnalysis, 'classification' | 'requiresUserTypeSelection'>; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned = stripCodeFences(response);

  if (!cleaned) {
    return {
      analysis: {
        category: inferCategoryFallback(parsed),
        summary: `No analysis summary was returned for ${parsed.fileName}.`,
        keyPoints: [],
        followUpTopics: [],
      },
      warnings: ['Analysis returned an empty response.'],
    };
  }

  try {
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    const summary = typeof data.summary === 'string' && data.summary.trim().length > 0
      ? data.summary.trim()
      : cleaned;

    return {
      analysis: {
        category: typeof data.category === 'string' && data.category.trim().length > 0
          ? data.category.trim()
          : inferCategoryFallback(parsed),
        summary,
        keyPoints: normalizeList(data.keyPoints, 6),
        followUpTopics: normalizeList(data.followUpTopics, 5),
      },
      warnings,
    };
  } catch {
    warnings.push('Analysis response was not valid JSON; using the raw response as the summary.');
    return {
      analysis: {
        category: inferCategoryFallback(parsed),
        summary: cleaned,
        keyPoints: [],
        followUpTopics: [],
      },
      warnings,
    };
  }
}

function buildClassificationPrompt(moduleId: DocumentChatModuleId, parsed: DocumentParsed, userContext?: string): string {
  const header = [
    `File: "${parsed.fileName}"`,
    `Type: ${parsed.fileType.toUpperCase()}`,
    parsed.detectedTitle ? `Detected title: "${parsed.detectedTitle}"` : null,
    `Words: ${parsed.wordCount.toLocaleString()}`,
    parsed.pageCount > 0 ? `Pages: ${parsed.pageCount}` : null,
    userContext ? `User requested focus: ${userContext}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    MODULE_ANALYST_PROMPTS[moduleId],
    'Pass 1 (classification): classify this document first.',
    'Return ONLY valid JSON with this exact shape:',
    '{',
    '  "docType": "snake_case type",',
    '  "targetModule": "soma|ledger|scout|nexus",',
    '  "confidence": 0.0,',
    '  "reasons": ["short reason", "short reason"]',
    '}',
    'Use confidence 0.0 to 1.0. Keep reasons concise. Do not include markdown fences.',
    '',
    header,
    '---BEGIN DOCUMENT---',
    parsed.rawText,
    '---END DOCUMENT---',
  ].join('\n');
}

function parseClassificationResponse(response: string, parsed: DocumentParsed, moduleId: DocumentChatModuleId): { classification: DocumentClassificationResult; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned = stripCodeFences(response);

  if (!cleaned) {
    warnings.push('Classifier returned empty response; using heuristic classification.');
    const docType = inferDocTypeFallback(parsed, moduleId);
    const targetModule = inferTargetModule(docType, moduleId);
    return {
      classification: {
        docType,
        targetModule,
        confidence: 0.45,
        reasons: ['Empty classifier response'],
        unresolved: true,
      },
      warnings,
    };
  }

  try {
    const data = JSON.parse(cleaned) as Record<string, unknown>;
    const docTypeRaw = typeof data.docType === 'string' ? data.docType.trim() : '';
    const fallbackDocType = inferDocTypeFallback(parsed, moduleId);
    const docType = docTypeRaw.length > 0 ? docTypeRaw : fallbackDocType;

    const targetRaw = typeof data.targetModule === 'string' ? data.targetModule.trim() : '';
    const targetModule: DocumentRouteModuleId =
      targetRaw === 'soma' || targetRaw === 'ledger' || targetRaw === 'scout' || targetRaw === 'nexus'
        ? targetRaw
        : inferTargetModule(docType, moduleId);

    const confidence = clampConfidence(data.confidence, docTypeRaw.length > 0 ? 0.7 : 0.55);
    const reasons = normalizeList(data.reasons, 4);

    return {
      classification: {
        docType,
        targetModule,
        confidence,
        reasons,
        unresolved: docType === 'unknown' || confidence < LOW_CONFIDENCE_THRESHOLD,
      },
      warnings,
    };
  } catch {
    warnings.push('Classifier response was not valid JSON; using heuristic classification.');
    const docType = inferDocTypeFallback(parsed, moduleId);
    const targetModule = inferTargetModule(docType, moduleId);
    return {
      classification: {
        docType,
        targetModule,
        confidence: 0.5,
        reasons: ['Classifier parse failed'],
        unresolved: true,
      },
      warnings,
    };
  }
}

function buildSpecializedAnalysisPrompt(moduleId: DocumentChatModuleId, classification: DocumentClassificationResult, parsed: DocumentParsed): string {
  const base = MODULE_ANALYST_PROMPTS[moduleId];

  const strategyLine = (() => {
    if (moduleId === 'soma') {
      return SOMA_TYPE_INSTRUCTIONS[classification.docType] ?? SOMA_TYPE_INSTRUCTIONS.other_medical;
    }
    if (moduleId === 'ledger') {
      return 'Extract financially actionable insights, totals, dates, counterparties, anomalies, and risk flags.';
    }
    if (moduleId === 'scout') {
      return 'Extract research claims, evidence quality notes, citations or source anchors, and open questions.';
    }
    return 'Keep this generic, but identify probable module ownership and useful tags for downstream delegation.';
  })();

  const header = [
    `File: "${parsed.fileName}"`,
    `Type: ${parsed.fileType.toUpperCase()}`,
    parsed.detectedTitle ? `Detected title: "${parsed.detectedTitle}"` : null,
    `Classified docType: ${classification.docType}`,
    `Classified targetModule: ${classification.targetModule}`,
    `Classifier confidence: ${classification.confidence.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    base,
    'Pass 2 (specialized analysis): follow the strategy for the classified type.',
    `Strategy: ${strategyLine}`,
    'Return ONLY valid JSON with this shape:',
    '{',
    '  "category": "short snake_case category",',
    '  "summary": "2-5 sentence plain-language summary",',
    '  "keyPoints": ["3 to 6 concise bullet-style findings"],',
    '  "followUpTopics": ["up to 5 useful follow-up questions or angles for discussion"]',
    '}',
    'Do not include markdown fences. Do not emit action tags.',
    '',
    header,
    '---BEGIN DOCUMENT---',
    parsed.rawText,
    '---END DOCUMENT---',
  ].join('\n');
}

function buildVisualAnalysisPrompt(moduleId: DocumentChatModuleId, fileName: string, docType: string, userContext?: string): string {
  return [
    MODULE_ANALYST_PROMPTS[moduleId],
    'This upload is an image with little or no reliable OCR text.',
    'Perform specialized visual analysis based on the classified document type.',
    `Classified docType: ${docType}`,
    moduleId === 'soma' && docType === 'prescription'
      ? 'If this is a handwritten prescription, prioritize best-effort deciphering of medicine names and dosage, and mark uncertainty in key points.'
      : null,
    'Return ONLY valid JSON with this shape:',
    '{',
    '  "category": "short snake_case category",',
    '  "summary": "2-5 sentence plain-language description and why it matters",',
    '  "keyPoints": ["3 to 6 concise visible findings"],',
    '  "followUpTopics": ["up to 5 useful follow-up questions or angles for discussion"]',
    '}',
    'Do not include markdown fences. Do not emit action tags.',
    `File: "${fileName}"`,
    userContext ? `User requested focus: ${userContext}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildBatchPrompt(moduleId: DocumentChatModuleId, insights: DocumentChatInsight[], userContext?: string): string {
  const intro = insights.length === 1
    ? `I uploaded 1 document for analysis in ${moduleId}.`
    : `I uploaded ${insights.length} related documents for one combined analysis in ${moduleId}.`;

  const documentBlocks = insights.map((insight, index) => {
    const keyPoints = insight.keyPoints.length > 0
      ? insight.keyPoints.map((point) => `- ${point}`).join('\n')
      : '- No key points extracted.';
    const followUpTopics = insight.followUpTopics.length > 0
      ? insight.followUpTopics.map((topic) => `- ${topic}`).join('\n')
      : '- No follow-up topics extracted.';

    const routingLine = insight.targetModule && insight.targetModule !== moduleId
      ? `Routing hint: Best owner appears to be ${insight.targetModule} (confidence ${((insight.targetConfidence ?? 0) * 100).toFixed(0)}%).`
      : null;

    const unresolvedLine = insight.requiresUserTypeSelection
      ? 'Type confirmation needed: Ask the user to confirm the document type before final recommendations.'
      : null;

    return [
      `Document ${index + 1}: ${insight.fileName}`,
      `Category: ${insight.category}`,
      `Classified type: ${insight.docType}`,
      `Type: ${insight.fileType.toUpperCase()} | Words: ${insight.wordCount.toLocaleString()} | Pages: ${insight.pageCount}`,
      insight.detectedTitle ? `Detected title: ${insight.detectedTitle}` : null,
      routingLine,
      unresolvedLine,
      `Summary: ${insight.summary}`,
      'Key points:',
      keyPoints,
      'Follow-up topics:',
      followUpTopics,
      insight.preview.length > 0 ? `Preview:\n${insight.preview}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });

  const synthesisInstruction = insights.length > 1
    ? 'Synthesize across the full set. Preserve per-document provenance, connect related details, and explicitly mention corroboration, contradictions, timeline gaps, or missing context.'
    : 'Focus on this single document, but still identify missing context or important follow-up questions.';

  return [
    intro,
    userContext ? `User requested focus: ${userContext}` : null,
    MODULE_CONVERSATION_GUIDANCE[moduleId],
    synthesisInstruction,
    'If a document is uncertain, ask the user to confirm type before giving final guidance.',
    'Continue as a normal assistant response to the user. Do not emit action tags.',
    '',
    ...documentBlocks,
  ].join('\n\n');
}

export async function prepareDocumentChatPrompt(params: {
  moduleId: DocumentChatModuleId;
  files: File[];
  sendMessage: (prompt: string) => Promise<string>;
  sendMessageFallback?: (prompt: string) => Promise<string>;
  analyzeImage?: (imageDataUrl: string, prompt: string) => Promise<string>;
  userContext?: string;
  onStageChange?: (stage: DocumentChatStage) => void;
}): Promise<DocumentChatBatchResult> {
  const { moduleId, files, sendMessage, sendMessageFallback, analyzeImage, userContext, onStageChange } = params;

  if (files.length === 0) {
    throw new Error('At least one document is required.');
  }

  const insights: DocumentChatInsight[] = [];
  const warnings: string[] = [];

  const policy: DocumentPipelinePolicy<DocumentChatAnalysis, DocumentChatInsight> = {
    id: `${moduleId}-document-chat`,
    context: {
      moduleId,
      domain: moduleId === 'soma' ? 'lab_report' : moduleId === 'ledger' ? 'invoice' : 'general',
    },
    useOCRForImages: true,
    ocrFailureMode: 'warn',
    analyze: async ({ parsed, file }, llmSend) => {
      const usableParsedText = getParsedTextForDisplay(parsed);
      const classifierResponse = await llmSend(buildClassificationPrompt(moduleId, {
        ...parsed,
        rawText: usableParsedText,
      }, userContext));

      const { classification, warnings: classificationWarnings } = parseClassificationResponse(classifierResponse, {
        ...parsed,
        rawText: usableParsedText,
      }, moduleId);
      warnings.push(...classificationWarnings.map((warning) => `${parsed.fileName}: ${warning}`));

      const canProceedWithVisualPass = parsed.fileType === 'image' && Boolean(analyzeImage);
      const requiresUserTypeSelection = classification.unresolved && !canProceedWithVisualPass;
      if (requiresUserTypeSelection) {
        const unresolvedSummary = [
          `I could not confidently classify ${parsed.fileName}.`,
          'Please confirm the document type (for example: lab report, X-ray, MRI, prescription, invoice, statement, research paper, or general report).',
          'Once confirmed, I will run a specialized analysis.',
        ].join(' ');

        return {
          category: inferCategoryFallback(parsed),
          summary: unresolvedSummary,
          keyPoints: [],
          followUpTopics: ['Confirm document type for specialized analysis'],
          classification,
          requiresUserTypeSelection,
        };
      }

      const requiresVisualAnalysis = parsed.fileType === 'image' && usableParsedText.length < 24;
      if (requiresVisualAnalysis && analyzeImage) {
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read ${file.name} for visual analysis.`));
          reader.readAsDataURL(file);
        });

        const visualResponse = await analyzeImage(imageDataUrl, buildVisualAnalysisPrompt(moduleId, parsed.fileName, classification.docType, userContext));
        const { analysis, warnings: analysisWarnings } = parseAnalysisResponse(visualResponse, {
          ...parsed,
          rawText: '',
          detectedTitle: null,
        });
        warnings.push(...analysisWarnings.map((warning) => `${parsed.fileName}: ${warning}`));

        return {
          ...analysis,
          classification,
          requiresUserTypeSelection,
        };
      }

      const response = await llmSend(buildSpecializedAnalysisPrompt(moduleId, classification, {
        ...parsed,
        rawText: usableParsedText,
        detectedTitle: usableParsedText.length > 0 ? parsed.detectedTitle : null,
      }));
      const { analysis, warnings: analysisWarnings } = parseAnalysisResponse(response, parsed);
      warnings.push(...analysisWarnings.map((warning) => `${parsed.fileName}: ${warning}`));

      return {
        ...analysis,
        classification,
        requiresUserTypeSelection,
      };
    },
    buildProposal: (analysis, parsed) => ({
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      detectedTitle: parsed.fileType === 'image' && isLikelyOcrFailureText(parsed.rawText) ? null : parsed.detectedTitle,
      pageCount: parsed.pageCount,
      wordCount: parsed.wordCount,
      category: analysis.category,
      docType: analysis.classification.docType,
      targetModule: analysis.classification.targetModule,
      targetConfidence: analysis.classification.confidence,
      requiresUserTypeSelection: analysis.requiresUserTypeSelection,
      summary: analysis.summary,
      keyPoints: analysis.keyPoints,
      followUpTopics: analysis.followUpTopics,
      preview: getParsedTextForDisplay(parsed).slice(0, MAX_PREVIEW_CHARS),
      warnings: [],
    }),
    summarizeProposal: (proposal) => proposal.summary,
  };

  for (const [index, file] of files.entries()) {
    const result = await runDocumentPipeline({
      file,
      policy,
      sendMessage,
      sendMessageFallback,
      onStageChange: (stage) => {
        onStageChange?.({
          ...stage,
          fileIndex: index,
          fileCount: files.length,
          fileName: file.name,
          label: files.length > 1
            ? `${stage.label} (${index + 1}/${files.length}: ${file.name})`
            : stage.label,
        });
      },
    });

    insights.push({
      ...result.proposal,
      warnings: [...result.warnings],
    });
    warnings.push(...result.warnings.map((warning) => `${file.name}: ${warning}`));
  }

  return {
    insights,
    prompt: buildBatchPrompt(moduleId, insights, userContext),
    warnings,
  };
}
