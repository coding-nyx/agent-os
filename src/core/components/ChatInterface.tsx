import React, { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Loader2,
  ChevronDown, Lock, Zap,
  ArrowRight, Plus, FileText, BarChart3, X,
  Mic, MicOff,
  Search, Trash2, RefreshCw, AlertTriangle, MoreVertical, Terminal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message, GuestQuota, MessageContent } from '@/lib/types';
import type { ModuleId } from '@/lib/module-manifest';
import { NeuralLinkAlert } from './NeuralLinkAlert';
import { NeuralButton, NeuralIconButton } from './NeuralButton';
import { NeuralTextarea } from './NeuralTextarea';
import { EmptyState } from '@/core/components/EmptyState';
import { getActionLabel } from '@/lib/actions/action-labels';
import { PendingRequestState } from '@/lib/hooks/use-pending-recovery';
import { DocumentMessageCard, parseDocumentMessage, parseDocumentUploadMessage } from './DocumentMessageCard';
import { useDebugMode } from '@/lib/hooks/use-debug-mode';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { buildDocumentUploadVisibleMessage, summarizeDocumentUploadMessage } from '@/lib/services/document-upload-message';
import { useSpeechToText } from '@/lib/hooks/use-speech-to-text';
import type { ActorIdentityRef } from '@/lib/agent-identity';
import { resolveConversationalActorIdentity } from '@/lib/agent-identity';
import { AgentIcon } from './AgentIcon';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { useMotionConfig } from '@/lib/hooks/use-motion-config';
import { ChatBubble, contentToString } from './chat/ChatBubble';
import { DeferredApprovalCard } from './chat/DeferredApprovalCard';
import type { DeferredApproval } from '@/lib/hooks/use-module-ai';

// Helper to convert MessageContent to string for display (kept for non-bubble usages below)
function messageContentToString(content: MessageContent): string {
  return contentToString(content);
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  isSyncing?: boolean;
  isProcessing?: boolean;
  aiState?: {
    isThinking: boolean;
    isActing: boolean;
    currentActionType: string | null;
  };
  themeColor: 'indigo' | 'orange' | 'cyan' | 'violet' | 'emerald' | 'sky' | 'lime' | 'rose' | 'fuchsia' | 'slate' | 'module';
  placeholder?: string;
  agentName: string;
  error?: string | null;
  onRetry?: () => void;
  onClearHistory?: () => void;
  hideClearHistory?: boolean;
  isGuestTrial?: boolean;
  quota?: GuestQuota;
  onQuotaExhausted?: () => void;
  showInternalSignals?: boolean;
  renderCustomActions?: () => React.ReactNode;
  renderMessageActions?: (message: Message, index: number) => React.ReactNode;
  moduleId?: string;
  headerActions?: React.ReactNode;
  pendingRequest?: PendingRequestState | null;
  onRecoverPendingRequest?: () => void;
  onDismissPendingRequest?: () => void;
  onUploadDocument?: (file: File) => void;
  onUploadDocuments?: (request: DocumentUploadRequest) => void | Promise<void>;
  processingLabel?: string;
  enableSpeechToText?: boolean;
  assistantIdentity?: ActorIdentityRef;
  aboveInput?: React.ReactNode;
  /** Called when the user saves an inline edit on a message at the given index. */
  onEditMessage?: (index: number, newContent: string) => void;
  /** Called when the user clicks retry on a message at the given index. */
  onRetryMessage?: (index: number) => void;
  /** Pending high-risk actions awaiting user approval. */
  pendingApprovals?: DeferredApproval[];
  onApproveAction?: (executionId: string) => void;
  onDismissAction?: (executionId: string) => void;
}

const THEMES = {
  indigo: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-indigo-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-indigo-950/85 border-indigo-500/30 border-r-[3px] border-r-indigo-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-indigo-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-indigo-500/25',
    btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/40'
  },
  orange: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-orange-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-orange-950/85 border-orange-500/30 border-r-[3px] border-r-orange-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-orange-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-orange-500/25',
    btn: 'bg-orange-600 hover:bg-orange-500 shadow-lg shadow-orange-500/40'
  },
  cyan: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-cyan-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-cyan-950/85 border-cyan-500/30 border-r-[3px] border-r-cyan-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-cyan-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-cyan-500/25',
    btn: 'bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-500/40'
  },
  violet: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-violet-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-violet-950/85 border-violet-500/30 border-r-[3px] border-r-violet-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-violet-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-violet-500/25',
    btn: 'bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/40'
  },
  emerald: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-emerald-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-emerald-950/85 border-emerald-500/30 border-r-[3px] border-r-emerald-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-emerald-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-emerald-500/25',
    btn: 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/40'
  },
  sky: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-sky-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-sky-950/85 border-sky-500/30 border-r-[3px] border-r-sky-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-sky-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-sky-500/25',
    btn: 'bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-500/40'
  },
  lime: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-lime-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-lime-950/85 border-lime-500/30 border-r-[3px] border-r-lime-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-lime-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-lime-500/25',
    btn: 'bg-lime-600 hover:bg-lime-500 shadow-lg shadow-lime-500/40'
  },
  rose: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-rose-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-rose-950/85 border-rose-500/30 border-r-[3px] border-r-rose-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-rose-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-rose-500/25',
    btn: 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-500/40'
  },
  fuchsia: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-fuchsia-400/80 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-fuchsia-950/85 border-fuchsia-500/30 border-r-[3px] border-r-fuchsia-400/70 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-fuchsia-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-fuchsia-500/25',
    btn: 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-lg shadow-fuchsia-500/40'
  },
  slate: {
    bubble: 'bg-slate-800/90 border-white/[0.10] border-l-[3px] border-l-slate-400/70 text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-slate-700/85 border-slate-500/30 border-r-[3px] border-r-slate-400/60 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-slate-400',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-slate-500/25',
    btn: 'bg-slate-600 hover:bg-slate-500 shadow-lg shadow-slate-500/30'
  },
  module: {
    bubble: 'bg-slate-900/85 border-white/[0.09] border-l-[3px] border-l-[var(--module-color-400,theme(colors.indigo.400))] text-white rounded-2xl rounded-tl-sm',
    userBubble: 'bg-[var(--module-accent-subtle,theme(colors.indigo.950/0.85))] border-[var(--module-accent-border)] border-r-[3px] text-white rounded-2xl rounded-tr-sm',
    accent: 'text-[var(--module-color-400)]',
    glow: 'shadow-2xl shadow-black/70',
    bgGlow: 'bg-[var(--module-accent-glow)]',
    btn: 'bg-[var(--module-accent)] hover:bg-[var(--module-accent-hover)] shadow-lg shadow-[var(--module-accent-muted)]'
  }
};

type ThemeConfig = typeof THEMES[keyof typeof THEMES];

// ⚡ Bolt Performance Optimization:
// Wrapped ChatInterface in React.memo to prevent unnecessary re-renders when parent components update.
// This is critical since ChatInterface is a heavy component that receives deep props (messages, aiState).
export const ChatInterface = React.memo(function ChatInterface({
  messages, 
  onSendMessage, 
  isLoading, 
  isSyncing,
  isProcessing,
  aiState,
  themeColor, 
  placeholder = "Communicate...",
  agentName,
  error,
  onRetry,
  onClearHistory,
  hideClearHistory,
  isGuestTrial,
  quota,
  onQuotaExhausted,
  showInternalSignals = true,
  renderCustomActions,
  renderMessageActions,
  moduleId,
  headerActions,
  pendingRequest,
  onRecoverPendingRequest,
  onDismissPendingRequest,
  onUploadDocument,
  onUploadDocuments,
  processingLabel,
  enableSpeechToText = false,
  assistantIdentity,
  aboveInput,
  onEditMessage,
  onRetryMessage,
  pendingApprovals,
  onApproveAction,
  onDismissAction,
}: ChatInterfaceProps) {
  const draftKey = `nexus_input_draft_${moduleId ?? 'default'}`;
  const [input, setInput] = useState<string>(() => {
    try { return localStorage.getItem(draftKey) ?? ''; } catch { return ''; }
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewCompletion, setHasNewCompletion] = useState(false);
  const [draftUploads, setDraftUploads] = useState<Array<{ file: File; previewUrl?: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const { debugMode } = useDebugMode();
  const { transition, shouldReduceMotion } = useMotionConfig();
  const chatActorIdentityEnabled = AutonomyFeatureFlags.isEnabled('chatActorIdentity');
  const resolvedAssistantIdentity = resolveConversationalActorIdentity({
    moduleId: moduleId && moduleId !== 'user' && moduleId !== 'system' ? moduleId as ModuleId : undefined,
    actorId: chatActorIdentityEnabled ? assistantIdentity?.actorId : undefined,
    actorLabel: chatActorIdentityEnabled ? assistantIdentity?.actorLabel : undefined,
    actorShortLabel: chatActorIdentityEnabled ? assistantIdentity?.actorShortLabel : undefined,
    fallbackLabel: agentName,
  });
  const speechToText = useSpeechToText({
    enabled: enableSpeechToText,
    value: input,
    onValueChange: setInput,
  });
  const {
    clearError: clearSpeechError,
    error: speechError,
    interimTranscript,
    isListening: isSpeechListening,
    isSupported: isSpeechSupported,
    stopListening: stopSpeechToText,
    toggleListening: toggleSpeechToText,
  } = speechToText;
  
  const effectiveIsProcessing = isProcessing !== undefined ? isProcessing : isLoading;
  const isComposerDisabled = effectiveIsProcessing || !!error || Boolean(quota?.isHardLocked);
  const isSpeechButtonDisabled =
    isComposerDisabled || (enableSpeechToText && !isSpeechSupported && !isSpeechListening);
  const speechStatusMessage = !enableSpeechToText
    ? null
    : speechError
      ? speechError
      : !isSpeechSupported
        ? 'Speech-to-text is unavailable in this browser.'
        : isSpeechListening
          ? interimTranscript
            ? `Listening… ${interimTranscript}`
            : 'Listening… tap the mic again when you are done.'
          : null;

  // Persist draft to localStorage as user types (debounced 400ms)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (input) {
          localStorage.setItem(draftKey, input);
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch { /* storage unavailable */ }
    }, 400);
    return () => clearTimeout(t);
  }, [input, draftKey]);

  useEffect(() => {
    if (isComposerDisabled && isSpeechListening) {
      stopSpeechToText();
    }
  }, [isComposerDisabled, isSpeechListening, stopSpeechToText]);

  // Auto-resize textarea to fit content
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
    }
  }, []);

  // Smart auto-scroll: only scroll if user is already near the bottom OR it's a user message
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.role === 'user';
    
    if (isUserMessage || isNearBottomRef.current) {
      scrollToBottom(messages.length <= 2 ? 'instant' : 'smooth');
      setHasNewCompletion(false);
    } else if (lastMessage?.role === 'assistant' || isLoading) {
      // If we are scrolled up and AI is responding, flag for manual scroll
      setHasNewCompletion(true);
    }
  }, [messages, isLoading, error, scrollToBottom]);

  // Track scroll position to detect if user scrolled up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 150;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < threshold;
      isNearBottomRef.current = nearBottom;
      setShowScrollButton(distanceFromBottom > threshold);
      
      if (nearBottom) {
        setHasNewCompletion(false);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveIsProcessing || error || quota?.isHardLocked) return;
    if (draftUploads.length > 0) {
      const files = draftUploads.map((draft) => draft.file);
      if (onUploadDocuments) {
        void (async () => {
          const caption = input.trim() || undefined;
          const visibleContent = await buildDocumentUploadVisibleMessage(files, caption);
          await onUploadDocuments({ files, caption, visibleContent });
        })();
      } else if (onUploadDocument) {
        onUploadDocument(files[0]);
      }
      draftUploads.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
      setDraftUploads([]);
      setInput('');
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setIsDrawerOpen(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setIsDrawerOpen(false);
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const theme = THEMES[themeColor];
  const canShowUpload =
    typeof onUploadDocument === 'function' || typeof onUploadDocuments === 'function';
  const uploadLabel = typeof onUploadDocuments === 'function' ? 'Upload Docs' : 'Upload Doc';

  const handleUploadDocClick = useCallback(() => {
    if (!onUploadDocument && !onUploadDocuments) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.md,.markdown';
    input.multiple = typeof onUploadDocuments === 'function';
    input.onchange = (e: Event) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;
      setDraftUploads((current) => {
        current.forEach((draft) => {
          if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        });
        return files.map((file) => ({
          file,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        }));
      });
      setIsDrawerOpen(false);
      input.value = '';
    };
    input.click();
  }, [onUploadDocument, onUploadDocuments]);

  useEffect(() => {
    return () => {
      draftUploads.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
    };
  }, [draftUploads]);
  const isAgnes = moduleId === 'agnes';
  const isOrchestrator = moduleId === 'orchestrator' || moduleId === 'nexus';

  const hasMessages = messages.some((msg) => msg.role !== 'system');

  // Per-message internal signal panel open state (keyed by message index)
  const [showInternalMap, setShowInternalMap] = React.useState<Record<number, boolean>>({});
  const toggleInternalForMessage = React.useCallback((idx: number) => {
    setShowInternalMap((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  // Compute the set of indices for the last 3 USER messages.
  // Edit/retry controls are only shown on user bubbles at these indices.
  const last3Indices = React.useMemo(() => {
    const userIndices = messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === 'user')
      .map(({ i }) => i);
    return new Set(userIndices.slice(-3));
  }, [messages]);

  return (
    <div
      className={cn(
        "flex-1 flex flex-col w-full mx-auto relative min-h-0 h-full"
      )}
    >
      {/* Header actions (full-width, e.g. DiagnosisToolbar) */}
      {headerActions && (
        <div className="shrink-0 flex items-center justify-end px-3 sm:px-4 py-2">{headerActions}</div>
      )}

      {/* Clear session button */}
      {onClearHistory && !hideClearHistory && !isOrchestrator && (
        <div className="shrink-0 flex justify-end px-3 sm:px-6 py-2 sm:py-3 border-b border-white/[0.09] relative z-10">
          <details className="relative group">
            <summary className="list-none p-2.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 cursor-pointer transition-all focus:outline-none [&::-webkit-details-marker]:hidden min-w-[44px] min-h-[44px] flex items-center justify-center" title="Chat Options">
              <MoreVertical className="w-4 h-4" />
            </summary>
            <div className="absolute right-0 top-full mt-1 w-40 p-1 bg-slate-900 border border-white/[0.12] rounded-xl shadow-2xl">
              <NeuralButton
                variant="ghost"
                onClick={(e) => {
                  e.currentTarget.closest('details')?.removeAttribute('open');
                  onClearHistory();
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg hover:bg-rose-500/10 text-white/40 hover:text-rose-400 transition-all text-left h-auto"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Clear Link</span>
              </NeuralButton>
            </div>
          </details>
        </div>
      )}

      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversation messages" className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 sm:py-6 space-y-5 sm:space-y-6 no-scrollbar scrollbar-ghost scroll-smooth min-h-0">
        {!hasMessages && !isLoading && !error && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              title="Link idle"
              description={`Send a message to ${agentName} to begin the session.`}
              size="lg"
              className="max-w-md"
            />
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (msg.role === 'system') return null;
            const isAI = msg.role === 'assistant';
            const isLast = i === messages.length - 1;
            const actorIdentity = isAI
              ? resolveConversationalActorIdentity({
                  moduleId: moduleId && moduleId !== 'user' && moduleId !== 'system' ? moduleId as ModuleId : undefined,
                  actorId: chatActorIdentityEnabled ? (msg.actor?.actorId ?? assistantIdentity?.actorId) : undefined,
                  actorLabel: chatActorIdentityEnabled ? (msg.actor?.actorLabel ?? assistantIdentity?.actorLabel) : undefined,
                  actorShortLabel: chatActorIdentityEnabled ? (msg.actor?.actorShortLabel ?? assistantIdentity?.actorShortLabel) : undefined,
                  fallbackLabel: agentName,
                })
              : resolveConversationalActorIdentity({ source: 'user' });
            
            const actions = renderMessageActions ? renderMessageActions(msg, i) : null;
            return (
              <motion.div key={msg.timestamp ? `${msg.timestamp}-${msg.role}-${i}` : `msg-${i}`} initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className={cn("flex flex-col w-full", isAI ? "items-start" : "items-end")}>
                {/* Icon row — for AI messages includes optional internal-signals chip */}
                {isAI && (() => {
                  const msgContent = contentToString(msg.content);
                  const hasInternalTags = msgContent.includes('<think') || msgContent.includes('<action');
                  const showChip = (showInternalSignals || debugMode) && hasInternalTags && !(isLast && effectiveIsProcessing);
                  return (
                    <div className="flex items-center gap-2 mb-1.5">
                      <AgentIcon
                        moduleId={moduleId && moduleId !== 'user' && moduleId !== 'system' ? moduleId as ModuleId : undefined}
                        actorId={actorIdentity.id}
                        actorLabel={actorIdentity.label}
                        actorShortLabel={actorIdentity.shortLabel}
                        withBackground
                        className={cn(
                          "shrink-0 transition-colors",
                          isAgnes
                            ? "w-7 h-7 rounded-xl border border-indigo-400/20 shadow-lg shadow-indigo-500/20"
                            : "w-6 h-6 rounded-lg border border-white/[0.12] shadow-xl",
                        )}
                      />
                      {showChip && (
                        <button
                          type="button"
                          onClick={() => toggleInternalForMessage(i)}
                          className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wider transition-all",
                            showInternalMap[i]
                              ? "bg-indigo-500/20 border-indigo-400/30 text-indigo-400"
                              : "bg-white/[0.045] border-white/[0.09] text-white/35 hover:text-white/60 hover:bg-white/[0.08]",
                          )}
                          title="Toggle internal signals"
                          aria-label="Toggle internal signals"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>Signals</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
                {!isAI && (
                  <AgentIcon
                    source="user"
                    actorLabel={actorIdentity.label}
                    actorShortLabel={actorIdentity.shortLabel}
                    withBackground
                    className={cn(
                      "shrink-0 mb-1.5",
                      isAgnes
                        ? "w-7 h-7 rounded-xl border border-white/[0.12] shadow-lg"
                        : "w-6 h-6 rounded-lg border border-white/[0.12] shadow-xl"
                    )}
                  />
                )}
                {/* Bubble below icon, left edge of AI bubble / right edge of user bubble aligns with icon */}
                {isAI ? (
                    <div className="w-full flex flex-col items-start min-w-0">
                        <ChatBubble
                          role="assistant"
                          content={msg.content}
                          theme={theme}
                          actorLabel={actorIdentity.label}
                          isLast={isLast}
                          isLoading={effectiveIsProcessing}
                          isAgnes={isAgnes}
                          debugMode={debugMode}
                          debugMeta={msg.debugMeta}
                          isStreaming={isLast && effectiveIsProcessing}
                          showInternalSignals={showInternalSignals}
                          timestamp={msg.timestamp}
                          externalShowInternal={showInternalMap[i] ?? false}
                          onToggleInternal={() => toggleInternalForMessage(i)}
                        />
                        {isLast && !effectiveIsProcessing && pendingApprovals && pendingApprovals.length > 0 && (
                          <div className="w-full mt-1 space-y-1">
                            {pendingApprovals.map((approval) => (
                              <DeferredApprovalCard
                                key={approval.executionId}
                                approval={approval}
                                moduleId={moduleId ?? 'nexus'}
                                onApprove={(id) => onApproveAction?.(id)}
                                onDismiss={(id) => onDismissAction?.(id)}
                              />
                            ))}
                          </div>
                        )}
                    </div>
                ) : (
                    (() => {
                      const textContent = messageContentToString(msg.content);
                      const uploadParsed = parseDocumentUploadMessage(textContent);
                      const timeLabel = msg.timestamp
                        ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      if (uploadParsed) {
                        return (
                          <div className="flex flex-col max-w-[95%] sm:max-w-[85%] w-fit items-end">
                            <DocumentMessageCard upload={uploadParsed} themeAccent={theme.accent} />
                            <div className="mt-1.5 opacity-30 px-1">
                              <span className="text-[11px] font-mono uppercase tracking-wider text-white">{timeLabel}</span>
                            </div>
                          </div>
                        );
                      }
                      const docParsed = parseDocumentMessage(textContent);
                      if (docParsed) {
                        return (
                          <div className="flex flex-col max-w-[95%] sm:max-w-[85%] w-fit items-end">
                            <DocumentMessageCard doc={docParsed} themeAccent={theme.accent} />
                            <div className="mt-1.5 opacity-30 px-1">
                              <span className="text-[11px] font-mono uppercase tracking-wider text-white">{timeLabel}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <ChatBubble
                          role="user"
                          content={msg.content}
                          theme={theme}
                          isAgnes={isAgnes}
                          timestamp={msg.timestamp}
                          onEdit={
                            last3Indices.has(i) && !effectiveIsProcessing && onEditMessage
                              ? (newContent) => onEditMessage(i, newContent)
                              : undefined
                          }
                          onRetry={
                            last3Indices.has(i) && !effectiveIsProcessing && onRetryMessage
                              ? () => onRetryMessage(i)
                              : undefined
                          }
                        />
                      );
                    })()
                )}
                {actions && (
                  <div className="mt-4 self-stretch overflow-hidden">
                    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.045] p-1 shadow-sm">
                      {actions}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-start">
            <div className={cn("w-6 h-6 rounded-lg border border-white/[0.12] flex items-center justify-center bg-slate-900/85 shrink-0 shadow-xl mb-1.5", theme.accent)}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div className={cn("px-6 py-4 border backdrop-blur-3xl flex items-center gap-3", theme.bubble)}>
              <span className="text-[11px] uppercase font-semibold tracking-[0.10em] text-white/55">
                {aiState?.isActing 
                  ? `${getActionLabel(aiState.currentActionType || 'action')}...` 
                  : (aiState?.isThinking ? 'Processing Neural Signals...' : `${resolvedAssistantIdentity.label} is thinking`)}
              </span>
              <span className={cn("flex gap-1.5", theme.accent)}>
                <span className="w-2 h-2 rounded-full bg-current opacity-80 animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-current opacity-80 animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 rounded-full bg-current opacity-80 animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </motion.div>
        )}
        {error && onRetry && <NeuralLinkAlert error={error} onRetry={onRetry} />}
        <div ref={bottomSentinelRef} className="h-px" />
      </div>

      <AnimatePresence>
        {(showScrollButton || hasNewCompletion) && (
          <NeuralButton
            variant="ghost"
            onClick={() => { scrollToBottom(); isNearBottomRef.current = true; setHasNewCompletion(false); }}
            className={cn(
              "absolute bottom-36 left-1/2 -translate-x-1/2 z-[var(--z-toast)] flex items-center gap-3 px-5 py-2.5 rounded-full border backdrop-blur-xl transition-all shadow-2xl h-auto",
              hasNewCompletion 
                ? "bg-white/10 border-white/20 text-white animate-pulse" 
                : "bg-slate-900/90 border-white/[0.12] text-white/60 hover:text-white hover:border-white/20",
              theme.accent
            )}
          >
            <ChevronDown className={cn("w-4 h-4", hasNewCompletion && "animate-bounce")} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              {hasNewCompletion ? "New response" : "Scroll to latest"}
            </span>
            {hasNewCompletion && (
              <div className={cn("w-1.5 h-1.5 rounded-full bg-current animate-ping")} />
            )}
          </NeuralButton>
        )}
      </AnimatePresence>

      {/* Processing status strip — always visible above input regardless of scroll position */}
      <AnimatePresence>
        {(isSyncing || !!processingLabel) && (
          <motion.div
            key="processing-strip"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 overflow-hidden px-3 sm:px-6 pb-2"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.045] border border-white/[0.09]">
              <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-white/45 truncate">
                {processingLabel
                  ? processingLabel
                  : aiState?.isActing && aiState.currentActionType
                  ? getActionLabel(aiState.currentActionType)
                  : isSyncing
                  ? 'Saving…'
                  : 'Thinking…'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area pinned to bottom via flex layout */}
      <div className="shrink-0 px-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 pt-2">
        <AnimatePresence>
          {pendingRequest && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="flex flex-col gap-2 p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-md shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[11px] font-black uppercase tracking-widest">
                      {pendingRequest.status === 'failed' ? 'Connection Failed' : 'Unfinished Signal Detected'}
                    </span>
                  </div>
                  <NeuralButton variant="ghost" size="sm" onClick={onDismissPendingRequest} className="text-amber-400/50 hover:text-amber-400 h-auto p-1">
                    <X className="w-4 h-4" />
                  </NeuralButton>
                </div>
                <p className="text-sm text-amber-300/85 leading-relaxed">
                  A transmission was interrupted. Recover and retransmit the message below?
                </p>
                <div className="p-3 mt-1 rounded-lg bg-slate-900/70 border border-white/[0.09] text-sm text-white/70 italic font-medium truncate">
                  "{(() => {
                    const pendingText = messageContentToString(pendingRequest.userMessage);
                    const pendingUpload = parseDocumentUploadMessage(pendingText);
                    return pendingUpload ? summarizeDocumentUploadMessage(pendingUpload) : pendingText;
                  })()}"
                </div>
                <div className="flex justify-end gap-3 mt-2">
                  <NeuralButton variant="ghost" size="sm" onClick={onDismissPendingRequest} className="text-amber-400 hover:bg-amber-400/10">
                    Discard
                  </NeuralButton>
                  <NeuralButton variant="primary" size="sm" onClick={onRecoverPendingRequest} className="bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20">
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Retransmit
                  </NeuralButton>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
            {quota?.isHardLocked && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute inset-x-0 bottom-full mb-10 z-[var(--z-toast)]">
                    <div className="bg-[#05050a]/95 backdrop-blur-3xl border border-white/[0.12] rounded-card-strong p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] text-center space-y-8">
                        <div className="w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
                            <Lock className="w-10 h-10 text-orange-400" />
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-3xl font-bold font-display uppercase text-white tracking-tighter">Neural Link Severed</h3>
                            <p className="text-white/40 text-sm italic font-medium leading-relaxed px-12">Trial synchronization complete. Initialize a persistent soul-link to resume encrypted deep-work.</p>
                        </div>
                        <NeuralButton size="xl" className="w-full h-16 text-lg" onClick={onQuotaExhausted}>
                            Initialize Persistent Link <ArrowRight className="w-5 h-5 ml-2" />
                        </NeuralButton>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <div className="relative">
          {draftUploads.length > 0 && (
            <div className="mb-3 rounded-2xl border border-white/[0.12] bg-white/[0.045] p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Attachments ready</p>
                  <p className="mt-1 text-xs text-white/55">Add optional context in the composer, then send.</p>
                </div>
                <NeuralButton
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    draftUploads.forEach((draft) => {
                      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
                    });
                    setDraftUploads([]);
                  }}
                  className="h-auto p-2 text-white/45"
                >
                  <X className="w-4 h-4" />
                </NeuralButton>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {draftUploads.map((draft, index) => (
                  <div
                    key={`${draft.file.name}-${index}`}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.12] bg-slate-900/50 px-3 py-2"
                  >
                    {draft.previewUrl ? (
                      <img src={draft.previewUrl} alt={draft.file.name} className="h-10 w-10 rounded-lg object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white/80">{draft.file.name}</p>
                      <p className="text-[11px] text-white/45">{Math.max(1, Math.round(draft.file.size / 1024))} KB</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 w-80 bg-[#0a0a0f]/90 backdrop-blur-3xl border border-white/[0.12] rounded-card p-6 shadow-2xl grid grid-cols-2 gap-3"
              >
                {canShowUpload && (
                  <>
                    <button
                      type="button"
                      onClick={handleUploadDocClick}
                      className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/[0.045] border border-white/[0.09] hover:bg-white/10 transition-all group"
                    >
                       <FileText className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{uploadLabel}</span>
                    </button>
                    <button type="button" className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/[0.045] border border-white/[0.09] hover:bg-white/10 transition-all group">
                       <BarChart3 className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Data CSV</span>
                    </button>
                    <button type="button" className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/[0.045] border border-white/[0.09] hover:bg-white/10 transition-all group">
                       <Search className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Web Research</span>
                    </button>
                  </>
                )}
                {renderCustomActions && renderCustomActions()}
              </motion.div>
            )}
          </AnimatePresence>

          {aboveInput && (
            <div className="shrink-0 mb-2">
              {aboveInput}
            </div>
          )}

          <form onSubmit={handleSubmit} className={cn("relative group transition-all duration-700", quota?.isHardLocked && "blur-2xl opacity-10 pointer-events-none")}>
            <div className={cn("absolute inset-0 blur-[100px] opacity-0 group-focus-within:opacity-40 transition-opacity rounded-full", theme.bgGlow)} />
            <div className={cn(
                "relative flex items-end bg-slate-900/70 border border-white/[0.12] rounded-panel p-2 backdrop-blur-xl group-focus-within:border-white/30 transition-all shadow-[0_4px_24px_rgba(0,0,0,0.50),inset_0_1px_0_rgba(255,255,255,0.06)]",
                (error || quota?.isHardLocked) && "opacity-20 grayscale pointer-events-none"
            )}>
              {(canShowUpload || renderCustomActions) && (
              <NeuralIconButton
                type="button"
                variant="ghost"
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className={cn(
                  "rounded-panel flex items-center justify-center transition-all bg-white/8 border border-white/[0.12] hover:bg-white/12 group/plus",
                  isDrawerOpen && "bg-white/10 border-white/20 rotate-45"
                )}
                icon={
                  <Plus className="w-5 h-5 text-white/70 group-hover/plus:text-white transition-colors drop-shadow-[0_0_6px_rgba(255,255,255,0.25)]" />
                }
              />
              )}

              <NeuralTextarea 
                ref={textareaRef}
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={error ? "Link severed..." : (quota?.isHardLocked ? "Trial Locked" : (draftUploads.length > 0 ? 'Optional: what should I analyze about these attachments?' : placeholder))} 
                aria-label="Type your message"
                className="flex-1 bg-transparent border-none outline-none px-3 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-white placeholder:text-white/10 resize-none min-h-[44px] max-h-40 leading-relaxed focus:ring-0 focus:border-none" 
                disabled={isComposerDisabled || isSpeechListening}
                rows={1}
              />

              {enableSpeechToText && (
                <NeuralButton
                  type="button"
                  variant="ghost"
                  aria-label={isSpeechListening ? 'Stop speech to text' : 'Start speech to text'}
                  aria-pressed={isSpeechListening}
                  title={
                    isSpeechSupported
                      ? (isSpeechListening ? 'Stop speech to text' : 'Start speech to text')
                      : 'Speech-to-text is unavailable in this browser.'
                  }
                  disabled={isSpeechButtonDisabled}
                  onClick={() => {
                    clearSpeechError();
                    toggleSpeechToText();
                  }}
                  className={cn(
                    'w-11 h-11 rounded-2xl shrink-0 p-0 border border-white/[0.12] bg-white/[0.045] hover:bg-white/[0.08] text-white/55 mr-5',
                    isSpeechListening && 'border-rose-400/25 bg-rose-500/10 text-rose-300 animate-pulse',
                    !isSpeechSupported && 'text-white/20 hover:bg-white/[0.045]',
                  )}
                >
                  {isSpeechListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </NeuralButton>
              )}
              
              <NeuralButton type="submit" aria-label="Send message" disabled={effectiveIsProcessing || isSpeechListening || (draftUploads.length === 0 && !input.trim()) || !!error || quota?.isHardLocked} className={cn("w-11 h-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-20 shadow-xl p-0", theme.btn)}>
                {isSyncing ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </NeuralButton>
            </div>

            {speechStatusMessage && (
              <div className="mt-2 px-2 sm:px-4" aria-live="polite">
                <span
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.10em]',
                    speechError || !isSpeechSupported ? 'text-amber-300/80' : 'text-cyan-300/75',
                  )}
                >
                  {speechStatusMessage}
                </span>
              </div>
            )}

            {isGuestTrial && (
              <div className="mt-1 px-2 sm:px-4">
                <span className="text-[11px] font-semibold text-orange-400 uppercase tracking-[0.10em] flex items-center gap-2">
                  <Zap className="w-3 h-3 animate-pulse" /> GUEST_QUOTA: {quota?.totalTurnsUsed} / {quota?.maxTurnsAllowed}
                </span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
});
