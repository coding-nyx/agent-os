/**
 * useTitanClearanceGate
 *
 * Computes the training-gate state from the Soma clearance record and active
 * system debts.  Surfaces the recovery-gate modal request and the two actions
 * that modify it: guarding an arbitrary action and overriding a Soma veto.
 *
 * Responsibility: clearance enforcement and debt-resolution side-effects only.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { TitanProfile, SomaProfile, GlobalProjection } from '@/lib/types';
import {
  getTitanTrainingGateState,
  recordSomaVetoOverride,
  resolveSystemDebtsForGrantedClearance,
  type TitanTrainingGateState,
} from '../services/titan-clearance-debt-service';
import { saveTitanProfile } from '../services/titan-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import type { TrainingGateRequest } from './types';

interface UseTitanClearanceGateParams {
  profile: TitanProfile | null;
  somaProfile: SomaProfile | null;
  globalSoul: GlobalProjection | null;
  isRecoveryActive: boolean;
  encryptionKey: CryptoKey | null;
  user: { uid: string } | null;
}

export function useTitanClearanceGate(params: UseTitanClearanceGateParams): {
  trainingGateState: TitanTrainingGateState;
  recoveryGate: TrainingGateRequest | null;
  setRecoveryGate: React.Dispatch<React.SetStateAction<TrainingGateRequest | null>>;
  advisoryBanner: string | null;
  setAdvisoryBanner: (msg: string | null) => void;
  guardRecoveryAction: (onLight: () => void, onFull: () => void) => void;
  handleOverrideSomaVeto: () => Promise<void>;
} {
  const { profile, somaProfile, globalSoul, isRecoveryActive, encryptionKey, user } = params;

  const [recoveryGate, setRecoveryGate] = useState<TrainingGateRequest | null>(null);
  const [advisoryBanner, setAdvisoryBanner] = useState<string | null>(null);

  // Tracks which clearance+debt combinations have already been resolved so we
  // don't write the same resolution twice on rapid re-renders.
  const resolvedDebtSignatureRef = useRef<string | null>(null);

  const trainingGateState = useMemo(
    () =>
      getTitanTrainingGateState({
        profile,
        somaProfile,
        recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
        cnsFatigue: globalSoul?.crossFunctionalState?.biological?.cnsFatigue ?? null,
        isRecoveryActive,
      }),
    [
      profile,
      somaProfile,
      globalSoul?.crossFunctionalState?.biological?.recoveryScore,
      globalSoul?.crossFunctionalState?.biological?.cnsFatigue,
      isRecoveryActive,
    ],
  );

  // When Soma grants clearance, resolve any outstanding system debts that were
  // incurred by previous veto overrides for the same activity.
  useEffect(() => {
    if (!profile || !user?.uid || !encryptionKey) return;
    if (trainingGateState.latestClearance?.status !== 'granted') return;

    const resolution = resolveSystemDebtsForGrantedClearance(
      profile,
      trainingGateState.latestClearance,
    );
    if (resolution.resolvedIds.length === 0) return;

    const signature = `${trainingGateState.latestClearance.id}:${resolution.resolvedIds.join(',')}`;
    if (resolvedDebtSignatureRef.current === signature) return;
    resolvedDebtSignatureRef.current = signature;

    saveTitanProfile(resolution.profile, { userId: user.uid, encryptionKey }).catch((error) => {
      console.error('[Titan] Failed to resolve system debt after clearance grant:', error);
    });
  }, [profile, user?.uid, encryptionKey, trainingGateState.latestClearance]);

  /** Present the recovery/clearance gate if needed, otherwise directly invoke onFull. */
  const guardRecoveryAction = useCallback(
    (onLight: () => void, onFull: () => void) => {
      if (trainingGateState.shouldBlockFullTraining) {
        setRecoveryGate({
          onLight,
          onFull,
          mode: 'clearance',
          message:
            trainingGateState.enforcementReason ??
            'Soma clearance is restricting full training.',
          allowOverride: trainingGateState.shouldRequireExplicitOverride,
        });
        return;
      }
      if (!isRecoveryActive) {
        onFull();
        return;
      }
      setRecoveryGate({
        onLight,
        onFull,
        mode: 'recovery',
        message:
          "You're in recovery mode. Log this as a light recovery session or continue with full training.",
        allowOverride: false,
      });
    },
    [
      isRecoveryActive,
      trainingGateState.shouldBlockFullTraining,
      trainingGateState.shouldRequireExplicitOverride,
      trainingGateState.enforcementReason,
    ],
  );

  /** Record a Soma-veto override, persist the resulting debt, and emit Spine
   *  events so Atlas and the NSV can react to the increased biological cost. */
  const handleOverrideSomaVeto = useCallback(async () => {
    if (!recoveryGate || !profile || !encryptionKey || !user) return;

    const outcome = recordSomaVetoOverride(profile, {
      activity: trainingGateState.activity,
      clearance: trainingGateState.latestClearance,
      note: recoveryGate.message,
    });

    await saveTitanProfile(outcome.profile, { userId: user.uid, encryptionKey });

    Spine.emit({
      type: 'SOMA_VETO_OVERRIDDEN',
      source: 'titan',
      target: 'soma',
      domain: 'system',
      data: {
        activity: outcome.override.activity,
        clearanceStatus: outcome.override.clearanceStatus,
        reason: outcome.override.reason,
        overrideId: outcome.override.id,
        debtId: outcome.debt.id,
        mutations: outcome.debt.vectorImpact,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    Spine.emit({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'titan',
      target: 'atlas',
      domain: 'system',
      data: {
        reason: 'soma_veto_override',
        activity: outcome.override.activity,
        debtId: outcome.debt.id,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });

    const currentRecovery = globalSoul?.crossFunctionalState?.biological?.recoveryScore;
    const currentFatigue = globalSoul?.crossFunctionalState?.biological?.cnsFatigue;
    queueNSVUpdate(
      user.uid,
      {
        biological: {
          recoveryScore: Math.max(
            0,
            Math.min(10, (typeof currentRecovery === 'number' ? currentRecovery : 7) - 1),
          ),
          cnsFatigue: Math.max(
            0,
            Math.min(10, (typeof currentFatigue === 'number' ? currentFatigue : 4) + 1),
          ),
        },
      },
      'soma_veto_override',
    );

    setAdvisoryBanner(outcome.alertMessage);
    const action = recoveryGate.onFull;
    setRecoveryGate(null);
    await action?.();
  }, [
    recoveryGate,
    profile,
    encryptionKey,
    user,
    trainingGateState,
    globalSoul?.crossFunctionalState?.biological?.recoveryScore,
    globalSoul?.crossFunctionalState?.biological?.cnsFatigue,
  ]);

  return {
    trainingGateState,
    recoveryGate,
    setRecoveryGate,
    advisoryBanner,
    setAdvisoryBanner,
    guardRecoveryAction,
    handleOverrideSomaVeto,
  };
}
