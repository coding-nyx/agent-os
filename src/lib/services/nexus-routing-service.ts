import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type { Message } from '@/lib/ai-adapters/engine-types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';
import { OrchestrationRolloutService } from './orchestration-rollout-service';

type SendMessageFn = (content: string, context: { systemPrompt: string; insights: string[]; summary: string; history: Message[] }) => Promise<{ response: StructuredResponse }>;
// Each entry has a `weight` per keyword. Compound phrases (multi-word) score higher and
// are checked first so that "workout plan" (weight 2) beats a lone "plan" (weight 1).
const KEYWORD_ROUTES: Array<{ moduleId: ModuleId; keywords: Array<{ term: string; weight: number }> }> = [
  {
    moduleId: 'soma',
    keywords: [
      { term: 'heart rate variability', weight: 3 }, { term: 'sleep score', weight: 3 },
      { term: 'heart rate', weight: 2 }, { term: 'hrv', weight: 2 },
      { term: 'soma', weight: 2 }, { term: 'recovery', weight: 2 }, 
      { term: 'medical', weight: 2 }, { term: 'clearance', weight: 2 }, { term: 'bloodwork', weight: 2 },
      { term: 'lab results', weight: 2 }, { term: 'lab', weight: 1 },
      { term: 'readiness', weight: 1 }, { term: 'resting', weight: 1 }, 
      { term: 'soreness', weight: 1 }, { term: 'somatic', weight: 1 }, { term: 'biomarker', weight: 1 }
    ]
  },
  {
    moduleId: 'agnes',
    keywords: [
      { term: 'mental health', weight: 2 }, { term: 'agnes', weight: 2 },
      { term: 'anxiety', weight: 1 }, { term: 'trauma', weight: 1 }, { term: 'emotion', weight: 1 },
      { term: 'feeling', weight: 1 }, { term: 'relationship', weight: 1 }, { term: 'depression', weight: 1 },
      { term: 'therapy', weight: 1 }
    ]
  },
  {
    moduleId: 'titan',
    keywords: [
      { term: 'workout plan', weight: 3 }, { term: 'training plan', weight: 3 },
      { term: 'fitness plan', weight: 3 }, { term: 'exercise plan', weight: 3 },
      { term: 'personal record', weight: 2 }, { term: 'titan', weight: 2 },
      { term: 'workout', weight: 2 }, { term: 'training', weight: 2 }, { term: 'gym', weight: 2 },
      { term: 'fitness', weight: 2 }, { term: 'strength', weight: 1 }, { term: 'routine', weight: 1 }, 
      { term: 'fatigue', weight: 1 }
    ]
  },
  {
    moduleId: 'ledger',
    keywords: [
      { term: 'ledger', weight: 2 }, { term: 'budget', weight: 2 }, { term: 'finance', weight: 2 },
      { term: 'money', weight: 2 }, { term: 'expense', weight: 1 }, { term: 'spending', weight: 1 },
      { term: 'debt', weight: 1 }, { term: 'cashflow', weight: 1 }, { term: 'savings', weight: 1 },
      { term: 'crypto', weight: 1 }, { term: 'investment', weight: 1 }
    ]
  },
  {
    moduleId: 'atlas',
    keywords: [
      { term: 'week plan', weight: 2 }, { term: 'weekly plan', weight: 2 },
      { term: 'day plan', weight: 2 }, { term: 'daily plan', weight: 2 },
      { term: 'energy plan', weight: 2 }, { term: 'task load', weight: 2 },
      { term: 'deep work', weight: 2 }, { term: 'atlas', weight: 2 }, { term: 'schedule', weight: 2 },
      { term: 'plan', weight: 1 }, { term: 'planning', weight: 1 },
      { term: 'energy', weight: 1 }, { term: 'focus', weight: 1 },
      { term: 'calendar', weight: 1 }, { term: 'productivity', weight: 1 }
    ]
  },
  {
    moduleId: 'scout',
    keywords: [
      { term: 'topic map', weight: 2 }, { term: 'fact-check', weight: 2 },
      { term: 'scout', weight: 2 }, { term: 'research', weight: 2 }, { term: 'search', weight: 2 },
      { term: 'verify', weight: 1 }, { term: 'evidence', weight: 1 },
      { term: 'sources', weight: 1 }, { term: 'trend', weight: 1 }, { term: 'news', weight: 1 },
      { term: 'interest', weight: 1 }, { term: 'discover', weight: 1 }
    ]
  },
  {
    moduleId: 'forge',
    keywords: [
      { term: 'forge', weight: 2 }, { term: 'code', weight: 2 }, { term: 'refactor', weight: 2 },
      { term: 'build', weight: 1 }, { term: 'typescript', weight: 1 }, { term: 'bug', weight: 1 }, 
      { term: 'repository', weight: 1 }, { term: 'github', weight: 1 }, { term: 'programming', weight: 1 }
    ]
  }
];

export interface RoutingDecision {
  target: ModuleId;
  confidence: number;
  reason: string;
}

function classifyMentionIntent(parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision | null {
  if (!parsedCommand?.mentions || parsedCommand.mentions.length === 0) return null;

  const ownershipMention = parsedCommand.mentions.find((mention) => mention.disposition === 'ownership');
  if (ownershipMention) {
    return {
      target: ownershipMention.moduleId,
      confidence: ownershipMention.confidence,
      reason: `mention:ownership:${ownershipMention.raw.toLowerCase()}`,
    };
  }

  const consultativeMention = parsedCommand.mentions.find((mention) => mention.disposition === 'consultative');
  if (consultativeMention) {
    return {
      target: 'nexus',
      confidence: Math.max(0.72, consultativeMention.confidence),
      reason: `mention:consult:${consultativeMention.moduleId}`,
    };
  }

  const vocativeMention = parsedCommand.mentions.find((mention) => mention.disposition === 'vocative');
  if (!vocativeMention) return null;

  const targetedIntents = parsedCommand.intents.filter((intent) => intent.candidateModules.includes(vocativeMention.moduleId));
  if (targetedIntents.some((intent) => intent.mutatesState)) {
    return {
      target: vocativeMention.moduleId,
      confidence: Math.max(vocativeMention.confidence, parsedCommand.confidence ?? 0.62),
      reason: `mention:vocative-owner:${vocativeMention.moduleId}`,
    };
  }

  return {
    target: 'nexus',
    confidence: Math.max(0.68, vocativeMention.confidence - 0.08),
    reason: `mention:vocative:${vocativeMention.moduleId}`,
  };
}

const ROUTER_PROMPT = `
You are Nexus, the intent router for the Nexus system.
Classify the user's message into the single best target module.
Return ONLY JSON in the format:
{"target":"moduleId","confidence":0.0-1.0,"reason":"short_reason"}

Available modules:
${Object.entries(MODULE_MANIFEST)
  .map(([id, info]) => `- ${id}: ${info.title} (${info.description})`)
  .join('\n')}

Rules:
- Pick exactly one moduleId from the list above.
- If unclear, choose "nexus" with lower confidence.
- Keep reason under 8 words.
`.trim();

function parseRoutingResponse(raw: string): RoutingDecision | null {
  try {
    const parsed = JSON.parse(sanitizeJsonPayload(raw)) as RoutingDecision;
    if (!parsed || typeof parsed.target !== 'string') return null;
    if (!(parsed.target in MODULE_MANIFEST)) return null;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'router_llm';
    return {
      target: parsed.target as ModuleId,
      confidence: Math.min(Math.max(confidence, 0), 1),
      reason
    };
  } catch {
    return null;
  }
}

export const NexusRoutingService = {
  classifyIntentFromParsedCommand(parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision | null {
    if (!AutonomyFeatureFlags.isEnabled('parsedCommandRouting')) return null;
    const mentionDecision = classifyMentionIntent(parsedCommand);
    if (mentionDecision) {
      return mentionDecision;
    }

    const best = parsedCommand?.sharedRouteHints?.[0];
    if (best) {
      return {
        target: best.moduleId,
        confidence: best.confidence,
        reason: `command:${best.reason}`,
      };
    }

    const primaryProvider = AgentRegistryService.resolvePrimaryProvider(
      parsedCommand?.intents.flatMap((intent) => intent.capabilities) ?? [],
      {
        preferredModuleIds: parsedCommand?.intents.flatMap((intent) => intent.candidateModules) ?? [],
      },
    );
    if (!primaryProvider || primaryProvider.moduleId === 'nexus') return null;

    return {
      target: primaryProvider.moduleId,
      confidence: parsedCommand?.confidence ?? 0.62,
      reason: `capability:${primaryProvider.id}`,
    };
  },

  classifyIntent(message: string, parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision {
    const cacheKey = [
      message.trim().toLowerCase(),
      parsedCommand?.parserVersion ?? 'no-parser',
      parsedCommand?.mentions?.map((mention) => `${mention.moduleId}:${mention.disposition}:${mention.confidence}`).join(',') ?? 'no-mentions',
      parsedCommand?.sharedRouteHints.map((hint) => `${hint.moduleId}:${hint.confidence}:${hint.reason}`).join(',') ?? 'no-hints',
      parsedCommand?.intents.map((intent) => `${intent.intentType}:${intent.capabilities.join('+')}`).join(',') ?? 'no-intents',
    ].join('|');

    const decision: RoutingDecision = OrchestrationCacheService.remember('routing-decision', cacheKey, () => {
      const parsedDecision = this.classifyIntentFromParsedCommand(parsedCommand);
      if (parsedDecision) {
        return parsedDecision;
      }

      const normalized = message.toLowerCase();

      let best: { moduleId: ModuleId; score: number; topTerm: string } | null = null;

      for (const route of KEYWORD_ROUTES) {
        let score = 0;
        let topTerm = '';

        for (const { term, weight } of route.keywords) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (regex.test(normalized)) {
            score += weight;
            if (weight > (route.keywords.find(k => k.term === topTerm)?.weight ?? 0)) {
              topTerm = term;
            }
          }
        }

        if (score > 0 && (!best || score > best.score)) {
          best = { moduleId: route.moduleId, score, topTerm };
        }
      }

      if (best) {
        const confidence = Math.min(0.72 + (best.score - 1) * 0.08, 0.92);
        const decision = {
          target: best.moduleId,
          confidence,
          reason: `matched:${best.topTerm}(${best.score})`
        };
        return decision;
      }

      return {
        target: 'nexus',
        confidence: 0.45,
        reason: 'default_nexus'
      };
    });
    OrchestrationRolloutService.recordRoutingDecision(decision);
    return decision;
  },

  async classifyIntentWithLLM(message: string, sendMessage: SendMessageFn): Promise<RoutingDecision> {
    try {
      const { response } = await sendMessage(message, {
        systemPrompt: ROUTER_PROMPT,
        insights: [],
        summary: 'Nexus routing classification.',
        history: []
      });
      const parsed = parseRoutingResponse(response.fullText);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Nexus LLM routing failed, falling back to keyword routing.', e);
    }
    return NexusRoutingService.classifyIntent(message);
  },

  getRoute(moduleId: ModuleId): string {
    return MODULE_MANIFEST[moduleId].route;
  }
};
