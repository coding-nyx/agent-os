import { useCallback, useState } from 'react';
import {
  buildDocumentAnalysisPrompt,
} from '../services/scout-document-service';
import type { DocumentParseResult } from '../services/scout-document-service';
import { runDocumentPipeline, type DocumentParsed } from '@/lib/services/document-pipeline';
import { scoutDocumentPolicy, type ScoutDocumentProposal } from '../services/scout-document-policy';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseScoutDocumentUploadParams {
  sendMessage: (prompt: string, options: any) => Promise<{ response: { publicText: string } }>;
  analyzeImage: (imageData: string, prompt: string, options?: any) => Promise<string>;
  ai: { handleSendMessage: (content: any, onAction?: any, opts?: any) => Promise<void> };
  onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
  setErrorMessage: (msg: string | null) => void;
}

export interface UseScoutDocumentUploadReturn {
  showUploadZone: boolean;
  setShowUploadZone: React.Dispatch<React.SetStateAction<boolean>>;
  docReviewOpen: boolean;
  setDocReviewOpen: React.Dispatch<React.SetStateAction<boolean>>;
  docProposal: ScoutDocumentProposal | null;
  docProposalSummary: string | null;
  docProposalParsed: DocumentParseResult | null;
  handleUploadSubmit: (result: DocumentParseResult) => Promise<void>;
  handleChatDocumentUploads: (request: DocumentUploadRequest) => Promise<void>;
  handleDocProposalCommit: () => void;
  clearDocProposal: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScoutDocumentUpload({
  sendMessage,
  analyzeImage,
  ai,
  onActionParsed,
  setErrorMessage,
}: UseScoutDocumentUploadParams): UseScoutDocumentUploadReturn {
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [docProposal, setDocProposal] = useState<ScoutDocumentProposal | null>(null);
  const [docProposalSummary, setDocProposalSummary] = useState<string | null>(null);
  const [docProposalParsed, setDocProposalParsed] = useState<DocumentParseResult | null>(null);
  const [docReviewOpen, setDocReviewOpen] = useState(false);

  // -----------------------------------------------------------------------
  // Upload-zone submit – runs the full document pipeline
  // -----------------------------------------------------------------------

  const handleUploadSubmit = useCallback(async (result: DocumentParseResult) => {
    setShowUploadZone(false);
    setErrorMessage(null);
    try {
      const normalizedType = result.metadata.fileType === 'pdf' || result.metadata.fileType === 'csv'
        ? result.metadata.fileType
        : 'text';

      const parsedOverride: DocumentParsed = {
        fileName: result.metadata.filename,
        fileType: normalizedType,
        fileSizeBytes: result.metadata.fileSize,
        pageCount: result.metadata.pageCount ?? 1,
        wordCount: result.metadata.wordCount,
        detectedTitle: result.metadata.extractedTitle,
        rawText: result.text,
        notes: result.notes,
        parsedAt: result.metadata.parsedAt,
        extras: { scoutParseResult: result },
      };

      const llmPrimary = async (prompt: string) => {
        const { response } = await sendMessage(prompt, {
          moduleId: 'scout',
          systemPrompt: 'You are a research document analyst. Follow the instructions exactly.',
          memoryContext: [],
          summary: 'Research document analysis.',
          history: [],
        });
        return response.publicText;
      };
      const llmFallback = async (prompt: string) => {
        const { response } = await sendMessage(prompt, {
          moduleId: 'scout',
          systemPrompt: 'Return a plain-text summary and key findings as instructed.',
          memoryContext: [],
          summary: 'Research analysis fallback.',
          history: [],
        });
        return response.publicText;
      };

      const pipeline = await runDocumentPipeline({
        file: new File([result.text], result.metadata.filename, { type: 'text/plain' }),
        policy: scoutDocumentPolicy,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        parsedOverride,
      });

      setDocProposal(pipeline.proposal);
      setDocProposalSummary(pipeline.summary);
      setDocProposalParsed(result);
      setDocReviewOpen(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process document. Please try again.');
    }
  }, [sendMessage, setErrorMessage]);

  // -----------------------------------------------------------------------
  // Chat-inline document uploads (drag-and-drop into the chat input)
  // -----------------------------------------------------------------------

  const handleChatDocumentUploads = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'scout',
        systemPrompt: 'You are a research document triage analyst. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Scout document triage.',
        history: [],
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'scout',
        systemPrompt: 'Return only valid JSON matching the requested schema.',
        memoryContext: [],
        summary: 'Scout document triage fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const { prompt } = await prepareDocumentChatPrompt({
        moduleId: 'scout',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage,
        userContext: request.caption,
      });
      await ai.handleSendMessage(prompt, onActionParsed, { visibleContent: request.visibleContent });
    } catch (error) {
      console.error('[Scout] Chat document analysis failed:', error);
      setErrorMessage('I could not analyze those documents together. Please try again with supported files.');
    }
  }, [ai, analyzeImage, onActionParsed, sendMessage, setErrorMessage]);

  // -----------------------------------------------------------------------
  // Commit the reviewed proposal into the chat
  // -----------------------------------------------------------------------

  const handleDocProposalCommit = useCallback(() => {
    if (!docProposalParsed) return;
    const prompt = buildDocumentAnalysisPrompt(docProposalParsed);
    ai.handleSendMessage(prompt, onActionParsed);
    setDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
    setDocProposalParsed(null);
  }, [docProposalParsed, ai, onActionParsed]);

  // -----------------------------------------------------------------------
  // Clear proposal state without committing
  // -----------------------------------------------------------------------

  const clearDocProposal = useCallback(() => {
    setDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
    setDocProposalParsed(null);
  }, []);

  return {
    showUploadZone,
    setShowUploadZone,
    docReviewOpen,
    setDocReviewOpen,
    docProposal,
    docProposalSummary,
    docProposalParsed,
    handleUploadSubmit,
    handleChatDocumentUploads,
    handleDocProposalCommit,
    clearDocProposal,
  };
}
