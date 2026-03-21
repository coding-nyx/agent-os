import React from 'react';
import { CycleManager } from '../components/CycleManager';
import type { CycleEntry } from '@/lib/types';

export interface CyclesTabProps {
  cycles: CycleEntry[];
  directWriteMode: boolean;
  onSubmitForApproval: (prompt: string) => void;
  onDirectCreate: (cycle: CycleEntry) => Promise<void>;
  onDirectDelete: (cycleId: string) => Promise<void>;
}

export function CyclesTab({
  cycles,
  directWriteMode,
  onSubmitForApproval,
  onDirectCreate,
  onDirectDelete,
}: CyclesTabProps) {
  return (
    <div className="px-4 sm:px-6 md:px-8 pb-5 sm:pb-6 md:pb-8 pt-4 sm:pt-5">
      <CycleManager
        cycles={cycles}
        onSubmitForApproval={onSubmitForApproval}
        directWriteMode={directWriteMode}
        onDirectCreate={onDirectCreate}
        onDirectDelete={onDirectDelete}
      />
    </div>
  );
}
