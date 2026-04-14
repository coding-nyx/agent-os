import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';
import { extractTextWithVision } from './vision-analysis-service';
import { recognizeImageWithWorker } from './tesseract-worker';

GlobalWorkerOptions.workerSrc = workerSrc;

export type DocumentFileType = 'pdf' | 'image' | 'txt' | 'csv' | 'md' | 'unknown';

export type ParseProgressEvent = {
  phase: 'extracting' | 'ocr' | 'complete';
  current: number;
  total: number;
  message: string;
};

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
  pageTexts: Array<{ pageIndex: number; text: string }>;
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 12;
const MAX_TEXT_CHARS = 40_000;

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/x-markdown',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const ACCEPTED_EXTENSIONS = new Set(['.pdf', '.txt', '.csv', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.webp']);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

function inferFileType(file: File): DocumentFileType {
  const ext = getExtension(file.name);
  if (file.type === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (file.type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return 'image';
  if (file.type === 'text/csv' || ext === '.csv') return 'csv';
  if (
    file.type === 'text/markdown' ||
    file.type === 'text/x-markdown' ||
    ext === '.md' ||
    ext === '.markdown'
  ) return 'md';
  if (file.type === 'text/plain' || ext === '.txt') return 'txt';
  return 'unknown';
}

export function validateDocumentFile(file: File) {
  const ext = getExtension(file.name);
  const mimeOk = ACCEPTED_MIME_TYPES.has(file.type);
  const extOk = ACCEPTED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) {
    return { valid: false, error: `Unsupported file type "${ext || file.type}".`, errorCode: 'unsupported_type' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File is ${sizeMB} MB. Maximum is 15 MB.`, errorCode: 'too_large' };
  }
  if (file.size === 0) return { valid: false, error: 'File is empty.', errorCode: 'empty_file' };
  return { valid: true, error: null, errorCode: null };
}

export async function parseCsv(text: string): Promise<string> {
  const Papa = (await import('papaparse')).default;
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = Array.isArray(parsed.data) ? (parsed.data as string[][]) : [];
  return rows
    .map((row: string[]) =>
      row.map((cell: string) => String(cell || '').trim()).filter(Boolean).join(' | ')
    )
    .filter(Boolean)
    .join('\n');
}

function extractTitle(text: string, filename: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const firstLine = lines[0];
  if (firstLine.length > 5 && firstLine.length < 200 && !firstLine.includes('|')) return firstLine;
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
  return base.length > 3 ? base : null;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        // console.log('[DocIngest] blobToDataURL success, length:', result.length);
        resolve(result);
      } else {
        reject(new Error('FileReader returned non-string result'));
      }
    };
    reader.onerror = () => {
      console.error('[DocIngest] FileReader error:', reader.error);
      reject(reader.error || new Error('FileReader error'));
    };
    reader.readAsDataURL(blob);
  });
}

async function renderPdfPageToDataUrl(pdf: any, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png');
}

async function ocrImageLocal(dataUrl: string): Promise<string> {
  return recognizeImageWithWorker(dataUrl);
}

async function ocrImageHybrid(dataUrl: string): Promise<string> {
  // If we suspect a medical image, skip Tesseract and go straight to Vision
  // Tesseract is terrible at medical images and might return gibberish that satisfies the length check
  // For now, we'll try to detect if it's a photo/scan based on context, but since we don't have that context here easily,
  // we will ALWAYS try vision if local OCR returns a very short string, but maybe we should prioritize vision for everything in this context?
  // Let's keep the hybrid approach but logging will help us see if Tesseract is "stealing" the job.

  try {
    const localText = await ocrImageLocal(dataUrl);
    
    // INCREASE THRESHOLD: Medical images often have some text (patient name, date) but we want the VISION DESCRIPTION.
    // If Tesseract returns just "Patient Name: John Doe", that's > 40 chars but useless for diagnosis.
    // Let's bump the threshold or rethink this. 
    // Actually, for the SOMA context, we almost ALWAYS want the vision description for X-rays.
    // But this function is generic doc-ingest.
    
    if (localText && localText.length > 100) {
       return localText;
    }
  } catch (error) {
    console.warn('[DocIngest] Local OCR failed, falling back to vision:', error);
  }
  
  return extractTextWithVision(dataUrl);
}

async function parsePdfWithHybridOcr(
  buffer: ArrayBuffer,
  onProgress?: (event: ParseProgressEvent) => void
): Promise<{ text: string; pageCount: number; pageTexts: Array<{ pageIndex: number; text: string }>; notes: string[] }> {
  const pdf = await getDocument({ data: buffer }).promise;
  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const chunks: string[] = [];
  const pageTexts: Array<{ pageIndex: number; text: string }> = [];
  const notes: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.({ phase: 'extracting', current: pageNum, total: totalPages, message: `Extracting text from page ${pageNum} / ${totalPages}…` });
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = content.items
      .map((item: unknown) => {
        const entry = item as Record<string, unknown>;
        return typeof entry?.str === 'string' ? entry.str : '';
      })
      .filter((line: string) => line.trim().length > 0);
    const text = lines.join(' ').trim();
    pageTexts.push({ pageIndex: pageNum - 1, text });
    chunks.push(text);
  }

  let combined = chunks.join('\n');

  if (countWords(combined) < 40) {
    notes.push('Low text density detected in PDF. Running OCR on rendered pages.');
    const ocrChunks: string[] = [];
    const ocrPageTexts: Array<{ pageIndex: number; text: string }> = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({ phase: 'ocr', current: pageNum, total: totalPages, message: `Running OCR on page ${pageNum} / ${totalPages}…` });
      const dataUrl = await renderPdfPageToDataUrl(pdf, pageNum);
      const ocrText = await ocrImageHybrid(dataUrl);
      ocrPageTexts.push({ pageIndex: pageNum - 1, text: ocrText });
      ocrChunks.push(ocrText);
    }
    combined = ocrChunks.join('\n');
    return { text: combined, pageCount: pdf.numPages, pageTexts: ocrPageTexts, notes };
  }

  return { text: combined, pageCount: pdf.numPages, pageTexts, notes };
}

export async function parseDocument(
  file: File,
  onProgress?: (event: ParseProgressEvent) => void
): Promise<DocumentParseResult> {
  const fileType = inferFileType(file);
  const buffer = await file.arrayBuffer();
  const notes: string[] = [];
  let text = '';
  let pageCount: number | null = null;
  let pageTexts: Array<{ pageIndex: number; text: string }> = [];

  switch (fileType) {
    case 'pdf': {
      notes.push(`Parsed as PDF (max ${MAX_PDF_PAGES} pages).`);
      const result = await parsePdfWithHybridOcr(buffer, onProgress);
      text = result.text;
      pageCount = result.pageCount;
      pageTexts = result.pageTexts;
      notes.push(...result.notes);
      if (result.pageCount > MAX_PDF_PAGES) {
        notes.push(`Document has ${result.pageCount} pages. Only first ${MAX_PDF_PAGES} processed.`);
      }
      break;
    }
    case 'image': {
      // Ensure we have a valid image mime type so data URL is correct
      let mimeType = file.type;
      if (!mimeType || !mimeType.startsWith('image/')) {
         const ext = getExtension(file.name);
         if (ext === '.png') mimeType = 'image/png';
         else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
         else if (ext === '.webp') mimeType = 'image/webp';
         else mimeType = 'image/png'; // Fallback
      }

      notes.push('Parsed as image. Running hybrid OCR.');
      try {
        const dataUrl = await blobToDataURL(new Blob([buffer], { type: mimeType }));
        text = await ocrImageHybrid(dataUrl);
      } catch (err) {
        console.error('[DocIngest] Image processing failed:', err);
        throw err;
      }
      pageCount = 1;
      pageTexts = [{ pageIndex: 0, text }];
      // No revoke needed for data URL strings
      break;
    }
    case 'csv': {
      notes.push('Parsed as CSV tabular data.');
      const rawText = new TextDecoder('utf-8').decode(buffer);
      text = await parseCsv(rawText);
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

  if (text.length > MAX_TEXT_CHARS) {
    notes.push(`Document text truncated from ${text.length.toLocaleString()} to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
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
      parsedAt: new Date().toISOString()
    },
    notes,
    pageTexts
  };
}

export function buildDocumentAnalysisPrompt(result: DocumentParseResult): string {
  const { metadata, text, notes } = result;
  const header = [
    `Document received: "${metadata.filename}"`,
    `Type: ${metadata.fileType.toUpperCase()}`,
    metadata.pageCount !== null ? `Pages: ${metadata.pageCount}` : null,
    `Words: ${metadata.wordCount.toLocaleString()}`,
    metadata.extractedTitle ? `Detected title: "${metadata.extractedTitle}"` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const noteBlock = notes.length > 0 ? `\nParser notes:\n- ${notes.join('\n- ')}` : '';

  const instructions = [
    'Analyze this document. Extract key facts and summarize in plain language.',
    'Cite the most important lines with page references when possible.',
    'If the user asked for diagnosis, provide doc-only analysis first and ask for consent to use base context.'
  ].join('\n');

  const sanitizedText = text
    .replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '[STRIPPED]')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '[STRIPPED]')
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, '[STRIPPED]')
    .replace(/<action\b[^>]*/gi, '[STRIPPED]');

  return `${header}${noteBlock}\n\n${instructions}\n\n---BEGIN DOCUMENT---\n${sanitizedText}\n---END DOCUMENT---`;
}
