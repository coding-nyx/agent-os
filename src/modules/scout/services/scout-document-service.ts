import Papa from 'papaparse';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerSrc;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentFileType = 'pdf' | 'txt' | 'csv' | 'md' | 'unknown';

export interface DocumentMetadata {
  filename: string;
  fileType: DocumentFileType;
  fileSize: number;
  pageCount: number | null;
  wordCount: number;
  extractedTitle: string | null;
  parsedAt: string;
}

export interface DocumentParseResult {
  text: string;
  metadata: DocumentMetadata;
  notes: string[];
}

export interface DocumentValidation {
  valid: boolean;
  error: string | null;
  errorCode: 'unsupported_type' | 'too_large' | 'empty_file' | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_PAGES = 50;
const MAX_TEXT_CHARS = 30_000; // ~7,500 tokens for LLM context

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/x-markdown',
]);

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.txt', '.csv', '.md', '.markdown']);

export const ACCEPTED_FILE_STRING = '.pdf,.txt,.csv,.md,.markdown';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function inferFileType(file: File): DocumentFileType {
  const ext = getExtension(file.name);
  if (file.type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (file.type === 'text/csv' || ext === '.csv') return 'csv';
  if (
    file.type === 'text/markdown' ||
    file.type === 'text/x-markdown' ||
    ext === '.md' ||
    ext === '.markdown'
  )
    return 'md';
  if (file.type === 'text/plain' || ext === '.txt') return 'txt';
  return 'unknown';
}

export function validateFile(file: File): DocumentValidation {
  const ext = getExtension(file.name);
  const mimeOk = ACCEPTED_MIME_TYPES.has(file.type);
  const extOk = ACCEPTED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) {
    return {
      valid: false,
      error: `Unsupported file type "${ext || file.type}". Accepted: PDF, TXT, CSV, MD.`,
      errorCode: 'unsupported_type',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is ${sizeMB} MB. Maximum allowed size is 10 MB.`,
      errorCode: 'too_large',
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty.', errorCode: 'empty_file' };
  }

  return { valid: true, error: null, errorCode: null };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

async function parsePdf(
  buffer: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocument({ data: buffer }).promise;
  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = content.items
      .map((item: unknown) => {
        const entry = item as Record<string, unknown>;
        return typeof entry?.str === 'string' ? entry.str : '';
      })
      .filter((line: string) => line.trim().length > 0);
    chunks.push(lines.join(' '));
  }

  return { text: chunks.join('\n'), pageCount: pdf.numPages };
}

function parseCsv(text: string): string {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = Array.isArray(parsed.data) ? (parsed.data as string[][]) : [];
  return rows
    .map((row: string[]) =>
      row
        .map((cell: string) => String(cell || '').trim())
        .filter(Boolean)
        .join(' | ')
    )
    .filter(Boolean)
    .join('\n');
}

function extractTitle(text: string, filename: string): string | null {
  // Heuristic: use the first non-empty line as a potential title
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  // If the first line looks like a title (reasonable length, not a data row)
  if (firstLine.length > 5 && firstLine.length < 200 && !firstLine.includes('|')) {
    return firstLine;
  }

  // Fallback: derive from filename
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  return base.length > 3 ? base : null;
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Main Parse Entry
// ---------------------------------------------------------------------------

export async function parseDocument(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<DocumentParseResult> {
  const fileType = inferFileType(file);
  const buffer = await file.arrayBuffer();
  const notes: string[] = [];
  let text = '';
  let pageCount: number | null = null;

  switch (fileType) {
    case 'pdf': {
      notes.push(`Parsed as PDF text extraction (max ${MAX_PDF_PAGES} pages).`);
      const result = await parsePdf(buffer, onProgress);
      text = result.text;
      pageCount = result.pageCount;
      if (result.pageCount > MAX_PDF_PAGES) {
        notes.push(
          `Document has ${result.pageCount} pages. Only the first ${MAX_PDF_PAGES} were extracted.`
        );
      }
      break;
    }
    case 'csv': {
      notes.push('Parsed as CSV tabular data.');
      const rawText = new TextDecoder('utf-8').decode(buffer);
      text = parseCsv(rawText);
      break;
    }
    case 'md': {
      notes.push('Parsed as Markdown document.');
      text = new TextDecoder('utf-8').decode(buffer);
      break;
    }
    case 'txt':
    default: {
      notes.push('Parsed as plain text.');
      text = new TextDecoder('utf-8').decode(buffer);
      break;
    }
  }

  // Truncate for LLM context window
  if (text.length > MAX_TEXT_CHARS) {
    notes.push(
      `Document text truncated from ${text.length.toLocaleString()} to ${MAX_TEXT_CHARS.toLocaleString()} characters for analysis.`
    );
    text = text.slice(0, MAX_TEXT_CHARS) + '\n\n[...DOCUMENT TRUNCATED...]';
  }

  const wordCount = countWords(text);
  const extractedTitle = extractTitle(text, file.name);

  return {
    text,
    metadata: {
      filename: file.name,
      fileType: fileType === 'unknown' ? 'txt' : fileType,
      fileSize: file.size,
      pageCount,
      wordCount,
      extractedTitle,
      parsedAt: new Date().toISOString(),
    },
    notes,
  };
}

// ---------------------------------------------------------------------------
// Chat Prompt Builder
// ---------------------------------------------------------------------------

export function buildDocumentAnalysisPrompt(result: DocumentParseResult): string {
  const { metadata, text, notes } = result;
  const header = [
    `Evidence source received: "${metadata.filename}"`,
    `Type: ${metadata.fileType.toUpperCase()}`,
    metadata.pageCount !== null ? `Pages: ${metadata.pageCount}` : null,
    `Words: ${metadata.wordCount.toLocaleString()}`,
    metadata.extractedTitle ? `Detected title: "${metadata.extractedTitle}"` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const noteBlock =
    notes.length > 0 ? `\nParser notes:\n- ${notes.join('\n- ')}` : '';

  const instructions = [
    'Analyze this document as an evidence source for the knowledge graph.',
    'Extract the key factual claims, assertions, and findings.',
    'For each significant claim, emit an <action type="add_knowledge_node"> with:',
    '  - title: concise label for the claim',
    '  - claim: the factual assertion',
    '  - confidence: 0.0–1.0 based on source quality and specificity',
    `  - source: "${metadata.filename}"`,
    'Then emit <action type="verify_claim"> for the most important claims.',
    'Provide a brief summary of the document and its relevance.',
    `Attribute all nodes to source: "${metadata.filename}".`,
  ].join('\n');

  // Strip injected tags from file content to prevent prompt injection
  const sanitizedText = text
    .replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '[STRIPPED]')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '[STRIPPED]')
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, '[STRIPPED]')
    .replace(/<action\b[^>]*/gi, '[STRIPPED]');

  return `${header}${noteBlock}\n\n${instructions}\n\n---BEGIN EVIDENCE SOURCE---\n${sanitizedText}\n---END EVIDENCE SOURCE---`;
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileTypeLabel(fileType: DocumentFileType): string {
  const labels: Record<DocumentFileType, string> = {
    pdf: 'PDF Document',
    txt: 'Text File',
    csv: 'CSV Data',
    md: 'Markdown',
    unknown: 'Document',
  };
  return labels[fileType];
}
