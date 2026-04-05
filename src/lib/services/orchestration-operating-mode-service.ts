import type { AutopilotLevel, HistoryMode, RuntimeAutonomy } from '@/lib/contracts/orchestration';
import { OrchestrationOperatingModeServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationOperatingModeServiceJs();

export interface ShellModeChip {
  id: string;
  label: string;
  tone: string;
}

export interface ShellOperatingModeSemantics {
  levelLabel: string;
  autonomyLabel: string;
  scopeLabel: string;
  authorityLabel: string;
  historyLabel: string;
  summaryLabel: string;
  chips: ShellModeChip[];
}

export class OrchestrationOperatingModeService {
  static derive(input: {
    autopilotLevel?: AutopilotLevel | null;
    historyMode?: HistoryMode | null;
    autonomy?: RuntimeAutonomy | null;
    isGuest?: boolean;
    awaitingApprovalCount?: number;
    failedCount?: number;
    escalatedCount?: number;
  }): ShellOperatingModeSemantics {
    const autopilotLevel = input.autopilotLevel ?? 0;
    const historyMode = input.historyMode ?? 'visible';
    const autonomy = input.autonomy ?? null;
    const isGuest = input.isGuest ?? false;
    const awaitingApprovalCount = input.awaitingApprovalCount ?? 0;
    const failedCount = input.failedCount ?? 0;
    const escalatedCount = input.escalatedCount ?? 0;

    const FALLBACK: ShellOperatingModeSemantics = {
      levelLabel: 'Unknown', autonomyLabel: '', scopeLabel: '', authorityLabel: '',
      historyLabel: '', summaryLabel: '', chips: [],
    };
    return safeParseKmp(
      _service.derive(
        autopilotLevel,
        historyMode,
        autonomy,
        isGuest,
        awaitingApprovalCount,
        failedCount,
        escalatedCount,
      ),
      FALLBACK,
      'OperatingMode.derive',
    );
  }
}
