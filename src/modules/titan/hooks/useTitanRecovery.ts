/**
 * useTitanRecovery
 *
 * Owns the full recovery-plan lifecycle: modal state, plan persistence,
 * daily check-ins, training resumption, and cross-module consult requests.
 * Also listens for Spine events that trigger recovery entry (COMPOUND_STRESS,
 * BURNOUT_WARNING, REDUCE_TRAINING_LOAD) and recovery exit (RECOVERY_AVAILABLE).
 *
 * Responsibility: recovery business logic and Spine integration — no layout or
 * keyboard concerns.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type {
  TitanProfile,
  SomaProfile,
  GlobalProjection,
  TitanRecoveryPlan,
  TitanRecoveryCheckin,
  TitanRecoveryReason,
  TitanRecoveryBodyRegion,
} from '@/lib/types';
import type { RecoveryPlanDraft, RecoveryConsultResult } from '../components/RecoveryPlanModal';
import { saveTitanProfile } from '../services/titan-profile-service';
import { useSpineEvent, Spine } from '@/lib/spine/spine-event-bus';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import { AraHandoffService } from '@/lib/services/ara-handoff-service';
import type { TitanTab } from './types';

interface UseTitanRecoveryParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: { uid: string } | null;
  somaProfile: SomaProfile | null;
  globalSoul: GlobalProjection | null;
  isGuest: boolean;
  isRecoveryActive: boolean;
  setActiveTab: (tab: TitanTab) => void;
  ai: { handleSendMessage: (msg: string) => void };
}

export function useTitanRecovery(params: UseTitanRecoveryParams): {
  isRecoveryModalOpen: boolean;
  setIsRecoveryModalOpen: (v: boolean) => void;
  recoveryDraft: RecoveryPlanDraft | null;
  somaConsult: RecoveryConsultResult | null;
  setSomaConsult: React.Dispatch<React.SetStateAction<RecoveryConsultResult | null>>;
  agnesConsult: RecoveryConsultResult | null;
  setAgnesConsult: React.Dispatch<React.SetStateAction<RecoveryConsultResult | null>>;
  pendingConsults: { soma: boolean; agnes: boolean };
  setPendingConsults: React.Dispatch<React.SetStateAction<{ soma: boolean; agnes: boolean }>>;
  isResumeModalOpen: boolean;
  setIsResumeModalOpen: (v: boolean) => void;
  openRecoveryModal: (draft?: RecoveryPlanDraft | null) => void;
  handleSaveRecoveryPlan: (plan: TitanRecoveryPlan) => Promise<void>;
  handleSaveRecoveryCheckin: (
    payload: Omit<TitanRecoveryCheckin, 'date'> & { date?: string },
  ) => Promise<void>;
  handleResumeTraining: () => Promise<void>;
  requestRecoveryConsults: (
    reasons: TitanRecoveryReason[],
    bodyRegion?: TitanRecoveryBodyRegion,
  ) => void;
  daysRemaining: number;
  hasCheckinToday: boolean;
  recoveryCheckins: TitanRecoveryCheckin[];
  recoveryCompleteMessage: string | null;
} {
  const {
    profile,
    encryptionKey,
    user,
    somaProfile,
    globalSoul,
    isGuest,
    isRecoveryActive,
    setActiveTab,
    ai,
  } = params;

  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryPlanDraft | null>(null);
  const [somaConsult, setSomaConsult] = useState<RecoveryConsultResult | null>(null);
  const [agnesConsult, setAgnesConsult] = useState<RecoveryConsultResult | null>(null);
  const [pendingConsults, setPendingConsults] = useState({ soma: false, agnes: false });
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [recoveryCompleteMessage, setRecoveryCompleteMessage] = useState<string | null>(null);

  // Deduplicates Spine events so a rapid re-emit of the same event ID doesn't
  // trigger the recovery modal or AI message more than once per session.
  const handledSpineEventsRef = useRef<Set<string>>(new Set());

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const recoveryPlan = profile?.recoveryPlan ?? null;
  const recoveryCheckins = profile?.recoveryCheckins ?? [];
  const hasCheckinToday = recoveryCheckins.some((c) => c.date === todayIso());

  const daysRemaining = useMemo(() => {
    if (!recoveryPlan?.active) return 0;
    const today = new Date(todayIso());
    const end = new Date(recoveryPlan.endDate);
    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(diff, 0);
  }, [recoveryPlan]);

  /** Open the recovery-plan modal, optionally pre-filling it from a draft. */
  const openRecoveryModal = useCallback((draft?: RecoveryPlanDraft | null) => {
    setRecoveryDraft(draft ?? null);
    setSomaConsult(null);
    setAgnesConsult(null);
    setPendingConsults({ soma: false, agnes: false });
    setIsRecoveryModalOpen(true);
  }, []);

  // When recovery mode becomes active, redirect non-recovery-compatible tabs
  // (train / plan / analytics) to the recovery tab.
  useEffect(() => {
    if (isRecoveryActive) {
      setActiveTab('recovery');
    }
  }, [isRecoveryActive, setActiveTab]);

  // ── Plan & check-in persistence ───────────────────────────────────────────

  const handleSaveRecoveryPlan = useCallback(
    async (plan: TitanRecoveryPlan) => {
      if (!profile || !encryptionKey || !user) return;

      const updated: TitanProfile = {
        ...profile,
        recoveryPlan: plan,
        updatedAt: new Date().toISOString(),
      };
      await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

      // Notify Soma so it can surface somatic-support recommendations.
      Spine.emit({
        type: 'TITAN_RECOVERY_NEEDED',
        source: 'titan',
        domain: 'B',
        data: {
          type: plan.type,
          reasons: plan.reasons,
          durationDays: plan.suggestedDurationDays,
          bodyRegion: plan.bodyRegion ?? null,
          startDate: plan.startDate,
        },
        cascadeDepth: 0,
        priority: 'alert',
      });

      // Biological NSV — lower recovery score reflects impaired state at plan start.
      const recoveryScoreOnStart =
        plan.type === 'rehab' ? 2 : plan.type === 'rest' ? 4 : plan.type === 'active' ? 5 : 6;
      queueNSVUpdate(
        user.uid,
        { biological: { recoveryScore: recoveryScoreOnStart, cnsFatigue: 8 } },
        'recovery_start',
      );

      setIsRecoveryModalOpen(false);
      setActiveTab('recovery');
      setRecoveryDraft(null);
      setSomaConsult(null);
      setAgnesConsult(null);
      setPendingConsults({ soma: false, agnes: false });
    },
    [profile, encryptionKey, user, setActiveTab],
  );

  const handleSaveRecoveryCheckin = useCallback(
    async (payload: Omit<TitanRecoveryCheckin, 'date'> & { date?: string }) => {
      if (!profile || !encryptionKey || !user) return;

      const date = payload.date ?? todayIso();
      const nextEntry: TitanRecoveryCheckin = {
        date,
        pain: payload.pain,
        fatigue: payload.fatigue,
        sleepQuality: payload.sleepQuality,
        mood: payload.mood,
        notes: payload.notes,
        skipped: payload.skipped,
      };
      const filtered = (profile.recoveryCheckins ?? []).filter((c) => c.date !== date);
      const updated: TitanProfile = {
        ...profile,
        recoveryCheckins: [nextEntry, ...filtered].slice(0, 180),
        updatedAt: new Date().toISOString(),
      };
      await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

      if (!payload.skipped) {
        // Weighted recovery score: pain and fatigue are impairment (inverted),
        // sleep quality is a positive contributor.
        const checkinRecoveryScore = Math.min(
          10,
          Math.max(
            0,
            Math.round(
              (10 - nextEntry.pain) * 0.3 +
                (10 - nextEntry.fatigue) * 0.4 +
                nextEntry.sleepQuality * 0.3,
            ),
          ),
        );
        queueNSVUpdate(
          user.uid,
          {
            biological: {
              recoveryScore: checkinRecoveryScore,
              sleepQuality: nextEntry.sleepQuality,
            },
          },
          'recovery_checkin',
        );

        // Early-recovery signal — notify other modules when readiness is high.
        if (checkinRecoveryScore >= 8) {
          Spine.emit({
            type: 'RECOVERY_AVAILABLE',
            source: 'titan',
            domain: 'B',
            data: { recoveryScore: checkinRecoveryScore, source: 'daily_checkin', date },
            cascadeDepth: 0,
            priority: 'info',
          });
        }
      }
    },
    [profile, encryptionKey, user],
  );

  const handleResumeTraining = useCallback(async () => {
    if (!profile || !encryptionKey || !user || !profile.recoveryPlan) return;

    const prevPlan = profile.recoveryPlan;
    const updated: TitanProfile = {
      ...profile,
      recoveryPlan: { ...prevPlan, active: false },
      updatedAt: new Date().toISOString(),
    };
    await saveTitanProfile(updated, { userId: user.uid, encryptionKey });

    // Notify all modules that recovery is complete and training can resume.
    Spine.emit({
      type: 'RECOVERY_AVAILABLE',
      source: 'titan',
      domain: 'B',
      data: {
        previousType: prevPlan.type,
        durationDays: prevPlan.suggestedDurationDays,
        source: 'manual_resume',
      },
      cascadeDepth: 0,
      priority: 'info',
    });

    // Restore biological NSV to baseline recovered state.
    queueNSVUpdate(
      user.uid,
      { biological: { recoveryScore: 7, cnsFatigue: 2 } },
      'resume_training',
    );

    setIsResumeModalOpen(false);
    setRecoveryCompleteMessage("You're cleared to train. Great work completing your recovery.");
    window.setTimeout(() => {
      setRecoveryCompleteMessage(null);
      setActiveTab('train');
    }, 3000);
  }, [profile, encryptionKey, user, setActiveTab]);

  const requestRecoveryConsults = useCallback(
    (reasons: TitanRecoveryReason[], bodyRegion?: TitanRecoveryBodyRegion) => {
      if (!user || isGuest) return;

      const recoveryScore =
        globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null;
      const baseContext = {
        reasons,
        bodyRegion,
        recoveryScore,
        summary: profile?.summary ?? '',
        injuries: profile?.history?.injuries ?? [],
        sleepSummary: profile?.activity?.sleepHours ?? null,
        medicalSummary: somaProfile?.medicalSummary ?? profile?.medicalSummary ?? null,
        clearances: somaProfile?.clearances?.slice(0, 2) ?? [],
        biomarkers: somaProfile?.biomarkers?.slice(0, 2) ?? [],
        labSummaries: somaProfile?.labSummaries?.slice(0, 2) ?? [],
      };
      const prompt = [
        'RECOVERY_CONSULT_REQUEST',
        'Respond ONLY with JSON: {"summary": "...", "suggestedType": "rest|active|rehab|deload", "suggestedDurationDays": number, "rehabTemplateId": "optional", "severity": "low|medium|high"}',
        `Context: ${JSON.stringify(baseContext)}`,
      ].join('\n');

      if (reasons.includes('injury')) {
        AraHandoffService.store({
          moduleId: 'soma',
          type: 'query',
          content: prompt,
          reason: 'recovery_consult',
          sourceModuleId: 'titan',
          createdAt: new Date().toISOString(),
        });
        setPendingConsults((prev) => ({ ...prev, soma: true }));
      }
      if (reasons.includes('stress')) {
        AraHandoffService.store({
          moduleId: 'agnes',
          type: 'query',
          content: prompt,
          reason: 'recovery_consult',
          sourceModuleId: 'titan',
          createdAt: new Date().toISOString(),
        });
        setPendingConsults((prev) => ({ ...prev, agnes: true }));
      }
    },
    [
      user,
      isGuest,
      globalSoul?.crossFunctionalState?.biological?.recoveryScore,
      profile,
      somaProfile,
    ],
  );

  // ── Spine event listeners ─────────────────────────────────────────────────

  useSpineEvent(
    'COMPOUND_STRESS',
    useCallback(
      (event) => {
        if (!profile?.onboardingComplete) return;
        const eventKey = `compound-stress-${event.id}`;
        if (handledSpineEventsRef.current.has(eventKey)) return;
        handledSpineEventsRef.current.add(eventKey);

        if (!isRecoveryActive) {
          openRecoveryModal({ reasons: ['stress'], type: 'rest', durationDays: 7 });
          return;
        }
        const stressLoad = event.data?.stressLoad as number | undefined;
        const prompt =
          stressLoad != null && stressLoad >= 8
            ? `Agnes has flagged critical compound stress (level ${stressLoad}/10) across domains. Review my current training load and recommend a deload protocol or active recovery day. Consider adjusting this week's plan.`
            : `Agnes has flagged elevated compound stress. Should I scale back training intensity this week? Review my schedule and recovery state.`;
        ai.handleSendMessage(prompt);
      },
      [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal],
    ),
  );

  useSpineEvent(
    'BURNOUT_WARNING',
    useCallback(
      (event) => {
        if (!profile?.onboardingComplete) return;
        const eventKey = `burnout-${event.id}`;
        if (handledSpineEventsRef.current.has(eventKey)) return;
        handledSpineEventsRef.current.add(eventKey);

        if (!isRecoveryActive) {
          openRecoveryModal({ reasons: ['stress'], type: 'rest', durationDays: 10 });
          return;
        }
        ai.handleSendMessage(
          'Agnes has detected a burnout warning signal. Please reduce training volume immediately and suggest a 3–5 day active recovery protocol based on my current state.',
        );
      },
      [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal],
    ),
  );

  useSpineEvent(
    'REDUCE_TRAINING_LOAD',
    useCallback(
      (event) => {
        if (!profile?.onboardingComplete) return;
        const eventKey = `reduce-load-${event.id}`;
        if (handledSpineEventsRef.current.has(eventKey)) return;
        handledSpineEventsRef.current.add(eventKey);

        if (!isRecoveryActive) {
          openRecoveryModal({ reasons: ['overtraining'], type: 'deload', durationDays: 7 });
          return;
        }
        const reason = event.data?.reason as string | undefined;
        const capacity = event.data?.capacityPercent as number | undefined;
        const contextMsg =
          reason === 'atlas_recovery_day'
            ? `Atlas has scheduled a recovery day. Training capacity is capped at ${capacity ?? 50}% today.`
            : reason === 'high_rpe_session'
            ? `Your last session had very high RPE. Your next session should be at ${capacity ?? 60}% capacity — prioritise technique, mobility, or active recovery.`
            : `A load reduction signal was received (${reason ?? 'system'}, ${capacity ?? 60}% capacity). Recommend adjusting today's training accordingly.`;
        ai.handleSendMessage(`[System] ${contextMsg} Please update my plan for today or tomorrow.`);
      },
      [profile?.onboardingComplete, ai.handleSendMessage, isRecoveryActive, openRecoveryModal],
    ),
  );

  useSpineEvent(
    'RECOVERY_AVAILABLE',
    useCallback(
      (event) => {
        if (!profile?.onboardingComplete) return;
        const eventKey = `recovery-available-${event.id}`;
        if (handledSpineEventsRef.current.has(eventKey)) return;
        handledSpineEventsRef.current.add(eventKey);
        ai.handleSendMessage(
          '[System] Recovery metrics have improved — a performance window is open. ' +
            'Based on my current readiness, what high-quality training session do you recommend for today?',
        );
      },
      [profile?.onboardingComplete, ai.handleSendMessage],
    ),
  );

  return {
    isRecoveryModalOpen,
    setIsRecoveryModalOpen,
    recoveryDraft,
    somaConsult,
    setSomaConsult,
    agnesConsult,
    setAgnesConsult,
    pendingConsults,
    setPendingConsults,
    isResumeModalOpen,
    setIsResumeModalOpen,
    openRecoveryModal,
    handleSaveRecoveryPlan,
    handleSaveRecoveryCheckin,
    handleResumeTraining,
    requestRecoveryConsults,
    daysRemaining,
    hasCheckinToday,
    recoveryCheckins,
    recoveryCompleteMessage,
  };
}
