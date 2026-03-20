/**
 * ExportDialog.tsx
 *
 * Generic export dialog for Scout data — nodes, sources, digest, full library.
 * Shows a preview of the markdown output and provides download + clipboard buttons.
 */

import React, { useMemo, useState } from 'react';
import { X, Download, Copy, CheckCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { NeuralButton } from '@/core/components/NeuralButton';
import {
  exportNodesToMarkdown,
  exportSourcesToMarkdown,
  exportDigestToMarkdown,
  exportFullLibrary,
  downloadMarkdown,
  copyMarkdownToClipboard,
  type ExportTarget,
} from '../services/scout-export-service';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  target: ExportTarget | null;
}

const TARGET_LABELS: Record<ExportTarget['type'], string> = {
  nodes: 'Research Nodes',
  sources: 'Source Library',
  digest: 'Digest',
  'full-library': 'Full Library',
};

const TARGET_FILENAMES: Record<ExportTarget['type'], string> = {
  nodes: 'scout-research-nodes',
  sources: 'scout-sources',
  digest: 'scout-digest',
  'full-library': 'scout-full-export',
};

export function ExportDialog({ isOpen, onClose, target }: ExportDialogProps) {
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => {
    if (!target) return '';
    switch (target.type) {
      case 'nodes':
        return exportNodesToMarkdown(target.nodes, { groupByStatus: true });
      case 'sources':
        return exportSourcesToMarkdown(target.sources, { groupByDomain: true });
      case 'digest':
        return exportDigestToMarkdown(target.digest);
      case 'full-library':
        return exportFullLibrary(target.nodes, target.digests, target.sources);
    }
  }, [target]);

  const handleDownload = () => {
    if (!target) return;
    downloadMarkdown(TARGET_FILENAMES[target.type], markdown);
  };

  const handleCopy = async () => {
    const success = await copyMarkdownToClipboard(markdown);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !target) return null;

  const label = TARGET_LABELS[target.type];
  const lineCount = markdown.split('\n').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0a0c11] border border-white/10 rounded-2xl flex flex-col max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <div>
            <h2 className="text-sm font-bold text-white/80 uppercase tracking-widest">
              Export — {label}
            </h2>
            <p className="text-xs text-white/30 mt-0.5">{lineCount} lines · Markdown format</p>
          </div>
          <NeuralButton
            variant="ghost"
            onClick={onClose}
            className="p-2 h-auto w-auto min-h-0 min-w-0 border-none text-white/30 hover:text-white/60"
          >
            <X className="w-4 h-4" />
          </NeuralButton>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <pre className="text-xs text-white/40 font-mono leading-relaxed whitespace-pre-wrap bg-white/[0.02] rounded-xl p-4 border border-white/5">
            {markdown.slice(0, 3000)}
            {markdown.length > 3000 && '\n\n… (truncated in preview)'}
          </pre>
        </div>

        {/* Actions */}
        <div className="border-t border-white/8 p-4 flex items-center justify-end gap-2">
          <NeuralButton
            variant="outline"
            onClick={onClose}
            className="text-white/40"
          >
            Close
          </NeuralButton>
          <NeuralButton
            variant="outline"
            onClick={handleCopy}
            className="flex items-center gap-2 text-white/70"
          >
            {copied ? (
              <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Copy</>
            )}
          </NeuralButton>
          <NeuralButton
            onClick={handleDownload}
            themeColor="white"
            className="flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Download .md
          </NeuralButton>
        </div>
      </motion.div>
    </div>
  );
}
