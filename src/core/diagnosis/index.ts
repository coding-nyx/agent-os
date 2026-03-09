// Shared Diagnosis Engine — public API
export type {
  DiagnosisContextPolicy,
  DiagnosisSpecialization,
  DiagnosisEmptyStateConfig,
  DiagnosisSessionPhase,
  DiagnosisSessionState,
  ExtractedDataBag,
  ExtractedDataItem,
} from './types';
export { createEmptyBag } from './types';

export {
  registerDiagnosisSpec,
  getDiagnosisSpec,
  getAllDiagnosisSpecs,
  hasDiagnosisSpec,
} from './diagnosis-registry';

export { useDiagnosis } from './use-diagnosis';
export type { UseDiagnosisOptions, UseDiagnosisReturn } from './use-diagnosis';

export { DiagnosisToolbar } from './components/DiagnosisToolbar';
export { DiagnosisMergeDialog } from './components/DiagnosisMergeDialog';
export { DiagnosisEmptyState } from './components/DiagnosisEmptyState';
export { DiagnosisDocumentCard } from './components/DiagnosisDocumentCard';
