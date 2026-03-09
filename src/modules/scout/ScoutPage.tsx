import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { SCOUT_PERSONA } from './personas';
import { ScoutDashboard } from './components/ScoutDashboard';
import { RoutingSuggestion } from '@/modules/orchestrator/components/RoutingSuggestion';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import {
  ScoutProfile,
  loadScoutProfile,
  saveScoutProfile,
  subscribeScoutProfile,
  syncGuestScoutProfileToUser
} from './services/scout-knowledge-service';
import { generateNewsBriefs } from './services/pulse-news-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { FileUp, Plus, X, Search, LayoutDashboard } from 'lucide-react';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { registerDiagnosisSpec } from '@/core/diagnosis/diagnosis-registry';
import { scoutDiagnosisSpec } from './diagnosis/scout-diagnosis-spec';
import { Spine } from '@/lib/spine/spine-event-bus';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/core/components/SectionHeader';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';

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

function ScoutResearchWindow({ 
  windowId, 
  encryptionKey, 
  onClose, 
  isActive, 
  onActivate,
  agentAlias,
  onActionParsed
}: { 
  windowId: string; 
  encryptionKey: CryptoKey | null; 
  onClose?: () => void;
  isActive: boolean;
  onActivate: () => void;
  agentAlias: string;
  onActionParsed?: (type: string, payload: Record<string, unknown>) => void;
}) {
  const navigate = useNavigate();
  const { 
    messages, 
    setMessages, 
    isProcessing, 
    streamingText, 
    error, 
    quota, 
    routingSuggestion,
    setRoutingSuggestion,
    handleSendMessage 
  } = useModuleAI({
    moduleId: 'scout',
    systemPrompt: SCOUT_PERSONA,
    encryptionKey,
    sessionId: windowId, // Use windowId as session identifier
    persistencePolicy: 'scout-research'
  });

  const handleRouteConfirm = useCallback(() => {
    if (!routingSuggestion) return;
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    setRoutingSuggestion(null);
  }, [routingSuggestion, navigate, setRoutingSuggestion]);

  const handleRouteDismiss = useCallback(() => {
    setRoutingSuggestion(null);
  }, [setRoutingSuggestion]);

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText) {
      setMessages([
        {
          role: 'assistant',
          content: `Research cycle [${windowId.slice(0, 4)}] active. I am ${agentAlias}. How can I assist your inquiry?`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, setMessages, agentAlias, windowId]);

  return (
    <div 
      onClick={onActivate}
      className={cn(
        "flex-1 flex flex-col min-h-0 transition-all duration-500 rounded-[32px] overflow-hidden border",
        isActive 
          ? "bg-black/40 border-lime-500/30 shadow-[0_0_40px_-12px_rgba(163,230,53,0.2)]" 
          : "bg-black/20 border-white/5 opacity-40 hover:opacity-60 scale-[0.98] cursor-pointer"
      )}
    >
      <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", isActive ? "bg-lime-400" : "bg-white/20")} />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Research Cycle {windowId.slice(0, 4)}</span>
        </div>
        {onClose && (
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      
      <div className="flex-1 min-h-0 pointer-events-auto relative flex flex-col">
        <NexusChat
          moduleId="scout"
          ai={{ 
            messages, 
            isProcessing, 
            streamingText, 
            error, 
            quota, 
            handleSendMessage: (content) => handleSendMessage(content, onActionParsed)
          }}
          agentName={agentAlias}
          themeColor="lime"
          placeholder="Query research node..."
          showInternalSignals={false}
        />
        {/* Routing suggestion — inline below chat input */}
        <RoutingSuggestion
          target={routingSuggestion?.target || 'agnes'}
          reason={routingSuggestion?.reason}
          onConfirm={handleRouteConfirm}
          onDismiss={handleRouteDismiss}
          visible={isActive && routingSuggestion !== null}
        />
      </div>
    </div>
  );
}

function ScoutContent({ profile, encryptionKey, isRefreshingNews, onRefreshNews, onActionParsed }: ScoutViewProps) {
  const { globalSoul } = useGlobalSoul();
  const agentAlias = globalSoul?.displayNames?.scout || 'Scout';
  const navigate = useNavigate();
  
  const [activeView, setActiveView] = useState<'research' | 'dashboard'>('research');
  const [windows, setWindows] = useState<ResearchWindow[]>([
    { id: crypto.randomUUID(), title: 'Primary Research' }
  ]);
  const [activeWindowId, setActiveWindowId] = useState<string>(windows[0].id);

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

  const handleOpenDocuments = useCallback(() => {
    NexusHandoffService.store({
      moduleId: 'documents',
      type: 'delegate',
      content: 'Open the document intelligence workspace for Scout evidence analysis.',
      reason: 'scout_document_upload',
      sourceModuleId: 'scout',
      createdAt: new Date().toISOString()
    });
    navigate('/documents');
  }, [navigate]);

  const tabs: NeuralTabItem<'research' | 'dashboard'>[] = [
    { id: 'research', label: 'Research Nodes', icon: Search },
    { id: 'dashboard', label: 'Telemetry', icon: LayoutDashboard },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 md:px-8 pt-4 md:pt-8 pb-2 md:pb-4">
        <SectionHeader
          label="Research Domain"
          title="Knowledge Node"
          subtitle="Research assistant and fact-checking engine with verified knowledge graphs."
          accentClassName="text-lime-400"
        />
      </div>

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
            <div className={cn(
              "flex-1 grid gap-6 transition-all duration-500",
              windows.length === 1 ? "grid-cols-1" : 
              windows.length === 2 ? "grid-cols-1 lg:grid-cols-2" : 
              "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
            )}>
              <AnimatePresence mode="popLayout">
                {windows.map((window) => (
                  <motion.div
                    key={window.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="flex flex-col min-h-0 h-full"
                  >
                    <ScoutResearchWindow
                      windowId={window.id}
                      encryptionKey={encryptionKey}
                      agentAlias={agentAlias}
                      onActionParsed={onActionParsed}
                      isActive={activeWindowId === window.id}
                      onActivate={() => setActiveWindowId(window.id)}
                      onClose={windows.length > 1 ? () => closeWindow(window.id) : undefined}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center gap-4 py-2">
              <button
                onClick={addWindow}
                disabled={windows.length >= 3}
                className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-lime-500/10 border border-lime-500/20 hover:bg-lime-500/20 text-lime-400 transition-all group disabled:opacity-30 disabled:pointer-events-none"
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                <span className="text-xs font-black uppercase tracking-widest">New Research Window</span>
              </button>

              <button
                onClick={handleOpenDocuments}
                className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 transition-all group"
              >
                <FileUp size={18} className="group-hover:-translate-y-1 transition-transform" />
                <span className="text-xs font-black uppercase tracking-widest text-white/40">Evidence Vault</span>
              </button>
            </div>
          </div>
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
  );
}

import { ScoutOnboarding } from './onboarding/ScoutOnboarding';

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
