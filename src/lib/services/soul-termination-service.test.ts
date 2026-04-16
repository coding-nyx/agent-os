import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { setAraDataLayer } from '@/lib/data-layer/provider';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import { ALIVE_ENTITY_COLLECTION } from './alive-entity-service';
import { ORCHESTRATION_EXECUTION_SUBCOLLECTION, ORCHESTRATION_PROPOSAL_SUBCOLLECTION, ORCHESTRATION_THREAD_SUBCOLLECTION } from './orchestration-persistence-service';
import { SILENT_HISTORY_SUBCOLLECTION } from './orchestration-history-service';
import { SoulTerminationService } from './soul-termination-service';

const USER_ID = 'user-1';

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

function clearStorageArea(storage: Storage) {
  if (typeof storage.clear === 'function') {
    storage.clear();
    return;
  }

  for (const key of Object.keys(storage)) {
    storage.removeItem(key);
  }
}

describe('SoulTerminationService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    vi.stubGlobal('sessionStorage', createStorageMock());
    vi.stubGlobal('window', { localStorage, sessionStorage });
    setAraDataLayer(new InMemoryDataLayer());
    useOrchestrationStore.getState().resetShell();
    clearStorageArea(localStorage);
    clearStorageArea(sessionStorage);
  });

  it('purges orchestration artifact subcollections alongside the user record', async () => {
    const dataLayer = new InMemoryDataLayer();
    setAraDataLayer(dataLayer);

    await dataLayer.setDocument('users', USER_ID, {
      uid: USER_ID,
      email: 'user@example.com',
      preferredName: '',
      pronouns: '',
      onboardingComplete: true,
      agentPersonalityProvision: {
        orchestratorAlias: 'Ara',
        moduleAliases: { agnes: 'Agnes', titan: 'Titan', ledger: 'Ledger' },
        agentGenders: { orchestrator: 'female', agnes: 'female', titan: 'non-binary', ledger: 'female' },
        personaOverlays: {},
      },
      securityPreferences: { vaultLocks: {} },
      schemaVersion: 2,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    await dataLayer.setDocument(`users/${USER_ID}/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`, 'proposal-1', { createdAt: '2024-01-01T00:00:00.000Z' });
    await dataLayer.setDocument(`users/${USER_ID}/${ORCHESTRATION_EXECUTION_SUBCOLLECTION}`, 'exec-1', { executedAt: '2024-01-01T00:00:00.000Z' });
    await dataLayer.setDocument(`users/${USER_ID}/${ORCHESTRATION_THREAD_SUBCOLLECTION}`, 'thread-1', { updatedAt: '2024-01-01T00:00:00.000Z' });
    await dataLayer.setDocument(`users/${USER_ID}/${SILENT_HISTORY_SUBCOLLECTION}`, 'silent-1', { timestamp: '2024-01-01T00:00:00.000Z' });
    await dataLayer.setDocument(`users/${USER_ID}/${ALIVE_ENTITY_COLLECTION}`, 'alive-1', { updatedAt: '2024-01-01T00:00:00.000Z' });

    await SoulTerminationService.purgeUserData(USER_ID);

    expect(await dataLayer.getDocument('users', USER_ID)).toBeNull();
    expect(await dataLayer.listDocuments(`users/${USER_ID}/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`)).toEqual([]);
    expect(await dataLayer.listDocuments(`users/${USER_ID}/${ORCHESTRATION_EXECUTION_SUBCOLLECTION}`)).toEqual([]);
    expect(await dataLayer.listDocuments(`users/${USER_ID}/${ORCHESTRATION_THREAD_SUBCOLLECTION}`)).toEqual([]);
    expect(await dataLayer.listDocuments(`users/${USER_ID}/${SILENT_HISTORY_SUBCOLLECTION}`)).toEqual([]);
    expect(await dataLayer.listDocuments(`users/${USER_ID}/${ALIVE_ENTITY_COLLECTION}`)).toEqual([]);
  });

  it('clears local orchestration shell state alongside browser artifacts', () => {
    useOrchestrationStore.getState().setActiveThreadId('thread-1');
    useOrchestrationStore.getState().setLastTurnRuntime({
      moduleId: 'ara',
      autopilotLevel: 5,
      historyMode: 'silent',
      activeThreadId: 'thread-1',
      actions: [],
      aliveContext: null,
      counts: {
        total: 0,
        visibleExecutions: 0,
        silentExecutions: 0,
        awaitingApproval: 0,
        analysisOnly: 0,
        blocked: 0,
        ephemeral: 0,
        failed: 0,
        escalated: 0,
      },
      shouldSuppressAssistantMessage: false,
    });
    localStorage.setItem('ara_cache', '1');
    sessionStorage.setItem('ara_vault_session', 'open');

    SoulTerminationService.clearLocalArtifacts();

    expect(useOrchestrationStore.getState().activeThreadId).toBeNull();
    expect(useOrchestrationStore.getState().lastTurnRuntime).toBeNull();
    expect(localStorage.getItem('ara_cache')).toBeNull();
    expect(sessionStorage.getItem('ara_vault_session')).toBeNull();
  });
});
