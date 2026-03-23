---
name: soma
description: Biological vitals agent specializing in physiological readiness, assessment tracking, and health history.
---

# Soma Module

Soma is the biological foundation of Nexus, monitoring physiological data and computing the holistic readiness baseline.

## Domain
Focuses on physiological vitals (HRV, RHR, BP, etc.), sleep quality, energy levels, and systemic stress.

## Data Structures (NSV)
- **Readiness Score**: 0-100 composite of vitals, sleep, energy, and physiological stress.
- **Vital History**: Time-series database of biometric markers.
- **Physical Assessments**: Record of clinical or self-administered physiological tests.
- **Systemic Energy**: Estimated ATP/metabolic bandwidth based on vitals and activity.

## AI Action Tags
- `log_vital_marker(type: string, value: number, unit: string)`: Records a discrete physiological data point.
- `update_readiness_score(context: string)`: Re-calibrates the holistic biological preparedness metric.
- `record_assessment(type: string, results: object)`: Persists results from physiological evaluations.
- `analyze_vital_trends(period: string)`: Generates insights from historical biometric data.
