import React from 'react';
import { NeuralButton } from '../NeuralButton';
import type { ThreadExecutionArtifact } from '@/lib/contracts/orchestration';
import { MODULE_MANIFEST } from '@/lib/module-manifest';

interface ProposalCardProps {
  artifact: ThreadExecutionArtifact;
  onApprove: (artifact: ThreadExecutionArtifact) => void;
  onDismiss: (artifact: ThreadExecutionArtifact) => void;
}

export function ProposalCard({ artifact, onApprove, onDismiss }: ProposalCardProps) {
  const manifest = MODULE_MANIFEST[artifact.sourceModuleId as keyof typeof MODULE_MANIFEST];
  const accentColor = manifest?.colorHex ?? '#8B5CF6';
  const agentName = manifest?.title ?? artifact.sourceModuleId;

  return (
    <div
      className="rounded-lg p-3 my-1 text-sm"
      style={{
        background: `${accentColor}10`,
        border: `1px solid ${accentColor}30`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-white/90 truncate">{artifact.summary}</p>
          <p className="text-white/50 text-xs mt-0.5">
            {agentName} · pending approval
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <NeuralButton
          size="sm"
          variant="primary"
          onClick={() => onApprove(artifact)}
          style={{ borderColor: accentColor, color: accentColor }}
        >
          Approve
        </NeuralButton>
        <NeuralButton
          size="sm"
          variant="ghost"
          onClick={() => onDismiss(artifact)}
        >
          Dismiss
        </NeuralButton>
      </div>
    </div>
  );
}
