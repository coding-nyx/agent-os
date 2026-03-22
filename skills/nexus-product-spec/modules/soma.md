# Soma — Biomedical Data Authority

> **ID**: `soma` | **Theme**: `emerald` | **Core**: Yes | **Soul Priority**: B | **Security**: locked

## Purpose
Soma is the **Biological Authority Domain** — a sovereign peer module to Titan that owns all medical, biometric, and biomarker data. While Titan handles physical performance and training, Soma manages clinical health data: vitals, lab results, conditions, medications, allergies, medical images, and activity clearances.

Soma operates under a **Path C+ architecture**: it maintains its own `SomaProfile` independent of `TitanProfile`, with cross-module data sharing via the read-only `SomaHealthSnapshot` interface.

## Core Capabilities

### Biomarker Tracking
- ~50 pre-built extension field templates across categories: **vitals**, **hormones**, **metabolic**, **general health**
- Clinical reference ranges with normal/warning/critical thresholds
- Extension fields capped at 25 per user (`SOMA_FIELD_LIMITS.maxExtensions`)

### Medical Document Diagnosis
- AI-powered lab report parsing and structured data extraction
- Medical image analysis (X-ray, MRI, CT, Ultrasound) with clinical interpretation
- Diagnosis pipeline with confidence scoring and clinical flags
- Content-based deduplication to prevent re-extraction loops

### Clearance Management
- Activity clearance evaluation based on conditions and medications
- Contraindication detection for high-intensity, heavy lifting, endurance activities
- Status tracking: `granted` | `denied` | `conditional`

### Readiness Scoring
Composite physical readiness score (0–100) computed from:
- **Vitals** (40%): Resting heart rate proximity to 60 bpm
- **Sleep** (30%): Sleep quality (0–10 scale)
- **Energy** (20%): Energy level (0–10 scale)
- **Stress** (10%): Physical stress inverted (0–10 scale)

Classification levels: `optimal` (≥80) | `good` (60–79) | `fair` (40–59) | `poor` (<40)

## File Structure
```
src/modules/soma/
├── SomaPage.tsx                     # Main entry point with UnifiedModulePage wrapper
├── README.md                        # Component documentation
├── types.ts                         # SomaProfile, SomaHealthSnapshot, SomaDiagnosisSummary
├── field-templates.ts               # Extension field templates + clinical ranges
├── actions/
│   ├── soma-field-actions.ts        # ActionHub registrations, readiness algorithm
│   └── soma-field-actions.test.ts
├── components/
│   ├── SomaDashboard.tsx            # Main dashboard with readiness score
│   ├── VitalsEntryForm.tsx          # Quick vitals input
│   ├── PhysicalAssessmentForm.tsx   # Strength/flexibility/endurance forms
│   ├── BiometricHistory.tsx         # Timeline view with filtering
│   ├── BiomarkerDashboard.tsx       # Biomarker cards and charts
│   ├── BiomarkerCharts.tsx          # Trend visualizations
│   ├── ClearancePanel.tsx           # Clearance management UI
│   ├── ClearanceStatus.tsx          # Status display component
│   ├── CollapsibleAIPanel.tsx       # AI insights panel
│   ├── DiagnosisUploadZone.tsx      # Document upload for diagnosis
│   ├── DiagnosisProgressCard.tsx    # Diagnosis session progress
│   ├── DiagnosisResultsScreen.tsx   # Results and merge review
│   ├── DiagnosisChatPanel.tsx       # Chat interface during diagnosis
│   ├── DiagnosisDocumentPreview.tsx # Document preview panel
│   ├── DiagnosisActiveBanner.tsx    # Active session indicator
│   ├── DiagnosisCloseModal.tsx      # Session close confirmation
│   ├── MedicalImageAnalysisResult.tsx  # Imaging analysis display
│   ├── MobileDiagnosisTabs.tsx      # Mobile tab navigation
│   ├── MobileExtractedDataSheet.tsx # Mobile extracted data view
│   ├── AgentApprovalLog.tsx         # Agent review history
│   ├── AgentOverridePanel.tsx       # Manual override controls
│   ├── AgentPendingBadge.tsx        # Pending review indicator
│   ├── SomaNotificationSettingsPanel.tsx  # Reminder/notification config
│   └── index.ts
├── diagnosis/
│   ├── soma-diagnosis-spec.ts       # DiagnosisSpecialization implementation
│   └── soma-diagnosis-merge.ts      # Profile merge logic after diagnosis
├── hooks/
│   ├── use-soma-health.ts           # React hook for SomaDataService
│   ├── use-diagnosis-session.ts     # Diagnosis session state management
│   └── index.ts
├── onboarding/
│   └── SomaOnboarding.tsx           # Medical onboarding wizard
├── prompts/
│   ├── soma-prompt-builder.ts       # System prompts + diagnosis prompts
│   └── soma-prompt-builder.test.ts
└── services/
    ├── soma-profile-service.ts      # Encrypted profile CRUD
    ├── soma-data-service.ts         # Cross-module health API (singleton)
    ├── clearance-service.ts         # Clearance evaluation logic
    ├── clearance-service.test.ts
    ├── diagnosis-session-service.ts # Diagnosis session persistence
    ├── diagnosis-session-service.test.ts
    ├── diagnosis-session-utils.ts   # Session helper utilities
    ├── lab-import-service.ts        # Lab report import processing
    └── soma-document-policy.ts      # Document handling policies
```

## Data Types

### SomaProfile
```typescript
interface SomaProfile {
  userId: string;
  // Vitals
  restingHeartRate?: number;
  bloodPressure?: string;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  // Body composition
  bmi?: number;
  bodyFatPercentage?: number;
  muscleMass?: number;
  // Physical performance
  vo2Max?: number;
  strength?: number;
  flexibility?: number;
  endurance?: number;
  // Health context
  knownConditions: string[];
  medications: string[];
  allergies: string[];
  // Medical data
  biomarkers: BiomarkerRecord[];
  labSummaries: LabSummaryRecord[];
  clearances: ClearanceRecord[];
  medicalImageAnalyses: MedicalImageAnalysis[];
  vitalReadings?: VitalReading[];
  physicalAssessments?: PhysicalAssessment[];
  medicalSummary?: string;
  // Status
  clearanceStatus?: 'cleared' | 'pending' | 'restricted';
  lastCheckup?: string;
  nextCheckup?: string;
  readinessScore?: number;
  medicalOnboardingComplete?: boolean;
  // Metadata
  updatedAt: string;
}
```

### SomaHealthSnapshot (Cross-Module API)
```typescript
interface SomaHealthSnapshot {
  readonly knownConditions: readonly string[];
  readonly medications: readonly string[];
  readonly allergies: readonly string[];
  readonly biomarkers: readonly BiomarkerRecord[];
  readonly labSummaries: readonly LabSummaryRecord[];
  readonly clearances: readonly ClearanceRecord[];
  readonly medicalImageAnalyses: readonly MedicalImageAnalysis[];
  readonly medicalSummary?: string;
  readonly medicalOnboardingComplete?: boolean;
  readonly snapshotAt: string;
}
```

## Spine Events
```typescript
const SomaSpineEvents = {
  BIOMARKER_COMMITTED: 'SOMA_BIOMARKER_COMMITTED',
  READINESS_UPDATED: 'SOMA_READINESS_UPDATED',
  CLEARANCE_CHANGED: 'SOMA_CLEARANCE_CHANGED',
  FIELD_CREATED: 'SOMA_FIELD_CREATED',
  FIELD_UPDATED: 'SOMA_FIELD_UPDATED',
  FIELD_DELETED: 'SOMA_FIELD_DELETED',
  VITAL_LOGGED: 'SOMA_VITAL_LOGGED',
  LAB_REPORT_PARSED: 'SOMA_LAB_REPORT_PARSED',
  PROFILE_UPDATED: 'SOMA_PROFILE_UPDATED',
};
```

## Key Actions (ActionHub)
| Action | Description |
|--------|-------------|
| `commit_biomarker` | Save a biomarker value with name, value, unit, source |
| `parse_lab_report` | Extract and save lab panel summary with findings and flags |
| `update_conditions` | Update known conditions, medications, allergies |
| `issue_clearance` | Issue or revoke activity clearance |
| `medical_image_analysis` | Structure imaging findings with modality, body part, clinical flags |

## Cross-Module Integration

### Titan → Soma Sync
```typescript
// When Titan logs body weight, mirror to Soma vitals
useSpineEvent('TITAN_BODY_WEIGHT_LOGGED', (event) => {
  handleAddVitalReading({ timestamp: Date.now(), weight: event.data.weight });
});

// When high-RPE workout completes, inform Soma for readiness adjustment
useSpineEvent('WORKOUT_COMPLETED', (event) => {
  if (event.data.rpe >= 8) {
    ai.handleSendMessage(`[System] Hard ${event.data.isCardio ? 'cardio' : 'strength'} session (RPE ${event.data.rpe}/10)...`);
  }
});
```

### SomaDataService (Cross-Module API)
```typescript
const SomaDataService = {
  getHealthSnapshot(userId, encryptionKey): Promise<SomaHealthSnapshot | null>,
  getReadinessScore(userId, encryptionKey): Promise<{ score, level, breakdown }>,
  getBiomarkers(userId, encryptionKey): Promise<BiomarkerRecord[]>,
  getClearanceStatus(userId, encryptionKey): Promise<{ cleared, conditions }>,
  getMedications(userId, encryptionKey): Promise<string[]>,
  subscribeToHealth(userId, encryptionKey, callback): unsubscribe,
  updateBiomarker(userId, biomarker, encryptionKey): Promise<void>,
  addClearance(userId, clearance, encryptionKey): Promise<void>,
};
```

## Diagnosis Pipeline
1. **Upload**: User uploads PDF, image, or text (lab report, X-ray, medical notes)
2. **OCR/Vision**: Document processed; images get `[VISUAL DESCRIPTION]` block
3. **Extraction**: AI extracts biomarkers, conditions, medications, imaging findings
4. **Deduplication**: Content-based stable IDs prevent re-extraction on history replay
5. **Summary**: Clinical summary generated with confidence level and rationale
6. **Review**: User reviews extracted items before merge
7. **Merge**: Approved items merged to `SomaProfile` via `mergeSomaDiagnosisData`

## Security
- All biometric data encrypted at rest with user's vault key
- Locked by default in module manifest
- Real-time decryption only in memory
- `SomaHealthSnapshot` is read-only to prevent cross-module writes

## Implementation Notes
- Soma is a **sovereign module** — NOT absorbed into Titan
- Uses `UnifiedModulePage` wrapper with `SingleAgentLayout`
- Agent alias customizable via `globalSoul.displayNames.soma`
- Medical disclaimer displayed on agent initialization
- Onboarding gate: `medicalOnboardingComplete` must be true to access dashboard
