import type { DocumentAnalysisResult, DocumentType } from '@/lib/services/document-analysis-service';
import { DocumentAnalysisService } from '@/lib/services/document-analysis-service';
import type { DocumentPipelinePolicy } from '@/lib/services/document-pipeline';
import { NexusLogger } from '@/lib/nexus-logger';

const SOMA_DOC_CONTEXT = { moduleId: 'soma', domain: 'lab_report' as const };

function mapFileType(type: string): DocumentType {
  switch (type) {
    case 'pdf':
    case 'csv':
    case 'image':
      return type;
    default:
      return 'text';
  }
}

export const somaDocumentPolicy: DocumentPipelinePolicy<DocumentAnalysisResult, DocumentAnalysisResult> = {
  id: 'soma-medical-document',
  context: SOMA_DOC_CONTEXT,
  useOCRForImages: true,
  ocrFailureMode: 'error',
  analyze: async ({ parsed }, sendMessage) => {
    const rawText = parsed.rawText?.trim() ?? '';
    if (rawText.length < 20) {
      const err = new Error('No readable text extracted from document.');
      NexusLogger.error('SomaDocumentPolicy', err);
      throw err;
    }

    const prompt = DocumentAnalysisService.buildAnalysisPrompt(rawText);
    const response = await sendMessage(prompt);
    if (!response || response.trim().length === 0) {
      const err = new Error('Analysis returned an empty response.');
      NexusLogger.error('SomaDocumentPolicy', err);
      throw err;
    }

    const analysis = DocumentAnalysisService.parseAnalysisResponse(response, rawText);
    analysis.documentType = mapFileType(parsed.fileType);

    return analysis;
  },
  buildProposal: (analysis) => analysis,
  summarizeProposal: (proposal) =>
    proposal.extractedFields.length > 0
      ? `Detected ${proposal.extractedFields.length} clinical field(s) for review.`
      : 'No structured medical fields detected in this document.',
};
