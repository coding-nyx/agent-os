import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NexusChat } from '@/core/components/NexusChat';
import { NeuralThemeColor } from '@/core/components/NeuralTabGroup';
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
import { FloatingChatPanel } from '@/core/layout/FloatingChatPanel';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import type { AuthMode } from '@/core/components/UnifiedAuthModal';
import { useUIStore } from '@/lib/stores/ui-store';
import { SpineMobileBar } from '@/core/components/SpineMobileBar';
import { ModuleSwitcherPopover } from '@/core/components/ModuleSwitcherPopover';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';

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
    handleSendMessage: (
      content: MessageContent,
      onActionParsed?: (type: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent }
    ) => Promise<void>;
    clearSession: () => Promise<void>;
  };
  placeholder?: string;
  authMode?: AuthMode;
  chatWidth?: string;
  mobileBreakpoint?: number;
  dockChatBreakpoint?: number;
  contentClassName?: string;
  /** Optional secondary action button (e.g. FAB) to show next to chat trigger */
  primaryAction?: React.ReactNode;
  onUploadDocument?: (file: File) => void;
  onUploadDocuments?: (request: DocumentUploadRequest) => void | Promise<void>;
  hideChatTrigger?: boolean;
  /** Optional per-message extra content rendered below the message bubble (e.g. inline proposal cards). */
  renderMessageActions?: (message: Message, index: number) => React.ReactNode;
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
  mobileBreakpoint = 768,
  dockChatBreakpoint = mobileBreakpoint,
  contentClassName,
  primaryAction,
  onUploadDocument,
  onUploadDocuments,
  hideChatTrigger = false,
  renderMessageActions,
  isChatCollapsed: externalIsChatCollapsed,
  onToggleChat
}: SingleAgentLayoutProps) {
  const navigate = useNavigate();
  const [internalIsChatCollapsed, setInternalIsChatCollapsed] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : dockChatBreakpoint
  );
  
  const isChatCollapsed = externalIsChatCollapsed ?? internalIsChatCollapsed;
  const toggleChat = useCallback((val: boolean) => {
    if (onToggleChat) onToggleChat(val);
    else setInternalIsChatCollapsed(val);
  }, [onToggleChat]);

  const canDockChat = viewportWidth >= dockChatBreakpoint;
  const setChatOverlayOpen = useUIStore((s) => s.setChatOverlayOpen);
  const setActiveLayout = useUIStore((s) => s.setActiveLayout);

  // Sync overlay state to global store so NexusOverlay FAB hides
  const isOverlayChatOpen = !canDockChat && !isChatCollapsed;
  useEffect(() => {
    setChatOverlayOpen(isOverlayChatOpen);
    return () => setChatOverlayOpen(false);
  }, [isOverlayChatOpen, setChatOverlayOpen]);

  // Sync layout mode for dynamic positioning
  useEffect(() => {
    if (isOverlayChatOpen) setActiveLayout('overlay');
    else if (canDockChat && !isChatCollapsed) setActiveLayout('overlay');
    else setActiveLayout('full');
    return () => setActiveLayout('full');
  }, [canDockChat, isChatCollapsed, isOverlayChatOpen, setActiveLayout]);

  useEffect(() => {
    if (!isOverlayChatOpen || typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOverlayChatOpen]);

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
    // Keep track of previous width to detect crossing the breakpoint
    let prevWidth = window.innerWidth;

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < mobileBreakpoint;
      
      // Only auto-collapse if we just transitioned from desktop to mobile mode.
      // This prevents the chat from closing on mobile when the virtual keyboard 
      // triggers a window resize event.
      if (mobile && prevWidth >= mobileBreakpoint) {
        toggleChat(true);
      }
      
      prevWidth = width;
      setViewportWidth(width);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileBreakpoint, toggleChat]);

  const themeClasses: Record<NeuralThemeColor, { 
    btnBg: string, 
    btnBorder: string, 
    btnText: string,
    sidebarBorder: string,
    indicatorBg: string
  }> = {
    lime: { btnBg: 'bg-lime-600/20', btnBorder: 'border-lime-500/20', btnText: 'text-lime-400', sidebarBorder: 'border-lime-500/10', indicatorBg: 'bg-lime-400' },
    sky: { btnBg: 'bg-sky-600/20', btnBorder: 'border-sky-500/20', btnText: 'text-sky-400', sidebarBorder: 'border-sky-500/10', indicatorBg: 'bg-sky-400' },
    orange: { btnBg: 'bg-orange-600/20', btnBorder: 'border-orange-500/20', btnText: 'text-orange-400', sidebarBorder: 'border-orange-500/10', indicatorBg: 'bg-orange-400' },
    cyan: { btnBg: 'bg-cyan-600/20', btnBorder: 'border-cyan-500/20', btnText: 'text-cyan-400', sidebarBorder: 'border-cyan-500/10', indicatorBg: 'bg-cyan-400' },
    purple: { btnBg: 'bg-purple-600/20', btnBorder: 'border-purple-500/20', btnText: 'text-purple-400', sidebarBorder: 'border-purple-500/10', indicatorBg: 'bg-purple-400' },
    rose: { btnBg: 'bg-rose-600/20', btnBorder: 'border-rose-500/20', btnText: 'text-rose-400', sidebarBorder: 'border-rose-500/10', indicatorBg: 'bg-rose-400' },
    amber: { btnBg: 'bg-amber-600/20', btnBorder: 'border-amber-500/20', btnText: 'text-amber-400', sidebarBorder: 'border-amber-500/10', indicatorBg: 'bg-amber-400' },
    indigo: { btnBg: 'bg-indigo-600/20', btnBorder: 'border-indigo-500/20', btnText: 'text-indigo-400', sidebarBorder: 'border-indigo-500/10', indicatorBg: 'bg-indigo-400' },
    emerald: { btnBg: 'bg-emerald-600/20', btnBorder: 'border-emerald-500/20', btnText: 'text-emerald-400', sidebarBorder: 'border-emerald-500/10', indicatorBg: 'bg-emerald-400' },
    white: { btnBg: 'bg-white/10', btnBorder: 'border-white/20', btnText: 'text-white/60', sidebarBorder: 'border-white/10', indicatorBg: 'bg-white' },
    module: { btnBg: 'bg-[var(--module-accent-muted)]', btnBorder: 'border-[var(--module-accent-border)]', btnText: 'text-[var(--module-accent)]', sidebarBorder: 'border-[var(--module-accent-border)]', indicatorBg: 'bg-[var(--module-accent)]' }
  };

  const currentTheme = themeClasses[themeColor] || themeClasses.white;

  const moduleBottomBarHeight = useUIStore(s => s.moduleBottomBarHeight);
  const hideGlobalFAB = useUIStore(s => s.hideGlobalFAB);
  const floatingBottom = `calc(${Math.max(24, moduleBottomBarHeight + 24)}px + env(safe-area-inset-bottom, 0px))`;
  const floatingInlineEnd = 'calc(var(--space-4) + env(safe-area-inset-right, 0px))';

  return (
    <div
      className="relative flex h-full w-full min-w-0 max-w-full overflow-hidden"
      style={{ '--spine-sidebar-width': '0px' } as React.CSSProperties}
    >
      {/* Mobile module switcher */}
      {!canDockChat && (
        <div
          className="fixed z-[var(--z-fab)] md:hidden"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
          }}
        >
          <ModuleSwitcherPopover currentModuleId={moduleId} />
        </div>
      )}

      {/* ── Mobile chat trigger (floating circular FAB) ── */}
      {!canDockChat && isChatCollapsed && !hideChatTrigger && (
        <div 
          className="fixed z-[calc(var(--z-fab)+2)] flex flex-col items-end gap-3 transition-all duration-300"
          style={{ right: floatingInlineEnd, bottom: floatingBottom }}
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
              currentTheme.indicatorBg
            )} />
          </motion.button>
        </div>
      )}

      {/* ── Open Chat Floating Button (Desktop) ── */}
      {canDockChat && isChatCollapsed && !hideChatTrigger && (
        <div
          className="fixed z-[calc(var(--z-fab)+2)] flex flex-col items-end gap-3 transition-all duration-300"
          style={{ right: floatingInlineEnd, bottom: floatingBottom }}
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
              'border backdrop-blur-xl shadow-2xl transition-all duration-300 rounded-2xl font-semibold tracking-[0.04em]',
              currentTheme.btnBg,
              currentTheme.btnBorder,
              currentTheme.btnText
            )}
          >
            <div className="hidden lg:flex items-center gap-3 px-5 py-3 text-[12px]">
              <MessageSquare className="w-4 h-4" />
              <span>Chat {agentName}</span>
              <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", 
                currentTheme.indicatorBg
              )} />
            </div>
            <div className="flex lg:hidden items-center justify-center w-10 h-10">
              <MessageSquare className="w-4 h-4" />
            </div>
          </motion.button>
        </div>
      )}

      {/* ── Main Dashboard Content ── */}
      <div className="flex h-full flex-1 min-w-0 flex-col overflow-hidden bg-black/5">
        <div 
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden no-scrollbar scroll-smooth",
            !canDockChat && isChatCollapsed && !hideGlobalFAB && "pb-24"
          )}
        >
          <div className={cn("flex w-full min-w-0 flex-1 flex-col", contentClassName)}>
            {children}
          </div>
        </div>
      </div>

      {/* ── Desktop: Floating Chat Panel ── */}
      {canDockChat && (
        <FloatingChatPanel
          moduleId={moduleId}
          agentName={agentName}
          isOpen={!isChatCollapsed}
          onClose={() => toggleChat(true)}
          onClearHistory={ai.clearSession}
          themeClasses={currentTheme}
        >
          <div className="absolute top-2 left-0 right-0 z-30 px-4 pointer-events-none">
            <div className="pointer-events-auto w-full">
              <RoutingSuggestion
                target={ai.routingSuggestion?.target || 'agnes'}
                reason={ai.routingSuggestion?.reason}
                onConfirm={handleRouteConfirm}
                onDismiss={handleRouteDismiss}
                visible={ai.routingSuggestion !== undefined && ai.routingSuggestion !== null}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0 w-full h-full flex flex-col">
            <NexusChat
              moduleId={moduleId}
              ai={ai}
              agentName={agentName}
              themeColor={themeColor as any}
              placeholder={placeholder}
              authMode={authMode}
              showInternalSignals={false}
              hideClearHistory={true}
              onUploadDocument={onUploadDocument}
              onUploadDocuments={onUploadDocuments}
              renderMessageActions={renderMessageActions}
            />
          </div>
        </FloatingChatPanel>
      )}

      {/* ── Agent Overlay (Mobile/Tablet) — Bottom Sheet ── */}
      {!canDockChat && createPortal(
        <AnimatePresence>
          {!isChatCollapsed && (
            <motion.div
              key="mobile-chat-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[var(--z-modal)] flex flex-col justify-end bg-black/60 backdrop-blur-[2px]"
              onClick={() => toggleChat(true)} // Click backdrop to close
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "relative flex flex-col h-[85dvh] w-full bg-[#09090b] rounded-t-3xl overflow-hidden shadow-2xl border-t",
                  currentTheme.sidebarBorder
                )}
              >
                {/* Drag Handle */}
                <div className="w-full flex justify-center pt-3 pb-1 shrink-0" onPointerDown={() => toggleChat(true)}>
                  <div className="w-12 h-1.5 rounded-full bg-white/20" />
                </div>

                <div className={cn("shell-overlay-panel relative flex min-h-0 flex-1 flex-col")}>
                  <div
                    className={cn("relative flex items-center justify-between border-b px-4 py-2", currentTheme.sidebarBorder)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("h-2 w-2 rounded-full animate-pulse", 
                        currentTheme.indicatorBg
                      )} />
                      <span className={cn("font-display text-[12px] font-semibold tracking-[0.04em]", currentTheme.btnText)}>
                        {agentName}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleChat(true)}
                      className={cn(
                        "p-2 rounded-full hover:bg-white/5 transition-colors"
                      )}
                    >
                      <X size={18} className="text-white/50" />
                    </button>
                  </div>
                  <div
                    className="flex min-h-0 flex-1 flex-col pb-safe"
                  >
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
                       onUploadDocuments={onUploadDocuments}
                       renderMessageActions={renderMessageActions}
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
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
