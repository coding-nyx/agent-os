import React, { useState } from 'react';
import { FileText, FileSpreadsheet, Image, FileCode, ChevronDown, ChevronUp, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseDocumentUploadMessage, type UploadedDocumentMessagePayload } from '@/lib/services/document-upload-message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedDocumentMessage {
  isDocument: true;
  filename: string;
  fileType: string;
  wordCount: number | null;
  pageCount: number | null;
  detectedTitle: string | null;
  notes: string[];
  rawContent: string;
}

// ---------------------------------------------------------------------------
// Parser: detect "---BEGIN DOCUMENT---" messages and extract metadata
// ---------------------------------------------------------------------------

const DOC_MARKERS = [
  { begin: '---BEGIN DOCUMENT---', end: '---END DOCUMENT---' },
  { begin: '---BEGIN LAB DATA---', end: '---END LAB DATA---' },
];

export function parseDocumentMessage(text: string): ParsedDocumentMessage | null {
  // Find the first matching marker pair
  let beginIdx = -1;
  let endIdx = -1;
  for (const { begin, end } of DOC_MARKERS) {
    const idx = text.indexOf(begin);
    if (idx !== -1) {
      beginIdx = idx;
      endIdx = text.indexOf(end, idx);
      break;
    }
  }
  if (beginIdx === -1) return null;

  const beginMarker = DOC_MARKERS.find(m => text.includes(m.begin))!;
  const rawContent = endIdx > beginIdx
    ? text.slice(beginIdx + beginMarker.begin.length, endIdx).trim()
    : text.slice(beginIdx + beginMarker.begin.length).trim();

  // Parse header: 'Document received: "file.csv" | Type: CSV | Words: 17 | ...'
  // OR: 'Lab import received: file.csv. Parse the content...'
  const header = text.slice(0, beginIdx);
  const filenameMatch = header.match(/Document received:\s*"([^"]+)"/) 
    ?? header.match(/(?:Lab import|Import|Upload)\s+received:\s*([^\s.]+\.\w+)/i);
  const typeMatch = header.match(/Type:\s*(\w+)/);
  const wordsMatch = header.match(/Words:\s*([\d,]+)/);
  const pagesMatch = header.match(/Pages:\s*(\d+)/);
  const titleMatch = header.match(/Detected title:\s*"([^"]+)"/);

  // Infer file type from extension if not explicitly stated
  const filename = filenameMatch?.[1] ?? 'Uploaded document';
  const extMatch = filename.match(/\.(\w+)$/);
  const inferredType = typeMatch?.[1]?.toLowerCase() 
    ?? extMatch?.[1]?.toLowerCase() 
    ?? 'unknown';

  // Extract parser notes
  const notesMatch = header.match(/Parser notes:\n([\s\S]*?)(?:\n\n|$)/);
  const notes = notesMatch
    ? notesMatch[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
    : [];

  return {
    isDocument: true,
    filename,
    fileType: inferredType,
    wordCount: wordsMatch ? parseInt(wordsMatch[1].replace(/,/g, ''), 10) : null,
    pageCount: pagesMatch ? parseInt(pagesMatch[1], 10) : null,
    detectedTitle: titleMatch?.[1] ?? null,
    notes,
    rawContent,
  };
}

// ---------------------------------------------------------------------------
// Icons by file type
// ---------------------------------------------------------------------------

const FILE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  pdf: FileText,
  csv: FileSpreadsheet,
  image: Image,
  png: Image,
  jpg: Image,
  jpeg: Image,
  webp: Image,
  md: FileCode,
  txt: FileText,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DocumentMessageCardProps {
  doc?: ParsedDocumentMessage;
  upload?: UploadedDocumentMessagePayload;
  themeAccent?: string;
}

export function DocumentMessageCard({ doc, upload, themeAccent = 'text-orange-400' }: DocumentMessageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (upload) {
    return (
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
          <div className="p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Uploaded documents</p>
            {upload.caption && (
              <p className="mt-2 text-xs text-white/70 whitespace-pre-wrap">{upload.caption}</p>
            )}
            <div className="mt-3 space-y-2">
              {upload.files.map((file, index) => {
                const Icon = FILE_ICONS[file.fileType] ?? File;
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    {file.previewDataUrl ? (
                      <img
                        src={file.previewDataUrl}
                        alt={file.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center">
                        <Icon className={cn("w-5 h-5", themeAccent)} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white/85" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-white/40">
                        {file.fileType.toUpperCase()} · {Math.max(1, Math.round(file.sizeBytes / 1024))} KB
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const Icon = FILE_ICONS[doc.fileType] ?? File;

  const meta = [
    doc.fileType.toUpperCase(),
    doc.wordCount != null ? `${doc.wordCount.toLocaleString()} words` : null,
    doc.pageCount != null ? `${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="w-full max-w-sm">
      {/* Card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 p-3.5">
          <div className={cn(
            "w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center shrink-0",
          )}>
            <Icon className={cn("w-5 h-5", themeAccent)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/85 truncate" title={doc.filename}>
              {doc.filename}
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">{meta}</p>
            {doc.detectedTitle && doc.detectedTitle !== doc.filename && (
              <p className="text-[10px] text-white/30 mt-0.5 truncate italic">
                {doc.detectedTitle}
              </p>
            )}
          </div>
        </div>

        {/* Notes badges */}
        {doc.notes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
            {doc.notes.slice(0, 2).map((note, i) => (
              <span key={i} className="text-[9px] text-white/35 bg-white/5 px-2 py-0.5 rounded-full">
                {note}
              </span>
            ))}
          </div>
        )}

        {/* Preview toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-1.5 py-2 border-t border-white/5 text-[10px] font-semibold uppercase tracking-wider text-white/30 hover:text-white/50 hover:bg-white/[0.02] transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Hide preview
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Preview document
            </>
          )}
        </button>

        {/* Expandable content */}
        {isExpanded && (
          <div className="border-t border-white/5">
            <pre className="p-3.5 text-[10px] leading-relaxed text-white/50 font-mono overflow-x-auto overflow-y-auto max-h-60 no-scrollbar whitespace-pre-wrap break-all">
              {doc.rawContent.slice(0, 3000)}
              {doc.rawContent.length > 3000 && '\n\n[...truncated for preview]'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export { parseDocumentUploadMessage };
