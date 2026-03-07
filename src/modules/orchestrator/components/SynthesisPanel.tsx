import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, MessageSquare, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNexusSynthesis, type SynthesisAlert, type SynthesisAction } from '../hooks/useNexusSynthesis';

interface SynthesisPanelProps {
  onInjectChat?: (text: string) => void;
  onConsultModule?: (moduleId: string) => void;
  onNavigate?: (path: string) => void;
}

const SEVERITY_STYLES = {
  critical: {
    dot: 'bg-rose-400',
    border: 'border-rose-500/20',
    bg: 'bg-rose-500/5',
    text: 'text-rose-300',
  },
  warning: {
    dot: 'bg-amber-400',
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
    text: 'text-amber-300',
  },
  positive: {
    dot: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-300',
  },
};

function AlertAction({ action, onInjectChat, onConsultModule, onNavigate }: {
  action: SynthesisAction;
  onInjectChat?: (text: string) => void;
  onConsultModule?: (moduleId: string) => void;
  onNavigate?: (path: string) => void;
}) {
  const handleClick = () => {
    switch (action.type) {
      case 'ask_nexus':
        onInjectChat?.(action.payload);
        break;
      case 'consult_module':
        onConsultModule?.(action.payload);
        break;
      case 'navigate':
        onNavigate?.(action.payload);
        break;
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors"
    >
      {action.type === 'ask_nexus' ? <MessageSquare className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
      {action.label}
    </button>
  );
}

function AlertCard({ alert, ...handlers }: { alert: SynthesisAlert } & Omit<SynthesisPanelProps, never>) {
  const style = SEVERITY_STYLES[alert.severity];

  return (
    <div className={cn('rounded-xl border p-3 space-y-2', style.border, style.bg)}>
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full shrink-0', style.dot)} />
        <span className={cn('text-sm font-bold', style.text)}>{alert.title}</span>
      </div>
      <p className="text-xs text-white/60 leading-relaxed pl-4">{alert.description}</p>
      {alert.suggestedActions.length > 0 && (
        <div className="flex items-center gap-3 pl-4 pt-1">
          {alert.suggestedActions.map((action, i) => (
            <AlertAction key={i} action={action} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SynthesisPanel({ onInjectChat, onConsultModule, onNavigate }: SynthesisPanelProps) {
  const { alerts, isAnalyzing } = useNexusSynthesis();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  if (alerts.length === 0 && !isAnalyzing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="w-full"
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 w-full px-1 py-2 text-left"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-400">
          ⚡ Nexus Synthesis
        </span>
        <span className="text-[10px] text-white/30">
          {alerts.length} pattern{alerts.length !== 1 ? 's' : ''}
        </span>
        <span className="flex-1" />
        {isCollapsed ? <ChevronDown className="w-3 h-3 text-white/30" /> : <ChevronUp className="w-3 h-3 text-white/30" />}
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onInjectChat={onInjectChat}
                onConsultModule={onConsultModule}
                onNavigate={onNavigate}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
