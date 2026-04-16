import React, { ReactNode, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/lib/auth-context';
import type { ModuleTheme } from '@/lib/module-manifest';
import { UnifiedAuthModal, AuthMode } from './UnifiedAuthModal';
import { stripInternalTags } from '@/lib/ai-adapters/sanitize';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';
import { PendingRequestState } from '@/lib/hooks/use-pending-recovery';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useReminderProposals } from '@/lib/hooks/use-reminder-proposals';
import { ReminderProposalCard } from '@/core/components/ReminderProposalCard';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { useMessageEditRetry } from '@/lib/hooks/use-message-edit-retry';

interface AraChatProps {
    ai: {
        messages: Message[];
        setMessages?: (msgs: Message[]) => void;
        isProcessing: boolean;
        aiState?: {
            isThinking: boolean;
            isActing: boolean;
            currentActionType: string | null;
        };
        streamingText: string;
        error: string | null;
        quota: GuestQuota | null;
        handleSendMessage: (
          content: MessageContent,
          onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
          options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; hideUserMessage?: boolean }
        ) => void;
        pendingRequest?: PendingRequestState | null;
        clearPendingRequest?: () => void;
        pendingApprovals?: import('@/lib/hooks/use-module-ai').DeferredApproval[];
        approveAction?: (executionId: string) => void;
        dismissAction?: (executionId: string) => void;
    };
    agentName: string;
    themeColor: ModuleTheme | 'module';
    placeholder?: string;
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
    onClearHistory?: () => void;
    hideClearHistory?: boolean;
    headerActions?: ReactNode;
    authMode?: AuthMode;
    showInternalSignals?: boolean;
    renderCustomActions?: () => ReactNode;
    renderMessageActions?: (message: Message, index: number) => ReactNode;
    moduleId?: string;
    onUploadDocument?: (file: File) => void;
    onUploadDocuments?: (request: DocumentUploadRequest) => void | Promise<void>;
    processingLabel?: string;
    enableSpeechToText?: boolean;
    aboveInput?: ReactNode;
}

// React.memo prevents rerenders when parent components (module pages) rerender
// due to data updates but AraChat's own props haven't changed. This is the
// final safety net that protects the chat conversation flow from being disrupted
// by data-layer writes during agent execution.
export const AraChat = React.memo(function AraChat({ 
    ai, 
    agentName, 
    themeColor, 
    placeholder, 
    onActionParsed, 
    onClearHistory,
    hideClearHistory,
    headerActions,
    authMode = 'global',
    showInternalSignals = true,
    renderCustomActions,
    renderMessageActions,
    moduleId,
    onUploadDocument,
    onUploadDocuments,
    processingLabel,
    enableSpeechToText = false,
    aboveInput,
}: AraChatProps) {
    const { isGuest } = useAuth();
    const [showAuth, setShowAuth] = React.useState(false);

    const { messages, setMessages, isProcessing, aiState, streamingText, error, quota, handleSendMessage, pendingRequest, clearPendingRequest, pendingApprovals, approveAction, dismissAction } = ai;

    // Build a stable no-op setMessages if the caller doesn't provide one
    const noopSetMessages = useCallback((_msgs: Message[]) => { /* edit/retry unavailable */ }, []);
    const resolvedSetMessages = setMessages ?? noopSetMessages;

    // Wrap handleSendMessage to drop the optional extra args so the hook signature (MessageContent) → void is satisfied
    const sendMessageForHook = useCallback(
      (content: MessageContent) => handleSendMessage(content, onActionParsed),
      [handleSendMessage, onActionParsed],
    );

    // Stable callback for ChatInterface — avoids breaking React.memo on every render
    const handleChatSend = useCallback(
      (content: string) => handleSendMessage(content, onActionParsed),
      [handleSendMessage, onActionParsed],
    );

    const { editUserMessage, retryUserMessage } = useMessageEditRetry(
      messages,
      resolvedSetMessages,
      sendMessageForHook,
    );

    const handleEditMessage = useCallback(
      (index: number, newContent: string) => {
        const msg = messages[index];
        if (!msg || msg.role !== 'user') return;
        editUserMessage(index, newContent);
      },
      [messages, editUserMessage],
    );

    const canEditRetry = !!setMessages;

    const canRenderReminderActions = !renderMessageActions && !!moduleId;
    const { activeProposal, status: proposalStatus, confirm, dismiss, isConfirming, isDismissing, resetStatus } = useReminderProposals(
      (moduleId === 'orchestrator' || moduleId === 'ara') ? 'any' : (moduleId ?? 'any'),
    );
    const lastAssistantIndex = useMemo(() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') return i;
      }
      return -1;
    }, [messages]);

    const reminderMessageActions = useCallback((message: Message, index: number) => {
      if (message.role !== 'assistant') return null;
      if (index !== lastAssistantIndex) return null;

      // Determine if a proposal action was initiated by this message
      const contentStr = typeof message.content === 'string'
        ? message.content
        : message.content.filter(p => p.type === 'text').map(p => (p as any).text).join(' ');
      const hasProposeAction = contentStr.includes('<action type="propose_reminder"');

      if (!activeProposal && !isProcessing && hasProposeAction) {
        if (proposalStatus === 'confirmed') {
          return (
            <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit">
              <span className="text-[11px] font-black uppercase tracking-widest">Reminder Scheduled</span>
            </div>
          );
        }
        if (proposalStatus === 'dismissed') {
          return (
            <div className="flex items-center gap-2 px-3 py-2 mt-2 rounded-xl bg-white/[0.045] border border-white/[0.12] text-white/40 w-fit">
              <span className="text-[11px] font-black uppercase tracking-widest">Proposal Dismissed</span>
            </div>
          );
        }
        if (proposalStatus === 'idle') {
          return (
             <div className="flex items-center gap-3 px-4 py-3 mt-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 w-fit">
               <div className="min-w-0">
                 <p className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-300/70">
                   Proposal Failed
                 </p>
                 <p className="mt-1 text-[11px] text-rose-200/80 break-words">
                   The agent could not schedule the reminder.
                 </p>
               </div>
             </div>
          );
        }
      }

      return null;
    }, [activeProposal, confirm, dismiss, isConfirming, isDismissing, lastAssistantIndex, isProcessing, proposalStatus]);

    const prevMessagesLength = useRef(messages.length);
    const prevIsProcessing = useRef(isProcessing);

    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            const latestMessage = messages[messages.length - 1];
            if (latestMessage.role === 'user') {
                 Spine.publish({
                     type: 'NEURAL_TRANSMISSION_SENT',
                     domain: 'system',
                     source: moduleId || 'ara',
                     priority: 'info',
                     data: { agent: agentName }
                 });
            } else if (latestMessage.role === 'assistant') {
                 const contentStr = typeof latestMessage.content === 'string' 
                    ? latestMessage.content 
                    : latestMessage.content.filter(p => p.type === 'text').map(p => (p as any).text).join(' ');
                 const { publicText } = stripInternalTags(contentStr);
                 Spine.publish({
                     type: 'NEURAL_RESONANCE_RECEIVED',
                     domain: moduleId === 'agnes' ? 'E' : moduleId === 'titan' ? 'B' : moduleId === 'atlas' ? 'C' : 'system',
                     source: moduleId || 'ara',
                     priority: 'info',
                     data: { 
                         agent: agentName,
                         content: publicText
                     }
                 });
            }
        }
        prevMessagesLength.current = messages.length;
    }, [messages, moduleId, agentName]);

    useEffect(() => {
        if (isProcessing && !prevIsProcessing.current) {
            // Started processing
            Spine.publish({
                 type: 'NEURAL_PROCESSING_STARTED',
                 domain: moduleId === 'agnes' ? 'E' : moduleId === 'titan' ? 'B' : moduleId === 'atlas' ? 'C' : 'system',
                 source: moduleId || 'ara',
                 priority: 'info',
                 data: { agent: agentName }
            });
        }
        prevIsProcessing.current = isProcessing;
    }, [isProcessing, moduleId, agentName]);

    // streamingText is now already cleaned by the Orchestrator delta logic
    const visibleStreamingText = streamingText.trim();
    const hasVisibleStream = visibleStreamingText.length > 0;

    // RC-2 fix: memoize transientStreamMessage so its reference is stable when
    // not streaming. Without this, every re-render of AraChat (e.g. triggered
    // by a profile subscription update) created a new object and array, causing
    // ChatInterface's React.memo shallow comparison to fail and forcing a re-render
    // mid-stream or after data writes — the "page reload" effect.
    const transientStreamMessage = useMemo(() => {
        if (!hasVisibleStream) return null;
        return { role: 'assistant' as const, content: visibleStreamingText };
    }, [hasVisibleStream, visibleStreamingText]);

    const renderedMessages = useMemo(
        () => (transientStreamMessage ? [...messages, transientStreamMessage] : messages),
        [messages, transientStreamMessage],
    );

    // Show the loading/thinking bubble if:
    // 1. AI is processing AND (
    //    a. We haven't started the stream yet (last message is from user/empty)
    //    b. OR the AI is explicitly in an acting state (performing an internal action)
    // )
    const isGeneratingReminderProposal = isProcessing && streamingText.includes('<action type="propose_reminder"');

    // Show the loading/thinking bubble if:
    // 1. AI is processing AND (
    //    a. We haven't started the stream yet (last message is from user/empty)
    //    b. OR the AI is explicitly in an acting state (performing an internal action)
    //    c. OR the AI is actively streaming a reminder proposal, to satisfy "just show loading until proposal appears"
    // )
    const isInitialThinking = (messages.length === 0 || messages[messages.length - 1].role === 'user') && !hasVisibleStream;
    const isActuallyThinking = isProcessing && (isInitialThinking || !!aiState?.isActing || isGeneratingReminderProposal);

    useEffect(() => {
        if (isGeneratingReminderProposal && proposalStatus !== 'idle') {
            resetStatus();
        }
    }, [isGeneratingReminderProposal, proposalStatus, resetStatus]);

    // Sync phase: AI has finished its entire stream (public + internal) but
    // background handlers (database writes, resonance synthesis) are still running.
    const isSyncing = isProcessing && !hasVisibleStream && !isActuallyThinking;

    // RC-2 fix: stabilize callbacks passed to ChatInterface so its React.memo
    // comparison doesn't fail when AraChat re-renders due to parent updates
    // (e.g. module profile subscription firing after an AI action writes data).
    const handleQuotaExhausted = useCallback(() => setShowAuth(true), []);
    const handleRecoverPendingRequest = useCallback(() => {
      if (pendingRequest) {
        const content = typeof pendingRequest.userMessage === 'string'
          ? pendingRequest.userMessage
          : pendingRequest.userMessage.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ');
        clearPendingRequest?.();
        handleSendMessage(content, onActionParsed);
      }
    }, [pendingRequest, clearPendingRequest, handleSendMessage, onActionParsed]);
    const handleDismissPendingRequest = useCallback(() => clearPendingRequest?.(), [clearPendingRequest]);
    const handleRetry = useCallback(() => {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        const content = typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : lastUserMsg.content.filter(p => p.type === 'text').map(p => (p as any).text).join(' ');
        handleSendMessage(content, onActionParsed);
      }
    }, [messages, handleSendMessage, onActionParsed]);

    return (
        <div className="flex-1 flex flex-col min-h-0 relative h-full">
            {activeProposal && (
                <div className="shrink-0 p-3 sm:p-4 bg-slate-900 border-b border-white/[0.12] z-10 relative">
                    <ReminderProposalCard
                        proposal={activeProposal}
                        onConfirm={confirm}
                        onDismiss={dismiss}
                        isConfirming={isConfirming}
                        isDismissing={isDismissing}
                    />
                </div>
            )}
            <ChatInterface
                messages={renderedMessages}
                onSendMessage={handleChatSend}
                onClearHistory={onClearHistory}
                hideClearHistory={hideClearHistory}
                isLoading={isActuallyThinking}
                isSyncing={isSyncing}
                isProcessing={isProcessing}
                aiState={aiState}
                themeColor={themeColor}
                agentName={agentName}
                placeholder={placeholder}
                error={error}
                isGuestTrial={isGuest}
                quota={quota ?? undefined}
                onQuotaExhausted={handleQuotaExhausted}
                showInternalSignals={showInternalSignals}
                renderCustomActions={renderCustomActions}
                renderMessageActions={canRenderReminderActions ? reminderMessageActions : renderMessageActions}
                moduleId={moduleId}
                onUploadDocument={onUploadDocument}
                onUploadDocuments={onUploadDocuments}
                headerActions={headerActions}
                processingLabel={processingLabel}
                enableSpeechToText={enableSpeechToText}
                pendingRequest={pendingRequest}
                onRecoverPendingRequest={handleRecoverPendingRequest}
                onDismissPendingRequest={handleDismissPendingRequest}
                onRetry={handleRetry}
                aboveInput={aboveInput}
                onEditMessage={canEditRetry ? handleEditMessage : undefined}
                onRetryMessage={canEditRetry ? retryUserMessage : undefined}
                pendingApprovals={pendingApprovals}
                onApproveAction={approveAction}
                onDismissAction={dismissAction}
            />

            <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode={authMode} />
        </div>
    );
});
