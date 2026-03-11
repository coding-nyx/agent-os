/**
 * useDocumentIntelligence (S10-003)
 *
 * React hook that wraps the document-intelligence-service pipeline and exposes
 * reactive state so components can render loading / error / result feedback
 * without managing their own async lifecycle.
 *
 * API:
 *   const { parseDocument, isProcessing, lastResult, error } = useDocumentIntelligence();
 *
 * `parseDocument` mirrors the service signature but additionally:
 *   - sets isProcessing true for the duration of the call
 *   - stores the result in lastResult on success
 *   - stores a human-readable message in error on failure
 *   - resolves to null on failure so callers can check `if (result)` safely
 */

import { useState, useCallback } from 'react';
import {
  parseDocument as parseDocumentService,
  type DocumentParseHints,
  type DocumentParseResult,
} from '@/lib/services/document-intelligence-service';

export type { DocumentParseHints, DocumentParseResult };

export interface UseDocumentIntelligenceReturn {
  parseDocument: (
    file: File,
    hints: DocumentParseHints,
    sendMessage?: (prompt: string) => Promise<string>,
  ) => Promise<DocumentParseResult | null>;
  isProcessing: boolean;
  lastResult: DocumentParseResult | null;
  error: string | null;
}

/**
 * Returns a stable `parseDocument` wrapper plus `isProcessing`, `lastResult`,
 * and `error` reactive state.
 *
 * The hook is stateless with regard to auth or data layers — callers own the
 * decision of what to do with `lastResult`.
 */
export function useDocumentIntelligence(): UseDocumentIntelligenceReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<DocumentParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseDocument = useCallback(
    async (
      file: File,
      hints: DocumentParseHints,
      sendMessage?: (prompt: string) => Promise<string>,
    ): Promise<DocumentParseResult | null> => {
      setIsProcessing(true);
      setError(null);

      try {
        const result = await parseDocumentService(file, hints, sendMessage);
        setLastResult(result);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Document parsing failed.';
        setError(message);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  return { parseDocument, isProcessing, lastResult, error };
}

