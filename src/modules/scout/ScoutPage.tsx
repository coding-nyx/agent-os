import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { useAI } from '@/llm-engine/ai-context';
import type { MessageContent } from '@/lib/types';
import { SCOUT_PERSONA, getScoutSystemPrompt } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
import { ScoutUploadZone } from './components/ScoutUploadZone';
import { buildDocumentAnalysisPrompt, parseDocument as parseScoutDocument, validateFile as validateScoutFile } from './services/scout-document-service';
import type { DocumentParseResult } from './services/scout-document-service';
import {
  ScoutProfile,
  loadScoutProfile,
  saveScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser,
  loadKnowledgeNodes,
  addKnowledgeNode
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

// Scout v2 hooks
import { useSources } from './hooks/useSources';
import { useDigests } from './hooks/useDigests';
import { useDeepResearch } from './hooks/useDeepResearch';
import { useSessions } from './hooks/useSessions';
import { useKnowledgeNodes } from './hooks/useKnowledgeNodes';

// Scout v2 components
import { SourceLibraryPane } from './components/sources/SourceLibraryPane';
import { DigestViewer } from './components/digest/DigestViewer';
import { DeepResearchPanel } from './components/deep-research/DeepResearchPanel';
import { ExportDialog } from './components/ExportDialog';
import { ActiveResearchWorkspace } from './components/ActiveResearchWorkspace';
import type { ExportTarget } from './services/scout-export-service';
import type { DeepResearchResult } from './hooks/useDeepResearch';
import { runDocumentPipeline, type DocumentParsed } from '@/lib/services/document-pipeline';
import { scoutDocumentPolicy, type ScoutDocumentProposal } from './services/scout-document-policy';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NewSessionDialog } from './components/NewSessionDialog';

registerDiagnosisSpec(scoutDiagnosisSpec);

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
  const { sendMessage } = useAI();
  
  const [activeView, setActiveView] = useState<'research' | 'dashboard' | 'sources' | 'digest'>('research');
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  
  // Dynamic layout: collapse chat when deep in research workspace
  useEffect(() => {
    if (activeView === 'research' && activeSessionId) {
      setIsChatCollapsed(true);
    } else {
      setIsChatCollapsed(false);
    }
  }, [activeView, activeSessionId]);
  
  // v2 state
  const [deepResearchOpen, setDeepResearchOpen] = useState(false);
  const [deepResearchInitialQuery, setDeepResearchInitialQuery] = useState('');
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [docProposal, setDocProposal] = useState<ScoutDocumentProposal | null>(null);
  const [docProposalSummary, setDocProposalSummary] = useState<string | null>(null);
  const [docProposalParsed, setDocProposalParsed] = useState<DocumentParseResult | null>(null);
  const [docReviewOpen, setDocReviewOpen] = useState(false);
  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);

  const ctx = useMemo(
    () => ({ userId: user?.uid, encryptionKey }),
    [user?.uid, encryptionKey],
  );

  const {
    sources,
    isLoading: sourcesLoading,
    addSource: addSourceFn,
    updateSource: updateSourceFn,
    archiveSource: archiveSourceFn,
  } = useSources(ctx);

  const {
    digests,
    isLoading: digestsLoading,
    isGenerating: isGeneratingDigest,
    error: digestError,
    generateDigest: generateDigestFn,
    deleteDigest: deleteDigestFn,
  } = useDigests(ctx);

  const {
    sessions,
    isLoading: sessionsLoading,
    createSession: createSessionFn,
    updateSession: updateSessionFn,
    deleteSession: deleteSessionFn,
  } = useSessions({ userId: user?.uid });

  const {
    knowledgeNodes,
    refresh: refreshKnowledge,
  } = useKnowledgeNodes(ctx);

  const deepResearch = useDeepResearch({
    userId: user?.uid,
    encryptionKey,
  });

  // Stable refs for values used in Spine event callbacks
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const digestsRef = useRef(digests);
  digestsRef.current = digests;

  const openExportDialog = useCallback((target: ExportTarget) => {
    setExportTarget(target);
    setExportDialogOpen(true);
  }, []);

  const handleDeepResearchAccepted = useCallback(async (result: DeepResearchResult) => {
    if (!profileRef.current || !encryptionKey) return;
    
    // Persist the synthesized node
    try {
      const evidenceSourceIds = result.capturedSources.map((_, i) => `source_temp_${i}`); // Wait, addSourceFn doesn't return the ID cleanly if we map it before adding. Let's wait for adds.
      
      const addedSourceIds: string[] = [];
      for (const src of result.capturedSources) {
        const added = await addSourceFn(src).catch(() => null);
        if (added) addedSourceIds.push(added.id);
      }
      
      await addKnowledgeNode({
        ...result.synthesisNode,
        evidence: addedSourceIds,
        parentSessionId: activeSessionId || undefined
      }, { userId: user?.uid, encryptionKey });
      
    } catch (err) {
      console.error('Failed to persist deep research node', err);
    }
    
    deepResearch.reset();
    setDeepResearchOpen(false);
    setActiveView('research');
  }, [encryptionKey, addSourceFn, deepResearch, user?.uid, activeSessionId]);

  // Spine listeners for AI-triggered UI events
  useEffect(() => {
    const unsubDeepResearch = Spine.subscribe('DEEP_RESEARCH_STARTED' as any, (event) => {
      const query = (event.data?.query as string) ?? '';
      setDeepResearchInitialQuery(query);
      setDeepResearchOpen(true);
    });

    const unsubExport = Spine.subscribe('EXPORT_REQUESTED' as any, (event) => {
      const exportType = event.data?.exportType as string;
      const p = profileRef.current;
      const s = sourcesRef.current;
      const d = digestsRef.current;
      if (exportType === 'full-library') {
        // Need to load nodes for export
        loadKnowledgeNodes({ userId: user?.uid, encryptionKey }).then(nodes => {
          openExportDialog({ type: 'full-library', nodes, digests: d, sources: s });
        });
      } else if (exportType === 'sources') {
        openExportDialog({ type: 'sources', sources: s });
      } else if (exportType === 'nodes') {
        loadKnowledgeNodes({ userId: user?.uid, encryptionKey }).then(nodes => {
          openExportDialog({ type: 'nodes', nodes });
        });
      } else if (exportType === 'digest' && d[0]) {
        openExportDialog({ type: 'digest', digest: d[0] });
      }
    });

    const unsubDigest = Spine.subscribe('DIGEST_GENERATION_STARTED' as any, () => {
      setActiveView('digest');
    });

    const unsubSession = Spine.subscribe('SESSION_STARTED' as any, (event) => {
      if (typeof event.data?.sessionId === 'string') {
        setActiveSessionId(event.data.sessionId);
        setActiveView('research');
      }
    });

    return () => {
      unsubDeepResearch();
      unsubExport();
      unsubDigest();
      unsubSession();
    };
  }, [openExportDialog, user?.uid, encryptionKey]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const ai = useModuleAI({
    moduleId: 'scout',
    systemPrompt: getScoutSystemPrompt(activeSession?.topic),
    encryptionKey,
    sessionId: activeSessionId || 'default',
    persistencePolicy: 'scout-research'
  });

  const handleUploadSubmit = useCallback(async (result: DocumentParseResult) => {
    setShowUploadZone(false);
    setErrorMessage(null);
    try {
      const normalizedType = result.metadata.fileType === 'pdf' || result.metadata.fileType === 'csv'
        ? result.metadata.fileType
        : 'text';

      const parsedOverride: DocumentParsed = {
        fileName: result.metadata.filename,
        fileType: normalizedType,
        fileSizeBytes: result.metadata.fileSize,
        pageCount: result.metadata.pageCount ?? 1,
        wordCount: result.metadata.wordCount,
        detectedTitle: result.metadata.extractedTitle,
        rawText: result.text,
        notes: result.notes,
        parsedAt: result.metadata.parsedAt,
        extras: { scoutParseResult: result },
      };

      const llmPrimary = async (prompt: string) => {
        const { response } = await sendMessage(prompt, {
          systemPrompt: 'You are a research document analyst. Follow the instructions exactly.',
          memoryContext: [],
          summary: 'Research document analysis.',
          history: [],
        });
        return response.publicText;
      };
      const llmFallback = async (prompt: string) => {
        const { response } = await sendMessage(prompt, {
          systemPrompt: 'Return a plain-text summary and key findings as instructed.',
          memoryContext: [],
          summary: 'Research analysis fallback.',
          history: [],
        });
        return response.publicText;
      };

      const pipeline = await runDocumentPipeline({
        file: new File([result.text], result.metadata.filename, { type: 'text/plain' }),
        policy: scoutDocumentPolicy,
        sendMessage: llmPrimary,
        sendMessageFallback: llmFallback,
        parsedOverride,
      });

      setDocProposal(pipeline.proposal);
      setDocProposalSummary(pipeline.summary);
      setDocProposalParsed(result);
      setDocReviewOpen(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to process document. Please try again.');
    }
  }, [ai, onActionParsed, sendMessage]);

  const handleChatUpload = useCallback(async (file: File) => {
    const validation = validateScoutFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }
    try {
      const result = await parseScoutDocument(file);
      await handleUploadSubmit(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to parse document.');
    }
  }, [handleUploadSubmit]);

  const handleDocProposalCommit = useCallback(() => {
    if (!docProposalParsed) return;
    const prompt = buildDocumentAnalysisPrompt(docProposalParsed);
    ai.handleSendMessage(prompt, onActionParsed);
    setDocReviewOpen(false);
    setDocProposal(null);
    setDocProposalSummary(null);
    setDocProposalParsed(null);
  }, [docProposalParsed, ai, onActionParsed]);

  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      ai.setMessages([
        {
          role: 'assistant',
          content: `Research protocol active. I am ${agentAlias}. How can I assist your inquiry?`
        }
      ]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, agentAlias]);

  const tabs: NeuralTabItem<'research' | 'dashboard' | 'sources' | 'digest'>[] = [
    { id: 'research', label: 'Inquiry', icon: Search },
    { id: 'dashboard', label: 'Telemetry', icon: LayoutDashboard },
    { id: 'sources', label: 'Library', icon: BookMarked },
    { id: 'digest', label: 'Newsletter', icon: FileText },
  ];

  const handleSendMessageWrapped = useCallback(async (
    content: MessageContent,
    onAction?: (actionType: string, payload: Record<string, unknown>) => void
  ) => {
    setErrorMessage(null);
    try {
      await ai.handleSendMessage(content, onAction ?? onActionParsed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }, [ai.handleSendMessage, onActionParsed]);

  const aiProp = useMemo(() => ({
    ...ai,
    handleSendMessage: handleSendMessageWrapped,
  }), [ai, handleSendMessageWrapped]);

  const handleStartSession = useCallback(() => {
    setIsNewSessionDialogOpen(true);
  }, []);

  const handleNewSessionSubmit = useCallback(async (topic: string, isDeepResearch: boolean) => {
    setIsNewSessionDialogOpen(false);
    try {
      const session = await createSessionFn(topic);
      if (session) {
        setActiveSessionId(session.id);
        setActiveView('research');
        if (isDeepResearch) {
          setDeepResearchInitialQuery(topic);
          setDeepResearchOpen(true);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create session.');
    }
  }, [createSessionFn]);

  return (
    <SingleAgentLayout
      moduleId="scout"
      agentName={agentAlias}
      themeColor="lime"
      ai={aiProp}
      authMode="scout"
      placeholder="Discuss research strategy..."
      onUploadDocument={handleChatUpload}
      isChatCollapsed={isChatCollapsed}
      onToggleChat={setIsChatCollapsed}
    >
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
          <SectionHeader
            label="Intelligence Domain"
            title="Scout Protocol"
            subtitle="Deep research, fact-checking, and knowledge synthesis."
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
            <div
              className={cn(
                'h-full flex flex-col space-y-6',
                activeSessionId ? 'p-2 md:p-4' : 'p-8'
              )}
            >
               {activeSessionId ? (
                 <ActiveResearchWorkspace 
                   session={sessions.find(s => s.id === activeSessionId)!}
                   encryptionKey={encryptionKey}
                   onStartDeepResearch={(query) => {
                     setDeepResearchInitialQuery(query);
                     setDeepResearchOpen(true);
                   }}
                   onSendMessage={(text) => ai.handleSendMessage(text, onActionParsed)}
                   onUpdateSession={updateSessionFn}
                   onAddSource={addSourceFn}
                   knowledgeNodes={knowledgeNodes}
                   sources={sources}
                   messages={ai.messages}
                   isProcessing={ai.isProcessing}
                   aiState={ai.aiState}
                   streamingText={ai.streamingText}
                   error={ai.error}
                   quota={ai.quota}
                 />
               ) : (
                 <div className="h-full flex flex-col space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/40">Research Stream</h3>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleStartSession}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lime-500/10 border border-lime-500/20 text-lime-400 hover:bg-lime-500/20 transition-all text-xs font-bold"
                        >
                          <Plus size={16} />
                          New Session
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-12 space-y-6 bg-white/[0.01]">
                        <div className="w-20 h-20 rounded-full bg-white/[0.02] flex items-center justify-center text-white/10">
                          <Search size={40} />
                        </div>
                        <div className="max-w-xs space-y-2">
                          <h4 className="text-md font-bold text-white/60">No active inquiry</h4>
                          <p className="text-xs text-white/30 leading-relaxed">
                            Select a session from Telemetry or start a new one to begin deep research.
                          </p>
                        </div>
                        <button
                          onClick={handleStartSession}
                          className="px-8 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all text-xs font-black uppercase tracking-widest"
                        >
                          Initialize Scout
                        </button>
                    </div>
                 </div>
               )}
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
              onGenerate={() => {
                loadKnowledgeNodes({ userId: user?.uid, encryptionKey }).then(nodes => {
                  generateDigestFn(profile?.interests.map(i => i.topic) || [], nodes, sources, 'manual');
                });
              }}
              onDelete={deleteDigestFn}
              onExport={(digest) => openExportDialog({ type: 'digest', digest })}
            />
          ) : (
            <ScoutDashboard 
              soul={globalSoul} 
              profile={profile} 
              sessions={sessions}
              activeSessionId={activeSessionId || undefined}
              onSelectSession={(id) => {
                setActiveSessionId(id);
                setActiveView('research');
              }}
              onDeleteSession={deleteSessionFn}
              onRefreshNews={onRefreshNews}
              isRefreshingNews={isRefreshingNews}
            />
          )}
        </div>
      </div>

      <AnimatePresence>
        {deepResearchOpen && (
          <DeepResearchPanel
            isOpen={deepResearchOpen}
            onClose={() => setDeepResearchOpen(false)}
            initialQuery={deepResearchInitialQuery}
            onResultAccepted={handleDeepResearchAccepted}
            deepResearch={deepResearch}
          />
        )}
      </AnimatePresence>

      <ExportDialog
        isOpen={exportDialogOpen}
        onClose={() => { setExportDialogOpen(false); setExportTarget(null); }}
        target={exportTarget}
      />
      <NeuralModal
        isOpen={docReviewOpen}
        onClose={() => {
          setDocReviewOpen(false);
          setDocProposal(null);
          setDocProposalSummary(null);
          setDocProposalParsed(null);
        }}
        title="Document Evidence Detected"
        themeColor="emerald"
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {docProposal && (
            <div className="space-y-4">
              <p className="text-sm text-white/70">{docProposalSummary ?? 'Document analysis ready for review.'}</p>
              <div className="bg-black/30 border border-white/10 rounded-xl p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Analysis Summary</h4>
                <pre className="text-[12px] text-white/70 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {docProposal.summary}
                </pre>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Text Preview</h4>
                <pre className="text-[11px] text-white/50 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {docProposal.rawTextPreview}
                  {docProposal.rawTextPreview.length >= 2400 ? '\n[truncated]' : ''}
                </pre>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button onClick={handleDocProposalCommit} className="flex-1 px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white font-bold text-xs rounded-lg">Apply</button>
            <button onClick={() => setDocReviewOpen(false)} className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg">Discard</button>
          </div>
        </div>
      </NeuralModal>

      <AnimatePresence>
        {showUploadZone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUploadZone(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-[#05050a] border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-lime-300">Evidence Vault</h2>
                  <p className="text-xs text-white/40 mt-1">Extract research evidence from documents</p>
                </div>
                <button
                  onClick={() => setShowUploadZone(false)}
                  className="p-2 rounded-xl hover:bg-white/10 text-white/40 transition-colors"
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

      <NewSessionDialog
        isOpen={isNewSessionDialogOpen}
        onClose={() => setIsNewSessionDialogOpen(false)}
        onSubmit={handleNewSessionSubmit}
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
  
  const [activeProfile, setActiveProfile] = useState<ScoutProfile | null>(null);

  const handleRefreshNews = useCallback(async (profile: ScoutProfile | null, encryptionKey: CryptoKey | null) => {
    if (!profile || profile.interests.length === 0 || isRefreshingNews) return;
    setIsRefreshingNews(true);
    try {
      const topics = profile.interests.map(i => i.topic);
      const briefs = await generateNewsBriefs(topics, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: ScoutProfile = {
        ...profile,
        newsBriefs: briefs,
        updatedAt: now
      };
      await saveScoutProfile(next, { userId: user?.uid, encryptionKey });
    } catch (err) {
      console.error('Scout news refresh failed:', err);
    } finally {
      setIsRefreshingNews(false);
    }
  }, [user?.uid, isRefreshingNews]);

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
        syncGuestProfile: syncGuestScoutProfileToUser as any
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
        />
      )}
    />
  );
}
