import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Pencil, X } from 'lucide-react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ProposalCoordinatorService } from '@/lib/services/proposal-coordinator-service';

type DraftProposal = {
  id: string;
  source: string;
  target?: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
};

function normalizeDraftPayload(raw: Record<string, unknown>, source: string, target?: string): DraftProposal {
  const title = typeof raw.title === 'string' ? raw.title : 'Neural Draft Proposal';
  const summary = typeof raw.summary === 'string' ? raw.summary : JSON.stringify(raw, null, 2);

  return {
    id: crypto.randomUUID(),
    source,
    target,
    title,
    summary,
    payload: raw
  };
}

export function NeuralDraftPanel() {
  const [drafts, setDrafts] = useState<DraftProposal[]>([]);
  const [isBlocked, setIsBlocked] = useState(() => ProposalCoordinatorService.isBlocked());

  useEffect(() => {
    return ProposalCoordinatorService.subscribe(() => {
      setIsBlocked(ProposalCoordinatorService.isBlocked());
    });
  }, []);

  useEffect(() => {
    return Spine.on('DRAFT_PROPOSED', (event) => {
      const draft = normalizeDraftPayload(event.data as Record<string, unknown>, event.source, event.target);
      setDrafts((prev) => [draft, ...prev].slice(0, 5));
    });
  }, []);

  const dismiss = (id: string) => {
    const draft = drafts.find((item) => item.id === id);
    if (draft) {
      Spine.emit({
        type: 'DRAFT_DISMISSED',
        source: draft.source,
        target: draft.target,
        domain: 'system',
        data: draft.payload,
        cascadeDepth: 0,
        priority: 'info'
      });
    }
    setDrafts((prev) => prev.filter((item) => item.id !== id));
  };

  const approve = (id: string) => {
    const draft = drafts.find((item) => item.id === id);
    if (draft) {
      Spine.emit({
        type: 'DRAFT_APPROVED',
        source: draft.source,
        target: draft.target,
        domain: 'system',
        data: draft.payload,
        cascadeDepth: 0,
        priority: 'alert'
      });
    }
    setDrafts((prev) => prev.filter((item) => item.id !== id));
  };

  if (drafts.length === 0 || isBlocked) return null;

  const draft = drafts[0];

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        className="fixed top-24 left-4 lg:left-auto lg:right-6 z-[var(--z-toast)] w-[min(360px,calc(100vw-2rem))] rounded-3xl border border-cyan-500/30 bg-[#05050a]/95 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(6,182,212,0.2)]"
        role="alert"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-300 font-display">Neural Draft</h3>
            <p className="text-[10px] text-white/50 uppercase">{draft.source} {draft.target ? `-> ${draft.target}` : ''}</p>
          </div>
          <button
            onClick={() => dismiss(draft.id)}
            className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center"
            aria-label="Dismiss draft"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
          <h4 className="text-sm font-bold text-white">{draft.title}</h4>
          <p className="text-xs text-white/60 whitespace-pre-wrap">{draft.summary}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={() => approve(draft.id)}
            className="col-span-2 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
          <button
            onClick={() => dismiss(draft.id)}
            className="py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
