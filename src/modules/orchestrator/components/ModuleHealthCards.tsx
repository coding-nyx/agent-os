import React from 'react';
import { motion } from 'framer-motion';
import { Lock, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useModuleHealth, type StatusTone } from '../hooks/useModuleHealth';

const TONE_DOT: Record<StatusTone, string> = {
  good: 'bg-emerald-400',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  neutral: 'bg-white/20',
};

function formatLastActive(iso: string | null): string {
  if (!iso) return 'No sessions';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function ModuleHealthCards() {
  const { modules, isLoading } = useModuleHealth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="min-w-[110px] h-[76px] rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
      {modules.map((mod, i) => {
        const Icon = mod.icon;
        return (
          <motion.button
            key={mod.moduleId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            onClick={() => navigate(mod.route)}
            className={cn(
              'min-w-[110px] rounded-xl border px-4 py-3 text-left transition-all',
              'hover:border-white/15 hover:bg-white/[0.04]',
              mod.isAccessible
                ? 'border-white/8 bg-white/[0.02]'
                : 'border-white/5 bg-white/[0.01] opacity-60',
              mod.hasAlert && 'ring-1 ring-rose-500/30 animate-pulse',
            )}
            aria-label={`${mod.title}: ${mod.isAccessible ? formatLastActive(mod.lastActive) : 'Locked'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {mod.isAccessible ? (
                <Icon className="w-4 h-4" style={{ color: mod.colorHex }} />
              ) : (
                <Lock className="w-4 h-4 text-white/30" />
              )}
              <span className="text-xs font-bold text-white/80 truncate">{mod.title}</span>
            </div>
            <div className="flex items-center gap-2">
              {mod.isAccessible && (
                <div className={cn('w-2 h-2 rounded-full', TONE_DOT[mod.keyMetricTone])} />
              )}
              <span className="text-[11px] text-white/45 truncate">
                {mod.isAccessible ? formatLastActive(mod.lastActive) : '🔒'}
              </span>
            </div>
          </motion.button>
        );
      })}

      {/* Hub card — inline with module cards */}
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: modules.length * 0.05, duration: 0.2 }}
        onClick={() => navigate('/hub')}
        className={cn(
          'min-w-[110px] rounded-xl border px-4 py-3 text-left transition-all',
          'hover:border-indigo-500/30 hover:bg-indigo-500/[0.06]',
          'border-indigo-500/15 bg-indigo-500/[0.03]',
        )}
        aria-label="Open Hub — 3D view, Graph, and Module Cards"
      >
        <div className="flex items-center gap-2 mb-2">
          <LayoutDashboard className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-white/80 truncate">Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/45 truncate">3D · Graph</span>
        </div>
      </motion.button>
    </div>
  );
}
