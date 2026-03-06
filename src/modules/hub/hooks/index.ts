import { useMemo } from 'react';
import type { GlobalProjection } from '@/lib/types';
import type { SpineEvent } from '@/lib/types';
import { HUB_MODULE_ORDER, MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { CORE_MODULES, type StatusTone, type ModuleItem, type ModuleStat, type OrchestratorNode } from '../constants';
import * as THREE from 'three';

export function useModuleStats(
  globalSoul: GlobalProjection | null | undefined,
  moduleAccess: Record<string, boolean>
): Record<string, ModuleStat> {
  return useMemo(() => {
    const nsv = globalSoul?.crossFunctionalState;
    const emotionalResilience = nsv?.emotional?.emotionalResilience ?? undefined;
    const cnsFatigue = nsv?.biological?.cnsFatigue ?? undefined;
    const recoveryScore = nsv?.biological?.recoveryScore ?? undefined;
    const sleepQuality = nsv?.biological?.sleepQuality ?? undefined;
    const resonanceROI = nsv?.resource?.resonanceROI ?? undefined;
    const financialFriction = nsv?.resource?.financialFriction ?? undefined;
    const energyBudget = nsv?.cognitive?.energyBudget ?? undefined;
    const researchLoad = nsv?.cognitive?.researchLoad ?? undefined;

    const formatNumber = (value?: number, digits = 1) => {
      if (value === null || value === undefined || Number.isNaN(value)) return '—';
      return value.toFixed(digits);
    };

    const toneFromValue = (value?: number, invert = false): StatusTone => {
      if (value === null || value === undefined || Number.isNaN(value)) return 'neutral';
      const normalized = invert ? 10 - value : value;
      if (normalized >= 7) return 'good';
      if (normalized >= 4) return 'warn';
      return 'bad';
    };

    const isLocked = (moduleId: ModuleId) => !moduleAccess[moduleId];

    return {
      therapy: {
        label: 'Resilience',
        display: isLocked('therapy')
          ? '—'
          : emotionalResilience === undefined || emotionalResilience === null
          ? '—'
          : `${formatNumber(emotionalResilience, 1)}/10`,
        tone: isLocked('therapy') ? 'neutral' : toneFromValue(emotionalResilience)
      },
      trainer: {
        label: 'CNS Fatigue',
        display: isLocked('trainer')
          ? '—'
          : cnsFatigue === undefined || cnsFatigue === null
          ? '—'
          : `${formatNumber(cnsFatigue, 1)}/10`,
        tone: isLocked('trainer') ? 'neutral' : toneFromValue(cnsFatigue, true)
      },
      soma: {
        label: 'Recovery',
        display: isLocked('soma')
          ? '—'
          : recoveryScore !== undefined && recoveryScore !== null
          ? `${formatNumber(recoveryScore, 1)}/10`
          : sleepQuality !== undefined && sleepQuality !== null
          ? `${formatNumber(sleepQuality, 1)}/10`
          : '—',
        tone: isLocked('soma') ? 'neutral' : toneFromValue(recoveryScore ?? sleepQuality)
      },
      ledger: {
        label: 'Resonance ROI',
        display: isLocked('ledger')
          ? '—'
          : resonanceROI !== undefined && resonanceROI !== null
          ? `${formatNumber(resonanceROI, 2)}x`
          : financialFriction !== undefined && financialFriction !== null
          ? `${formatNumber(financialFriction, 1)}/10`
          : '—',
        tone: isLocked('ledger')
          ? 'neutral'
          : resonanceROI !== undefined && resonanceROI !== null
          ? resonanceROI >= 0.8 ? 'good' : resonanceROI >= 0.5 ? 'warn' : 'bad'
          : toneFromValue(financialFriction, true)
      },
      atlas: {
        label: 'Energy Budget',
        display: isLocked('atlas')
          ? '—'
          : energyBudget !== undefined && energyBudget !== null
          ? `${formatNumber(energyBudget, 1)}/10`
          : '—',
        tone: isLocked('atlas') ? 'neutral' : toneFromValue(energyBudget)
      },
      scout: {
        label: 'Research Load',
        display: isLocked('scout')
          ? '—'
          : researchLoad !== undefined && researchLoad !== null
          ? `${Math.round(researchLoad)}`
          : '—',
        tone: 'neutral'
      },
      forge: {
        label: 'Link',
        display: isLocked('forge') ? '—' : 'LOCAL',
        tone: isLocked('forge') ? 'neutral' : 'good'
      },
      pulse: {
        label: 'Signal',
        display: isLocked('pulse')
          ? '—'
          : globalSoul?.compactedInsights?.length
          ? 'ACTIVE'
          : 'IDLE',
        tone: isLocked('pulse') ? 'neutral' : globalSoul?.compactedInsights?.length ? 'good' : 'neutral'
      }
    };
  }, [globalSoul, moduleAccess]);
}

export function useHubLayout(modules: ModuleItem[]) {
  const podLayout = useMemo(() => {
    return modules.map((module) => {
      let position: [number, number, number] = [0, 0, 0];
      switch (module.id) {
        case 'soma':    position = [-4.5, 0.3, 0]; break;
        case 'ledger':  position = [4.5, 0.3, 0];  break;
        case 'therapy': position = [0, 4.0, 1.5];  break;
        case 'trainer': position = [0, -3.5, -1];  break;
        case 'scout':   position = [-9, 1.0, 2];   break;
        case 'atlas':   position = [9, -1.5, 3];   break;
        case 'forge':   position = [7, 4.5, -4];   break;
        case 'pulse':   position = [0, 5.5, -5];   break;
        default:        position = [0, 0, 0];
      }
      return { ...module, position };
    });
  }, [modules]);

  const spinePoints = useMemo(
    () => [
      new THREE.Vector3(-4.5, 0.3, 0),
      new THREE.Vector3(0, 4.0, 1.5),
      new THREE.Vector3(4.5, 0.3, 0),
      new THREE.Vector3(0, -3.5, -1),
      new THREE.Vector3(-4.5, 0.3, 0),
    ],
    []
  );

  const orchestratorNodes: OrchestratorNode[] = useMemo(() => {
    const corePositions: Record<string, { x: number; y: number }> = {
      soma:    { x: 32, y: 55 },
      ledger:  { x: 50, y: 75 },
      therapy: { x: 68, y: 45 },
      trainer: { x: 50, y: 25 },
    };
    const pluginPositions: Record<string, { x: number; y: number }> = {
      scout:   { x: 15, y: 55 },
      atlas:   { x: 35, y: 85 },
      forge:   { x: 85, y: 45 },
      pulse:   { x: 50, y: 8 },
    };

    return modules.map((module) => {
      const isCore = CORE_MODULES.includes(module.id);
      const pos = isCore ? corePositions[module.id] : pluginPositions[module.id];
      const isLeft = pos.x < 50;
      const cp1x = 50;
      const cp1y = 50;
      const cp2x = isLeft ? pos.x + 10 : pos.x - 10;
      const cp2y = pos.y;

      return {
        ...module,
        x: pos.x,
        y: pos.y,
        path: `M 50 50 C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pos.x} ${pos.y}`
      };
    });
  }, [modules]);

  return { podLayout, spinePoints, orchestratorNodes };
}

export function useModules(): ModuleItem[] {
  return useMemo(() => {
    return HUB_MODULE_ORDER.map((moduleId) => {
      const module = MODULE_MANIFEST[moduleId];
      return {
        id: module.id,
        title: module.title,
        icon: module.icon,
        color: module.colorHex,
        description: module.description,
        route: module.route,
        isPlugin: !CORE_MODULES.includes(module.id)
      };
    });
  }, []);
}
