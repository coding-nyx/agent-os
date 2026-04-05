import { ActionCapabilityResolverJs } from '@cortex-logic';
import type { AgentCapability } from './agent-capability';

const _service = new ActionCapabilityResolverJs();

export class ActionCapabilityResolver {
  static resolve(actionType: string): AgentCapability[] {
    return _service.resolve(actionType) as AgentCapability[];
  }
}
