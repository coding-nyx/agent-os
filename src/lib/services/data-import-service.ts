/**
 * Data Import Service — S10-006
 *
 * Restores a user's Nexus data from a v2.0 NexusExport JSON string.
 *
 * Merge strategy (field-level safety):
 *   For each module, the importer reads the live document's `updatedAt`
 *   timestamp and compares it against the export's `exportedAt` timestamp.
 *   If the live document is newer, that module is skipped — local changes
 *   are never silently overwritten.
 *
 * Vault-encrypted fields are written back as-is; the service never inspects
 * or mutates encrypted payloads.
 *
 * Complexity: O(C) where C = number of module collections (~7).
 * All existence-checks run in parallel; writes are sequential per-module
 * to avoid partial-write races on a single document.
 */

import type { NexusDataLayer } from '@/lib/data-layer/index';
import type { NexusExport } from './data-export-service';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ImportResult {
  /** True only when JSON parsing + version check succeed with no fatal errors */
  success: boolean;
  /** Module keys that were successfully written (e.g. ['agnes', 'titan']) */
  modulesRestored: string[];
  /**
   * Non-fatal issues (e.g. "skipped titan — live data is newer").
   * A non-empty array does NOT flip `success` to false.
   */
  errors: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Collection → NexusExport modules key mapping.
 * Must stay in sync with the same constant in data-export-service.ts.
 */
const MODULE_COLLECTION_MAP: ReadonlyArray<{
  collection: string;
  key: keyof NexusExport['modules'];
}> = [
  { collection: 'agnes_profiles', key: 'agnes' },
  { collection: 'titan_profiles', key: 'titan' },
  { collection: 'ledger_profiles', key: 'ledger' },
  { collection: 'soma_profiles', key: 'soma' },
  { collection: 'atlas_profiles', key: 'atlas' },
  { collection: 'scout_knowledge', key: 'scout' },
  { collection: 'forge_sessions', key: 'forge' },
];

/**
 * Normalises heterogeneous timestamp representations to a Unix millisecond
 * epoch value for safe comparison.
 *
 * Handles:
 *  - ISO 8601 strings          → parsed by Date
 *  - Firestore Timestamp shape  → `{ seconds: number; nanoseconds: number }`
 *  - Firestore Timestamp class  → exposes `.toDate()` method
 *  - Anything unrecognised     → 0 (treated as oldest possible)
 */
function toEpochMs(timestamp: unknown): number {
  if (typeof timestamp === 'string') {
    const ms = Date.parse(timestamp);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'object' && timestamp !== null) {
    const ts = timestamp as Record<string, unknown>;
    // Firestore Timestamp class exposes toDate()
    if (typeof ts.toDate === 'function') {
      return (ts.toDate as () => Date)().getTime();
    }
    // Plain Firestore Timestamp shape { seconds, nanoseconds }
    if (typeof ts.seconds === 'number') {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds as number ?? 0) / 1e6);
    }
  }
  return 0;
}

/**
 * Strips the synthetic `id` field that the data-layer attaches to every
 * NexusRecord before writing the document back. The document ID is passed
 * as a separate argument to `setDocument`, so having it inside the payload
 * is redundant and may confuse some adapters.
 */
function stripRecordId(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null) return {};
  const { id: _id, ...rest } = data as Record<string, unknown>;
  return rest;
}

// ─── Type guard for NexusExport ───────────────────────────────────────────────

function isNexusExport(value: unknown): value is NexusExport {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).version === '2.0' &&
    typeof (value as Record<string, unknown>).exportedAt === 'string' &&
    typeof (value as Record<string, unknown>).modules === 'object' &&
    (value as Record<string, unknown>).modules !== null
  );
}

// ─── Core import logic ────────────────────────────────────────────────────────

/**
 * Parses a NexusExport JSON string and restores data into Firestore for the
 * given userId.
 *
 * For each module:
 *  1. If the export has no data for that module → skip.
 *  2. If the live document's `updatedAt` is newer than `exportedAt` → skip
 *     (conservative merge: never overwrite newer live data).
 *  3. Otherwise → `setDocument` with the exported payload.
 *
 * The globalSoul document follows the same merge logic.
 *
 * @param jsonString - Raw JSON string from a `.json` backup file
 * @param userId     - Authenticated user UID (target for all writes)
 * @param dataLayer  - Data-layer instance (injected)
 * @returns ImportResult describing what was restored and any skipped/failed items
 */
export async function importData(
  jsonString: string,
  userId: string,
  dataLayer: NexusDataLayer,
): Promise<ImportResult> {
  const modulesRestored: string[] = [];
  const errors: string[] = [];

  // ── Parse ──────────────────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString) as unknown;
  } catch {
    return { success: false, modulesRestored, errors: ['Invalid JSON — file could not be parsed.'] };
  }

  // ── Version guard ──────────────────────────────────────────────────────────
  if (!isNexusExport(parsed)) {
    const foundVersion =
      typeof parsed === 'object' && parsed !== null
        ? String((parsed as Record<string, unknown>).version ?? 'missing')
        : 'unknown';
    return {
      success: false,
      modulesRestored,
      errors: [
        `Unsupported export version "${foundVersion}". ` +
          'Only v2.0 exports are accepted. Re-export from the current version of Nexus.',
      ],
    };
  }

  const bundle: NexusExport = parsed;
  const exportedAtMs = Date.parse(bundle.exportedAt);

  // ── Module profiles ────────────────────────────────────────────────────────
  for (const { collection, key } of MODULE_COLLECTION_MAP) {
    const moduleData = bundle.modules[key];
    if (moduleData === undefined || moduleData === null) continue;

    try {
      // Check whether the live document is newer before overwriting
      const existing = await dataLayer.getDocument(collection, userId);
      if (existing !== null) {
        const liveUpdatedAtMs = toEpochMs((existing as Record<string, unknown>).updatedAt);
        if (liveUpdatedAtMs > exportedAtMs) {
          errors.push(`Skipped "${key}" — live data is newer than the backup.`);
          continue;
        }
      }

      await dataLayer.setDocument(collection, userId, stripRecordId(moduleData));
      modulesRestored.push(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore "${key}": ${message}`);
    }
  }

  // ── Global soul ────────────────────────────────────────────────────────────
  if (bundle.globalSoul !== null && bundle.globalSoul !== undefined) {
    try {
      const existingSoul = await dataLayer.getDocument('global_souls', userId);
      if (existingSoul !== null) {
        const liveSoulMs = toEpochMs((existingSoul as Record<string, unknown>).updatedAt);
        if (liveSoulMs > exportedAtMs) {
          errors.push('Skipped "globalSoul" — live data is newer than the backup.');
        } else {
          await dataLayer.setDocument('global_souls', userId, stripRecordId(bundle.globalSoul));
          modulesRestored.push('globalSoul');
        }
      } else {
        await dataLayer.setDocument('global_souls', userId, stripRecordId(bundle.globalSoul));
        modulesRestored.push('globalSoul');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to restore "globalSoul": ${message}`);
    }
  }

  return {
    success: true,
    modulesRestored,
    errors,
  };
}
