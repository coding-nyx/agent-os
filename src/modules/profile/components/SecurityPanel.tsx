import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Unlock, KeyRound, Database, Download, ChevronDown, ChevronRight, AlertTriangle, Loader2 } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { exportUserData, downloadAsJSON } from '@/lib/services/data-export-service';
import { MODULE_MANIFEST, buildDefaultVaultLocks, type ModuleId } from '@/lib/module-manifest';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// Modules that have a security policy and a dedicated page
const securityModules = Object.entries(MODULE_MANIFEST)
  .filter(([, m]) => m.hasPage && m.securityPolicy)
  .map(([id, m]) => ({
    id: id as ModuleId,
    title: m.title,
    icon: m.icon,
    colorHex: m.colorHex,
    securityPolicy: m.securityPolicy!,
  }));

export function SecurityPanel() {
  const { isUnlocked, hasVault, lockVault, persistenceMode, getModuleKey } = useVault();
  const { user, isGuest, profile } = useAuth();
  const [vaultActionsExpanded, setVaultActionsExpanded] = useState(false);
  const [moduleSecurityExpanded, setModuleSecurityExpanded] = useState(false);
  const [securityLocks, setSecurityLocks] = useState<Record<string, boolean>>({});
  const [securitySaving, setSecuritySaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Initialise lock state from profile preferences, enforcing mandatory locks
  useEffect(() => {
    const defaults = buildDefaultVaultLocks();
    const overrides = profile?.securityPreferences?.vaultLocks ?? {};
    const merged: Record<string, boolean> = { ...defaults, ...overrides };
    securityModules.forEach((mod) => {
      if (mod.securityPolicy.mandatory) merged[mod.id] = true;
    });
    setSecurityLocks(merged);
  }, [profile?.securityPreferences]);

  const handleSecurityToggle = useCallback(
    async (moduleId: ModuleId) => {
      if (!user || isGuest || !profile) return;
      const mod = MODULE_MANIFEST[moduleId];
      if (mod.securityPolicy?.mandatory) return;

      const current = securityLocks[moduleId] ?? mod.securityPolicy?.defaultLocked ?? false;
      const next = !current;
      setSecurityLocks((prev) => ({ ...prev, [moduleId]: next }));
      setSecuritySaving(true);
      try {
        await CoreProfileService.updateSecurityPreferences(user.uid, {
          vaultLocks: { [moduleId]: next },
        });
        Spine.emit({
          type: 'SECURITY_POLICY_UPDATED',
          source: 'system',
          domain: 'system',
          data: { moduleId, locked: next },
          cascadeDepth: 0,
          priority: 'info',
        });
      } finally {
        setSecuritySaving(false);
      }
    },
    [user, isGuest, profile, securityLocks],
  );

  const handleExport = async () => {
    if (!user?.uid || isExporting) return;

    setIsExporting(true);
    setExportError(null);

    try {
      // getModuleKey returns the master CryptoKey when vault is unlocked,
      // or null when locked — gracefully degrade to metadata-only export.
      const key = await getModuleKey('agnes');
      const vaultKey = key ?? undefined;

      const bundle = await exportUserData(user.uid, vaultKey);
      const isoDate = new Date().toISOString().slice(0, 10);
      downloadAsJSON(bundle, `nexus-export-${isoDate}.json`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const vaultStateLabel = isUnlocked
    ? 'Unlocked'
    : hasVault
    ? 'Locked'
    : 'Not Initialized';

  const vaultStateColor = isUnlocked
    ? 'text-emerald-300'
    : hasVault
    ? 'text-amber-300'
    : 'text-rose-300';

  const vaultBadgeBg = isUnlocked
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : hasVault
    ? 'bg-amber-500/10 border-amber-500/20'
    : 'bg-rose-500/10 border-rose-500/20';

  const VaultIcon = isUnlocked ? Unlock : Lock;

  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Vault status card */}
      <GlassCard
        className="p-6 md:p-8"
        glow={isUnlocked}
        glowColor="rgba(139,92,246,0.15)"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isUnlocked
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-violet-500/10 border border-violet-500/20'
              }`}
            >
              <Shield
                className={`w-5 h-5 ${isUnlocked ? 'text-emerald-400' : 'text-violet-400'}`}
              />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-white font-display">
                Vault Status
              </h3>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
                End-to-End Encrypted
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.12em] border ${vaultBadgeBg} ${vaultStateColor}`}
          >
            <VaultIcon className="w-3 h-3" />
            {vaultStateLabel}
          </span>
        </div>

        {/* Vault details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Key derivation */}
          <div className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
                Key Derivation
              </span>
            </div>
            <p className="text-xs font-bold text-white/80">PBKDF2</p>
            <p className="text-[10px] text-violet-300 font-bold uppercase tracking-wider">
              High Security
            </p>
          </div>

          {/* Persistence mode */}
          <div className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
                Persistence
              </span>
            </div>
            <p className="text-xs font-bold text-white/80">{persistenceMode}</p>
            <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">
              Session Mode
            </p>
          </div>

          {/* Module access */}
          <div className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
                Module Access
              </span>
            </div>
            <p className="text-xs font-bold text-white/80">6 Modules</p>
            <p
              className={`text-[10px] font-bold uppercase tracking-wider ${
                isUnlocked ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isUnlocked ? 'Full Access' : 'Restricted'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Vault Actions — collapsible submenu */}
      <GlassCard className="p-6">
        <button
          type="button"
          onClick={() => setVaultActionsExpanded((v) => !v)}
          className="w-full flex items-center gap-3 text-left focus:outline-none focus:ring-1 focus:ring-violet-500/40 rounded-lg"
          aria-expanded={vaultActionsExpanded}
          aria-label="Toggle Vault Actions"
        >
          <div className="w-7 h-7 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
              Vault Actions
            </h3>
            <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold mt-0.5">
              Lock · Export · Reset
            </p>
          </div>
          {vaultActionsExpanded ? (
            <ChevronDown className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/30" />
          )}
        </button>

        {vaultActionsExpanded && (
          <div className="mt-4 space-y-3">
            {/* Lock vault */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/90">Lock Vault</p>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">
                    Revoke session access
                  </p>
                </div>
              </div>
              <NeuralButton
                size="sm"
                variant="danger"
                onClick={lockVault}
                disabled={!isUnlocked}
                className="shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                Lock
              </NeuralButton>
            </div>

            {/* Data export */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Download className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/90">Export All Data</p>
                  <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold">
                    {isUnlocked ? 'Full decrypted archive' : 'Metadata-only (vault locked)'}
                  </p>
                  {exportError && (
                    <p className="text-[10px] text-rose-400 font-semibold mt-0.5">{exportError}</p>
                  )}
                </div>
              </div>
              <NeuralButton
                size="sm"
                variant="secondary"
                onClick={handleExport}
                disabled={isExporting || !user}
                className="shrink-0"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {isExporting ? 'Exporting…' : 'Export'}
              </NeuralButton>
            </div>

            {/* Reset vault — destructive, future */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-950/10 border border-rose-500/10 opacity-40">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/60">Reset Vault</p>
                  <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold">
                    Wipe all encrypted data
                  </p>
                </div>
              </div>
              <NeuralButton size="sm" variant="danger" disabled>
                Coming Soon
              </NeuralButton>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Module Security — collapsible */}
      <GlassCard className="p-6">
        <button
          type="button"
          onClick={() => setModuleSecurityExpanded((v) => !v)}
          className="w-full flex items-center gap-3 text-left focus:outline-none focus:ring-1 focus:ring-violet-500/40 rounded-lg"
          aria-expanded={moduleSecurityExpanded}
          aria-label="Toggle Module Security"
        >
          <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
              Module Security
            </h3>
            <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold mt-0.5">
              Lock · Open · Mandatory
            </p>
          </div>
          {moduleSecurityExpanded ? (
            <ChevronDown className="w-4 h-4 text-white/30" />
          ) : (
            <ChevronRight className="w-4 h-4 text-white/30" />
          )}
        </button>

        {moduleSecurityExpanded && (
          <div className="mt-4 space-y-2">
            {(isGuest || !user || !profile) && (
              <p className="text-[10px] text-white/40 italic mb-3">
                Guest links cannot modify module security. Authenticate to persist preferences.
              </p>
            )}
            {securityModules.map((mod) => {
              const locked = securityLocks[mod.id] ?? mod.securityPolicy.defaultLocked;
              const disabled = mod.securityPolicy.mandatory || isGuest || !user || !profile;
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => { void handleSecurityToggle(mod.id); }}
                  disabled={disabled}
                  className={[
                    'w-full text-left p-3 rounded-2xl border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                    locked
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-white/[0.04] border-white/10 hover:border-white/20',
                    disabled ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-xl border border-white/10 flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${mod.colorHex}1f` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: mod.colorHex }} />
                      </div>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/80">
                          {mod.title}
                          {mod.securityPolicy.mandatory && (
                            <span className="ml-2 text-[9px] text-amber-400">MANDATORY</span>
                          )}
                        </div>
                        <div className="text-[9px] text-white/40 uppercase tracking-[0.2em]">
                          {locked ? 'LOCKED' : 'OPEN'}
                        </div>
                      </div>
                    </div>
                    {/* Toggle pill */}
                    <div
                      className={[
                        'w-11 h-6 rounded-full border flex items-center px-1 transition-all',
                        locked
                          ? 'bg-emerald-500/20 border-emerald-500/40'
                          : 'bg-white/5 border-white/10',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'w-4 h-4 rounded-full transition-all',
                          locked ? 'bg-emerald-400 translate-x-5' : 'bg-white/40 translate-x-0',
                        ].join(' ')}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
            {securitySaving && (
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 pt-1">
                Saving security policy…
              </p>
            )}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
