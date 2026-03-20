import React, { useMemo } from 'react';
import { FileText, Library } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import type { ScoutKnowledgeNode } from '../services/scout-knowledge-service';
import { ScoutDocumentCardCompact } from './ScoutDocumentCard';

// ---------------------------------------------------------------------------
// ScoutEvidenceSources
// ---------------------------------------------------------------------------
// Derives unique document sources from knowledge nodes' `source` fields.
// Renders a compact list in the dashboard showing which documents have
// contributed to the knowledge graph, with counts of how many claims each
// source has generated.
//
// No schema changes required — this reads from existing ScoutProfile data.
//
// Accessibility:
//   - Uses semantic list markup
//   - Section labeled with aria-label
//   - Each source item has descriptive aria-label
// ---------------------------------------------------------------------------

interface ScoutEvidenceSourcesProps {
  knowledgeNodes: ScoutKnowledgeNode[];
  className?: string;
}

interface SourceAggregate {
  filename: string;
  claimCount: number;
  fileType: 'pdf' | 'txt' | 'csv' | 'md' | 'unknown';
}

function inferFileTypeFromName(filename: string): SourceAggregate['fileType'] {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.txt')) return 'txt';
  // Check if it looks like a URL (web research result)
  if (lower.startsWith('http://') || lower.startsWith('https://')) return 'unknown';
  return 'txt';
}

function isDocumentSource(source: string): boolean {
  // Filter out web URLs — we only want uploaded document sources
  if (source.startsWith('http://') || source.startsWith('https://')) return false;
  // Filter out very short strings that don't look like filenames
  if (source.length < 3) return false;
  return true;
}

export function ScoutEvidenceSources({ knowledgeNodes, className }: ScoutEvidenceSourcesProps) {
  const sources = useMemo<SourceAggregate[]>(() => {
    const map = new Map<string, number>();

    for (const node of knowledgeNodes) {
      // Check primary source
      if (node.source && isDocumentSource(node.source)) {
        map.set(node.source, (map.get(node.source) || 0) + 1);
      }
      // Check sources array
      if (node.sources) {
        for (const s of node.sources) {
          if (isDocumentSource(s)) {
            map.set(s, (map.get(s) || 0) + 1);
          }
        }
      }
    }

    return Array.from(map.entries())
      .map(([filename, claimCount]) => ({
        filename,
        claimCount,
        fileType: inferFileTypeFromName(filename),
      }))
      .sort((a, b) => b.claimCount - a.claimCount);
  }, [knowledgeNodes]);

  if (sources.length === 0) {
    return (
      <section className={cn('space-y-3', className)} aria-label="Evidence sources">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic flex items-center gap-2">
          <Library className="w-3.5 h-3.5 text-[var(--module-color-400)] opacity-50" aria-hidden="true" />
          Evidence Sources
        </h4>
        <EmptyState
          size="sm"
          title="No document sources"
          description="Upload evidence documents in chat to build source-attributed knowledge nodes."
          className="bg-transparent border-white/10"
          icon={FileText}
        />
      </section>
    );
  }

  return (
    <section className={cn('space-y-3', className)} aria-label="Evidence sources">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-white/70 uppercase tracking-widest italic flex items-center gap-2">
          <Library className="w-3.5 h-3.5 text-[var(--module-color-400)] opacity-50" aria-hidden="true" />
          Evidence Sources
        </h4>
        <span className="text-[9px] font-bold text-white/25 uppercase tracking-wider">
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-1.5" role="list" aria-label="Uploaded document sources">
        {sources.slice(0, 8).map((source) => (
          <ScoutDocumentCardCompact
            key={source.filename}
            filename={source.filename}
            fileType={source.fileType}
            claimCount={source.claimCount}
          />
        ))}
        {sources.length > 8 && (
          <p className="text-[9px] text-white/20 italic text-center pt-1">
            +{sources.length - 8} more source{sources.length - 8 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </section>
  );
}
