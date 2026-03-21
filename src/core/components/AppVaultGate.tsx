/**
 * AppVaultGate — full-screen vault unlock screen
 *
 * Rendered at the `/vault-gate` route (outside ProtectedRoute so it is
 * always reachable). Accepts a `returnTo` query-param and navigates there
 * after a successful handshake.
 *
 * Design: dark glassmorphism — matches the rest of the Nexus aesthetic.
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, AlertTriangle } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { VaultPersistenceMode } from '@/lib/vault-context';
import { NeuralModal } from '@/core/components/NeuralModal';

export function AppVaultGate() {
  const { unlockVault, isHandshaking, persistenceMode, setPersistenceMode, destroyVault, hasVault } = useVault();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/nexus';

  const handleUnlock = async () => {
    if (!password.trim() || isHandshaking) return;
    if (!hasVault && password !== confirmPassword) {
      setError('KEYS DO NOT MATCH — PLEASE RE-ENTER');
      setPassword('');
      setConfirmPassword('');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      return;
    }
    setError('');
    try {
      await unlockVault(password);
      navigate(returnTo, { replace: true });
    } catch {
      setError('HANDSHAKE FAILED — INVALID KEY');
      setPassword('');
      setConfirmPassword('');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }
  };

  const handleResetVault = async () => {
    if (resetConfirmText !== 'DELETE VAULT') return;
    setIsResetting(true);
    try {
      await destroyVault();
      navigate('/nexus', { replace: true });
    } catch (e) {
      console.error('Failed to reset vault:', e);
      setIsResetting(false);
    }
  };

  if (isResetting) return null;

  return (
    <div className="min-h-screen bg-[#020205] flex items-center justify-center relative overflow-hidden">
      {/* Radial gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(79,70,229,0.12), transparent 70%)',
        }}
      />

      <motion.div
        className="w-full max-w-sm mx-auto px-6 flex flex-col items-center gap-6 relative z-10"
        animate={shaking ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Lock icon with ping ring */}
        <div className="relative w-16 h-16 flex items-center justify-center">
          <span className="absolute inset-0 rounded-2xl border border-indigo-500/30 animate-ping" />
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Lock className="w-7 h-7 text-white/40" aria-hidden="true" />
          </div>
        </div>

        {/* Title block */}
        <div className="text-center space-y-1">
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">
            {hasVault ? 'NEXUS VAULT' : 'INITIALIZE VAULT'}
          </div>
          <div className="text-xs text-white/25 tracking-wide px-4">
            {hasVault 
              ? 'Enter your master key to continue' 
              : 'Define your new master key to generate E2EE keys'}
          </div>
        </div>

        {/* Password input + submit */}
        <div className="w-full space-y-3">
          <NeuralInput
            type="password"
            placeholder={hasVault ? "MASTER KEY" : "NEW MASTER KEY"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && hasVault) handleUnlock(); }}
            autoFocus
            className={cn(error && 'border-rose-500/60')}
          />

          {!hasVault && (
            <NeuralInput
              type="password"
              placeholder="CONFIRM MASTER KEY"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              className={cn(error && 'border-rose-500/60')}
            />
          )}

          {error && (
            <div className="text-[10px] text-rose-400/80 tracking-widest uppercase text-center">
              {error}
            </div>
          )}

          <NeuralButton
            variant="primary"
            themeColor={hasVault ? "indigo" : "cyan"}
            className="w-full"
            onClick={handleUnlock}
            loading={isHandshaking}
            disabled={isHandshaking || !password.trim() || (!hasVault && !confirmPassword.trim())}
          >
            {isHandshaking ? 'INITIALIZING...' : (hasVault ? 'INITIALIZE HANDSHAKE' : 'GENERATE NEURAL KEYS')}
          </NeuralButton>
        </div>

        {/* Persistence mode toggle */}
        <div className="flex gap-2">
          {(['STRICT', 'SESSION'] as const satisfies VaultPersistenceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPersistenceMode(mode)}
              className={cn(
                'text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors',
                persistenceMode === mode
                  ? 'bg-white/10 border-white/20 text-white/70'
                  : 'bg-transparent border-white/10 text-white/25 hover:border-white/20 hover:text-white/40'
              )}
            >
              {mode === 'STRICT' ? '🛡 STRICT' : '⏱ SESSION'}
            </button>
          ))}
        </div>

        {/* Reset Link */}
        {hasVault && (
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="mt-4 text-[10px] text-white/20 hover:text-white/40 uppercase tracking-widest transition-colors"
          >
            Lost Master Key?
          </button>
        )}
      </motion.div>

      <AnimatePresence>
        {showReset && (
          <NeuralModal title="Reset Master Key" isOpen={showReset} onClose={() => setShowReset(false)}>
            <div
              className="w-full max-w-md bg-[#05050a] border border-rose-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Irreversible Action</h3>
                  <p className="text-[10px] text-rose-400 uppercase tracking-wider font-bold">Data Loss Warning</p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-white/60 mb-6">
                <p>
                  Resetting your vault will <strong className="text-rose-400">permanently delete</strong> your current Master Key and its cryptographic salt.
                </p>
                <p>
                  Because the vault uses true End-to-End Encryption, without your current Master Key, <strong className="text-white/90">all existing module data stored in the vault will be lost forever.</strong> We cannot recover it.
                </p>
                <p>
                  If you proceed, you will be prompted to create a new Master Key, allowing you to start fresh.
                </p>
              </div>

              <div className="space-y-3 mb-8">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  Type "DELETE VAULT" to confirm
                </label>
                <NeuralInput
                  type="text"
                  placeholder="DELETE VAULT"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  className="border-rose-500/30 focus:border-rose-500/60"
                />
              </div>

              <div className="flex justify-end gap-3">
                <NeuralButton
                  variant="ghost"
                  onClick={() => setShowReset(false)}
                >
                  Cancel
                </NeuralButton>
                <button
                  type="button"
                  disabled={resetConfirmText !== 'DELETE VAULT' || isResetting}
                  onClick={handleResetVault}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold bg-rose-500 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-rose-600 transition-colors shadow-[0_0_20px_rgba(244,63,94,0.2)]"
                >
                  {isResetting ? 'Destroying...' : 'Permanently Delete Vault'}
                </button>
              </div>
            </div>
          </NeuralModal>
        )}
      </AnimatePresence>
    </div>
  );
}
