import { motion } from 'framer-motion';
import { BookMarked, FileText, LayoutDashboard, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScoutTopLevelView } from '../scout-shell-layout';

interface MobileBottomNavProps {
  activeView: ScoutTopLevelView;
  onViewChange: (view: ScoutTopLevelView) => void;
  onNewSession: () => void;
  hasActiveSession?: boolean;
  className?: string;
}

const NAV_ITEMS: Array<{ id: ScoutTopLevelView; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'research', label: 'Research', icon: Search },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sources', label: 'Sources', icon: BookMarked },
  { id: 'briefings', label: 'Briefs', icon: FileText },
];

// Split into left/right halves around the center FAB
const LEFT_ITEMS = NAV_ITEMS.slice(0, 2);
const RIGHT_ITEMS = NAV_ITEMS.slice(2);

export function MobileBottomNav({
  activeView,
  onViewChange,
  onNewSession,
  className,
}: MobileBottomNavProps) {
  return (
    <nav
      className={cn(
        'lg:hidden fixed bottom-0 inset-x-0 z-[var(--z-header)] border-t border-white/8 bg-[#05050a]/95 backdrop-blur-xl',
        'pb-[env(safe-area-inset-bottom,0px)]',
        className,
      )}
      aria-label="Scout navigation"
    >
      <div className="flex items-center justify-around px-2 h-16">
        {/* Left pair */}
        {LEFT_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors duration-200',
                isActive
                  ? 'text-[var(--module-color-400)]'
                  : 'text-white/35 hover:text-white/60',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-0 rounded-xl bg-[var(--module-accent-muted)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative h-5 w-5" />
              <span className="relative text-[9px] font-bold uppercase tracking-wider leading-none">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Center FAB */}
        <div className="flex shrink-0 flex-col items-center justify-center px-2">
          <button
            type="button"
            onClick={onNewSession}
            aria-label="Start new research session"
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform duration-150 active:scale-95',
              'bg-[var(--module-accent)] text-[var(--module-accent-text)]',
              'border border-[var(--module-accent-border)] shadow-[var(--module-accent-shadow)]',
            )}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Right pair */}
        {RIGHT_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors duration-200',
                isActive
                  ? 'text-[var(--module-color-400)]'
                  : 'text-white/35 hover:text-white/60',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-0 rounded-xl bg-[var(--module-accent-muted)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="relative h-5 w-5" />
              <span className="relative text-[9px] font-bold uppercase tracking-wider leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
