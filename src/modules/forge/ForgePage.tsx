import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Code, Mail, FileText, ListChecks, LucideIcon } from 'lucide-react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { cn } from '@/lib/utils';
import { FORGE_PERSONA, FORGE_CODE_OVERLAY, FORGE_COMMS_OVERLAY, FORGE_DOCS_OVERLAY, FORGE_LIFE_OVERLAY } from './personas';
import { ForgeDashboard } from './components/ForgeDashboard';
import {
  ForgeExecutionRecord,
  ForgeProfile,
  loadForgeProfile,
  saveForgeProfile,
  subscribeForgeProfile,
  syncGuestForgeProfileToUser
} from './services/forge-session-service';
import { ForgeCloudExecutionService } from './services/forge-cloud-execution';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { ForgeOnboarding } from './onboarding/ForgeOnboarding';

type ForgeMode = 'code' | 'comms' | 'docs' | 'life';

const FORGE_MODES: { id: ForgeMode; label: string; icon: LucideIcon; overlay: string; switchPrompt: string }[] = [
  { id: 'code',  label: 'Code',  icon: Code,       overlay: FORGE_CODE_OVERLAY,  switchPrompt: 'Switching to Code mode.' },
  { id: 'comms', label: 'Comms', icon: Mail,        overlay: FORGE_COMMS_OVERLAY, switchPrompt: 'Switching to Comms mode.' },
  { id: 'docs',  label: 'Docs',  icon: FileText,    overlay: FORGE_DOCS_OVERLAY,  switchPrompt: 'Switching to Docs mode.' },
  { id: 'life',  label: 'Life',  icon: ListChecks,  overlay: FORGE_LIFE_OVERLAY,  switchPrompt: 'Switching to Life Ops mode.' },
];

function formatExecutionOutput(payload: { logs?: string[]; result?: string; error?: string }): string {
  const lines: string[] = [];
  if (payload.logs && payload.logs.length > 0) {
    lines.push('[logs]');
    lines.push(...payload.logs);
  }
  if (payload.result) {
    lines.push('');
    lines.push('[result]');
    lines.push(payload.result);
  }
  if (payload.error) {
    lines.push('');
    lines.push('[error]');
    lines.push(payload.error);
  }
  return lines.join('\n').trim();
}

function ForgeContent({ profile, encryptionKey }: { profile: ForgeProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { user } = useAuth();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('forge');

  const agentAlias = globalSoul?.displayNames?.forge || 'Forge';
  const [editorLanguage, setEditorLanguage] = useState('javascript');
  const [editorCode, setEditorCode] = useState('// Forge cloud runner\\nconsole.log("Forge online");');
  const [editorStatus, setEditorStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [editorOutput, setEditorOutput] = useState('');
  const [selectedMode, setSelectedMode] = useState<ForgeMode>('code');
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  );
  const [showDashboard, setShowDashboard] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const activeOverlay = FORGE_MODES.find((m) => m.id === selectedMode)?.overlay ?? FORGE_CODE_OVERLAY;
  const systemPrompt = `${FORGE_PERSONA}\n\n${activeOverlay}`;

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
    moduleId: 'forge',
    systemPrompt,
    encryptionKey
  });

  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText && profile?.onboardingComplete) {
      setMessages([
        {
          role: 'assistant',
          content:
            `Execution link active. I am ${agentAlias}. ` +
            `Describe the code operation and I will generate a safe, staged execution plan.`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, profile?.onboardingComplete, setMessages, agentAlias]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pushSession = useCallback(
    (session: ForgeExecutionRecord) => {
      const current = profileRef.current;
      if (!current) return;
      const next: ForgeProfile = {
        ...current,
        sessions: [session, ...current.sessions].slice(0, 300),
        commandQueue:
          session.result === 'queued' || session.result === 'running'
            ? [session.command, ...current.commandQueue].slice(0, 100)
            : current.commandQueue.filter((queued) => queued !== session.command),
        updatedAt: new Date().toISOString()
      };
      saveForgeProfile(next, { userId: user?.uid, encryptionKey }).catch((saveError) => {
        console.error('Failed to persist forge session:', saveError);
      });
    },
    [user?.uid, encryptionKey]
  );

  const updateSession = useCallback(
    (sessionId: string, patch: Partial<ForgeExecutionRecord>) => {
      const current = profileRef.current;
      if (!current) return;
      const nextSessions = current.sessions.map((entry) =>
        entry.id === sessionId
          ? {
              ...entry,
              ...patch
            }
          : entry
      );
      const next: ForgeProfile = {
        ...current,
        sessions: nextSessions,
        commandQueue: patch.result && patch.result !== 'running'
          ? current.commandQueue.filter((queued) => queued !== (patch.command ?? nextSessions.find((entry) => entry.id === sessionId)?.command ?? ''))
          : current.commandQueue,
        updatedAt: new Date().toISOString()
      };
      saveForgeProfile(next, { userId: user?.uid, encryptionKey }).catch((saveError) => {
        console.error('Failed to persist forge session update:', saveError);
      });
    },
    [user?.uid, encryptionKey]
  );

  const runCloudExecution = useCallback(
    async ({ code, language, source }: { code: string; language: string; source?: 'editor' | 'action' }) => {
      const trimmed = code.trim();
      if (!trimmed) {
        if (source === 'editor') {
          setEditorStatus('error');
          setEditorOutput('No code provided.');
        }
        return;
      }

      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const commandLabel = `forge:${language}`;
      pushSession({
        id: sessionId,
        command: commandLabel,
        result: 'running',
        outputSummary: 'Cloud execution started.',
        createdAt: now
      });

      if (source === 'editor') {
        setEditorStatus('running');
        setEditorOutput('');
      }

      try {
        const response = await ForgeCloudExecutionService.executeCode(trimmed, language);
        const outputText = formatExecutionOutput(response);
        const errorLog =
          response.status === 'error'
            ? response.logs?.length
              ? response.logs
              : response.error
              ? [response.error]
              : outputText
              ? [outputText]
              : undefined
            : undefined;
        updateSession(sessionId, {
          result: response.status === 'success' ? 'success' : 'error',
          outputSummary: outputText.slice(0, 200) || response.error || response.result || 'Execution complete.',
          errorLog
        });
        if (source === 'editor') {
          setEditorStatus(response.status === 'success' ? 'success' : 'error');
          setEditorOutput(outputText || response.error || 'No output.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloud execution failed.';
        updateSession(sessionId, {
          result: 'error',
          outputSummary: message,
          errorLog: [message]
        });
        if (source === 'editor') {
          setEditorStatus('error');
          setEditorOutput(message);
        }
      }
    },
    [pushSession, updateSession]
  );

  const handleRunEditor = useCallback(() => {
    runCloudExecution({ code: editorCode, language: editorLanguage, source: 'editor' });
  }, [editorCode, editorLanguage, runCloudExecution]);

  const handleClearEditor = useCallback(() => {
    setEditorCode('');
    setEditorOutput('');
    setEditorStatus('idle');
  }, []);

  /** Switch AI mode: update local state and append a context message to the conversation. */
  const handleModeSwitch = useCallback(
    (mode: ForgeMode) => {
      if (mode === selectedMode) return;
      setSelectedMode(mode);
      const modeConfig = FORGE_MODES.find((m) => m.id === mode);
      if (modeConfig) {
        handleSendMessage(modeConfig.switchPrompt);
      }
    },
    [selectedMode, handleSendMessage]
  );

  /** Called by dashboard mode-intro cards: send a starter prompt + switch mode. */
  const handleModeSelect = useCallback(
    (prompt: string) => {
      handleSendMessage(prompt);
    },
    [handleSendMessage]
  );

  /** Mode pill selector — rendered inside the NexusChat header via headerActions. */
  const modePillSelector = (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.045] border border-white/[0.12]">
      {FORGE_MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = selectedMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => handleModeSwitch(mode.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-150',
              isActive
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.045]'
            )}
          >
            <Icon className="w-3 h-3" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {isMobile && (
        <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 border-b border-white/[0.12] bg-black/60 backdrop-blur-xl">
          <NeuralButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowDashboard((v) => !v)}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60 h-auto"
          >
            {showDashboard ? 'Hide Dashboard' : 'Show Dashboard'}
          </NeuralButton>
          <div className="min-w-0 overflow-x-auto no-scrollbar">{modePillSelector}</div>
        </div>
      )}
      <div
        className={cn(
          'w-full md:w-1/2 lg:w-[40%] max-h-[50vh] md:h-full md:max-h-none border-b md:border-b-0 md:border-r border-white/[0.09] overflow-y-auto no-scrollbar',
          isMobile && !showDashboard && 'hidden'
        )}
      >
          <ForgeDashboard soul={globalSoul} profile={profile} isLocked={isLocked} onModeSelect={handleModeSelect} />
          <div className="px-8 pb-8">
            <div className="rounded-[28px] border border-white/[0.12] bg-white/[0.045] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-rose-300 font-black">Code Editor</p>
                  <p className="text-xs text-white/50">Cloud execution only</p>
                </div>
                <NeuralSelectMenu
                  value={editorLanguage}
                  options={[{ value: 'javascript', label: 'JavaScript' }]}
                  onChange={(next) => setEditorLanguage(next)}
                  triggerClassName="w-auto h-8 px-2.5 text-[11px] uppercase tracking-[0.2em] text-white/70"
                  minWidthClassName=""
                  ariaLabel="Editor language"
                />
              </div>

              {isMobile && (
                <NeuralButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowEditor((v) => !v)}
                  className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60 h-auto"
                >
                  {showEditor ? 'Collapse Editor' : 'Expand Editor'}
                </NeuralButton>
              )}
              {(!isMobile || showEditor) && (
                <NeuralTextarea
                  value={editorCode}
                  onChange={(event) => setEditorCode(event.target.value)}
                  placeholder="Write a JavaScript snippet to execute in Forge cloud..."
                  variant="mono"
                  className="min-h-[180px] p-4 focus:border-rose-500/40"
                />
              )}

              <div className="flex items-center justify-between gap-4">
                <span
                  className={cn(
                    'text-[11px] uppercase tracking-[0.3em] font-black',
                    editorStatus === 'running'
                      ? 'text-amber-300'
                      : editorStatus === 'success'
                      ? 'text-emerald-300'
                      : editorStatus === 'error'
                      ? 'text-rose-300'
                      : 'text-white/40'
                  )}
                >
                  {editorStatus === 'running'
                    ? 'RUNNING'
                    : editorStatus === 'success'
                    ? 'SUCCESS'
                    : editorStatus === 'error'
                    ? 'ERROR'
                    : 'IDLE'}
                </span>
                <div className="flex items-center gap-2">
                  <NeuralButton size="sm" variant="secondary" onClick={handleClearEditor}>
                    Clear
                  </NeuralButton>
                  <NeuralButton size="sm" onClick={handleRunEditor} disabled={editorStatus === 'running'}>
                    Run
                  </NeuralButton>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.12] bg-slate-900/80 p-4 text-xs text-white/70 font-mono whitespace-pre-wrap min-h-[60px] md:min-h-[120px]">
                {editorOutput || 'Output will appear here.'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <NexusChat
            moduleId="forge"
            ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
            agentName={agentAlias}
            themeColor="cyan"
            placeholder="Describe the implementation task, repository target, or command sequence..."
            headerActions={isMobile ? undefined : modePillSelector}
          />
        </div>
      </div>
  );
}

export default function ForgePage() {
  return (
    <UnifiedModulePage<ForgeProfile>
      moduleId="forge"
      requireVault={false}
      profileOptions={{
        loadProfile: loadForgeProfile,
        saveProfile: saveForgeProfile,
        subscribeProfile: subscribeForgeProfile,
        refreshProfile: loadForgeProfile,
        syncGuestProfile: syncGuestForgeProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <ForgeOnboarding
          initialProfile={profile}
          onComplete={onComplete}
        />
      )}
      renderContent={ForgeContent}
    />
  );
}
