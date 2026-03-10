import { useCallback } from 'react';
import { buildDocumentAnalysisPrompt, parseDocument, validateDocumentFile } from '@/lib/services/doc-ingest-service';

interface UseDocumentIntelligenceOptions {
  moduleId: string;
  onPromptReady: (prompt: string) => void;
  onError?: (message: string) => void;
}

function buildModulePrelude(moduleId: string): string {
  switch (moduleId) {
    case 'ledger':
      return 'Financial document intelligence request. Parse and map this into budgeting, cashflow, categories, and anomalies.';
    case 'scout':
      return 'Research evidence intake request. Extract claims, sources, confidence, and citation-grade findings.';
    case 'titan':
      return 'Clinical document intake request. Extract biomarkers, ranges, and medically relevant trend signals.';
    default:
      return 'Document intelligence request. Extract key facts, summarize clearly, and provide source-grounded structure.';
  }
}

export function useDocumentIntelligence({
  moduleId,
  onPromptReady,
  onError
}: UseDocumentIntelligenceOptions) {
  const openDocumentPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,.csv,.md,.markdown,.png,.jpg,.jpeg,.webp';

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const validation = validateDocumentFile(file);
      if (!validation.valid) {
        onError?.(validation.error || 'Unsupported document.');
        return;
      }

      try {
        const parsed = await parseDocument(file);
        const prompt = [
          buildModulePrelude(moduleId),
          buildDocumentAnalysisPrompt(parsed)
        ].join('\n\n');
        onPromptReady(prompt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Document parsing failed.';
        onError?.(message);
      } finally {
        input.value = '';
      }
    };

    input.click();
  }, [moduleId, onPromptReady, onError]);

  return { openDocumentPicker };
}

