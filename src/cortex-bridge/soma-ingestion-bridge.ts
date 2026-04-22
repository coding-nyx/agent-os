import { SomaIngestServiceJs } from './cortex-logic-runtime';
import { Spine } from '@/lib/spine/spine-event-bus';

export type ReportType = 'BLOODWORK' | 'XRAY' | 'PRESCRIPTION' | 'LAB_RESULT' | 'SCAN' | 'REPORT';
export type PatientScope = 'USER' | 'GUEST';

export interface BiomarkerReading {
  name: string;
  value: number;
  unit: string;
  optimalMin?: number;
  optimalMax?: number;
  normalMin?: number;
  normalMax?: number;
}

export interface RawReport {
  id: string;
  documentType: ReportType;
  rawText: string;
  parsedMarkers: BiomarkerReading[];
  uploadedAt: number;
}

let _instance: any = null;

function getSomaIngestService() {
  if (!_instance && SomaIngestServiceJs) {
    _instance = new SomaIngestServiceJs((eventJson: string) => {
      try {
        const payload = JSON.parse(eventJson);
        Spine.emit(payload);
      } catch (e) {
        console.error('[SomaIngestionBridge] Failed to emit Spine event:', e);
      }
    });
  }
  return _instance;
}

/**
 * Ingest a clinical report through the KMP Physician Persona.
 * Enforces the Patient Firewall and triggers biomarker anomaly cascades.
 */
export async function ingestReport(report: RawReport, scope: PatientScope): Promise<void> {
  const service = getSomaIngestService();
  if (!service) {
    console.warn('[SomaIngestionBridge] SomaIngestServiceJs not loaded.');
    return;
  }

  return new Promise((resolve, reject) => {
    service.ingestReport(
      JSON.stringify(report),
      scope,
      () => resolve(),
      (err: string) => reject(new Error(err))
    );
  });
}
