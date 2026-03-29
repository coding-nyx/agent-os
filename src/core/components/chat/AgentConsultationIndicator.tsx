import React from 'react';
import { MODULE_MANIFEST } from '@/lib/module-manifest';

interface AgentConsultationIndicatorProps {
  targetModuleId: string;
  disposition?: 'consulting' | 'delegating' | 'acting' | null;
}

const DISPOSITION_LABEL: Record<string, string> = {
  consulting: 'asking',
  delegating: 'delegating to',
  acting: 'acting via',
};

export function AgentConsultationIndicator({ targetModuleId, disposition }: AgentConsultationIndicatorProps) {
  const manifest = MODULE_MANIFEST[targetModuleId as keyof typeof MODULE_MANIFEST];
  const agentName = manifest?.title ?? targetModuleId;
  const accentColor = manifest?.colorHex ?? '#8B5CF6';
  const verb = disposition ? (DISPOSITION_LABEL[disposition] ?? 'consulting') : 'consulting';

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium w-fit"
      style={{
        background: `${accentColor}18`,
        border: `1px solid ${accentColor}40`,
        color: accentColor,
      }}
    >
      <span>
        {verb} {agentName}
      </span>
      <span className="flex gap-0.5">
        <span className="animate-bounce [animation-delay:0ms] w-1 h-1 rounded-full inline-block" style={{ background: accentColor }} />
        <span className="animate-bounce [animation-delay:150ms] w-1 h-1 rounded-full inline-block" style={{ background: accentColor }} />
        <span className="animate-bounce [animation-delay:300ms] w-1 h-1 rounded-full inline-block" style={{ background: accentColor }} />
      </span>
    </div>
  );
}
