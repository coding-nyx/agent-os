# Soma — Biomedical Data Layer (Absorbed into Titan)

> **ID**: `soma` | **Theme**: — | **Core**: No (Deprecated) | **Soul Priority**: — | **Security**: locked

## Purpose
Soma was originally a standalone biomedical data module handling vitals, biomarkers, lab results, and medical clearances. It has been **fully absorbed into Titan** — all Soma functionality now lives under Titan's Medical Mode. This module ID exists for legacy reference and migration compatibility only.

## What Moved to Titan
- **Biomarker tracking**: ~50 pre-built fields across vitals, hormones, metabolic, general health
- **Clinical ranges**: Pre-defined normal/warning/critical bands per biomarker
- **Lab report parsing**: AI-powered lab result extraction and analysis
- **Medical clearances**: Activity clearance management
- **Medical image analysis**: MRI, X-ray interpretation
- **Vital history**: Longitudinal vital sign tracking
- **Readiness scoring**: Composite readiness from biomarker data

## Spine Events (now emitted by Titan)
- SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED, SOMA_VITAL_LOGGED, SOMA_LAB_REPORT_PARSED, SOMA_PROFILE_UPDATED

## Data Shape
`SomaProfile`: biomarkers (`BiomarkerRecord[]`), clearances (`ClearanceRecord[]`), labSummaries (`LabSummaryRecord[]`), medicalImages (`MedicalImageAnalysis[]`), vitalHistory (`VitalRecord[]`). All now stored under Titan's data namespace.

## Implementation Notes
- ⚠️ Soma is fully absorbed — do not build new features under the `soma` module ID
- Legacy Spine event names retain the `SOMA_` prefix for backward compatibility
- Security policy in module manifest still references `soma` with locked-by-default (now governed by Titan)
