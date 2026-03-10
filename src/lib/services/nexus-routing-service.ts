import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { sanitizeJsonPayload } from '@/lib/ai-adapters/sanitize';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type { Message } from '@/lib/ai-adapters/engine-types';

type SendMessageFn = (content: string, context: { systemPrompt: string; insights: string[]; summary: string; history: Message[] }) => Promise<{ response: StructuredResponse }>;
// Each entry has a `weight` per keyword. Compound phrases (multi-word) score higher and
// are checked first so that "workout plan" (weight 2) beats a lone "plan" (weight 1).
const KEYWORD_ROUTES: Array<{ moduleId: ModuleId; keywords: Array<{ term: string; weight: number }> }> = [
  {
    moduleId: 'agnes',
    keywords: [
      { term: 'mental health', weight: 2 },
      { term: 'agnes', weight: 2 },
      { term: 'anxiety', weight: 1 }, { term: 'trauma', weight: 1 }, { term: 'emotion', weight: 1 },
      { term: 'feeling', weight: 1 }, { term: 'relationship', weight: 1 }, { term: 'depression', weight: 1 },
      { term: 'therapy', weight: 1 }
    ]
  },
  {
    moduleId: 'titan',
    keywords: [
      // Compound phrases first — these disambiguate "plan" in a fitness context
      { term: 'workout plan', weight: 2 }, { term: 'training plan', weight: 2 },
      { term: 'fitness plan', weight: 2 }, { term: 'exercise plan', weight: 2 },
      { term: 'personal record', weight: 2 },
      { term: 'titan', weight: 2 },
      { term: 'workout', weight: 1 }, { term: 'training', weight: 1 }, { term: 'gym', weight: 1 },
      { term: 'strength', weight: 1 }, { term: 'routine', weight: 1 }, { term: 'fatigue', weight: 1 },
      { term: 'lab', weight: 1 }, { term: 'bloodwork', weight: 1 }, { term: 'biomarker', weight: 1 },
      { term: 'hormone', weight: 1 }, { term: 'medical', weight: 1 }, { term: 'clearance', weight: 1 },
      { term: 'recovery', weight: 1 }, { term: 'soma', weight: 1 }, { term: 'fitness', weight: 1 }
    ]
  },
  {
    moduleId: 'ledger',
    keywords: [
      { term: 'ledger', weight: 2 },
      { term: 'budget', weight: 1 }, { term: 'expense', weight: 1 }, { term: 'spending', weight: 1 },
      { term: 'debt', weight: 1 }, { term: 'cashflow', weight: 1 }, { term: 'savings', weight: 1 },
      { term: 'finance', weight: 1 }, { term: 'money', weight: 1 }, { term: 'crypto', weight: 1 },
      { term: 'investment', weight: 1 }
    ]
  },
  {
    moduleId: 'atlas',
    keywords: [
      // Compound phrases that signal scheduling/energy planning
      { term: 'week plan', weight: 2 }, { term: 'weekly plan', weight: 2 },
      { term: 'day plan', weight: 2 }, { term: 'daily plan', weight: 2 },
      { term: 'energy plan', weight: 2 }, { term: 'task load', weight: 2 },
      { term: 'deep work', weight: 2 },
      { term: 'atlas', weight: 2 },
      // "plan" alone defaults to atlas — the cognitive/scheduling domain
      { term: 'plan', weight: 1 }, { term: 'planning', weight: 1 },
      { term: 'schedule', weight: 1 }, { term: 'energy', weight: 1 }, { term: 'focus', weight: 1 },
      { term: 'calendar', weight: 1 }, { term: 'productivity', weight: 1 }
    ]
  },
  {
    moduleId: 'scout',
    keywords: [
      { term: 'topic map', weight: 2 }, { term: 'fact-check', weight: 2 },
      { term: 'scout', weight: 2 },
      { term: 'research', weight: 1 }, { term: 'verify', weight: 1 }, { term: 'evidence', weight: 1 },
      { term: 'sources', weight: 1 }, { term: 'trend', weight: 1 }, { term: 'news', weight: 1 },
      { term: 'interest', weight: 1 }, { term: 'discover', weight: 1 }, { term: 'search', weight: 1 }
    ]
  },
  {
    moduleId: 'forge',
    keywords: [
      { term: 'forge', weight: 2 },
      { term: 'code', weight: 1 }, { term: 'refactor', weight: 1 }, { term: 'build', weight: 1 },
      { term: 'typescript', weight: 1 }, { term: 'bug', weight: 1 }, { term: 'repository', weight: 1 },
      { term: 'github', weight: 1 }, { term: 'programming', weight: 1 }
    ]
  }
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

    // Score every module — highest total weight wins, breaking ties by array order.
    let best: { moduleId: ModuleId; score: number; topTerm: string } | null = null;

    for (const route of KEYWORD_ROUTES) {
      let score = 0;
      let topTerm = '';

      for (const { term, weight } of route.keywords) {
        // Escape regex metacharacters in multi-word phrases (e.g. "fact-check")
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
      // Scale confidence: single low-weight hit → 0.72, multiple/high-weight hits → up to 0.92
      const confidence = Math.min(0.72 + (best.score - 1) * 0.08, 0.92);
      return {
        target: best.moduleId,
        confidence,
        reason: `scored:${best.topTerm}(${best.score})`
      };
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
