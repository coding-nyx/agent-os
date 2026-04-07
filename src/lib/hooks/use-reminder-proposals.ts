import { useCallback, useRef, useState } from 'react';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { ActionHub, type ActionContext } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useAuth } from '@/lib/auth-context';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { ReminderProposal } from '@/lib/notifications/types';

export interface ReminderProposalState {
  proposal: ReminderProposal;
}

export function useReminderProposals(moduleId: string | 'any') {
  const { user, isGuest } = useAuth();
  const [active, setActive] = useState<ReminderProposalState | null>(null);
  const [status, setStatus] = useState<'idle' | 'proposed' | 'confirmed' | 'dismissed'>('idle');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const pendingId = useRef<string | null>(null);

  useSpineEvent('REMINDER_PROPOSED', (event) => {
    const data = event.data as { proposal?: ReminderProposal } | undefined;
    const proposal = data?.proposal;
    if (!proposal) return;
    if (moduleId !== 'any' && proposal.moduleId !== moduleId) return;
    if (pendingId.current === proposal.id) return;
    pendingId.current = proposal.id;
    setActive({ proposal });
    setStatus('proposed');
  });

  const confirm = useCallback(async () => {
    if (!active || !user || isGuest) return;
    setIsConfirming(true);
    try {
      const targetModuleId = moduleId === 'any' ? active.proposal.moduleId : moduleId;
      const ctx: ActionContext = {
        userId: user.uid,
        isGuest: !!isGuest,
        moduleId: targetModuleId,
        payload: { proposalId: active.proposal.id },
        emitSpineEvent: (type, data) => {
          Spine.publish({
            type,
            source: targetModuleId,
            domain: 'system',
            priority: 'info',
            data,
          });
        },
        updateGlobalSoul: async (patch) => {
          if (user?.uid && !isGuest) {
            await GlobalProjectionService.updateCrossFunctionalState(user.uid, patch);
          }
        },
        delegateToModule: () => {},
      };
      await ActionHub.execute(targetModuleId, 'confirm_reminder', ctx);
      setActive(null);
      pendingId.current = null;
      setStatus('confirmed');
    } finally {
      setIsConfirming(false);
    }
  }, [active, isGuest, moduleId, user]);

  const dismiss = useCallback(async () => {
    if (!active) return;
    setIsDismissing(true);
    try {
      const targetModuleId = moduleId === 'any' ? active.proposal.moduleId : moduleId;
      const ctx: ActionContext = {
        userId: user?.uid,
        isGuest: !!isGuest,
        moduleId: targetModuleId,
        payload: { proposalId: active.proposal.id },
        emitSpineEvent: (type, data) => {
          Spine.publish({
            type,
            source: targetModuleId,
            domain: 'system',
            priority: 'info',
            data,
          });
        },
        updateGlobalSoul: async (patch) => {
          if (user?.uid && !isGuest) {
            await GlobalProjectionService.updateCrossFunctionalState(user.uid, patch);
          }
        },
        delegateToModule: () => {},
      };
      await ActionHub.execute(targetModuleId, 'dismiss_reminder', ctx);
      setActive(null);
      pendingId.current = null;
      setStatus('dismissed');
    } finally {
      setIsDismissing(false);
    }
  }, [active, isGuest, moduleId, user?.uid]);

  const resetStatus = useCallback(() => {
    setStatus('idle');
  }, []);

  return { activeProposal: active?.proposal ?? null, status, confirm, dismiss, isConfirming, isDismissing, resetStatus };
}
