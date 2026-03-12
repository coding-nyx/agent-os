import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NexusChat } from '@/core/components/NexusChat';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import type { Message, GuestQuota, MessageContent } from '@/lib/types';
import { DailyBriefSection } from './DailyBriefSection';
import { SynthesisPanel } from './SynthesisPanel';
import { ModuleHealthFAB } from './ModuleHealthFAB';
import { CommandPalette } from './CommandPalette';
import { RoutingSuggestion } from './RoutingSuggestion';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { OrchestratorErrorBoundary } from './OrchestratorErrorBoundary';

interface NexusDashboardProps {
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: GuestQuota | null;
    handleSendMessage: (content: MessageContent, onActionParsed?: (type: string, payload: Record<string, unknown>) => void) => Promise<void>;
    clearSession: () => Promise<void>;
  };
  agentName: string;
}

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function NexusDashboard({ ai, agentName }: NexusDashboardProps) {
  const navigate = useNavigate();
  const { refreshGlobalSoul } = useGlobalSoul();
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [routingSuggestion, setRoutingSuggestion] = useState<{
    target: ModuleId;
    reason?: string;
  } | null>(null);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup suggestion timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
    };
  }, []);

  const hasMessages = ai.messages.length > 0;
  const conversationDepth = ai.messages.filter(m => m.role === 'user').length;

  // Auto-collapse brief when chat starts
  React.useEffect(() => {
    if (conversationDepth >= 1 && !briefCollapsed) {
      setBriefCollapsed(true);
    }
  }, [conversationDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActionParsed = useCallback((type: string, payload: Record<string, unknown>) => {
    if (type === 'delegate_to_module' && typeof payload?.moduleId === 'string') {
      const targetModuleId = payload.moduleId as ModuleId;
      const reason = typeof payload?.reason === 'string' ? payload.reason : undefined;
      setRoutingSuggestion({ target: targetModuleId, reason });
      setSuggestionCount(prev => prev + 1);
      // Auto-dismiss after 8 seconds — clear any prior timer to avoid leaks
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      suggestionTimerRef.current = setTimeout(() => setRoutingSuggestion(null), 8000);
    }
  }, []);

  // Smart routing: classify intent before sending
  const handleSendWithRouting = useCallback(async (
    content: MessageContent,
    onActionParsed?: (type: string, payload: Record<string, unknown>) => void
  ) => {
    const contentText = contentToText(content);
    // Skip routing in these cases per spec
    const shouldSkipRouting =
      conversationDepth === 0 || // First message stays in Nexus
      conversationDepth > 3 ||   // Deep conversation — don't break flow
      suggestionCount >= 2;      // Already suggested twice

    if (!shouldSkipRouting) {
      const decision = NexusRoutingService.classifyIntent(contentText);
      // Multi-keyword check: if target isn't orchestrator and confidence is high enough
      if (decision.target !== 'orchestrator' && decision.confidence >= 0.62) {
        setRoutingSuggestion({ target: decision.target, reason: decision.reason });
        setSuggestionCount(prev => prev + 1);
        // Auto-dismiss after 8 seconds — clear any prior timer to avoid leaks
        if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
        suggestionTimerRef.current = setTimeout(() => setRoutingSuggestion(null), 8000);
      }
    }

    // Always send the message to Nexus regardless of routing suggestion
    await ai.handleSendMessage(content, onActionParsed);
  }, [ai, conversationDepth, suggestionCount]);

  const handleRouteConfirm = useCallback(() => {
    if (!routingSuggestion) return;
    const manifest = MODULE_MANIFEST[routingSuggestion.target];
    if (manifest) {
      navigate(manifest.route);
    }
    setRoutingSuggestion(null);
  }, [routingSuggestion, navigate]);

  const handleRouteDismiss = useCallback(() => {
    setRoutingSuggestion(null);
  }, []);

  const handleInjectChat = useCallback((text: string) => {
    ai.handleSendMessage(text);
  }, [ai]);

  const handleConsultModule = useCallback((moduleId: string) => {
    ai.handleSendMessage(`Consult ${MODULE_MANIFEST[moduleId as ModuleId]?.title || moduleId} about my current state.`);
  }, [ai]);

  const handleAskAboutDomain = useCallback((domain: string) => {
    ai.handleSendMessage(`Tell me about my ${domain} state right now.`);
  }, [ai]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Daily Brief — above chat, collapsible, constrained on mobile */}
      <div className="shrink-0 px-4 pt-3 pb-2 space-y-3 max-h-[40vh] overflow-y-auto sm:max-h-none sm:overflow-visible">
        <OrchestratorErrorBoundary name="DailyBrief">
          <DailyBriefSection
            collapsed={briefCollapsed}
            onToggleCollapse={() => setBriefCollapsed(!briefCollapsed)}
            onAskAboutDomain={handleAskAboutDomain}
          />
        </OrchestratorErrorBoundary>

        {/* Synthesis Panel — below brief, above chat */}
        <OrchestratorErrorBoundary name="SynthesisPanel">
          <SynthesisPanel
            onInjectChat={handleInjectChat}
            onConsultModule={handleConsultModule}
            onNavigate={(path) => navigate(path)}
          />
        </OrchestratorErrorBoundary>
      </div>

      {/* Chat area — fills remaining space; relative for FAB positioning */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {/* Module Health FAB — floats bottom-right inside chat area */}
        <OrchestratorErrorBoundary name="ModuleHealth">
          <ModuleHealthFAB />
        </OrchestratorErrorBoundary>

        {/* ⌘K discoverability hint */}
        <div className="absolute top-2 right-3 z-10 pointer-events-none">
          <kbd className="text-[10px] font-mono text-white/20 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 select-none">
            ⌘K
          </kbd>
        </div>

        <NexusChat
          ai={{
            ...ai,
            handleSendMessage: handleSendWithRouting,
          }}
          agentName={agentName}
          themeColor="cyan"
          placeholder="Ask Nexus anything — system command, cross-domain analysis, or module routing..."
          moduleId="orchestrator"
          onClearHistory={ai.clearSession}
          onActionParsed={handleActionParsed}
        />

        {/* Routing suggestion — inline below chat input */}
        <RoutingSuggestion
          target={routingSuggestion?.target || 'agnes'}
          reason={routingSuggestion?.reason}
          onConfirm={handleRouteConfirm}
          onDismiss={handleRouteDismiss}
          visible={routingSuggestion !== null}
        />
      </div>

      {/* Command Palette — overlay, ⌘K triggered */}
      <CommandPalette
        onSynthesisRefresh={refreshGlobalSoul}
        onMemorySearch={(query) => {
          if (query) ai.handleSendMessage(`Search my memory for: ${query}`);
        }}
        onAskModule={(moduleId) => {
          handleConsultModule(moduleId);
        }}
        onExpandBrief={() => setBriefCollapsed(false)}
      />
    </div>
  );
}
