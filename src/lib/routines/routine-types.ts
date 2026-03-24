import type { Recurrence } from '@/lib/notifications/types';
import type { SpineEventType } from '@/lib/types';
import type { ModuleId } from '@/lib/module-manifest';

export type RoutineTrigger =
  | {
      type: 'spine_event';
      spineEventType: SpineEventType;
    }
  | {
      type: 'notification';
    }
  | {
      type: 'action';
      actionType: string;
    };

export interface RoutineDefinition {
  id: string;
  name: string;
  description?: string;
  moduleId: ModuleId;
  recurrence: Recurrence;
  timezone: string;
  category?: string;
  tags?: string[];
  trigger: RoutineTrigger;
  enabled: boolean;
  createdBy: 'user' | 'agent';
  createdAt: string;
  updatedAt: string;
  lastFiredAt?: string;
}

export interface RoutineProposal {
  id: string;
  routine: RoutineDefinition;
  createdBy: 'agent';
  source?: {
    moduleId: ModuleId;
    context?: string;
  };
}
