import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAI } from '@/llm-engine/ai-context';
import { ORCHESTRATOR_PERSONA } from '@/modules/nexus/personas';
import { NexusChat } from '@/core/components/NexusChat';
import { NexusSubModulePanel } from '@/core/components/NexusSubModulePanel';
import { useUIStore } from '@/lib/stores/ui-store';
import { NeuralModal } from '@/core/components/NeuralModal';
import { runDocumentPipeline, type DocumentPipelinePolicy, type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { useNexusCrossModuleBlocker } from '@/lib/hooks/use-nexus-cross-module-blocker';
import { useNexusConflictBlocker } from '@/lib/hooks/use-nexus-conflict-blocker';

interface SubModuleState {
  moduleId: string;
  content?: string;
}

const NEXUS_COLLAPSED_WIDTH = 60;
const NEXUS_EXPANDED_WIDTH = 180;

export function NexusOverlay() {
  const { user, profile } = useAuth();
  const { hasVault, isUnlocked } = useVault();
  const location = useLocation();
  const navigate = useNavigate();
  const { sendMessage } = useAI();
  const { isCrossModuleBusy, pendingTargets } = useNexusCrossModuleBlocker();
  const { isConflictBlocking } = useNexusConflictBlocker();
  const [open, setOpen] = useState(false);
  const [subModule, setSubModule] = useState<SubModuleState | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [docReviewOpen, setDocReviewOpen] = useState(false);
  const [docProposal, setDocProposal] = useState<{ summary: string; preview: string } | null>(null);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);
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
    moduleId: 'nexus',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: handleDelegation
  });

  const nexusPolicy: DocumentPipelinePolicy<{ summary: string }, { summary: string; preview: string }> = {
    id: 'nexus-generic-document',
    context: { moduleId: 'nexus', domain: 'general' },
    analyze: async ({ parsed }, llmSend) => {
      const prompt = [
        `Document received: "${parsed.fileName}"`,
        `Type: ${parsed.fileType.toUpperCase()} | Words: ${parsed.wordCount.toLocaleString()}`,
        'Provide a concise summary (4-6 sentences) and list 3-5 key points as bullets.',
        'Do NOT emit action tags.',
        '',
        '---BEGIN DOCUMENT---',
        parsed.rawText,
        '---END DOCUMENT---',
      ].join('\\n');
      const response = await llmSend(prompt);
      return { summary: response.trim() || 'No summary returned.' };
    },
    buildProposal: (analysis, parsed) => ({
      summary: analysis.summary,
      preview: parsed.rawText.slice(0, 2000),
    }),
    summarizeProposal: (proposal) => proposal.summary,
  };

  const handleUploadDocument = useCallback(async (file: File) => {
    const llmPrimary = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'You are a neutral document analyst. Follow the instructions exactly.',
        memoryContext: [],
        summary: 'Nexus document analysis.',
        history: [],
      });
      return response.publicText;
    };
    const llmFallback = async (prompt: string) => {
      const { response } = await sendMessage(prompt, {
        systemPrompt: 'Return a concise summary and key points. No action tags.',
        memoryContext: [],
        summary: 'Nexus document fallback.',
        history: [],
      });
      return response.publicText;
    };

    setDocUploadError(null);
    setDocUploadBusy(true);
    setDocStage({ id: 'parsing', label: 'Uploading document…' });

    try {
      const result = await runDocumentPipeline({
        file,
        policy: nexusPolicy,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        onStageChange: (stage) => setDocStage(stage),
      });

      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      setDocProposal({ summary: result.summary, preview: result.proposal.preview });
      setDocReviewOpen(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [sendMessage]);

  const handleNavigateToModule = useCallback((path: string) => {
    setSubModule(null);
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const isVisible = useMemo(() => {
    if (!user || !profile?.onboardingComplete) return false;
    if (hasVault && !isUnlocked) return false;
    return location.pathname !== '/' && location.pathname !== '/nexus' && location.pathname !== '/vault-gate';
  }, [user, profile?.onboardingComplete, location.pathname, hasVault, isUnlocked]);

  const isNexusBusy = isCrossModuleBusy || docUploadBusy || isConflictBlocking;
  const busyLabel = (() => {
    if (docUploadBusy) return docStage?.label ?? 'Uploading and analyzing…';
    if (docUploadError) return docStage?.label ?? 'Analysis failed.';
    if (isConflictBlocking) return 'Conflict active: resolve it in the overlay to continue…';
    if (isCrossModuleBusy) {
      const names = pendingTargets
        .slice(0, 3)
        .join(', ');
      return pendingTargets.length > 0 ? `Waiting for module response: ${names}…` : 'Waiting for module response…';
    }
    return '';
  })();

  const isChatOverlayOpen = useUIStore((s) => s.isChatOverlayOpen);

  if (!isVisible) return null;

  return (
    <>
      {!isChatOverlayOpen && (
        <motion.button
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.94 }}
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          onClick={() => setOpen(true)}
          style={{
            width: isHovered ? NEXUS_EXPANDED_WIDTH : NEXUS_COLLAPSED_WIDTH,
            height: NEXUS_COLLAPSED_WIDTH,
            minWidth: NEXUS_COLLAPSED_WIDTH,
          }}
          className="fixed bottom-6 left-6 z-[var(--z-fab)] hidden lg:flex items-center justify-center rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-lg shadow-black/20 transition-all duration-300 overflow-hidden hover:bg-white/[0.07] hover:border-white/[0.12] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/40"
          aria-label="Open Nexus overlay"
        >
          <Sparkles className="w-5 h-5 text-white/35 shrink-0" />
          {isHovered && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 whitespace-nowrap overflow-hidden"
            >
              Consult Nexus
            </motion.span>
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setOpen(false); setSubModule(null); }}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 right-0 z-[var(--z-modal)] w-full max-w-md border-l border-white/5 bg-black/40 backdrop-blur-[40px] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="p-6 md:p-8 pb-4 flex items-center justify-between border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-violet-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Sparkles className="w-6 h-6 text-violet-400 relative z-10" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold uppercase tracking-[0.2em] text-white font-display">Nexus Proxy</h2>
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
                {isNexusBusy && (
                  <div className="shrink-0 px-4 pt-3 pb-2">
                    <section className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                        Nexus Busy
                      </p>
                      <p className="text-sm text-white/70 mt-1 break-words">{busyLabel}</p>
                    </section>
                  </div>
                )}
                <NexusChat
                  ai={{
                    ...ai,
                    isProcessing: ai.isProcessing || isNexusBusy,
                  }}
                  agentName="Nexus"
                  themeColor="indigo"
                  placeholder="Consult the master node..."
                  showInternalSignals={false}
                  onUploadDocument={handleUploadDocument}
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

              <NeuralModal
                isOpen={docReviewOpen}
                onClose={() => {
                  setDocReviewOpen(false);
                  setDocProposal(null);
                }}
                title="Review Document Analysis"
                themeColor="indigo"
                maxWidth="2xl"
              >
                <div className="space-y-6">
                  {docProposal && (
                    <div className="space-y-4">
                      <div className="bg-black/30 border border-white/10 rounded-xl p-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Summary</h4>
                        <pre className="text-[12px] text-white/70 whitespace-pre-wrap max-h-60 overflow-y-auto">
                          {docProposal.summary}
                        </pre>
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Text Preview</h4>
                        <pre className="text-[11px] text-white/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {docProposal.preview}
                          {docProposal.preview.length >= 2000 ? '\\n[truncated]' : ''}
                        </pre>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 pt-4 border-t border-white/10">
                    <button
                      onClick={() => {
                        if (!docProposal) return;
                        ai.handleSendMessage(
                          `User approved the document analysis. Provide a brief response only, no action tags.\\n\\n${docProposal.summary}`
                        );
                        setDocReviewOpen(false);
                        setDocProposal(null);
                      }}
                      className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg"
                    >
                      Send Summary
                    </button>
                    <button
                      onClick={() => {
                        setDocReviewOpen(false);
                        setDocProposal(null);
                      }}
                      className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </NeuralModal>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
