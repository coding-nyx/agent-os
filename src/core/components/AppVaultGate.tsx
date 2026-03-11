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
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { VaultPersistenceMode } from '@/lib/vault-context';

export function AppVaultGate() {
  const { unlockVault, isHandshaking, persistenceMode, setPersistenceMode } = useVault();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/orchestrator';

  const handleUnlock = async () => {
    if (!password.trim() || isHandshaking) return;
    setError('');
    try {
      await unlockVault(password);
      navigate(returnTo, { replace: true });
    } catch {
      setError('HANDSHAKE FAILED — INVALID KEY');
      setPassword('');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }
  };

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
            NEXUS VAULT
          </div>
          <div className="text-xs text-white/25 tracking-wide">
            Enter your master key to continue
          </div>
        </div>

        {/* Password input + submit */}
        <div className="w-full space-y-3">
          <NeuralInput
            type="password"
            placeholder="MASTER KEY"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
            className={cn(error && 'border-rose-500/60')}
          />

          {error && (
            <div className="text-[10px] text-rose-400/80 tracking-widest uppercase text-center">
              {error}
            </div>
          )}

          <NeuralButton
            variant="primary"
            className="w-full"
            onClick={handleUnlock}
            loading={isHandshaking}
            disabled={isHandshaking || !password.trim()}
          >
            {isHandshaking ? 'INITIALIZING...' : 'INITIALIZE HANDSHAKE'}
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
      </motion.div>
    </div>
  );
}
