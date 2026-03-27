import { useState, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CheckCircle2, XCircle, Package, AlertTriangle } from 'lucide-react';
import type { ExtractedDataBag, ExtractedDataItem, DiagnosisSpecialization } from '../types';

interface DiagnosisMergeDialogProps {
  isOpen: boolean;
  spec: DiagnosisSpecialization;
  extractedData: ExtractedDataBag;
  onMerge: (itemIds: string[]) => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function DiagnosisMergeDialog({
  isOpen,
  spec,
  extractedData,
  onMerge,
  onDiscard,
  onCancel,
}: DiagnosisMergeDialogProps) {
  const prefersReduced = useReducedMotion();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() =>
    new Set(extractedData.items.map((i) => i.id)),
  );

  const isReadOnly = !spec.mergeToBase;
  const checkedCount = checkedIds.size;

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === extractedData.items.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(extractedData.items.map((i) => i.id)));
    }
  };

  // Group items by type for cleaner display
  const grouped = useMemo(() => {
    const map = new Map<string, ExtractedDataItem[]>();
    for (const item of extractedData.items) {
      const group = map.get(item.type) ?? [];
      group.push(item);
      map.set(item.type, group);
    }
    return map;
  }, [extractedData.items]);

  if (!isOpen || extractedData.items.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-[20px] border border-white/10 bg-[#0a0a0f]/95 backdrop-blur-xl shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              <div className="w-8 h-8 rounded-xl bg-white/[0.045] border border-white/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-white/50" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white/90">
                  {isReadOnly ? 'Analysis Summary' : 'Review Extracted Data'}
                </h2>
                <p className="text-[11px] text-white/40">
                  {isReadOnly
                    ? `${extractedData.items.length} items found during analysis`
                    : `Select items to merge into your ${spec.label.toLowerCase()} profile`}
                </p>
              </div>
            </div>

            {/* Select all (only for mergeable) */}
            {!isReadOnly && extractedData.items.length > 1 && (
              <div className="px-5 pb-2">
                <button
                  onClick={toggleAll}
                  className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 hover:text-white/60 transition-colors"
                >
                  {checkedIds.size === extractedData.items.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            )}

            {/* Items list */}
            <div className="px-5 max-h-[50vh] overflow-y-auto space-y-3">
              {Array.from(grouped.entries()).map(([type, items]) => (
                <div key={type}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/25 mb-1.5">
                    {type.replace(/_/g, ' ')}
                  </p>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.045] transition-colors cursor-pointer"
                      >
                        {!isReadOnly && (
                          <input
                            type="checkbox"
                            checked={checkedIds.has(item.id)}
                            onChange={() => toggleItem(item.id)}
                            className="w-3.5 h-3.5 rounded border-white/20 bg-white/[0.045] accent-cyan-400"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white/70 truncate">{item.label}</p>
                          <p className="text-[11px] text-white/30 truncate">
                            from {item.source} · {new Date(item.extractedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.09] mt-3">
              {isReadOnly ? (
                <>
                  <p className="text-[11px] text-white/30 italic">
                    Read-only analysis — items are not persisted
                  </p>
                  <button
                    onClick={onDiscard}
                    className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.045] text-[11px] font-bold uppercase tracking-[0.12em] text-white/60 hover:text-white/80 transition-colors"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onDiscard}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-400/20 bg-red-500/5 text-[11px] font-bold uppercase tracking-[0.12em] text-red-300/60 hover:text-red-200 hover:bg-red-500/10 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Discard All
                  </button>
                  <button
                    onClick={() => onMerge(Array.from(checkedIds))}
                    disabled={checkedCount === 0}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Merge Selected ({checkedCount})
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
