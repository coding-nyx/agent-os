/**
 * DiagnosisDocumentPreview
 * 
 * Shows a preview of the uploaded document during diagnosis.
 * Supports images (full preview) and shows file info for other types.
 * Collapsible to save space on mobile.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  X,
  ZoomIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentParseResult } from '@/lib/services/doc-ingest-service';

interface DiagnosisDocumentPreviewProps {
  /** Document metadata from parsing */
  docInfo: DocumentParseResult['metadata'] | null;
  /** Preview URL for images (object URL) */
  previewUrl: string | null;
  /** Optional className */
  className?: string;
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  csv: FileSpreadsheet,
  txt: FileText,
  md: FileText,
  unknown: FileText,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DiagnosisDocumentPreview({
  docInfo,
  previewUrl,
  className,
}: DiagnosisDocumentPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

  if (!docInfo) return null;

  const Icon = FILE_TYPE_ICONS[docInfo.fileType] || FileText;
  const isImage = docInfo.fileType === 'image';
  const hasPreview = isImage && previewUrl;

  return (
    <>
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden', className)}>
        {/* Header - always visible */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-[var(--module-color-400)]" />
          </div>
          
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-white/90 truncate">
              {docInfo.extractedTitle || docInfo.filename}
            </p>
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <span className="uppercase">{docInfo.fileType}</span>
              <span>•</span>
              <span>{formatFileSize(docInfo.fileSize)}</span>
              {docInfo.pageCount && docInfo.pageCount > 1 && (
                <>
                  <span>•</span>
                  <span>{docInfo.pageCount} pages</span>
                </>
              )}
              {docInfo.wordCount > 0 && (
                <>
                  <span>•</span>
                  <span>{docInfo.wordCount.toLocaleString()} words</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {hasPreview && (
              <span className="text-[9px] text-white/30 uppercase tracking-wider mr-1">
                {isExpanded ? 'Hide' : 'Preview'}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-white/30" />
            ) : (
              <ChevronDown className="w-4 h-4 text-white/30" />
            )}
          </div>
        </button>

        {/* Preview content - collapsible */}
        <AnimatePresence>
          {isExpanded && hasPreview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3">
                <div 
                  className="relative rounded-lg overflow-hidden bg-black/40 border border-white/5 cursor-pointer group"
                  onClick={() => setIsZoomed(true)}
                >
                  <img
                    src={previewUrl}
                    alt={docInfo.filename}
                    className="w-full h-auto max-h-[200px] object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
                      <ZoomIn className="w-4 h-4 text-white" />
                      <span className="text-xs text-white font-medium">View Full</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Full-screen zoom modal */}
      <AnimatePresence>
        {isZoomed && hasPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setIsZoomed(false)}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={previewUrl}
              alt={docInfo.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm">
              <p className="text-sm text-white/70">{docInfo.filename}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
