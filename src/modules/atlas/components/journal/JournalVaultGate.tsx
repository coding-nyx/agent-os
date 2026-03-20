/**
 * JournalVaultGate — Vault lock panel for the Atlas Journal tab.
 *
 * Mirrors the pattern from VaultLockedShell but is purpose-built for
 * the journal context: violet accent, journal-specific copy, and a
 * direct "Unlock Journal" CTA that calls useVault().unlockVault via
 * the AppVaultGate flow (which doesn't expose requestUnlock directly —
 * we open the vault overlay via the vault context).
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Lock, BookOpen } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { NeuralButton } from '@/core/components/NeuralButton';

export function JournalVaultGate() {
  const { unlockVault, hasVault } = useVault();

  function handleUnlock() {
    if (hasVault) {
      // Trigger the vault unlock modal by dispatching a synthetic vault event.
      // The vault context's AppVaultGate intercepts this and surfaces the
      // password prompt. We signal intent by calling unlockVault with empty
      // string — the AppVaultGate renders on top when !isUnlocked, so simply
      // triggering a re-render of the gate is sufficient. In practice the
      // parent AtlasPage already gates on isLocked, so the user should see
      // the global vault unlock UI. We expose a button here as a convenience
      // fallback that dispatches a custom event the AppVaultGate listens to.
      window.dispatchEvent(new CustomEvent('nexus:vault:request-unlock', { detail: { scope: 'atlas' } }));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="h-full flex items-center justify-center p-8"
    >
      <div className="flex flex-col items-center gap-6 text-center max-w-xs">
        {/* Icon badge */}
        <div className="relative w-20 h-20 rounded-3xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-violet-400/60" aria-hidden />
          <span className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-black/60 border border-violet-500/30 flex items-center justify-center">
            <Lock className="w-4 h-4 text-violet-400/70" aria-hidden />
          </span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-base font-bold tracking-tight text-violet-300 font-display uppercase">
            Your Journal is Private
          </h2>
          <p className="text-xs text-white/40 leading-relaxed">
            Journal entries are end-to-end encrypted in your personal vault.
            Unlock to read and write reflections.
          </p>
        </div>

        {/* Metadata hint */}
        <p className="text-[10px] text-white/25 uppercase tracking-widest font-medium">
          Atlas · Cognitive Domain
        </p>

        {/* CTA */}
        <NeuralButton
          onClick={handleUnlock}
          variant="outline"
          className="px-6 py-2.5 rounded-xl bg-violet-500/15 border border-violet-500/30 hover:bg-violet-500/25 hover:border-violet-500/50 transition-all text-sm font-semibold text-violet-300 hover:text-violet-200 tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          Unlock Journal
        </NeuralButton>
      </div>
    </motion.div>
  );
}
