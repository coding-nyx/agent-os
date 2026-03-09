import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, MessageSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NexusChat } from '@/core/components/NexusChat';
import { NeuralThemeColor } from '@/core/components/NeuralTabGroup';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import type { AuthMode } from '@/core/components/UnifiedAuthModal';

interface SingleAgentLayoutProps {
  moduleId: string;
  agentName: string;
  themeColor: NeuralThemeColor;
  children: React.ReactNode;
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: GuestQuota | null;
    handleSendMessage: (content: MessageContent, onActionParsed?: (type: string, payload: Record<string, unknown>) => void) => Promise<void>;
  };
  placeholder?: string;
  authMode?: AuthMode;
  chatWidth?: string;
  mobileBreakpoint?: number;
}

export function SingleAgentLayout({
  moduleId,
  agentName,
  themeColor,
  children,
  ai,
  placeholder = "Communicate with agent...",
  authMode,
  chatWidth = 'clamp(320px, 32vw, 520px)',
  mobileBreakpoint = 1024
}: SingleAgentLayoutProps) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < mobileBreakpoint : false
  );
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < mobileBreakpoint;
      setIsMobile(mobile);
      if (mobile) setIsChatCollapsed(true);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileBreakpoint]);

  const themeClasses: Record<NeuralThemeColor, { 
    btnBg: string, 
    btnBorder: string, 
    btnText: string,
    sidebarBorder: string
  }> = {
    lime: { btnBg: 'bg-lime-600/20', btnBorder: 'border-lime-500/20', btnText: 'text-lime-400', sidebarBorder: 'border-lime-500/10' },
    sky: { btnBg: 'bg-sky-600/20', btnBorder: 'border-sky-500/20', btnText: 'text-sky-400', sidebarBorder: 'border-sky-500/10' },
    orange: { btnBg: 'bg-orange-600/20', btnBorder: 'border-orange-500/20', btnText: 'text-orange-400', sidebarBorder: 'border-orange-500/10' },
    cyan: { btnBg: 'bg-cyan-600/20', btnBorder: 'border-cyan-500/20', btnText: 'text-cyan-400', sidebarBorder: 'border-cyan-500/10' },
    purple: { btnBg: 'bg-purple-600/20', btnBorder: 'border-purple-500/20', btnText: 'text-purple-400', sidebarBorder: 'border-purple-500/10' },
    rose: { btnBg: 'bg-rose-600/20', btnBorder: 'border-rose-500/20', btnText: 'text-rose-400', sidebarBorder: 'border-rose-500/10' },
    amber: { btnBg: 'bg-amber-600/20', btnBorder: 'border-amber-500/20', btnText: 'text-amber-400', sidebarBorder: 'border-amber-500/10' },
    indigo: { btnBg: 'bg-indigo-600/20', btnBorder: 'border-indigo-500/20', btnText: 'text-indigo-400', sidebarBorder: 'border-indigo-500/10' },
    emerald: { btnBg: 'bg-emerald-600/20', btnBorder: 'border-emerald-500/20', btnText: 'text-emerald-400', sidebarBorder: 'border-emerald-500/10' },
    white: { btnBg: 'bg-white/10', btnBorder: 'border-white/20', btnText: 'text-white/60', sidebarBorder: 'border-white/10' }
  };

  const currentTheme = themeClasses[themeColor] || themeClasses.white;

  return (
    <div className="h-full flex overflow-hidden relative">
      {/* ── Open Chat Floating Button ── */}
      {isChatCollapsed && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsChatCollapsed(false)}
          className={cn(
            'z-[70] flex items-center gap-3 border backdrop-blur-xl shadow-2xl transition-all duration-300',
            currentTheme.btnBg,
            currentTheme.btnBorder,
            currentTheme.btnText,
            isMobile
              ? 'fixed bottom-8 right-8 px-6 py-4 rounded-full font-black text-xs uppercase tracking-[0.2em] italic'
              : 'absolute top-6 right-6 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] italic'
          )}
        >
          <MessageSquare className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          <span>Link {agentName}</span>
          <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
            themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
          )} />
        </motion.button>
      )}

      {/* ── Main Dashboard Content ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-black/5">
        <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          {children}
        </div>
      </div>

      {/* ── Agent Sidebar (Desktop) ── */}
      {!isMobile && (
        <motion.aside
          initial={false}
          animate={{
            width: isChatCollapsed ? 0 : chatWidth,
            opacity: isChatCollapsed ? 0 : 1,
            pointerEvents: isChatCollapsed ? 'none' : 'auto'
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            "h-full border-l bg-black/20 backdrop-blur-md flex flex-col relative shrink-0",
            currentTheme.sidebarBorder
          )}
        >
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <NexusChat
              moduleId={moduleId}
              ai={ai}
              agentName={agentName}
              themeColor={themeColor as any}
              placeholder={placeholder}
              authMode={authMode}
              showInternalSignals={false}
            />
          </div>
          
          {/* Collapse Handle */}
          {!isChatCollapsed && (
            <button
              onClick={() => setIsChatCollapsed(true)}
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-[60] w-6 h-12 flex items-center justify-center border transition-all rounded-l-xl backdrop-blur-xl',
                currentTheme.btnBg,
                currentTheme.btnBorder,
                currentTheme.btnText
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </motion.aside>
      )}

      {/* ── Agent Overlay (Mobile) ── */}
      {isMobile && (
        <AnimatePresence>
          {!isChatCollapsed && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-[80] bg-[#020205] flex flex-col"
            >
              <div className={cn("flex items-center justify-between px-6 py-4 border-b", currentTheme.sidebarBorder)}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                    themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
                  )} />
                  <span className={cn("font-black text-xs uppercase tracking-[0.3em] italic", currentTheme.btnText)}>
                    {agentName} Resonance
                  </span>
                </div>
                <button
                  onClick={() => setIsChatCollapsed(true)}
                  className={cn(
                    "p-2 rounded-xl border transition-all",
                    currentTheme.btnBg,
                    currentTheme.btnBorder,
                    currentTheme.btnText
                  )}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <NexusChat
                  moduleId={moduleId}
                  ai={ai}
                  agentName={agentName}
                  themeColor={themeColor as any}
                  placeholder={placeholder}
                  authMode={authMode}
                  showInternalSignals={false}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
