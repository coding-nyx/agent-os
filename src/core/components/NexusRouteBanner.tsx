import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';
import { useMotionConfig } from '@/lib/hooks/use-motion-config';

const DISMISS_AFTER_MS = 9000;

type RoutePrompt = {
  id: string;
  target: string;
  source?: string;
  reason?: string;
  confidence?: number;
  content?: string;
};

function toPrompt(event: SpineEvent): RoutePrompt | null {
  if (!event.target) return null;
  return {
    id: event.id,
    target: event.target,
    source: event.source,
    reason: typeof event.data?.reason === 'string' ? (event.data.reason as string) : undefined,
    confidence: typeof event.data?.confidence === 'number' ? (event.data.confidence as number) : undefined,
    content: typeof event.data?.content === 'string' ? (event.data.content as string) : undefined
  };
}

export function NexusRouteBanner() {
  const [prompt, setPrompt] = useState<RoutePrompt | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { transition } = useMotionConfig();

  const targetModule = useMemo(() => {
    if (!prompt?.target) return null;
    return MODULE_MANIFEST[prompt.target as keyof typeof MODULE_MANIFEST] || null;
  }, [prompt?.target]);

  useEffect(() => {
    return Spine.on('MODULE_DELEGATED', (event) => {
      const next = toPrompt(event);
      if (!next) return;
      if (!MODULE_MANIFEST[next.target as keyof typeof MODULE_MANIFEST]) return;
      setPrompt(next);
    });
  }, []);

  useEffect(() => {
    if (!prompt) return;
    const timer = window.setTimeout(() => setPrompt(null), DISMISS_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [prompt]);

  if (!prompt || !targetModule) return null;

  if (targetModule.route && location.pathname === targetModule.route) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={transition}
        className="fixed bottom-6 left-1/2 z-[var(--z-toast)] w-[92vw] max-w-xl -translate-x-1/2 rounded-3xl border border-white/[0.12] bg-[#05050a]/95 px-5 py-4 backdrop-blur-xl shadow-[0_0_40px_rgba(139,92,246,0.18)]"
        role="alert"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-violet-300">Nexus Routing</p>
            <p className="text-sm text-white/80 leading-relaxed">
              {prompt.reason ? prompt.reason : 'Nexus detected a better module for this request.'}
            </p>
            <div className="text-[11px] text-white/50 uppercase tracking-[0.2em]">
              {prompt.source ? `Source: ${prompt.source}` : 'Source: neural spine'} · Target: {targetModule.title}
            </div>
          </div>
          <button
            onClick={() => setPrompt(null)}
            className="w-11 h-11 rounded-lg border border-white/[0.12] bg-white/[0.045] hover:bg-white/10 active:bg-white/15 flex items-center justify-center"
            aria-label="Dismiss routing prompt"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              if (targetModule.route) navigate(targetModule.route);
              else navigate('/nexus');
              setPrompt(null);
            }}
            className="flex items-center gap-2 rounded-2xl bg-violet-600/90 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white"
          >
            Open {targetModule.title}
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => setPrompt(null)}
            className="rounded-2xl border border-white/[0.12] bg-white/[0.045] px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white/70"
          >
            Stay Here
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
