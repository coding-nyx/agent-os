import { useEffect, useState } from 'react';
import type { Transition, Variants } from 'framer-motion';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

export interface MotionConfig {
  /** True when animations should be skipped entirely */
  shouldReduceMotion: boolean;
  /** Detected device tier */
  tier: DeviceTier;
  /** Shared transition for panel/page-level elements */
  transition: Transition;
  /** Shared transition for small UI elements (buttons, badges, etc.) */
  microTransition: Transition;
  /** Fade + slight Y rise — safest animation pattern */
  fadeUpVariants: Variants;
  /** Simple opacity fade */
  fadeVariants: Variants;
  /** Scale-in from slightly smaller */
  scaleVariants: Variants;
}

function getDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < MOBILE_BREAKPOINT) return 'mobile';
  if (w < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

function buildConfig(reducedMotion: boolean, tier: DeviceTier): MotionConfig {
  const shouldReduceMotion = reducedMotion || tier === 'mobile';

  // Transition presets by tier
  const transition: Transition = shouldReduceMotion
    ? { duration: 0.15, ease: 'easeOut' }
    : tier === 'tablet'
      ? { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
      : { type: 'spring', stiffness: 300, damping: 30 };

  const microTransition: Transition = shouldReduceMotion
    ? { duration: 0.1, ease: 'easeOut' }
    : tier === 'tablet'
      ? { duration: 0.12, ease: 'easeOut' }
      : { type: 'spring', stiffness: 400, damping: 35 };

  const fadeUpVariants: Variants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: { opacity: 1, y: 0, transition },
    exit: { opacity: 0, y: shouldReduceMotion ? 0 : -4, transition },
  };

  const fadeVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition },
    exit: { opacity: 0, transition },
  };

  const scaleVariants: Variants = {
    hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.97 },
    visible: { opacity: 1, scale: 1, transition },
    exit: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.97, transition },
  };

  return {
    shouldReduceMotion,
    tier,
    transition,
    microTransition,
    fadeUpVariants,
    fadeVariants,
    scaleVariants,
  };
}

/**
 * Returns a device-aware motion configuration for Framer Motion.
 *
 * - Mobile (<768px) or prefers-reduced-motion: no spring, short duration
 * - Tablet (<1024px): short eased transitions, no spring
 * - Desktop: full spring physics
 *
 * Usage:
 *   const { transition, fadeUpVariants, shouldReduceMotion } = useMotionConfig();
 *   <motion.div variants={fadeUpVariants} initial="hidden" animate="visible" exit="exit" />
 *   <motion.div transition={transition} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
 */
export function useMotionConfig(): MotionConfig {
  const [reducedMotion, setReducedMotion] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false)
  );
  const [tier, setTier] = useState<DeviceTier>(() => getDeviceTier());

  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onMotionChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', onMotionChange);

    const onResize = () => setTier(getDeviceTier());
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      mql.removeEventListener('change', onMotionChange);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return buildConfig(reducedMotion, tier);
}
