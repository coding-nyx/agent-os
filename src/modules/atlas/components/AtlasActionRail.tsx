import type { ReactNode } from 'react';

interface AtlasActionRailProps {
  quickAddAction: ReactNode;
}

export function AtlasActionRail({
  quickAddAction,
}: AtlasActionRailProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {quickAddAction}
    </div>
  );
}
