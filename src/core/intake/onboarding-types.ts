import type { LucideIcon } from 'lucide-react';
import type { ModuleId } from '@/lib/module-manifest';
import type { FieldType } from '@/lib/field-system/types';
import type { IntakeThemeColor } from './types';

/**
 * A canonical data point that the module needs from the user.
 */
export interface OnboardingDataPoint {
  /** Stable canonical ID — used as the key in onComplete(values) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Field type — drives the form control rendered for this data point */
  type: FieldType;
  required: boolean;
  /** Placeholder / help text shown inside the form control */
  hint?: string;
  /** Explicit options for SELECT / MULTI_SELECT fields */
  options?: Array<{ value: string; label: string }>;
  /** Autocomplete suggestions for TEXT fields — rendered as a datalist */
  autocomplete?: string[];
  /** Section/group name for multi-section form layout — defaults to 'General' if omitted */
  section?: string;
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
  /** One-sentence goal shown in the onboarding header */
  goal: string;
  /** Paragraph of context describing this module's purpose */
  context: string;
  dataPoints: OnboardingDataPoint[];
  /** Whether to show the Express / Guided mode selector */
  fastTrackEnabled: boolean;
  /** Canonical IDs that must be non-empty for Express submission */
  fastTrackRequiredIds: string[];
  /** Whether the user can skip onboarding entirely (e.g. for optional modules) */
  optional?: boolean;
}
