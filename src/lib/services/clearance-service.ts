import { MedicalClearanceEvaluatorJs } from '@cortex-logic';
import type { SomaProfile, ClearanceRecord } from '@/lib/types';

const _evaluator = new (MedicalClearanceEvaluatorJs as any)();

export class ClearanceService {
  static evaluate(profile: SomaProfile, activity: string): ClearanceRecord {
    return JSON.parse(_evaluator.evaluate(JSON.stringify(profile), activity)) as ClearanceRecord;
  }

  static getLatestClearance(profile: SomaProfile): ClearanceRecord | null {
    const result = _evaluator.getLatestClearance(JSON.stringify(profile)) as string;
    return result === 'null' ? null : (JSON.parse(result) as ClearanceRecord);
  }

  static isActivitySafe(profile: SomaProfile, activity: string): boolean {
    return _evaluator.isActivitySafe(JSON.stringify(profile), activity) as boolean;
  }
}
