import type {
  ClearanceRecord,
  SomaProfile,
  TitanClearanceOverrideRecord,
  TitanProfile,
  TitanSystemDebtRecord,
} from '@/lib/types';

export type TitanEnforcedClearanceStatus = ClearanceRecord['status'] | 'pending';
export type TitanReadinessPresentationMode = 'performance' | 'recovery';

export interface TitanTrainingGateState {
  activity: string;
  clearanceStatus: TitanEnforcedClearanceStatus;
  latestClearance: ClearanceRecord | null;
  activeDebtCount: number;
  activeDebt: TitanSystemDebtRecord | null;
  shouldBlockFullTraining: boolean;
  shouldRequireExplicitOverride: boolean;
  presentationMode: TitanReadinessPresentationMode;
  readinessLabel: string;
  enforcementReason: string | null;
}

const DEFAULT_ACTIVITY = 'high_intensity';
const OVERRIDE_VECTOR_IMPACT: NonNullable<TitanSystemDebtRecord['vectorImpact']> = {
  vitality: -0.18,
  output: -0.12,
  friction: 0.1,
};

function sortClearancesByIssuedAt(clearances: ClearanceRecord[]): ClearanceRecord[] {
  return [...clearances].sort((left, right) => {
    const timestampDelta = right.issuedAt.localeCompare(left.issuedAt);
    if (timestampDelta !== 0) return timestampDelta;
    return right.id.localeCompare(left.id);
  });
}

function normalizeActivity(activity: string): string {
  return activity.trim().toLowerCase();
}

export function getLatestTitanClearance(
  clearances: ClearanceRecord[],
  activity: string = DEFAULT_ACTIVITY,
): ClearanceRecord | null {
  if (clearances.length === 0) return null;

  const normalizedActivity = normalizeActivity(activity);
  const sorted = sortClearancesByIssuedAt(clearances);
  const matching = sorted.find((clearance) => normalizeActivity(clearance.activity) === normalizedActivity);
  return matching ?? sorted[0] ?? null;
}

export function getActiveSystemDebts(
  profile: Pick<TitanProfile, 'systemDebts'> | null | undefined,
  activity?: string,
): TitanSystemDebtRecord[] {
  const debts = profile?.systemDebts ?? [];
  const normalizedActivity = activity ? normalizeActivity(activity) : null;
  return debts.filter((debt) => (
    debt.kind === 'soma_veto_override' &&
    debt.status === 'active' &&
    (!normalizedActivity || normalizeActivity(debt.activity) === normalizedActivity)
  ));
}

function buildEnforcementReason(
  status: TitanEnforcedClearanceStatus,
  latestClearance: ClearanceRecord | null,
  activeDebtCount: number,
): string | null {
  if (activeDebtCount > 0) {
    return activeDebtCount === 1
      ? 'Soma veto override recorded — Titan is treating today as biological debt repayment until clearance is restored.'
      : `${activeDebtCount} override debts are active — Titan is constraining readiness framing until Soma clears training again.`;
  }

  if (status === 'pending') {
    return 'Medical clearance is still pending in Soma. Titan is restricted to recovery-first behavior until a decision is recorded.';
  }

  if (status === 'conditional') {
    return latestClearance?.reason
      ? `Conditional clearance active — ${latestClearance.reason}`
      : 'Conditional clearance active — Titan requires an explicit override before full training.';
  }

  if (status === 'denied') {
    return latestClearance?.reason
      ? `Clearance denied — ${latestClearance.reason}`
      : 'Clearance denied in Soma. Full training is blocked without an explicit override.';
  }

  return null;
}

export function getTitanTrainingGateState(input: {
  profile: TitanProfile | null;
  somaProfile: SomaProfile | null;
  recoveryScore?: number | null;
  cnsFatigue?: number | null;
  isRecoveryActive: boolean;
  activity?: string;
}): TitanTrainingGateState {
  const activity = input.activity ?? DEFAULT_ACTIVITY;
  const clearances = input.somaProfile?.clearances ?? input.profile?.clearances ?? [];
  const latestClearance = getLatestTitanClearance(clearances, activity);
  const clearanceStatus: TitanEnforcedClearanceStatus = latestClearance?.status ?? 'pending';
  const activeDebts = getActiveSystemDebts(input.profile, activity);
  const activeDebt = activeDebts[0] ?? null;
  const activeDebtCount = activeDebts.length;
  const lowRecovery = typeof input.recoveryScore === 'number' && input.recoveryScore < 5;
  const highFatigue = typeof input.cnsFatigue === 'number' && input.cnsFatigue >= 7;
  const shouldBlockFullTraining = clearanceStatus !== 'granted';
  const presentationMode: TitanReadinessPresentationMode =
    input.isRecoveryActive || shouldBlockFullTraining || activeDebtCount > 0 || lowRecovery || highFatigue
      ? 'recovery'
      : 'performance';

  return {
    activity,
    clearanceStatus,
    latestClearance,
    activeDebtCount,
    activeDebt,
    shouldBlockFullTraining,
    shouldRequireExplicitOverride: shouldBlockFullTraining,
    presentationMode,
    readinessLabel:
      presentationMode === 'performance'
        ? 'Performance window open'
        : activeDebtCount > 0
          ? 'Biological debt repayment'
          : shouldBlockFullTraining
            ? 'Clearance guardrail active'
            : input.isRecoveryActive
              ? 'Recovery protocol active'
              : 'Recovery-first day',
    enforcementReason: buildEnforcementReason(clearanceStatus, latestClearance, activeDebtCount),
  };
}

export function recordSomaVetoOverride(
  profile: TitanProfile,
  input: {
    activity?: string;
    clearance?: ClearanceRecord | null;
    note?: string;
    now?: string;
  },
): {
  profile: TitanProfile;
  override: TitanClearanceOverrideRecord;
  debt: TitanSystemDebtRecord;
  alertMessage: string;
} {
  const now = input.now ?? new Date().toISOString();
  const activity = input.activity ?? DEFAULT_ACTIVITY;
  const clearanceStatus: TitanEnforcedClearanceStatus = input.clearance?.status ?? 'pending';
  const reason = input.clearance?.reason?.trim() || 'Titan proceeded despite an unresolved Soma clearance restriction.';
  const debtId = `debt.${crypto.randomUUID()}`;
  const overrideId = `override.${crypto.randomUUID()}`;
  const consequenceSummary = clearanceStatus === 'pending'
    ? 'Pending clearance was overridden; readiness remains constrained until Soma records a decision.'
    : 'Soma veto was overridden; Titan now treats the session as system debt until clearance is restored.';

  const override: TitanClearanceOverrideRecord = {
    id: overrideId,
    activity,
    clearanceStatus,
    reason,
    createdAt: now,
    sourceClearanceId: input.clearance?.id,
    systemDebtId: debtId,
    note: input.note,
  };

  const debt: TitanSystemDebtRecord = {
    id: debtId,
    kind: 'soma_veto_override',
    activity,
    status: 'active',
    createdAt: now,
    reason,
    clearanceStatus,
    sourceClearanceId: input.clearance?.id,
    overrideId,
    consequenceSummary,
    vectorImpact: OVERRIDE_VECTOR_IMPACT,
  };

  return {
    profile: {
      ...profile,
      clearanceOverrides: [override, ...(profile.clearanceOverrides ?? [])].slice(0, 100),
      systemDebts: [debt, ...(profile.systemDebts ?? [])].slice(0, 100),
      updatedAt: now,
    },
    override,
    debt,
    alertMessage: `${consequenceSummary} Titan reduced readiness framing and recorded the override in audit history.`,
  };
}

export function resolveSystemDebtsForGrantedClearance(
  profile: TitanProfile,
  clearance: ClearanceRecord | null,
  now: string = new Date().toISOString(),
): { profile: TitanProfile; resolvedIds: string[] } {
  if (!clearance || clearance.status !== 'granted') {
    return { profile, resolvedIds: [] };
  }

  const resolvedIds: string[] = [];
  const normalizedActivity = normalizeActivity(clearance.activity);
  const nextSystemDebts = (profile.systemDebts ?? []).map((debt) => {
    if (
      debt.kind !== 'soma_veto_override' ||
      debt.status !== 'active' ||
      normalizeActivity(debt.activity) !== normalizedActivity
    ) {
      return debt;
    }
    resolvedIds.push(debt.id);
    return {
      ...debt,
      status: 'resolved' as const,
      resolvedAt: now,
    };
  });

  if (resolvedIds.length === 0) {
    return { profile, resolvedIds };
  }

  return {
    profile: {
      ...profile,
      systemDebts: nextSystemDebts,
      updatedAt: now,
    },
    resolvedIds,
  };
}
