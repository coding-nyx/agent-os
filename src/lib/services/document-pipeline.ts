import type { DocumentDomain } from './document-intelligence-service';
import { parseDocument, analyzeRawText } from './document-intelligence-service';
import { extractTextWithVision } from './vision-analysis-service';
import { AraLogger } from '@/lib/ara-logger';

export type DocumentFileType = 'pdf' | 'csv' | 'text' | 'image';

export interface DocumentParsed {
  fileName: string;
  fileType: DocumentFileType;
  fileSizeBytes: number;
  pageCount: number;
  wordCount: number;
  detectedTitle: string | null;
  rawText: string;
  notes: string[];
  parsedAt: string;
  extras?: Record<string, unknown>;
}

export interface DocumentPipelineContext {
  moduleId: string;
  domain: DocumentDomain;
}

export interface DocumentPipelinePolicy<TAnalysis, TProposal> {
  id: string;
  context: DocumentPipelineContext;
  useOCRForImages?: boolean;
  ocrFailureMode?: 'warn' | 'error';
  parse?: (file: File) => Promise<DocumentParsed>;
  analyze: (input: { file: File; parsed: DocumentParsed }, sendMessage: (prompt: string) => Promise<string>) => Promise<TAnalysis>;
  buildProposal: (analysis: TAnalysis, parsed: DocumentParsed) => TProposal;
  summarizeProposal: (proposal: TProposal, parsed: DocumentParsed) => string;
}

export interface DocumentPipelineResult<TAnalysis, TProposal> {
  parsed: DocumentParsed;
  analysis: TAnalysis;
  proposal: TProposal;
  summary: string;
  warnings: string[];
}

export type DocumentPipelineStageId = 'parsing' | 'ocr' | 'analyzing' | 'finalizing' | 'done' | 'error';

export type DocumentPipelineStage = {
  id: DocumentPipelineStageId;
  label: string;
  progress?: number;
};

function inferFileType(file: File): DocumentFileType {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (file.type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (file.type === 'text/csv' || ext === '.csv') return 'csv';
  if (
    file.type.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)
  ) {
    return 'image';
  }
  return 'text';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.trim().length > 0).length;
}

function extractTitle(text: string, filename: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const firstLine = lines[0];
  if (firstLine.length > 5 && firstLine.length < 200) return firstLine;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  return base.length > 3 ? base : null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('[DocumentPipeline] Failed to read file as data URL.'));
    reader.readAsDataURL(file);
  });
}

async function defaultParse(file: File, context: DocumentPipelineContext): Promise<{ parsed: DocumentParsed; warnings: string[] }> {
  const warnings: string[] = [];
  const fileType = inferFileType(file);
  const baseResult = await parseDocument(file, { domain: context.domain, moduleId: context.moduleId });

  const rawText = baseResult.rawText ?? '';
  const wordCount = countWords(rawText);
  const detectedTitle = extractTitle(rawText, file.name);

  const parsed: DocumentParsed = {
    fileName: file.name,
    fileType,
    fileSizeBytes: file.size,
    pageCount: baseResult.pageCount ?? 1,
    wordCount,
    detectedTitle,
    rawText,
    notes: [],
    parsedAt: new Date().toISOString(),
  };

  if (fileType === 'image' && rawText.length === 0) {
    warnings.push('Image parsing returned no text.');
  }

  return { parsed, warnings };
}

async function applyOCRIfNeeded(
  parsed: DocumentParsed,
  file: File,
  useOCR: boolean | undefined,
  warnings: string[],
  ocrFailureMode: 'warn' | 'error' = 'warn',
): Promise<DocumentParsed> {
  if (!useOCR || parsed.fileType !== 'image') return parsed;
  try {
    const dataUrl = await fileToDataUrl(file);
    const ocrText = await extractTextWithVision(dataUrl);
    const wordCount = countWords(ocrText);
    return {
      ...parsed,
      rawText: ocrText,
      wordCount,
      detectedTitle: extractTitle(ocrText, parsed.fileName),
      notes: [...parsed.notes, 'OCR applied to image document.'],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image OCR failed.';
    if (ocrFailureMode === 'error') {
      throw new Error(message);
    }
    warnings.push(message);
    return parsed;
  }
}

async function sendWithFallback(
  prompt: string,
  primary?: (prompt: string) => Promise<string>,
  fallback?: (prompt: string) => Promise<string>
): Promise<string> {
  if (primary) {
    try {
      const result = await primary(prompt);
      if (result && result.trim().length > 0) return result;
    } catch {
      // fall through to fallback
    }
  }
  if (fallback) {
    return fallback(prompt);
  }
  return '';
}

export async function runDocumentPipeline<TAnalysis, TProposal>(params: {
  file: File;
  policy: DocumentPipelinePolicy<TAnalysis, TProposal>;
  sendMessage?: (prompt: string) => Promise<string>;
  sendMessageFallback?: (prompt: string) => Promise<string>;
  parsedOverride?: DocumentParsed;
  onStageChange?: (stage: DocumentPipelineStage) => void;
}): Promise<DocumentPipelineResult<TAnalysis, TProposal>> {
  const { file, policy, sendMessage, sendMessageFallback, parsedOverride, onStageChange } = params;

  const warnings: string[] = [];

  const emitStage = (stage: DocumentPipelineStage) => {
    try {
      onStageChange?.(stage);
    } catch (e) { AraLogger.warn('DocumentPipeline', 'UI callback threw (suppressed)'); }
  };

  emitStage({ id: 'parsing', label: 'Uploading document…', progress: 0 });

  try {
    let parsed: DocumentParsed;
    emitStage({ id: 'parsing', label: 'Extracting text…', progress: 20 });
    if (parsedOverride) {
      parsed = parsedOverride;
    } else if (policy.parse) {
      parsed = await policy.parse(file);
    } else {
      const base = await defaultParse(file, policy.context);
      parsed = base.parsed;
      warnings.push(...base.warnings);
    }

    const willOCR = Boolean(policy.useOCRForImages && parsed.fileType === 'image');
    if (willOCR) {
      emitStage({ id: 'ocr', label: 'Running OCR (if needed)…', progress: 35 });
    }
    parsed = await applyOCRIfNeeded(parsed, file, policy.useOCRForImages, warnings, policy.ocrFailureMode);

    emitStage({ id: 'analyzing', label: 'Analysing with AI…', progress: 70 });
    const send = (prompt: string) => sendWithFallback(prompt, sendMessage, sendMessageFallback);
    const analysis = await policy.analyze({ file, parsed }, send);

    emitStage({ id: 'finalizing', label: 'Finalizing analysis…', progress: 90 });
    const proposal = policy.buildProposal(analysis, parsed);
    const summary = policy.summarizeProposal(proposal, parsed);

    emitStage({ id: 'done', label: 'Document analyzed.', progress: 100 });
    return { parsed, analysis, proposal, summary, warnings };
  } catch (e) {
    emitStage({ id: 'error', label: 'Analysis failed.' });
    throw e;
  }
}

export async function analyzeRawTextForDocument(
  rawText: string,
  context: DocumentPipelineContext,
  sendMessage?: (prompt: string) => Promise<string>,
  sendMessageFallback?: (prompt: string) => Promise<string>
): Promise<{ fields: Record<string, string>; confidence: number }> {
  const send = sendMessage || sendMessageFallback ? (prompt: string) => sendWithFallback(prompt, sendMessage, sendMessageFallback) : undefined;
  return analyzeRawText(rawText, { domain: context.domain, moduleId: context.moduleId }, send);
}
