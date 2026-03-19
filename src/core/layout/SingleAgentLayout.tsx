import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, MessageSquare, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NexusChat } from '@/core/components/NexusChat';
import { NeuralThemeColor } from '@/core/components/NeuralTabGroup';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import type { AuthMode } from '@/core/components/UnifiedAuthModal';
import { useUIStore } from '@/lib/stores/ui-store';
import { SpineMobileBar } from '@/core/components/SpineMobileBar';

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
    routingSuggestion?: { target: ModuleId; reason?: string } | null;
    setRoutingSuggestion?: (suggestion: { target: ModuleId; reason?: string } | null) => void;
    handleSendMessage: (content: MessageContent, onActionParsed?: (type: string, payload: Record<string, unknown>) => void) => Promise<void>;
    clearSession: () => Promise<void>;
  };
  placeholder?: string;
  authMode?: AuthMode;
  chatWidth?: string;
  mobileBreakpoint?: number;
  /** Optional secondary action button (e.g. FAB) to show next to chat trigger */
  primaryAction?: React.ReactNode;
  onUploadDocument?: (file: File) => void;
  // External control for layout intelligence
  isChatCollapsed?: boolean;
  onToggleChat?: (collapsed: boolean) => void;
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
  mobileBreakpoint = 768,
  primaryAction,
  onUploadDocument,
  isChatCollapsed: externalIsChatCollapsed,
  onToggleChat
}: SingleAgentLayoutProps) {
  const navigate = useNavigate();
  const [internalIsChatCollapsed, setInternalIsChatCollapsed] = useState(true);
  
  const isChatCollapsed = externalIsChatCollapsed ?? internalIsChatCollapsed;
  const toggleChat = (val: boolean) => {
    if (onToggleChat) onToggleChat(val);
    else setInternalIsChatCollapsed(val);
  };

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < mobileBreakpoint : false
  );
  const setChatOverlayOpen = useUIStore((s) => s.setChatOverlayOpen);
  const setActiveLayout = useUIStore((s) => s.setActiveLayout);

  // Sync overlay state to global store so NexusOverlay FAB hides
  const isMobileChatOpen = isMobile && !isChatCollapsed;
  useEffect(() => {
    setChatOverlayOpen(isMobileChatOpen);
    return () => setChatOverlayOpen(false);
  }, [isMobileChatOpen, setChatOverlayOpen]);

  // Sync layout mode for dynamic positioning
  useEffect(() => {
    if (isMobileChatOpen) setActiveLayout('overlay');
    else if (!isMobile && !isChatCollapsed) setActiveLayout('split');
    else setActiveLayout('full');
    return () => setActiveLayout('full');
  }, [isMobile, isChatCollapsed, isMobileChatOpen, setActiveLayout]);

  const handleRouteConfirm = useCallback(() => {
    if (!ai.routingSuggestion) return;
    const manifest = MODULE_MANIFEST[ai.routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    ai.setRoutingSuggestion?.(null);
  }, [ai.routingSuggestion, navigate, ai.setRoutingSuggestion]);

  const handleRouteDismiss = useCallback(() => {
    ai.setRoutingSuggestion?.(null);
  }, [ai.setRoutingSuggestion]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < mobileBreakpoint;
      setIsMobile((prev) => {
        // Only auto-collapse if we just transitioned from desktop to mobile mode.
        // This prevents the chat from closing on mobile when the virtual keyboard 
        // triggers a window resize event.
        if (mobile && !prev) {
          toggleChat(true);
        }
        return mobile;
      });
    };

    window.addEventListener('resize', handleResize);
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

  const moduleBottomBarHeight = useUIStore(s => s.moduleBottomBarHeight);
  const hideGlobalFAB = useUIStore(s => s.hideGlobalFAB);

  return (
    <div
      className="h-full flex overflow-hidden relative"
      style={{ '--spine-sidebar-width': isChatCollapsed ? '0px' : chatWidth } as React.CSSProperties}
    >
      {/* ── Mobile chat trigger (floating circular FAB) ── */}
      {isMobile && isChatCollapsed && (
        <div 
          className="fixed right-4 flex flex-col items-end gap-3 z-[var(--z-fab)] transition-all duration-300"
          style={{ bottom: `calc(${Math.max(24, moduleBottomBarHeight + 24)}px + env(safe-area-inset-bottom, 0px))` }}
        >
          {primaryAction && (
            <div className="shrink-0 flex items-center justify-center">
              {primaryAction}
            </div>
          )}
          <motion.button
            initial={{ opacity: 0, scale: 0.9, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => toggleChat(false)}
            className={cn(
              'relative flex items-center justify-center border backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all duration-300',
              currentTheme.btnBg,
              currentTheme.btnBorder,
              currentTheme.btnText,
              'w-14 h-14 rounded-full'
            )}
            aria-label={`Chat ${agentName}`}
          >
            <MessageSquare className="w-6 h-6" />
            <div className={cn("absolute top-3 right-3 w-2.5 h-2.5 rounded-full border-2 border-black animate-pulse",
              themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
            )} />
          </motion.button>
        </div>
      )}

      {/* ── Open Chat Floating Button (Desktop) ── */}
      {!isMobile && isChatCollapsed && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9, x: 20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => toggleChat(false)}
          className={cn(
            'z-[var(--z-fab)] fixed right-4 md:right-3 lg:right-6 border backdrop-blur-xl shadow-2xl transition-all duration-300 rounded-2xl font-bold uppercase tracking-[0.1em]',
            currentTheme.btnBg,
            currentTheme.btnBorder,
            currentTheme.btnText
          )}
          style={{ bottom: `calc(${Math.max(24, moduleBottomBarHeight + 24)}px + env(safe-area-inset-bottom, 0px))` }}
        >
          <div className="hidden lg:flex items-center gap-3 px-5 py-3 text-[10px]">
            <MessageSquare className="w-4 h-4" />
            <span>Chat {agentName}</span>
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
              themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
            )} />
          </div>
          <div className="flex lg:hidden items-center justify-center w-10 h-10">
            <MessageSquare className="w-4 h-4" />
          </div>
        </motion.button>
      )}

      {/* ── Main Dashboard Content ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-black/5">
        <div className={cn(
          "flex-1 overflow-y-auto no-scrollbar scroll-smooth flex flex-col",
          isMobile && isChatCollapsed && !hideGlobalFAB && "pb-24"
        )}>
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
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
            <NexusChat
              moduleId={moduleId}
              ai={ai}
              agentName={agentName}
              themeColor={themeColor as any}
              placeholder={placeholder}
              authMode={authMode}
              showInternalSignals={false}
              onClearHistory={ai.clearSession}
              onUploadDocument={onUploadDocument}
            />
            {/* Routing suggestion — inline below chat input */}
            <RoutingSuggestion
              target={ai.routingSuggestion?.target || 'agnes'}
              reason={ai.routingSuggestion?.reason}
              onConfirm={handleRouteConfirm}
              onDismiss={handleRouteDismiss}
              visible={ai.routingSuggestion !== undefined && ai.routingSuggestion !== null}
            />
          </div>
          
          {/* Collapse Handle */}
          {!isChatCollapsed && (
            <button
              onClick={() => toggleChat(true)}
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-[var(--z-fab)] w-6 h-12 flex items-center justify-center border transition-all rounded-l-xl backdrop-blur-xl',
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

      {/* ── Agent Overlay (Mobile) — portaled to body to escape stacking context ── */}
      {isMobile && createPortal(
        <AnimatePresence>
          {!isChatCollapsed && (
            <motion.div
              key="mobile-chat-overlay"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-0 z-[var(--z-modal)] bg-[#020205] flex flex-col h-[100dvh]"
            >
              <div className={cn("relative flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b", currentTheme.sidebarBorder)}>
                <SpineMobileBar accentColor={undefined} />
                <div className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", 
                    themeColor === 'white' ? 'bg-white' : `bg-${themeColor}-400`
                  )} />
                  <span className={cn("font-bold text-xs uppercase tracking-[0.12em] font-display", currentTheme.btnText)}>
                    {agentName} Resonance
                  </span>
                </div>
                <button
                  onClick={() => toggleChat(true)}
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
              <div className="flex-1 min-h-0 flex flex-col relative">
                <NexusChat
                  moduleId={moduleId}
                  ai={ai}
                  agentName={agentName}
                  themeColor={themeColor as any}
                  placeholder={placeholder}
                  authMode={authMode}
                  showInternalSignals={false}
                  onClearHistory={ai.clearSession}
                />
                {/* Routing suggestion — inline below chat input */}
                <RoutingSuggestion
                  target={ai.routingSuggestion?.target || 'agnes'}
                  reason={ai.routingSuggestion?.reason}
                  onConfirm={handleRouteConfirm}
                  onDismiss={handleRouteDismiss}
                  visible={ai.routingSuggestion !== undefined && ai.routingSuggestion !== null}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
