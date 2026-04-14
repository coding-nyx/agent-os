import { useState, useCallback, useRef } from 'react';
import { useAI } from '@/cortex-bridge/ai-context';
import { type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { RagIngestionService } from '@/lib/services/rag/rag-ingestion-service';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { MessageContent } from '@/lib/types';

export interface UseNexusDocumentUploadParams {
  isCrossModuleBusy: boolean;
  isConflictBlocking: boolean;
  pendingTargets: ModuleId[];
  userId?: string;
}

export interface UseNexusDocumentUploadBindings {
  currentThreadId: string;
  presentRoutingSuggestion: (target: ModuleId, reason: string) => void;
  handleSendMessage: (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
    options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string }
  ) => Promise<void>;
}

export interface UseNexusDocumentUploadResult {
  docUploadBusy: boolean;
  docUploadError: string | null;
  docStage: DocumentPipelineStage | null;
  handleUploadDocuments: (request: DocumentUploadRequest) => Promise<void>;
  isNexusBusy: boolean;
  busyLabel: string;
  /** Call this once late-bound values are available to bind them into the callback. */
  bindLateValues: (bindings: UseNexusDocumentUploadBindings) => void;
}

export function useNexusDocumentUpload({
  isCrossModuleBusy,
  isConflictBlocking,
  pendingTargets,
  userId,
}: UseNexusDocumentUploadParams): UseNexusDocumentUploadResult {
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);

  // Some unit tests render NexusDashboard without an `AIProvider`.
  // `useAI()` throws in that scenario, so we fall back to a no-op sender
  // (document-upload features won't be exercised by those tests).
  let sendMessage: ReturnType<typeof useAI>['sendMessage'] | undefined;
  let analyzeImage: ReturnType<typeof useAI>['analyzeImage'] | undefined;
  try {
    // `useAI()` must still be invoked to preserve hook order.
    const aiContext = useAI();
    sendMessage = aiContext.sendMessage;
    analyzeImage = aiContext.analyzeImage;
  } catch {
    sendMessage = undefined;
    analyzeImage = undefined;
  }

  // Late-bound values that depend on hooks called after this one.
  // Updated synchronously each render via `bindLateValues`.
  const lateRef = useRef<UseNexusDocumentUploadBindings>({
    currentThreadId: 'nexus.dashboard',
    presentRoutingSuggestion: () => {},
    handleSendMessage: async () => {},
  });

  const bindLateValues = useCallback((bindings: UseNexusDocumentUploadBindings) => {
    lateRef.current = bindings;
  }, []);

  const handleUploadDocuments = useCallback(async (request: DocumentUploadRequest) => {
    if (!sendMessage) {
      throw new Error('AI sendMessage unavailable (missing AIProvider).');
    }
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'nexus',
        systemPrompt: 'You are a neutral document analyst. Follow the instructions exactly. Do NOT emit action tags.',
        memoryContext: [],
        summary: 'Nexus document analysis.',
        history: []
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        moduleId: 'nexus',
        systemPrompt: 'Return a concise summary and key points. No action tags.',
        memoryContext: [],
        summary: 'Nexus document fallback.',
        history: []
      });
      return response.publicText;
    };

    setDocUploadError(null);
    setDocUploadBusy(true);
    setDocStage({ id: 'parsing', label: request.files.length > 1 ? 'Uploading documents…' : 'Uploading document…' });

    try {
      const result = await prepareDocumentChatPrompt({
        moduleId: 'nexus',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage: analyzeImage ? (imageDataUrl, prompt) => analyzeImage(imageDataUrl, prompt) : undefined,
        userContext: request.caption,
        onStageChange: (stage) => setDocStage(stage),
      });

      const routeCandidate = result.insights
        .filter((insight) =>
          !insight.requiresUserTypeSelection &&
          insight.targetModule &&
          insight.targetModule !== 'nexus' &&
          (insight.targetConfidence ?? 0) >= 0.75
        )
        .sort((a, b) => (b.targetConfidence ?? 0) - (a.targetConfidence ?? 0))[0];

      if (routeCandidate?.targetModule) {
        lateRef.current.presentRoutingSuggestion(
          routeCandidate.targetModule,
          `Document classified as ${routeCandidate.docType} (${Math.round((routeCandidate.targetConfidence ?? 0) * 100)}% confidence).`,
        );
      }

      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      await lateRef.current.handleSendMessage(result.prompt, undefined, {
        visibleContent: request.visibleContent,
        threadId: lateRef.current.currentThreadId,
      });

      // Fire-and-forget: ingest uploaded files into RAG chunks
      if (userId) {
        for (const file of request.files) {
          import('@/lib/services/doc-ingest-service').then(({ parseDocument: parse }) =>
            parse(file).then((parsed) =>
              RagIngestionService.ingest(parsed.text, {
                userId: userId!,
                moduleId: 'nexus',
                source: file.name,
              }),
            ),
          ).catch(() => {/* logged internally */});
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [analyzeImage, sendMessage, userId]);

  const isNexusBusy = isCrossModuleBusy || docUploadBusy || isConflictBlocking;
  const busyLabel = (() => {
    if (docUploadBusy) return docStage?.label ?? 'Uploading and analyzing…';
    if (docUploadError) return docStage?.label ?? 'Analysis failed.';
    if (isConflictBlocking) return 'Conflict active: resolve it in the overlay to continue…';
    if (isCrossModuleBusy) {
      const names = pendingTargets
        .slice(0, 3)
        .map((id) => MODULE_MANIFEST[id]?.alias || id)
        .join(', ');
      return pendingTargets.length > 0
        ? `Waiting for module response: ${names}…`
        : 'Waiting for module response…';
    }
    return '';
  })();

  return {
    docUploadBusy,
    docUploadError,
    docStage,
    handleUploadDocuments,
    isNexusBusy,
    busyLabel,
    bindLateValues,
  };
}
