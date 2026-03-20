/**
 * DiagnosisUploadZone
 *
 * Large drag-and-drop upload zone for the Soma diagnosis flow.
 * Validates file size (≤15 MB) and MIME type before calling onFileSelected.
 * Shows animated emerald progress bar while uploading.
 */

import React, { useRef, useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Table, Image, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/jpg',
]);

const ACCEPTED_EXTENSIONS = ['.pdf', '.csv', '.txt', '.jpg', '.jpeg', '.png'];

const FILE_TYPE_CHIPS: Array<{
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { label: 'PDF',   icon: FileText, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { label: 'CSV',   icon: Table,    color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  { label: 'TXT',   icon: FileText, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { label: 'Image', icon: Image,    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiagnosisUploadZoneProps {
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;  // 0-100
  error?: string | null;
  disabled?: boolean;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 15 MB.`;
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const isMimeValid = ACCEPTED_MIME_TYPES.has(file.type);
  const isExtValid  = ACCEPTED_EXTENSIONS.includes(ext);

  if (!isMimeValid && !isExtValid) {
    return `Unsupported file type. Please upload a PDF, CSV, TXT, or image file.`;
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiagnosisUploadZone({
  onFileSelected,
  isUploading = false,
  uploadProgress = 0,
  error = null,
  disabled = false,
}: DiagnosisUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  const isDisabled = disabled || isUploading;

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setLocalError(validationError);
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 400);
        return;
      }
      setLocalError(null);
      onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!isDisabled) setIsDragOver(true);
    },
    [isDisabled],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (isDisabled) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [isDisabled, handleFile],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // reset input so the same file can be reselected after an error
      e.target.value = '';
    },
    [handleFile],
  );

  const handleZoneClick = useCallback(() => {
    if (!isDisabled) inputRef.current?.click();
  }, [isDisabled]);

  const displayError = localError ?? error;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <motion.div
        onClick={handleZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{
          scale: isDragOver ? 1.02 : 1,
          borderColor: isDragOver
            ? 'rgba(52,211,153,0.6)'
            : isDisabled
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(255,255,255,0.15)',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed',
          'bg-black/20 backdrop-blur p-8 min-h-[220px]',
          'transition-colors',
          isDisabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:border-[var(--module-accent-border)] hover:bg-[var(--module-accent-faint)]',
          isDragOver && 'bg-[var(--module-accent-muted)]',
          isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]',
        )}
        role="button"
        aria-label="Upload medical document"
        tabIndex={isDisabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && handleZoneClick()}
      >
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          onChange={handleInputChange}
          disabled={isDisabled}
          aria-label="Upload medical document"
          aria-hidden="true"
        />

        {/* Upload icon */}
        <motion.div
          animate={{ y: isDragOver ? -6 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className={cn(
            'w-16 h-16 rounded-2xl flex items-center justify-center',
            'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]',
          )}
        >
          <Upload className="w-8 h-8 text-[var(--module-color-400)]" />
        </motion.div>

        {/* Text */}
        <div className="text-center">
          <p className="text-sm font-semibold text-white/80">
            {isDragOver ? 'Drop to upload' : 'Drag & drop your document'}
          </p>
          <p className="text-xs text-white/40 mt-1">
            or <span className="text-[var(--module-color-400)] underline-offset-2 underline">click to browse</span>
          </p>
        </div>

        {/* File type chips */}
        <div className="flex flex-wrap justify-center gap-2" role="list" aria-label="Supported file types">
          {FILE_TYPE_CHIPS.map(({ label, icon: Icon, color }) => (
            <span
              key={label}
              role="listitem"
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold',
                color,
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-white/25">Max file size: 15 MB</p>

        {/* Upload progress overlay */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              key="upload-progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/60 backdrop-blur-sm"
            >
              <p className="text-sm font-semibold text-[var(--module-color-400)]">Uploading…</p>
              <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--module-accent)] rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
                />
              </div>
              <p className="text-xs text-white/50">{Math.round(uploadProgress)}%</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Error banner */}
      <AnimatePresence>
        {displayError && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300 flex-1">{displayError}</p>
            <NeuralButton
              variant="ghost"
              onClick={() => setLocalError(null)}
              className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 -m-2"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </NeuralButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
