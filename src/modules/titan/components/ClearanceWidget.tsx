import React from 'react';
import { SomaSnapshotWidget } from './SomaSnapshotWidget';
import { ClearanceBanner } from './ClearanceBanner';

interface ClearanceWidgetProps {
  clearanceStatus?: 'granted' | 'pending' | 'denied' | null;
  lastBiomarkerDate?: string | null;
  className?: string;
}

/**
 * Composite widget that renders SomaSnapshotWidget and, when clearance is denied/pending,
 * ClearanceBanner directly below it. Replaces the two-component pattern used in TrainTab.
 */
export function ClearanceWidget({ clearanceStatus, lastBiomarkerDate, className }: ClearanceWidgetProps) {
  return (
    <>
      <div className={className}>
        <SomaSnapshotWidget
          clearanceStatus={clearanceStatus ?? null}
          lastBiomarkerDate={lastBiomarkerDate ?? null}
        />
      </div>
      <ClearanceBanner
        status={clearanceStatus}
        className="mx-4 sm:mx-6 md:mx-8 mb-3 sm:mb-4"
      />
    </>
  );
}
