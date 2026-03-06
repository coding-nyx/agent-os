import Papa from 'papaparse';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker?url';

GlobalWorkerOptions.workerSrc = workerSrc;

export type LabImportResult = {
  text: string;
  notes: string[];
};

async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages, 12);
  const chunks: string[] = [];

  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
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

  return chunks.join('\n');
}

function parseCsv(text: string): string {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = Array.isArray(parsed.data) ? (parsed.data as string[][]) : [];
  return rows
    .map((row: string[]) => row.map((cell: string) => String(cell || '').trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

export async function parseLabFile(file: File): Promise<LabImportResult> {
  const buffer = await file.arrayBuffer();
  const notes: string[] = [];
  const filename = file.name.toLowerCase();

  if (file.type === 'application/pdf' || filename.endsWith('.pdf')) {
    notes.push('Parsed as PDF text extraction.');
    const text = await parsePdf(buffer);
    return { text, notes };
  }

  const rawText = new TextDecoder('utf-8').decode(buffer);
  if (file.type === 'text/csv' || filename.endsWith('.csv')) {
    notes.push('Parsed as CSV.');
    return { text: parseCsv(rawText), notes };
  }

  notes.push('Parsed as plain text.');
  return { text: rawText, notes };
}
