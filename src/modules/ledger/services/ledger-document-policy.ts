import type { DocumentParseResult } from '@/lib/services/document-intelligence-service';
import { analyzeRawText } from '@/lib/services/document-intelligence-service';
import type { DocumentPipelinePolicy } from '@/lib/services/document-pipeline';

export type LedgerDocumentProposal = {
  fields: Record<string, string>;
  confidence: number;
  rawTextPreview: string;
};

const LEDGER_DOC_CONTEXT = { moduleId: 'ledger', domain: 'receipt' as const };

export const ledgerDocumentPolicy: DocumentPipelinePolicy<DocumentParseResult, LedgerDocumentProposal> = {
  id: 'ledger-financial-document',
  context: LEDGER_DOC_CONTEXT,
  useOCRForImages: true,
  analyze: async ({ parsed }, sendMessage) => {
    const { fields, confidence } = await analyzeRawText(parsed.rawText, LEDGER_DOC_CONTEXT, sendMessage);
    return {
      type: LEDGER_DOC_CONTEXT.domain,
      fields,
      rawText: parsed.rawText,
      confidence,
      pageCount: parsed.pageCount,
      fileSizeBytes: parsed.fileSizeBytes,
      parsedAt: parsed.parsedAt,
      moduleId: LEDGER_DOC_CONTEXT.moduleId,
    };
  },
  buildProposal: (analysis) => ({
    fields: analysis.fields,
    confidence: analysis.confidence,
    rawTextPreview: analysis.rawText.slice(0, 2400),
  }),
  summarizeProposal: (proposal, parsed) => {
    const fieldCount = Object.values(proposal.fields).filter((v) => v.length > 0).length;
    return `Parsed ${fieldCount} field(s) from ${parsed.fileName} with ${(proposal.confidence * 100).toFixed(0)}% confidence.`;
  },
};

