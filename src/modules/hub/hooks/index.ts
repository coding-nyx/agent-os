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
      agnes: {
        label: 'Resilience',
        display: isLocked('agnes')
          ? '—'
          : emotionalResilience === undefined || emotionalResilience === null
          ? '—'
          : `${formatNumber(emotionalResilience, 1)}/10`,
        tone: isLocked('agnes') ? 'neutral' : toneFromValue(emotionalResilience)
      },
      titan: {
        label: 'CNS Fatigue',
        display: isLocked('titan')
          ? '—'
          : cnsFatigue === undefined || cnsFatigue === null
          ? '—'
          : `${formatNumber(cnsFatigue, 1)}/10`,
        tone: isLocked('titan') ? 'neutral' : toneFromValue(cnsFatigue, true)
      },
      soma: {
        label: 'Readiness',
        display: isLocked('soma')
          ? '—'
          : globalSoul?.crossFunctionalState?.biological?.recoveryScore !== undefined && globalSoul?.crossFunctionalState?.biological?.recoveryScore !== null
          ? `${Math.round(globalSoul.crossFunctionalState.biological.recoveryScore)}%`
          : '—',
        tone: isLocked('soma') 
          ? 'neutral' 
          : (globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? 0) >= 80 ? 'good' 
          : (globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? 0) >= 60 ? 'warn' : 'bad'
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
      }
    };
  }, [globalSoul, moduleAccess]);
}

export function useHubLayout(modules: ModuleItem[]) {
  const podLayout = useMemo(() => {
    return modules.map((module) => {
      let position: [number, number, number] = [0, 0, 0];
      switch (module.id) {
        // Core pentagon — Agnes at apex (top)
        case 'agnes':   position = [0, 4, 1];        break;
        case 'titan':   position = [4.5, 1, 0.5];    break;
        case 'soma':    position = [3, -3.5, 0.5];   break;
        case 'ledger':  position = [-3, -3.5, 0.5];  break;
        case 'atlas':   position = [-4.5, 1, 0.5];   break;
        // Plugins orbit
        case 'forge':   position = [8, 0, -2];        break;
        case 'scout':   position = [-8, 0, -2];       break;
        default:        position = [0, 0, 0];
      }
      return { ...module, position };
    });
  }, [modules]);

  const spinePoints = useMemo(
    () => [
      new THREE.Vector3(0, 4, 1),         // Agnes (top)
      new THREE.Vector3(4.5, 1, 0.5),     // Titan
      new THREE.Vector3(3, -3.5, 0.5),    // Soma
      new THREE.Vector3(-3, -3.5, 0.5),   // Ledger
      new THREE.Vector3(-4.5, 1, 0.5),    // Atlas
      new THREE.Vector3(0, 4, 1),         // Close loop
    ],
    []
  );

  const orchestratorNodes: OrchestratorNode[] = useMemo(() => {
    // 5 core modules: pentagon shape
    const corePositions: Record<string, { x: number; y: number }> = {
      agnes:   { x: 50, y: 15 },   // top
      titan:   { x: 85, y: 45 },   // right
      soma:    { x: 72, y: 85 },   // bottom right
      ledger:  { x: 28, y: 85 },   // bottom left
      atlas:   { x: 15, y: 45 },   // left
    };
    // Plugins: orbiting outside the core pentagon
    const pluginPositions: Record<string, { x: number; y: number }> = {
      forge:   { x: 92, y: 70 },   // far right
      scout:   { x: 8, y: 70 },    // far left
    };

    return modules.map((module) => {
      const isCore = CORE_MODULES.includes(module.id);
      const pos = isCore ? corePositions[module.id] : pluginPositions[module.id];
      // Compute smooth bezier nerve from center (50,50) to node
      const dx = pos.x - 50;
      const dy = pos.y - 50;
      // First control point: slight offset from center along the direction
      const cp1x = 50 + dx * 0.3;
      const cp1y = 50 + dy * 0.3;
      // Second control point: closer to target with perpendicular curvature
      const cp2x = pos.x - dx * 0.15 + dy * 0.08;
      const cp2y = pos.y - dy * 0.15 - dx * 0.08;

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
