import { ActionHubJs, NsvOwnershipServiceJs, OrchestrationActionGateServiceJs } from '@cortex-logic';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { NexusLogger } from '@/lib/nexus-logger';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineDomain, SpineEventPriority, SpineEventType } from '@/lib/types';
import { createActionHubCallbacks } from './nexus-data-layer-bridge';

type ActionHubJsInstance = InstanceType<typeof ActionHubJs>;

let _instance: ActionHubJsInstance | null = null;
let _currentKey: CryptoKey | null | undefined = undefined;
let _userId: string | null = null;

/**
 * Tracks which module is currently executing a KMP action so the updateNsv
 * callback can apply NSV ownership filtering. Set before each `hub.execute()`
 * call and cleared when it completes.
 */
let _executingModuleId: string | null = null;

export function setExecutingModule(moduleId: string | null): void {
  _executingModuleId = moduleId;
}

const _actionGate = new OrchestrationActionGateServiceJs();
const _nsvOwnership = new NsvOwnershipServiceJs();

const VALID_DOMAINS = new Set<string>(['B', 'E', 'C', 'R', 'system']);

/**
 * Returns the shared `ActionHubJs` KMP instance, creating or recreating it when
 * the encryption key changes (vault lock/unlock).
 *
 * Returns `null` if the KMP module is unavailable (e.g. during SSR or tests).
 */
export function getActionHubJs(encryptionKey?: CryptoKey | null): ActionHubJsInstance | null {
  if (_instance !== null && encryptionKey === _currentKey) return _instance;
  try {
    if (!ActionHubJs) return null; // KMP build not yet updated with ActionHubJs.kt
    const callbacks = createActionHubCallbacks(getNexusDataLayer(), encryptionKey ?? null);

    const updateNsv = (
      patchJson: string,
      onComplete: () => void,
      onError: (e: string) => void,
    ) => {
      try {
        // KMP emits flat dotted paths (e.g. {"biological.cnsFatigue": 5}).
        // queueNSVUpdate expects nested domain objects ({biological: {cnsFatigue: 5}}).
        // Expand dotted keys; non-dotted keys with object values are passed through as-is.
        let flat = JSON.parse(String(patchJson)) as Record<string, unknown>;

        // Apply NSV ownership filtering — KMP actions must respect the same
        // ownership matrix as TS-side actions. Without this, KMP could write
        // to metrics the executing module doesn't own.
        const moduleId = _executingModuleId;
        if (moduleId && _actionGate.isNsvReadOnlyModule(moduleId)) {
          const filteredJson = _nsvOwnership.filterWritePatch(moduleId, String(patchJson));
          if (!filteredJson) {
            NexusLogger.warn('ActionHubBridge', `[NSV] Read-only module "${moduleId}" attempted NSV write — blocked`);
            onComplete();
            return;
          }
          flat = JSON.parse(filteredJson) as Record<string, unknown>;
        }

        const nested: Record<string, Record<string, unknown>> = {};
        for (const [path, value] of Object.entries(flat)) {
          const dot = path.indexOf('.');
          if (dot !== -1) {
            const domain = path.slice(0, dot);
            const leaf = path.slice(dot + 1);
            if (!nested[domain]) nested[domain] = {};
            nested[domain][leaf] = value;
          } else if (typeof value === 'object' && value !== null) {
            nested[path] = value as Record<string, unknown>;
          }
        }
        queueNSVUpdate(_userId ?? '', nested, 'kmp-action-hub');
        onComplete();
      } catch (e) {
        onError(String(e));
      }
    };

    const emitSpineEvent = (eventJson: string) => {
      try {
        const ev = JSON.parse(String(eventJson)) as {
          type: string;
          source: string;
          domain?: string;
          target?: string;
          data?: Record<string, unknown>;
          priority?: string;
          cascadeDepth?: number;
        };
        const domain: SpineDomain = VALID_DOMAINS.has(ev.domain ?? '')
          ? (ev.domain as SpineDomain)
          : 'system';
        Spine.emit({
          type: ev.type as SpineEventType,
          source: ev.source,
          domain,
          ...(ev.target ? { target: ev.target } : {}),
          data: ev.data ?? {},
          priority: (['info', 'alert', 'critical'].includes(ev.priority ?? '')
            ? ev.priority
            : 'info') as SpineEventPriority,
          cascadeDepth: ev.cascadeDepth ?? 0,
        });
      } catch (e) {
        NexusLogger.warn('ActionHubBridge', `Spine emit failed: ${e}`);
      }
    };

    _instance = new ActionHubJs(
      callbacks.getDocument,
      callbacks.setDocument,
      callbacks.updateDocument,
      callbacks.deleteDocument,
      callbacks.batchWrite,
      updateNsv,
      emitSpineEvent,
      callbacks.vaultEncrypt ?? undefined,
      callbacks.vaultDecrypt ?? undefined,
    );
    _currentKey = encryptionKey;
    return _instance;
  } catch (e) {
    NexusLogger.warn('ActionHubBridge', `Failed to initialize ActionHubJs: ${e}`);
    return null;
  }
}

export function setActionHubUser(userId: string | null): void {
  _userId = userId;
}

export function invalidateActionHubBridge(): void {
  _instance = null;
  _currentKey = undefined;
}
