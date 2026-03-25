import type { ConversationContext, StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type { Message } from '@/lib/types';
import type { ModuleId } from '@/lib/module-manifest';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { NSV_READ_PERMISSIONS } from '@/lib/services/nsv-ownership';
import { formatNSVForAtlasPlanner, formatNSVForModulePrompt, normalizeNSV } from '@/lib/services/nsv-service';
import type { SpecialistConsultationArtifact, SpecialistConsultationMode } from '@/lib/contracts/orchestration';
import type { NeuralStateVector } from '@/lib/types';

type SendMessageFn = (
  content: string,
  context: ConversationContext,
) => Promise<{ response: StructuredResponse; updatedHistory: Message[] }>;

export interface SpecialistConsultationInput {
  sourceModuleId: string;
  threadId?: string | null;
  targetModuleId: ModuleId;
  question: string;
  mode: SpecialistConsultationMode;
  requestedAt?: string;
  sendMessage?: SendMessageFn;
  getLatestNSV?: () => Record<string, unknown>;
  userId?: string;
  encryptionKey?: CryptoKey | null;
}

export interface SpecialistConsultationResult {
  artifact: SpecialistConsultationArtifact;
  assistantMessage: string;
}

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function truncateForPrompt(
  value: unknown,
  opts?: {
    maxDepth?: number;
    maxArrayLength?: number;
    maxStringLength?: number;
    maxObjectKeys?: number;
  },
): unknown {
  const maxDepth = opts?.maxDepth ?? 4;
  const maxArrayLength = opts?.maxArrayLength ?? 25;
  const maxStringLength = opts?.maxStringLength ?? 800;
  const maxObjectKeys = opts?.maxObjectKeys ?? 30;

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      if (typeof v === 'string') return v.slice(0, Math.max(0, maxStringLength - 3)) + '...';
      return '[truncated]';
    }

    if (typeof v === 'string') {
      if (v.length <= maxStringLength) return v;
      return v.slice(0, Math.max(0, maxStringLength - 3)).trim() + '...';
    }

    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v === null || v === undefined) return v;

    if (Array.isArray(v)) {
      return v.slice(0, maxArrayLength).map((item) => walk(item, depth + 1));
    }

    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).slice(0, maxObjectKeys);
      const out: Record<string, unknown> = {};
      for (const key of keys) out[key] = walk(obj[key], depth + 1);
      return out;
    }

    return String(v);
  };

  return walk(value, 0);
}

async function loadPersistedModuleData(
  targetModuleId: ModuleId,
  userId: string,
  encryptionKey: CryptoKey,
): Promise<unknown> {
  switch (targetModuleId) {
    case 'agnes': {
      const { loadAgnesProfile } = await import('@/modules/agnes/services/agnes-profile-service');
      return loadAgnesProfile({ userId, encryptionKey });
    }
    case 'titan': {
      const { loadTitanProfile } = await import('@/modules/titan/services/titan-profile-service');
      return loadTitanProfile({ userId, encryptionKey });
    }
    case 'ledger': {
      const { loadLedgerProfile } = await import('@/modules/ledger/services/ledger-intake-service');
      return loadLedgerProfile({ userId, encryptionKey });
    }
    case 'atlas': {
      const { loadAtlasProfile } = await import('@/modules/atlas/services/atlas-profile-service');
      return loadAtlasProfile({ userId, encryptionKey });
    }
    case 'scout': {
      const scoutSvc = await import('@/modules/scout/services/scout-knowledge-service');
      const profile = await scoutSvc.loadScoutProfile({ userId, encryptionKey });
      const nodes = await scoutSvc.loadKnowledgeNodes({ userId, encryptionKey });
      return {
        profile,
        recentKnowledgeNodes: nodes.slice(0, 8).map((node: any) => ({
          id: node.id,
          status: node.status,
          title: node.title,
          updatedAt: node.updatedAt,
          confidence: node.confidence,
          evidenceCount: Array.isArray(node.evidence) ? node.evidence.length : 0,
        })),
      };
    }
    case 'forge': {
      const { loadForgeProfile } = await import('@/modules/forge/services/forge-session-service');
      return loadForgeProfile({ userId, encryptionKey });
    }
    case 'soma':
    default:
      return null;
  }
}

function buildArtifact(
  input: SpecialistConsultationInput,
  overrides: Pick<SpecialistConsultationArtifact, 'status' | 'summary'> &
    Partial<Pick<SpecialistConsultationArtifact, 'responseText' | 'errorMessage' | 'resolvedAt'>>,
): SpecialistConsultationArtifact {
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  return {
    id: `consult.${input.targetModuleId}.${stableHash([input.sourceModuleId, input.targetModuleId, input.mode, input.question, requestedAt].join('|'))}`,
    threadId: input.threadId ?? null,
    sourceModuleId: input.sourceModuleId,
    targetModuleId: input.targetModuleId,
    question: input.question,
    mode: input.mode,
    requestedAt,
    resolvedAt: overrides.resolvedAt ?? requestedAt,
    status: overrides.status,
    summary: overrides.summary,
    responseText: overrides.responseText,
    errorMessage: overrides.errorMessage,
  };
}

export class SpecialistConsultationService {
  static async consult(input: SpecialistConsultationInput): Promise<SpecialistConsultationResult> {
    const requestedAt = input.requestedAt ?? new Date().toISOString();
    const moduleEntry = MODULE_MANIFEST[input.targetModuleId];
    const moduleName = moduleEntry?.alias || input.targetModuleId;

    if (!input.sendMessage) {
      const artifact = buildArtifact({ ...input, requestedAt }, {
        status: 'unavailable',
        summary: `${moduleName} consultation unavailable: no LLM connection.`,
        errorMessage: 'No LLM connection available for specialist consultation.',
      });
      return {
        artifact,
        assistantMessage: `[Module query to ${moduleName} unavailable — no LLM connection]`,
      };
    }

    if (input.mode === 'state_plus_persisted_data' && !input.userId) {
      const artifact = buildArtifact({ ...input, requestedAt }, {
        status: 'unavailable',
        summary: `${moduleName} persisted-data consultation unavailable: authentication required.`,
        errorMessage: 'Authentication required for persisted data consultation.',
      });
      return {
        artifact,
        assistantMessage: '[Module data query unavailable — authenticate to access persisted module data]',
      };
    }

    if (input.mode === 'state_plus_persisted_data' && !input.encryptionKey) {
      const artifact = buildArtifact({ ...input, requestedAt }, {
        status: 'unavailable',
        summary: `${moduleName} persisted-data consultation unavailable: vault unlock required.`,
        errorMessage: 'Vault unlock required for persisted data consultation.',
      });
      return {
        artifact,
        assistantMessage: `[Module data query requires vault unlock — unlock to access ${moduleName} persisted data.]`,
      };
    }

    let nsvContext = '';
    try {
      const rawNSV = input.getLatestNSV?.() as Partial<NeuralStateVector> | undefined;
      if (rawNSV) {
        const nsv = normalizeNSV(rawNSV);
        const nsvBlock = input.targetModuleId === 'atlas'
          ? formatNSVForAtlasPlanner(nsv)
          : formatNSVForModulePrompt(nsv, NSV_READ_PERMISSIONS[input.targetModuleId] ?? []);
        if (nsvBlock) {
          nsvContext = `\n\n[CURRENT NEURAL STATE — use to inform your answer]\n${nsvBlock}`;
        }
      }
    } catch {
      nsvContext = '';
    }

    let moduleDataContext = '';
    if (input.mode === 'state_plus_persisted_data' && input.userId && input.encryptionKey) {
      try {
        const moduleData = await loadPersistedModuleData(input.targetModuleId, input.userId, input.encryptionKey);
        const safeModuleData = truncateForPrompt(moduleData, {
          maxDepth: 4,
          maxArrayLength: 20,
          maxStringLength: 900,
          maxObjectKeys: 35,
        });
        moduleDataContext = safeModuleData
          ? `\n\n[MODULE DATA — use to inform your answer]\n${JSON.stringify(safeModuleData, null, 2)}`
          : '\n\n[MODULE DATA — unavailable for this module]';
      } catch (error) {
        moduleDataContext = '\n\n[MODULE DATA — unavailable for this module]';
        const artifact = buildArtifact({ ...input, requestedAt }, {
          status: 'failed',
          summary: `${moduleName} persisted-data consultation failed before dispatch.`,
          errorMessage: error instanceof Error ? error.message : 'Unknown persisted-data load error.',
        });
        return {
          artifact,
          assistantMessage: `[Module persisted data consultation with ${moduleName} failed — try again or delegate directly]`,
        };
      }
    }

    const consultPrompt =
      input.mode === 'state_plus_persisted_data'
        ? `You are ${moduleName}, a specialist agent in the AGNES neural network. ` +
          `Your domain is: ${moduleEntry?.description || input.targetModuleId}. ` +
          `You will be given (1) the user's current neural state and (2) a bounded excerpt of ${moduleName} persisted module data. ` +
          `Answer the user's question using BOTH sources when relevant. Do not use action tags. Respond in 2-4 sentences. ` +
          `If the module data is missing or insufficient, say so explicitly.` +
          nsvContext +
          moduleDataContext
        : `You are ${moduleName}, a specialist agent in the AGNES neural network. ` +
          `Your domain is: ${moduleEntry?.description || input.targetModuleId}. ` +
          `Answer the following consultation from Nexus concisely and precisely from your domain expertise. ` +
          `Do not use action tags. Respond in 2-4 sentences.` +
          nsvContext;

    try {
      const { response } = await input.sendMessage(input.question, {
        systemPrompt: consultPrompt,
        history: [],
        memoryContext: [],
        summary:
          input.mode === 'state_plus_persisted_data'
            ? `Internal consultation (persisted data) from Nexus to ${moduleName}`
            : `Internal consultation from Nexus to ${moduleName}`,
      });

      const responseText = response.publicText.trim();
      const artifact = buildArtifact({ ...input, requestedAt }, {
        status: 'completed',
        resolvedAt: new Date().toISOString(),
        summary:
          input.mode === 'state_plus_persisted_data'
            ? `${moduleName} returned persisted-data consultation results.`
            : `${moduleName} returned specialist consultation results.`,
        responseText,
      });

      return {
        artifact,
        assistantMessage:
          input.mode === 'state_plus_persisted_data'
            ? `> ### 📊 Specialist Report: ${moduleName} (Persisted Data)\n> ${responseText}`
            : `> ### 📋 Specialist Report: ${moduleName}\n> ${responseText}`,
      };
    } catch (error) {
      const artifact = buildArtifact({ ...input, requestedAt }, {
        status: 'failed',
        resolvedAt: new Date().toISOString(),
        summary: `${moduleName} consultation failed.`,
        errorMessage: error instanceof Error ? error.message : 'Unknown consultation error.',
      });
      return {
        artifact,
        assistantMessage:
          input.mode === 'state_plus_persisted_data'
            ? `> ### ⚠️ Specialist Report: ${moduleName} (Persisted Data) FAILED\n> The consultation could not be completed at this time.`
            : `> ### ⚠️ Specialist Report: ${moduleName} FAILED\n> The consultation could not be completed at this time.`,
      };
    }
  }
}
