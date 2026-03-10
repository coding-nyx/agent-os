/**
 * DocumentContextInjectionService
 *
 * Formats document analysis results for injection into other module prompts.
 * This is a pure formatting layer — it does not perform analysis, storage, or RAG.
 *
 * Usage:
 *   const snippet = DocumentContextInjectionService.formatForModule('ledger', documents);
 *   // Inject snippet into the module's system prompt or context block.
 */

export interface InjectedDocumentRecord {
  /** Filename or extracted title */
  title: string;
  /** Domain classification: financial | research | medical | legal | general */
  domain?: string;
  /** Raw extracted text (may be truncated) */
  extractedText?: string;
  /** Structured metadata extracted during ingestion */
  metadata?: {
    extractedTitle?: string | null;
    fileType?: string;
    pageCount?: number | null;
    wordCount?: number;
    parsedAt?: string;
  };
  /** Analysis payload attached by Archivist action tags */
  analysisPayload?: Record<string, unknown>;
}

// ─── Internal formatters ──────────────────────────────────────────────────────

function formatForLedger(documents: InjectedDocumentRecord[]): string {
  if (documents.length === 0) return '';

  const sections: string[] = [
    '[DOCUMENT CONTEXT — FINANCIAL]',
    'The following financial documents were analyzed by Archivist and are provided for Ledger context:',
    ''
  ];

  for (const doc of documents) {
    const payload = doc.analysisPayload as Record<string, unknown> | undefined;
    sections.push(`Document: ${doc.title}`);

    if (payload) {
      const currency = (payload.currency as string | undefined) ?? 'USD';
      const periodLabel = (payload.periodLabel as string | undefined) ?? 'unspecified period';
      const totalAmount = payload.totalAmount;
      const documentType = payload.documentType as string | undefined;
      const anomalies = (payload.anomalies as string[] | undefined) ?? [];

      if (documentType) sections.push(`  Type: ${documentType}`);
      sections.push(`  Period: ${periodLabel}`);
      if (totalAmount !== undefined && totalAmount !== null) {
        sections.push(`  Total: ${currency} ${totalAmount}`);
      }

      const lineItems = payload.lineItems as Array<{
        description: string;
        amount: number;
        category?: string;
      }> | undefined;

      if (lineItems && lineItems.length > 0) {
        sections.push('  Line Items:');
        for (const item of lineItems.slice(0, 20)) {
          const cat = item.category ? ` [${item.category}]` : '';
          sections.push(`    - ${item.description}: ${currency} ${item.amount}${cat}`);
        }
        if (lineItems.length > 20) {
          sections.push(`    ... and ${lineItems.length - 20} more items`);
        }
      }

      if (anomalies.length > 0) {
        sections.push('  Anomalies flagged:');
        for (const a of anomalies) {
          sections.push(`    ⚠ ${a}`);
        }
      }
    } else if (doc.extractedText) {
      // Fallback: inject truncated raw text for basic context
      const preview = doc.extractedText.slice(0, 600).replace(/\n+/g, ' ').trim();
      sections.push(`  Extracted content (preview): ${preview}…`);
    }

    sections.push('');
  }

  sections.push('[END DOCUMENT CONTEXT]');
  return sections.join('\n');
}

function formatForScout(documents: InjectedDocumentRecord[]): string {
  if (documents.length === 0) return '';

  const sections: string[] = [
    '[DOCUMENT CONTEXT — RESEARCH]',
    'The following research documents were analyzed by Archivist and are provided for Scout context:',
    ''
  ];

  for (const doc of documents) {
    const payload = doc.analysisPayload as Record<string, unknown> | undefined;
    sections.push(`Document: ${doc.title}`);

    if (payload) {
      const title = (payload.title as string | undefined) ?? doc.title;
      const authors = (payload.authors as string[] | undefined) ?? [];
      const year = payload.year as number | null | undefined;
      const keyFindings = (payload.keyFindings as string[] | undefined) ?? [];
      const confidenceLevel = (payload.confidenceLevel as string | undefined) ?? 'unknown';
      const evidenceQuality = (payload.evidenceQuality as string | undefined) ?? 'unknown';
      const limitations = (payload.limitations as string[] | undefined) ?? [];
      const citationCount = payload.citationCount as number | null | undefined;

      sections.push(`  Title: ${title}`);
      if (authors.length > 0) sections.push(`  Authors: ${authors.join(', ')}`);
      if (year) sections.push(`  Year: ${year}`);
      sections.push(`  Evidence Quality: ${evidenceQuality}`);
      sections.push(`  Extraction Confidence: ${confidenceLevel}`);
      if (citationCount !== null && citationCount !== undefined) {
        sections.push(`  Citation Count: ${citationCount}`);
      }

      if (keyFindings.length > 0) {
        sections.push('  Key Findings:');
        for (const finding of keyFindings) {
          sections.push(`    • ${finding}`);
        }
      }

      if (limitations.length > 0) {
        sections.push('  Limitations:');
        for (const lim of limitations) {
          sections.push(`    ⚠ ${lim}`);
        }
      }
    } else if (doc.extractedText) {
      const preview = doc.extractedText.slice(0, 800).replace(/\n+/g, ' ').trim();
      sections.push(`  Extracted content (preview): ${preview}…`);
    }

    sections.push('');
  }

  sections.push('[END DOCUMENT CONTEXT]');
  return sections.join('\n');
}

function formatForTitan(documents: InjectedDocumentRecord[]): string {
  if (documents.length === 0) return '';

  const sections: string[] = [
    '[DOCUMENT CONTEXT — LAB / CLINICAL]',
    'The following clinical documents were analyzed by Archivist and are provided for Titan context.',
    'These values are extracted directly from the document. They do not override manual Titan inputs.',
    ''
  ];

  for (const doc of documents) {
    const payload = doc.analysisPayload as Record<string, unknown> | undefined;
    sections.push(`Document: ${doc.title}`);

    if (payload) {
      const collectionDate = (payload.collectionDate as string | undefined) ?? 'unknown date';
      const provider = (payload.provider as string | undefined) ?? 'unknown provider';
      const facility = (payload.facility as string | undefined) ?? 'unknown facility';
      const labValues = (payload.labValues as Array<{
        biomarker: string;
        value: number | string | null;
        unit: string;
        referenceRange: string;
        flag: 'normal' | 'high' | 'low' | 'critical';
      }> | undefined) ?? [];

      sections.push(`  Collection Date: ${collectionDate}`);
      sections.push(`  Provider: ${provider} | Facility: ${facility}`);

      if (labValues.length > 0) {
        sections.push('  Lab Values:');
        for (const lv of labValues) {
          const flagEmoji =
            lv.flag === 'critical' ? '🔴' :
            lv.flag === 'high' ? '🟡' :
            lv.flag === 'low' ? '🟡' : '🟢';
          const valueStr = lv.value !== null && lv.value !== undefined
            ? `${lv.value} ${lv.unit}`
            : 'not recorded';
          sections.push(
            `    ${flagEmoji} ${lv.biomarker}: ${valueStr} (ref: ${lv.referenceRange}) [${lv.flag.toUpperCase()}]`
          );
        }
      }
    } else if (doc.extractedText) {
      const preview = doc.extractedText.slice(0, 600).replace(/\n+/g, ' ').trim();
      sections.push(`  Extracted content (preview): ${preview}…`);
    }

    sections.push('');
  }

  sections.push('[END DOCUMENT CONTEXT]');
  return sections.join('\n');
}

function formatGeneric(documents: InjectedDocumentRecord[]): string {
  if (documents.length === 0) return '';

  const sections: string[] = [
    '[DOCUMENT CONTEXT]',
    'The following documents were analyzed by Archivist:',
    ''
  ];

  for (const doc of documents) {
    sections.push(`Document: ${doc.title}`);
    if (doc.metadata?.fileType) sections.push(`  Type: ${doc.metadata.fileType}`);
    if (doc.metadata?.pageCount) sections.push(`  Pages: ${doc.metadata.pageCount}`);
    if (doc.metadata?.wordCount) sections.push(`  Word Count: ~${doc.metadata.wordCount}`);
    if (doc.extractedText) {
      const preview = doc.extractedText.slice(0, 500).replace(/\n+/g, ' ').trim();
      sections.push(`  Preview: ${preview}…`);
    }
    sections.push('');
  }

  sections.push('[END DOCUMENT CONTEXT]');
  return sections.join('\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Supported target module IDs for document context injection.
 * Only modules with defined formatting strategies are listed.
 */
export type DocumentContextTargetModule = 'ledger' | 'scout' | 'titan' | string;

export const DocumentContextInjectionService = {
  /**
   * Format a set of document analysis results as a context snippet for injection
   * into a target module's system prompt or message context.
   *
   * @param moduleId  - Target module: 'ledger' | 'scout' | 'titan' | any
   * @param documents - Array of analyzed document records
   * @returns         - Formatted string snippet, or empty string if no documents
   */
  formatForModule(
    moduleId: DocumentContextTargetModule,
    documents: InjectedDocumentRecord[]
  ): string {
    if (!documents || documents.length === 0) return '';

    switch (moduleId) {
      case 'ledger':
        return formatForLedger(documents);
      case 'scout':
        return formatForScout(documents);
      case 'titan':
        return formatForTitan(documents);
      default:
        return formatGeneric(documents);
    }
  },

  /**
   * Determine the most appropriate target module for a set of documents
   * based on their domain classification.
   *
   * Returns the module ID with the strongest domain signal, or 'scout'
   * if no clear routing target is detected.
   */
  inferTargetModule(documents: InjectedDocumentRecord[]): DocumentContextTargetModule {
    if (!documents || documents.length === 0) return 'scout';

    const domainCounts: Record<string, number> = {};
    for (const doc of documents) {
      const domain = doc.domain ?? 'general';
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }

    const dominant = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    switch (dominant) {
      case 'financial': return 'ledger';
      case 'research':  return 'scout';
      case 'medical':   return 'titan';
      default:          return 'scout';
    }
  }
} as const;
