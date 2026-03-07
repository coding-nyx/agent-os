export interface UserDataDeletionTarget {
  collection: string;
  documentId: string;
}

const MODULE_IDS = ['orchestrator', 'agnes', 'titan', 'ledger', 'atlas', 'scout', 'forge', 'pulse'] as const;

const DIRECT_USER_COLLECTIONS = [
  'users',
  'global_souls',
  'vaults',
  'agnes_profiles',
  'titan_profiles',
  'ledger_profiles',
  'soma_profiles',
  'atlas_profiles',
  'scout_knowledge',
  'forge_sessions',
  'pulse_profiles',
  'semantic_memory',
  'spine_events',
  'belief_graphs'
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
