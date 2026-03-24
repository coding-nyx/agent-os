import React from 'react';
import { motion } from 'framer-motion';
import { Settings, User, Bot, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgnesPersonalitySidebar } from './AgnesPersonalitySidebar';
import { AgnesTherapistCard } from './AgnesTherapistCard';
import { BeliefGraph } from './BeliefGraph';
import { NeuralButton } from '@/core/components/NeuralButton';

interface AgnesSanctuarySidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  agentAlias: string;
  profile: any;
}

export const AgnesSanctuarySidebar: React.FC<AgnesSanctuarySidebarProps> = ({
  collapsed,
  agentAlias,
  profile
}) => {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 300 }}
      className={cn(
        "relative h-full flex flex-col bg-[#050508]/60 backdrop-blur-3xl border-r border-white/5 transition-all duration-500 ease-in-out z-[var(--z-content)] overflow-hidden",
      )}
    >
      {!collapsed ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar p-6 space-y-8">
          <div className="space-y-6 pt-4">
            <AgnesPersonalitySidebar
              baseContext={profile?.baseContext}
              naked
            />
            <div className="h-px w-full bg-white/[0.05]" />
            <AgnesTherapistCard
              baseContext={profile?.baseContext}
              agentAlias={agentAlias}
              naked
            />
            <div className="h-px w-full bg-white/[0.05]" />
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Inner World</span>
              </div>
              <div className="bg-black/20 rounded-[2rem] border border-white/5 overflow-hidden">
                <BeliefGraph profile={profile} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center py-8 gap-8">
           <User className="text-white/20" size={20} />
           <div className="w-px h-12 bg-white/5" />
           <Bot className="text-rose-400/20" size={20} />
        </div>
      )}

      {/* Settings Button - Moved UP to avoid global button overlap */}
      <div className="p-6 mb-20 border-t border-white/5 bg-black/20">
        <NeuralButton
          variant="ghost"
          themeColor="indigo"
          onClick={() => window.dispatchEvent(new CustomEvent('agnes:open-settings'))}
          className={cn(
            "w-full h-11 flex items-center gap-4 px-4 rounded-xl bg-white/[0.03] border border-white/5 text-white/40 hover:text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/20 transition-all group",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings size={16} className="group-hover:rotate-45 transition-transform duration-700" />
          {!collapsed && <span className="text-[10px] font-black uppercase tracking-widest">Module Settings</span>}
        </NeuralButton>
      </div>
    </motion.aside>
  );
};
