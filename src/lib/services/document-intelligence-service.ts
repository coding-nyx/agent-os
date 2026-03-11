/**
 * Document Intelligence Shared Library (S10-003)
 *
 * Platform-agnostic document parsing pipeline:
 *   PDF / image / text  →  raw text extraction  →  LLM field extraction  →  DocumentParseResult
 *
 * Architecture notes:
 * - pdfjs-dist is loaded via dynamic import so the module can be tree-shaken when unused
 *   and gracefully degrades to '' if the import fails (e.g., worker unavailable).
 * - LLM integration is injected as a plain callback so this service has zero dependency
 *   on any AI provider or React context.
 * - No `any` — all pdfjs item types are narrowed via Record<string, unknown> guards.
 */

import { sanitizeJsonPayload } from '@/llm-engine/sanitize';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DocumentDomain =
  | 'receipt'
  | 'invoice'
  | 'lab_report'
  | 'statement'
  | 'general';

export interface DocumentParseHints {
  domain: DocumentDomain;
  moduleId: string;
  /** ISO 4217 currency code, e.g. 'USD' */
  currency?: string;
  /** BCP 47 locale tag, e.g. 'en-US' */
  locale?: string;
}

export interface DocumentField {
  key: string;
  value: string;
  /** Extraction confidence, 0–1 */
  confidence: number;
}

export interface DocumentParseResult {
  domain: DocumentDomain;
  rawText: string;
  fields: DocumentField[];
  /** Mean confidence across all fields, or 0 when fields is empty */
  confidence: number;
  pageCount: number;
  fileSizeBytes: number;
  /** ISO 8601 timestamp */
  parsedAt: string;
  moduleId: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const LLM_TIMEOUT_MS = 8_000;
const PAGE_SEPARATOR = '\n---\n';

/** Domain-specific field hints injected into the LLM extraction prompt. */
const DOMAIN_FIELD_HINTS: Record<DocumentDomain, string[]> = {
  receipt: ['total', 'date', 'merchant', 'items[]', 'tax', 'currency'],
  invoice: ['invoice_number', 'due_date', 'vendor', 'line_items[]', 'subtotal', 'tax', 'total'],
  lab_report: ['test_name', 'result_value', 'reference_range', 'units', 'date', 'lab_name'],
  statement: ['period_start', 'period_end', 'opening_balance', 'closing_balance', 'transactions[]'],
  general: ['title', 'date', 'author', 'key_points[]'],
};

// ---------------------------------------------------------------------------
// File-type helpers
// ---------------------------------------------------------------------------

type InternalFileType = 'pdf' | 'image' | 'text';

function inferFileType(file: File): InternalFileType {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (file.type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    file.type.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
  ) return 'image';
  return 'text';
}

// ---------------------------------------------------------------------------
// PDF text extraction (dynamic import, graceful fallback)
// ---------------------------------------------------------------------------

/**
 * Extracts concatenated text from all pages of a PDF file.
 * Pages are joined with `\n---\n`.
 * Returns `''` on any failure (import error, corrupt PDF, etc.).
 *
 * Time complexity: O(P × N) where P = page count and N = items per page.
 * Space complexity: O(P × N) for accumulated page text chunks.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    // Dynamic import replicates the same module used by doc-ingest-service and
    // scout-document-service but wrapped so failures do not propagate to callers.
    const [pdfjs, workerMod] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker?url'),
    ]);

    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default as string;

    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buffer }).promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item: unknown) => {
          const entry = item as Record<string, unknown>;
          return typeof entry['str'] === 'string' ? entry['str'] : '';
        })
        .filter((line: string) => line.trim().length > 0)
        .join(' ')
        .trim();

      pageTexts.push(pageText);
    }

    return pageTexts.join(PAGE_SEPARATOR);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Image text extraction (base64 data URL for LLM vision OCR)
// ---------------------------------------------------------------------------

/**
 * Converts an image File to a base64 data URL so the caller can pass it to
 * an LLM with vision capabilities for OCR.
 * Returns `''` for non-image files or on read errors.
 *
 * Time complexity: O(N) where N = file size in bytes.
 */
export async function extractTextFromImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return '';

  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// LLM field extraction
// ---------------------------------------------------------------------------

function buildExtractionPrompt(rawText: string, hints: DocumentParseHints): string {
  const fields = DOMAIN_FIELD_HINTS[hints.domain].join(', ');
  const extras: string[] = [];
  if (hints.currency) extras.push(`Currency: ${hints.currency}`);
  if (hints.locale) extras.push(`Locale: ${hints.locale}`);
  const extraLine = extras.length > 0 ? ` ${extras.join('. ')}.` : '';

  return (
    `You are a document field extractor. Extract structured data from the document below.\n` +
    `Domain: ${hints.domain}.${extraLine}\n` +
    `Focus on these fields: ${fields}.\n\n` +
    `Respond with ONLY a valid JSON array — no prose, no markdown fences:\n` +
    `[{"key":"field_name","value":"extracted_value","confidence":0.95}]\n\n` +
    `Confidence is a number 0–1 reflecting how certain you are of the extracted value.\n\n` +
    `---BEGIN DOCUMENT---\n${rawText}\n---END DOCUMENT---`
  );
}

/**
 * Narrows a raw `unknown` value from JSON.parse to a DocumentField, or null
 * when the shape is invalid.
 */
function toDocumentField(item: unknown): DocumentField | null {
  if (typeof item !== 'object' || item === null) return null;
  const entry = item as Record<string, unknown>;
  const key = typeof entry['key'] === 'string' ? entry['key'] : String(entry['key'] ?? '');
  const value = typeof entry['value'] === 'string' ? entry['value'] : String(entry['value'] ?? '');
  const raw = entry['confidence'];
  const confidence =
    typeof raw === 'number' ? Math.min(1, Math.max(0, raw)) : 0;
  if (!key) return null;
  return { key, value, confidence };
}

/**
 * Parses the LLM response string into a DocumentField array.
 * Uses `sanitizeJsonPayload` (alias: nexusCleaner) as the first cleaning pass,
 * then slices from the first `[` to the last `]` as a fallback.
 *
 * Returns `[]` on any parse failure.
 */
function parseFieldsFromResponse(response: string): DocumentField[] {
  try {
    const cleaned = sanitizeJsonPayload(response);
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];

    const jsonSlice = cleaned.slice(start, end + 1);
    const raw: unknown = JSON.parse(jsonSlice);
    if (!Array.isArray(raw)) return [];

    return raw
      .map(toDocumentField)
      .filter((f): f is DocumentField => f !== null);
  } catch {
    return [];
  }
}

/**
 * Calls the injected LLM callback with a structured extraction prompt and
 * parses the response into DocumentField[].
 *
 * - 8 s hard timeout; returns `[]` on timeout or any parse error.
 * - `sendMessage` is caller-provided so this service has no AI provider dependency.
 *
 * Time complexity: O(F) where F = number of extracted fields.
 */
export async function parseDocumentWithLLM(
  rawText: string,
  hints: DocumentParseHints,
  sendMessage: (prompt: string) => Promise<string>,
): Promise<DocumentField[]> {
  const prompt = buildExtractionPrompt(rawText, hints);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM extraction timeout')), LLM_TIMEOUT_MS),
  );

  try {
    const responseText = await Promise.race([sendMessage(prompt), timeout]);
    return parseFieldsFromResponse(responseText);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main orchestration entry point
// ---------------------------------------------------------------------------

/**
 * Full document intelligence pipeline:
 *
 * 1. Infer file type (PDF / image / plain text)
 * 2. Extract raw text via the appropriate extractor
 * 3. Optionally call `parseDocumentWithLLM` when `sendMessage` is provided
 * 4. Compute mean confidence across extracted fields
 * 5. Return a fully-typed `DocumentParseResult`
 *
 * When `sendMessage` is omitted or `rawText` is empty, fields are `[]` and
 * confidence is `0`.
 *
 * Time complexity: O(P × N) dominated by PDF extraction, O(F) for field parsing.
 */
export async function parseDocument(
  file: File,
  hints: DocumentParseHints,
  sendMessage?: (prompt: string) => Promise<string>,
): Promise<DocumentParseResult> {
  const fileType = inferFileType(file);
  let rawText = '';
  let pageCount = 1;

  if (fileType === 'pdf') {
    rawText = await extractTextFromPDF(file);
    pageCount = rawText.length > 0 ? rawText.split(PAGE_SEPARATOR).length : 0;
  } else if (fileType === 'image') {
    rawText = await extractTextFromImage(file);
    pageCount = 1;
  } else {
    rawText = await file.text();
    pageCount = 1;
  }

  const base: DocumentParseResult = {
    domain: hints.domain,
    rawText,
    fields: [],
    confidence: 0,
    pageCount,
    fileSizeBytes: file.size,
    parsedAt: new Date().toISOString(),
    moduleId: hints.moduleId,
  };

  if (!sendMessage || rawText.length === 0) return base;

  const fields = await parseDocumentWithLLM(rawText, hints, sendMessage);
  const confidence =
    fields.length > 0
      ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
      : 0;

  return { ...base, fields, confidence };
}
