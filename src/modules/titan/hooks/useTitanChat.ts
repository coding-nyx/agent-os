/**
 * useTitanChat
 *
 * Groups chat-prompt helper callbacks (analyze routine, generate plan, import,
 * submit for approval, custom fields), the seed-opening-message effect,
 * the medical-data vault advisory, the existing-exercises memo, and the
 * calibrate-metric handler.
 *
 * Returns everything the component needs to drive the AI chat panel and
 * related prompts without holding domain logic inline.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import type { TitanProfile, SomaProfile, GlobalProjection } from '@/lib/types';
import type { PlanTab } from '../tabs/PlanTab';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { TITAN_PROMPT_FALLBACK } from '../prompts/titan-prompt-fallback';
import { useNavigate } from 'react-router-dom';
import { getCalibrationPrompt, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';

interface UseTitanChatParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: AuthUser | null;
  somaProfile: SomaProfile | null;
  globalSoul: GlobalProjection | null;
  isRecoveryActive: boolean;
  isModuleAccessible: (moduleId: ModuleId) => boolean;
  lockVault: () => void;
  setIsChatCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useTitanChat({
  profile,
  encryptionKey,
  user,
  somaProfile,
  globalSoul,
  isRecoveryActive,
  isModuleAccessible,
  lockVault,
  setIsChatCollapsed,
}: UseTitanChatParams) {
  const navigate = useNavigate();

  // ── Agent alias ──────────────────────────────────────────────────────────
  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';

  // ── Module AI hook ───────────────────────────────────────────────────────
  const ai = useModuleAI({
    moduleId: 'titan',
    // TITAN_PROMPT_FALLBACK is used only when KMP's PersonaPromptCatalog returns
    // an empty string for the titan moduleId. KMP (TitanPersonaPrompts.kt) is
    // the authoritative source; this is a safety-net, not the real prompt.
    systemPrompt: TITAN_PROMPT_FALLBACK,
    encryptionKey,
    moduleContext: {
      titan_profile: profile,
      titan_mode: isRecoveryActive ? 'recovery' : 'training',
      titan_recovery_score: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
      titan_hormonal_context: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
      titan_soma_profile: somaProfile,
    },
  });

  // ── Open chat + send ─────────────────────────────────────────────────────
  const openChatAndSend = useCallback((prompt: string) => {
    setIsChatCollapsed(false);
    ai.handleSendMessage(prompt);
  }, [ai.handleSendMessage, setIsChatCollapsed]);

  // ── Existing exercises memo (for QuickLogDrawer autocomplete) ────────────
  const existingExercises = useMemo(() => {
    const names = new Set<string>();
    for (const session of profile?.workoutSessions ?? []) {
      for (const ex of session.exercises) names.add(ex.exerciseName);
    }
    for (const routine of profile?.routines ?? []) {
      for (const ex of routine.exercises) names.add(ex.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [profile?.workoutSessions, profile?.routines]);

  // ── Seed opening message after onboarding ────────────────────────────────
  useEffect(() => {
    if (profile?.onboardingComplete && ai.messages.length === 0 && !ai.isProcessing && !ai.streamingText) {
      const hasRoutine = profile.routines && profile.routines.length > 0;
      ai.setMessages([{
        role: 'assistant',
        content: hasRoutine
          ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
          : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?",
      }]);
    }
  }, [profile?.onboardingComplete, ai.messages.length, ai.isProcessing, ai.streamingText, ai.setMessages, profile?.routines]);

  // ── Medical-data vault advisory (S21-015) ────────────────────────────────
  const [showAdvisory, setShowAdvisory] = useState(false);

  useEffect(() => {
    const hasMedicalData = (
      (profile?.labSummaries?.length ?? 0) > 0 ||
      (profile?.medicalImageAnalyses?.length ?? 0) > 0 ||
      (profile?.medications?.length ?? 0) > 0
    );
    if (!hasMedicalData || !profile?.onboardingComplete || !isModuleAccessible('titan')) return;
    const sessionKey = `titan-vault-advisory-${user?.uid ?? 'guest'}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, '1');
    setShowAdvisory(true);
  }, [
    profile?.labSummaries?.length,
    profile?.medicalImageAnalyses?.length,
    profile?.medications?.length,
    profile?.onboardingComplete,
    user?.uid,
    isModuleAccessible,
  ]);

  useEffect(() => {
    if (!showAdvisory) return;
    const timer = window.setTimeout(() => setShowAdvisory(false), 8000);
    return () => window.clearTimeout(timer);
  }, [showAdvisory]);

  // ── Calibrate metric ────────────────────────────────────────────────────
  const handleCalibrate = useCallback((metricKey: string) => {
    const key = metricKey as NSVMetricPath;
    const owner = getMetricOwner(key);
    const prompt = getCalibrationPrompt(key);
    NexusHandoffService.store({
      moduleId: owner,
      type: 'delegate',
      content: prompt,
      reason: 'calibration_request',
      sourceModuleId: 'titan',
      createdAt: new Date().toISOString(),
    });
    const route = NexusRoutingService.getRoute(owner as ModuleId);
    if (route) navigate(route);
  }, [navigate]);

  // ── Chat-prompt helpers ──────────────────────────────────────────────────
  const handleAnalyzeRoutine = useCallback((routine: { name: string; weekday?: string; rationale?: string; exercises: { name: string; sets: number; reps: string; notes?: string }[] }) => {
    const exerciseList = routine.exercises.map((ex, i) => `${i + 1}. **${ex.name}** — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`).join('\n');
    openChatAndSend([
      `Analyze my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}":`,
      routine.rationale ? `Rationale: ${routine.rationale}` : '',
      `\nExercises:\n${exerciseList}`,
      '\nIs this well-balanced? Any improvements for injury prevention or performance?',
    ].filter(Boolean).join('\n'));
  }, [openChatAndSend]);

  const handleGeneratePlan = useCallback(() => {
    openChatAndSend('Generate a personalized weekly training routine based on my profile, goals, and current recovery state.');
  }, [openChatAndSend]);

  const handleImportRoutine = useCallback(() => {
    openChatAndSend("I already have a training routine I'd like to log. Let me describe it to you.");
  }, [openChatAndSend]);

  const handleSubmitRoutineForApproval = useCallback((routine: { id?: string; name: string; weekday?: string; rationale?: string; timeframe?: string; exercises: { name: string; sets: number; reps: string; notes?: string }[] }) => {
    const isEdit = (profile?.routines ?? []).some((r) => r.id === routine.id);
    const exerciseList = routine.exercises.map((ex, i) => `  ${i + 1}. ${ex.name} — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`).join('\n');
    const meta = [
      routine.rationale ? `Rationale: ${routine.rationale}` : null,
      routine.timeframe ? `Duration: ${routine.timeframe}` : null,
    ].filter(Boolean).join(' | ');
    openChatAndSend([
      isEdit ? `I've edited my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}".` : `I've manually built a new ${routine.weekday?.toUpperCase() || ''} routine: "${routine.name}".`,
      meta,
      `\nExercises:\n${exerciseList}`,
      '\nPlease review this against my current goals, recovery state, and training history.',
      'If it is appropriate and well-structured, commit it now using the update_routine action.',
      'If you have concerns or improvements, raise them first — but be concise.',
    ].filter(Boolean).join('\n'));
  }, [profile?.routines, openChatAndSend]);

  const handleSubmitCustomFieldsForApproval = useCallback((values: Record<string, unknown>, categoryLabel: string) => {
    const nonEmpty = Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (nonEmpty.length === 0) return;
    openChatAndSend([
      `I want to update my custom ${categoryLabel} tracking fields:`,
      nonEmpty.map(([key, val]) => `  • ${key}: ${val}`).join('\n'),
      'Please review these values against my current goals and nutrition context.',
      'If they look correct and relevant, commit them via the update_titan_profile action.',
      'Flag anything that looks inconsistent or out of range.',
    ].join('\n'));
  }, [openChatAndSend]);

  return {
    ai,
    agentAlias,
    openChatAndSend,
    existingExercises,
    showAdvisory,
    setShowAdvisory,
    handleCalibrate,
    handleAnalyzeRoutine,
    handleGeneratePlan,
    handleImportRoutine,
    handleSubmitRoutineForApproval,
    handleSubmitCustomFieldsForApproval,
    lockVault,
  };
}
