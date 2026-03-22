import type { LucideIcon } from 'lucide-react';
import type { ModuleId } from '@/lib/module-manifest';
import type { FieldType } from '@/lib/field-system/types';
import type { IntakeThemeColor } from './types';

/**
 * A canonical data point that the module needs from the user.
 * The LLM enriches this into a full FieldDefinition during onboarding.
 */
export interface OnboardingDataPoint {
  /** Stable canonical ID — used as the key in onComplete(values) */
  id: string;
  /** Human-readable label — context hint for LLM field generation */
  label: string;
  /** Type hint for the LLM */
  type: FieldType;
  required: boolean;
  /** Extra hint for the LLM (e.g. "use select with ISO country codes") */
  hint?: string;
  /** Explicit options for SELECT / MULTI_SELECT fields — used in fallback and passed to FieldDefinition */
  options?: Array<{ value: string; label: string }>;
  /** Autocomplete suggestions for TEXT fields — rendered as a datalist */
  autocomplete?: string[];
}

/**
 * Static configuration for a module's onboarding experience.
 * The spec contains only data — no React hooks or callbacks.
 * Module wrappers supply onComplete and optional guided content.
 */
export interface ModuleOnboardingSpec {
  moduleId: ModuleId;
  displayName: string;
  themeColor: IntakeThemeColor;
  /** Lucide icon class (not an instance — pass the icon constructor) */
  icon: LucideIcon;
  /** One-sentence goal for LLM schema generation */
  goal: string;
  /** Paragraph of context fed to the LLM to enrich field definitions */
  context: string;
  dataPoints: OnboardingDataPoint[];
  /** Whether to show the Express / Guided mode selector */
  fastTrackEnabled: boolean;
  /** Canonical IDs that must be non-empty for Express submission */
  fastTrackRequiredIds: string[];
  /** Whether the user can skip onboarding entirely (e.g. for optional modules) */
  optional?: boolean;
}
