import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FileSpreadsheet,
  FileType2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { NeuralButton } from '@/core/components/NeuralButton';
import {
  validateFile,
  parseDocument,
  formatFileSize,
  fileTypeLabel,
  ACCEPTED_FILE_STRING,
  type DocumentParseResult,
  type DocumentFileType,
} from '../services/scout-document-service';

// ---------------------------------------------------------------------------
// Types & State Machine
// ---------------------------------------------------------------------------

type UploadPhase =
  | 'idle'
  | 'drag_over'
  | 'validating'
  | 'invalid'
  | 'parsing'
  | 'ready'
  | 'submitting';

interface ScoutUploadZoneProps {
  onSubmit: (result: DocumentParseResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// File Type Icon Mapping
// ---------------------------------------------------------------------------

function FileTypeIcon({ fileType, className }: { fileType: DocumentFileType; className?: string }) {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScoutUploadZone({ onSubmit, onCancel }: ScoutUploadZoneProps) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<DocumentParseResult | null>(null);
  const [parseProgress, setParseProgress] = useState<{ current: number; total: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const reducedMotion = useReducedMotion();

  // ---- File Processing Pipeline ----

  const processFile = useCallback(async (file: File) => {
    // Validate
    setPhase('validating');
    setError(null);
    setParseResult(null);
    setParseProgress(null);

    const validation = validateFile(file);
    if (!validation.valid) {
      setPhase('invalid');
      setError(validation.error);
      return;
    }

    // Parse
    setPhase('parsing');
    try {
      const result = await parseDocument(file, (current, total) => {
        setParseProgress({ current, total });
      });
      setParseResult(result);
      setPhase('ready');
    } catch (err) {
      console.error('[ScoutUploadZone] Parse failed:', err);
      setPhase('invalid');
      setError('Failed to parse document. The file may be corrupted or password-protected.');
    }
  }, []);

  // ---- Drag & Drop Handlers ----

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setPhase('drag_over');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setPhase((prev) => (prev === 'drag_over' ? 'idle' : prev));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      } else {
        setPhase('idle');
      }
    },
    [processFile]
  );

  // ---- File Input Handler ----

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [processFile]
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleBrowseClick();
      }
    },
    [handleBrowseClick]
  );

  // ---- Submit Handler ----

  const handleSubmit = useCallback(() => {
    if (parseResult) {
      setPhase('submitting');
      onSubmit(parseResult);
    }
  }, [parseResult, onSubmit]);

  // ---- Reset ----

  const handleReset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setParseResult(null);
    setParseProgress(null);
    dragCounterRef.current = 0;
  }, []);

  // ---- Animation Variants ----

  const motionConfig = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 300, damping: 24 };

  const shakeAnimation = reducedMotion
    ? {}
    : { x: [0, -6, 6, -6, 6, -3, 3, 0], transition: { duration: 0.5 } };

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_STRING}
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Select document file"
        tabIndex={-1}
      />

      {/* Drop Zone */}
      <AnimatePresence mode="wait">
        {(phase === 'idle' || phase === 'drag_over') && (
          <NeuralButton
            key="dropzone"
            as="div"
            variant="ghost"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={motionConfig}
            role="button"
            tabIndex={0}
            aria-label="Drop zone. Click or press Enter to browse files. Drag and drop a document here."
            onKeyDown={handleKeyDown}
            onClick={handleBrowseClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              'relative w-full min-h-[200px] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-4 p-8 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05050a]',
              phase === 'drag_over'
                ? 'border-[var(--module-accent-ring)] bg-[var(--module-accent-muted)] scale-[1.01]'
                : 'border-white/[0.12] bg-white/[0.045] hover:border-[var(--module-accent-border)] hover:bg-[var(--module-accent-faint)]'
            )}
          >
            {/* Animated upload icon */}
            <motion.div
              animate={
                phase === 'drag_over'
                  ? { scale: 1.15, y: -4 }
                  : { scale: 1, y: 0 }
              }
              transition={motionConfig}
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center border transition-colors duration-300',
                phase === 'drag_over'
                  ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-glow)]'
                  : 'border-white/[0.12] bg-white/[0.045] group-hover:border-[var(--module-accent-border)] group-hover:bg-[var(--module-accent-muted)]'
              )}
            >
              <Upload
                className={cn(
                  'w-7 h-7 transition-colors duration-300',
                  phase === 'drag_over'
                    ? 'text-[var(--module-color-400)]'
                    : 'text-white/30 group-hover:text-[var(--module-color-400)]'
                )}
                aria-hidden="true"
              />
            </motion.div>

            <div className="text-center space-y-2">
              <p className="text-sm font-semibold text-white/70">
                {phase === 'drag_over' ? 'Drop to upload' : 'Drag & drop an evidence source'}
              </p>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/30 italic">
                PDF • TXT • CSV • Markdown — Max 10 MB
              </p>
            </div>

            {phase !== 'drag_over' && (
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--module-color-400)] opacity-50 italic mt-2">
                or click to browse
              </span>
            )}
          </NeuralButton>
        )}

        {/* Validation Error State */}
        {phase === 'invalid' && error && (
          <motion.div
            key="error"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, ...shakeAnimation }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            className="w-full rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-6 space-y-4"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-red-500/20 bg-red-500/10 shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-400" aria-hidden="true" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-bold text-red-300">Upload Failed</p>
                <p className="text-xs text-red-200/70 leading-relaxed">{error}</p>
              </div>
            </div>
            <NeuralButton
              variant="secondary"
              size="sm"
              onClick={handleReset}
              aria-label="Try uploading a different file"
            >
              Try Again
            </NeuralButton>
          </motion.div>
        )}

        {/* Parsing Progress State */}
        {phase === 'parsing' && (
          <motion.div
            key="parsing"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            className="w-full rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] p-6 space-y-4"
            role="status"
            aria-live="polite"
            aria-label={
              parseProgress
                ? `Parsing page ${parseProgress.current} of ${parseProgress.total}`
                : 'Parsing document'
            }
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] shrink-0">
                <Loader2 className="w-6 h-6 text-[var(--module-color-400)] animate-spin" aria-hidden="true" />
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <p className="text-sm font-bold text-[var(--module-color-300)]">Parsing Document…</p>
                {parseProgress && (
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--module-color-300)] italic">
                    Page {parseProgress.current} / {parseProgress.total}
                  </p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {parseProgress && (
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--module-color-500)] to-[var(--module-color-400)]"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.round((parseProgress.current / parseProgress.total) * 100)}%`,
                  }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* Ready / Preview State */}
        {phase === 'ready' && parseResult && (
          <motion.div
            key="preview"
            initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={motionConfig}
            className="w-full rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] p-6 space-y-5"
          >
            {/* Document preview header */}
            <div className="flex items-start gap-4">
              <motion.div
                initial={reducedMotion ? false : { scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }
                }
                className="w-14 h-14 rounded-xl flex items-center justify-center border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] shrink-0"
              >
                <FileTypeIcon
                  fileType={parseResult.metadata.fileType}
                  className="w-7 h-7 text-[var(--module-color-400)]"
                />
              </motion.div>

              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-bold text-white truncate" title={parseResult.metadata.filename}>
                  {parseResult.metadata.filename}
                </p>
                {parseResult.metadata.extractedTitle && (
                  <p
                    className="text-xs text-[var(--module-color-300)] italic truncate"
                    title={parseResult.metadata.extractedTitle}
                  >
                    "{parseResult.metadata.extractedTitle}"
                  </p>
                )}
              </div>

              <NeuralButton
                variant="secondary"
                onClick={handleReset}
                className="w-8 h-8 p-0 flex items-center justify-center shrink-0 border-white/[0.12] bg-white/[0.045] hover:bg-white/10"
                aria-label="Remove file and select a different one"
              >
                <X className="w-4 h-4 text-white/50" />
              </NeuralButton>
            </div>

            {/* Metadata chips */}
            <div className="flex flex-wrap gap-2" role="list" aria-label="Document metadata">
              <MetadataChip
                role="listitem"
                label={fileTypeLabel(parseResult.metadata.fileType)}
              />
              <MetadataChip
                role="listitem"
                label={formatFileSize(parseResult.metadata.fileSize)}
              />
              {parseResult.metadata.pageCount !== null && (
                <MetadataChip
                  role="listitem"
                  label={`${parseResult.metadata.pageCount} page${parseResult.metadata.pageCount !== 1 ? 's' : ''}`}
                />
              )}
              <MetadataChip
                role="listitem"
                label={`${parseResult.metadata.wordCount.toLocaleString()} words`}
              />
            </div>

            {/* Parser notes */}
            {parseResult.notes.length > 0 && (
              <div className="text-[11px] text-white/30 italic space-y-0.5" aria-label="Parser notes">
                {parseResult.notes.map((note, i) => (
                  <p key={i}>• {note}</p>
                ))}
              </div>
            )}

            {/* Success indicator */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reducedMotion ? { duration: 0 } : { delay: 0.2 }}
              className="flex items-center gap-2 text-[var(--module-color-400)]"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span className="text-[11px] font-black uppercase tracking-[0.3em] italic">
                Ready for analysis
              </span>
            </motion.div>
          </motion.div>
        )}

        {/* Submitting State */}
        {phase === 'submitting' && (
          <motion.div
            key="submitting"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full rounded-2xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] p-6 flex items-center gap-4"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-5 h-5 text-[var(--module-color-400)] animate-spin" aria-hidden="true" />
            <span className="text-xs font-bold text-[var(--module-color-300)]">
              Submitting to Scout for analysis…
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <NeuralButton variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </NeuralButton>
        {phase === 'ready' && parseResult && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
          >
            <NeuralButton
              variant="primary"
              size="md"
              onClick={handleSubmit}
              className="bg-[var(--module-accent)] hover:bg-[var(--module-accent-hover)] shadow-[var(--module-accent-shadow)] border-[var(--module-accent-border)]"
            >
              Submit for Analysis
            </NeuralButton>
          </motion.div>
        )}
        {phase === 'invalid' && (
          <NeuralButton variant="secondary" size="sm" onClick={handleReset}>
            Try Again
          </NeuralButton>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetadataChip({
  label,
  role: roleProp,
}: {
  label: string;
  role?: React.AriaRole;
}) {
  return (
    <span
      role={roleProp}
      className="px-3 py-1 rounded-full border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)] text-[11px] font-bold text-[var(--module-color-300)] uppercase tracking-wider"
    >
      {label}
    </span>
  );
}
