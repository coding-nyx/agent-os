/**
 * DiagnosisResultsScreen
 *
 * Full scrollable list of extracted health fields grouped by category.
 * Each item has a checkbox, confidence badge, value, unit, and reference range.
 * Maintains local selection state initialised to all item IDs.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square, FlaskConical, X, AlertCircle } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { ExtractedDataItem } from '@/core/diagnosis/types';
import { MedicalImageAnalysisResult } from './MedicalImageAnalysisResult';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DiagnosisResultsScreenProps {
  sessionId: string;
  detectedPanels: string[];
  items: ExtractedDataItem[];
  onSelectionChange: (selectedIds: string[]) => void;
  onClose: () => void;
  isProcessing?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map ExtractedDataItem to a common display format. */
interface DisplayField {
  id: string;
  name: string;
  value: string | number;
  unit?: string;
  referenceRange?: string;
  confidence: number;
  category?: string;
}

function mapItemToDisplay(item: ExtractedDataItem): DisplayField {
  const data = item.data;
  return {
    id: item.id,
    name: String(data.name || data.fieldName || item.label),
    value: String(data.value ?? ''),
    unit: typeof data.unit === 'string' ? data.unit : undefined,
    referenceRange: typeof data.referenceRange === 'string' ? data.referenceRange : undefined,
    confidence: typeof data.confidence === 'number' ? data.confidence : 1.0,
    category: typeof data.category === 'string' ? data.category : item.type
  };
}

/** Convert camelCase to human-readable label: "totalCholesterol" → "Total Cholesterol" */
function humanise(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s/, '')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

type ConfidenceLevel = 'high' | 'medium' | 'low';

function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; className: string }> = {
  high:   { label: 'High',          className: 'bg-[var(--module-accent-glow)] border-[var(--module-accent-border)] text-[var(--module-color-300)]' },
  medium: { label: 'Medium',        className: 'bg-amber-500/20 border-amber-500/30 text-amber-300' },
  low:    { label: 'Low ~ inferred', className: 'bg-red-500/20 border-red-500/30 text-red-300' },
};

/** Human-readable category label map. */
const CATEGORY_LABELS: Record<string, string> = {
  lipid_panel:   'Lipid Panel',
  cbc:           'CBC (Complete Blood Count)',
  metabolic:     'Metabolic Panel',
  thyroid:       'Thyroid',
  hormone:       'Hormones',
  renal:         'Renal',
  liver:         'Liver Function',
  cardiac:       'Cardiac',
  imaging:       'Imaging',
  vitals:        'Vitals',
  medication:    'Medications',
  allergy:       'Allergies',
  condition:     'Conditions',
  clearance:     'Clearances',
  medical_image_analysis: 'Medical Imaging',
  other:         'Other',
};

function categoryLabel(cat: string | undefined): string {
  if (!cat) return 'Other';
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const level = confidenceLevel(confidence);
  const { label, className } = CONFIDENCE_CONFIG[level];
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide',
      className,
    )}>
      {label}
    </span>
  );
}

function FieldRow({
  field,
  selected,
  onToggle,
}: {
  field: DisplayField;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      onClick={() => onToggle(field.id)}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-3.5 rounded-xl transition-colors text-left',
        'min-h-[56px]', // Ensure comfortable tap height
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/50',
        selected ? 'bg-white/[0.04]' : 'bg-transparent hover:bg-white/[0.02] active:bg-white/[0.04]',
      )}
      aria-pressed={selected}
      aria-label={`${humanise(field.name)}: ${field.value}${field.unit ? ` ${field.unit}` : ''}${selected ? ' (selected)' : ''}`}
    >
      {/* Checkbox indicator */}
      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center mt-0.5">
        {selected
          ? <CheckSquare className="w-5 h-5 text-[var(--module-color-400)]" />
          : <Square className="w-5 h-5 text-white/30" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-white/90 truncate">
            {humanise(field.name)}
          </p>
          <ConfidenceBadge confidence={field.confidence} />
        </div>

        <p className="text-base font-bold text-white">
          {String(field.value)}
          {field.unit && (
            <span className="text-xs font-normal text-white/40 ml-1">{field.unit}</span>
          )}
        </p>

        {field.referenceRange && (
          <p className="text-xs text-white/30">
            Ref: {field.referenceRange}
          </p>
        )}
      </div>
    </motion.button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DiagnosisResultsScreen({
  sessionId: _sessionId,
  detectedPanels,
  items,
  onSelectionChange,
  onClose,
  isProcessing = false,
}: DiagnosisResultsScreenProps) {
  // Build stable IDs once so they don't change between renders.
  const fields = useMemo(
    () => items.map(mapItemToDisplay),
    [items],
  );

  const allIds = useMemo(() => fields.map((f) => f.id), [fields]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(allIds));

  const handleToggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange(Array.from(next));
        return next;
      });
    },
    [onSelectionChange],
  );

  const handleSelectAll = useCallback(() => {
    const next = new Set(allIds);
    setSelectedIds(next);
    onSelectionChange(allIds);
  }, [allIds, onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
    onSelectionChange([]);
  }, [onSelectionChange]);

  // Group fields by category, preserving category insertion order.
  const grouped = useMemo(() => {
    const map = new Map<string, DisplayField[]>();
    for (const field of fields) {
      const key = field.category ?? 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(field);
    }
    return Array.from(map.entries());
  }, [fields]);

  const selectedCount = selectedIds.size;
  const totalCount    = fields.length;
  const isEmpty       = totalCount === 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-3 sm:px-4 pt-3 sm:pt-4 pb-2.5 sm:pb-3 border-b border-white/10 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical className="w-4 sm:w-5 h-4 sm:h-5 text-[var(--module-color-400)] flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">Diagnosis Results</h2>
          </div>
          <NeuralButton
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isProcessing}
            className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label="Close results"
          >
            <X className="w-4 h-4" />
          </NeuralButton>
        </div>

        {/* Detected panel chips */}
        {detectedPanels.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Detected panels">
            {detectedPanels.map((panel) => (
              <span
                key={panel}
                className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)] text-[10px] sm:text-[11px] font-medium"
              >
                {panel}
              </span>
            ))}
          </div>
        )}

        {/* Selection controls */}
        {!isEmpty && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs text-white/50">
              {selectedCount} of {totalCount} selected
            </p>
            <div className="flex gap-2 sm:gap-3">
              <NeuralButton
                type="button"
                variant="ghost"
                themeColor="module"
                onClick={handleSelectAll}
                className="text-[11px] sm:text-xs text-[var(--module-color-400)] hover:text-[var(--module-color-300)] transition-colors px-2 py-1 min-h-[36px]"
              >
                Select all
              </NeuralButton>
              <NeuralButton
                type="button"
                variant="ghost"
                onClick={handleDeselectAll}
                className="text-[11px] sm:text-xs text-white/40 hover:text-white/60 transition-colors px-2 py-1 min-h-[36px]"
              >
                None
              </NeuralButton>
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable field list ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 space-y-4">
        {isProcessing && isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center animate-pulse">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-t-transparent border-white/40 rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white/60">Analyzing Document...</p>
              <p className="text-xs text-white/30 mt-1">Extracting structured data and clinical insights.</p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-white/20" />
            </div>
            <p className="text-sm font-semibold text-white/40">No structured data extracted</p>
            <p className="text-xs text-white/25">
              No structured data could be extracted from this document. Try a different file or adjust the document content.
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {grouped.map(([category, itemsInGroup]) => (
              <section key={category}>
                {/* Group header */}
                <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-black/40 backdrop-blur-sm z-10 rounded-lg mb-1">
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">
                    {categoryLabel(category)}
                  </h3>
                  <span className="text-[10px] text-white/25 font-medium">
                    {itemsInGroup.length}
                  </span>
                </div>

                {/* Field rows */}
                <div className="space-y-0.5">
                  {itemsInGroup.map((field) => {
                     // Check if this is a medical image analysis item
                     // We need to find the original item to pass full data
                     const originalItem = items.find(i => i.id === field.id);
                     if (originalItem && originalItem.type === 'medical_image_analysis') {
                       return (
                         <div key={field.id} className="mb-2">
                           <MedicalImageAnalysisResult 
                             item={originalItem} 
                             selected={selectedIds.has(field.id)}
                             onToggle={handleToggle}
                           />
                         </div>
                       );
                     }
                     
                     return (
                      <FieldRow
                        key={field.id}
                        field={field}
                        selected={selectedIds.has(field.id)}
                        onToggle={handleToggle}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Sticky footer ── */}
      <div className="flex-shrink-0 px-3 sm:px-4 py-3 sm:py-4 border-t border-white/10 bg-black/40 backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <NeuralButton
          onClick={onClose}
          disabled={isProcessing}
          themeColor="module"
          variant="secondary"
          className="w-full min-h-[48px]"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-[var(--module-color-400)]/40 border-t-[var(--module-color-400)] rounded-full animate-spin" />
              Processing…
            </span>
          ) : (
            'Close Diagnosis'
          )}
        </NeuralButton>
      </div>
    </div>
  );
}
