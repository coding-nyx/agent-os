import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle2, Search, ArrowRight, Trash2, Loader2 } from 'lucide-react';
import { ResearchSession } from '../types';
import { cn } from '@/lib/utils';

interface ScoutSessionListProps {
  sessions: ResearchSession[];
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  activeSessionId?: string;
}

const statusColors: Record<ResearchSession['status'], string> = {
  idle: 'text-white/40',
  decomposing: 'text-sky-400',
  awaiting_review: 'text-amber-400',
  searching: 'text-lime-400',
  synthesizing: 'text-fuchsia-400',
  complete: 'text-emerald-400',
  error: 'text-rose-400',
  cancelled: 'text-white/20',
};

export function ScoutSessionList({ sessions, onSelect, onDelete, activeSessionId }: ScoutSessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
        <Search size={32} className="text-white/10 mb-3" />
        <p className="text-xs text-white/40 text-center">No research sessions yet. Ask Scout to start deep research to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {sessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const isProcessing = ['decomposing', 'searching', 'synthesizing'].includes(session.status);

          return (
            <motion.div
              key={session.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => onSelect(session.id)}
              className={cn(
                "group flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                isActive 
                  ? "bg-lime-500/10 border-lime-500/30" 
                  : "bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10"
              )}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  isActive ? "bg-lime-500/20 text-lime-400" : "bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white/60"
                )}>
                  {isProcessing ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : session.status === 'complete' ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Clock size={18} />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className={cn(
                    "text-sm font-bold truncate",
                    isActive ? "text-lime-300" : "text-white/80"
                  )}>
                    {session.topic}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", statusColors[session.status])}>
                      {session.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-white/20">•</span>
                    <span className="text-[10px] text-white/20">
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors"
                  aria-label="Delete session"
                >
                  <Trash2 size={14} />
                </button>
                <div className="p-2 text-white/20">
                  <ArrowRight size={14} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
