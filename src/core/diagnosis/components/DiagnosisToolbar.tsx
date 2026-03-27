import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  FileUp,
  ShieldCheck,
  ShieldOff,
  Plus,
  Square,
  ChevronDown,
  Microscope,
} from 'lucide-react';
import type { DiagnosisContextPolicy, ExtractedDataBag, DiagnosisSpecialization } from '../types';
import type { ParseProgressEvent } from '@/lib/services/doc-ingest-service';

interface DiagnosisToolbarProps {
  spec: DiagnosisSpecialization;
  contextPolicy: DiagnosisContextPolicy;
  extractedData: ExtractedDataBag;
  isParsing: boolean;
  parseProgress: ParseProgressEvent | null;
  onUpload: (file: File) => void;
  onSetContextPolicy: (policy: DiagnosisContextPolicy) => void;
  onNew: () => void;
  onEnd: () => void;
}

export function DiagnosisToolbar({
  spec,
  contextPolicy,
  extractedData,
  isParsing,
  parseProgress,
  onUpload,
  onSetContextPolicy,
  onNew,
  onEnd,
}: DiagnosisToolbarProps) {
  const prefersReduced = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const themeColor = spec.themeColor ?? 'cyan';

  const itemCount = extractedData.items.length;
  const policyLabel = contextPolicy === 'isolated' ? 'Isolated' : 'With Context';
  const PolicyIcon = contextPolicy === 'isolated' ? ShieldCheck : ShieldOff;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  const togglePolicy = () => {
    onSetContextPolicy(contextPolicy === 'isolated' ? 'with-context' : 'isolated');
  };

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/[0.09] bg-white/[0.045] overflow-x-auto no-scrollbar"
    >
      {/* Label — hidden on mobile to give buttons room */}
      <div className="hidden sm:flex items-center gap-2 mr-auto min-w-0">
        <Microscope className="w-4 h-4 text-white/40 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-white/70 truncate">
          {spec.label}
        </span>
        {itemCount > 0 && (
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 bg-white/[0.045] px-1.5 py-0.5 rounded">
            {itemCount} extracted
          </span>
        )}
      </div>

      {/* Parsing progress */}
      {isParsing && parseProgress && (
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/30 transition-all"
              style={{ width: `${Math.round((parseProgress.current / Math.max(parseProgress.total, 1)) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-white/30">{parseProgress.message}</span>
        </div>
      )}

      {/* Context toggle */}
      <button
        onClick={togglePolicy}
        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.045] text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 hover:text-white/70 hover:bg-white/8 transition-colors shrink-0"
        title={
          contextPolicy === 'isolated'
            ? 'AI cannot see your base profile. Click to enable.'
            : 'AI can see your base profile. Click to disable.'
        }
      >
        <PolicyIcon className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">{policyLabel}</span>
      </button>

      {/* Upload */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isParsing}
        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.045] text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 hover:text-white/70 hover:bg-white/8 transition-colors disabled:opacity-40 shrink-0"
      >
        <FileUp className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">Upload</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={spec.supportedFileTypes.join(',')}
        onChange={handleFileChange}
      />

      {/* New */}
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.045] text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 hover:text-white/70 hover:bg-white/8 transition-colors shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">New</span>
      </button>

      {/* End */}
      <button
        onClick={onEnd}
        className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-red-400/20 bg-red-500/5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-300/60 hover:text-red-200 hover:bg-red-500/10 transition-colors shrink-0"
      >
        <Square className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">End</span>
      </button>
    </motion.div>
  );
}
