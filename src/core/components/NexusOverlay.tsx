import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { ORCHESTRATOR_PERSONA } from '@/modules/orchestrator/personas';
import { NexusChat } from '@/core/components/NexusChat';
import { NexusSubModulePanel } from '@/core/components/NexusSubModulePanel';

interface SubModuleState {
  moduleId: string;
  content?: string;
}

const NEXUS_COLLAPSED_WIDTH = 36;
const NEXUS_EXPANDED_WIDTH = 148;

export function NexusOverlay() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [subModule, setSubModule] = useState<SubModuleState | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  // Allow external components to open Nexus via a custom DOM event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-nexus', handler);
    return () => window.removeEventListener('open-nexus', handler);
  }, []);

  const handleDelegation = useCallback((path: string) => {
    // Extract moduleId from route path (e.g., "/agnes" → "agnes")
    const moduleId = path.replace(/^\//, '').split('/')[0];
    if (moduleId) {
      setSubModule({ moduleId });
    }
  }, []);

  const ai = useModuleAI({
    moduleId: 'orchestrator',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: handleDelegation
  });

  const handleNavigateToModule = useCallback((path: string) => {
    setSubModule(null);
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const isVisible = useMemo(() => {
    if (!user || !profile?.onboardingComplete) return false;
    return location.pathname !== '/' && location.pathname !== '/orchestrator';
  }, [user, profile?.onboardingComplete, location.pathname]);

  if (!isVisible) return null;

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.94 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onClick={() => setOpen(true)}
        style={{
          width: isHovered ? NEXUS_EXPANDED_WIDTH : NEXUS_COLLAPSED_WIDTH,
          minWidth: NEXUS_COLLAPSED_WIDTH,
        }}
        className="fixed bottom-4 right-4 z-[110] flex items-center justify-center gap-2 rounded-xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] px-2.5 py-2 shadow-lg shadow-black/20 transition-all duration-300 overflow-hidden hover:bg-white/[0.07] hover:border-white/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/40"
        aria-label="Open Nexus overlay"
      >
        <Sparkles className="w-4 h-4 text-white/35 shrink-0" />
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.15 }}
          style={{ maxWidth: isHovered ? 120 : 0 }}
          className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40 whitespace-nowrap overflow-hidden transition-all duration-300"
        >
          Consult Nexus
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setOpen(false); setSubModule(null); }}
              className="fixed inset-0 z-[115] bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 right-0 z-[120] w-full max-w-md border-l border-white/5 bg-black/40 backdrop-blur-[40px] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="p-6 md:p-8 pb-4 flex items-center justify-between border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-violet-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Sparkles className="w-6 h-6 text-violet-400 relative z-10" />
                  </div>
                  <div>
                    <h2 className="text-base font-black uppercase tracking-[0.3em] text-white">Nexus Proxy</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest">Global_Access_Active</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => ai.clearSession()}
                    className="w-10 h-10 rounded-xl border border-white/5 bg-white/5 hover:bg-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-colors group"
                    aria-label="Clear conversation"
                  >
                    <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400 transition-colors" />
                  </button>
                  <button
                    onClick={() => { setOpen(false); setSubModule(null); }}
                    className="w-10 h-10 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors group"
                    aria-label="Close overlay"
                  >
                    <X className="w-4 h-4 text-white/40 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full pb-4">
                <NexusChat
                  ai={ai}
                  agentName="Nexus"
                  themeColor="indigo"
                  placeholder="Consult the master node..."
                  showInternalSignals={false}
                />

                <AnimatePresence>
                  {subModule && (
                    <NexusSubModulePanel
                      moduleId={subModule.moduleId}
                      initialContent={subModule.content}
                      onBack={() => setSubModule(null)}
                      onNavigate={handleNavigateToModule}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
