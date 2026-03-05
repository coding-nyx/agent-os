import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, Sparkles, Shield, Fingerprint, Activity as ActivityIcon, Terminal, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Message } from '@/llm-engine/types';
import { NeuralLinkAlert } from './NeuralLinkAlert';
import { stripInternalTags } from '@/llm-engine/sanitize';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isLoading: boolean;
  themeColor: 'indigo' | 'orange' | 'cyan';
  placeholder?: string;
  agentName: string;
  error?: string | null;
  onRetry?: () => void;
}

function ActionBadge({ label, icon: Icon, color }: { label: string, icon: any, color: string }) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mt-2 shadow-xl", color)}
        >
            <Icon className="w-3 h-3" />
            <span className="text-[8px] font-black uppercase tracking-widest italic">{label}</span>
        </motion.div>
    );
}

function AIMessage({ content, theme, agentName, isLast, isLoading }: { content: string, theme: any, agentName: string, isLast?: boolean, isLoading?: boolean }) {
    const { publicText, thoughtText, isThinking } = stripInternalTags(content);
    const [showThought, setShowThought] = useState(false);
    
    // In streaming mode, we hide the main bubble if there is no public text yet
    const hasPublicContent = publicText.length > 0;

    return (
        <div className="flex flex-col w-full max-w-[85%] items-start">
            {/* Thinking Panel (Collapsed by default; expands to show internal reasoning) */}
            {(isThinking || thoughtText) && (
                <div className="mb-2 w-full">
                    <button 
                        onClick={() => !isThinking && setShowThought(!showThought)}
                        disabled={isThinking}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all group border",
                            isThinking ? "bg-indigo-500/10 border-indigo-500/20 animate-pulse" : "bg-white/5 border-white/5 hover:bg-white/10"
                        )}
                    >
                        {isThinking ? (
                            <Loader2 className="w-2.5 h-2.5 text-indigo-400 animate-spin" />
                        ) : (
                            <Terminal className="w-2.5 h-2.5 text-white/20 group-hover:text-white/40" />
                        )}
                        <span className={cn(
                            "text-[7px] font-black uppercase tracking-[0.2em] italic",
                            isThinking ? "text-indigo-400" : "text-white/20 group-hover:text-white/40"
                        )}>
                            {isThinking ? 'Thinking...' : 'Thinking'}
                        </span>
                        {!isThinking && <ChevronDown className={cn("w-2.5 h-2.5 text-white/10 transition-transform", showThought && "rotate-180")} />}
                    </button>
                    
                    <AnimatePresence>
                        {showThought && !isThinking && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-2 p-4 bg-black/40 border border-white/5 rounded-2xl font-mono text-[9px] text-white/30 leading-relaxed italic">
                                    {thoughtText}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Public Message Bubble */}
            {hasPublicContent && (
                <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("p-5 border backdrop-blur-md transition-all", theme.bubble, theme.glow)}
                >
                    <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-white prose-strong:font-black">
                        <ReactMarkdown>{publicText}</ReactMarkdown>
                    </div>
                    <div className="mt-3 flex items-center justify-between opacity-20 border-t border-white/5 pt-2">
                        <span className="text-[7px] font-black uppercase tracking-[0.2em]">{agentName}</span>
                        <span className="text-[7px] font-mono uppercase italic">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

export function ChatInterface({ 
  messages, 
  onSendMessage, 
  isLoading, 
  themeColor, 
  placeholder = "Communicate...",
  agentName,
  error,
  onRetry
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || error) return;
    onSendMessage(input);
    setInput('');
  };

  const theme = {
    indigo: {
      bubble: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-100 rounded-3xl rounded-tl-none',
      userBubble: 'bg-white/5 border-white/10 text-white rounded-3xl rounded-tr-none',
      accent: 'text-indigo-400',
      glow: 'shadow-[0_0_20px_rgba(99,102,241,0.15)]',
      bgGlow: 'bg-indigo-500/50',
      btn: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
    },
    orange: {
      bubble: 'bg-orange-500/10 border-orange-500/20 text-orange-100 rounded-none border-l-2',
      userBubble: 'bg-white/5 border-white/10 text-white rounded-none border-r-2',
      accent: 'text-orange-400',
      glow: 'shadow-[0_0_20px_rgba(251,146,60,0.15)]',
      bgGlow: 'bg-orange-500/50',
      btn: 'bg-orange-600 hover:bg-orange-500 shadow-orange-500/20'
    },
    cyan: {
      bubble: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-100 rounded-2xl rounded-tl-none',
      userBubble: 'bg-white/5 border-white/10 text-white rounded-2xl rounded-tr-none',
      accent: 'text-cyan-400',
      glow: 'shadow-[0_0_20px_rgba(34,211,238,0.15)]',
      bgGlow: 'bg-cyan-500/50',
      btn: 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20'
    }
  }[themeColor];

  const getBadges = (content: string) => {
      const badges = [];
      if (content.toLowerCase().includes('resilience')) badges.push({ label: 'SOUL_RESILIENCE_SYNCED', icon: Shield, color: 'text-indigo-400' });
      if (content.toLowerCase().includes('fatigue') || content.toLowerCase().includes('biometric')) badges.push({ label: 'BIOMETRIC_VAULT_UPDATED', icon: ActivityIcon, color: 'text-orange-400' });
      return badges;
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto w-full px-4">
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-8 space-y-10 no-scrollbar scroll-smooth">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (msg.role === 'system') return null;
            const isAI = msg.role === 'assistant';
            const isLast = i === messages.length - 1;
            const actionBadges = isAI ? getBadges(msg.content) : [];
            
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex gap-4 w-full", isAI ? "justify-start" : "justify-end")}
              >
                {isAI && (
                  <div className={cn("w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center bg-black/40 shrink-0 mt-1 shadow-xl", theme.accent)}>
                    <Bot className="w-5 h-5" />
                  </div>
                )}
                
                {isAI ? (
                    <div className="flex flex-col w-full max-w-[85%]">
                        <AIMessage content={msg.content} theme={theme} agentName={agentName} isLast={isLast} isLoading={isLoading} />
                        <div className="flex flex-wrap gap-2">
                            {actionBadges.map((b, idx) => <ActionBadge key={idx} {...b} />)}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col max-w-[85%] items-end">
                        <div className={cn("p-5 border backdrop-blur-md transition-all", theme.userBubble, theme.glow)}>
                            <div className="text-sm text-white/90 leading-relaxed font-medium whitespace-pre-wrap">
                                {msg.content}
                            </div>
                            <div className="mt-3 flex items-center justify-end opacity-20 border-t border-white/5 pt-2">
                                <span className="text-[7px] font-mono uppercase italic">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    </div>
                )}

                {!isAI && (
                  <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center bg-black/40 shrink-0 mt-1 shadow-xl">
                    <User className="w-5 h-5 text-white/40" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isLoading && messages[messages.length-1]?.role !== 'assistant' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4 justify-start">
            <div className={cn("w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center bg-black/40 shrink-0", theme.accent)}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className={cn("px-6 py-4 border backdrop-blur-md italic text-[9px] uppercase font-black tracking-[0.3em]", theme.bubble)}>
              Establishing Link...
            </div>
          </motion.div>
        )}

        {error && onRetry && (
            <NeuralLinkAlert error={error} onRetry={onRetry} />
        )}
      </div>

      <div className="pb-8 pt-4">
        <form onSubmit={handleSubmit} className="relative group">
          <div className={cn("absolute inset-0 blur-2xl opacity-0 group-focus-within:opacity-30 transition-opacity rounded-full", theme.bgGlow)} />
          <div className={cn(
              "relative flex items-center bg-black/60 border border-white/10 rounded-[32px] p-2.5 backdrop-blur-3xl group-focus-within:border-white/30 transition-all shadow-2xl",
              error && "opacity-20 grayscale pointer-events-none"
          )}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={error ? "Link severed..." : placeholder}
              className="flex-1 bg-transparent border-none outline-none px-6 py-4 text-sm text-white placeholder:text-white/10"
              disabled={isLoading || !!error}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !!error}
              className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all disabled:opacity-20 shadow-xl", theme.btn)}
            >
              <Send className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="mt-5 flex justify-between items-center px-8 text-white">
            <div className="flex gap-8">
                <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2 italic"><Shield className="w-3 h-3" /> SECURE_TUNNEL</span>
                <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2 italic"><Fingerprint className="w-3 h-3" /> E2EE_ACTIVE</span>
            </div>
            <span className="text-[7px] font-mono text-white/10 uppercase tracking-widest italic leading-none">NODE_INIT // {themeColor.toUpperCase()}_LINK_STABLE</span>
          </div>
        </form>
      </div>
    </div>
  );
}
