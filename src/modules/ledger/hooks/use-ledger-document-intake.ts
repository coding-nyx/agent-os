import { useCallback, useState } from 'react';
import { analyzeImageWithVision } from '@/lib/services/vision-analysis-service';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { runDocumentPipeline } from '@/lib/services/document-pipeline';
import { ledgerDocumentPolicy, type LedgerDocumentProposal } from '../services/ledger-document-policy';
import type { MessageContent } from '@/lib/types';
import type { ConversationContext } from '@/cortex-bridge/types';

interface SendMessageFn {
  (content: MessageContent, onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void, options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string; hideUserMessage?: boolean }): Promise<void>;
}

interface AIContextSendMessage {
  (prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<{ response: { publicText: string } }>;
}

export interface LedgerDocumentIntakeState {
  isCaptureModalOpen: boolean;
  setIsCaptureModalOpen: (open: boolean) => void;
  isVisionAnalyzing: boolean;
  visionReviewData: Record<string, unknown> | null;
  isReviewModalOpen: boolean;
  setIsReviewModalOpen: (open: boolean) => void;
  docProposal: LedgerDocumentProposal | null;
  docProposalSummary: string | null;
  isDocReviewOpen: boolean;
  setIsDocReviewOpen: (open: boolean) => void;
  handleOpenDocuments: () => void;
  handleDocumentFile: (file: File) => Promise<void>;
  openDocumentPicker: () => void;
  handleDocumentCapture: (dataUrl: string) => Promise<void>;
  handleDocReviewCommit: () => Promise<void>;
  handleStructuredDocCommit: () => void;
  handleChatDocumentUploads: (request: DocumentUploadRequest) => Promise<void>;
  clearVisionReview: () => void;
  clearDocReview: () => void;
}

export function useLedgerDocumentIntake(
  aiHandleSendMessage: SendMessageFn,
  sendMessage: AIContextSendMessage,
  analyzeImage: (imageDataUrl: string, prompt: string, options?: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; format?: 'json_object' | 'text' }) => Promise<string>,
): LedgerDocumentIntakeState {
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isVisionAnalyzing, setIsVisionAnalyzing] = useState(false);
  const [visionReviewData, setVisionReviewData] = useState<Record<string, unknown> | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [docProposal, setDocProposal] = useState<LedgerDocumentProposal | null>(null);
  const [docProposalSummary, setDocProposalSummary] = useState<string | null>(null);
  const [isDocReviewOpen, setIsDocReviewOpen] = useState(false);

  const handleOpenDocuments = useCallback(() => {
    aiHandleSendMessage(
      'Open embedded financial document intelligence mode. Ask me to upload a statement, receipt, or invoice for structured extraction.'
    );
  }, [aiHandleSendMessage]);

  const handleDocumentFile = useCallback(async (file: File) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'ledger',
        systemPrompt: 'You are a financial document analysis engine. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Financial document analysis.',
        history: [],
      });
      return response.publicText;
    };
    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'ledger',
        systemPrompt: 'Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Document analysis fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const result = await runDocumentPipeline({
        file,
        policy: ledgerDocumentPolicy,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
      });
      setDocProposal(result.proposal);
      setDocProposalSummary(result.summary);
      setIsDocReviewOpen(true);
    } catch (err) {
      aiHandleSendMessage('Document intake failed. Please try again with a PDF, image, or text file.');
      console.error('[Ledger] Document pipeline failed:', err);
    }
  }, [aiHandleSendMessage, sendMessage]);

  const openDocumentPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt';

    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      await handleDocumentFile(file);
      input.value = '';
    };

    input.click();
  }, [handleDocumentFile]);

  const handleDocumentCapture = useCallback(
    async (dataUrl: string) => {
      setIsVisionAnalyzing(true);
      try {
        const apiKey = localStorage.getItem('openrouter_api_key') || process.env.REACT_APP_OPENROUTER_KEY;
        if (!apiKey) {
          aiHandleSendMessage('I need an OpenRouter API key to analyze financial documents. Please set your API key in settings.');
          setIsCaptureModalOpen(false);
          return;
        }

        const modelId = 'openai/gpt-4o';
        const result = await analyzeImageWithVision(dataUrl, 'financial_document', apiKey, modelId);
        if (!result.success) {
          aiHandleSendMessage(`Financial document analysis failed: ${result.error}`);
          setIsCaptureModalOpen(false);
          return;
        }

        setVisionReviewData(result.rawJson);
        setIsReviewModalOpen(true);
        setIsCaptureModalOpen(false);
      } finally {
        setIsVisionAnalyzing(false);
      }
    },
    [aiHandleSendMessage],
  );

  const handleDocReviewCommit = useCallback(async () => {
    if (!visionReviewData) return;
    
    const sanitized = JSON.stringify(visionReviewData);
    const prompt = [
      'Financial document analysis completed. Review the extracted data:',
      sanitized,
      'User has confirmed this data. Please execute the analyze_financial_document action now to update my profile.'
    ].join('\n\n');
    
    aiHandleSendMessage(prompt);
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, [visionReviewData, aiHandleSendMessage]);

  const handleStructuredDocCommit = useCallback(() => {
    if (!docProposal) return;
    const fieldLines = Object.entries(docProposal.fields)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const prompt = [
      'Financial document receipt parsed. Map this into budgeting, cashflow, categories, and anomalies.',
      docProposalSummary ? `Summary: ${docProposalSummary}` : null,
      fieldLines.length > 0 ? `Extracted fields:\n${fieldLines}` : null,
      docProposal.rawTextPreview.length > 0
        ? `Full extracted text (preview):\n${docProposal.rawTextPreview}${docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}`
        : 'No text could be extracted from this file.',
      'User has confirmed this data. Now emit: <action type="parse_financial_document">...(include extracted data)</action>'
    ]
      .filter(Boolean)
      .join('\n\n');

    aiHandleSendMessage(prompt);
    setIsDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
  }, [docProposal, docProposalSummary, aiHandleSendMessage]);

  const handleChatDocumentUploads = useCallback(async (request: DocumentUploadRequest) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'ledger',
        systemPrompt: 'You are a financial document triage analyst. Return only valid JSON as instructed.',
        memoryContext: [],
        summary: 'Ledger document triage.',
        history: [],
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'ledger',
        systemPrompt: 'Return only valid JSON matching the requested schema.',
        memoryContext: [],
        summary: 'Ledger document triage fallback.',
        history: [],
      });
      return response.publicText;
    };

    try {
      const { prompt } = await prepareDocumentChatPrompt({
        moduleId: 'ledger',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage,
        userContext: request.caption,
      });
      await aiHandleSendMessage(prompt, undefined, { visibleContent: request.visibleContent });
    } catch (error) {
      console.error('[Ledger] Chat document analysis failed:', error);
      await aiHandleSendMessage('I could not analyze those financial documents. Please try again with PDFs, images, or text files.');
    }
  }, [aiHandleSendMessage, analyzeImage, sendMessage]);

  const clearVisionReview = useCallback(() => {
    setIsReviewModalOpen(false);
    setVisionReviewData(null);
  }, []);

  const clearDocReview = useCallback(() => {
    setIsDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
  }, []);

  return {
    isCaptureModalOpen,
    setIsCaptureModalOpen,
    isVisionAnalyzing,
    visionReviewData,
    isReviewModalOpen,
    setIsReviewModalOpen,
    docProposal,
    docProposalSummary,
    isDocReviewOpen,
    setIsDocReviewOpen,
    handleOpenDocuments,
    handleDocumentFile,
    openDocumentPicker,
    handleDocumentCapture,
    handleDocReviewCommit,
    handleStructuredDocCommit,
    handleChatDocumentUploads,
    clearVisionReview,
    clearDocReview,
  };
}
