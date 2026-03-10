import { useState } from 'react';
import { FileText, Image, Table, RotateCcw, ChevronDown } from 'lucide-react';
import type { DocumentRecord } from '@/lib/types';

interface DiagnosisDocumentCardProps {
  doc: DocumentRecord;
  isActive?: boolean;
  onClick?: () => void;
  onReexamine?: () => void;
  themeColor?: string;
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const FILE_ICONS: Record<DocumentRecord['fileType'], React.FC<{ className?: string }>> = {
  pdf: FileText,
  image: Image,
  csv: Table,
  txt: FileText,
  md: FileText,
  unknown: FileText,
};

const FILE_TYPE_LABELS: Record<DocumentRecord['fileType'], string> = {
  pdf: 'PDF',
  image: 'Image',
  csv: 'CSV',
  txt: 'Text',
  md: 'Markdown',
  unknown: 'File',
};

export function DiagnosisDocumentCard({
  doc,
  isActive,
  onClick,
  onReexamine,
  themeColor = 'cyan',
}: DiagnosisDocumentCardProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const Icon = FILE_ICONS[doc.fileType] ?? FileText;
  const displayTitle = doc.extractedTitle || doc.filename;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
      className={[
        'rounded-[16px] border p-3 cursor-pointer transition-all text-left',
        isActive
          ? 'border-white/25 bg-white/8'
          : 'border-white/10 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
          <Icon className="w-3 h-3 text-white/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-white/80 truncate leading-tight">
            {displayTitle}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
              {FILE_TYPE_LABELS[doc.fileType]}
            </span>
            {doc.pageCount != null && (
              <span className="text-[9px] text-white/40">{doc.pageCount}p</span>
            )}
            <span className="text-[9px] text-white/40">{doc.wordCount.toLocaleString()}w</span>
          </div>
        </div>
      </div>

      {/* Date */}
      <p className="text-[9px] text-white/30 mt-1.5 pl-8">{formatRelativeDate(doc.createdAt)}</p>

      {/* Notes toggle */}
      {doc.notes.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setNotesOpen((v) => !v);
          }}
          className="mt-1.5 pl-8 flex items-center gap-1 text-[9px] text-white/40 hover:text-white/60"
        >
          <ChevronDown
            className={[
              'w-3 h-3 transition-transform',
              notesOpen ? 'rotate-180' : '',
            ].join(' ')}
          />
          Notes
        </button>
      )}
      {notesOpen && doc.notes.length > 0 && (
        <ul className="mt-1 pl-8 space-y-0.5">
          {doc.notes.map((n, i) => (
            <li key={i} className="text-[9px] text-white/40 leading-snug">
              {n}
            </li>
          ))}
        </ul>
      )}

      {/* Re-examine */}
      {onReexamine && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReexamine();
          }}
          className="mt-2 ml-8 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/50 hover:text-white/70 transition-colors"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          Re-examine
        </button>
      )}
    </div>
  );
}
