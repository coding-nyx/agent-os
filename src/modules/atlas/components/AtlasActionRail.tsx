import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';

interface AtlasActionRailProps {
  quickAddAction: ReactNode;
  onOpenNexus?: () => void;
}

export function AtlasActionRail({
  quickAddAction,
  onOpenNexus = () => window.dispatchEvent(new Event('open-nexus')),
}: AtlasActionRailProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <NeuralButton
        onClick={onOpenNexus}
        aria-label="Open Nexus"
        themeColor="indigo"
        className="z-[var(--z-fab)] rounded-full w-12 h-12 shadow-lg shadow-indigo-500/25 p-0"
      >
        <Sparkles className="w-5 h-5" aria-hidden="true" />
      </NeuralButton>

      {quickAddAction}
    </div>
  );
}
