import { Spine } from '@/lib/spine/spine-event-bus';
import { AraLogger } from '@/lib/ara-logger';
import * as SomaIngestionBridge from '@/cortex-bridge/soma-ingestion-bridge';

/**
 * Soma IngestionService
 * Implements the Patient Firewall and clinical ingestion logic.
 *
 * Refactored to delegate to KMP SomaIngestServiceJs.
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
   * Delegates all sovereign analysis and Spine signaling to KMP.
   */
  public static async ingestReport(
    report: RawReport, 
    scope: 'USER' | 'GUEST',
    _userId: string, // Kept for interface compatibility
    _encryptionKey?: CryptoKey // Kept for interface compatibility
  ) {
    console.info(`[Soma] Ingesting clinical report via KMP bridge. Scope: ${scope}`);

    // Map legacy web-app RawReport to KMP RawReport
    const kmpReport: SomaIngestionBridge.RawReport = {
      id: report.id,
      documentType: this.mapType(report.type),
      rawText: JSON.stringify(report.content),
      parsedMarkers: Object.entries(report.markers || {}).map(([name, value]) => ({
        name,
        value,
        unit: this.inferUnit(name)
      })),
      uploadedAt: Date.now()
    };

    try {
      await SomaIngestionBridge.ingestReport(kmpReport, scope as SomaIngestionBridge.PatientScope);
      
      return { 
        success: true,
        note: 'Delegated to KMP SomaIngestService'
      };
    } catch (e) {
      AraLogger.error('Soma', e);
      throw e;
    }
  }

  private static mapType(type: string): SomaIngestionBridge.ReportType {
    switch (type) {
      case 'BLOOD_WORK': return 'BLOODWORK';
      case 'X_RAY': return 'XRAY';
      case 'PRESCRIPTION': return 'PRESCRIPTION';
      default: return 'REPORT';
    }
  }

  private static inferUnit(name: string): string {
    const units: Record<string, string> = {
      cortisol: 'nmol/L',
      glucose: 'mg/dL',
      testosterone: 'ng/dL',
      ldl: 'mg/dL',
      hdl: 'mg/dL',
      crp: 'mg/L'
    };
    return units[name.toLowerCase()] || 'unit';
  }
}
