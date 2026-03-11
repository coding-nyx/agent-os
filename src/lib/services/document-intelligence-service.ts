/**
 * Document Intelligence Shared Library (S10-003)
 *
 * Platform-agnostic document parsing pipeline:
 *   PDF / image / text  →  raw text extraction  →  field extraction  →  DocumentParseResult
 *
 * Architecture notes:
 * - pdfjs-dist is loaded via dynamic import so the module can be tree-shaken when unused
 *   and gracefully degrades to '' if the import fails (e.g., worker unavailable).
 * - LLM integration is injected as a plain callback so this service has zero dependency
 *   on any AI provider or React context.
 * - Regex-based field extraction runs when no sendMessage callback is provided.
 * - Image files return empty rawText with confidence 0.3; full OCR is out of scope.
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
  | 'general';

export interface DocumentParseHints {
  domain: DocumentDomain;
  moduleId: string;
  /** ISO 4217 currency code, e.g. 'USD' */
  currency?: string;
  /** BCP 47 locale tag, e.g. 'en-US' */
  locale?: string;
}

export interface DocumentParseResult {
  /** Canonical domain classification. */
  type: DocumentDomain;
  /**
   * Extracted key-value pairs.
   *
   * Regex path  → values are literal matched strings.
   * LLM path    → values are model-extracted strings; may be empty when no
   *               match found.  In both cases consumers should treat any
   *               missing key as undefined rather than throw.
   */
  fields: Record<string, string>;
  rawText: string;
  /** Mean field-extraction confidence, 0–1. */
  confidence: number;
  // Extended metadata (beyond the minimum spec)
  pageCount: number;
  fileSizeBytes: number;
  /** ISO 8601 timestamp */
  parsedAt: string;
  moduleId: string;
}

// Internal type used only on the LLM path.
interface DocumentField {
  key: string;
  value: string;
  /** Per-field confidence, 0–1 */
  confidence: number;
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
  general: ['title', 'date', 'author', 'key_points[]'],
};

// ---------------------------------------------------------------------------
// Regex field extractors (primary path — no LLM required)
// ---------------------------------------------------------------------------

/** Shared ISO/US/EU date pattern. */
const DATE_RE =
  /(?:date|dated?|on)[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})|([0-9]{4}-[0-9]{2}-[0-9]{2})/i;

/** Monetary amount with optional symbol or code. */
const MONEY_RE = /\$?([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{2})?)/;

function first(re: RegExp, text: string, group = 1): string {
  const m = re.exec(text);
  if (!m) return '';
  // Return first non-undefined capture group starting at `group`.
  for (let i = group; i < m.length; i++) {
    if (m[i] !== undefined && m[i].trim()) return m[i].trim();
  }
  return '';
}

function extractReceiptFields(text: string): Record<string, string> {
  const totalRe = /(?:total|amount due|grand total|balance due|total amount)[:\s]*\$?\s*([0-9,]+\.[0-9]{2})/i;
  const merchantRe = /^([A-Z][A-Za-z0-9 &'.,\-]{2,59})$/m;
  const itemsRe = /^([A-Za-z][A-Za-z0-9 &'.\-]{1,39})\s{2,}\$?\s*([0-9]+\.[0-9]{2})$/gm;

  const items: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemsRe.exec(text)) !== null) {
    items.push(`${m[1].trim()}:${m[2].trim()}`);
    if (items.length >= 10) break; // cap at 10 items
  }

  return {
    total: first(totalRe, text),
    date: first(DATE_RE, text),
    merchant: first(merchantRe, text),
    ...(items.length > 0 ? { items: items.join(', ') } : {}),
  };
}

function extractInvoiceFields(text: string): Record<string, string> {
  const invoiceNumRe = /invoice\s*(?:no\.?|number|#)[:\s]*([A-Za-z0-9\-]+)/i;
  const dueDateRe = /(?:due\s*date|payment\s*due)[:\s]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i;
  const vendorRe = /(?:from|vendor|billed\s*by|seller)[:\s]*([A-Za-z][A-Za-z0-9 .,\-]{2,59})/i;
  const amountRe = /(?:amount\s*due|total\s*due|balance\s*due|total)[:\s]*\$?\s*([0-9,]+\.[0-9]{2})/i;

  return {
    invoice_number: first(invoiceNumRe, text),
    due_date: first(dueDateRe, text),
    vendor: first(vendorRe, text),
    amount: first(amountRe, text) || first(MONEY_RE, text),
  };
}

function extractLabReportFields(text: string): Record<string, string> {
  const testRe = /(?:test|examination|assay)[:\s]*([A-Za-z][A-Za-z0-9 \-()]{2,59})/i;
  const valueRe = /(?:result|value|level)[:\s]*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z/%µ]+)?/i;
  const rangeRe = /(?:reference\s*range|normal\s*range|ref\.?\s*range)[:\s]*([0-9.,\s\-–—]+(?:[A-Za-z/%µ]*))/i;

  const valueMatch = valueRe.exec(text);

  return {
    test_name: first(testRe, text),
    value: valueMatch ? (valueMatch[1] ?? '') : '',
    unit: valueMatch ? (valueMatch[2] ?? '') : '',
    reference_range: first(rangeRe, text),
    date: first(DATE_RE, text),
  };
}

function extractGeneralFields(text: string): Record<string, string> {
  // Best-effort: first non-empty line as title, then date.
  const firstLine = (text.split('\n').find((l) => l.trim().length > 3) ?? '').trim();
  return {
    title: firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine,
    date: first(DATE_RE, text),
  };
}

function extractFieldsByRegex(
  text: string,
  domain: DocumentDomain,
): Record<string, string> {
  switch (domain) {
    case 'receipt':    return extractReceiptFields(text);
    case 'invoice':    return extractInvoiceFields(text);
    case 'lab_report': return extractLabReportFields(text);
    default:           return extractGeneralFields(text);
  }
}

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
 * Images are out-of-scope for inline OCR.  Returns an empty string so callers
 * receive a well-typed result with `confidence: 0.3`.
 *
 * Full OCR (Tesseract / Vision API) is available in `doc-ingest-service` when
 * needed by higher-level orchestration.
 */
export async function extractTextFromImage(_file: File): Promise<string> {
  return '';
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
 * Converts a DocumentField array (LLM output) to a flat Record<string, string>
 * keyed by field name.  Later entries overwrite earlier entries for the same key.
 *
 * Time complexity: O(n) where n = number of extracted fields.
 */
function fieldsToRecord(fields: DocumentField[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value } of fields) {
    result[key] = value;
  }
  return result;
}

/**
 * Full document intelligence pipeline:
 *
 * 1. Infer file type (PDF / image / plain text)
 * 2. Extract raw text:
 *    - PDF  → pdfjs-dist text extraction across all pages
 *    - Image → empty string (confidence floor: 0.3; full OCR out of scope)
 *    - Text  → file.text()
 * 3. Extract fields:
 *    - When `sendMessage` is provided AND rawText is non-empty → LLM path
 *    - Otherwise → regex extraction keyed by domain hints
 * 4. Compute mean confidence across extracted fields
 * 5. Return a fully-typed `DocumentParseResult`
 *
 * Time complexity: O(P × N) dominated by PDF extraction, O(F) for field extraction.
 */
export async function parseDocument(
  file: File,
  hints: DocumentParseHints,
  sendMessage?: (prompt: string) => Promise<string>,
): Promise<DocumentParseResult> {
  const fileType = inferFileType(file);
  let rawText = '';
  let pageCount = 1;
  let imageConfidence = 1; // overridden for images

  if (fileType === 'pdf') {
    rawText = await extractTextFromPDF(file);
    pageCount = rawText.length > 0 ? rawText.split(PAGE_SEPARATOR).length : 0;
  } else if (fileType === 'image') {
    rawText = await extractTextFromImage(file); // always ''
    pageCount = 1;
    imageConfidence = 0.3; // per spec: images use confidence floor
  } else {
    rawText = await file.text();
    pageCount = 1;
  }

  const base: DocumentParseResult = {
    type: hints.domain,
    rawText,
    fields: {},
    confidence: fileType === 'image' ? 0.3 : 0,
    pageCount,
    fileSizeBytes: file.size,
    parsedAt: new Date().toISOString(),
    moduleId: hints.moduleId,
  };

  if (fileType === 'image') {
    // Images: regex cannot run on empty text; return with spec-mandated confidence.
    return { ...base, confidence: imageConfidence };
  }

  if (rawText.length === 0) return base;

  // LLM path (when caller provides a message-sending function)
  if (sendMessage) {
    const llmFields = await parseDocumentWithLLM(rawText, hints, sendMessage);
    if (llmFields.length > 0) {
      const fields = fieldsToRecord(llmFields);
      const confidence =
        llmFields.reduce((sum, f) => sum + f.confidence, 0) / llmFields.length;
      return { ...base, fields, confidence };
    }
  }

  // Regex fallback path — always runs when LLM is unavailable or returns nothing.
  const regexFields = extractFieldsByRegex(rawText, hints.domain);
  const filled = Object.values(regexFields).filter((v) => v.length > 0).length;
  const total = Object.keys(regexFields).length;
  const regexConfidence = total > 0 ? filled / total : 0;

  return { ...base, fields: regexFields, confidence: regexConfidence };
}
