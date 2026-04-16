import { Brain, ExternalLink, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResearchSession, ScoutKnowledgeNode, SourceEntry } from '../types';

interface ScoutResearchArtifactsPanelProps {
  session: ResearchSession;
  knowledgeNodes: ScoutKnowledgeNode[];
  sources: SourceEntry[];
  className?: string;
}

export function ScoutResearchArtifactsPanel({
  session,
  knowledgeNodes,
  sources,
  className,
}: ScoutResearchArtifactsPanelProps) {
  const sessionNodes = knowledgeNodes.filter((node) => node.parentSessionId === session.id);
  const sessionNodeIds = new Set(sessionNodes.map((node) => node.id));
  const sessionSources = sources.filter((source) =>
    source.citingNodeIds?.some((id) => sessionNodeIds.has(id))
  );

  const summaryNodes = sessionNodes
    .filter((n) => n.confidence >= 0.75 && n.status === 'verified')
    .slice(0, 3);
  const summaryText = summaryNodes.length > 0
    ? summaryNodes.map((n) => n.claim).join(' ')
    : null;

  return (
    <section
      aria-label="Research artifacts"
      className={cn(
        'surface-foundation flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-white/[0.09] p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.09] pb-4">
        <div className="min-w-0">
          <p className="text-chip-soft text-white/45">Research artifacts</p>
          <h3 className="mt-1 truncate text-panel-heading text-white">Findings, evidence, and context</h3>
        </div>
        <span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.045] px-2.5 text-[11px] font-semibold tabular-nums text-white/70">
          {sessionNodes.length + sessionSources.length}
        </span>
      </div>

      <div className="scrollbar-ghost mt-4 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain pr-1">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[var(--module-color-300)]" aria-hidden="true" />
            <h4 className="text-chip-soft text-white/40">Session summary</h4>
          </div>
          {summaryText ? (
            <div className="rounded-2xl border border-[var(--module-accent-border)] bg-gradient-to-br from-[var(--module-accent-muted)] to-transparent p-4">
              <p className="text-[13px] leading-relaxed text-white/80">{summaryText}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.045] px-4 py-4 text-center">
              <p className="text-body-secondary">No verified findings yet — keep researching to build a summary.</p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-chip-soft text-white/40">Synthesized findings</h4>
            <span className="text-meta">{sessionNodes.length}</span>
          </div>
          {sessionNodes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.045] px-4 py-6 text-center">
              <Brain className="mx-auto mb-2 h-6 w-6 text-white/15" aria-hidden="true" />
              <p className="text-body-secondary">No findings synthesized yet for this session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessionNodes.map((node) => (
                <article
                  key={node.id}
                  className="rounded-2xl border border-white/[0.09] bg-white/[0.045] p-4 transition-colors hover:border-[var(--module-accent-border)]"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="h-2 w-2 rounded-full bg-[var(--module-color-400)] shadow-[0_0_12px_var(--module-accent-glow)]" />
                    <span className="text-[11px] font-medium text-white/35">
                      {Math.round(node.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-body text-white/80">{node.claim}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-chip-soft text-white/40">Key evidence</h4>
            <span className="text-meta">{sessionSources.length}</span>
          </div>
          {sessionSources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.09] bg-white/[0.045] px-4 py-6 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-white/15" aria-hidden="true" />
              <p className="text-body-secondary">No sources linked yet for this session.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessionSources.map((source) => (
                <article
                  key={source.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.045] p-3 transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-white/45">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-white/80">{source.title}</p>
                    <p className="truncate text-[11px] text-white/35">{source.domain}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--module-accent-border)] bg-gradient-to-br from-[var(--module-accent-muted)] to-emerald-500/5 p-4">
        <p className="text-chip-soft text-[var(--module-color-300)]">Scout awareness</p>
        <p className="mt-2 text-[12px] leading-relaxed text-white/65">
          Scout keeps this session&apos;s evidence and synthesized claims reachable without forcing them to stay docked.
        </p>
      </div>
    </section>
  );
}
