/**
 * Atlas design tokens — unified spacing, typography, and layout.
 * Use these classes or CSS vars for size-intelligent, responsive Atlas UI.
 */

export const ATLAS_TOKENS = {
  /** Page horizontal padding (responsive) */
  pageX: 'var(--atlas-space-page-x)',
  /** Page vertical padding */
  pageY: 'var(--atlas-space-page-y)',
  /** Section gap (between major blocks) */
  section: 'var(--atlas-space-section)',
  /** Block gap (within sections) */
  block: 'var(--atlas-space-block)',
  /** Minimum touch target (px equivalent ~44) */
  touch: 'var(--atlas-space-touch)',
  /** Max content width */
  containerMax: 'var(--atlas-container-max)',
} as const;

/** Tailwind-compatible class names using design tokens */
export const atlasLayout = {
  /** Main scroll container padding */
  contentPadding: 'px-[var(--atlas-space-page-x)] py-[var(--atlas-space-page-y)]',
  /** Section vertical spacing */
  sectionGap: 'space-y-[var(--atlas-space-section)]',
  /** Block vertical spacing */
  blockGap: 'space-y-[var(--atlas-space-block)]',
  /** Constrained content width + horizontal padding */
  container: 'w-full max-w-[var(--atlas-container-max)] mx-auto px-[var(--atlas-space-page-x)]',
  /** Tab strip: overflow scroll with smooth scroll; add scroll-pl-* on nav for first-tab padding */
  tabStrip: 'overflow-x-auto overflow-y-hidden scroll-smooth',
  /** Section heading — label (small caps) */
  sectionLabel: 'text-[length:var(--atlas-type-label)] font-semibold uppercase tracking-[0.12em] text-[var(--atlas-text-secondary)]',
  /** Section heading — title */
  sectionTitle: 'text-[length:var(--atlas-type-subhead)] font-bold text-[var(--atlas-text-primary)]',
  /** Card surface */
  card: 'rounded-[var(--atlas-radius-card)] border border-[var(--surface-card-border)] bg-[var(--surface-card-bg)]',
} as const;
