/**
 * CollapsibleAIPanel — Reusable slide-out AI chat panel for module dashboards.
 *
 * Collapsed: floating button (bottom-right) with module-themed pulse animation.
 * Expanded:  slide-out panel (~400 px, right edge) wrapping AraChat.
 *
 * • Uses `useModuleAI` internally for conversation state.
 * • Keyboard shortcut: Cmd/Ctrl+K toggles the panel.
 * • Mobile-responsive: full-width overlay on screens < 768 px.
 * • Exposes imperative handle via `React.forwardRef` so host pages can
 *   programmatically send messages, or open/close the panel.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useFocusTrap } from '@/lib/hooks/use-focus-trap';
import { AraChat } from './AraChat';
import type { ModuleTheme, ModuleId } from '@/lib/module-manifest';
import type { AuthMode } from './UnifiedAuthModal';
import type { MessageContent } from '@/lib/types';

// ─── Public types ────────────────────────────────────────────────────────────

export interface CollapsibleAIPanelProps {
  /** Module identifier — forwarded to useModuleAI. */
  moduleId: ModuleId;
  /** Display name of the AI agent (e.g. "Atlas"). */
  persona: string;
  /** System prompt that configures the agent's behaviour. */
  systemPrompt: string;
  /** Theme colour key — drives button/header styling + ChatInterface theme. */
  themeColor: ModuleTheme;
  /** Encryption key forwarded to useModuleAI for E2EE session storage. */
  encryptionKey?: CryptoKey | null;
  /** Callback fired each time the AI executes a parsed action tag. */
  onActionResult?: (type: string, payload: Record<string, unknown>) => void;
  /** Extra Tailwind classes on the outermost wrapper. */
  className?: string;
  /** Placeholder text inside the chat input. */
  placeholder?: string;
  /** If provided, rendered as the first assistant message when the
   *  conversation history is empty. */
  greeting?: string;
  /** Auth mode forwarded to AraChat → UnifiedAuthModal. */
  authMode?: AuthMode;
}

export interface CollapsibleAIPanelRef {
  /** Programmatically send a message through the panel's AI. */
  sendMessage: (content: import('@/lib/types').MessageContent) => Promise<void>;
  /** Open the panel. */
  open: () => void;
  /** Close the panel. */
  close: () => void;
  /** Toggle open / closed. */
  toggle: () => void;
}

// ─── Theme mapping ───────────────────────────────────────────────────────────

const THEME_CLASSES: Record<
  string,
  { button: string; header: string; glow: string; pulse: string }
> = {
  indigo: {
    button: 'bg-indigo-600/80 hover:bg-indigo-500 border-indigo-400/30 text-indigo-100',
    header: 'border-indigo-500/20 text-indigo-400',
    glow: 'shadow-indigo-500/30',
    pulse: 'bg-indigo-400',
  },
  orange: {
    button: 'bg-orange-600/80 hover:bg-orange-500 border-orange-400/30 text-orange-100',
    header: 'border-orange-500/20 text-orange-400',
    glow: 'shadow-orange-500/30',
    pulse: 'bg-orange-400',
  },
  cyan: {
    button: 'bg-cyan-600/80 hover:bg-cyan-500 border-cyan-400/30 text-cyan-100',
    header: 'border-cyan-500/20 text-cyan-400',
    glow: 'shadow-cyan-500/30',
    pulse: 'bg-cyan-400',
  },
  emerald: {
    button: 'bg-emerald-600/80 hover:bg-emerald-500 border-emerald-400/30 text-emerald-100',
    header: 'border-emerald-500/20 text-emerald-400',
    glow: 'shadow-emerald-500/30',
    pulse: 'bg-emerald-400',
  },
  sky: {
    button: 'bg-sky-600/80 hover:bg-sky-500 border-sky-400/30 text-sky-100',
    header: 'border-sky-500/20 text-sky-400',
    glow: 'shadow-sky-500/30',
    pulse: 'bg-sky-400',
  },
  lime: {
    button: 'bg-lime-600/80 hover:bg-lime-500 border-lime-400/30 text-lime-100',
    header: 'border-lime-500/20 text-lime-400',
    glow: 'shadow-lime-500/30',
    pulse: 'bg-lime-400',
  },
  rose: {
    button: 'bg-rose-600/80 hover:bg-rose-500 border-rose-400/30 text-rose-100',
    header: 'border-rose-500/20 text-rose-400',
    glow: 'shadow-rose-500/30',
    pulse: 'bg-rose-400',
  },
  fuchsia: {
    button: 'bg-fuchsia-600/80 hover:bg-fuchsia-500 border-fuchsia-400/30 text-fuchsia-100',
    header: 'border-fuchsia-500/20 text-fuchsia-400',
    glow: 'shadow-fuchsia-500/30',
    pulse: 'bg-fuchsia-400',
  },
  violet: {
    button: 'bg-violet-600/80 hover:bg-violet-500 border-violet-400/30 text-violet-100',
    header: 'border-violet-500/20 text-violet-400',
    glow: 'shadow-violet-500/30',
    pulse: 'bg-violet-400',
  },
  slate: {
    button: 'bg-slate-600/80 hover:bg-slate-500 border-slate-400/30 text-slate-100',
    header: 'border-slate-500/20 text-slate-400',
    glow: 'shadow-slate-500/30',
    pulse: 'bg-slate-400',
  },
};

function themeFor(color: ModuleTheme) {
  return THEME_CLASSES[color] ?? THEME_CLASSES.indigo;
}

// ─── Mobile hook (shared pattern from TitanPage) ─────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const CollapsibleAIPanel = forwardRef<CollapsibleAIPanelRef, CollapsibleAIPanelProps>(
  function CollapsibleAIPanel(
    {
      moduleId,
      persona,
      systemPrompt,
      themeColor,
      encryptionKey,
      onActionResult,
      className,
      placeholder,
      greeting,
      authMode,
    },
    ref,
  ) {
    const [isOpen, setIsOpen] = useState(false);
    const reducedMotion = useReducedMotion();
    const isMobile = useIsMobile();
    const greetingSetRef = useRef(false);

    // ── AI state ──────────────────────────────────────────────────────────────
    const {
      messages,
      setMessages,
      isProcessing,
      streamingText,
      error,
      quota,
      handleSendMessage,
    } = useModuleAI({
      moduleId,
      systemPrompt,
      encryptionKey: encryptionKey ?? null,
    });

    // ── Greeting (first assistant message) ────────────────────────────────────
    useEffect(() => {
      if (
        greeting &&
        !greetingSetRef.current &&
        messages.length === 0 &&
        !isProcessing &&
        !streamingText
      ) {
        greetingSetRef.current = true;
        setMessages([{ role: 'assistant', content: greeting }]);
      }
    }, [greeting, messages.length, isProcessing, streamingText, setMessages]);

    // ── Keyboard shortcut (Cmd/Ctrl + K) ──────────────────────────────────────
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Wrap handleSendMessage with onActionResult callback ───────────────────
    const wrappedSendMessage = useCallback(
      async (content: MessageContent) => {
        await handleSendMessage(content, onActionResult);
      },
      [handleSendMessage, onActionResult],
    );

    // ── Imperative ref ────────────────────────────────────────────────────────
    useImperativeHandle(
      ref,
      () => ({
        sendMessage: async (content: MessageContent) => {
          setIsOpen(true);
          await wrappedSendMessage(content);
        },
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen((prev) => !prev),
      }),
      [wrappedSendMessage],
    );

    const theme = themeFor(themeColor);

    const closePanel = useCallback(() => setIsOpen(false), []);
    const focusTrapRef = useFocusTrap<HTMLElement>({
      active: isOpen,
      onEscape: closePanel,
    });

    // ── Animation variants ────────────────────────────────────────────────────
    const panelVariants = {
      hidden: {
        x: '100%',
        opacity: 0,
        transition: { type: 'spring' as const, stiffness: 400, damping: 35 },
      },
      visible: {
        x: 0,
        opacity: 1,
        transition: { type: 'spring' as const, stiffness: 400, damping: 35 },
      },
    };

    const backdropVariants = {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    };

    const buttonVariants = {
      hidden: { scale: 0.6, opacity: 0 },
      visible: {
        scale: 1,
        opacity: 1,
        transition: { type: 'spring' as const, stiffness: 500, damping: 25, delay: 0.1 },
      },
      exit: { scale: 0.6, opacity: 0, transition: { duration: 0.15 } },
    };

    return (
      <div className={cn('collapsible-ai-panel-root', className)}>
        {/* ── Floating trigger button ───────────────────────────────────────── */}
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              key="ai-trigger"
              variants={reducedMotion ? undefined : buttonVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setIsOpen(true)}
              aria-label={`Open ${persona} AI assistant`}
              className={cn(
                'fixed z-[75] flex items-center gap-2 rounded-full border px-4 py-3 font-black text-xs uppercase tracking-widest italic backdrop-blur-xl shadow-lg transition-all',
                'bottom-6 right-6',
                theme.button,
                theme.glow,
              )}
            >
              {/* Pulse ring */}
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
                    theme.pulse,
                  )}
                />
                <Sparkles className="relative h-4 w-4" />
              </span>
              <span className="hidden sm:inline">{persona}</span>
              <kbd className="ml-1 hidden rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono not-italic tracking-normal sm:inline">
                ⌘K
              </kbd>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Slide-out panel ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop (mobile only) */}
              {isMobile && (
                <motion.div
                  key="ai-backdrop"
                  variants={reducedMotion ? undefined : backdropVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 z-[79] bg-black/60 backdrop-blur-sm"
                  aria-hidden
                />
              )}

              <motion.aside
                ref={focusTrapRef}
                key="ai-panel"
                role="dialog"
                aria-modal="true"
                aria-label={`${persona} AI assistant`}
                variants={reducedMotion ? undefined : panelVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className={cn(
                  'fixed top-0 right-0 bottom-0 z-[80] flex flex-col',
                  'bg-slate-900/95 backdrop-blur-2xl border-l border-white/[0.12]',
                  isMobile ? 'w-full' : 'w-[400px]',
                )}
              >
                {/* ── Panel header ─────────────────────────────────────────── */}
                <div
                  className={cn(
                    'flex items-center justify-between px-4 py-3 border-b',
                    theme.header,
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest italic">
                      {persona} Link
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <kbd className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono text-white/40 sm:inline">
                      ⌘K
                    </kbd>
                    <button
                      onClick={() => setIsOpen(false)}
                      aria-label="Close AI panel"
                      className="rounded-lg p-1.5 hover:bg-white/10 transition-colors"
                    >
                      <X className="h-4 w-4 text-white/60" />
                    </button>
                  </div>
                </div>

                {/* ── Chat body ─────────────────────────────────────────────── */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <AraChat
                    ai={{
                      messages,
                      setMessages,
                      isProcessing,
                      streamingText,
                      error,
                      quota,
                      handleSendMessage: wrappedSendMessage,
                    }}
                    agentName={persona}
                    themeColor={themeColor}
                    placeholder={placeholder ?? `Ask ${persona} anything…`}
                    moduleId={moduleId}
                    authMode={authMode ?? moduleId}
                  />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
