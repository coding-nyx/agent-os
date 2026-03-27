import { useMemo, useRef } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import {
  Microscope,
  FileUp,
  FileText,
  FlaskConical,
  Pill,
  AlertTriangle,
  TrendingUp,
  Receipt,
  Tag,
  BookOpen,
  Quote,
  Activity,
} from 'lucide-react';
import type { DiagnosisSpecialization, ExtractedDataBag, ExtractedDataItem, DiagnosisSessionPhase } from '../types';
import type { DocumentRecord } from '@/lib/types';
import { DiagnosisDocumentCard } from './DiagnosisDocumentCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiagnosisSidebarProps {
  spec: DiagnosisSpecialization;
  phase: DiagnosisSessionPhase;
  summaryLines: string[];
  extractedData: ExtractedDataBag;
  documents: DocumentRecord[];
  onUpload?: (file: File) => void;
  onReexamineDoc?: (doc: DocumentRecord) => void;
}

// Map extracted item types to icons
const ITEM_TYPE_ICONS: Record<string, typeof FlaskConical> = {
  biomarker: FlaskConical,
  lab_summary: FileText,
  clearance: Activity,
  condition: AlertTriangle,
  medication: Pill,
  allergy: AlertTriangle,
  transaction: Receipt,
  anomaly: AlertTriangle,
  category_rule: Tag,
  financial_summary: TrendingUp,
  finding: BookOpen,
  citation: Quote,
  summary: FileText,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiagnosisSidebar({
  spec,
  phase,
  summaryLines,
  extractedData,
  documents,
  onUpload,
  onReexamineDoc,
}: DiagnosisSidebarProps) {
  const prefersReduced = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Group extracted items by type for the summary view
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ExtractedDataItem[]>();
    for (const item of extractedData.items) {
      const list = groups.get(item.type) || [];
      list.push(item);
      groups.set(item.type, list);
    }
    return groups;
  }, [extractedData.items]);

  const hasExtracted = extractedData.items.length > 0;
  const hasSummary = summaryLines.length > 0;
  const hasDocuments = documents.length > 0;

  return (
    <div className="hidden lg:flex w-64 shrink-0 border-r border-white/[0.09] bg-white/[0.045] flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.09]">
        <div className="flex items-center gap-2">
          <Microscope className="w-4 h-4 text-white/40" />
          <span className="text-[11px] font-bold text-white/70 uppercase tracking-[0.1em]">
            {spec.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${phase === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">
            {phase === 'active' ? 'Active Session' : phase === 'reviewing' ? 'Reviewing' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
        {/* Live Summary */}
        {hasSummary && (
          <div className="px-4 py-3 border-b border-white/[0.09]">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-2">
              Analysis Progress
            </p>
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {summaryLines.map((line, i) => (
                  <motion.p
                    key={i}
                    initial={prefersReduced ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-[11px] text-white/50 leading-relaxed"
                  >
                    <span className="text-white/20 mr-1.5">{i + 1}.</span>
                    {line}
                  </motion.p>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Extracted Data Summary */}
        {hasExtracted && (
          <div className="px-4 py-3 border-b border-white/[0.09]">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-2">
              Extracted Data
              <span className="ml-1.5 text-white/50 bg-white/[0.045] px-1.5 py-0.5 rounded">
                {extractedData.items.length}
              </span>
            </p>
            <div className="space-y-1">
              {Array.from(groupedItems.entries()).map(([type, items]) => {
                const Icon = ITEM_TYPE_ICONS[type] ?? FileText;
                return (
                  <div
                    key={type}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.045] border border-white/[0.09]"
                  >
                    <Icon className="w-3 h-3 text-white/30 shrink-0" />
                    <span className="text-[11px] text-white/60 capitalize flex-1 min-w-0 truncate">
                      {type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-bold text-white/40 bg-white/[0.045] px-1.5 py-0.5 rounded shrink-0">
                      {items.length}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Individual items (collapsed by default, show labels) */}
            <div className="mt-2 space-y-0.5">
              {extractedData.items.slice(-5).map((item) => {
                const Icon = ITEM_TYPE_ICONS[item.type] ?? FileText;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-1.5 pl-1"
                  >
                    <Icon className="w-2.5 h-2.5 text-white/20 mt-0.5 shrink-0" />
                    <span className="text-[11px] text-white/40 leading-snug truncate">
                      {item.label}
                    </span>
                  </div>
                );
              })}
              {extractedData.items.length > 5 && (
                <p className="text-[11px] text-white/25 pl-4 italic">
                  +{extractedData.items.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Documents */}
        {hasDocuments && (
          <div className="px-3 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/30 mb-2 px-1">
              Documents
            </p>
            <div className="space-y-2">
              {documents.map((doc) => (
                <DiagnosisDocumentCard
                  key={doc.id}
                  doc={doc}
                  isActive={false}
                  onReexamine={
                    onReexamineDoc ? () => onReexamineDoc(doc) : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no data yet */}
        {!hasSummary && !hasExtracted && !hasDocuments && phase === 'active' && (
          <div className="px-4 py-8 text-center">
            <p className="text-[11px] text-white/25 italic">
              Upload a document or ask a question to begin analysis.
            </p>
          </div>
        )}
      </div>

      {/* Upload footer */}
      {onUpload && (
        <div className="shrink-0 p-3 border-t border-white/[0.09]">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.045] text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 hover:text-white/70 hover:bg-white/8 transition-colors"
          >
            <FileUp className="w-3 h-3" />
            Upload Document
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={spec.supportedFileTypes.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
