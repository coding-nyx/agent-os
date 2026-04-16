import { Spine } from '@/lib/spine/spine-event-bus';
import { SomaDataService } from './soma-data-service';
import { AraLogger } from '@/lib/ara-logger';

/**
 * Soma IngestionService
 * Implements the Patient Firewall and clinical ingestion logic.
 */

export interface RawReport {
  id: string;
  type: 'BLOOD_WORK' | 'X_RAY' | 'PRESCRIPTION';
  content: any;
  markers?: Record<string, number>;
}

export class SomaIngestionService {
  /**
   * Ingests a clinical report with strict scope checking.
   * Prevents GlobalSoul contamination for GUEST sessions.
   */
  public static async ingestReport(
    report: RawReport, 
    scope: 'USER' | 'GUEST',
    userId: string,
    encryptionKey?: CryptoKey
  ) {
    console.info(`[Soma] Ingesting clinical report. Scope: ${scope}`);

    // 1. Process in Isolation (Analytical Analysis)
    const analysis = this.analyzeReport(report);

    if (scope === 'GUEST') {
      AraLogger.emit('upload', {
        label: 'guest_block',
        detail: 'Patient Firewall active: GUEST data blocked from Spine.',
      });
      // Return analysis for UI-only display
      return { analysis, mutations: [] };
    }

    // 2. If USER: Save to history
    // (Actual saving logic would go here, e.g., to soma_profiles subcollection)
    
    // 3. Derive and Emit Mutations
    const mutations = this.deriveMutations(analysis);
    
    if (mutations.length > 0) {
      Spine.emit({
        intent: 'SOMA_CLINICAL_UPDATE',
        source: 'SOMA',
        payload: {
          intent: 'CLINICAL_MUTATION',
          raw_blob: { reportId: report.id, analysis },
          mutations: Object.fromEntries(mutations.map(m => [m.vector, m.delta]))
        },
        logic_gates: {
          confidence: 1.0,
          requires_approval: false,
          patient_scope: 'USER'
        }
      } as any);

      // Intervention check: e.g., High Cortisol
      if (analysis.anomalies.includes('HIGH_CORTISOL')) {
        Spine.emit({
          intent: 'CLINICAL_INTERVENTION_REQUEST',
          source: 'SOMA',
          payload: { intent: 'STRESS_TRIGGER_SEARCH', raw_blob: { marker: 'Cortisol' } },
          logic_gates: { confidence: 1.0, requires_approval: false, patient_scope: 'USER' }
        } as any);
      }
    }

    return { analysis, mutations };
  }

  private static analyzeReport(report: RawReport) {
    // Simulated clinical analysis logic
    const anomalies: string[] = [];
    if (report.markers?.cortisol && report.markers.cortisol > 20) anomalies.push('HIGH_CORTISOL');
    if (report.markers?.glucose && report.markers.glucose > 100) anomalies.push('ELEAVTED_GLUCOSE');

    return {
      reportId: report.id,
      summary: `Clinical analysis of ${report.type} completed.`,
      anomalies,
      optimalDeviation: report.markers ? this.calculateOptimalDeviation(report.markers) : {}
    };
  }

  private static deriveMutations(analysis: any) {
    const mutations: { vector: string, delta: number }[] = [];
    if (analysis.anomalies.includes('HIGH_CORTISOL')) {
      mutations.push({ vector: 'vitality', delta: -0.15 });
      mutations.push({ vector: 'resilience', delta: -0.1 });
    }
    return mutations;
  }

  private static calculateOptimalDeviation(markers: Record<string, number>) {
    // In a real scenario, these benchmarks are clinical
    const benchmarks: Record<string, number> = {
      cortisol: 10,
      glucose: 85,
      ldl: 70
    };

    const deviations: Record<string, number> = {};
    for (const [key, value] of Object.entries(markers)) {
      if (benchmarks[key]) {
        deviations[key] = (value - benchmarks[key]) / benchmarks[key];
      }
    }
    return deviations;
  }
}
