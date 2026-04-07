import type { ReactNode } from 'react';
import type { ModuleTheme } from '@/lib/module-manifest';
import type { DocumentParseResult } from '@/lib/services/doc-ingest-service';

// ---------------------------------------------------------------------------
// Context Policy
// ---------------------------------------------------------------------------

/**
 * Controls what base context the AI can see during a diagnosis session.
 * - `isolated`      → AI sees ONLY the document + diagnosis conversation
 * - `with-context`  → AI also sees the user's base profile data
 */
export type DiagnosisContextPolicy = 'isolated' | 'with-context';

// ---------------------------------------------------------------------------
// Extracted Data
// ---------------------------------------------------------------------------

/** A single piece of structured data extracted by the AI during diagnosis. */
export interface ExtractedDataItem {
  id: string;
  /** Domain-specific type: 'biomarker', 'lab_summary', 'transaction', 'finding', etc. */
  type: string;
  /** Human-readable label for the merge review dialog. */
  label: string;
  /** The raw structured payload (module interprets this on merge). */
  data: Record<string, unknown>;
  /** Source document filename or 'ai_extraction'. */
  source: string;
  extractedAt: string;
}

/** Accumulator for all extractions within a single diagnosis session. */
export interface ExtractedDataBag {
  items: ExtractedDataItem[];
  /** Free-form module-specific metadata (e.g. overall risk level). */
  metadata: Record<string, unknown>;
}

export function createEmptyBag(): ExtractedDataBag {
  return { items: [], metadata: {} };
}

// ---------------------------------------------------------------------------
// Diagnosis Session
// ---------------------------------------------------------------------------

export type DiagnosisSessionPhase = 'idle' | 'active' | 'reviewing';

export interface DiagnosisSessionState {
  phase: DiagnosisSessionPhase;
  contextPolicy: DiagnosisContextPolicy;
  extractedData: ExtractedDataBag;
  activeDocumentId: string | null;
}

// ---------------------------------------------------------------------------
// Module Specialization
// ---------------------------------------------------------------------------

export interface DiagnosisEmptyStateConfig {
  title: string;
  subtitle?: string;
  examples: string[];
  supportedTypes: Array<{ label: string; desc: string }>;
}

/**
 * Each module registers one of these to declare how it participates in
 * the shared diagnosis engine.
 */
export interface DiagnosisSpecialization {
  /** Must match the module's canonical id. */
  moduleId: string;
  /** Display label: "Medical Analysis", "Financial Analysis", etc. */
  label: string;
  description: string;

  /** MIME-type prefixes or extensions the specialization accepts. */
  supportedFileTypes: string[];
  /** Override the default 15 MB limit. */
  maxFileSize?: number;

  // -- Prompt -----------------------------------------------------------------

  buildSystemPrompt: (opts: {
    contextPolicy: DiagnosisContextPolicy;
    profile: unknown | null;
    extractedData: ExtractedDataBag;
  }) => string;

  // -- Actions ----------------------------------------------------------------

  /** Action types this specialization may emit (schema-guard allowlist). */
  allowedActions: string[];

  /**
   * Called after every AI action execution to accumulate structured data.
   * Return a **new** bag — do not mutate the input.
   */
  extractData: (
    actionType: string,
    payload: Record<string, unknown>,
    current: ExtractedDataBag,
    context?: { userId?: string },
  ) => ExtractedDataBag;

  // -- Lifecycle --------------------------------------------------------------

  /**
   * Optional lifecycle hook called after document extraction completes.
   * Can be used to generate summaries, run additional analysis, or enrich metadata.
   * 
   * @param opts.extractedData - The current extracted data bag
   * @param opts.rawText - The full extracted document text
   * @param opts.documentType - The detected document type (pdf, image, etc.)
   * @param opts.sendMessage - Function to send prompts to the LLM
   * @returns Updated ExtractedDataBag with enriched metadata (e.g., summary)
   */
  onAfterExtraction?: (opts: {
    extractedData: ExtractedDataBag;
    rawText: string;
    documentType: string;
    sendMessage: (prompt: string) => Promise<string>;
  }) => Promise<ExtractedDataBag>;

  // -- Merge ------------------------------------------------------------------

  /**
   * Persist user-approved items into the module's base profile / context.
   * For read-only modules (e.g. Scout) this should be undefined.
   */
  mergeToBase?: (
    userId: string,
    items: ExtractedDataItem[],
    encryptionKey?: CryptoKey | null,
  ) => Promise<void>;

  // -- Optional overrides -----------------------------------------------------

  /** Custom document→prompt formatter. Falls back to `buildDocumentAnalysisPrompt`. */
  buildFileAnalysisPrompt?: (result: DocumentParseResult) => string;

  themeColor?: ModuleTheme;
  emptyState?: DiagnosisEmptyStateConfig;
}
