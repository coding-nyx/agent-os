import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type { Message } from '@/lib/ai-adapters/engine-types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';
import { OrchestrationRolloutService } from './orchestration-rollout-service';
import { AraRoutingServiceJs } from '@cortex-logic';

type SendMessageFn = (content: string, context: { systemPrompt: string; insights: string[]; summary: string; history: Message[] }) => Promise<{ response: StructuredResponse }>;

export interface RoutingDecision {
  target: ModuleId;
  confidence: number;
  reason: string;
}

// KMP routing singleton — stateless, cheap to instantiate. Null when KMP build is behind.
const _routing = AraRoutingServiceJs ? new AraRoutingServiceJs() : null;

const FALLBACK_ROUTER_PROMPT = 'Route the user message to the most relevant module. Reply with JSON: {"moduleId":"<module>","confidence":0.9,"rationale":"<reason>"}.';


function parseKmpDecision(json: string): RoutingDecision | null {
  if (!json) return null;
  try {
    const d = JSON.parse(json) as { moduleId: string; confidence: number; rationale: string };
    if (!d.moduleId || !(d.moduleId in MODULE_MANIFEST)) return null;
    return {
      target: d.moduleId as ModuleId,
      confidence: typeof d.confidence === 'number' ? d.confidence : 0.5,
      reason: d.rationale ?? 'kmp_router',
    };
  } catch {
    return null;
  }
}

export const AraRoutingService = {
  classifyIntentFromParsedCommand(parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision | null {
    if (!_routing) return null;
    if (!AutonomyFeatureFlags.isEnabled('parsedCommandRouting')) return null;
    const json = _routing.classifyIntentFromParsedCommand(
      parsedCommand ? JSON.stringify(parsedCommand) : null
    );
    return parseKmpDecision(json);
  },

  classifyIntent(message: string, parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision {
    const cacheKey = [
      message.trim().toLowerCase(),
      parsedCommand?.parserVersion ?? 'no-parser',
      parsedCommand?.mentions?.map((m) => `${m.moduleId}:${m.disposition}:${m.confidence}`).join(',') ?? 'no-mentions',
      parsedCommand?.sharedRouteHints.map((h) => `${h.moduleId}:${h.confidence}:${h.reason}`).join(',') ?? 'no-hints',
      parsedCommand?.intents.map((i) => `${i.intentType}:${i.capabilities.join('+')}`).join(',') ?? 'no-intents',
    ].join('|');

    const decision: RoutingDecision = OrchestrationCacheService.remember('routing-decision', cacheKey, () => {
      const parsedDecision = this.classifyIntentFromParsedCommand(parsedCommand);
      if (parsedDecision) return parsedDecision;

      if (!_routing) return { target: 'ara' as ModuleId, confidence: 0.45, reason: 'default_ara' };
      const json = _routing.classifyIntentWithContext(
        message,
        parsedCommand ? JSON.stringify(parsedCommand) : null
      );
      return parseKmpDecision(json) ?? { target: 'ara' as ModuleId, confidence: 0.45, reason: 'default_ara' };
    });

    OrchestrationRolloutService.recordRoutingDecision(decision);
    return decision;
  },

  async classifyIntentWithLLM(message: string, sendMessage: SendMessageFn): Promise<RoutingDecision> {
    try {
      const { response } = await sendMessage(message, {
        systemPrompt: _routing ? _routing.buildRouterPrompt() : FALLBACK_ROUTER_PROMPT,
        insights: [],
        summary: 'Ara routing classification.',
        history: []
      });
      const parsed = _routing ? parseKmpDecision(_routing.parseRoutingResponse(response.fullText)) : parseKmpDecision(response.fullText);
      if (parsed) return parsed;
    } catch (e) {
      console.warn('Ara LLM routing failed, falling back to keyword routing.', e);
    }
    return AraRoutingService.classifyIntent(message);
  },

  getRoute(moduleId: ModuleId): string {
    return MODULE_MANIFEST[moduleId].route;
  }
};
