import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Unlock, Download, ChevronDown, ChevronRight, AlertTriangle, Loader2, Skull } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';
import { exportUserData, downloadAsJSON } from '@/lib/services/data-export-service';
import { SoulTerminationService } from '@/lib/services/soul-termination-service';

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function SecurityPanel() {
  const { isUnlocked, hasVault, lockVault, persistenceMode, getMasterKey } = useVault();
  const { user, isGuest, logout } = useAuth();
  const [vaultActionsExpanded, setVaultActionsExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!user?.uid || isExporting) return;

    setIsExporting(true);
    setExportError(null);

    try {
      // getMasterKey returns the master CryptoKey when vault is unlocked,
      // or null when locked — gracefully degrade to metadata-only export.
      const key = await getMasterKey();
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

        {/* Simplified vault info row */}
        <div className="flex items-center gap-4 p-3 rounded-2xl bg-black/30 border border-white/5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
            Encryption
          </span>
          <span className="text-[10px] font-bold text-white/70">PBKDF2 + AES-GCM</span>
          <span className="mx-1 text-white/15">·</span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-white/35 font-semibold">
            Persistence
          </span>
          <span className="text-[10px] font-bold text-white/70">{persistenceMode}</span>
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

      {/* Danger Zone */}
      <GlassCard className="p-6 border border-rose-500/20 bg-rose-500/5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-7 h-7 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <Skull className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-400">
              Danger Zone
            </h3>
            <p className="text-[9px] text-white/25 uppercase tracking-wider font-semibold mt-0.5">
              Irreversible actions
            </p>
          </div>
        </div>

        {!confirmTerminate ? (
          <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
            <div>
              <p className="text-sm font-bold text-rose-300">Terminate Neural Soul</p>
              <p className="text-[10px] text-white/35 uppercase tracking-wider font-semibold mt-0.5">
                Permanently delete all data
              </p>
            </div>
            <NeuralButton
              size="sm"
              variant="danger"
              onClick={() => setConfirmTerminate(true)}
              disabled={isGuest || !user}
              className="shrink-0"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              TERMINATE NEURAL SOUL
            </NeuralButton>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-rose-300">Are you absolutely sure?</p>
                <p className="text-[11px] text-white/60 mt-1">
                  This permanently deletes all your data and cannot be undone.
                </p>
                {terminateError && (
                  <p className="text-[10px] text-rose-400 font-semibold mt-1.5">{terminateError}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NeuralButton
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!user?.uid) return;
                  setIsTerminating(true);
                  setTerminateError(null);
                  try {
                    await SoulTerminationService.terminateSoul(user.uid);
                    await logout();
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Termination failed';
                    setTerminateError(message);
                    setIsTerminating(false);
                  }
                }}
                disabled={isTerminating}
                className="shrink-0"
              >
                {isTerminating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Skull className="w-3.5 h-3.5" />
                )}
                {isTerminating ? 'Terminating…' : 'YES, TERMINATE'}
              </NeuralButton>
              <NeuralButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setConfirmTerminate(false);
                  setTerminateError(null);
                }}
                disabled={isTerminating}
                className="shrink-0"
              >
                Cancel
              </NeuralButton>
            </div>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
