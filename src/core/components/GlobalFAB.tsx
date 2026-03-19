import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useAuthStore } from '@/lib/stores/auth-store';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/stores/ui-store';
import type { NeuralThemeColor } from '@/core/components/NeuralTabGroup';

const ANCHOR_SIZE = 56; // w-14 h-14

const themeItemClasses: Record<NeuralThemeColor, { bg: string; border: string; text: string }> = {
  lime:    { bg: 'bg-lime-600/15 hover:bg-lime-600/25',     border: 'border-lime-500/20',    text: 'text-lime-400' },
  sky:     { bg: 'bg-sky-600/15 hover:bg-sky-600/25',       border: 'border-sky-500/20',     text: 'text-sky-400' },
  orange:  { bg: 'bg-orange-600/15 hover:bg-orange-600/25', border: 'border-orange-500/20',  text: 'text-orange-400' },
  cyan:    { bg: 'bg-cyan-600/15 hover:bg-cyan-600/25',     border: 'border-cyan-500/20',    text: 'text-cyan-400' },
  purple:  { bg: 'bg-purple-600/15 hover:bg-purple-600/25', border: 'border-purple-500/20',  text: 'text-purple-400' },
  rose:    { bg: 'bg-rose-600/15 hover:bg-rose-600/25',     border: 'border-rose-500/20',    text: 'text-rose-400' },
  amber:   { bg: 'bg-amber-600/15 hover:bg-amber-600/25',   border: 'border-amber-500/20',   text: 'text-amber-400' },
  indigo:  { bg: 'bg-indigo-600/15 hover:bg-indigo-600/25', border: 'border-indigo-500/20',  text: 'text-indigo-400' },
  emerald: { bg: 'bg-emerald-600/15 hover:bg-emerald-600/25', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  white:   { bg: 'bg-white/[0.06] hover:bg-white/[0.1]',    border: 'border-white/10',       text: 'text-white/50' },
};

export function GlobalFAB() {
  const { user } = useAuth();
  // Only subscribe to onboardingComplete — never re-renders on other profile changes
  const isOnboardingComplete = useAuthStore(s => !!s.profile?.onboardingComplete);
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isChatOverlayOpen = useUIStore((s) => s.isChatOverlayOpen);
  const fabActions = useUIStore((s) => s.fabActions);
  const moduleBottomBarHeight = useUIStore((s) => s.moduleBottomBarHeight);

  // FAB rests at bottom-4 (16px). When a module bottom bar is present,
  // float above it with an 8px gap.
  const fabBottom = 16 + (moduleBottomBarHeight > 0 ? moduleBottomBarHeight + 8 : 0);

  const isVisible = useMemo(() => {
    if (!user || !isOnboardingComplete) return false;
    return location.pathname !== '/' && location.pathname !== '/orchestrator';
  }, [user, isOnboardingComplete, location.pathname]);

  const hasActions = fabActions.length > 0;

  const handleAnchorClick = () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    if (hasActions) {
      setIsExpanded(true);
    } else {
      window.dispatchEvent(new Event('open-nexus'));
    }
  };

  const handleActionClick = (onClick: () => void) => {
    onClick();
    setIsExpanded(false);
  };

  const handleNexusClick = () => {
    window.dispatchEvent(new Event('open-nexus'));
    setIsExpanded(false);
  };

  if (!isVisible || isChatOverlayOpen) return null;

  // Visual order (top → bottom above anchor):
  // Nexus is furthest up (primary global action), module actions just above anchor.
  // JSX order (flex-col, anchor last): Nexus first, module actions after.
  // Stagger is reversed so the bottom-most item (closest to thumb) animates in first.
  const dialItems = [
    ...fabActions.map((a) => ({
      ...a,
      onClick: () => handleActionClick(a.onClick),
    })),
    {
      id: '__nexus__',
      label: 'Consult Nexus',
      renderIcon: () => <Sparkles className="w-5 h-5" />,
      themeColor: 'indigo' as NeuralThemeColor,
      onClick: handleNexusClick,
    },
  ];

  return (
    <>
      {/* Backdrop — closes the dial when tapping outside */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="fab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsExpanded(false)}
            className="fixed inset-0 z-[var(--z-fab)]"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/*
        FAB stack — flex-col with anchor last so it sits at the physical bottom.
        `bottom` is animated via Framer Motion layout when a module bottom bar appears.
      */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ bottom: `calc(${fabBottom}px + env(safe-area-inset-bottom, 0px))` }}
        className="fixed left-4 z-[var(--z-fab)] flex flex-col items-start gap-3"
      >

        {/* Speed-dial items — render ABOVE anchor via flex-col order */}
        <AnimatePresence>
          {isExpanded && dialItems.map((item, i) => {
            const cls = themeItemClasses[item.themeColor] ?? themeItemClasses.white;
            // Reverse stagger: last item (closest to anchor) appears first
            const staggerDelay = (dialItems.length - 1 - i) * 0.055;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10, scale: 0.88 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28, delay: staggerDelay }}
                className="flex items-center gap-3"
              >
                {/* Action button */}
                <button
                  role="menuitem"
                  onClick={item.onClick}
                  style={{ width: ANCHOR_SIZE, height: ANCHOR_SIZE }}
                  className={cn(
                    'shrink-0 rounded-2xl flex items-center justify-center backdrop-blur-xl border transition-all shadow-md shadow-black/20',
                    cls.bg, cls.border, cls.text
                  )}
                  aria-label={item.label}
                >
                  {item.renderIcon()}
                </button>

                {/* Label pill — fades in slightly after the button */}
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ delay: staggerDelay + 0.07, duration: 0.15 }}
                  className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50 bg-black/50 backdrop-blur-xl border border-white/[0.07] px-3 py-1.5 rounded-xl whitespace-nowrap pointer-events-none select-none"
                >
                  {item.label}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Anchor FAB — always at the bottom of the stack */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          onHoverStart={() => { if (!hasActions && !isExpanded) setIsHovered(true); }}
          onHoverEnd={() => setIsHovered(false)}
          onClick={handleAnchorClick}
          style={{
            width: isHovered && !hasActions ? 180 : ANCHOR_SIZE,
            height: ANCHOR_SIZE,
            minWidth: ANCHOR_SIZE,
          }}
          className={cn(
            'flex items-center justify-center rounded-2xl backdrop-blur-xl border shadow-lg shadow-black/20 transition-[width,background-color,border-color] duration-300 overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/40',
            isExpanded
              ? 'bg-white/[0.08] border-white/[0.15]'
              : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.12]'
          )}
          aria-label={isExpanded ? 'Close actions menu' : hasActions ? 'Open actions menu' : 'Open Nexus'}
          aria-expanded={hasActions ? isExpanded : undefined}
          aria-haspopup={hasActions ? 'menu' : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isExpanded ? (
              <motion.span
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <X className="w-5 h-5 text-white/50 shrink-0" />
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center overflow-hidden"
              >
                <Sparkles className="w-5 h-5 text-white/35 shrink-0" />
                {/* Hover-expand label: desktop only, no actions registered */}
                {isHovered && !hasActions && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 whitespace-nowrap"
                  >
                    Consult Nexus
                  </motion.span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </>
  );
}
