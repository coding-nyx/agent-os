import type { DiagnosisSpecialization } from '@/core/diagnosis/types';
import { buildLedgerDiagnosisPrompt } from './ledger-diagnosis-prompt';
import { extractLedgerData } from './ledger-diagnosis-extractor';
import { mergeLedgerDiagnosisData } from './ledger-diagnosis-merge';

export const ledgerDiagnosisSpec: DiagnosisSpecialization = {
  moduleId: 'ledger',
  label: 'Financial Analysis',
  description: 'Analyze bank statements, tax returns, receipts, and financial documents. Extract transactions, flag anomalies, and categorize expenses.',

  supportedFileTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'text/plain',
  ],

  buildSystemPrompt: ({ contextPolicy, profile, extractedData }) =>
    buildLedgerDiagnosisPrompt(profile, contextPolicy, extractedData),

  allowedActions: [
    'parse_financial_document',
    'commit_transaction',
    'flag_anomaly',
    'categorize_expense',
  ],

  extractData: extractLedgerData,

  mergeToBase: mergeLedgerDiagnosisData,

  themeColor: 'emerald',

  emptyState: {
    title: 'Upload a document for AI financial analysis',
    subtitle: 'Click or drag-and-drop a file here',
    examples: ['Analyze this bank statement', 'Categorize my expenses', 'Flag unusual charges'],
    supportedTypes: [
      { label: 'PDF', desc: 'Statements, tax returns' },
      { label: 'Image', desc: 'Receipts, invoices' },
      { label: 'CSV', desc: 'Transaction exports' },
      { label: 'Text', desc: 'Plain text records' },
    ],
  },
};
