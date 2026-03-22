/**
 * MobileDiagnosisTabs
 * 
 * Mobile-only tab switcher for diagnosis Results/Chat toggle.
 * Uses segmented control pattern for easy thumb reach.
 * Hidden on lg: breakpoint and above where split-pane is used.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { List, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export type MobileDiagnosisTab = 'results' | 'chat';

interface MobileDiagnosisTabsProps {
  activeTab: MobileDiagnosisTab;
  onTabChange: (tab: MobileDiagnosisTab) => void;
  resultCount?: number;
  className?: string;
}

export function MobileDiagnosisTabs({
  activeTab,
  onTabChange,
  resultCount = 0,
  className,
}: MobileDiagnosisTabsProps) {
  const reducedMotion = useReducedMotion();

  const tabs: Array<{
    id: MobileDiagnosisTab;
    label: string;
    icon: typeof List;
    badge?: number;
  }> = [
    { id: 'results', label: 'Results', icon: List, badge: resultCount > 0 ? resultCount : undefined },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
  ];

  return (
    <div
      role="tablist"
      aria-label="Diagnosis view"
      className={cn(
        'flex w-full gap-1 rounded-xl bg-black/30 backdrop-blur-md border border-white/[0.06] p-1',
        'lg:hidden', // Only visible below lg breakpoint
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`diagnosis-panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-3',
              'min-h-[48px]', // WCAG touch target
              'text-sm font-semibold tracking-wide transition-colors duration-200',
              'outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/50',
              isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
            )}
          >
            {/* Active background pill */}
            {isActive && (
              <motion.div
                layoutId="mobile-diagnosis-tab-pill"
                className="absolute inset-0 rounded-lg bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 400, damping: 30 }
                }
              />
            )}

            {/* Content */}
            <div className="relative z-10 flex items-center gap-2">
              <Icon
                className={cn(
                  'w-4 h-4 transition-colors',
                  isActive ? 'text-[var(--module-color-400)]' : 'text-white/30'
                )}
                aria-hidden
              />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums',
                    isActive
                      ? 'bg-[var(--module-accent-glow)] text-[var(--module-color-300)] border border-[var(--module-accent-border)]'
                      : 'bg-white/10 text-white/50 border border-white/10'
                  )}
                >
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
