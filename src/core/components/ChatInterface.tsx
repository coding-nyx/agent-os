import React, { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Loader2, Sparkles, Shield,
  Activity as ActivityIcon, Terminal, ChevronDown, Lock, Zap,
  ArrowRight, Plus, FileText, BarChart3, Image as ImageIcon, X,
  Search, Calculator, BrainCircuit, Trash2, RefreshCw, AlertTriangle, MoreVertical
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { Message, GuestQuota, MessageContent } from '@/lib/types';
import { NeuralLinkAlert } from './NeuralLinkAlert';
import { stripInternalTags } from '@/lib/ai-adapters/sanitize';
import { NeuralButton } from './NeuralButton';
import { NeuralTextarea } from './NeuralTextarea';
import { EmptyState } from '@/core/components/EmptyState';
import { getActionLabel } from '@/lib/actions/action-labels';
import { PendingRequestState } from '@/lib/hooks/use-pending-recovery';
import { DocumentMessageCard, parseDocumentMessage, parseDocumentUploadMessage } from './DocumentMessageCard';
import { useDebugMode } from '@/lib/hooks/use-debug-mode';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';
import { buildDocumentUploadVisibleMessage, summarizeDocumentUploadMessage } from '@/lib/services/document-upload-message';

// Helper to convert MessageContent to string for display
function messageContentToString(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter(p => p.type === 'text')
    .map(p => (p as { type: 'text'; text: string }).text)
    .join(' ');
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
}

const THEMES = {
  indigo: {
    bubble: 'bg-white/[0.03] border-white/5 text-indigo-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-indigo-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-indigo-400',
    glow: 'shadow-xl shadow-indigo-500/10',
    bgGlow: 'bg-indigo-500/30',
    btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
  },
  orange: {
    bubble: 'bg-white/[0.03] border-white/5 text-orange-50 rounded-2xl rounded-tl-sm border-l-2 border-l-orange-500/30',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-orange-400',
    glow: 'shadow-xl shadow-orange-500/10',
    bgGlow: 'bg-orange-500/30',
    btn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20'
  },
  cyan: {
    bubble: 'bg-white/[0.03] border-white/5 text-cyan-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-cyan-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-cyan-400',
    glow: 'shadow-xl shadow-cyan-500/10',
    bgGlow: 'bg-cyan-500/30',
    btn: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20'
  },
  violet: {
    bubble: 'bg-white/[0.03] border-white/5 text-violet-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-violet-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-violet-400',
    glow: 'shadow-xl shadow-violet-500/10',
    bgGlow: 'bg-violet-500/30',
    btn: 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20'
  },
  emerald: {
    bubble: 'bg-white/[0.03] border-white/5 text-emerald-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-emerald-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-emerald-400',
    glow: 'shadow-xl shadow-emerald-500/10',
    bgGlow: 'bg-emerald-500/30',
    btn: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
  },
  sky: {
    bubble: 'bg-white/[0.03] border-white/5 text-sky-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-sky-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-sky-400',
    glow: 'shadow-xl shadow-sky-500/10',
    bgGlow: 'bg-sky-500/30',
    btn: 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
  },
  lime: {
    bubble: 'bg-white/[0.03] border-white/5 text-lime-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-lime-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-lime-400',
    glow: 'shadow-xl shadow-lime-500/10',
    bgGlow: 'bg-lime-500/30',
    btn: 'bg-lime-600 hover:bg-lime-500 shadow-lime-500/20'
  },
  rose: {
    bubble: 'bg-white/[0.03] border-white/5 text-rose-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-rose-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-rose-400',
    glow: 'shadow-xl shadow-rose-500/10',
    bgGlow: 'bg-rose-500/30',
    btn: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
  },
  fuchsia: {
    bubble: 'bg-white/[0.03] border-white/5 text-fuchsia-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-fuchsia-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-fuchsia-400',
    glow: 'shadow-xl shadow-fuchsia-500/10',
    bgGlow: 'bg-fuchsia-500/30',
    btn: 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-500/20'
  },
  slate: {
    bubble: 'bg-white/[0.03] border-white/5 text-slate-50 rounded-2xl rounded-tl-sm border-l-[1.5px] border-l-slate-400/20',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-slate-400',
    glow: 'shadow-xl shadow-slate-500/10',
    bgGlow: 'bg-slate-500/30',
    btn: 'bg-slate-600 hover:bg-slate-500 shadow-slate-500/20'
  },
  module: {
    bubble: 'bg-white/[0.03] border-white/5 text-white rounded-2xl rounded-tl-sm border-l-2 border-l-[var(--module-accent-border)]',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-[var(--module-color-400)]',
    glow: 'shadow-xl shadow-[var(--module-accent-muted)]',
    bgGlow: 'bg-[var(--module-accent-glow)]',
    btn: 'bg-[var(--module-accent)] hover:bg-[var(--module-accent-hover)] shadow-[var(--module-accent-muted)]'
  }
};

type ThemeConfig = typeof THEMES[keyof typeof THEMES];

const AIMessage = React.memo(function AIMessage({ content, theme, agentName, isLast, isLoading, isAgnes, debugMode, debugMeta, isStreaming, showInternalSignals }: { content: string, theme: ThemeConfig, agentName: string, isLast?: boolean, isLoading?: boolean, isAgnes?: boolean, debugMode?: boolean, debugMeta?: import('@/lib/types').MessageDebugMeta, isStreaming?: boolean, showInternalSignals?: boolean }) {
    // Run the stripping logic even during streaming so internal tags like <thought>
    // are filtered out in real-time. The stripInternalTags function handles 
    // unclosed/partial tags at the end of the stream.
    const stripped = stripInternalTags(content, { retainSpacings: true });
    const { publicText, internalText, isThinking, isActing, currentActionType } = stripped;
    const [showInternal, setShowInternal] = useState(false);
    const hasPublicContent = publicText.length > 0;
    const hasInternalContent = !!internalText && internalText.length > 0;

    // Only show internal signal UI if showInternalSignals is allowed
    const effectiveIsThinking = showInternalSignals ? isThinking : false;
    const effectiveIsActing = showInternalSignals ? isActing : false;
    const effectiveInternalText = showInternalSignals ? internalText : '';

    const showProcessingPulse = effectiveIsThinking || effectiveIsActing;
    const showCompletedThought = debugMode && !!effectiveInternalText && !showProcessingPulse;
    // When a model emits only internal/action tags, `publicText` becomes empty.
    // In that case, show a minimal assistant bubble so the user never sees a "blank response".
    const hasInternalOnlyCompletion = hasInternalContent && !hasPublicContent && !showProcessingPulse;
    const actionTagMatch = !hasPublicContent
      ? content.match(/<action\s+type="([^"]+)">/i)
      : null;
    const hasBareActionTag = !hasPublicContent && /<action\b/i.test(content);
    const actionFallback = actionTagMatch
      ? `${getActionLabel(actionTagMatch[1])}.`
      : (hasBareActionTag ? 'Action processed.' : '');
    const bubbleText = hasPublicContent
      ? publicText
      : (hasInternalOnlyCompletion ? 'Processed.' : actionFallback);

    // Debug chips — actions and spine events
    const actionChips = debugMode ? (debugMeta?.actionTagsExtracted ?? []) : [];
    const spineChips = debugMode ? (debugMeta?.spineEvents ?? []) : [];
    const hasDebugChips = actionChips.length > 0 || spineChips.length > 0;

    return (
        <div className="flex flex-col w-full max-w-[95%] sm:max-w-[85%] items-start">
            {(showProcessingPulse || showCompletedThought) && (
                <div className="mb-3 w-full">
                    <NeuralButton 
                        variant="ghost"
                        onClick={() => !showProcessingPulse && setShowInternal(!showInternal)}
                        disabled={showProcessingPulse}
                        className={cn(
                            "flex items-center gap-3 px-4 py-2 rounded-2xl transition-all group border h-auto",
                            showProcessingPulse ? "bg-white/[0.03] border-white/10 animate-pulse" : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}
                    >
                        {showProcessingPulse ? (
                            <BrainCircuit className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                        ) : (
                            <Terminal className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40" />
                        )}
                        <span className={cn(
                            "text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em]",
                            showProcessingPulse ? "text-indigo-400" : "text-white/20 group-hover:text-white/40"
                        )}>
                            {effectiveIsThinking ? 'Processing Neural Signals...' : (effectiveIsActing ? `${getActionLabel(currentActionType || 'action')}...` : 'View Internal Signals')}
                        </span>
                    </NeuralButton>
                    
                    <AnimatePresence>
                        {showInternal && !showProcessingPulse && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="mt-2 p-3 sm:p-4 bg-black/60 border border-white/5 rounded-xl sm:rounded-2xl font-mono text-[10px] sm:text-[11px] text-white/40 leading-relaxed whitespace-pre-wrap shadow-xl">
                                    {effectiveInternalText}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {hasDebugChips && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {actionChips.map((a, idx) => (
                        <div key={`a-${idx}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <ActivityIcon className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-semibold uppercase tracking-wider">{getActionLabel(a.type)}</span>
                        </div>
                    ))}
                    {spineChips.map((evt, idx) => (
                        <div key={`s-${idx}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
                            <Zap className="w-2.5 h-2.5" />
                            <span className="text-[9px] font-semibold uppercase tracking-wider">{evt}</span>
                        </div>
                    ))}
                </div>
            )}

            {(hasPublicContent || hasInternalOnlyCompletion) && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={cn(
                  "border backdrop-blur-3xl transition-all",
                  isAgnes
                    ? "p-5 sm:p-6 bg-gradient-to-br from-white/[0.04] to-indigo-500/[0.03] border-indigo-400/10 rounded-2xl rounded-tl-sm shadow-xl shadow-indigo-500/10"
                    : cn("p-3.5 sm:p-5", theme.bubble, theme.glow)
                )}>
                    <div className={cn(
                      "max-w-none break-words prose-a:break-all",
                      isAgnes
                        ? "prose prose-invert prose-base agnes-prose prose-p:leading-[1.85] prose-p:text-white/90 prose-strong:text-white prose-strong:font-semibold prose-li:text-white/85 prose-li:leading-relaxed prose-blockquote:border-indigo-400/40 prose-blockquote:text-white/70 prose-blockquote:italic"
                        : "prose prose-invert prose-sm prose-p:leading-relaxed prose-strong:text-white prose-strong:font-black prose-p:text-white/90"
                    )}>
                        {isStreaming ? (
                          // Plain text during streaming — no markdown parsing overhead
                          <p className="whitespace-pre-wrap">{bubbleText}</p>
                        ) : (
                          <ReactMarkdown
                            rehypePlugins={[rehypeSanitize]}
                            components={{
                              a: ({ href, children, ...props }) => (
                                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                              )
                            }}
                          >{bubbleText}</ReactMarkdown>
                        )}
                    </div>
                    {!isStreaming && (
                      <div className="mt-3 flex items-center justify-between opacity-30 border-t border-white/5 pt-3">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">{agentName}</span>
                          <span className="text-[9px] font-mono uppercase tracking-wider">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                </motion.div>
            )}
        </div>
    );
});

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
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewCompletion, setHasNewCompletion] = useState(false);
  const [draftUploads, setDraftUploads] = useState<Array<{ file: File; previewUrl?: string }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const { debugMode } = useDebugMode();
  
  const effectiveIsProcessing = isProcessing !== undefined ? isProcessing : isLoading;

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
      setIsDrawerOpen(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      return;
    }
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
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

  return (
    <div
      className={cn(
        "flex-1 flex flex-col w-full mx-auto relative min-h-0"
      )}
    >
      {/* Header actions (full-width, e.g. DiagnosisToolbar) */}
      {headerActions && (
        <div className="shrink-0 flex items-center justify-end px-3 sm:px-4 py-2">{headerActions}</div>
      )}

      {/* Clear session button */}
      {onClearHistory && !hideClearHistory && !isOrchestrator && (
        <div className="shrink-0 flex justify-end px-3 sm:px-6 py-2 sm:py-3 border-b border-white/5 relative z-10">
          <details className="relative group">
            <summary className="list-none p-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 cursor-pointer transition-all focus:outline-none [&::-webkit-details-marker]:hidden" title="Chat Options">
              <MoreVertical className="w-4 h-4" />
            </summary>
            <div className="absolute right-0 top-full mt-1 w-40 p-1 bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl">
              <NeuralButton
                variant="ghost"
                onClick={(e) => {
                  e.currentTarget.closest('details')?.removeAttribute('open');
                  onClearHistory();
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg hover:bg-rose-500/10 text-white/40 hover:text-rose-400 transition-all text-left h-auto"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">Clear Link</span>
              </NeuralButton>
            </div>
          </details>
        </div>
      )}

      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversation messages" className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6 no-scrollbar scrollbar-ghost scroll-smooth min-h-0">
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
            
            const actions = renderMessageActions ? renderMessageActions(msg, i) : null;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col w-full", isAI ? "items-start" : "items-end")}>
                <div className={cn("flex gap-4 w-full", isAI ? "justify-start" : "justify-end")}>
                {isAI && (
                  <div className={cn(
                    "shrink-0 mt-1 flex items-center justify-center transition-colors",
                    isAgnes
                      ? "w-10 h-10 rounded-2xl border border-indigo-400/20 bg-gradient-to-br from-indigo-900/60 to-violet-900/60 shadow-lg shadow-indigo-500/20"
                      : "w-9 h-9 rounded-xl border border-white/10 bg-black/60 shadow-xl",
                    theme.accent
                  )}>
                    <Bot className="w-5 h-5" />
                  </div>
                )}
                {isAI ? (
                    <div className="w-full flex flex-col items-start">
                        <AIMessage
                          content={messageContentToString(msg.content)}
                          theme={theme}
                          agentName={agentName}
                          isLast={isLast}
                          isLoading={effectiveIsProcessing}
                          isAgnes={isAgnes}
                          debugMode={debugMode}
                          debugMeta={msg.debugMeta}
                          isStreaming={isLast && effectiveIsProcessing}
                          showInternalSignals={showInternalSignals}
                        />
                    </div>
                ) : (
                    (() => {
                      const textContent = messageContentToString(msg.content);
                      const uploadParsed = parseDocumentUploadMessage(textContent);
                      if (uploadParsed) {
                        return (
                          <div className="flex flex-col max-w-[85%] w-fit items-end">
                            <DocumentMessageCard upload={uploadParsed} themeAccent={theme.accent} />
                            <div className="mt-1.5 opacity-30 px-1">
                              <span className="text-[9px] font-mono uppercase tracking-wider text-white">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        );
                      }
                      const docParsed = parseDocumentMessage(textContent);
                      if (docParsed) {
                        return (
                          <div className="flex flex-col max-w-[85%] w-fit items-end">
                            <DocumentMessageCard doc={docParsed} themeAccent={theme.accent} />
                            <div className="mt-1.5 opacity-30 px-1">
                              <span className="text-[9px] font-mono uppercase tracking-wider text-white">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="flex flex-col max-w-[75%] w-fit items-end">
                            <div className={cn(
                              "border backdrop-blur-3xl transition-all min-w-0 break-words break-all sm:break-normal",
                              isAgnes
                                ? "p-4 sm:p-5 bg-gradient-to-br from-indigo-500/[0.12] to-violet-500/[0.08] border-indigo-400/20 rounded-2xl rounded-tr-sm shadow-lg shadow-indigo-500/10"
                                : cn("p-3.5 sm:p-5", theme.userBubble, theme.glow)
                            )}>
                                <div className={cn(
                                  "leading-relaxed break-words overflow-hidden min-w-0 break-all sm:break-normal",
                                  isAgnes
                                    ? "agnes-user-text text-white/95 whitespace-pre-wrap"
                                    : "text-sm text-white/90 font-medium whitespace-pre-wrap"
                                )}>{textContent}</div>
                                <div className="mt-3 flex items-center justify-end opacity-30 border-t border-white/5 pt-2">
                                    <span className="text-[9px] font-mono uppercase tracking-wider">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                            </div>
                        </div>
                      );
                    })()
                )}
                {!isAI && (
                  <div className={cn(
                    "shrink-0 mt-1 flex items-center justify-center",
                    isAgnes
                      ? "w-10 h-10 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] shadow-lg"
                      : "w-9 h-9 rounded-xl border border-white/10 bg-black/60 shadow-xl"
                  )}>
                    <User className={cn(isAgnes ? "w-5 h-5 text-white/60" : "w-5 h-5 text-white/40")} />
                  </div>
                )}
                </div>
                {actions && (
                  <div className={cn("mt-3", isAI ? "ml-12" : "mr-12")}>
                    {actions}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4 justify-start">
            <div className={cn("w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center bg-black/60 shrink-0 shadow-xl", theme.accent)}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className={cn("px-6 py-4 border backdrop-blur-3xl flex items-center gap-3", theme.bubble)}>
              <span className="text-[10px] uppercase font-semibold tracking-[0.12em] text-white/50">
                {aiState?.isActing 
                  ? `${getActionLabel(aiState.currentActionType || 'action')}...` 
                  : (aiState?.isThinking ? 'Processing Neural Signals...' : `${agentName} is thinking`)}
              </span>
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:300ms]" />
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
                : "bg-black/80 border-white/10 text-white/60 hover:text-white hover:border-white/20",
              theme.accent
            )}
          >
            <ChevronDown className={cn("w-4 h-4", hasNewCompletion && "animate-bounce")} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em]">
              {hasNewCompletion ? "Agent Resonance Detected" : "Scroll to Latest"}
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
              <Loader2 className="w-3 h-3 animate-spin text-white/40 shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 truncate">
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
      <div className="shrink-0 px-3 sm:px-6 pb-1 pt-2">
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
                <p className="text-xs text-amber-400/80 italic leading-relaxed">
                  A neural transmission was interrupted. Would you like to recover and retransmit the following message?
                </p>
                <div className="p-3 mt-1 rounded-lg bg-black/40 border border-white/5 text-sm text-white/70 italic font-medium truncate">
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
                    <div className="bg-[#05050a]/95 backdrop-blur-3xl border border-white/10 rounded-card-strong p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] text-center space-y-8">
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
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Attachments ready</p>
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
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    {draft.previewUrl ? (
                      <img src={draft.previewUrl} alt={draft.file.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white/80">{draft.file.name}</p>
                      <p className="text-[10px] text-white/40">{Math.max(1, Math.round(draft.file.size / 1024))} KB</p>
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
                className="absolute bottom-full mb-4 left-0 w-80 bg-[#0a0a0f]/90 backdrop-blur-3xl border border-white/10 rounded-card p-6 shadow-2xl grid grid-cols-2 gap-3"
              >
                {canShowUpload && (
                  <>
                    <button
                      type="button"
                      onClick={handleUploadDocClick}
                      className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group"
                    >
                       <FileText className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{uploadLabel}</span>
                    </button>
                    <button type="button" className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                       <BarChart3 className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Data CSV</span>
                    </button>
                    <button type="button" className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                       <Search className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Web Research</span>
                    </button>
                  </>
                )}
                {renderCustomActions && renderCustomActions()}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className={cn("relative group transition-all duration-700", quota?.isHardLocked && "blur-2xl opacity-10 pointer-events-none")}>
            <div className={cn("absolute inset-0 blur-[100px] opacity-0 group-focus-within:opacity-40 transition-opacity rounded-full", theme.bgGlow)} />
            <div className={cn(
                "relative flex items-end bg-[#05050a]/60 border border-white/10 rounded-panel p-2 backdrop-blur-3xl group-focus-within:border-white/40 transition-all shadow-[0_30px_60px_rgba(0,0,0,0.6)]",
                (error || quota?.isHardLocked) && "opacity-20 grayscale pointer-events-none"
            )}>
              {(canShowUpload || renderCustomActions) && (
                  <NeuralButton 
                  type="button"
                  variant="ghost"
                  iconOnly
                  onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                  className={cn(
                    "rounded-panel flex items-center justify-center transition-all bg-white/8 border border-white/10 hover:bg-white/12 group/plus",
                    isDrawerOpen && "bg-white/10 border-white/20 rotate-45"
                  )}
                >
                  <Plus className="w-5 h-5 text-white/70 group-hover/plus:text-white transition-colors drop-shadow-[0_0_6px_rgba(255,255,255,0.25)]" />
                </NeuralButton>
              )}

              <NeuralTextarea 
                ref={textareaRef}
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={error ? "Link severed..." : (quota?.isHardLocked ? "Trial Locked" : (draftUploads.length > 0 ? 'Optional: what should I analyze about these attachments?' : placeholder))} 
                aria-label="Type your message"
                className="flex-1 bg-transparent border-none outline-none px-3 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base text-white placeholder:text-white/10 resize-none min-h-[44px] max-h-40 leading-relaxed focus:ring-0 focus:border-none" 
                disabled={effectiveIsProcessing || !!error || quota?.isHardLocked}
                rows={1}
              />
              
              <NeuralButton type="submit" aria-label="Send message" disabled={effectiveIsProcessing || (draftUploads.length === 0 && !input.trim()) || !!error || quota?.isHardLocked} className={cn("w-11 h-11 rounded-2xl flex items-center justify-center transition-all disabled:opacity-20 shadow-xl p-0", theme.btn)}>
                {isSyncing ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </NeuralButton>
            </div>

            {isGuestTrial && (
              <div className="mt-1 px-2 sm:px-4">
                <span className="text-[9px] font-semibold text-orange-400 uppercase tracking-[0.12em] flex items-center gap-2">
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
