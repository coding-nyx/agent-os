import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NexusChat } from '@/core/components/NexusChat';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { cn } from '@/lib/utils';
import { FORGE_PERSONA } from './personas';
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
  const [editorCode, setEditorCode] = useState('// Forge cloud runner\\nconsole.log(\"Forge online\");');
  const [editorStatus, setEditorStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [editorOutput, setEditorOutput] = useState('');

  const { messages, setMessages, isProcessing, streamingText, error, quota, handleSendMessage } = useModuleAI({
    moduleId: 'forge',
    systemPrompt: FORGE_PERSONA,
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
      saveForgeProfile(next, { userId: user?.uid }).catch((saveError) => {
        console.error('Failed to persist forge session:', saveError);
      });
    },
    [user?.uid]
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
      saveForgeProfile(next, { userId: user?.uid }).catch((saveError) => {
        console.error('Failed to persist forge session update:', saveError);
      });
    },
    [user?.uid]
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

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto no-scrollbar">
          <ForgeDashboard soul={globalSoul} profile={profile} isLocked={isLocked} />
          <div className="px-8 pb-8">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-rose-300 font-black">Code Editor</p>
                  <p className="text-xs text-white/50">Cloud execution only</p>
                </div>
                <select
                  value={editorLanguage}
                  onChange={(event) => setEditorLanguage(event.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/70"
                >
                  <option value="javascript">JavaScript</option>
                </select>
              </div>

              <textarea
                value={editorCode}
                onChange={(event) => setEditorCode(event.target.value)}
                placeholder="Write a JavaScript snippet to execute in Forge cloud..."
                className="w-full min-h-[180px] rounded-2xl border border-white/10 bg-black/50 text-xs text-white/80 font-mono p-4 focus:outline-none focus:border-rose-500/40"
              />

              <div className="flex items-center justify-between gap-4">
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-[0.3em] font-black',
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

              <div className="rounded-2xl border border-white/10 bg-black/50 p-4 text-xs text-white/70 font-mono whitespace-pre-wrap min-h-[120px]">
                {editorOutput || 'Output will appear here.'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 h-1/2 md:h-full overflow-hidden">
          <NexusChat
            moduleId="forge"
            ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
            agentName={agentAlias}
            themeColor="cyan"
            placeholder="Describe the implementation task, repository target, or command sequence..."
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
        loadProfile: (params) => loadForgeProfile({ userId: params.userId }),
        subscribeProfile: (params, onUpdate) => subscribeForgeProfile({ userId: params.userId }, onUpdate),
        refreshProfile: (params) => loadForgeProfile({ userId: params.userId }),
        syncGuestProfile: (params) => syncGuestForgeProfileToUser({ userId: params.userId })
      }}
      renderContent={ForgeContent}
    />
  );
}
