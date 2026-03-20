import type { DocumentFileType } from './document-pipeline';

const UPLOAD_BEGIN = '---BEGIN DOCUMENT UPLOAD---';
const UPLOAD_END = '---END DOCUMENT UPLOAD---';

export interface UploadedFileDisplay {
  name: string;
  mimeType: string;
  fileType: DocumentFileType;
  sizeBytes: number;
  previewDataUrl?: string;
}

export interface UploadedDocumentMessagePayload {
  kind: 'document_upload';
  caption?: string;
  files: UploadedFileDisplay[];
}

export interface DocumentUploadRequest {
  files: File[];
  caption?: string;
  visibleContent?: string;
}

function parseUploadPayload(payloadText: string): UploadedDocumentMessagePayload | null {
  if (!payloadText) return null;

  try {
    const parsed = JSON.parse(payloadText) as UploadedDocumentMessagePayload;
    if (parsed.kind !== 'document_upload' || !Array.isArray(parsed.files)) return null;
    return {
      kind: 'document_upload',
      caption: typeof parsed.caption === 'string' ? parsed.caption : undefined,
      files: parsed.files
        .filter((file): file is UploadedFileDisplay => Boolean(file) && typeof file.name === 'string')
        .map((file) => ({
          name: file.name,
          mimeType: typeof file.mimeType === 'string' ? file.mimeType : '',
          fileType: file.fileType,
          sizeBytes: typeof file.sizeBytes === 'number' ? file.sizeBytes : 0,
          previewDataUrl: typeof file.previewDataUrl === 'string' ? file.previewDataUrl : undefined,
        })),
    };
  } catch {
    return null;
  }
}

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

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to preview ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export async function buildDocumentUploadVisibleMessage(files: File[], caption?: string): Promise<string> {
  const displayFiles: UploadedFileDisplay[] = await Promise.all(
    files.map(async (file) => {
      const fileType = inferFileType(file);
      return {
        name: file.name,
        mimeType: file.type,
        fileType,
        sizeBytes: file.size,
        previewDataUrl: fileType === 'image' ? await fileToDataUrl(file) : undefined,
      };
    }),
  );

  const payload: UploadedDocumentMessagePayload = {
    kind: 'document_upload',
    caption: caption?.trim() || undefined,
    files: displayFiles,
  };

  return `${UPLOAD_BEGIN}\n${JSON.stringify(payload)}\n${UPLOAD_END}`;
}

export function parseDocumentUploadMessage(text: string): UploadedDocumentMessagePayload | null {
  const begin = text.indexOf(UPLOAD_BEGIN);
  if (begin === -1) {
    return parseUploadPayload(text.trim());
  }

  const end = text.indexOf(UPLOAD_END, begin);
  const payloadText = end === -1
    ? text.slice(begin + UPLOAD_BEGIN.length).trim()
    : text.slice(begin + UPLOAD_BEGIN.length, end).trim();

  return parseUploadPayload(payloadText);
}

export function summarizeDocumentUploadMessage(payload: UploadedDocumentMessagePayload): string {
  const fileLabel = payload.files.length === 1 ? 'file' : 'files';
  const names = payload.files.slice(0, 3).map((file) => file.name).join(', ');
  const more = payload.files.length > 3 ? ` and ${payload.files.length - 3} more` : '';
  const caption = payload.caption ? ` Focus: ${payload.caption}` : '';
  return `Uploaded ${payload.files.length} ${fileLabel}: ${names}${more}.${caption}`.trim();
}
