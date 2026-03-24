import {
  loadProfile,
  persistProfile,
  parseNumericValue,
  Spine,
  SomaTitanDelegationService,
  parseHealthReport,
  parseWorkoutLog,
  parseBiometricData,
} from './shared';
import type { ActionHandler, TitanProfile, MedicalImageAnalysis } from './shared';

export const biomarkerHandlers: Record<string, ActionHandler> = {

  commit_biomarker: async ({ userId, encryptionKey, payload }) => {
    const biomarker = await SomaTitanDelegationService.commitBiomarker({
      userId,
      encryptionKey,
      payload,
      source: 'titan_action',
    });
    if (biomarker) {
      Spine.publish({
        type: 'SOMA_BIOMARKER_COMMITTED',
        source: 'titan',
        domain: 'B',
        priority: 'info',
        data: {
          source: 'titan-delegation',
          biomarkerId: biomarker.id,
          name: biomarker.name,
        },
      });
    }
  },

  parse_lab_report: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const summary = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      panel: typeof payload?.panel === 'string' ? payload.panel : 'lab panel',
      findings: Array.isArray(payload?.findings) ? payload.findings.filter((item: unknown) => typeof item === 'string') : [],
      flags: Array.isArray(payload?.flags) ? payload.flags.filter((item: unknown) => typeof item === 'string') : [],
      recordedAt: new Date().toISOString()
    };

    // Extract biomarkers from findings if payload includes structured biomarkers
    // or if findings contain parseable "Name: Value Unit" patterns
    const extractedBiomarkers: { name: string; value: number | string; unit?: string }[] = [];
    
    // Check for explicit biomarkers array in payload
    if (Array.isArray(payload?.biomarkers)) {
      for (const b of payload.biomarkers) {
        if (b && typeof b === 'object' && typeof (b as Record<string, unknown>).name === 'string') {
          const bio = b as Record<string, unknown>;
          extractedBiomarkers.push({
            name: String(bio.name),
            value: parseNumericValue(bio.value),
            unit: typeof bio.unit === 'string' ? bio.unit : undefined,
          });
        }
      }
    }
    
    // Also try to extract from findings strings using common patterns
    // Pattern: "Name Value Unit" or "Name: Value Unit" or "Name = Value Unit"
    const labValuePattern = /^([A-Za-z0-9\s\-]+?)[\s:=]+([0-9.]+)\s*([A-Za-z/%]+)?$/;
    for (const finding of summary.findings) {
      const match = finding.match(labValuePattern);
      if (match) {
        const [, name, valueStr, unit] = match;
        const value = parseFloat(valueStr);
        if (Number.isFinite(value) && name.trim()) {
          // Check if we already have this biomarker from explicit array
          const exists = extractedBiomarkers.some(
            b => b.name.toLowerCase() === name.trim().toLowerCase()
          );
          if (!exists) {
            extractedBiomarkers.push({
              name: name.trim(),
              value,
              unit: unit?.trim(),
            });
          }
        }
      }
    }

    // Save the lab summary
    const next: TitanProfile = {
      ...profile,
      labSummaries: [summary, ...profile.labSummaries].slice(0, 50),
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Delegate extracted biomarkers to Soma
    if (extractedBiomarkers.length > 0 && userId) {
      const committedCount = { success: 0, failed: 0 };
      
      for (const biomarker of extractedBiomarkers) {
        try {
          const result = await SomaTitanDelegationService.commitBiomarker({
            userId,
            encryptionKey,
            payload: {
              name: biomarker.name,
              value: biomarker.value,
              unit: biomarker.unit,
              source: `lab_report:${summary.panel}`,
            },
            source: 'titan_lab_parse',
          });
          if (result) {
            committedCount.success++;
            Spine.publish({
              type: 'SOMA_BIOMARKER_COMMITTED',
              source: 'titan',
              domain: 'B',
              priority: 'info',
              data: {
                source: 'lab_report_extraction',
                biomarkerId: result.id,
                name: result.name,
                panel: summary.panel,
              },
            });
          } else {
            committedCount.failed++;
          }
        } catch (e) {
          committedCount.failed++;
          console.error(`[Titan] Failed to commit extracted biomarker "${biomarker.name}":`, e);
        }
      }

      // Emit summary event for lab parsing
      Spine.emit({
        type: 'SOMA_LAB_REPORT_PARSED',
        source: 'titan',
        domain: 'B',
        data: {
          panel: summary.panel,
          findingsCount: summary.findings.length,
          flagsCount: summary.flags.length,
          biomarkersExtracted: committedCount.success,
          biomarkersFailed: committedCount.failed,
        },
        cascadeDepth: 0,
        priority: summary.flags.length > 0 ? 'alert' : 'info',
      });

      if (pushAssistantMessage) {
        const flagsNote = summary.flags.length > 0 
          ? ` ⚠️ ${summary.flags.length} abnormal flag(s) detected.` 
          : '';
        pushAssistantMessage(
          `📋 Lab report parsed: ${summary.panel}\n` +
          `- ${summary.findings.length} finding(s) recorded\n` +
          `- ${committedCount.success} biomarker(s) extracted and saved` +
          (committedCount.failed > 0 ? ` (${committedCount.failed} failed)` : '') +
          flagsNote
        );
      }
    }
  },

  issue_clearance: async ({ userId, encryptionKey, payload }) => {
    const clearance = await SomaTitanDelegationService.issueClearance({
      userId,
      encryptionKey,
      payload,
      source: 'titan_action',
    });
    if (!clearance) return;
  },

  analyze_medical_image: async ({ userId, encryptionKey, payload }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const biomarkers = Array.isArray(payload?.biomarkers) ? payload.biomarkers : [];
    const labSummaries = Array.isArray(payload?.labSummaries) ? payload.labSummaries : [];
    const medications = Array.isArray(payload?.medications) ? payload.medications : [];
    const allergies = Array.isArray(payload?.allergies) ? payload.allergies : [];
    const clinicalFlags = Array.isArray(payload?.clinicalFlags) ? payload.clinicalFlags : [];

    const newBiomarkers = biomarkers
      .filter((b: unknown) => b && typeof b === 'object')
      .map((b: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        name: typeof b.name === 'string' ? b.name : 'biomarker',
        value: parseNumericValue(b.value),
        unit: typeof b.unit === 'string' ? b.unit : undefined,
        source: 'medical_image_analysis',
        recordedAt: new Date().toISOString()
      }));

    const newLabSummaries = labSummaries
      .filter((l: unknown) => l && typeof l === 'object')
      .map((l: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        panel: typeof l.test === 'string' ? l.test : 'extracted_panel',
        findings: [typeof l.summary === 'string' ? l.summary : 'Analysis from medical image'],
        flags: clinicalFlags
          .filter((f: unknown) => f && typeof f === 'object')
          .map((f: Record<string, unknown>) => typeof f.flag === 'string' ? f.flag : 'flag')
          .slice(0, 5),
        recordedAt: new Date().toISOString()
      }));

    const newMedications = medications
      .filter((m: unknown) => typeof m === 'string' || (m && typeof m === 'object'))
      .map((m: unknown) => {
        if (typeof m === 'string') return m;
        const med = m as Record<string, unknown>;
        return typeof med.name === 'string' ? med.name : 'medication';
      });

    const newAllergies = allergies
      .filter((a: unknown) => typeof a === 'string')
      .slice(0, 20);

    const analysis: MedicalImageAnalysis = {
      id: crypto.randomUUID(),
      analyzedAt: new Date().toISOString(),
      reportType: typeof payload?.reportType === 'string' ? payload.reportType : 'medical_report',
      sourceLabel: typeof payload?.sourceLabel === 'string' ? payload.sourceLabel : 'uploaded',
      biomarkerCount: newBiomarkers.length,
      clinicalFlags: clinicalFlags
        .filter((f: unknown) => f && typeof f === 'object')
        .map((f: Record<string, unknown>) => ({
          flag: typeof f.flag === 'string' ? f.flag : 'unknown',
          severity: typeof f.severity === 'string' ? f.severity : 'mild'
        }))
        .slice(0, 10)
    };

    const next: TitanProfile = {
      ...profile,
      labSummaries: [...newLabSummaries, ...profile.labSummaries].slice(0, 50),
      medications: [...newMedications, ...profile.medications].slice(0, 100),
      allergies: [...newAllergies, ...profile.allergies].slice(0, 50),
      medicalImageAnalyses: [analysis, ...profile.medicalImageAnalyses].slice(0, 100),
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);
    if (userId && encryptionKey) {
      try {
        await Promise.all(
          newBiomarkers.map((biomarker) =>
            SomaTitanDelegationService.commitBiomarker({
              userId,
              encryptionKey,
              payload: biomarker as unknown as Record<string, unknown>,
              source: 'titan_action',
            })
          )
        );
      } catch (delegationError) {
        console.error('[Titan] Biomarker delegation to Soma failed:', delegationError);
        // Emit failure event so downstream systems know delegation is incomplete
        // Using MODULE_DELEGATED with status: 'failed' to match existing event types
        Spine.emit({
          type: 'MODULE_DELEGATED',
          source: 'titan',
          target: 'soma',
          domain: 'B',
          data: {
            moduleId: 'titan',
            delegatedTo: 'soma',
            operation: 'commit_biomarkers',
            status: 'failed',
            count: newBiomarkers.length,
            error: (delegationError as Error).message,
          },
          cascadeDepth: 0,
          priority: 'alert',
        });
        // Note: TitanProfile is already saved; we don't rollback to avoid data loss
        // The MODULE_DELEGATED status: 'failed' event allows manual reconciliation
      }
    }

    // Emit MEDICAL_ALERT if severe flags found
    const severeFlags = analysis.clinicalFlags.filter(f => f.severity === 'severe');
    if (severeFlags.length > 0) {
      Spine.emit({
        type: 'MEDICAL_ALERT',
        source: 'titan',
        domain: 'B',
        data: {
          alertCount: severeFlags.length,
          flags: severeFlags.map(f => f.flag),
          reportType: analysis.reportType
        },
        cascadeDepth: 0,
        priority: 'alert'
      });
    }
  },

  parse_health_report: parseHealthReport,
  parse_workout_log: parseWorkoutLog,
  parse_biometric_data: parseBiometricData,

};
