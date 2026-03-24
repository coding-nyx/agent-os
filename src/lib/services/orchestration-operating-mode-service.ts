import type { AutopilotLevel, HistoryMode, RuntimeAutonomy } from '@/lib/contracts/orchestration';

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

const LEVEL_LABELS: Record<AutopilotLevel, string> = {
  0: 'L0 Manual lock',
  1: 'L1 Proposal first',
  2: 'L2 Guided assist',
  3: 'L3 Conditional autonomy',
  4: 'L4 Supervised autonomy',
  5: 'L5 Ghost',
};

const AUTONOMY_LABELS: Record<RuntimeAutonomy, string> = {
  manual_lock: 'Manual lock',
  proposal_first: 'Proposal first',
  guided_assist: 'Guided assist',
  conditional_autonomy: 'Conditional autonomy',
  supervised_autonomy: 'Supervised autonomy',
  ghost: 'Ghost',
};

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
    const autopilotLevel = input.autopilotLevel ?? 2;
    const historyMode = input.historyMode ?? 'standard';
    const autonomy = input.autonomy ?? (autopilotLevel === 5 ? 'ghost' : autopilotLevel >= 4 ? 'supervised_autonomy' : autopilotLevel === 3 ? 'conditional_autonomy' : autopilotLevel === 2 ? 'guided_assist' : autopilotLevel === 1 ? 'proposal_first' : 'manual_lock');
    const isGuest = input.isGuest === true;
    const awaitingApprovalCount = input.awaitingApprovalCount ?? 0;
    const failedCount = input.failedCount ?? 0;
    const escalatedCount = input.escalatedCount ?? 0;

    const scopeLabel = isGuest ? 'Guest scope' : 'User scope';
    const historyLabel = historyMode === 'silent' ? 'Silent audit' : 'Visible history';
    const authorityLabel = isGuest
      ? 'Analysis-only'
      : autopilotLevel === 5
        ? 'Ghost authority'
        : autopilotLevel >= 4
          ? 'Auto execution'
          : autopilotLevel === 3
            ? 'Conditional auto'
            : autopilotLevel === 2
              ? 'Guided execution'
              : 'Approval-first';

    let summaryLabel = authorityLabel;
    let summaryTone = 'border-white/10 bg-white/[0.05] text-white/70';
    if (isGuest) {
      summaryLabel = 'Guest analysis-only';
      summaryTone = 'border-sky-500/20 bg-sky-500/10 text-sky-200';
    } else if (escalatedCount > 0 || failedCount > 0) {
      summaryLabel = escalatedCount > 0 ? 'Incident posture' : 'Failure review';
      summaryTone = 'border-rose-500/20 bg-rose-500/10 text-rose-200';
    } else if (awaitingApprovalCount > 0) {
      summaryLabel = 'Approval gated';
      summaryTone = 'border-amber-500/20 bg-amber-500/10 text-amber-200';
    } else if (autopilotLevel === 5 || historyMode === 'silent') {
      summaryLabel = 'Ghost silent';
      summaryTone = 'border-violet-500/20 bg-violet-500/10 text-violet-200';
    } else if (autopilotLevel >= 4) {
      summaryLabel = 'Supervised auto';
      summaryTone = 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
    }

    const chips: ShellModeChip[] = [
      {
        id: 'summary',
        label: summaryLabel,
        tone: summaryTone,
      },
      {
        id: 'scope',
        label: scopeLabel,
        tone: isGuest ? 'border-sky-500/20 bg-sky-500/10 text-sky-200' : 'border-white/10 bg-white/[0.05] text-white/65',
      },
      {
        id: 'history',
        label: historyLabel,
        tone: historyMode === 'silent' ? 'border-violet-500/20 bg-violet-500/10 text-violet-200' : 'border-white/10 bg-white/[0.05] text-white/65',
      },
      {
        id: 'authority',
        label: authorityLabel,
        tone: isGuest ? 'border-sky-500/20 bg-sky-500/10 text-sky-200' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
      },
    ];

    return {
      levelLabel: LEVEL_LABELS[autopilotLevel],
      autonomyLabel: AUTONOMY_LABELS[autonomy],
      scopeLabel,
      authorityLabel,
      historyLabel,
      summaryLabel,
      chips,
    };
  }
}
