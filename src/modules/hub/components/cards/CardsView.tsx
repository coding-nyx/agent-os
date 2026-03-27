import React from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneClass, toneTextClass, CORE_MODULES, type ModuleCardProps } from '../../constants';
import { DailyBrief } from '../DailyBrief';

export const ModuleCard = React.memo(function ModuleCard({
  title, icon: Icon, color, isLocked, onClick, description, stat, isPlugin
}: ModuleCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -5, scale: 1.015 }}
      whileTap={{ scale: 0.975 }}
      aria-label={`Open ${title} module`}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className={cn(
        "group relative rounded-[28px] border transition-colors duration-200 text-left overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-black",
        isPlugin ? "p-5 w-full shrink-0" : "p-5 sm:p-7",
        isLocked
          ? "bg-white/[0.028] border-white/[0.07] opacity-55 hover:opacity-70 cursor-not-allowed"
          : [
              "bg-[rgba(255,255,255,0.048)] backdrop-blur-3xl border-white/[0.12]",
              "hover:border-white/[0.22] hover:bg-[rgba(255,255,255,0.065)]",
              "shadow-[0_4px_20px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.10)]",
              "hover:shadow-[0_8px_32px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.14)]",
            ]
      )}
    >
      {/* Hover sheen */}
      {!isLocked && (
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none overflow-hidden rounded-[inherit]">
          <div className="absolute inset-0 hub-card-sheen" />
        </div>
      )}
      <div className="relative z-10">
        <div className={cn(
          "rounded-2xl border flex items-center justify-center transition-all duration-300",
          isPlugin
            ? "w-10 h-10 mb-3.5 bg-white/[0.06] border-white/[0.10]"
            : "w-14 h-14 mb-5 bg-white/[0.08] border-white/[0.15] group-hover:scale-105 group-hover:rotate-2",
          isLocked && "opacity-50"
        )}>
          <Icon
            className={isPlugin ? "w-5 h-5" : "w-7 h-7"}
            style={{ color: isLocked ? 'rgba(255,255,255,0.35)' : color }}
          />
        </div>
        <h3 className={cn(
          "font-bold tracking-[0.08em] text-white/95 uppercase font-display transition-colors duration-200 truncate",
          isPlugin ? "text-base mb-1.5" : "text-xl sm:text-2xl mb-2.5",
        )}>
          {title}
        </h3>
        {!isPlugin && (
          <p className="text-[13px] text-white/55 font-medium leading-relaxed line-clamp-2 mb-5 group-hover:text-white/75 transition-colors duration-200">
            {description}
          </p>
        )}
        {stat && (
          <div className={cn(
            "flex items-center justify-between border-t border-white/[0.08]",
            isPlugin ? "mt-3.5 pt-3.5" : "mt-1 pt-5"
          )}>
            <span className="text-[11px] uppercase tracking-[0.15em] text-white/45 font-semibold truncate">{stat.label}</span>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <div className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_6px_currentColor]", toneClass(stat.tone))} />
              <span className={cn("text-[13px] font-bold tabular-nums font-display", toneTextClass(stat.tone))}>
                {stat.display}
              </span>
            </div>
          </div>
        )}
      </div>
      {/* Background watermark icon */}
      <div className="absolute top-0 right-0 p-6 opacity-[0.04] group-hover:opacity-[0.10] transition-opacity duration-400 pointer-events-none">
        <Icon className={isPlugin ? "w-16 h-16" : "w-28 h-28"} style={{ color: isLocked ? '#333' : color }} />
      </div>
    </motion.button>
  );
});

interface CardsViewProps {
  modules: Array<{ id: string; title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; description: string; route: string; isPlugin: boolean }>;
  moduleAccess: Record<string, boolean>;
  moduleStats: Record<string, { label: string; display: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }>;
  displayNames: Record<string, string> | undefined;
  onModuleNavigate: (moduleId: string, route: string) => void;
}

export function CardsView({ modules, moduleAccess, moduleStats, displayNames, onModuleNavigate }: CardsViewProps) {
  return (
    <motion.div
      key="cards"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 pointer-events-auto overflow-y-auto no-scrollbar pt-4 px-4 sm:px-6 pb-36 flex flex-col"
    >
      <div className="flex-1 flex flex-col justify-center max-w-[1200px] mx-auto w-full mb-16">
        {/* Daily Brief — Wellness at a Glance */}
        <DailyBrief />

        <div className="flex items-center gap-4 mb-8" role="heading" aria-level={2}>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" aria-hidden="true" />
          <h2 className="text-[12px] font-bold uppercase tracking-[0.45em] text-white/55">Soul Core</h2>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/15 to-transparent" aria-hidden="true" />
        </div>
        {/* Grid: 1 col mobile, 2 col tablet, 3–4 col desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
          {modules.filter(m => !m.isPlugin).map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.30, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModuleCard
                {...m}
                title={displayNames?.[m.id] || m.title}
                isLocked={!moduleAccess[m.id]}
                stat={moduleStats[m.id]}
                onClick={() => onModuleNavigate(m.id, m.route)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto">
        <div className="flex items-center gap-4 mb-6" role="heading" aria-level={2}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.40em] text-white/40">Plugins</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 pb-6">
          {modules.filter(m => m.isPlugin).map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 + 0.1, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <ModuleCard
                {...m}
                title={displayNames?.[m.id] || m.title}
                isLocked={!moduleAccess[m.id]}
                stat={moduleStats[m.id]}
                onClick={() => onModuleNavigate(m.id, m.route)}
                isPlugin={true}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
