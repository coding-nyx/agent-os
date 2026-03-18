import type { DocumentPipelinePolicy, DocumentParsed } from '@/lib/services/document-pipeline';

export type ScoutDocumentAnalysis = {
  summary: string;
};

export type ScoutDocumentProposal = {
  summary: string;
  rawTextPreview: string;
};

const SCOUT_DOC_CONTEXT = { moduleId: 'scout', domain: 'general' as const };

function buildScoutAnalysisPrompt(parsed: DocumentParsed): string {
  const header = [
    `Document received: "${parsed.fileName}"`,
    `Type: ${parsed.fileType.toUpperCase()}`,
    `Words: ${parsed.wordCount.toLocaleString()}`,
    parsed.pageCount > 0 ? `Pages: ${parsed.pageCount}` : null,
    parsed.detectedTitle ? `Detected title: "${parsed.detectedTitle}"` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    header,
    'Summarize this document for research review.',
    'Return a concise summary (4-6 sentences) and list 3-7 key findings as bullets.',
    'Do NOT emit action tags. Do NOT include JSON or markdown fences.',
    '',
    '---BEGIN DOCUMENT---',
    parsed.rawText,
    '---END DOCUMENT---',
  ].join('\\n');
}

function stripActionTags(text: string): string {
  return text.replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '').trim();
}

export const scoutDocumentPolicy: DocumentPipelinePolicy<ScoutDocumentAnalysis, ScoutDocumentProposal> = {
  id: 'scout-research-document',
  context: SCOUT_DOC_CONTEXT,
  analyze: async ({ parsed }, sendMessage) => {
    const prompt = buildScoutAnalysisPrompt(parsed);
    const response = await sendMessage(prompt);
    const cleaned = stripActionTags(response);
    return { summary: cleaned || 'No summary returned by analysis.' };
  },
  buildProposal: (analysis, parsed) => ({
    summary: analysis.summary,
    rawTextPreview: parsed.rawText.slice(0, 2400),
  }),
  summarizeProposal: (proposal) =>
    proposal.summary.length > 0 ? 'Research analysis ready for review.' : 'No analysis summary returned.',
};
