import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, LayoutDashboard, Sparkles } from 'lucide-react';
import { MODULE_MANIFEST, HUB_MODULE_ORDER, ModuleId } from '@/lib/module-manifest';
import { cn } from '@/lib/utils';

interface ModuleSwitcherPopoverProps {
  currentModuleId?: ModuleId | string;
}

// Modules shown in the popover grid — orchestrator (Ara) is handled
// separately as the HOME button above, so exclude it here.
const POPOVER_MODULE_IDS: ModuleId[] = [
  ...HUB_MODULE_ORDER,
];

export function ModuleSwitcherPopover({ currentModuleId }: ModuleSwitcherPopoverProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  function isActiveModule(route: string): boolean {
    if (!route) return false;
    return location.pathname === route || location.pathname.startsWith(route + '/');
  }

  function handleNavigate(route: string) {
    navigate(route);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-2.5 sm:py-1.5 rounded-lg bg-white/[0.045] border border-white/[0.12] hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-white/30 min-h-[44px] sm:min-h-0"
        aria-label="Switch module"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="text-[11px] font-bold uppercase tracking-widest hidden lg:block">Modules</span>
      </button>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="module-switcher-popover"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full right-0 mt-2 z-[var(--z-modal)] w-64 bg-slate-900/90 backdrop-blur-2xl border border-white/[0.12] rounded-2xl p-3 shadow-2xl"
            role="menu"
            aria-label="Module navigation"
          >
            {/* Ara — home base, hidden when already on orchestrator */}
            {!isActiveModule('/ara') && (
              <>
                <button
                  type="button"
                  onClick={() => handleNavigate('/ara')}
                  role="menuitem"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl w-full text-left transition-colors hover:bg-violet-500/10 mb-1 min-h-[44px]"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#8B5CF620', border: '1px solid #8B5CF640' }}>
                    <Sparkles className="w-3 h-3" style={{ color: '#8B5CF6' }} />
                  </div>
                  <span className="text-xs font-semibold text-violet-400">Ara</span>
                  <span className="ml-auto text-[11px] text-white/25 uppercase tracking-wider">Home</span>
                </button>
                <div className="my-1.5 border-t border-white/[0.09]" />
              </>
            )}

            {/* Section label */}
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/35 px-1 mb-2">
              Modules
            </p>

            {/* 2-column grid of modules */}
            <div className="grid grid-cols-2 gap-1">
              {POPOVER_MODULE_IDS.map((moduleId) => {
                const manifest = MODULE_MANIFEST[moduleId];
                if (!manifest || !manifest.hasPage) return null;
                const Icon = manifest.icon;
                const active = isActiveModule(manifest.route) || currentModuleId === moduleId;

                return (
                  <button
                    key={moduleId}
                    type="button"
                    onClick={() => handleNavigate(manifest.route)}
                    role="menuitem"
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-xl w-full text-left transition-colors hover:bg-white/10 min-h-[44px]',
                      active && 'bg-white/[0.045] ring-1 ring-white/20'
                    )}
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${manifest.colorHex}20`,
                        border: `1px solid ${manifest.colorHex}40`,
                      }}
                    >
                      <Icon className="w-3 h-3" style={{ color: manifest.colorHex }} />
                    </div>
                    <span className="text-xs font-semibold text-white/70 truncate">{manifest.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-white/[0.09]" />

            {/* Hub button — visual module map view */}
            <button
              type="button"
              onClick={() => handleNavigate('/hub')}
              role="menuitem"
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl w-full text-left transition-colors hover:bg-white/10 min-h-[44px]',
                isActiveModule('/hub') && 'bg-white/[0.045] ring-1 ring-white/20'
              )}
            >
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#8B5CF620', border: '1px solid #8B5CF640' }}
              >
                <LayoutDashboard className="w-3 h-3" style={{ color: '#8B5CF6' }} />
              </div>
              <span className="text-xs font-semibold text-white/70">Hub</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
