import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import type { Message } from '@/lib/ai-adapters/engine-types';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';
import { OrchestrationRolloutService } from './orchestration-rollout-service';
import { NexusRoutingServiceJs } from '@cortex-logic';

type SendMessageFn = (content: string, context: { systemPrompt: string; insights: string[]; summary: string; history: Message[] }) => Promise<{ response: StructuredResponse }>;

export interface RoutingDecision {
  target: ModuleId;
  confidence: number;
  reason: string;
}

// KMP routing singleton — stateless, cheap to instantiate.
const _routing = new NexusRoutingServiceJs();

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

export const NexusRoutingService = {
  classifyIntentFromParsedCommand(parsedCommand?: ParsedCommandEnvelope | null): RoutingDecision | null {
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

      const json = _routing.classifyIntentWithContext(
        message,
        parsedCommand ? JSON.stringify(parsedCommand) : null
      );
      return parseKmpDecision(json) ?? { target: 'nexus' as ModuleId, confidence: 0.45, reason: 'default_nexus' };
    });

    OrchestrationRolloutService.recordRoutingDecision(decision);
    return decision;
  },

  async classifyIntentWithLLM(message: string, sendMessage: SendMessageFn): Promise<RoutingDecision> {
    try {
      const { response } = await sendMessage(message, {
        systemPrompt: _routing.buildRouterPrompt(),
        insights: [],
        summary: 'Nexus routing classification.',
        history: []
      });
      const parsed = parseKmpDecision(_routing.parseRoutingResponse(response.fullText));
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
