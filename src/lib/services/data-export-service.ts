/**
 * Data Export Service — S10-006
 *
 * Assembles a portable JSON snapshot of all user data across modules.
 *
 * v2.0 API — `exportAllData`:
 *   - Accepts an explicit NexusDataLayer instance (no global singleton coupling)
 *   - Vault-encrypted fields are exported raw (no decryption) — data stays E2EE
 *   - Returns a NexusExport object; caller is responsible for triggering download
 *
 * Legacy v1.0 API — `exportUserData` / `downloadAsJSON` — retained for backward compat.
 *
 * Complexity: O(C) where C = number of module collections (~7).
 * All fetches run in parallel via Promise.all.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NexusDataLayer } from '@/lib/data-layer/index';
import { MODULE_MANIFEST } from '@/lib/module-manifest';
import { decryptWithKey } from '@/lib/encryption';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ExportBundle {
  /** ISO 8601 timestamp of when the export was generated */
  exportedAt: string;
  version: '1.0';
  userId: string;
  /** moduleId → decrypted profile data (or metadata-only when vault is locked) */
  modules: Record<string, unknown>;
  /** global_souls/{uid} document */
  globalSoul?: unknown;
  /** Last 100 spine events, newest first */
  spineEvents?: unknown[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Shape guard for documents that contain an encrypted blob */
interface EncryptedProfileShape {
  encryptedData: string;
  iv: string;
  [key: string]: unknown;
}

function isEncryptedProfile(value: unknown): value is EncryptedProfileShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).encryptedData === 'string' &&
    typeof (value as Record<string, unknown>).iv === 'string'
  );
}

/**
 * Strip the raw encrypted blob from a document so only safe metadata is exported
 * when the vault is locked or decryption fails.
 */
function safeMetadata(doc: EncryptedProfileShape): Record<string, unknown> {
  const { encryptedData: _blob, ...rest } = doc;
  return rest;
}

// ─── Core export logic ────────────────────────────────────────────────────────

/**
 * Collects all user data into a portable ExportBundle.
 *
 * @param userId  - Authenticated user UID
 * @param vaultKey - Optional CryptoKey from the vault. When undefined the export
 *                   is metadata-only (encrypted blobs are omitted).
 *
 * @returns A fully-assembled ExportBundle. Never rejects — partial failures
 *          are recorded as `null` per module/section.
 */
export async function exportUserData(
  userId: string,
  vaultKey?: CryptoKey,
): Promise<ExportBundle> {
  const dataLayer = getNexusDataLayer();
  const modules: Record<string, unknown> = {};

  // ── Module profiles (parallel) ────────────────────────────────────────────
  const pageModules = Object.values(MODULE_MANIFEST).filter((m) => m.hasPage);

  await Promise.all(
    pageModules.map(async (module) => {
      const collection = `${module.id}_profiles`;
      try {
        const doc = await dataLayer.getDocument(collection, userId);

        if (doc === null) {
          modules[module.id] = null;
          return;
        }

        if (isEncryptedProfile(doc)) {
          if (vaultKey !== undefined) {
            try {
              const plaintext = await decryptWithKey(
                { ciphertext: doc.encryptedData, iv: doc.iv },
                vaultKey,
              );
              // Decrypted payload is expected to be JSON; fall back to raw string
              try {
                modules[module.id] = JSON.parse(plaintext) as unknown;
              } catch {
                modules[module.id] = plaintext;
              }
            } catch {
              // Wrong key or corrupt data — export metadata only
              modules[module.id] = safeMetadata(doc);
            }
          } else {
            // Vault locked — omit the encrypted blob, keep safe fields
            modules[module.id] = safeMetadata(doc);
          }
        } else {
          // Plaintext document — include as-is
          modules[module.id] = doc;
        }
      } catch {
        // Network / data-layer error — record null, don't abort the whole export
        modules[module.id] = null;
      }
    }),
  );

  // ── Global soul ───────────────────────────────────────────────────────────
  let globalSoul: unknown = undefined;
  try {
    const soulDoc = await dataLayer.getDocument('global_souls', userId);
    if (soulDoc !== null) globalSoul = soulDoc;
  } catch {
    // Non-fatal — omit section
  }

  // ── Spine events (last 100, newest first) ─────────────────────────────────
  let spineEvents: unknown[] | undefined = undefined;
  try {
    const events = await dataLayer.query({
      collection: `spine_events/${userId}/events`,
      orderBy: [{ field: 'timestamp', direction: 'desc' }],
      limit: 100,
    });
    spineEvents = events;
  } catch {
    // Non-fatal — omit section
  }

  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    userId,
    modules,
    ...(globalSoul !== undefined ? { globalSoul } : {}),
    ...(spineEvents !== undefined ? { spineEvents } : {}),
  };
}

// ─── Download helper ──────────────────────────────────────────────────────────

/**
 * Serialises an ExportBundle to pretty-printed JSON and triggers a browser
 * file download. Cleans up the object URL immediately after the click.
 *
 * @param bundle   - The bundle returned by exportUserData
 * @param filename - Optional override. Defaults to nexus-export-YYYY-MM-DD.json
 */
export function downloadAsJSON(bundle: ExportBundle, filename?: string): void {
  const isoDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const resolvedFilename = filename ?? `nexus-export-${isoDate}.json`;

  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resolvedFilename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke synchronously — the click schedules the download asynchronously
  URL.revokeObjectURL(url);
}

// ─── v2.0 Public types ────────────────────────────────────────────────────────

/**
 * Portable export envelope for all user data across Nexus modules (v2.0).
 *
 * Vault-encrypted fields are kept as-is — the encrypted ciphertext and IV
 * travel in the export unchanged so that E2EE guarantees are preserved.
 * The recipient must hold the correct vault key to use those fields.
 */
export interface NexusExport {
  /** Schema version — always '2.0' for this format */
  version: '2.0';
  /** ISO 8601 UTC timestamp at the moment of export */
  exportedAt: string;
  /** Per-module snapshots, keyed by module identifier */
  modules: {
    agnes?: unknown;
    titan?: unknown;
    ledger?: unknown;
    soma?: unknown;
    atlas?: unknown;
    scout?: unknown;
    forge?: unknown;
  };
  /** global_souls/{userId} document, if present */
  globalSoul?: unknown;
  /** Informational: whether the account uses a vault and its storage mode */
  vault_metadata?: {
    hasVault: boolean;
    persistenceMode: string;
  };
}

// ─── v2.0 internal constants ──────────────────────────────────────────────────

/**
 * Ordered mapping of Firestore collection → NexusExport modules key.
 * `scout_knowledge` and `forge_sessions` intentionally diverge from the
 * `*_profiles` naming convention used by the other modules.
 */
const MODULE_COLLECTION_MAP = [
  { collection: 'agnes_profiles', key: 'agnes' },
  { collection: 'titan_profiles', key: 'titan' },
  { collection: 'ledger_profiles', key: 'ledger' },
  { collection: 'soma_profiles', key: 'soma' },
  { collection: 'atlas_profiles', key: 'atlas' },
  { collection: 'scout_knowledge', key: 'scout' },
  { collection: 'forge_sessions', key: 'forge' },
] as const satisfies ReadonlyArray<{
  collection: string;
  key: keyof NexusExport['modules'];
}>;

/** Shape guard for documents that carry a vault-encrypted payload */
function hasEncryptedPayload(doc: unknown): boolean {
  if (typeof doc !== 'object' || doc === null) return false;
  const d = doc as Record<string, unknown>;
  return typeof d.encryptedData === 'string' && typeof d.iv === 'string';
}

// ─── v2.0 Core export logic ───────────────────────────────────────────────────

/**
 * Assembles a complete, portable NexusExport (v2.0) for the given user.
 *
 * - All reads are parallelised (Promise.all over the fixed module list).
 * - Vault-encrypted documents are stored raw — no decryption occurs here.
 * - Partial failures are silently recorded as `null`; the function never rejects.
 *
 * @param userId    - Authenticated user UID
 * @param dataLayer - Data-layer instance (injected; no global singleton coupling)
 * @param vaultKey  - Optional CryptoKey, reserved for future vault-metadata
 *                    enrichment. Not used for decryption.
 * @returns Fully assembled NexusExport ready for serialisation.
 */
export async function exportAllData(
  userId: string,
  dataLayer: NexusDataLayer,
  _vaultKey?: CryptoKey,
): Promise<NexusExport> {
  const modules: NexusExport['modules'] = {};
  let hasVaultDoc = false;

  // ── Module profiles — all in parallel ─────────────────────────────────────
  await Promise.all(
    MODULE_COLLECTION_MAP.map(async ({ collection, key }) => {
      try {
        const doc = await dataLayer.getDocument(collection, userId);
        if (doc !== null) {
          modules[key] = doc;
          if (hasEncryptedPayload(doc)) hasVaultDoc = true;
        }
        // null result → leave key absent (sparse export)
      } catch {
        // Non-fatal — absent key signals fetch failure to importer
      }
    }),
  );

  // ── Global soul ────────────────────────────────────────────────────────────
  let globalSoul: unknown = undefined;
  try {
    const soulDoc = await dataLayer.getDocument('global_souls', userId);
    if (soulDoc !== null) globalSoul = soulDoc;
  } catch {
    // Non-fatal
  }

  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    modules,
    ...(globalSoul !== undefined ? { globalSoul } : {}),
    vault_metadata: {
      hasVault: hasVaultDoc,
      persistenceMode: 'firestore',
    },
  };
}

// ─── v2.0 Download helper ─────────────────────────────────────────────────────

/**
 * Serialises a NexusExport to pretty-printed JSON and triggers a browser
 * file-save dialog. The object URL is revoked synchronously after the click
 * is scheduled — the browser queues the download before the URL expires.
 *
 * @param nexusExport - The object returned by `exportAllData`
 * @param filename    - Optional override; defaults to `nexus-export-YYYY-MM-DD.json`
 */
export function downloadNexusExport(nexusExport: NexusExport, filename?: string): void {
  const isoDate = new Date().toISOString().slice(0, 10);
  const resolvedFilename = filename ?? `nexus-export-${isoDate}.json`;

  const json = JSON.stringify(nexusExport, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = resolvedFilename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}
