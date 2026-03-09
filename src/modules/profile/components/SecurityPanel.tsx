import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Unlock, KeyRound, Database, Download } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { GlassCard } from '@/core/components/GlassCard';
import { NeuralButton } from '@/core/components/NeuralButton';

const panelVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function SecurityPanel() {
  const { isUnlocked, hasVault, lockVault, persistenceMode } = useVault();

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
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">
                Vault Status
              </h3>
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/35 font-bold">
                End-to-End Encrypted
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border ${vaultBadgeBg} ${vaultStateColor}`}
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
              <span className="text-[9px] uppercase tracking-[0.2em] text-white/35 font-black">
                Key Derivation
              </span>
            </div>
            <p className="text-xs font-bold text-white/80">PBKDF2</p>
            <p className="text-[9px] text-violet-300 font-black uppercase tracking-widest">
              High Security
            </p>
          </div>

          {/* Persistence mode */}
          <div className="rounded-2xl bg-black/30 border border-white/5 p-4 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[9px] uppercase tracking-[0.2em] text-white/35 font-black">
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
              <span className="text-[9px] uppercase tracking-[0.2em] text-white/35 font-black">
                Module Access
              </span>
            </div>
            <p className="text-xs font-bold text-white/80">6 Modules</p>
            <p
              className={`text-[9px] font-black uppercase tracking-widest ${
                isUnlocked ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isUnlocked ? 'Full Access' : 'Restricted'}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Vault actions */}
      <GlassCard className="p-6">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 mb-5">
          Vault Actions
        </h3>

        <div className="space-y-3">
          {/* Lock vault */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/90">Lock Vault</p>
                <p className="text-[10px] text-white/35 uppercase tracking-widest font-bold">
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

          {/* Data export placeholder */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 border border-white/5 opacity-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Download className="w-4 h-4 text-white/40" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/60">Export Data</p>
                <p className="text-[10px] text-white/25 uppercase tracking-widest font-bold">
                  Full profile archive
                </p>
              </div>
            </div>
            <NeuralButton size="sm" variant="secondary" disabled>
              Coming Soon
            </NeuralButton>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
