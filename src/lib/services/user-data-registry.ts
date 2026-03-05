export interface UserDataDeletionTarget {
  collection: string;
  documentId: string;
}

const MODULE_IDS = ['orchestrator', 'therapy', 'trainer', 'ledger'] as const;

const DIRECT_USER_COLLECTIONS = [
  'users',
  'global_souls',
  'vaults',
  'therapist_profiles',
  'ai_trainers',
  'ai_ledgers'
] as const;

export function getUserDataDeletionTargets(uid: string): UserDataDeletionTarget[] {
  if (!uid) return [];

  const directTargets: UserDataDeletionTarget[] = DIRECT_USER_COLLECTIONS.map((collection) => ({
    collection,
    documentId: uid
  }));

  const moduleScopedTargets: UserDataDeletionTarget[] = MODULE_IDS.flatMap((moduleId) => [
    { collection: 'module_memory', documentId: `${uid}_${moduleId}` },
    { collection: 'active_sessions', documentId: `${uid}_${moduleId}` }
  ]);

  return [...directTargets, ...moduleScopedTargets];
}
