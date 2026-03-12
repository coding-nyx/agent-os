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
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      aria-label={`Open ${title} module`}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        "group relative rounded-[32px] border transition-all text-left overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/50",
        isPlugin ? "p-6 w-full sm:w-[280px] shrink-0" : "p-6 sm:p-8",
        isLocked
          ? "bg-white/[0.03] border-white/[0.07] opacity-60 hover:opacity-75"
          : "bg-black/60 backdrop-blur-3xl border-white/20 hover:border-white/30 hover:bg-white/[0.05] shadow-2xl"
      )}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none">
        <div className="absolute inset-0 hub-card-sheen" />
      </div>
      <div className="relative z-10">
        <div className={cn(
          "rounded-2xl border flex items-center justify-center transition-all shadow-inner",
          isPlugin ? "w-10 h-10 mb-4 bg-white/5 border-white/10" : "w-16 h-16 mb-6 bg-white/10 border-white/20 group-hover:scale-110 group-hover:rotate-3",
          isLocked ? "bg-white/[0.06] border-white/[0.08]" : ""
        )}>
          <Icon className={isPlugin ? "w-5 h-5" : "w-8 h-8"} style={{ color: isLocked ? '#666' : color }} />
        </div>
        <h3 className={cn(
          "font-bold tracking-[0.1em] text-white mb-3 uppercase font-display transition-colors",
          isPlugin ? "text-lg" : "text-2xl",
          !isLocked && "group-hover:text-white"
        )}>
          {title}
        </h3>
        {!isPlugin && (
          <p className="text-[13px] text-white/60 font-medium leading-relaxed line-clamp-2 mb-6 group-hover:text-white/80 transition-colors">
            {description}
          </p>
        )}
        {stat && (
          <div className={cn(
            "flex items-center justify-between border-t border-white/10",
            isPlugin ? "mt-4 pt-4" : "mt-2 pt-6"
          )}>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-black">{stat.label}</span>
            <div className="flex items-center gap-3">
              <div className={cn("w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]", toneClass(stat.tone))} />
              <span className={cn("text-sm font-bold tracking-widest font-display", toneTextClass(stat.tone))}>
                {stat.display}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="absolute top-0 right-0 p-8 opacity-[0.05] group-hover:opacity-[0.12] transition-opacity">
        <Icon className={isPlugin ? "w-20 h-20" : "w-32 h-32"} style={{ color: isLocked ? '#444' : color }} />
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
      initial={{ opacity: 0, filter: 'blur(8px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, filter: 'blur(8px)' }}
      transition={{ duration: 0.5 }}
      className="flex-1 pointer-events-auto overflow-y-auto no-scrollbar pt-4 px-6 pb-40 flex flex-col"
    >
      <div className="flex-1 flex flex-col justify-center max-w-[1200px] mx-auto w-full mb-20">
        {/* Daily Brief — Wellness at a Glance */}
        <DailyBrief />

        <div className="flex items-center gap-6 mb-10" role="heading" aria-level={2}>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" aria-hidden="true" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.6em] text-white/60 italic drop-shadow-sm">Soul Core Interface</h2>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/20 to-transparent" aria-hidden="true" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-10">
          {modules.filter(m => !m.isPlugin).map((m) => (
            <ModuleCard
              key={m.id}
              {...m}
              title={displayNames?.[m.id] || m.title}
              isLocked={!moduleAccess[m.id]}
              stat={moduleStats[m.id]}
              onClick={() => onModuleNavigate(m.id, m.route)}
            />
          ))}
        </div>
      </div>

      <div className="w-full max-w-[1400px] mx-auto">
        <div className="flex items-center gap-6 mb-8" role="heading" aria-level={2}>
          <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 italic drop-shadow-sm">Synaptic Plugins</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap justify-center gap-6 pb-8">
          {modules.filter(m => m.isPlugin).map((m) => (
            <div key={m.id}>
              <ModuleCard
                {...m}
                title={displayNames?.[m.id] || m.title}
                isLocked={!moduleAccess[m.id]}
                stat={moduleStats[m.id]}
                onClick={() => onModuleNavigate(m.id, m.route)}
                isPlugin={true}
              />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
