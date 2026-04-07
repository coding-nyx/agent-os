/**
 * Nexus Synthesis Bridge — shared singleton wrapping KMP NexusSynthesisServiceJs.
 *
 * Extracted from ConflictResolutionOverlay so that any module or service can
 * call `detectConflicts()`, `resolveConflict()`, etc. without depending on a
 * UI component.
 */
import { NexusSynthesisServiceJs } from '@cortex-logic';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { ModuleId } from '@/lib/module-manifest';
import type { SpineEventType, SpineEventPriority } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictSeverity = 'warn' | 'block';

export interface ConflictResult {
  id: string;
  title: string;
  affectedModules: ModuleId[];
  severity: ConflictSeverity;
  suggestedResolution: string;
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// KMP singleton — wired to Spine event bus
// ---------------------------------------------------------------------------

const kmpSynthesis = new NexusSynthesisServiceJs(
  (type: string, dataJson: string) => {
    try {
      const data = JSON.parse(dataJson) as Record<string, unknown>;
      const priority: SpineEventPriority = type === 'CRISIS_MODE' ? 'critical' : (type === 'CONFLICT_DETECTED' ? 'alert' : 'info');
      Spine.emit({
        type: type as SpineEventType,
        source: 'nexus-synthesis',
        domain: 'system',
        priority,
        data,
      });
    } catch {
      // ignore malformed event data
    }
  }
);

function parseConflicts(json: string): ConflictResult[] {
  try {
    const raw = JSON.parse(json) as Array<{
      id: string; title: string; severity: string; suggestedResolution: string;
      detectedAt: number; affectedModulesJson: string;
    }>;
    return raw.map((c) => ({
      id: c.id,
      title: c.title,
      severity: (c.severity === 'block' ? 'block' : 'warn') as ConflictSeverity,
      suggestedResolution: c.suggestedResolution,
      detectedAt: c.detectedAt,
      affectedModules: (() => { try { return JSON.parse(c.affectedModulesJson) as ModuleId[]; } catch { return []; } })(),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const NexusSynthesisService = {
  detectConflicts: (nsv: object): ConflictResult[] =>
    parseConflicts(kmpSynthesis.detectConflicts(JSON.stringify(nsv))),
  shouldSurface: (conflict: ConflictResult): boolean =>
    kmpSynthesis.shouldSurface(JSON.stringify(conflict)),
  markSurfaced: (conflict: ConflictResult): void =>
    kmpSynthesis.markSurfaced(JSON.stringify(conflict)),
  resolveConflict: (conflictId: string, resolution: 'proceed' | 'defer' | 'reroute'): void =>
    kmpSynthesis.resolveConflict(conflictId, resolution),
};
