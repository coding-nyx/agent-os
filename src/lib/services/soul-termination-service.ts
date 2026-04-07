import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { BatchOperation } from '@/lib/data-layer/index';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import { ALIVE_ENTITY_COLLECTION } from './alive-entity-service';
import { CoreProfileService } from './core-profile-service';
import { ORCHESTRATION_EXECUTION_SUBCOLLECTION, ORCHESTRATION_PROPOSAL_SUBCOLLECTION, ORCHESTRATION_THREAD_SUBCOLLECTION } from './orchestration-persistence-service';
import { SILENT_HISTORY_SUBCOLLECTION } from './orchestration-history-service';
import { getUserDataDeletionTargets } from './user-data-registry';

const LOCAL_STORAGE_PREFIXES = ['nexus_', 'agnes_'];
const LOCAL_STORAGE_SUBSTRINGS = ['integrity'];
const SESSION_STORAGE_KEYS = ['nexus_guest_active', 'nexus_vault_session', 'nexus_vault_session_ts'];

/** Known subcollections keyed by parent collection name. */
const KNOWN_SUBCOLLECTIONS: Record<string, string[]> = {
  semantic_memory: ['facts'],
  spine_events: ['events', 'spec_events'],
  users: [
    'modules',
    'notification_inbox',
    'notification_schedules',
    'notification_occurrences',
    'insights',
    ALIVE_ENTITY_COLLECTION,
    ORCHESTRATION_PROPOSAL_SUBCOLLECTION,
    ORCHESTRATION_EXECUTION_SUBCOLLECTION,
    ORCHESTRATION_THREAD_SUBCOLLECTION,
    SILENT_HISTORY_SUBCOLLECTION,
  ],
  atlas_journals: ['entries'],
  soma_diagnoses: ['sessions'],
  scout_knowledge: ['nodes'],
  scout_sources: ['sources'],
  scout_digests: ['digests'],
};

function shouldRemoveLocalStorageKey(key: string): boolean {
  return (
    LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    LOCAL_STORAGE_SUBSTRINGS.some((substring) => key.includes(substring))
  );
}

async function deleteSubcollection(collectionPath: string): Promise<void> {
  const dl = getNexusDataLayer();
  const docs = await dl.listDocuments(collectionPath, { limit: 0 });
  if (docs.length === 0) return;

  // NexusDataLayer.batchWrite supports up to 500 operations per call
  const BATCH_SIZE = 500;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const operations: BatchOperation[] = chunk.map((d) => ({
      type: 'delete' as const,
      collection: collectionPath,
      id: d.id,
    }));
    await dl.batchWrite(operations);
  }
}

export const SoulTerminationService = {
  async purgeUserData(uid: string): Promise<void> {
    if (!uid) return;

    // 1. Reset onboarding status so the app locks down immediately
    try {
      await CoreProfileService.updateProfile(uid, { onboardingComplete: false });
    } catch (err) {
      console.warn('[SoulTerminationService] Non-fatal: Failed to reset onboarding status:', err);
    }

    const dl = getNexusDataLayer();
    const targets = getUserDataDeletionTargets(uid);
    try {
      // 2. Delete known subcollections first (Firestore does NOT cascade-delete)
      for (const target of targets) {
        const subcollections = KNOWN_SUBCOLLECTIONS[target.collection];
        if (subcollections) {
          const parentPath = `${target.collection}/${target.documentId}`;
          await Promise.all(
            subcollections.map((sub) => deleteSubcollection(`${parentPath}/${sub}`))
          );
        }
      }

      // 2. Delete the parent documents
      await Promise.all(
        targets.map((target) => dl.deleteDocument(target.collection, target.documentId))
      );
    } catch (error) {
      console.error('[SoulTerminationService] Failed to purge user data:', error);
      throw error;
    }
  },

  clearLocalArtifacts(): void {
    useOrchestrationStore.getState().resetShell();

    if (typeof window === 'undefined') return;

    SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && shouldRemoveLocalStorageKey(key)) {
        localStorage.removeItem(key);
      }
    }
  },

  async terminateSoul(uid: string): Promise<void> {
    await this.purgeUserData(uid);
    this.clearLocalArtifacts();
  }
};
