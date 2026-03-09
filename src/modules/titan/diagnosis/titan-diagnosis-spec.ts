import type { DiagnosisSpecialization } from '@/core/diagnosis/types';
import { buildTitanDiagnosisPrompt } from './titan-diagnosis-prompt';
import { extractTitanData } from './titan-diagnosis-extractor';
import { mergeTitanDiagnosisData } from './titan-diagnosis-merge';

export const titanDiagnosisSpec: DiagnosisSpecialization = {
  moduleId: 'titan',
  label: 'Medical Analysis',
  description: 'Analyze lab reports, health records, and medical documents. Extract biomarkers, flag abnormalities, and manage clearances.',

  supportedFileTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'text/plain',
    'text/markdown',
  ],

  buildSystemPrompt: ({ contextPolicy, profile, extractedData }) =>
    buildTitanDiagnosisPrompt(profile as Parameters<typeof buildTitanDiagnosisPrompt>[0], contextPolicy, extractedData),

  allowedActions: [
    'parse_lab_report',
    'parse_health_report',
    'analyze_medical_image',
    'commit_biomarker',
    'issue_clearance',
  ],

  extractData: extractTitanData,

  mergeToBase: mergeTitanDiagnosisData,

  themeColor: 'orange',

  emptyState: {
    title: 'Describe symptoms or upload a document',
    subtitle: 'Type your symptoms below, or drag-and-drop a file',
    examples: ['I have persistent headaches and fatigue', 'Analyze my blood panel', 'Compare to previous labs'],
    supportedTypes: [
      { label: 'PDF', desc: 'Lab reports, health records' },
      { label: 'Image', desc: 'PNG / JPG / WebP scans' },
      { label: 'CSV', desc: 'Tabular lab data' },
      { label: 'Text', desc: 'Plain text / Markdown' },
    ],
  },
};
