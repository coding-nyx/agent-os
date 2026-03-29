import React from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Sparkles, 
  Zap,
  Lock,
  Circle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgnesEngagementModeControl } from './AgnesEngagementModeControl';
import { AgnesBeliefWorkflowPanel } from './AgnesBeliefWorkflowPanel';
import {
  AGNES_ENGAGEMENT_MODE_DEFINITIONS,
  AgnesPersistentEngagementMode,
} from '../engagement-modes';
import type { MasterThreadShellSnapshot } from '@/lib/services/master-thread-service';
import type { BeliefGraph } from '../services/belief-graph-service';
import type { BeliefGraphWorkflow } from '../services/belief-graph-workflow-service';

interface AgnesSanctuaryContentProps {
  onStartSession: (type: 'new' | 'impromptu' | 'continue') => void;
  onConfirmBeliefProposal: (proposalId: string, editedGraph: BeliefGraph) => Promise<void>;
  onDismissBeliefProposal: (proposalId: string) => Promise<void>;
  onAcceptInvitation: () => Promise<void>;
  onDismissInvitation: () => Promise<void>;
  onCompactBeliefGraph?: () => Promise<void>;
  selectedPersistentMode: AgnesPersistentEngagementMode;
  onPersistentModeChange: (mode: AgnesPersistentEngagementMode) => void;
  agentAlias: string;
  userName: string;
  somaticEnabled: boolean;
  isAccessible: boolean;
  hasActiveSession: boolean;
  beliefGraph: BeliefGraph | null;
  beliefWorkflow: BeliefGraphWorkflow | null;
  beliefInvitationSnapshot?: MasterThreadShellSnapshot | null;
  beliefWorkflowBusy?: boolean;
  compactBeliefGraphBusy?: boolean;
  compactBeliefGraphStatus?: string | null;
}

export const AgnesSanctuaryContent: React.FC<AgnesSanctuaryContentProps> = ({
  onStartSession,
  onConfirmBeliefProposal,
  onDismissBeliefProposal,
  onAcceptInvitation,
  onDismissInvitation,
  onCompactBeliefGraph,
  selectedPersistentMode,
  onPersistentModeChange,
  agentAlias,
  somaticEnabled,
  isAccessible,
  hasActiveSession,
  beliefGraph,
  beliefWorkflow,
  beliefInvitationSnapshot,
  beliefWorkflowBusy = false,
  compactBeliefGraphBusy = false,
  compactBeliefGraphStatus = null,
}) => {
  const selectedModeDefinition = AGNES_ENGAGEMENT_MODE_DEFINITIONS[selectedPersistentMode];

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full relative z-[var(--z-content)] px-4 sm:px-6 py-8 sm:py-12 overflow-y-auto no-scrollbar items-center">
      
      {/* 1. Hero Section - Positioned to complement but not overlap the 3D model */}
      <main className="flex-1 flex flex-col min-h-0 shrink-0 items-center justify-start max-w-5xl w-full space-y-12 sm:space-y-20 mt-4 sm:mt-8">
        
        <div className="text-center space-y-8 relative z-[var(--z-content)]">
          <div className="space-y-6">
            <div className="space-y-4">
              <h1 className="text-5xl sm:text-8xl font-black italic tracking-tighter text-white uppercase leading-none drop-shadow-2xl">
                Mind <span className="text-indigo-400">Restore</span>
              </h1>
              <div className="max-w-3xl mx-auto pt-2 space-y-4">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">
                  Choose Your Persistent Mode
                </div>
                <AgnesEngagementModeControl
                  compact
                  value={selectedPersistentMode}
                  onChange={(mode) => onPersistentModeChange(mode as AgnesPersistentEngagementMode)}
                  modes={['casual', 'deep', 'somatic']}
                  label="Choose Agnes persistent mode"
                />
                <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] uppercase tracking-[0.2em] text-white/35">
                  <span>Default: {selectedModeDefinition.label}</span>
                  <span className={cn(
                    'px-3 py-1 rounded-full border',
                    somaticEnabled
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200/60'
                      : 'border-amber-400/20 bg-amber-500/10 text-amber-100/60',
                  )}>
                    Somatic Inquiry {somaticEnabled ? 'On' : 'Adapted'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Grid - Adjusted for better visibility and vertical rhythm */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-10 w-full max-w-4xl px-0 sm:px-4 pb-12">
          {/* Quick Support */}
          <motion.button
            whileHover={{ y: -6, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onStartSession('impromptu')}
            className="group relative flex flex-col items-start text-left space-y-6 sm:space-y-8 p-7 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] bg-slate-900/70 backdrop-blur-2xl border border-white/[0.09] hover:border-orange-500/30 transition-all duration-500 shadow-2xl shadow-black/40 min-h-[10rem]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 group-hover:scale-110 transition-transform duration-500">
              <Zap size={24} />
            </div>
            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase italic text-white group-hover:text-orange-400 transition-colors">Quick Support</h3>
              <p className="text-[11px] text-white/40 font-medium leading-relaxed max-w-[240px]">Private, off-the-record handshake. No trace remains in your vault.</p>
            </div>
            <div className="text-[11px] font-black uppercase tracking-widest text-orange-500/50 group-hover:text-orange-400 transition-colors">Initialize Ephemeral Link</div>
          </motion.button>

          {/* Regular Session */}
          <motion.button
            whileHover={{ y: -6, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onStartSession(hasActiveSession ? 'continue' : 'new')}
            disabled={!isAccessible}
            className={cn(
              "group relative flex flex-col items-start text-left space-y-6 sm:space-y-8 p-7 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] bg-slate-900/70 backdrop-blur-2xl border border-white/[0.09] hover:border-indigo-500/30 transition-all duration-500 shadow-2xl shadow-black/40 min-h-[10rem]",
              !isAccessible && "opacity-30 cursor-not-allowed"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[2.5rem]" />
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform duration-500">
              {isAccessible ? <Sparkles size={24} /> : <Lock size={24} />}
            </div>
            <div className="space-y-3">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight uppercase italic text-white group-hover:text-indigo-400 transition-colors">
                 {hasActiveSession ? `Resume ${selectedModeDefinition.shortLabel}` : `Start ${selectedModeDefinition.shortLabel}`}
               </h3>
               <p className="text-[11px] text-white/40 font-medium leading-relaxed max-w-[240px]">
                 {selectedModeDefinition.tagline}
               </p>
             </div>
             <div className="text-[11px] font-black uppercase tracking-widest text-indigo-500/50 group-hover:text-indigo-400 transition-colors">
               {hasActiveSession ? `Rejoin ${selectedModeDefinition.label}` : `Open ${selectedModeDefinition.label}`}
             </div>
           </motion.button>
          </div>

          <AgnesBeliefWorkflowPanel
            graph={beliefGraph}
            workflow={beliefWorkflow}
            invitationSnapshot={beliefInvitationSnapshot}
            busy={beliefWorkflowBusy}
            onConfirmProposal={onConfirmBeliefProposal}
            onDismissProposal={onDismissBeliefProposal}
            onAcceptInvitation={onAcceptInvitation}
            onDismissInvitation={onDismissInvitation}
            onCompactGraph={onCompactBeliefGraph}
            compactGraphBusy={compactBeliefGraphBusy}
            compactGraphStatus={compactBeliefGraphStatus}
          />
       </main>
    </div>
  );
};
