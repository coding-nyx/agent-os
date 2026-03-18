import type { ExtractedDataItem } from '@/core/diagnosis/types';
import type { SomaProfile, BiomarkerRecord, LabSummaryRecord, ClearanceRecord, MedicalImageAnalysis } from '@/lib/types';
import { loadSomaProfile, saveSomaProfile } from '../services/soma-profile-service';

/**
 * Merges user-approved medical diagnosis items into SomaProfile.
 * Each item type maps to the corresponding profile field.
 */
export async function mergeSomaDiagnosisData(
  userId: string,
  items: ExtractedDataItem[],
  encryptionKey?: CryptoKey | null,
  suggestedMedications: string[] = [],
): Promise<void> {
  const profile = await loadSomaProfile({ userId, encryptionKey: encryptionKey ?? null });
  if (!profile) {
    console.error('[SomaDiagnosisMerge] No profile found for user:', userId);
    return;
  }

  let next: SomaProfile = { ...profile };

  for (const item of items) {
    switch (item.type) {
      case 'biomarker': {
        const record: BiomarkerRecord = {
          id: item.id,
          name: typeof item.data.name === 'string' ? item.data.name : 'biomarker',
          value: item.data.value as number | string,
          unit: typeof item.data.unit === 'string' ? item.data.unit : undefined,
          source: typeof item.data.source === 'string' ? item.data.source : 'diagnosis',
          recordedAt: item.extractedAt,
        };
        next = {
          ...next,
          biomarkers: [record, ...next.biomarkers].slice(0, 200),
        };
        break;
      }

      case 'lab_summary': {
        const summary: LabSummaryRecord = {
          id: item.id,
          panel: typeof item.data.panel === 'string' ? item.data.panel : 'lab panel',
          findings: Array.isArray(item.data.findings) ? item.data.findings.filter((f: unknown) => typeof f === 'string') : [],
          flags: Array.isArray(item.data.flags) ? item.data.flags.filter((f: unknown) => typeof f === 'string') : [],
          recordedAt: item.extractedAt,
        };
        next = {
          ...next,
          labSummaries: [summary, ...next.labSummaries].slice(0, 50),
        };
        break;
      }

      case 'clearance': {
        const clearance: ClearanceRecord = {
          id: item.id,
          activity: typeof item.data.activity === 'string' ? item.data.activity : 'activity',
          status: (['granted', 'denied', 'conditional'] as const).includes(item.data.status as 'granted')
            ? (item.data.status as ClearanceRecord['status'])
            : 'conditional',
          reason: typeof item.data.reason === 'string' ? item.data.reason : '',
          issuedAt: item.extractedAt,
        };
        next = {
          ...next,
          clearances: [clearance, ...next.clearances].slice(0, 100),
        };
        break;
      }

      case 'condition': {
        const condition = typeof item.data.condition === 'string' ? item.data.condition : '';
        if (condition && !next.knownConditions.includes(condition)) {
          next = {
            ...next,
            knownConditions: [...next.knownConditions, condition],
          };
        }
        break;
      }

      case 'medication': {
        const medication = typeof item.data.medication === 'string' ? item.data.medication : '';
        if (medication && !next.medications.includes(medication)) {
          next = {
            ...next,
            medications: [...next.medications, medication],
          };
        }
        break;
      }

      case 'allergy': {
        const allergy = typeof item.data.allergy === 'string' ? item.data.allergy : '';
        if (allergy && !next.allergies.includes(allergy)) {
          next = {
            ...next,
            allergies: [...next.allergies, allergy],
          };
        }
        break;
      }

      case 'medical_image_analysis': {
        const analysis: MedicalImageAnalysis = {
          id: item.id,
          analyzedAt: item.extractedAt,
          reportType: typeof item.data.reportType === 'string' ? item.data.reportType : 'report',
          sourceLabel: 'diagnosis',
          biomarkerCount: Array.isArray(item.data.biomarkers) ? item.data.biomarkers.length : 0,
          clinicalFlags: Array.isArray(item.data.clinicalFlags)
            ? item.data.clinicalFlags
                .filter((f: unknown) => f && typeof f === 'object')
                .map((f: Record<string, unknown>) => ({
                  flag: typeof f.flag === 'string' ? f.flag : 'unknown',
                  severity: typeof f.severity === 'string' ? f.severity : 'mild',
                }))
                .slice(0, 10)
            : [],
        };
        next = {
          ...next,
          medicalImageAnalyses: [analysis, ...next.medicalImageAnalyses].slice(0, 100),
        };
        break;
      }
    }
  }

  if (suggestedMedications.length > 0) {
    const formatted = suggestedMedications
      .filter((m) => typeof m === 'string' && m.trim().length > 0)
      .map((m) => `Suggested: ${m.trim()} (discuss with provider)`);
    const existing = new Set(next.medications.map((m) => m.trim().toLowerCase()));
    const toAdd = formatted.filter((m) => !existing.has(m.trim().toLowerCase()));
    if (toAdd.length > 0) {
      next = {
        ...next,
        medications: [...next.medications, ...toAdd],
      };
    }
  }

  next.updatedAt = new Date().toISOString();
  await saveSomaProfile(next, { userId, encryptionKey: encryptionKey ?? null });
}
