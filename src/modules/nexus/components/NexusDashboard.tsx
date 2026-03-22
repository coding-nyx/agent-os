import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NexusChat } from '@/core/components/NexusChat';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import { DailyBriefSection } from './DailyBriefSection';
import { SynthesisPanel } from './SynthesisPanel';
import { CommandPalette } from './CommandPalette';
import { Trash2 } from 'lucide-react';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NexusErrorBoundary } from './NexusErrorBoundary';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useAI } from '@/llm-engine/ai-context';
import { type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { useNexusCrossModuleBlocker } from '@/lib/hooks/use-nexus-cross-module-blocker';
import { useNexusConflictBlocker } from '@/lib/hooks/use-nexus-conflict-blocker';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';

interface NexusDashboardProps {
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: GuestQuota | null;
    handleSendMessage: (
      content: MessageContent,
      onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent }
    ) => Promise<void>;
    clearSession: () => Promise<void>;
  };
  agentName: string;
}

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function NexusDashboard({ ai, agentName }: NexusDashboardProps) {
  const navigate = useNavigate();
  const { refreshGlobalSoul } = useGlobalSoul();
  const { isCrossModuleBusy, pendingTargets } = useNexusCrossModuleBlocker();
  const { isConflictBlocking } = useNexusConflictBlocker();
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);
  // Some unit tests render this component without an `AIProvider`.
  // `useAI()` throws in that scenario, so we fall back to a no-op sender
  // (document-upload features won't be exercised by those tests).
  let sendMessage: ReturnType<typeof useAI>['sendMessage'] | undefined;
  let analyzeImage: ReturnType<typeof useAI>['analyzeImage'] | undefined;
  try {
    // `useAI()` must still be invoked to preserve hook order.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const aiContext = useAI();
    sendMessage = aiContext.sendMessage;
    analyzeImage = aiContext.analyzeImage;
  } catch {
    sendMessage = undefined;
    analyzeImage = undefined;
  }
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  );
  const [routingSuggestion, setRoutingSuggestion] = useState<{
    target: ModuleId;
    reason?: string;
  } | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup suggestion timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  const hasMessages = ai.messages.length > 0;
  const conversationDepth = ai.messages.filter(m => m.role === 'user').length;

  // Auto-collapse brief when chat starts
  React.useEffect(() => {
    if (conversationDepth >= 1 && !briefCollapsed) {
      setBriefCollapsed(true);
    }
  }, [conversationDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    if (window.innerWidth < 768) setBriefCollapsed(true);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleActionParsed = useCallback((type: string, payload: Record<string, unknown>) => {
    if (type === 'delegate_to_module' && typeof payload?.moduleId === 'string') {
      const targetModuleId = payload.moduleId as ModuleId;
      const reason = typeof payload?.reason === 'string' ? payload.reason : undefined;
      setRoutingSuggestion({ target: targetModuleId, reason });
      setSuggestionCount(prev => prev + 1);
      // Auto-dismiss after 8 seconds — clear any prior timer to avoid leaks
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = setTimeout(() => setRoutingSuggestion(null), 8000);
    }
  }, []);

  // Smart routing: classify intent before sending
  const handleSendWithRouting = useCallback(async (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void
  ) => {
    const contentText = contentToText(content);
    // Skip routing in these cases per spec
    const shouldSkipRouting =
      conversationDepth === 0 || // First message stays in Nexus
      conversationDepth > 3 ||   // Deep conversation — don't break flow
      suggestionCount >= 2;      // Already suggested twice

    if (!shouldSkipRouting) {
      const decision = NexusRoutingService.classifyIntent(contentText);
      // Multi-keyword check: if target isn't orchestrator and confidence is high enough
      if (decision.target !== 'nexus' && decision.confidence >= 0.62) {
        setRoutingSuggestion({ target: decision.target, reason: decision.reason });
        setSuggestionCount(prev => prev + 1);
        // Auto-dismiss after 8 seconds — clear any prior timer to avoid leaks
        if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
        suggestionTimerRef.current = setTimeout(() => setRoutingSuggestion(null), 8000);
      }
    }

    // Always send the message to Nexus regardless of routing suggestion
    await ai.handleSendMessage(content, onActionParsed);
  }, [ai, conversationDepth, suggestionCount]);

  const handleRouteConfirm = useCallback(() => {
    if (!routingSuggestion) return;
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    setRoutingSuggestion(null);
  }, [routingSuggestion, navigate]);

  const handleRouteDismiss = useCallback(() => {
    setRoutingSuggestion(null);
  }, []);


  const handleInjectChat = useCallback((text: string) => {
    ai.handleSendMessage(text);
  }, [ai]);

  const handleConsultModule = useCallback((moduleId: string) => {
    ai.handleSendMessage(`Consult ${MODULE_MANIFEST[moduleId as ModuleId]?.title || moduleId} about my current state.`);
  }, [ai]);

  const handleAskAboutDomain = useCallback((domain: string) => {
    ai.handleSendMessage(`Tell me about my ${domain} state right now.`);
  }, [ai]);

  const handleUploadDocuments = useCallback(async (request: DocumentUploadRequest) => {
    if (!sendMessage) {
      throw new Error('AI sendMessage unavailable (missing AIProvider).');
    }
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a neutral document analyst. Follow the instructions exactly. Do NOT emit action tags.',
        memoryContext: [],
        summary: 'Nexus document analysis.',
        history: []
      });
      return response.publicText;
    };

    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
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
        setRoutingSuggestion({
          target: routeCandidate.targetModule,
          reason: `Document classified as ${routeCandidate.docType} (${Math.round((routeCandidate.targetConfidence ?? 0) * 100)}% confidence).`,
        });
      }

      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      await ai.handleSendMessage(result.prompt, undefined, { visibleContent: request.visibleContent });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [ai, analyzeImage, sendMessage]);

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

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Daily Brief — collapsible, scroll-constrained on mobile */}
      <div className={[
        'shrink-0 px-3 pt-3 pb-2 sm:px-5 sm:pt-4 space-y-2',
        !briefCollapsed ? 'max-h-[38vh] overflow-y-auto sm:max-h-none sm:overflow-visible' : '',
      ].join(' ')}>
        <NexusErrorBoundary name="DailyBrief">
          <DailyBriefSection
            collapsed={briefCollapsed}
            onToggleCollapse={() => setBriefCollapsed(!briefCollapsed)}
            onAskAboutDomain={handleAskAboutDomain}
            headerActions={(
              <>
                <NeuralButton
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
                  }}
                  className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[10px] text-white/25 hover:text-white/50 hover:bg-white/[0.07] transition-colors"
                  aria-label="Open command palette"
                >
                  <span className="font-mono">/</span>
                </NeuralButton>
                <kbd className="hidden sm:block text-[10px] font-mono text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.08] select-none pointer-events-none">
                  ⌘K
                </kbd>
                <NeuralButton
                  type="button"
                  variant="ghost"
                  onClick={() => ai.clearSession()}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] text-white/40 hover:text-rose-300 hover:bg-rose-500/10 transition-colors h-auto"
                  aria-label="Clear Link"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold uppercase tracking-wider">Clear Link</span>
                </NeuralButton>
              </>
            )}
          />
        </NexusErrorBoundary>

        {!briefCollapsed && (
          <NexusErrorBoundary name="SynthesisPanel">
            <SynthesisPanel
              onInjectChat={handleInjectChat}
              onConsultModule={handleConsultModule}
              onNavigate={(path) => navigate(path)}
            />
          </NexusErrorBoundary>
        )}
      </div>

      {/* Busy state banner — compact, full-width */}
      {isNexusBusy && (
        <div className="shrink-0 mx-3 mb-2 sm:mx-5">
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <p className="text-xs text-amber-300/80 truncate">{busyLabel}</p>
          </div>
        </div>
      )}

      {/* Chat area — fills remaining space */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        <NexusChat
          ai={{
            ...ai,
            handleSendMessage: handleSendWithRouting,
            isProcessing: ai.isProcessing || isNexusBusy,
          }}
          agentName={agentName}
          themeColor="cyan"
          placeholder={isMobile ? 'Ask Nexus…' : 'Ask Nexus anything — analysis, routing, or system commands…'}
          moduleId="orchestrator"
          hideClearHistory
          onActionParsed={handleActionParsed}
          onUploadDocuments={handleUploadDocuments}
        />

        {/* Routing suggestion */}
        <RoutingSuggestion
          target={routingSuggestion?.target || 'agnes'}
          reason={routingSuggestion?.reason}
          onConfirm={handleRouteConfirm}
          onDismiss={handleRouteDismiss}
          visible={routingSuggestion !== null}
        />
      </div>

      {/* Command Palette */}
      <CommandPalette
        onSynthesisRefresh={refreshGlobalSoul}
        onMemorySearch={(query) => {
          if (query) ai.handleSendMessage(`Search my memory for: ${query}`);
        }}
        onAskModule={(moduleId) => {
          handleConsultModule(moduleId);
        }}
        onExpandBrief={() => setBriefCollapsed(false)}
      />
    </div>
  );
}
