import { CoreUserProfile, AgentPersonalityProvision, OrchestrationPreferences, UserSecurityPreferences } from '../types';
import { buildDefaultVaultLocks, MODULE_MANIFEST } from '@/lib/module-manifest';
import { getNexusDataLayer } from '../data-layer/provider';
import { NexusDataLayer } from '../data-layer';
import { Spine } from '@/lib/spine/spine-event-bus';

const COLLECTION = 'users';

const DEFAULT_PERSONALITY: AgentPersonalityProvision = {
  orchestratorAlias: 'Nexus',
  moduleAliases: {
    agnes: 'Agnes',
    titan: 'Titan',
    ledger: 'Ledger',
    atlas: 'Atlas',
    scout: 'Scout',
    forge: 'Forge',
  },
  agentGenders: {
    orchestrator: 'female',
    agnes: 'female',
    titan: 'non-binary',
    ledger: 'female',
    atlas: 'female',
    scout: 'female',
    forge: 'female',
  },
  personaOverlays: {}
};

const normalizeVaultLocks = (locks?: Record<string, boolean>): Record<string, boolean> => {
  const merged = { ...buildDefaultVaultLocks(), ...(locks || {}) };
  Object.values(MODULE_MANIFEST).forEach((module) => {
    if (module.securityPolicy?.mandatory) {
      merged[module.id] = true;
    }
  });
  return merged;
};

const normalizeSecurityPreferences = (prefs?: UserSecurityPreferences): UserSecurityPreferences => {
  const result: UserSecurityPreferences = {
    vaultLocks: normalizeVaultLocks(prefs?.vaultLocks),
    vaultSessionTtlMinutes: prefs?.vaultSessionTtlMinutes ?? 0
  };
  if (prefs?.dataSharingOverrides) {
    result.dataSharingOverrides = prefs.dataSharingOverrides;
  }
  return result;
};

const DEFAULT_ORCHESTRATION_PREFERENCES: Required<OrchestrationPreferences> = {
  autopilotLevel: 2,
  historyMode: 'standard',
};

const normalizeOrchestrationPreferences = (
  prefs?: OrchestrationPreferences,
): Required<OrchestrationPreferences> => {
  const autopilotLevel =
    typeof prefs?.autopilotLevel === 'number' &&
    Number.isInteger(prefs.autopilotLevel) &&
    prefs.autopilotLevel >= 0 &&
    prefs.autopilotLevel <= 5
      ? prefs.autopilotLevel
      : DEFAULT_ORCHESTRATION_PREFERENCES.autopilotLevel;

  const historyMode =
    prefs?.historyMode === 'silent' || prefs?.historyMode === 'standard'
      ? prefs.historyMode
      : autopilotLevel >= 5
        ? 'silent'
        : 'standard';

  return {
    autopilotLevel,
    historyMode,
  };
};

export const CoreProfileService = {
  async getProfile(uid: string, dataLayer: NexusDataLayer = getNexusDataLayer()): Promise<CoreUserProfile | null> {
    if (!uid) return null;
    const record = await dataLayer.getDocument<CoreUserProfile>(COLLECTION, uid);
    if (!record) return null;
    const { id: _discard, ...rest } = record;
    const normalized = rest as CoreUserProfile;
    return {
      ...normalized,
      securityPreferences: normalizeSecurityPreferences(normalized.securityPreferences),
      orchestrationPreferences: normalizeOrchestrationPreferences(normalized.orchestrationPreferences),
    };
  },

  subscribeProfile(
    uid: string,
    onUpdate: (profile: CoreUserProfile | null) => void,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): () => void {
    if (!uid) return () => {};
    return dataLayer.subscribeToDocument<CoreUserProfile>(COLLECTION, uid, (record) => {
      if (!record) {
        onUpdate(null);
        return;
      }
      const { id: _discard, ...rest } = record;
      const normalized = rest as CoreUserProfile;
      onUpdate({
        ...normalized,
        securityPreferences: normalizeSecurityPreferences(normalized.securityPreferences),
        orchestrationPreferences: normalizeOrchestrationPreferences(normalized.orchestrationPreferences),
      });
    });
  },

  async initializeProfile(
    uid: string,
    email: string,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<CoreUserProfile> {
    if (!uid || !email) throw new Error('Missing UID or email');
    const existing = await dataLayer.getDocument<CoreUserProfile>(COLLECTION, uid);
    if (existing) {
      console.warn('Attempted to initialize an existing profile. Aborting reset.');
      const { id: _discard, ...rest } = existing;
      return rest as CoreUserProfile;
    }

    const newProfile: CoreUserProfile = {
      uid,
      email,
      preferredName: '',
      pronouns: '',
      onboardingComplete: false,
      agentPersonalityProvision: DEFAULT_PERSONALITY,
      securityPreferences: {
        vaultLocks: buildDefaultVaultLocks(),
        vaultSessionTtlMinutes: 0
      },
      orchestrationPreferences: DEFAULT_ORCHESTRATION_PREFERENCES,
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await dataLayer.setDocument(COLLECTION, uid, newProfile);
    } catch (error) {
      console.error('[CoreProfileService] Failed to initialize profile:', error);
      throw error;
    }
    return newProfile;
  },

  async updateProfile(
    uid: string,
    updates: Partial<CoreUserProfile>,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    const patch = Object.fromEntries(
      Object.entries({ ...updates, updatedAt: new Date().toISOString() })
        .filter(([, v]) => v !== undefined)
    ) as Partial<CoreUserProfile> & { updatedAt: string };

    try {
      await dataLayer.updateDocument(COLLECTION, uid, patch);
    } catch (error) {
      console.error('[CoreProfileService] Failed to update profile:', error);
      throw error;
    }
  },

  async updatePersonality(
    uid: string,
    personality: Partial<AgentPersonalityProvision>,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    const existing = await dataLayer.getDocument<CoreUserProfile>(COLLECTION, uid);
    if (!existing) return;

    const next: CoreUserProfile = {
      ...existing,
      agentPersonalityProvision: {
        ...existing.agentPersonalityProvision,
        ...(personality.orchestratorAlias
          ? { orchestratorAlias: personality.orchestratorAlias }
          : {}),
        moduleAliases: {
          ...(existing.agentPersonalityProvision?.moduleAliases || {}),
          ...(personality.moduleAliases || {}),
        },
        agentGenders: {
          ...(existing.agentPersonalityProvision?.agentGenders || {}),
          ...(personality.agentGenders || {}),
        },
        personaOverlays: {
          ...(existing.agentPersonalityProvision?.personaOverlays || {}),
          ...(personality.personaOverlays || {}),
        },
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      await dataLayer.setDocument(COLLECTION, uid, next);
    } catch (error) {
      console.error('[CoreProfileService] Failed to update personality:', error);
    }
  },
  async updateSecurityPreferences(
    uid: string,
    prefs: Partial<UserSecurityPreferences>,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    const existing = await dataLayer.getDocument<CoreUserProfile>(COLLECTION, uid);
    if (!existing) return;

    const nextLocks = prefs.vaultLocks
      ? { ...(existing.securityPreferences?.vaultLocks || {}), ...prefs.vaultLocks }
      : existing.securityPreferences?.vaultLocks;

    const nextProfile: CoreUserProfile = {
      ...existing,
      securityPreferences: normalizeSecurityPreferences({
        ...existing.securityPreferences,
        ...(prefs ? { ...prefs, vaultLocks: nextLocks } : {}),
      }),
      updatedAt: new Date().toISOString(),
    };

    try {
      await dataLayer.setDocument(COLLECTION, uid, nextProfile);
      Spine.emit({
        type: 'SECURITY_POLICY_UPDATED',
        source: 'nexus',
        domain: 'system',
        data: {
          updatedKeys: Object.keys(prefs ?? {}),
          vaultSessionTtlMinutes: nextProfile.securityPreferences?.vaultSessionTtlMinutes ?? 0,
          vaultLocks: prefs.vaultLocks ? Object.keys(prefs.vaultLocks) : undefined,
        },
        cascadeDepth: 0,
        priority: 'info',
      });
    } catch (error) {
      console.error('[CoreProfileService] Failed to update security preferences:', error);
    }
  },

  async updateOrchestrationPreferences(
    uid: string,
    prefs: Partial<OrchestrationPreferences>,
    dataLayer: NexusDataLayer = getNexusDataLayer(),
  ): Promise<void> {
    if (!uid) return;
    const existing = await dataLayer.getDocument<CoreUserProfile>(COLLECTION, uid);
    if (!existing) return;

    const current = normalizeOrchestrationPreferences(existing.orchestrationPreferences);
    const autopilotLevel =
      typeof prefs.autopilotLevel === 'number' &&
      Number.isInteger(prefs.autopilotLevel) &&
      prefs.autopilotLevel >= 0 &&
      prefs.autopilotLevel <= 5
        ? prefs.autopilotLevel
        : current.autopilotLevel;

    const nextProfile: CoreUserProfile = {
      ...existing,
      orchestrationPreferences: normalizeOrchestrationPreferences({
        autopilotLevel,
        historyMode:
          prefs.historyMode ??
          (prefs.autopilotLevel === undefined ? current.historyMode : undefined),
      }),
      updatedAt: new Date().toISOString(),
    };

    try {
      await dataLayer.setDocument(COLLECTION, uid, nextProfile);
    } catch (error) {
      console.error('[CoreProfileService] Failed to update orchestration preferences:', error);
      throw error;
    }
  }
};
