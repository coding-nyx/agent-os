import { motion, useReducedMotion } from 'framer-motion';
import { Upload, FileText, Image, Table, MessageSquare } from 'lucide-react';
import type { DiagnosisEmptyStateConfig } from '../types';

interface DiagnosisEmptyStateProps {
  onUploadClick: () => void;
  isDragOver?: boolean;
  config?: DiagnosisEmptyStateConfig;
  themeColor?: string;
}

const DEFAULT_CONFIG: DiagnosisEmptyStateConfig = {
  title: 'Upload a document for AI analysis',
  subtitle: 'Click or drag-and-drop a file here',
  examples: ['Analyze this document', 'Extract key data', 'Summarize findings'],
  supportedTypes: [
    { label: 'PDF', desc: 'Reports & records' },
    { label: 'Image', desc: 'PNG / JPG / WebP' },
    { label: 'CSV', desc: 'Tabular data' },
    { label: 'Text', desc: 'Plain text / Markdown' },
  ],
};

const TYPE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  PDF: FileText,
  Image: Image,
  CSV: Table,
  Text: FileText,
};

export function DiagnosisEmptyState({
  onUploadClick,
  isDragOver,
  config,
  themeColor = 'cyan',
}: DiagnosisEmptyStateProps) {
  const prefersReduced = useReducedMotion();
  const cfg = config ?? DEFAULT_CONFIG;

  // Use neutral white-based colors to stay theme-agnostic
  const borderDrag = 'border-white/40 bg-white/10 scale-[1.005]';
  const borderIdle = 'border-white/10 bg-white/[0.045]';

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={[
        'flex-1 flex flex-col items-center justify-center gap-6 rounded-[24px] border transition-all p-8 min-h-[420px]',
        isDragOver ? borderDrag : borderIdle,
      ].join(' ')}
    >
      {/* Upload zone */}
      <button
        onClick={onUploadClick}
        className="group flex flex-col items-center gap-3 cursor-pointer focus:outline-none"
      >
        <div
          className={[
            'w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center transition-all',
            isDragOver
              ? 'border-white/50 bg-white/15'
              : 'border-white/20 bg-white/[0.045] group-hover:border-white/40 group-hover:bg-white/10',
          ].join(' ')}
        >
          <Upload
            className={[
              'w-7 h-7 transition-transform',
              isDragOver
                ? 'text-white/70 scale-110'
                : 'text-white/40 group-hover:text-white/60 group-hover:scale-110',
            ].join(' ')}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-white/70 group-hover:text-white/90 transition-colors">
            {isDragOver ? 'Drop to analyze' : cfg.title}
          </p>
          {cfg.subtitle && !isDragOver && (
            <p className="text-[11px] text-white/30 mt-0.5">{cfg.subtitle}</p>
          )}
        </div>
      </button>

      {/* Supported types */}
      <div className="flex flex-wrap justify-center gap-2">
        {cfg.supportedTypes.map(({ label, desc }) => {
          const Icon = TYPE_ICONS[label] ?? FileText;
          return (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.09] bg-white/[0.045]"
            >
              <Icon className="w-3 h-3 text-white/30" />
              <span className="text-[11px] font-black uppercase tracking-[0.15em] text-white/50">
                {label}
              </span>
              <span className="text-[11px] text-white/25">{desc}</span>
            </div>
          );
        })}
      </div>

      {/* Example queries */}
      {cfg.examples.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/25">
            Example queries
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {cfg.examples.map((q) => (
              <div
                key={q}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.09] bg-white/[0.045]"
              >
                <MessageSquare className="w-2.5 h-2.5 text-white/25" />
                <span className="text-[11px] text-white/40">{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
