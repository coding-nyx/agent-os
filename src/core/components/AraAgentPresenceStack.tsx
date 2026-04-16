import type { ThreadParticipant } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { resolveConversationalActorIdentity } from '@/lib/agent-identity';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { AgentIcon } from './AgentIcon';
import { cn } from '@/lib/utils';

interface AraAgentPresenceStackProps {
  participants: ThreadParticipant[];
  className?: string;
  maxVisible?: number;
}

function getActiveParticipants(participants: ThreadParticipant[]) {
  return participants.filter((participant) =>
    participant.moduleId !== 'ara' &&
    ['active', 'joined', 'waiting', 'invited'].includes(participant.state),
  );
}

function summarizeInclusionReasons(participants: ThreadParticipant[]) {
  const mentioned = participants.filter((participant) => participant.inclusionReasons?.includes('mentioned')).length;
  const consulted = participants.filter((participant) => participant.inclusionReasons?.includes('consulted')).length;
  const delegated = participants.filter((participant) => participant.inclusionReasons?.includes('delegated')).length;

  return [
    mentioned > 0 ? `${mentioned} mentioned` : null,
    consulted > 0 ? `${consulted} consulted` : null,
    delegated > 0 ? `${delegated} delegated` : null,
  ].filter(Boolean).join(' · ');
}

export function AraAgentPresenceStack({
  participants,
  className,
  maxVisible = 4,
}: AraAgentPresenceStackProps) {
  const chatActorIdentityEnabled = AutonomyFeatureFlags.isEnabled('chatActorIdentity');
  const activeParticipants = getActiveParticipants(participants);
  const visible = activeParticipants.slice(0, maxVisible);
  const overflow = Math.max(0, activeParticipants.length - maxVisible);
  const inclusionSummary = summarizeInclusionReasons(activeParticipants);
  const label = activeParticipants.length > 0
    ? activeParticipants
        .map((participant) => resolveConversationalActorIdentity({
          moduleId: participant.moduleId === 'ara' ? 'ara' : participant.moduleId,
          actorId: chatActorIdentityEnabled ? participant.actorId : undefined,
          actorLabel: chatActorIdentityEnabled ? participant.actorLabel : undefined,
          actorShortLabel: chatActorIdentityEnabled ? participant.actorShortLabel : undefined,
          fallbackLabel: MODULE_MANIFEST[participant.moduleId]?.alias ?? participant.moduleId,
        }).label)
        .join(', ')
    : 'Ara only';

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      aria-label={`Active agents: ${label}`}
      title={label}
    >
      <div className="flex items-center">
        {visible.map((participant, index) => (
          <AgentIcon
            key={`${participant.moduleId}-${index}`}
            moduleId={participant.moduleId === 'ara' ? 'ara' : participant.moduleId}
            actorId={chatActorIdentityEnabled ? participant.actorId : undefined}
            actorLabel={chatActorIdentityEnabled ? participant.actorLabel : undefined}
            actorShortLabel={chatActorIdentityEnabled ? participant.actorShortLabel : undefined}
            withBackground
            className={cn(
              'h-8 w-8 rounded-full border-2 border-[#090b11] shadow-[0_8px_18px_rgba(0,0,0,0.28)]',
              index > 0 && '-ml-3',
            )}
          />
        ))}
        {overflow > 0 ? (
          <span className="-ml-3 inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-[#090b11] bg-white/[0.08] px-2 text-[11px] font-semibold text-white/78 shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            +{overflow}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Agents present</p>
        <p className="truncate text-[12px] font-semibold text-white/88">
          {activeParticipants.length > 0 ? `${activeParticipants.length} active` : 'Ara only'}
        </p>
        {inclusionSummary ? (
          <p className="truncate text-[11px] text-white/52">{inclusionSummary}</p>
        ) : null}
      </div>
    </div>
  );
}
