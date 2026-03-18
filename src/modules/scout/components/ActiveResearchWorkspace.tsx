import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  Zap, 
  BookOpen, 
  CheckCircle, 
  FileText, 
  Brain, 
  ArrowRight, 
  Loader2,
  ExternalLink,
  Plus,
  History,
  BookMarked
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Message, GuestQuota } from '@/lib/types';
import { ResearchSession, ScoutKnowledgeNode, SourceEntry } from '../types';
import { cn } from '@/lib/utils';
import { Spine } from '@/lib/spine/spine-event-bus';
import { AddSourceInput } from '../services/scout-sources-service';
import { ChatInterface } from '@/core/components/ChatInterface';

interface ActiveResearchWorkspaceProps {
  session: ResearchSession;
  encryptionKey: CryptoKey | null;
  onStartDeepResearch: (query: string) => void;
  onSendMessage: (text: string) => void;
  onUpdateSession: (id: string, patch: Partial<ResearchSession>) => Promise<void>;
  onAddSource: (input: AddSourceInput) => Promise<any>;
  knowledgeNodes: ScoutKnowledgeNode[];
  sources: SourceEntry[];
  // AI Engine State
  messages: Message[];
  isProcessing: boolean;
  aiState?: {
    isThinking: boolean;
    isActing: boolean;
    currentActionType: string | null;
  };
  streamingText: string;
  error: string | null;
  quota: GuestQuota | null;
}

export function ActiveResearchWorkspace({
  session,
  encryptionKey,
  onStartDeepResearch,
  onSendMessage,
  onUpdateSession,
  onAddSource,
  knowledgeNodes,
  sources,
  messages,
  isProcessing,
  aiState,
  streamingText,
  error,
  quota
}: ActiveResearchWorkspaceProps) {
  const [isArtifactsVisible, setIsArtifactsVisible] = useState(true);

  // Filter findings and sources for THIS session
  const sessionNodes = knowledgeNodes.filter(n => n.parentSessionId === session.id);
  const sessionSources = sources.filter(s => s.citingNodeIds?.some(id => sessionNodes.some(n => n.id === id)));

  // Logic for thinking bubble
  const visibleStreamingText = (streamingText || '').trim();
  const hasVisibleStream = visibleStreamingText.length > 0;
  const transientStreamMessage = hasVisibleStream ? [{ role: 'assistant' as const, content: visibleStreamingText }] : [];
  const renderedMessages = [...(messages || []), ...transientStreamMessage];

  const msgArray = messages || [];
  const isInitialThinking = (msgArray.length === 0 || msgArray[msgArray.length - 1]?.role === 'user') && !hasVisibleStream;
  const isActuallyThinking = isProcessing && (isInitialThinking || !!aiState?.isActing);
  const isSyncing = isProcessing && !hasVisibleStream && !isActuallyThinking;

  return (
    <div className="flex flex-col h-full bg-[#05050a] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
      {/* Workspace Header */}
      <div className="px-8 py-5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center text-lime-400 shadow-lg shadow-lime-500/5">
            <BookOpen size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">{session.topic}</h2>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                session.status === 'complete' 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-lime-500/10 border-lime-500/20 text-lime-400"
              )}>
                {session.status === 'complete' ? 'Synthesized' : 'Active Session'}
              </span>
            </div>
            <p className="text-[10px] text-white/30 mt-0.5 font-medium tracking-wide uppercase">Scout Intellectual Workbench v3.2</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsArtifactsVisible(!isArtifactsVisible)}
            className={cn(
              "p-2 rounded-xl border transition-all",
              isArtifactsVisible ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-white/40"
            )}
            title="Toggle Artifacts"
          >
            <History size={16} />
          </button>
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button 
            onClick={() => onStartDeepResearch(session.topic)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 hover:bg-violet-500/20 transition-all text-xs font-bold shadow-lg shadow-violet-500/5"
          >
            <Zap size={14} />
            Deep Research
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Feed: Reusing Core ChatInterface */}
        <div className="flex-1 flex flex-col min-w-0 bg-white/[0.01]">
          <ChatInterface 
            messages={renderedMessages}
            onSendMessage={onSendMessage}
            isLoading={isActuallyThinking}
            isSyncing={isSyncing}
            isProcessing={isProcessing}
            aiState={aiState}
            themeColor="lime"
            agentName="Scout"
            placeholder="Direct Scout's attention..."
            error={error}
            quota={quota ?? undefined}
            moduleId="scout"
            showInternalSignals={true}
          />
        </div>

        {/* Sidebar: Findings & Evidence Summary */}
        <AnimatePresence>
          {isArtifactsVisible && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="bg-white/[0.01] border-l border-white/5 flex flex-col overflow-hidden shrink-0"
            >
              <div className="p-6 h-full flex flex-col">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-6 flex items-center justify-between shrink-0">
                  Research Artifacts
                  <span className="px-2 py-0.5 rounded-lg bg-white/5 text-white/60 font-mono tracking-normal">{sessionNodes.length + sessionSources.length}</span>
                </h3>
                
                <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-1">
                  {/* Claims Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Synthesized Findings</h4>
                    </div>
                    {sessionNodes.length === 0 ? (
                      <div className="py-8 text-center rounded-2xl border border-dashed border-white/5">
                        <Brain size={24} className="mx-auto text-white/10 mb-2" />
                        <p className="text-[10px] text-white/20 font-medium">No claims synthesized yet.</p>
                      </div>
                    ) : (
                      sessionNodes.map(node => (
                        <div key={node.id} className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2 hover:border-lime-500/20 transition-all cursor-pointer group">
                          <div className="flex items-center justify-between">
                            <div className="w-1.5 h-1.5 rounded-full bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.5)]" />
                            <span className="text-[9px] font-mono text-white/20">{Math.round(node.confidence * 100)}% Conf.</span>
                          </div>
                          <p className="text-xs text-white/70 leading-relaxed font-medium group-hover:text-white transition-colors">{node.claim}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Evidence Section */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Key Evidence</h4>
                    {sessionSources.length === 0 ? (
                      <div className="py-8 text-center rounded-2xl border border-dashed border-white/5">
                        <FileText size={24} className="mx-auto text-white/10 mb-2" />
                        <p className="text-[10px] text-white/20 font-medium">No sources linked yet.</p>
                      </div>
                    ) : (
                      sessionSources.map(source => (
                        <div key={source.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3 hover:bg-white/[0.04] transition-all cursor-pointer">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
                            <ExternalLink size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-white/80 truncate">{source.title}</p>
                            <p className="text-[9px] text-white/20 truncate">{source.domain}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-6 mt-6 border-t border-white/5 shrink-0">
                   <div className="p-4 rounded-2xl bg-gradient-to-br from-lime-500/10 to-emerald-500/5 border border-lime-500/10 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-lime-500 shadow-[0_0_10px_rgba(132,204,22,0.5)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-lime-400">Scout Awareness</span>
                      </div>
                      <p className="text-[10px] text-white/60 leading-relaxed italic">
                        "I'm continuously monitoring this domain for emerging signals and cross-referencing with our existing findings."
                      </p>
                   </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
