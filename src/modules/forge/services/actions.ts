import { ActionHub } from '@/lib/actions/action-hub';
import { ForgeCloudExecutionService } from './forge-cloud-execution';
import {
  ForgeExecutionRecord,
  ForgeProfile,
  loadForgeProfile,
  saveForgeProfile
} from './forge-session-service';

let registered = false;

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadForgeProfile({ userId, encryptionKey });
}

async function persistProfile(profile: ForgeProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveForgeProfile(profile, { userId, encryptionKey });
}

function formatExecutionOutput(result: { logs?: string[]; result?: string; error?: string }): string {
  if (result.error) return result.error;
  if (Array.isArray(result.logs) && result.logs.length > 0) return result.logs.join('\n');
  return result.result || '';
}

export function registerForgeActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('forge', {
    execute_code: async ({ userId, payload, encryptionKey }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const code = typeof payload?.code === 'string' ? payload.code : '';
      const language = typeof payload?.language === 'string' ? payload.language : 'javascript';
      const commandLabel = `forge:${language}`;
      const sessionId = typeof payload?.id === 'string' ? payload.id : crypto.randomUUID();
      const now = new Date().toISOString();

      if (!code.trim()) {
        const errorSession: ForgeExecutionRecord = {
          id: sessionId,
          command: typeof payload?.command === 'string' ? payload.command : commandLabel,
          result: 'error',
          outputSummary: 'Cloud execution requires code payload.',
          errorLog: ['Cloud execution requires code payload.'],
          createdAt: now
        };
        const next: ForgeProfile = {
          ...profile,
          sessions: [errorSession, ...profile.sessions].slice(0, 300)
        };
        await persistProfile(next, userId ?? null, encryptionKey ?? null);
        return;
      }

      const runningSession: ForgeExecutionRecord = {
        id: sessionId,
        command: commandLabel,
        result: 'running',
        outputSummary: 'Cloud execution started.',
        createdAt: now
      };

      let next: ForgeProfile = {
        ...profile,
        sessions: [runningSession, ...profile.sessions].slice(0, 300)
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      try {
        const response = await ForgeCloudExecutionService.executeCode(code.trim(), language);
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
        const updated: ForgeExecutionRecord = {
          ...runningSession,
          result: response.status === 'success' ? 'success' : 'error',
          outputSummary: outputText.slice(0, 200) || response.error || response.result || 'Execution complete.',
          errorLog
        };
        next = {
          ...next,
          sessions: [updated, ...next.sessions.filter((entry) => entry.id !== sessionId)].slice(0, 300)
        };
        await persistProfile(next, userId ?? null, encryptionKey ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloud execution failed.';
        const updated: ForgeExecutionRecord = {
          ...runningSession,
          result: 'error',
          outputSummary: message,
          errorLog: [message]
        };
        next = {
          ...next,
          sessions: [updated, ...next.sessions.filter((entry) => entry.id !== sessionId)].slice(0, 300)
        };
        await persistProfile(next, userId ?? null, encryptionKey ?? null);
      }
    },

    nexus_link_command: async ({ userId, payload, encryptionKey }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const command = typeof payload?.command === 'string' ? payload.command : 'command';
      const session: ForgeExecutionRecord = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        command,
        result: 'error',
        outputSummary: 'Local daemon disabled. Use cloud execution.',
        errorLog: ['Local daemon disabled. Use cloud execution.'],
        createdAt: new Date().toISOString()
      };
      const next: ForgeProfile = {
        ...profile,
        sessions: [session, ...profile.sessions].slice(0, 300)
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    read_file: async ({ userId, payload, encryptionKey }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const command = `read_file:${typeof payload?.path === 'string' ? payload.path : 'unknown_path'}`;
      const session: ForgeExecutionRecord = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        command,
        result: 'queued',
        outputSummary: typeof payload?.summary === 'string' ? payload.summary : undefined,
        createdAt: new Date().toISOString()
      };
      const next: ForgeProfile = {
        ...profile,
        sessions: [session, ...profile.sessions].slice(0, 300)
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    write_file: async ({ userId, payload, encryptionKey }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const command = `write_file:${typeof payload?.path === 'string' ? payload.path : 'unknown_path'}`;
      const session: ForgeExecutionRecord = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        command,
        result: 'queued',
        outputSummary: typeof payload?.summary === 'string' ? payload.summary : undefined,
        createdAt: new Date().toISOString()
      };
      const next: ForgeProfile = {
        ...profile,
        sessions: [session, ...profile.sessions].slice(0, 300)
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    }
  });
}
