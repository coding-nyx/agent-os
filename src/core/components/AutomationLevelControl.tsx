import React from 'react';
import { useOrchestrationStore, DEFAULT_AUTOPILOT_LEVEL } from '@/lib/stores/orchestration-store';
import type { AutopilotLevel } from '@/lib/contracts/orchestration';
import { isAutopilotLevel } from '@/lib/contracts/orchestration';
import type { ModuleId } from '@/lib/module-manifest';

const LEVEL_LABELS: Record<AutopilotLevel, string> = {
  0: 'L0 — Off (manual only)',
  1: 'L1 — Suggest only',
  2: 'L2 — Balanced (default)',
  3: 'L3 — Auto + notify',
  4: 'L4 — Auto + apply',
  5: 'L5 — Full autopilot',
};

interface AutomationLevelControlProps {
  moduleId: ModuleId;
  className?: string;
}

export function AutomationLevelControl({ moduleId, className }: AutomationLevelControlProps) {
  const globalLevel = useOrchestrationStore((s) => s.autopilotLevel);
  const overrides = useOrchestrationStore((s) => s.moduleAutopilotOverrides);
  const setOverride = useOrchestrationStore((s) => s.setModuleAutopilotOverride);

  const currentOverride = overrides[moduleId] ?? null;
  // 'global' sentinel value in the <select> represents "no override"
  const selectValue = currentOverride !== null ? String(currentOverride) : 'global';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'global') {
      setOverride(moduleId, null);
    } else {
      const level = Number(val) as AutopilotLevel;
      if (isAutopilotLevel(level)) setOverride(moduleId, level);
    }
  };

  return (
    <div className={className}>
      <label className="block text-xs text-white/50 mb-1">Automation Level</label>
      <select
        value={selectValue}
        onChange={handleChange}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/30"
      >
        <option value="global">Using global (L{globalLevel})</option>
        {(Object.entries(LEVEL_LABELS) as [string, string][]).map(([level, label]) => (
          <option key={level} value={level}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
