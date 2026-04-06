import { MedicalClearanceEvaluatorJs } from '@cortex-logic';
import type { TitanProfile, ClearanceRecord } from '@/lib/types';
import type { SomaHealthSnapshot } from '@/modules/soma/types';

type ClearanceSource = Pick<TitanProfile, 'knownConditions' | 'medications' | 'clearances'> | SomaHealthSnapshot;

const _evaluator = new (MedicalClearanceEvaluatorJs as any)();

export class ClearanceService {
  static evaluate(profile: ClearanceSource, activity: string): ClearanceRecord {
    return JSON.parse(_evaluator.evaluate(JSON.stringify(profile), activity)) as ClearanceRecord;
  }

  static getLatestClearance(profile: ClearanceSource): ClearanceRecord | null {
    const result = _evaluator.getLatestClearance(JSON.stringify(profile)) as string;
    return result === 'null' ? null : (JSON.parse(result) as ClearanceRecord);
  }

  static isActivitySafe(profile: ClearanceSource, activity: string): boolean {
    return _evaluator.isActivitySafe(JSON.stringify(profile), activity) as boolean;
  }
}
