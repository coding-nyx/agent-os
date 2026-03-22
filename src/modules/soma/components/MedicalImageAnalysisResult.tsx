import React from 'react';
import { motion } from 'framer-motion';
import { FileImage, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractedDataItem } from '@/core/diagnosis/types';

interface MedicalImageAnalysisResultProps {
  item: ExtractedDataItem;
  selected?: boolean;
  onToggle?: (id: string) => void;
}

export function MedicalImageAnalysisResult({
  item,
  selected = false,
  onToggle
}: MedicalImageAnalysisResultProps) {
  const data = item.data;
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const flags = Array.isArray(data.clinicalFlags) ? data.clinicalFlags : [];
  const impression = typeof data.impression === 'string' ? data.impression : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 transition-all',
        selected 
          ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]' 
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-black/20 flex items-center justify-center text-[var(--module-color-400)]">
            <FileImage className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {String(data.modality || 'Medical Image')}
            </h3>
            <p className="text-xs text-white/50">
              {String(data.bodyPart || 'Unknown Body Part')} • {String(data.reportType || 'Analysis')}
            </p>
          </div>
        </div>

        {onToggle && (
          <button
            onClick={() => onToggle(item.id)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md border transition-all',
              selected
                ? 'border-[var(--module-accent-border)] bg-[var(--module-accent)] text-white'
                : 'border-white/10 bg-white/5 text-white/20'
            )}
          >
            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
          </button>
        )}
      </div>

      {/* Impression */}
      {impression && (
        <div className="mb-3 rounded-lg bg-black/20 p-3 border border-white/5">
          <p className="text-[10px] font-bold text-white/40 mb-1 uppercase tracking-wider">
            Clinical Impression
          </p>
          <p className="text-sm font-medium text-white/90 leading-relaxed">
            {impression}
          </p>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
            Detailed Findings
          </p>
          <ul className="space-y-1.5 pl-1">
            {findings.map((finding: unknown, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-white/30 flex-shrink-0" />
                <span>{String(finding)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clinical Flags */}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {flags.map((flag: any, i: number) => (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border',
                flag.severity === 'severe' || flag.severity === 'high'
                  ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : flag.severity === 'moderate'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              {flag.flag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
