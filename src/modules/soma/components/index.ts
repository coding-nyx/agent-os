/**
 * Soma Module - Export all components
 */

export { SomaDashboard } from './SomaDashboard';
export { VitalsEntryForm } from './VitalsEntryForm';
export { PhysicalAssessmentForm } from './PhysicalAssessmentForm';
export { BiometricHistory } from './BiometricHistory';
export { CollapsibleAIPanel } from './CollapsibleAIPanel';
export { BiomarkerDashboard } from './BiomarkerDashboard';
export { BiomarkerCharts, VitalsDashboard } from './BiomarkerCharts';
export { ClearancePanel } from './ClearancePanel';
export { ClearanceStatus } from './ClearanceStatus';

export type { VitalReading, PhysicalAssessment, SomaView } from './SomaDashboard';
export type { SomaProfile } from '../types';

// Diagnosis flow components
export { DiagnosisUploadZone }   from './DiagnosisUploadZone';
export { DiagnosisProgressCard } from './DiagnosisProgressCard';
export { DiagnosisResultsScreen } from './DiagnosisResultsScreen';
export { DiagnosisActiveBanner } from './DiagnosisActiveBanner';
export { DiagnosisCloseModal }   from './DiagnosisCloseModal';

export type { DiagnosisUploadZoneProps }    from './DiagnosisUploadZone';
export type { DiagnosisProgressCardProps, AnalysisPhase } from './DiagnosisProgressCard';
export type { DiagnosisResultsScreenProps } from './DiagnosisResultsScreen';
export type { DiagnosisActiveBannerProps }  from './DiagnosisActiveBanner';
export type { DiagnosisCloseModalProps }    from './DiagnosisCloseModal';

// Agent validation UI components
export { AgentPendingBadge }  from './AgentPendingBadge';
export { AgentOverridePanel } from './AgentOverridePanel';
export { AgentApprovalLog }   from './AgentApprovalLog';

export type { AgentPendingBadgeProps }  from './AgentPendingBadge';
export type { AgentOverridePanelProps } from './AgentOverridePanel';
export type { AgentApprovalLogProps, LogEntry } from './AgentApprovalLog';
