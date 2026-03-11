/**
 * Data Export Service — S10-006
 *
 * Assembles a portable JSON snapshot of all user data across modules.
 * Gracefully degrades when the vault is locked: encrypted blobs are stripped
 * and only safe metadata is included. Never throws on partial failures.
 *
 * Complexity: O(M) where M = number of modules with hasPage:true (~7–9 modules).
 * All module profile fetches run in parallel via Promise.all.
 */

import { getNexusDataLayer } from '@/lib/data-layer/provider';
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
