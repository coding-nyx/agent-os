import type { ExtractedDataItem } from '@/core/diagnosis/types';
import type { TitanProfile, LabSummaryRecord, MedicalImageAnalysis } from '@/lib/types';
import { loadTitanProfile, saveTitanProfile } from '../services/titan-profile-service';
import { SomaTitanDelegationService } from '@/lib/services/soma-titan-delegation-service';

/**
 * Merges user-approved diagnosis items into TitanProfile.
 * Each item type maps to the corresponding profile field.
 */
export async function mergeTitanDiagnosisData(
  userId: string,
  items: ExtractedDataItem[],
  encryptionKey?: CryptoKey | null,
): Promise<void> {
  const profile = await loadTitanProfile({ userId, encryptionKey: encryptionKey ?? null });
  if (!profile) {
    console.error('[TitanDiagnosisMerge] No profile found for user:', userId);
    return;
  }

  let next: TitanProfile = { ...profile };
  const delegationPromises: Promise<unknown>[] = [];

  for (const item of items) {
    switch (item.type) {
      case 'biomarker': {
        delegationPromises.push(
          SomaTitanDelegationService.commitBiomarker({
            userId,
            encryptionKey,
            payload: {
              id: item.id,
              name: item.data.name,
              value: item.data.value,
              unit: item.data.unit,
              source: item.data.source ?? 'diagnosis',
              recordedAt: item.extractedAt,
            },
            source: 'titan_diagnosis',
          })
        );
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
        delegationPromises.push(
          SomaTitanDelegationService.issueClearance({
            userId,
            encryptionKey,
            payload: {
              id: item.id,
              activity: item.data.activity,
              status: item.data.status,
              reason: item.data.reason,
              issuedAt: item.extractedAt,
            },
            source: 'titan_diagnosis',
          })
        );
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

  // Wait for all external delegation calls to complete in parallel.
  // This eliminates sequential I/O wait time for biomarker and clearance commits,
  // reducing total merge duration from O(N * latency) to O(latency).
  if (delegationPromises.length > 0) {
    try {
      await Promise.all(delegationPromises);
    } catch (delegationError) {
      console.error('[TitanDiagnosisMerge] One or more delegations failed:', delegationError);
      // Don't save TitanProfile if delegations failed — prevents data divergence
      throw new Error(`Diagnosis merge aborted: delegation failed (${(delegationError as Error).message})`);
    }
  }

  next.updatedAt = new Date().toISOString();
  await saveTitanProfile(next, { userId, encryptionKey: encryptionKey ?? null });
}
