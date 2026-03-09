import type { DiagnosisSpecialization } from '@/core/diagnosis/types';
import { buildScoutDiagnosisPrompt } from './scout-diagnosis-prompt';
import { extractScoutData } from './scout-diagnosis-extractor';

export const scoutDiagnosisSpec: DiagnosisSpecialization = {
  moduleId: 'scout',
  label: 'Research Analysis',
  description: 'Analyze research papers, reports, and articles. Extract findings, citations, and summaries. Read-only — no data is persisted.',

  supportedFileTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'text/markdown',
  ],

  buildSystemPrompt: ({ contextPolicy, profile, extractedData }) =>
    buildScoutDiagnosisPrompt(profile, contextPolicy, extractedData),

  allowedActions: [
    'extract_finding',
    'extract_citation',
    'summarize_section',
  ],

  extractData: extractScoutData,

  // Scout is read-only — no merge
  mergeToBase: undefined,

  themeColor: 'lime',

  emptyState: {
    title: 'Upload a document for research analysis',
    subtitle: 'Click or drag-and-drop a file here',
    examples: ['Extract key findings', 'List all citations', 'Summarize each section'],
    supportedTypes: [
      { label: 'PDF', desc: 'Research papers, reports' },
      { label: 'Image', desc: 'Charts, figures' },
      { label: 'Text', desc: 'Articles, notes' },
    ],
  },
};
