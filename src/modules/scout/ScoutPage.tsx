import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SCOUT_PERSONA } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
import { ScoutUploadZone } from './components/ScoutUploadZone';
import { buildDocumentAnalysisPrompt } from './services/scout-document-service';
import type { DocumentParseResult } from './services/scout-document-service';
import {
  ScoutProfile,
  loadScoutProfile,
  saveScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser
} from './services/scout-knowledge-service';
import { generateNewsBriefs } from './services/scout-news-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { FileUp, Plus, X, Search, LayoutDashboard, AlertTriangle, BookMarked, FileText } from 'lucide-react';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { scoutDiagnosisSpec } from './diagnosis/scout-diagnosis-spec';
import { Spine } from '@/lib/spine/spine-event-bus';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { SingleAgentLayout } from '@/core/layout/SingleAgentLayout';
import { ScoutOnboarding } from './onboarding/ScoutOnboarding';
// Scout v2 imports
import { useSources } from './hooks/useSources';
import { useDigests } from './hooks/useDigests';
import { useDeepResearch } from './hooks/useDeepResearch';
import { SourceLibraryPane } from './components/sources/SourceLibraryPane';
import { DigestViewer } from './components/digest/DigestViewer';
import { DeepResearchPanel } from './components/deep-research/DeepResearchPanel';
import { ExportDialog } from './components/ExportDialog';
import type { ExportTarget } from './services/scout-export-service';
import type { DeepResearchResult } from './hooks/useDeepResearch';

registerDiagnosisSpec(scoutDiagnosisSpec);

interface ResearchWindow {
  id: string;
  title: string;
}

interface ScoutViewProps {
  profile: ScoutProfile | null;
  encryptionKey: CryptoKey | null;
  isRefreshingNews?: boolean;
  onRefreshNews?: () => void;
  onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
}

function ScoutContent({ profile, encryptionKey, isRefreshingNews, onRefreshNews, onActionParsed }: ScoutViewProps) {
  const { user } = useAuth();
  const { globalSoul } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.scout || 'Scout';
  
  const [activeView, setActiveView] = useState<'research' | 'dashboard' | 'sources' | 'digest'>('research');
  const [windows, setWindows] = useState<ResearchWindow[]>([
    { id: crypto.randomUUID(), title: 'Primary Research' }
  ]);
  const [activeWindowId, setActiveWindowId] = useState<string>(windows[0].id);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // v2 state
  const [deepResearchOpen, setDeepResearchOpen] = useState(false);
  const [deepResearchInitialQuery, setDeepResearchInitialQuery] = useState('');
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  const sourceCtx = useMemo(
    () => ({ userId: user?.uid, encryptionKey }),
    [user?.uid, encryptionKey],
  );

  const {
    sources,
    isLoading: sourcesLoading,
    addSource: addSourceFn,
    updateSource: updateSourceFn,
    archiveSource: archiveSourceFn,
  } = useSources(sourceCtx);

  const {
    digests,
    isLoading: digestsLoading,
    isGenerating: isGeneratingDigest,
    error: digestError,
    generateDigest: generateDigestFn,
    deleteDigest: deleteDigestFn,
  } = useDigests(sourceCtx, sources);

  const handleDeepResearchComplete = useCallback((result: DeepResearchResult) => {
    // Sources are captured automatically when the result is accepted
  }, []);

  const deepResearch = useDeepResearch({
    userId: user?.uid,
    encryptionKey,
    onComplete: handleDeepResearchComplete,
  });

  const openExportDialog = useCallback((target: ExportTarget) => {
    setExportTarget(target);
    setExportDialogOpen(true);
  }, []);

  const handleDeepResearchAccepted = useCallback(async (result: DeepResearchResult) => {
    if (!profile || !encryptionKey) return;
    // Auto-capture all sources from the research result
    for (const src of result.capturedSources) {
      await addSourceFn(src).catch(() => null);
    }
    // The ScoutPage parent will update the profile via Spine/subscriptions
    // after the accept handler in the parent merges the synthesis node
    deepResearch.reset();
    setDeepResearchOpen(false);
    setActiveView('research');
  }, [profile, encryptionKey, addSourceFn, deepResearch]);

  // Spine listeners for AI-triggered UI events
  useEffect(() => {
    const unsubDeepResearch = Spine.subscribe('DEEP_RESEARCH_REQUESTED', (event) => {
      const query = (event.data?.query as string) ?? '';
      setDeepResearchInitialQuery(query);
      setDeepResearchOpen(true);
    });

    const unsubExport = Spine.subscribe('EXPORT_REQUESTED', (event) => {
      const exportType = event.data?.exportType as string;
      if (exportType === 'full-library') {
        openExportDialog({ type: 'full-library', nodes: profile?.knowledgeNodes ?? [], digests, sources });
      } else if (exportType === 'sources') {
        openExportDialog({ type: 'sources', sources });
      } else if (exportType === 'nodes') {
        openExportDialog({ type: 'nodes', nodes: profile?.knowledgeNodes ?? [] });
      } else if (exportType === 'digest' && digests[0]) {
        openExportDialog({ type: 'digest', digest: digests[0] });
      }
    });

    const unsubDigest = Spine.subscribe('DIGEST_GENERATION_STARTED', () => {
      setActiveView('digest');
    });

    return () => {
      unsubDeepResearch();
      unsubExport();
      unsubDigest();
    };
  }, [profile, sources, digests, openExportDialog]);

  const ai = useModuleAI({
    moduleId: 'scout',
    systemPrompt: SCOUT_PERSONA,
    encryptionKey,
    sessionId: activeWindowId,
    persistencePolicy: 'scout-research'
  });

  const handleUploadSubmit = useCallback((result: DocumentParseResult) => {
    setShowUploadZone(false);
    setErrorMessage(null);
    const prompt = buildDocumentAnalysisPrompt(result);
    try {
      ai.handleSendMessage(prompt, onActionParsed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process document. Please try again.');
    }
  }, [ai, onActionParsed]);

  const addWindow = useCallback(() => {
    const newWindow = { id: crypto.randomUUID(), title: 'New Thread' };
    setWindows(prev => [...prev, newWindow]);
    setActiveWindowId(newWindow.id);
  }, []);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(w => w.id !== id);
      if (activeWindowId === id) setActiveWindowId(next[0].id);
      return next;
    });
  }, [activeWindowId]);

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      ai.setMessages([
        {
          role: 'assistant',
          content: `Research cycle [${activeWindowId.slice(0, 4)}] active. I am ${agentAlias}. How can I assist your inquiry?`
        }
      ]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, agentAlias, activeWindowId]);

  const tabs: NeuralTabItem<'research' | 'dashboard' | 'sources' | 'digest'>[] = [
    { id: 'research', label: 'Research Nodes', icon: Search },
    { id: 'dashboard', label: 'Telemetry', icon: LayoutDashboard },
    { id: 'sources', label: 'Sources', icon: BookMarked },
    { id: 'digest', label: 'Digest', icon: FileText },
  ];

  return (
    <SingleAgentLayout
      moduleId="scout"
      agentName={agentAlias}
      themeColor="lime"
      ai={{
        ...ai,
        handleSendMessage: async (content, onAction) => {
          setErrorMessage(null);
          try {
            await ai.handleSendMessage(content, onAction ?? onActionParsed);
          } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
          }
        }
      }}
      authMode="scout"
      placeholder="Query research node..."
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
          <SectionHeader
            label="Research Domain"
            title="Knowledge Node"
            subtitle="Research assistant and fact-checking engine with verified knowledge graphs."
            accentClassName="text-lime-400"
          />
        </div>

        {errorMessage && (
          <div className="mx-4 md:mx-8 mb-3 flex items-start gap-3 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="ml-auto shrink-0 text-red-400/60 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="px-4 md:px-8 pb-3 md:pb-6 border-b border-white/5">
          <NeuralTabGroup
            tabs={tabs}
            activeTab={activeView}
            onTabChange={setActiveView}
            themeColor="lime"
          />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pt-4 md:pt-6">
          {activeView === 'research' ? (
            <div className="flex-1 flex flex-col min-h-0 p-6 pt-0 gap-6 overflow-hidden">
              <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {windows.map((window) => {
                    const isActive = activeWindowId === window.id;
                    return (
                      <motion.div
                        key={window.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={() => setActiveWindowId(window.id)}
                        className={cn(
                          "flex flex-col p-6 rounded-3xl border transition-all cursor-pointer",
                          isActive 
                            ? "bg-lime-500/10 border-lime-500/30 shadow-[0_0_30px_-10px_rgba(163,230,53,0.3)]" 
                            : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-2 h-2 rounded-full", isActive ? "bg-lime-400 animate-pulse" : "bg-white/20")} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Cycle {window.id.slice(0, 4)}</span>
                          </div>
                          {windows.length > 1 && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); closeWindow(window.id); }}
                              className="p-1 rounded-md hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <h3 className={cn("text-lg font-bold font-display", isActive ? "text-lime-300" : "text-white/60")}>
                          {window.title}
                        </h3>
                        <p className="text-xs text-white/40 mt-2">
                          {isActive ? "Active research thread. Chat is linked." : "Click to switch to this thread."}
                        </p>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-center gap-4 py-2 mt-4">
                <button
                  onClick={addWindow}
                  disabled={windows.length >= 5}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-lime-500/10 border border-lime-500/20 hover:bg-lime-500/20 text-lime-400 transition-all group disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                  <span className="text-xs font-black uppercase tracking-widest">New Research Window</span>
                </button>

                <button
                  onClick={() => setShowUploadZone(true)}
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 transition-all group"
                >
                  <FileUp size={18} className="group-hover:-translate-y-1 transition-transform" />
                  <span className="text-xs font-black uppercase tracking-widest text-white/40">Evidence Vault</span>
                </button>
              </div>

              {/* Evidence Upload Zone Modal */}
              <AnimatePresence>
                {showUploadZone && (
                  <motion.div
                    key="upload-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowUploadZone(false); }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Upload evidence document"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      className="w-full max-w-lg bg-[#05050a] border border-white/10 rounded-3xl p-6 shadow-2xl"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-sm font-black uppercase tracking-widest text-lime-300">Evidence Vault</h2>
                          <p className="text-xs text-white/40 mt-1">Upload a document to extract research evidence</p>
                        </div>
                        <button
                          onClick={() => setShowUploadZone(false)}
                          className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                          aria-label="Close upload zone"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <ScoutUploadZone
                        onSubmit={handleUploadSubmit}
                        onCancel={() => setShowUploadZone(false)}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : activeView === 'sources' ? (
            <SourceLibraryPane
              sources={sources}
              isLoading={sourcesLoading}
              onAddSource={addSourceFn}
              onUpdateSource={updateSourceFn}
              onArchiveSource={archiveSourceFn}
              onExportSources={() => openExportDialog({ type: 'sources', sources })}
            />
          ) : activeView === 'digest' ? (
            <DigestViewer
              digests={digests}
              isLoading={digestsLoading}
              isGenerating={isGeneratingDigest}
              error={digestError}
              profile={profile}
              onGenerate={() => profile && generateDigestFn(profile, 'manual', sources)}
              onDelete={deleteDigestFn}
              onExport={(digest) => openExportDialog({ type: 'digest', digest })}
            />
          ) : (
            <ScoutDashboard 
              soul={globalSoul} 
              profile={profile} 
              onRefreshNews={onRefreshNews}
              isRefreshingNews={isRefreshingNews}
            />
          )}
        </div>
      </div>

      <DeepResearchPanel
        isOpen={deepResearchOpen}
        onClose={() => setDeepResearchOpen(false)}
        initialQuery={deepResearchInitialQuery}
        onResultAccepted={handleDeepResearchAccepted}
        deepResearch={deepResearch}
      />

      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => { setExportDialogOpen(false); setExportTarget(null); }}
        target={exportTarget}
      />
    </SingleAgentLayout>
  );
}

export default function ScoutPage() {
  const { globalSoul } = useGlobalSoul();
  const { user } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('scout');
  const [isRefreshingNews, setIsRefreshingNews] = useState(false);
  
  // Local active profile that can be updated during research cycles
  const [activeProfile, setActiveProfile] = useState<ScoutProfile | null>(null);
  const profileRef = useRef<ScoutProfile | null>(null);
  profileRef.current = activeProfile;

  const handleRefreshNews = useCallback(async (profile: ScoutProfile | null, encryptionKey: CryptoKey | null) => {
    if (!profile || profile.interests.length === 0 || isRefreshingNews) return;
    const lastUpdated = profile.newsUpdatedAt ? Date.parse(profile.newsUpdatedAt) : 0;
    const cooldownMs = 30 * 60 * 1000;
    if (lastUpdated && Date.now() - lastUpdated < cooldownMs) {
      return;
    }

    setIsRefreshingNews(true);
    try {
      const topics = profile.interests.map(i => i.topic);
      const briefs = await generateNewsBriefs(topics, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: ScoutProfile = {
        ...profile,
        newsBriefs: briefs,
        newsUpdatedAt: now,
        updatedAt: now
      };
      await saveScoutProfile(next, { userId: user?.uid, encryptionKey });
    } catch (err) {
      console.error('Scout news refresh failed:', err);
    } finally {
      setIsRefreshingNews(false);
    }
  }, [user?.uid, isRefreshingNews]);

  // Listen for draft updates from the ActionHub
  useEffect(() => {
    const unsub = Spine.on('SCOUT_PROFILE_DRAFT_UPDATED' as any, (event) => {
      setActiveProfile(event.data as unknown as ScoutProfile);
    });
    return unsub;
  }, []);

  const handleActionParsed = useCallback((type: string, payload: Record<string, unknown>) => {
    // Handled by Spine event mostly, but could trigger sound/haptic here
  }, []);

  return (
    <UnifiedModulePage<ScoutProfile>
      moduleId="scout"
      workspaceType="command"
      profileOptions={{
        loadProfile: async (params) => {
          const p = await loadScoutProfile(params);
          setActiveProfile(p);
          return p;
        },
        saveProfile: saveScoutProfile,
        subscribeProfile: (params, onUpdate) => {
           return subscribeScoutProfile(params, (p) => {
              setActiveProfile(p);
              onUpdate(p);
           });
        },
        refreshProfile: async (params) => {
          const p = await loadScoutProfile(params);
          setActiveProfile(p);
          return p;
        },
        syncGuestProfile: syncGuestScoutProfileToUser
      }}
      renderOnboarding={(props) => (
        <ScoutOnboarding
          initialProfile={props.profile}
          onComplete={props.onComplete}
        />
      )}
      renderDashboard={({ encryptionKey }) => (
        <ScoutDashboard 
          soul={globalSoul} 
          profile={activeProfile} 
          isLocked={isLocked}
          isRefreshingNews={isRefreshingNews}
          onRefreshNews={() => handleRefreshNews(activeProfile, encryptionKey)}
        />
      )}
      renderContent={({ encryptionKey }) => (
        <ScoutContent 
          profile={activeProfile} 
          encryptionKey={encryptionKey} 
          isRefreshingNews={isRefreshingNews}
          onRefreshNews={() => handleRefreshNews(activeProfile, encryptionKey)}
          onActionParsed={handleActionParsed}
        />
      )}
    />
  );
}