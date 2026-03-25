import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ForgeCloudExecutionService } from './forge-cloud-execution';
import {
  ForgeArtifact,
  ForgeExecutionRecord,
  ForgeProfile,
  loadForgeProfile,
  saveForgeProfile,
  saveArtifact
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

  ActionHub.registerProvider('forge', {
    capabilities: ['technical-work'],
    latencyTier: 'heavy',
  });

  ActionHub.registerMultiple('forge', {
    create_technical_task: ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload?.target === 'string' ? payload.target : moduleId,
        domain: 'system',
        data: payload,
        cascadeDepth: 0,
        priority: 'info',
      });
    },

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
        result: 'error',
        outputSummary: 'Direct file reading is disabled in this environment.',
        errorLog: ['Direct file reading is disabled in this environment. Use code execution instead.'],
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
        result: 'error',
        outputSummary: 'Direct file writing is disabled in this environment.',
        errorLog: ['Direct file writing is disabled in this environment. Use code execution instead.'],
        createdAt: new Date().toISOString()
      };
      const next: ForgeProfile = {
        ...profile,
        sessions: [session, ...profile.sessions].slice(0, 300)
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    // ── COMMS ACTIONS ─────────────────────────────────────────────────────────

    draft_email: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const to = typeof payload?.to === 'string' ? payload.to : '';
      const subject = typeof payload?.subject === 'string' ? payload.subject : '(no subject)';
      const body = typeof payload?.body === 'string' ? payload.body : '';
      const tone = typeof payload?.tone === 'string' ? payload.tone : 'formal';

      const artifactContent = `To: ${to}\nSubject: ${subject}\nTone: ${tone}\n\n${body}`;
      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'email',
        title: subject || 'Draft Email',
        content: artifactContent,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      const formatted = [
        `**Draft Email — Saved to Artifacts**`,
        ``,
        `**To:** ${to || '(recipient)'}`,
        `**Subject:** ${subject}`,
        `**Tone:** ${tone}`,
        ``,
        `---`,
        ``,
        body,
        ``,
        `---`,
        `*This draft has been saved to your Forge artifacts. Review and send when ready.*`
      ].join('\n');

      pushAssistantMessage?.(formatted);
    },

    suggest_reply: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const draft = typeof payload?.draftReply === 'string' ? payload.draftReply : '';
      const threadSummary = typeof payload?.threadSummary === 'string' ? payload.threadSummary : '';
      const toneAdjustment = typeof payload?.toneAdjustment === 'string' ? payload.toneAdjustment : '';

      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'email',
        title: 'Suggested Reply',
        content: draft,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      const formatted = [
        `**Suggested Reply — Saved to Artifacts**`,
        ``,
        ...(threadSummary ? [`**Context:** ${threadSummary}`, ``] : []),
        `---`,
        ``,
        draft,
        ``,
        `---`,
        ...(toneAdjustment ? [`*Tone note: ${toneAdjustment}*`, ``] : []),
        `*Draft saved to Forge artifacts. Edit and send when ready.*`
      ].join('\n');

      pushAssistantMessage?.(formatted);
    },

    summarize_thread: async ({ payload, pushAssistantMessage }) => {
      const keyPoints = Array.isArray(payload?.keyPoints) ? (payload.keyPoints as string[]) : [];
      const actionItems = Array.isArray(payload?.actionItems) ? (payload.actionItems as string[]) : [];
      const urgency = typeof payload?.urgency === 'string' ? payload.urgency : 'normal';

      const formatted = [
        `**Thread Summary**`,
        `**Urgency:** ${urgency.toUpperCase()}`,
        ``,
        keyPoints.length > 0 ? `**Key Points:**\n${keyPoints.map((p) => `- ${p}`).join('\n')}` : '',
        ``,
        actionItems.length > 0 ? `**Action Items:**\n${actionItems.map((item) => `- [ ] ${item}`).join('\n')}` : ''
      ].filter(Boolean).join('\n');

      pushAssistantMessage?.(formatted);
    },

    // ── DOCS ACTIONS ──────────────────────────────────────────────────────────

    create_document: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const title = typeof payload?.title === 'string' ? payload.title : 'Untitled Document';
      const docType = typeof payload?.type === 'string' ? payload.type : 'document';
      const audience = typeof payload?.audience === 'string' ? payload.audience : '';
      const sections = Array.isArray(payload?.sections)
        ? (payload.sections as Array<{ title: string; content: string }>)
        : [];

      const contentLines: string[] = [`# ${title}`, ''];
      if (audience) contentLines.push(`*Audience: ${audience}*`, '');
      for (const section of sections) {
        if (section.title) contentLines.push(`## ${section.title}`, '');
        if (section.content) contentLines.push(section.content, '');
      }
      const fullContent = contentLines.join('\n');

      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'document',
        title,
        content: fullContent,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      pushAssistantMessage?.([
        `**Document Created — Saved to Artifacts**`,
        `**Title:** ${title}  |  **Type:** ${docType}`,
        ``,
        `---`,
        ``,
        fullContent,
        ``,
        `---`,
        `*Saved to Forge artifacts. Use edit_section to refine any section.*`
      ].join('\n'));
    },

    edit_section: async ({ payload, pushAssistantMessage }) => {
      const sectionTitle = typeof payload?.sectionTitle === 'string' ? payload.sectionTitle : '';
      const newContent = typeof payload?.newContent === 'string' ? payload.newContent : '';
      const editType = typeof payload?.editType === 'string' ? payload.editType : 'rewrite';
      const reason = typeof payload?.reason === 'string' ? payload.reason : '';

      pushAssistantMessage?.([
        `**Section Edit Proposal — ${editType.toUpperCase()}**`,
        `**Section:** ${sectionTitle}`,
        ...(reason ? [`**Reason:** ${reason}`] : []),
        ``,
        `---`,
        ``,
        newContent,
        ``,
        `---`,
        `*Review the edit above. Apply it to your document when satisfied.*`
      ].join('\n'));
    },

    // ── LIFE ACTIONS ──────────────────────────────────────────────────────────

    create_checklist: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const title = typeof payload?.title === 'string' ? payload.title : 'Checklist';
      const items = Array.isArray(payload?.items)
        ? (payload.items as Array<{ task: string; priority?: number; category?: string }>)
        : [];
      const dueDate = typeof payload?.dueDate === 'string' ? payload.dueDate : '';

      const contentLines = [`# ${title}`, ''];
      if (dueDate) {
        const d = new Date(dueDate);
        contentLines.push(`*Due: ${isNaN(d.getTime()) ? dueDate : d.toLocaleDateString()}*`, '');
      }
      for (const item of items) {
        const categoryTag = item.category ? ` [${item.category}]` : '';
        contentLines.push(`- [ ] ${item.task}${categoryTag}`);
      }
      const fullContent = contentLines.join('\n');

      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'checklist',
        title,
        content: fullContent,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      pushAssistantMessage?.([
        `**Checklist: ${title} — Saved to Artifacts**`,
        ``,
        fullContent,
        ``,
        `*${items.length} item${items.length !== 1 ? 's' : ''} saved to Forge artifacts.*`
      ].join('\n'));
    },

    plan_trip: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const destination = typeof payload?.destination === 'string' ? payload.destination : 'Unknown';
      const dates = typeof payload?.dates === 'string' ? payload.dates : '';
      const budget = typeof payload?.budget === 'string' ? payload.budget : '';
      const notes = typeof payload?.notes === 'string' ? payload.notes : '';
      const checklist = Array.isArray(payload?.checklist)
        ? (payload.checklist as Array<{ task: string; category?: string }>)
        : [];

      const contentLines = [`# Trip Plan: ${destination}`, ''];
      if (dates) contentLines.push(`**Dates:** ${dates}`, '');
      if (budget) contentLines.push(`**Budget:** ${budget}`, '');
      if (notes) contentLines.push(``, `**Notes:** ${notes}`);
      if (checklist.length > 0) {
        contentLines.push('', '## Checklist');
        for (const item of checklist) {
          const catTag = item.category ? ` [${item.category}]` : '';
          contentLines.push(`- [ ] ${item.task}${catTag}`);
        }
      }

      const fullContent = contentLines.join('\n');
      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'plan',
        title: `Trip Plan: ${destination}`,
        content: fullContent,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      pushAssistantMessage?.([
        `**Trip Plan: ${destination} — Saved to Artifacts**`,
        ``,
        fullContent
      ].join('\n'));
    },

    budget_event: async ({ userId, payload, encryptionKey, pushAssistantMessage }) => {
      const event = typeof payload?.event === 'string' ? payload.event : 'Event';
      const items = Array.isArray(payload?.items)
        ? (payload.items as Array<{ name: string; cost: number }>)
        : [];
      const contingency = typeof payload?.contingency === 'number' ? payload.contingency : 0.12;
      const subtotal = items.reduce((sum, item) => sum + (item.cost || 0), 0);
      const totalWithContingency = typeof payload?.totalWithContingency === 'number'
        ? payload.totalWithContingency
        : subtotal * (1 + contingency);

      const contentLines = [`# Budget: ${event}`, ''];
      for (const item of items) {
        contentLines.push(`- ${item.name}: $${(item.cost || 0).toFixed(2)}`);
      }
      contentLines.push(
        `- Contingency (${Math.round(contingency * 100)}%): $${(totalWithContingency - subtotal).toFixed(2)}`,
        '',
        `**Total: $${totalWithContingency.toFixed(2)}**`
      );

      const fullContent = contentLines.join('\n');
      const artifact: ForgeArtifact = {
        id: crypto.randomUUID(),
        type: 'plan',
        title: `Budget: ${event}`,
        content: fullContent,
        createdAt: new Date().toISOString()
      };

      await saveArtifact(artifact, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });

      pushAssistantMessage?.([
        `**Event Budget: ${event} — Saved to Artifacts**`,
        ``,
        fullContent
      ].join('\n'));
    }
  });
}
