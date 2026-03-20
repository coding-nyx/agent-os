import {
  runDocumentPipeline,
  type DocumentFileType,
  type DocumentParsed,
  type DocumentPipelinePolicy,
  type DocumentPipelineStage,
} from './document-pipeline';

export type DocumentChatModuleId = 'soma' | 'ledger' | 'scout' | 'nexus';

export interface DocumentChatInsight {
  fileName: string;
  fileType: DocumentFileType;
  detectedTitle: string | null;
  pageCount: number;
  wordCount: number;
  category: string;
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
}

const MAX_PREVIEW_CHARS = 900;
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

function parseAnalysisResponse(response: string, parsed: DocumentParsed): { analysis: DocumentChatAnalysis; warnings: string[] } {
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

function buildAnalysisPrompt(moduleId: DocumentChatModuleId, parsed: DocumentParsed): string {
  const header = [
    `File: "${parsed.fileName}"`,
    `Type: ${parsed.fileType.toUpperCase()}`,
    parsed.detectedTitle ? `Detected title: "${parsed.detectedTitle}"` : null,
    `Words: ${parsed.wordCount.toLocaleString()}`,
    parsed.pageCount > 0 ? `Pages: ${parsed.pageCount}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    MODULE_ANALYST_PROMPTS[moduleId],
    'Return ONLY valid JSON with this shape:',
    '{',
    '  "category": "short snake_case category such as imaging, prescription, medical_report, hospital_bill, receipt, invoice, statement, research_paper, report, other",',
    '  "summary": "2-5 sentence plain-language summary of what this file contains and why it matters",',
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

function buildVisualAnalysisPrompt(moduleId: DocumentChatModuleId, fileName: string, userContext?: string): string {
  return [
    MODULE_ANALYST_PROMPTS[moduleId],
    'This upload is an image with little or no reliable OCR text.',
    'Describe what is visually present and classify the image using only what is actually visible.',
    'Return ONLY valid JSON with this shape:',
    '{',
    '  "category": "short snake_case category such as photo, illustration, screenshot, comic_character, medical_image, chart, receipt, invoice, statement, other",',
    '  "summary": "2-5 sentence plain-language description of the image and why it matters",',
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

    return [
      `Document ${index + 1}: ${insight.fileName}`,
      `Category: ${insight.category}`,
      `Type: ${insight.fileType.toUpperCase()} | Words: ${insight.wordCount.toLocaleString()} | Pages: ${insight.pageCount}`,
      insight.detectedTitle ? `Detected title: ${insight.detectedTitle}` : null,
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
    : 'Focus on this single document, but still identify missing context or important follow-up questions.'
  ;

  return [
    intro,
    userContext ? `User requested focus: ${userContext}` : null,
    MODULE_CONVERSATION_GUIDANCE[moduleId],
    synthesisInstruction,
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
      const requiresVisualAnalysis = parsed.fileType === 'image' && usableParsedText.length < 24;

      if (requiresVisualAnalysis && analyzeImage) {
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read ${file.name} for visual analysis.`));
          reader.readAsDataURL(file);
        });

        const visualResponse = await analyzeImage(imageDataUrl, buildVisualAnalysisPrompt(moduleId, parsed.fileName, userContext));
        const { analysis, warnings: analysisWarnings } = parseAnalysisResponse(visualResponse, {
          ...parsed,
          rawText: '',
          detectedTitle: null,
        });
        warnings.push(...analysisWarnings.map((warning) => `${parsed.fileName}: ${warning}`));
        return analysis;
      }

      const response = await llmSend(buildAnalysisPrompt(moduleId, {
        ...parsed,
        rawText: usableParsedText,
        detectedTitle: usableParsedText.length > 0 ? parsed.detectedTitle : null,
      }));
      const { analysis, warnings: analysisWarnings } = parseAnalysisResponse(response, parsed);
      warnings.push(...analysisWarnings.map((warning) => `${parsed.fileName}: ${warning}`));
      return analysis;
    },
    buildProposal: (analysis, parsed) => ({
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      detectedTitle: parsed.fileType === 'image' && isLikelyOcrFailureText(parsed.rawText) ? null : parsed.detectedTitle,
      pageCount: parsed.pageCount,
      wordCount: parsed.wordCount,
      category: analysis.category,
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
