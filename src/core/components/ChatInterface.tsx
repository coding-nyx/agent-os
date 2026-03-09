import React, { useCallback, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Loader2, Sparkles, Shield,
  Activity as ActivityIcon, Terminal, ChevronDown, Lock, Zap,
  ArrowRight, Plus, FileText, BarChart3, Image as ImageIcon, X,
  Search, Calculator, BrainCircuit, Trash2, RefreshCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { Message, GuestQuota, MessageContent } from '@/lib/types';
import { NeuralLinkAlert } from './NeuralLinkAlert';
import { stripInternalTags } from '@/llm-engine/sanitize';
import { NeuralButton } from './NeuralButton';
import { EmptyState } from '@/core/components/EmptyState';
import { getActionLabel } from '@/lib/actions/action-labels';

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
  isProcessing?: boolean;
  aiState?: {
    isThinking: boolean;
    isActing: boolean;
    currentActionType: string | null;
  };
  themeColor: 'indigo' | 'orange' | 'cyan' | 'violet' | 'emerald' | 'sky' | 'lime' | 'rose' | 'fuchsia' | 'slate';
  placeholder?: string;
  agentName: string;
  error?: string | null;
  onRetry?: () => void;
  onClearHistory?: () => void;
  isGuestTrial?: boolean;
  quota?: GuestQuota;
  onQuotaExhausted?: () => void;
  showInternalSignals?: boolean;
  renderCustomActions?: () => React.ReactNode;
  renderMessageActions?: (message: Message, index: number) => React.ReactNode;
  moduleId?: string;
  headerActions?: React.ReactNode;
}

const THEMES = {
  indigo: {
    bubble: 'bg-white/[0.03] border-white/5 text-indigo-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-indigo-400',
    glow: 'shadow-xl shadow-indigo-500/10',
    bgGlow: 'bg-indigo-500/30',
    btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
  },
  orange: {
    bubble: 'bg-white/[0.03] border-white/5 text-orange-50 rounded-none border-l-2 border-orange-500/30',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-none border-r-2 border-white/20',
    accent: 'text-orange-400',
    glow: 'shadow-xl shadow-orange-500/10',
    bgGlow: 'bg-orange-500/30',
    btn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20'
  },
  cyan: {
    bubble: 'bg-white/[0.03] border-white/5 text-cyan-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-cyan-400',
    glow: 'shadow-xl shadow-cyan-500/10',
    bgGlow: 'bg-cyan-500/30',
    btn: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20'
  },
  violet: {
    bubble: 'bg-white/[0.03] border-white/5 text-violet-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-violet-400',
    glow: 'shadow-xl shadow-violet-500/10',
    bgGlow: 'bg-violet-500/30',
    btn: 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20'
  },
  emerald: {
    bubble: 'bg-white/[0.03] border-white/5 text-emerald-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-emerald-400',
    glow: 'shadow-xl shadow-emerald-500/10',
    bgGlow: 'bg-emerald-500/30',
    btn: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
  },
  sky: {
    bubble: 'bg-white/[0.03] border-white/5 text-sky-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-sky-400',
    glow: 'shadow-xl shadow-sky-500/10',
    bgGlow: 'bg-sky-500/30',
    btn: 'bg-sky-600 hover:bg-sky-500 shadow-sky-500/20'
  },
  lime: {
    bubble: 'bg-white/[0.03] border-white/5 text-lime-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-lime-400',
    glow: 'shadow-xl shadow-lime-500/10',
    bgGlow: 'bg-lime-500/30',
    btn: 'bg-lime-600 hover:bg-lime-500 shadow-lime-500/20'
  },
  rose: {
    bubble: 'bg-white/[0.03] border-white/5 text-rose-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-rose-400',
    glow: 'shadow-xl shadow-rose-500/10',
    bgGlow: 'bg-rose-500/30',
    btn: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/20'
  },
  fuchsia: {
    bubble: 'bg-white/[0.03] border-white/5 text-fuchsia-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-fuchsia-400',
    glow: 'shadow-xl shadow-fuchsia-500/10',
    bgGlow: 'bg-fuchsia-500/30',
    btn: 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-500/20'
  },
  slate: {
    bubble: 'bg-white/[0.03] border-white/5 text-slate-50 rounded-2xl rounded-tl-sm',
    userBubble: 'bg-white/[0.05] border-white/10 text-white rounded-2xl rounded-tr-sm',
    accent: 'text-slate-400',
    glow: 'shadow-xl shadow-slate-500/10',
    bgGlow: 'bg-slate-500/30',
    btn: 'bg-slate-600 hover:bg-slate-500 shadow-slate-500/20'
  }
};

type ThemeConfig = typeof THEMES[keyof typeof THEMES];

const AIMessage = React.memo(function AIMessage({ content, theme, agentName, isLast, isLoading }: { content: string, theme: ThemeConfig, agentName: string, isLast?: boolean, isLoading?: boolean }) {
    const { publicText, internalText, isThinking, isActing, currentActionType } = stripInternalTags(content);
    const [showInternal, setShowInternal] = useState(false);
    const hasPublicContent = publicText.length > 0;

    // Extract completed action types for chips
    const actionMatches = [...content.matchAll(/<action\s+type="([^"]+)">/gi)];
    const completedActions = actionMatches.map(m => m[1]);

    return (
        <div className="flex flex-col w-full max-w-[90%] items-start">
            {(isThinking || isActing || (internalText && isLast)) && (
                <div className="mb-3 w-full">
                    <button 
                        onClick={() => !isThinking && !isActing && setShowInternal(!showInternal)}
                        disabled={isThinking || isActing}
                        className={cn(
                            "flex items-center gap-3 px-4 py-2 rounded-2xl transition-all group border",
                            (isThinking || isActing) ? "bg-white/[0.03] border-white/10 animate-pulse" : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}
                    >
                        {isThinking || isActing ? (
                            <BrainCircuit className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                        ) : (
                            <Terminal className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40" />
                        )}
                        <span className={cn(
                            "text-[8px] font-black uppercase tracking-[0.3em] italic",
                            (isThinking || isActing) ? "text-indigo-400" : "text-white/20 group-hover:text-white/40"
                        )}>
                            {isThinking ? 'Processing Neural Signals...' : (isActing ? `${getActionLabel(currentActionType || 'action')}...` : 'View Internal Signals')}
                        </span>
                    </button>
                    
                    <AnimatePresence>
                        {showInternal && !isThinking && !isActing && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="mt-2 p-4 bg-black/60 border border-white/5 rounded-2xl font-mono text-[10px] text-white/40 leading-relaxed italic whitespace-pre-wrap shadow-xl">
                                    {internalText}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {completedActions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {completedActions.map((type, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm">
                    <ActivityIcon className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-widest">{getActionLabel(type)}</span>
                  </div>
                ))}
              </div>
            )}

            {hasPublicContent && (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={cn("p-5 border backdrop-blur-3xl transition-all", theme.bubble, theme.glow)}>
                    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-white prose-strong:font-black prose-p:text-white/90">
                        <ReactMarkdown
                          rehypePlugins={[rehypeSanitize]}
                          components={{
                            a: ({ href, children, ...props }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                            )
                          }}
                        >{publicText}</ReactMarkdown>
                    </div>
                    <div className="mt-3 flex items-center justify-between opacity-30 border-t border-white/5 pt-3">
                        <span className="text-[8px] font-black uppercase tracking-[0.3em] italic">{agentName}</span>
                        <span className="text-[8px] font-mono uppercase italic tracking-widest">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </motion.div>
            )}
        </div>
    );
});

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  isLoading, 
  isProcessing,
  aiState,
  themeColor, 
  placeholder = "Communicate...",
  agentName,
  error,
  onRetry,
  onClearHistory,
  isGuestTrial,
  quota,
  onQuotaExhausted,
  showInternalSignals = true,
  renderCustomActions,
  renderMessageActions,
  moduleId,
  headerActions,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasNewCompletion, setHasNewCompletion] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  
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
    if (!input.trim() || effectiveIsProcessing || error || quota?.isHardLocked) return;
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
  const canUploadDocs = moduleId ? ['scout', 'forge', 'soma', 'ledger'].includes(moduleId) : false;

  const hasMessages = messages.some((msg) => msg.role !== 'system');

  return (
    <div
      className={cn(
        "flex-1 flex flex-col w-full mx-auto relative min-h-0 max-w-5xl"
      )}
    >
      {/* Header bar for session actions */}
      {(headerActions || onClearHistory) && (
        <div className="shrink-0 flex justify-end px-6 py-3 border-b border-white/5">
          <div className="flex gap-3">
            {onClearHistory && (
              <button
                onClick={onClearHistory}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-all group"
                title="Clear Session History"
              >
                <Trash2 className="w-3.5 h-3.5 group-hover:text-rose-400 transition-colors" />
                <span className="text-[9px] font-black uppercase tracking-widest italic">Clear Link</span>
              </button>
            )}
            {headerActions}
          </div>
        </div>
      )}

      <div ref={scrollRef} role="log" aria-live="polite" aria-label="Conversation messages" className="flex-1 overflow-y-auto px-6 py-6 space-y-6 no-scrollbar scrollbar-ghost scroll-smooth min-h-0">
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
                  <div className={cn("w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center bg-black/60 shrink-0 mt-1 shadow-xl transition-colors", theme.accent)}>
                    <Bot className="w-5 h-5" />
                  </div>
                )}
                {isAI ? (
                    <div className="w-full flex justify-start">
                        <AIMessage
                          content={showInternalSignals ? messageContentToString(msg.content) : stripInternalTags(messageContentToString(msg.content)).publicText}
                          theme={theme}
                          agentName={agentName}
                          isLast={isLast}
                          isLoading={effectiveIsProcessing}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col max-w-[75%] w-fit items-end">
                        <div className={cn("p-5 border backdrop-blur-3xl transition-all", theme.userBubble, theme.glow)}>
                            <div className="text-sm text-white/90 leading-relaxed font-medium whitespace-pre-wrap">{messageContentToString(msg.content)}</div>
                            <div className="mt-3 flex items-center justify-end opacity-30 border-t border-white/5 pt-3">
                                <span className="text-[8px] font-mono uppercase italic tracking-widest">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                )}
                {!isAI && (
                  <div className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center bg-black/60 shrink-0 mt-1 shadow-xl">
                    <User className="w-5 h-5 text-white/40" />
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
              <span className="italic text-[10px] uppercase font-black tracking-[0.3em] text-white/50">
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
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={() => { scrollToBottom(); isNearBottomRef.current = true; setHasNewCompletion(false); }}
            className={cn(
              "absolute bottom-36 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-2.5 rounded-full border backdrop-blur-xl transition-all shadow-2xl",
              hasNewCompletion 
                ? "bg-white/10 border-white/20 text-white animate-pulse" 
                : "bg-black/80 border-white/10 text-white/60 hover:text-white hover:border-white/20",
              theme.accent
            )}
          >
            <ChevronDown className={cn("w-4 h-4", hasNewCompletion && "animate-bounce")} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">
              {hasNewCompletion ? "Agent Resonance Detected" : "Scroll to Latest"}
            </span>
            {hasNewCompletion && (
              <div className={cn("w-1.5 h-1.5 rounded-full bg-current animate-ping")} />
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input area pinned to bottom via flex layout */}
      <div className="shrink-0 px-6 pb-4 pt-2">
        <AnimatePresence>
            {quota?.isHardLocked && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="absolute inset-x-0 bottom-full mb-10 z-[100]">
                    <div className="bg-[#05050a]/95 backdrop-blur-3xl border border-white/10 rounded-card-strong p-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] text-center space-y-8">
                        <div className="w-20 h-20 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-6">
                            <Lock className="w-10 h-10 text-orange-400" />
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-3xl font-black italic uppercase text-white tracking-tighter">Neural Link Severed</h3>
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
          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                className="absolute bottom-full mb-4 left-0 w-80 bg-[#0a0a0f]/90 backdrop-blur-3xl border border-white/10 rounded-card p-6 shadow-2xl grid grid-cols-2 gap-3"
              >
                {canUploadDocs && (
                  <>
                    <button className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                       <FileText className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Upload Doc</span>
                    </button>
                    <button className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                       <BarChart3 className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Data CSV</span>
                    </button>
                    <button className="flex flex-col items-center justify-center gap-3 p-4 rounded-panel bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
                       <Search className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Web Research</span>
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
                "relative flex items-end bg-[#05050a]/60 border border-white/10 rounded-panel p-3 backdrop-blur-3xl group-focus-within:border-white/40 transition-all shadow-[0_30px_60px_rgba(0,0,0,0.6)]",
                (error || quota?.isHardLocked) && "opacity-20 grayscale pointer-events-none"
            )}>
              {(canUploadDocs || renderCustomActions) && (
                <button 
                  type="button"
                  onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                  className={cn(
                    "w-14 h-14 rounded-panel flex items-center justify-center transition-all bg-white/5 border border-white/5 hover:bg-white/10 group/plus",
                    isDrawerOpen && "bg-white/10 border-white/20 rotate-45"
                  )}
                >
                  <Plus className="w-6 h-6 text-white/40 group-hover/plus:text-white transition-colors" />
                </button>
              )}

              <textarea 
                ref={textareaRef}
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={handleKeyDown}
                placeholder={error ? "Link severed..." : (quota?.isHardLocked ? "Trial Locked" : placeholder)} 
                aria-label="Type your message"
                className="flex-1 bg-transparent border-none outline-none px-8 py-4 text-base text-white placeholder:text-white/10 resize-none max-h-40 leading-relaxed" 
                disabled={effectiveIsProcessing || !!error || quota?.isHardLocked}
                rows={1}
              />
              
              <button type="submit" aria-label="Send message" disabled={effectiveIsProcessing || !input.trim() || !!error || quota?.isHardLocked} className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all disabled:opacity-20 shadow-xl", theme.btn)}>
                <Send className="w-6 h-6 text-white" />
              </button>
            </div>

            <div className="mt-4 flex justify-between items-center px-6 text-white">
              <div className="flex gap-8">
                  {isGuestTrial ? (
                      <span className="text-[8px] font-black text-orange-400 uppercase tracking-[0.4em] flex items-center gap-2 italic">
                          <Zap className="w-3 h-3 animate-pulse" /> GUEST_QUOTA: {quota?.totalTurnsUsed} / {quota?.maxTurnsAllowed}
                      </span>
                  ) : (
                      <span className="text-[8px] font-black text-white/15 uppercase tracking-[0.4em] flex items-center gap-2 italic"><Shield className="w-3 h-3" /> E2EE</span>
                  )}
              </div>
              <span className="text-[8px] font-mono text-white/10 uppercase tracking-[0.3em] italic leading-none">{themeColor.toUpperCase()}_LINK</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
