import React from 'react';
import { SomaSnapshotWidget } from './SomaSnapshotWidget';

interface ClearanceWidgetProps {
  clearanceStatus?: 'granted' | 'pending' | 'conditional' | 'denied' | null;
  lastBiomarkerDate?: string | null;
  className?: string;
  activeDebtCount?: number;
  enforcementMessage?: string | null;
}

/**
 * Composite widget that renders SomaSnapshotWidget with clearance status inline.
 */
export function ClearanceWidget({
  clearanceStatus,
  lastBiomarkerDate,
  className,
  activeDebtCount = 0,
}: ClearanceWidgetProps) {
  return (
    <div className={className}>
      <SomaSnapshotWidget
        clearanceStatus={clearanceStatus ?? null}
        lastBiomarkerDate={lastBiomarkerDate ?? null}
        activeDebtCount={activeDebtCount}
      />
    </div>
  );
}
