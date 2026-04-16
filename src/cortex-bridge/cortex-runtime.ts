/**
 * CortexRuntime — plain TypeScript class that owns the full AI engine lifecycle.
 *
 * Responsibilities:
 *   - Cold boot (`boot`) on first mount
 *   - Reconfiguration (`reconfigure`) when credentials, guest mode, or model/provider change
 *   - Observer pattern so React (and any other consumer) can subscribe to state changes
 *   - Vault-unlock reinit: forces a fresh engine when encryptionKey transitions null → CryptoKey
 *
 * No React imports. No side-effect imports. Pure TypeScript.
 */
import { CognitiveAgent } from './engine/CognitiveAgent';
import { EngineConfig } from './engine/types';
import { getCredentialStore } from './credential-store-bridge';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';
import { ARA_STORAGE_KEYS } from './ara-events';

// ── Public types ─────────────────────────────────────────────────────────────

export interface RuntimeConfig {
  userId: string | null;
  encryptionKey: CryptoKey | null;
  guestMode: boolean;
}

export interface CortexRuntimeState {
  agent: CognitiveAgent | null;
  provider: 'openrouter' | 'grok' | 'google' | 'mock' | null;
  modelId: string | null;
  isReady: boolean;
  initFailed: boolean;
}

// ── Internal tracking ────────────────────────────────────────────────────────

interface TrackedConfig {
  model: string | null;
  provider: string | null;
  guest: boolean;
  hasCredentialStore: boolean;
  hasEncryptionKey: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveProvider(
  config: Pick<EngineConfig, 'openrouterKey' | 'grokKey' | 'googleKey' | 'isMockMode'>,
): 'openrouter' | 'grok' | 'google' | 'mock' {
  if (config.isMockMode) return 'mock';
  if (config.openrouterKey) return 'openrouter';
  if (config.grokKey) return 'grok';
  if (config.googleKey) return 'google';
  return 'mock';
}

// ── CortexRuntime ────────────────────────────────────────────────────────────

export class CortexRuntime {
  private _state: CortexRuntimeState = {
    agent: null,
    provider: null,
    modelId: null,
    isReady: false,
    initFailed: false,
  };

  private _subscribers: Array<(state: CortexRuntimeState) => void> = [];

  /** Prevents concurrent boot/reinit calls from racing. */
  private _booting = false;

  /** If reconfigure is called while booting, the config is queued here and applied on completion. */
  private _pendingConfig: RuntimeConfig | null = null;

  /** Tracks the last config we initialised with so we can detect meaningful changes. */
  private _lastConfig: TrackedConfig | null = null;

  // ── Observer ──────────────────────────────────────────────────────────────

  subscribe(cb: (state: CortexRuntimeState) => void): () => void {
    this._subscribers.push(cb);
    return () => {
      this._subscribers = this._subscribers.filter((s) => s !== cb);
    };
  }

  getState(): CortexRuntimeState {
    return this._state;
  }

  private _emit(patch: Partial<CortexRuntimeState>): void {
    this._state = { ...this._state, ...patch };
    for (const cb of this._subscribers) {
      try {
        cb(this._state);
      } catch (e) {
        console.warn('CortexRuntime: subscriber threw', e);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Cold start — always runs on first mount regardless of prior state.
   * Sets a timeout safety net so the app degrades gracefully if init stalls.
   */
  async boot(config: RuntimeConfig): Promise<void> {
    const timer = setTimeout(() => {
      console.warn('CortexRuntime: initialization timed out after 8s. Running in degraded mode.');
      this._emit({ initFailed: true });
    }, 8000);

    try {
      await this._init(config);
    } catch (e) {
      console.warn('CortexRuntime: boot failed', e);
      this._emit({ initFailed: true });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reconfigure the engine when any of these change:
   *   - userId / encryptionKey (credential source)
   *   - guestMode
   *   - preferred_model / ara_debug_provider (localStorage)
   *
   * Special case: forces a reinit when encryptionKey transitions null → CryptoKey
   * even if an agent already exists in mock mode (vault-unlock fix).
   */
  async reconfigure(config: RuntimeConfig): Promise<void> {
    const next = this._readTrackedConfig(config);
    const prev = this._lastConfig;

    const vaultJustUnlocked = !(prev?.hasEncryptionKey ?? false) && !!config.encryptionKey;
    const agentMissing = !this._state.agent;
    const forceReinit = agentMissing || vaultJustUnlocked;

    if (!forceReinit && prev) {
      const unchanged =
        prev.model === next.model &&
        prev.provider === next.provider &&
        prev.guest === next.guest &&
        prev.hasCredentialStore === next.hasCredentialStore &&
        prev.hasEncryptionKey === next.hasEncryptionKey;
      if (unchanged) return;
    }

    if (this._booting) {
      // Boot is in progress — queue this config so it's applied once boot completes.
      this._pendingConfig = config;
      return;
    }

    try {
      await this._init(config);
    } catch (e) {
      console.warn('CortexRuntime: reconfigure failed', e);
      this._emit({ initFailed: true });
    }
  }

  /**
   * Unconditional reinit — use when credentials change (API key saved/deleted).
   * Clears _lastConfig so the next change-detection cycle always reinits.
   */
  async forceReinit(config: RuntimeConfig): Promise<void> {
    this._lastConfig = null;
    await this.reconfigure(config);
  }

  /**
   * Clears in-memory credentials from the KMP engine singleton. Call on logout.
   */
  static clearCredentials(): void {
    CognitiveAgent.clearCredentials();
  }

  // ── Private init (shared by boot + reconfigure) ───────────────────────────

  private async _init(config: RuntimeConfig): Promise<void> {
    if (this._booting) return;
    this._booting = true;
    this._pendingConfig = null;

    try {
      const { userId, encryptionKey, guestMode } = config;

      // Direct key resolution — env vars and localStorage (plain text).
      // Checked first so that VITE_* keys in .env.local take immediate effect
      // without waiting for async credential store resolution.
      const openrouterKey = resolveOpenRouterKey();
      const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
      const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;
      const hasDirectKeys = !!(openrouterKey || grokKey || googleKey);

      // Credential store — encrypted Firestore-backed key resolution.
      // Only used when there are no direct plain-text keys available AND the user
      // has a session (userId), so keys are resolved from encrypted vault storage.
      const credentialStore = !hasDirectKeys ? getCredentialStore(userId, encryptionKey) : null;

      const preferredProvider = (localStorage.getItem(ARA_STORAGE_KEYS.DEBUG_PROVIDER) as 'openrouter' | 'grok' | 'google' | null) || undefined;
      const safePreferredProvider =
        preferredProvider === 'openrouter' && !openrouterKey ? undefined : preferredProvider;

      const engineConfig: EngineConfig = credentialStore
        ? {
            credentialStore,
            preferredModelId: localStorage.getItem(ARA_STORAGE_KEYS.PREFERRED_MODEL) || undefined,
            preferredProvider: safePreferredProvider,
            isMockMode: false,
            freeModelsOnly: guestMode,
          }
        : {
            openrouterKey,
            grokKey,
            googleKey,
            preferredModelId: localStorage.getItem(ARA_STORAGE_KEYS.PREFERRED_MODEL) || undefined,
            preferredProvider: safePreferredProvider,
            isMockMode: !openrouterKey && !grokKey && !googleKey,
            freeModelsOnly: guestMode,
          };

      const newAgent = new CognitiveAgent(engineConfig);
      await newAgent.initialize();

      const resolvedModelId = engineConfig.freeModelsOnly
        ? 'google/gemini-2.0-flash:free'
        : (engineConfig.preferredModelId ?? null);

      const resolvedProvider: 'openrouter' | 'grok' | 'google' | 'mock' = credentialStore
        ? (safePreferredProvider ?? 'openrouter')
        : deriveProvider(engineConfig);

      this._lastConfig = this._readTrackedConfig(config);

      this._emit({
        agent: newAgent,
        provider: resolvedProvider,
        modelId: resolvedModelId,
        isReady: true,
        initFailed: false,
      });
    } finally {
      this._booting = false;
      // Apply any config that arrived while we were initializing (e.g. vault unlocked mid-boot).
      if (this._pendingConfig) {
        const pending = this._pendingConfig;
        this._pendingConfig = null;
        void this.reconfigure(pending);
      }
    }
  }

  private _readTrackedConfig(config: RuntimeConfig): TrackedConfig {
    return {
      model: localStorage.getItem(ARA_STORAGE_KEYS.PREFERRED_MODEL),
      provider: localStorage.getItem(ARA_STORAGE_KEYS.DEBUG_PROVIDER),
      guest: config.guestMode,
      // Mirror the init-time logic: credential store is only used when no direct keys exist.
      hasCredentialStore: !resolveOpenRouterKey() && !!getCredentialStore(config.userId, config.encryptionKey),
      hasEncryptionKey: !!config.encryptionKey,
    };
  }
}
