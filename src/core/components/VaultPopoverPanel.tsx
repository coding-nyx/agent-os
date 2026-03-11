/**
 * VaultPopoverPanel
 *
 * Compact, three-state vault control designed to live inside the profile
 * popover (SystemCommandCenter).  Each state is an independent sub-component
 * so React can fully unmount / remount on state transitions, giving framer-
 * motion clean enter/exit animations.
 *
 * States
 * ──────
 *   no-vault  → user has never initialised a vault
 *   locked    → vault exists but the master key is not in memory
 *   unlocked  → vault is open; persistence mode toggle is shown
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Lock, LockOpen, Shield, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVault } from '@/lib/vault-context';
import type { VaultPersistenceMode } from '@/lib/vault-context';
import { NeuralButton } from './NeuralButton';
import { NeuralInput } from './NeuralInput';

// ── Shared motion config ─────────────────────────────────────────────────────

const PANEL_VARIANTS = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
} as const;

const PANEL_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const;

// ── State 1 — No vault ───────────────────────────────────────────────────────

interface NoVaultPanelProps {
  onInit: () => void;
}

function NoVaultPanel({ onInit }: NoVaultPanelProps): React.ReactElement {
  return (
    <motion.div
      key="no-vault"
      variants={PANEL_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={PANEL_TRANSITION}
      className="bg-amber-500/[0.08] border border-amber-500/[0.15] rounded-xl p-3 space-y-2"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" aria-hidden="true" />
        <span className="text-[8px] font-black uppercase tracking-widest text-amber-400/70">
          Unencrypted
        </span>
      </div>

      {/* Body */}
      <p className="text-[9px] text-white/50 leading-relaxed">
        Your data is stored unencrypted.
      </p>

      {/* CTA */}
      <NeuralButton
        size="sm"
        themeColor="amber"
        className="w-full text-[10px] h-8 min-h-0"
        onClick={onInit}
        aria-label="Initialize vault"
      >
        Initialize Vault →
      </NeuralButton>
    </motion.div>
  );
}

// ── State 2 — Vault locked ───────────────────────────────────────────────────

interface LockedVaultPanelProps {
  onUnlock: (password: string) => Promise<void>;
}

function LockedVaultPanel({ onUnlock }: LockedVaultPanelProps): React.ReactElement {
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = useCallback(async (): Promise<void> => {
    if (!password.trim()) return;
    setUnlockError(null);
    setIsSubmitting(true);
    try {
      await onUnlock(password);
    } catch {
      setUnlockError('Invalid key');
    } finally {
      setIsSubmitting(false);
    }
  }, [password, onUnlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') void handleUnlock();
    },
    [handleUnlock],
  );

  return (
    <motion.div
      key="locked"
      variants={PANEL_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={PANEL_TRANSITION}
      className="bg-red-500/[0.08] border border-red-500/[0.15] rounded-xl p-3 space-y-2"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 text-red-400/70 flex-shrink-0" aria-hidden="true" />
        <span className="text-[8px] font-black uppercase tracking-widest text-red-400/70">
          Vault Locked
        </span>
      </div>

      {/* Password field */}
      <NeuralInput
        type="password"
        placeholder="master key"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (unlockError) setUnlockError(null);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="current-password"
        aria-label="Master key"
        className="h-8 min-h-0 text-xs rounded-xl py-0"
      />

      {/* Inline error */}
      {unlockError !== null && (
        <p role="alert" className="text-[9px] text-rose-400/70">
          {unlockError}
        </p>
      )}

      {/* Unlock button */}
      <NeuralButton
        size="sm"
        themeColor="rose"
        className="w-full text-[10px] h-8 min-h-0"
        loading={isSubmitting}
        onClick={() => void handleUnlock()}
        aria-label="Unlock vault"
      >
        Unlock →
      </NeuralButton>
    </motion.div>
  );
}

// ── State 3 — Vault unlocked ─────────────────────────────────────────────────

type SupportedPersistenceMode = Extract<VaultPersistenceMode, 'STRICT' | 'SESSION'>;

interface PersistencePillProps {
  mode: SupportedPersistenceMode;
  active: boolean;
  onSelect: (mode: SupportedPersistenceMode) => void;
  icon: React.ReactNode;
  label: string;
}

function PersistencePill({
  mode,
  active,
  onSelect,
  icon,
  label,
}: PersistencePillProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      aria-pressed={active}
      className={[
        'flex items-center gap-1 px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider',
        'transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-indigo-500/50',
        active
          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
          : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

interface UnlockedVaultPanelProps {
  onLock: () => void;
  persistenceMode: VaultPersistenceMode;
  onSetPersistence: (mode: SupportedPersistenceMode) => void;
}

function UnlockedVaultPanel({
  onLock,
  persistenceMode,
  onSetPersistence,
}: UnlockedVaultPanelProps): React.ReactElement {
  return (
    <motion.div
      key="unlocked"
      variants={PANEL_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={PANEL_TRANSITION}
      className="bg-emerald-500/[0.08] border border-emerald-500/[0.15] rounded-xl p-3 space-y-2.5"
    >
      {/* Header row + lock button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LockOpen className="w-3.5 h-3.5 text-emerald-400/70 flex-shrink-0" aria-hidden="true" />
          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/70">
            Vault Secured
          </span>
        </div>

        <NeuralButton
          size="sm"
          variant="ghost"
          className="h-7 px-3 text-[9px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20"
          onClick={onLock}
          aria-label="Lock vault"
        >
          Lock
        </NeuralButton>
      </div>

      {/* Persistence pill toggle */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[8px] text-white/40 uppercase tracking-widest">
          Persist:
        </span>
        <PersistencePill
          mode="STRICT"
          active={persistenceMode === 'STRICT'}
          onSelect={onSetPersistence}
          icon={<Shield className="w-2.5 h-2.5" aria-hidden="true" />}
          label="Strict"
        />
        <PersistencePill
          mode="SESSION"
          active={persistenceMode === 'SESSION'}
          onSelect={onSetPersistence}
          icon={<Clock className="w-2.5 h-2.5" aria-hidden="true" />}
          label="Session"
        />
      </div>
    </motion.div>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

/**
 * VaultPopoverPanel
 *
 * Drop this inside any popover/panel that already has VaultProvider as an
 * ancestor.  It reads vault state from context and renders the appropriate
 * sub-panel, animating between them on state transitions.
 */
export function VaultPopoverPanel(): React.ReactElement {
  const {
    hasVault,
    isUnlocked,
    lockVault,
    unlockVault,
    persistenceMode,
    setPersistenceMode,
    initializeVault,
  } = useVault();

  const navigate = useNavigate();
  const location = useLocation();

  /** Lock and redirect so the user can re-enter their key if needed. */
  const handleLock = useCallback((): void => {
    lockVault();
    navigate(
      '/vault-gate?returnTo=' + encodeURIComponent(location.pathname),
    );
  }, [lockVault, navigate, location.pathname]);

  const handleSetPersistence = useCallback(
    (mode: SupportedPersistenceMode): void => {
      setPersistenceMode(mode);
    },
    [setPersistenceMode],
  );

  return (
    <AnimatePresence mode="wait">
      {!hasVault && (
        <NoVaultPanel onInit={initializeVault} />
      )}

      {hasVault && !isUnlocked && (
        <LockedVaultPanel onUnlock={unlockVault} />
      )}

      {hasVault && isUnlocked && (
        <UnlockedVaultPanel
          onLock={handleLock}
          persistenceMode={persistenceMode}
          onSetPersistence={handleSetPersistence}
        />
      )}
    </AnimatePresence>
  );
}
