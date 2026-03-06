import React from 'react';
import { motion } from 'framer-motion';
import { FileText, FileSpreadsheet, FileType2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { DocumentFileType, DocumentMetadata } from '../services/scout-document-service';
import { formatFileSize, fileTypeLabel } from '../services/scout-document-service';

// ---------------------------------------------------------------------------
// ScoutDocumentCard
// ---------------------------------------------------------------------------
// A compact card component for displaying uploaded document metadata.
// Used in the ScoutDashboard evidence sources section and potentially
// as a reusable reference card anywhere document info is needed.
//
// Accessibility:
//   - Uses semantic elements (article, heading levels)
//   - All icons are aria-hidden with text alternatives provided
//   - Adequate color contrast (lime-300 on dark bg ≥ 4.5:1)
//   - Interactive elements are keyboard-focusable
// ---------------------------------------------------------------------------

interface ScoutDocumentCardProps {
  metadata: DocumentMetadata;
  claimCount?: number;
  className?: string;
  /** Optional delay for staggered entrance animation (in seconds) */
  animationDelay?: number;
}

function FileIcon({ fileType, className }: { fileType: DocumentFileType; className?: string }) {
  switch (fileType) {
    case 'pdf':
      return <FileText className={className} aria-hidden="true" />;
    case 'csv':
      return <FileSpreadsheet className={className} aria-hidden="true" />;
    case 'md':
      return <FileType2 className={className} aria-hidden="true" />;
    default:
      return <FileText className={className} aria-hidden="true" />;
  }
}

export function ScoutDocumentCard({
  metadata,
  claimCount,
  className,
  animationDelay = 0,
}: ScoutDocumentCardProps) {
  const reducedMotion = useReducedMotion();

  const formattedDate = new Date(metadata.parsedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 280, damping: 22, delay: animationDelay }
      }
      className={cn(
        'rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 space-y-3 group hover:border-lime-500/20 hover:bg-lime-500/[0.02] transition-colors duration-300',
        className
      )}
      aria-label={`Document: ${metadata.filename}`}
    >
      {/* Header row: icon + filename + type badge */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-lime-500/15 bg-lime-500/[0.08] shrink-0">
          <FileIcon fileType={metadata.fileType} className="w-5 h-5 text-lime-400" />
        </div>

        <div className="flex-1 min-w-0 space-y-0.5">
          <h4
            className="text-xs font-bold text-white truncate"
            title={metadata.filename}
          >
            {metadata.filename}
          </h4>
          {metadata.extractedTitle && (
            <p
              className="text-[10px] text-lime-300/50 italic truncate"
              title={metadata.extractedTitle}
            >
              {metadata.extractedTitle}
            </p>
          )}
        </div>

        {/* File type badge */}
        <span className="px-2 py-0.5 rounded-md border border-lime-500/10 bg-lime-500/[0.06] text-[8px] font-black uppercase tracking-widest text-lime-400/70 shrink-0">
          {metadata.fileType.toUpperCase()}
        </span>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] text-white/35 font-semibold uppercase tracking-wider">
        <span>{formatFileSize(metadata.fileSize)}</span>
        {metadata.pageCount !== null && (
          <>
            <span aria-hidden="true">•</span>
            <span>{metadata.pageCount} pg{metadata.pageCount !== 1 ? 's' : ''}</span>
          </>
        )}
        <span aria-hidden="true">•</span>
        <span>{metadata.wordCount.toLocaleString()} words</span>
        {claimCount !== undefined && claimCount > 0 && (
          <>
            <span aria-hidden="true">•</span>
            <span className="text-lime-400/60">
              {claimCount} claim{claimCount !== 1 ? 's' : ''} extracted
            </span>
          </>
        )}
      </div>

      {/* Footer: date */}
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-white/20 italic tracking-wider">
          {formattedDate}
        </span>
      </div>
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// ScoutDocumentCardCompact — for inline use in lists / dashboards
// ---------------------------------------------------------------------------

interface ScoutDocumentCardCompactProps {
  filename: string;
  fileType?: DocumentFileType;
  claimCount?: number;
  className?: string;
}

export function ScoutDocumentCardCompact({
  filename,
  fileType = 'txt',
  claimCount,
  className,
}: ScoutDocumentCardCompactProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors',
        className
      )}
      role="listitem"
      aria-label={`Source: ${filename}`}
    >
      <FileIcon fileType={fileType} className="w-4 h-4 text-lime-400/60 shrink-0" />
      <span className="text-[10px] text-white/60 truncate flex-1 font-medium" title={filename}>
        {filename}
      </span>
      {claimCount !== undefined && claimCount > 0 && (
        <span className="text-[9px] text-lime-400/50 font-bold shrink-0">
          {claimCount}
        </span>
      )}
    </div>
  );
}
