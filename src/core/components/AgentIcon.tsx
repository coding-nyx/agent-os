import type { ModuleId } from '@/lib/module-manifest';
import { resolveConversationalActorIdentity } from '@/lib/agent-identity';
import { cn } from '@/lib/utils';
import { ModuleIcon } from './ModuleIcon';

interface AgentIconProps {
  moduleId?: ModuleId | 'nexus' | null;
  source?: ModuleId | 'nexus' | 'user' | 'system' | null;
  actorId?: string;
  actorLabel?: string;
  actorShortLabel?: string;
  fallbackLabel?: string;
  className?: string;
  withBackground?: boolean;
}

export function AgentIcon({
  moduleId,
  source,
  actorId,
  actorLabel,
  actorShortLabel,
  fallbackLabel,
  className,
  withBackground = true,
}: AgentIconProps) {
  const identity = resolveConversationalActorIdentity({
    moduleId,
    source,
    actorId,
    actorLabel,
    actorShortLabel,
    fallbackLabel,
  });
  const iconSource = source ?? moduleId ?? identity.moduleId ?? 'system';

  return (
    <div
      role="img"
      aria-label={`${identity.label} icon`}
      title={identity.label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase tracking-[0.14em]',
        withBackground ? identity.toneClassName : 'border-transparent bg-transparent text-white/80',
        className,
      )}
    >
      <ModuleIcon source={iconSource} className="h-[60%] w-[60%]" />
    </div>
  );
}
