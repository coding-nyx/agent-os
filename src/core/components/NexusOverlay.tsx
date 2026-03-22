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
import { type DocumentPipelineStage } from '@/lib/services/document-pipeline';
import { useNexusCrossModuleBlocker } from '@/lib/hooks/use-nexus-cross-module-blocker';
import { useNexusConflictBlocker } from '@/lib/hooks/use-nexus-conflict-blocker';
import { prepareDocumentChatPrompt } from '@/lib/services/document-chat-handoff-service';
import type { DocumentUploadRequest } from '@/lib/services/document-upload-message';

interface SubModuleState {
  moduleId: string;
  content?: string;
}

const COLLAPSED_W = 60;
const EXPANDED_W = 180;

export function NexusOverlay() {
  const { user, profile } = useAuth();
  const { hasVault, isUnlocked } = useVault();
  const location = useLocation();
  const navigate = useNavigate();
  const { sendMessage, analyzeImage } = useAI();
  const { isCrossModuleBusy, pendingTargets } = useNexusCrossModuleBlocker();
  const { isConflictBlocking } = useNexusConflictBlocker();
  const [open, setOpen] = useState(false);
  const [subModule, setSubModule] = useState<SubModuleState | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [docUploadBusy, setDocUploadBusy] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docStage, setDocStage] = useState<DocumentPipelineStage | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);

  // Allow external components to open Nexus via a custom DOM event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-nexus', handler);
    return () => window.removeEventListener('open-nexus', handler);
  }, []);

  const close = useCallback(() => { setOpen(false); setSubModule(null); }, []);

  const handleDelegation = useCallback((path: string) => {
    const moduleId = path.replace(/^\//, '').split('/')[0];
    if (moduleId) setSubModule({ moduleId });
  }, []);

  const ai = useModuleAI({
    moduleId: 'nexus',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: handleDelegation,
  });

  const handleUploadDocuments = useCallback(async (request: DocumentUploadRequest) => {
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
    setDocStage({
      id: 'parsing',
      label: request.files.length > 1 ? 'Uploading documents…' : 'Uploading document…',
    });

    try {
      const result = await prepareDocumentChatPrompt({
        moduleId: 'nexus',
        files: request.files,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        analyzeImage: (imageDataUrl, prompt) => analyzeImage(imageDataUrl, prompt),
        userContext: request.caption,
        onStageChange: (stage) => setDocStage(stage),
      });
      setDocStage((prev) => prev ?? { id: 'done', label: 'Document analyzed.' });
      await ai.handleSendMessage(result.prompt, undefined, { visibleContent: request.visibleContent });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Document analysis failed.';
      setDocUploadError(message);
      setDocStage({ id: 'error', label: 'Analysis failed.' });
    } finally {
      setDocUploadBusy(false);
    }
  }, [ai, analyzeImage, sendMessage]);

  const handleNavigateToModule = useCallback((path: string) => {
    setSubModule(null);
    setOpen(false);
    navigate(path);
  }, [navigate]);

  const isVisible = useMemo(() => {
    if (!user || !profile?.onboardingComplete) return false;
    if (hasVault && !isUnlocked) return false;
    return (
      location.pathname !== '/' &&
      location.pathname !== '/nexus' &&
      location.pathname !== '/vault-gate'
    );
  }, [user, profile?.onboardingComplete, location.pathname, hasVault, isUnlocked]);

  const isNexusBusy = isCrossModuleBusy || docUploadBusy || isConflictBlocking;
  const busyLabel = (() => {
    if (docUploadBusy) return docStage?.label ?? 'Uploading…';
    if (docUploadError) return docStage?.label ?? 'Analysis failed.';
    if (isConflictBlocking) return 'Conflict active';
    if (isCrossModuleBusy) {
      const names = pendingTargets.slice(0, 2).join(', ');
      return names ? `Waiting: ${names}…` : 'Waiting for module…';
    }
    return '';
  })();

  const isChatOverlayOpen = useUIStore((s) => s.isChatOverlayOpen);
  const hideGlobalFAB = useUIStore((s) => s.hideGlobalFAB);

  if (!isVisible) return null;

  // Mobile = bottom sheet (y-axis), Desktop = right panel (x-axis)
  const panelVariants = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '100%', opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: '100%', opacity: 0 } };

  return (
    <>
      {/* 
        Mobile Trigger Restoration:
        Since GlobalFAB might be hidden or obscured on some mobile views, we explicitly 
        render a Nexus trigger here on mobile when the overlay is closed.
        Positioned Bottom-Left to avoid conflict with Chat (Bottom-Right) and QuickAdd (Bottom-Center).
      */}
      {!open && isMobile && !isChatOverlayOpen && !hideGlobalFAB && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setOpen(true)}
          className="fixed left-4 bottom-4 z-[var(--z-fab)] w-12 h-12 rounded-full bg-[#09090b]/80 backdrop-blur-xl border border-white/10 shadow-lg flex items-center justify-center lg:hidden"
          aria-label="Open Nexus"
        >
          <Sparkles className="w-5 h-5 text-indigo-400" />
        </motion.button>
      )}

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={close}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/55 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.aside
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className={[
                'fixed z-[var(--z-modal)] flex flex-col',
                'bg-[#09090e]/96 backdrop-blur-[52px]',
                // Mobile: bottom sheet
                'bottom-0 left-0 right-0 rounded-t-[28px]',
                'h-[88dvh] border-t border-l border-r border-white/[0.06]',
                'shadow-[0_-20px_60px_rgba(0,0,0,0.55)]',
                // Desktop: right panel overrides
                'lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:bottom-0',
                'lg:w-full lg:max-w-[420px]',
                'lg:rounded-none lg:border-t-0 lg:border-r-0 lg:border-l lg:border-white/[0.06]',
                'lg:shadow-[-24px_0_60px_rgba(0,0,0,0.45)]',
              ].join(' ')}
            >
              {/* Mobile drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0 lg:hidden" aria-hidden="true">
                <div className="w-9 h-1 rounded-full bg-white/[0.12]" />
              </div>

              {/* Header */}
              <div className="px-4 pt-3 pb-3 lg:px-5 lg:pt-4 lg:pb-4 flex items-center justify-between border-b border-white/[0.05] shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-violet-500/[0.12] border border-violet-500/[0.18] flex items-center justify-center shrink-0 relative">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-white/90 leading-none">
                        Nexus
                      </h2>
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isNexusBusy ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-pulse'
                        }`}
                      />
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5 tracking-wide truncate">
                      {isNexusBusy ? busyLabel : 'Global access active'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => ai.clearSession()}
                    className="w-9 h-9 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-colors group"
                    aria-label="Clear conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white/25 group-hover:text-red-400 transition-colors" />
                  </button>
                  <button
                    onClick={close}
                    className="w-9 h-9 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center transition-colors group"
                    aria-label="Close Nexus"
                  >
                    <X className="w-3.5 h-3.5 text-white/25 group-hover:text-white/80 transition-colors" />
                  </button>
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-hidden flex flex-col relative min-h-0">
                <NexusChat
                  ai={{ ...ai, isProcessing: ai.isProcessing || isNexusBusy }}
                  agentName="Nexus"
                  moduleId="nexus"
                  themeColor="indigo"
                  placeholder="Ask Nexus anything…"
                  showInternalSignals={false}
                  processingLabel={isNexusBusy ? busyLabel : undefined}
                  onUploadDocuments={handleUploadDocuments}
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
