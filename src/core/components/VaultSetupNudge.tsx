import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ShieldPlus, X } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { NeuralButton } from './NeuralButton';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VaultSetupNudgeProps {
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation variants
//
// Mobile: slides up from below the viewport (y: '100%' → y: 0)
// Desktop: fades + scales into center (opacity + scale)
// We use CSS media-query-equivalent via two separate `variants` objects and
// apply them conditionally with a custom `useMediaQuery`-free approach:
// Framer Motion's `custom` prop + a `variants` factory gives us clean
// per-breakpoint logic without additional hooks.
// ─────────────────────────────────────────────────────────────────────────────

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Card animation — mobile (slide up) */
const cardVariantsMobile = {
  hidden: { y: '100%', opacity: 1 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, damping: 28, stiffness: 260 } },
  exit: { y: '100%', opacity: 1, transition: { duration: 0.22, ease: 'easeIn' as const } },
};

/** Card animation — desktop (fade + scale) */
const cardVariantsDesktop = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: 'easeOut' as const } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15, ease: 'easeIn' as const } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VaultSetupNudge
 *
 * One-time informational modal prompting the user to enable vault encryption.
 * - Non-blocking: always provides a "Skip for now" escape hatch.
 * - Respects `vaultSetupNudgeSeen` from VaultContext so it shows at most once
 *   per browser profile lifetime (stored in localStorage).
 * - Animations: slides up on mobile, fades in centred on desktop (md+).
 *
 * Complexity: O(1) — pure render, no data fetching.
 */
export function VaultSetupNudge({ onClose }: VaultSetupNudgeProps) {
  const { initializeVault, dismissVaultSetupNudge } = useVault();

  // Detect desktop breakpoint synchronously via matchMedia (no re-render cost).
  // matchMedia is always available in a browser context; guarded for SSR/test envs.
  const isDesktop =
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

  const cardVariants = isDesktop ? cardVariantsDesktop : cardVariantsMobile;

  const handleEnable = useCallback(() => {
    initializeVault();
    onClose();
  }, [initializeVault, onClose]);

  const handleSkip = useCallback(() => {
    dismissVaultSetupNudge();
    onClose();
  }, [dismissVaultSetupNudge, onClose]);

  const handleDismiss = useCallback(() => {
    dismissVaultSetupNudge();
    onClose();
  }, [dismissVaultSetupNudge, onClose]);

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <motion.div
        key="vault-nudge-backdrop"
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[var(--z-modal)]"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.2 }}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <motion.div
        key="vault-nudge-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-nudge-heading"
        aria-describedby="vault-nudge-body"
        className={[
          'fixed bottom-0 inset-x-0',
          'md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-sm',
          'w-full bg-[#0a0a12] border border-white/10',
          'rounded-t-2xl md:rounded-2xl p-6 z-[var(--z-modal)]',
        ].join(' ')}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close vault setup prompt"
          className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
          <ShieldPlus size={22} className="text-indigo-400" />
        </div>

        {/* Heading */}
        <h2
          id="vault-nudge-heading"
          className="text-white font-semibold text-base mb-2 leading-snug"
        >
          Secure your data
        </h2>

        {/* Body copy */}
        <div id="vault-nudge-body" className="text-white/60 text-sm leading-relaxed space-y-2 mb-6">
          <p>
            Add a master vault key to encrypt all your Nexus data. Only you can decrypt it
            — even Nexus can&apos;t read it.
          </p>
          <p>If you skip, your data is stored in standard cloud storage.</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <NeuralButton
            variant="primary"
            themeColor="indigo"
            size="md"
            className="w-full"
            onClick={handleEnable}
          >
            Enable vault encryption
          </NeuralButton>

          <NeuralButton
            variant="ghost"
            size="md"
            className="w-full"
            onClick={handleSkip}
          >
            Skip for now
          </NeuralButton>
        </div>
      </motion.div>
    </>
  );
}
