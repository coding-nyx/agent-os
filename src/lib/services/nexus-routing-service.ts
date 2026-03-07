import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { sanitizeJsonPayload } from '@/llm-engine/sanitize';
import { StructuredResponse } from '@/llm-engine/engine/types';
import type { Message } from '@/llm-engine/types';

type SendMessageFn = (content: string, context: { systemPrompt: string; insights: string[]; summary: string; history: Message[] }) => Promise<{ response: StructuredResponse }>;
const KEYWORD_ROUTES: Array<{ moduleId: ModuleId; keywords: string[] }> = [
  { moduleId: 'agnes', keywords: ['agnes', 'anxiety', 'trauma', 'emotion', 'feeling', 'relationship'] },
  { moduleId: 'titan', keywords: ['workout', 'training', 'gym', 'strength', 'routine', 'fatigue', 'pr', 'lab', 'bloodwork', 'biomarker', 'hormone', 'medical', 'clearance', 'recovery', 'soma'] },
  { moduleId: 'ledger', keywords: ['budget', 'expense', 'spending', 'debt', 'cashflow', 'savings', 'finance', 'money'] },
  { moduleId: 'atlas', keywords: ['schedule', 'energy', 'focus', 'task load', 'calendar', 'productivity'] },
  { moduleId: 'scout', keywords: ['research', 'verify', 'fact-check', 'evidence', 'sources', 'trend', 'news', 'interest', 'discover', 'topic map'] },
  { moduleId: 'forge', keywords: ['code', 'refactor', 'build', 'typescript', 'bug', 'repository'] }
];

export interface RoutingDecision {
  target: ModuleId;
  confidence: number;
  reason: string;
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
- If unclear, choose "orchestrator" with lower confidence.
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
  classifyIntent(message: string): RoutingDecision {
    const normalized = message.toLowerCase();

    for (const route of KEYWORD_ROUTES) {
      const matchedKeyword = route.keywords.find((keyword) => normalized.includes(keyword));
      if (matchedKeyword) {
        return {
          target: route.moduleId,
          confidence: 0.72,
          reason: `matched:${matchedKeyword}`
        };
      }
    }

    return {
      target: 'orchestrator',
      confidence: 0.45,
      reason: 'default_orchestrator'
    };
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
