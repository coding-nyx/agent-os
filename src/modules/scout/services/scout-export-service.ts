/**
 * scout-export-service.ts
 *
 * Pure export functions — no Firestore, no side effects.
 * Converts Scout data structures into Markdown with YAML frontmatter.
 */

import type { ScoutKnowledgeNode } from './scout-knowledge-service';
import type { SourceEntryDecrypted } from './scout-sources-service';
import type { ScoutDigestDecrypted } from './scout-digest-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportTarget =
  | { type: 'nodes'; nodes: ScoutKnowledgeNode[] }
  | { type: 'sources'; sources: SourceEntryDecrypted[] }
  | { type: 'digest'; digest: ScoutDigestDecrypted }
  | {
      type: 'full-library';
      nodes: ScoutKnowledgeNode[];
      digests: ScoutDigestDecrypted[];
      sources: SourceEntryDecrypted[];
    };

interface ExportOptions {
  title?: string;
  groupByDomain?: boolean;
  groupByStatus?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yamlFrontmatter(fields: Record<string, string | number | boolean>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

function isoToDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusEmoji(status: ScoutKnowledgeNode['status']): string {
  switch (status) {
    case 'verified':
      return '✅';
    case 'contested':
      return '⚠️';
    default:
      return '🔍';
  }
}

// ---------------------------------------------------------------------------
// Export: Knowledge Nodes
// ---------------------------------------------------------------------------

export function exportNodesToMarkdown(
  nodes: ScoutKnowledgeNode[],
  options: ExportOptions = {},
): string {
  const title = options.title ?? 'Scout Research Nodes';
  const frontmatter = yamlFrontmatter({
    title,
    exported: new Date().toISOString(),
    nodeCount: nodes.length,
  });

  const sections: string[] = [frontmatter, `# ${title}`, ''];

  if (nodes.length === 0) {
    sections.push('*No knowledge nodes yet.*');
    return sections.join('\n');
  }

  if (options.groupByStatus) {
    const byStatus: Record<string, ScoutKnowledgeNode[]> = {};
    nodes.forEach((n) => {
      (byStatus[n.status] = byStatus[n.status] ?? []).push(n);
    });

    for (const [status, group] of Object.entries(byStatus)) {
      sections.push(`## ${statusEmoji(status as ScoutKnowledgeNode['status'])} ${status.charAt(0).toUpperCase() + status.slice(1)}`, '');
      group.forEach((n) => sections.push(...renderNode(n), ''));
    }
  } else {
    nodes.forEach((n) => sections.push(...renderNode(n), ''));
  }

  return sections.join('\n');
}

function renderNode(n: ScoutKnowledgeNode): string[] {
  const lines: string[] = [
    `### ${statusEmoji(n.status)} ${n.title}`,
    '',
    `**Claim:** ${n.claim}`,
    '',
    `- **Confidence:** ${(n.confidence * 100).toFixed(0)}%`,
    `- **Status:** ${n.status}`,
    `- **Updated:** ${isoToDisplayDate(n.updatedAt)}`,
  ];

  if (n.source) {
    lines.push(`- **Source:** ${n.source}`);
  }

  if (n.sources && n.sources.length > 0) {
    lines.push('', '**Sources:**');
    n.sources.forEach((s) => lines.push(`- ${s}`));
  }

  if (n.evidence && n.evidence.length > 0) {
    lines.push('', '**Evidence:**');
    n.evidence.forEach((e) => lines.push(`- ${e}`));
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Export: Sources
// ---------------------------------------------------------------------------

export function exportSourcesToMarkdown(
  sources: SourceEntryDecrypted[],
  options: ExportOptions = {},
): string {
  const title = options.title ?? 'Scout Source Library';
  const frontmatter = yamlFrontmatter({
    title,
    exported: new Date().toISOString(),
    sourceCount: sources.length,
  });

  const sections: string[] = [frontmatter, `# ${title}`, ''];

  if (sources.length === 0) {
    sections.push('*No sources saved yet.*');
    return sections.join('\n');
  }

  if (options.groupByDomain) {
    const byDomain: Record<string, SourceEntryDecrypted[]> = {};
    sources.forEach((s) => {
      (byDomain[s.domain] = byDomain[s.domain] ?? []).push(s);
    });

    for (const [domain, group] of Object.entries(byDomain).sort()) {
      sections.push(`## ${domain}`, '');
      group.forEach((s) => sections.push(...renderSource(s), ''));
    }
  } else {
    sources.forEach((s) => sections.push(...renderSource(s), ''));
  }

  return sections.join('\n');
}

function renderSource(s: SourceEntryDecrypted): string[] {
  const star = s.isStarred ? ' ⭐' : '';
  const read = s.readAt ? ' ✓' : '';
  const lines: string[] = [
    `### ${s.title}${star}${read}`,
    '',
    `- **URL:** <${s.url}>`,
    `- **Domain:** ${s.domain}`,
    `- **Saved:** ${isoToDisplayDate(s.savedAt)}`,
  ];

  if (s.readAt) {
    lines.push(`- **Read:** ${isoToDisplayDate(s.readAt)}`);
  }

  if (s.nodeId) {
    lines.push(`- **Node:** ${s.nodeId}`);
  }

  if (s.tags.length > 0) {
    lines.push(`- **Tags:** ${s.tags.join(', ')}`);
  }

  if (s.snippet) {
    lines.push('', `> ${s.snippet.replace(/\n/g, '\n> ')}`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Export: Digest
// ---------------------------------------------------------------------------

export function exportDigestToMarkdown(digest: ScoutDigestDecrypted): string {
  const title = `Scout Research Digest — ${isoToDisplayDate(digest.createdAt)}`;
  const frontmatter = yamlFrontmatter({
    title,
    created: digest.createdAt,
    exported: new Date().toISOString(),
    nodeCount: digest.nodeCount,
    sourceCount: digest.sourceCount,
    triggerSource: digest.triggerSource,
  });

  const { sections } = digest;
  const lines: string[] = [
    frontmatter,
    `# ${title}`,
    '',
    '## Executive Summary',
    '',
    sections.executiveSummary,
    '',
  ];

  if (sections.keyThemes.length > 0) {
    lines.push('## Key Themes', '');
    sections.keyThemes.forEach((t) => lines.push(`- ${t}`));
    lines.push('');
  }

  if (sections.knowledgeGaps.length > 0) {
    lines.push('## Knowledge Gaps', '');
    sections.knowledgeGaps.forEach((g) => lines.push(`- ${g}`));
    lines.push('');
  }

  if (sections.recommendedActions.length > 0) {
    lines.push('## Recommended Actions', '');
    sections.recommendedActions.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }

  if (sections.sourceSummary) {
    lines.push('## Source Overview', '', sections.sourceSummary, '');
  }

  lines.push(
    '---',
    '',
    `*Generated ${isoToDisplayDate(digest.createdAt)} · ${digest.nodeCount} nodes · ${digest.sourceCount} sources*`,
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export: Full Library
// ---------------------------------------------------------------------------

export function exportFullLibrary(
  nodes: ScoutKnowledgeNode[],
  digests: ScoutDigestDecrypted[],
  sources: SourceEntryDecrypted[],
): string {
  const sections: string[] = [];

  const frontmatter = yamlFrontmatter({
    title: 'Scout Full Research Export',
    exported: new Date().toISOString(),
    nodeCount: nodes.length,
    sourceCount: sources.length,
    digestCount: digests.length,
  });

  sections.push(frontmatter, '# Scout Full Research Export', '');

  if (digests.length > 0) {
    const sortedDigests = [...digests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sortedDigests.forEach((d) => {
      sections.push(
        `## Digest — ${isoToDisplayDate(d.createdAt)}`,
        '',
        d.sections.executiveSummary,
        '',
      );
    });
  }

  sections.push(
    '---',
    '',
    exportNodesToMarkdown(nodes, { title: 'Research Nodes', groupByStatus: true }),
    '',
    '---',
    '',
    exportSourcesToMarkdown(sources, { title: 'Source Library', groupByDomain: true }),
  );

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Download utility
// ---------------------------------------------------------------------------

/** Triggers a browser file download of the markdown string. */
export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Copies markdown content to the clipboard. Returns true on success. */
export async function copyMarkdownToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}
