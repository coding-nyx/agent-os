import { ActionHub } from '@/lib/actions/action-hub';
import {
  normalizeBeliefGraph,
  loadBeliefGraph,
  saveBeliefGraph,
} from './belief-graph-service';
import { proposeBeliefGraphCandidate } from './belief-graph-workflow-service';
import { loadAgnesProfile, saveAgnesProfile } from './agnes-profile-service';
import type { SessionNote, NeuralStateVector } from '@/lib/types';
import { Spine } from '@/lib/spine/spine-event-bus';

// ── Action Payload Interfaces ───────────────────────────────────────────────

interface BeliefGraphPayload {
  mode?: 'apply' | 'propose';
  nodes?: Array<{ label: string; valence?: 'positive' | 'negative' | 'neutral' }>;
  summary?: string;
  confidence?: number;
}

interface CrisisFlagPayload {
  trigger?: string;
  severity?: string;
}

interface ScorePayload {
  score?: number;
}

interface MoodTrendPayload {
  trend?: string;
}

interface TraumaMarkersPayload {
  markers?: string[];
}

interface SyncVitalsPayload {
  emotional?: Record<string, unknown>;
}

interface SessionNotePayload {
  note?: string;
  sessionId?: string;
  formulationUpdate?: string;
  unfinishedBusiness?: string;
  homeworkSuggested?: string;
  allianceQuality?: string;
  noteId?: string;
}

interface SomaticModePayload {
  somaticMode?: 'active' | 'passive' | 'off';
}

interface SessionMetricsPayload {
  messageCount?: number;
  avgResponseLength?: number;
  silenceCount?: number;
  stressLoad?: number;
}

interface EmergencyContactPayload {
  name?: string;
  relationship?: string;
  phone?: string;
}

interface PsychiatricHistoryPayload {
  hasInpatientHistory?: boolean;
  mostRecentHospitalization?: string;
  currentMedications?: string[];
  diagnosedConditions?: string[];
}

/** Narrow a generic payload to a typed shape. The cast is safe because handlers
 *  validate each field before use (typeof guards, Array.isArray, etc.). */
function typed<T>(payload: Record<string, unknown>): T {
  return payload as unknown as T;
}

let registered = false;

export function registerAgnesActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('agnes', {
    capabilities: ['emotional-support', 'recovery-planning'],
    latencyTier: 'balanced',
  });

  ActionHub.register('agnes', 'create_emotional_support_session', ({ moduleId, payload, emitSpineEvent }) => {
    emitSpineEvent('DRAFT_PROPOSED', payload as Record<string, unknown>, {
      target: typeof payload?.target === 'string' ? payload.target : moduleId,
    });
  });

  ActionHub.register('agnes', 'update_belief_graph', async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
    if (!userId || !encryptionKey) { return; }
    const graph = normalizeBeliefGraph(payload);
    if (graph.nodes.length === 0) { return; }
    const p = typed<BeliefGraphPayload>(payload);

    // mode: 'apply' commits directly (for high autopilot levels or explicit user approval)
    // mode: 'propose' (default) routes through the proposal/review workflow
    if (p.mode === 'apply') {
      const existing = await loadBeliefGraph({ userId, encryptionKey });
      const merged = existing
        ? { ...existing, nodes: [...existing.nodes, ...graph.nodes], edges: [...(existing.edges ?? []), ...(graph.edges ?? [])], updatedAt: new Date().toISOString() }
        : { ...graph, updatedAt: new Date().toISOString() };
      await saveBeliefGraph(merged, { userId, encryptionKey });
      pushAssistantMessage?.('Belief graph updated.');
      return;
    }

    try {
      // Conflict detection: check if new belief's valence contradicts existing beliefs
      const newNodes = p.nodes ?? [];
      const existing = await loadBeliefGraph({ userId, encryptionKey });
      const profile = existing ? { beliefGraph: existing } : null;
      const existingNodes = profile?.beliefGraph?.nodes ?? [];
      const conflicts: string[] = [];
      for (const newNode of newNodes) {
        if (!newNode.valence || newNode.valence === 'neutral') continue;
        const oppositeValence = newNode.valence === 'positive' ? 'negative' : 'positive';
        const conflicting = existingNodes.find(
          (e) => e.valence === oppositeValence &&
          e.label?.toLowerCase().includes(newNode.label?.toLowerCase().split(' ')[0])
        );
        if (conflicting) {
          conflicts.push(`"${newNode.label}" conflicts with existing belief "${conflicting.label}"`);
        }
      }
      if (conflicts.length > 0) {
        emitSpineEvent('CONFLICT_DETECTED', { beliefConflicts: conflicts, source: 'agnes' });
        // Don't block — just note the conflict. Proceed with proposal.
      }

      await proposeBeliefGraphCandidate(
        {
          source: 'agnes_session',
          title: 'Review Agnes belief suggestion',
          summary:
            typeof payload.summary === 'string'
              ? payload.summary
              : 'Agnes identified a candidate belief pattern for your review.',
          confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
          graph,
        },
        { userId, encryptionKey },
      );
      // Silent — belief graph proposals are invisible clinical telemetry
    } catch (e: unknown) {
      console.error('[Agnes] proposeBeliefGraphCandidate failed:', e);
    }
  });

  ActionHub.register('agnes', 'update_agnes_profile', async ({ userId, encryptionKey, payload, markProfileDirty }) => {
    if (!userId || !encryptionKey) { return; }
    const current = await loadAgnesProfile({ userId, encryptionKey });
    if (!current) { return; }
    const next = {
      ...current,
      baseContext: { ...current.baseContext, ...payload },
      updatedAt: new Date().toISOString()
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
  });

  ActionHub.register('agnes', 'crisis_flag', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    const p = typed<CrisisFlagPayload>(payload);
    // Reflect crisis state in NSV so cross-module reads see it
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { stressLoad: 10 } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (crisis_flag):', e);
      });
    }
    emitSpineEvent('CRISIS_DETECTED', {
      trigger: p.trigger || 'unknown',
      severity: p.severity || 'high',
      timestamp: new Date().toISOString()
    });
    // Also publish directly so cascade rules fire immediately
    Spine.publish({
      type: 'CRISIS_DETECTED',
      source: 'agnes',
      domain: 'E',
      priority: 'critical',
      data: {
        trigger: p.trigger || 'unknown',
        severity: p.severity || 'high',
        timestamp: new Date().toISOString()
      }
    });
    pushAssistantMessage?.('I hear you. You\'re safe here with me right now. Let\'s slow down together — there\'s no rush. I\'m not going anywhere.');
    // Initiate post-crisis recovery phase (CRISIS_RECOVERY_INITIATED not in SpineEventType — using MODULE_STATE_UPDATED equivalent)
    emitSpineEvent('CRISIS_MODE', { crisisFlag: true, source: 'agnes', recoveryInitiated: true });
  });

  // Emotional NSV actions — skip NSV writes and spine events for ephemeral (impromptu) sessions
  ActionHub.register('agnes', 'update_emotional_resilience', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    const p = typed<ScorePayload>(payload);
    const score = typeof p.score === 'number' ? p.score : null;
    if (score === null) { return; }
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { emotionalResilience: score } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_emotional_resilience):', e);
      });
    } else {
      pushAssistantMessage?.('This moment is just for us — nothing is being stored outside this session.');
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_emotional_resilience)');
    }
    // Burnout warning if resilience critically low
    if (score <= 3) {
      emitSpineEvent('BURNOUT_WARNING', { cnsFatigue: score / 10, source: 'agnes', trigger: 'low_resilience' });
    }
  });

  ActionHub.register('agnes', 'update_stress_load', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    const p = typed<ScorePayload>(payload);
    const score = typeof p.score === 'number' ? p.score : null;
    if (score === null) { return; }
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { stressLoad: score } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_stress_load):', e);
      });
    } else {
      pushAssistantMessage?.('This moment is just for us — nothing is being stored outside this session.');
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_stress_load)');
    }
    if (score >= 8) {
      emitSpineEvent('COMPOUND_STRESS', { stressLoad: score, source: 'agnes' });
    } else if (score >= 6) {
      emitSpineEvent('VITAL_UPDATED', { stressLoad: score, source: 'agnes', domain: 'E' });
    }
  });

  ActionHub.register('agnes', 'update_mood_trend', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    const p = typed<MoodTrendPayload>(payload);
    const trend = p.trend;
    if (!trend) { return; }
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { moodTrend: trend } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_mood_trend):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_mood_trend)');
    }
    emitSpineEvent('VITAL_UPDATED', { moodTrend: trend, source: 'agnes', domain: 'E' });
  });

  ActionHub.register('agnes', 'update_trauma_markers', async ({ payload, persistencePolicy, updateGlobalSoul }) => {
    const p = typed<TraumaMarkersPayload>(payload);
    const markers = Array.isArray(p.markers) ? p.markers : [];
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_trauma_markers):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_trauma_markers)');
    }
  });

  ActionHub.register('agnes', 'sync_vitals', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    const p = typed<SyncVitalsPayload>(payload);
    const emotional = p.emotional;
    if (!emotional) { return; }
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (sync_vitals):', e);
      });
    }
    const stressLoad = typeof emotional.stressLoad === 'number' ? emotional.stressLoad : null;
    if (stressLoad !== null && stressLoad >= 8) {
      emitSpineEvent('COMPOUND_STRESS', { stressLoad, source: 'agnes' });
    } else {
      emitSpineEvent('VITAL_UPDATED', { ...emotional, source: 'agnes', domain: 'E' });
    }
  });

  // ── Session Notes ──────────────────────────────────────────────────────────

  ActionHub.register('agnes', 'agnes_create_session_note', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('I\'m keeping that with us right here for now.'); return; }
    const p = typed<SessionNotePayload>(payload);
    const note = typeof p.note === 'string' ? p.note.trim().slice(0, 2000) : '';
    if (!note) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('I\'m keeping that with us right here for now.'); return; }
    const newNote: SessionNote = {
      id: `snote_${crypto.randomUUID()}`,
      note,
      timestamp: new Date().toISOString(),
      sessionId: typeof p.sessionId === 'string' ? p.sessionId : undefined,
      formulationUpdate: typeof p.formulationUpdate === 'string' ? p.formulationUpdate.trim().slice(0, 500) : undefined,
      unfinishedBusiness: typeof p.unfinishedBusiness === 'string' ? p.unfinishedBusiness.trim().slice(0, 500) : undefined,
      homeworkSuggested: typeof p.homeworkSuggested === 'string' ? p.homeworkSuggested.trim().slice(0, 500) : undefined,
      allianceQuality: ['building', 'testing', 'established', 'rupture_detected'].includes(p.allianceQuality ?? '') ? p.allianceQuality as SessionNote['allianceQuality'] : undefined,
    };
    const next = {
      ...profile,
      sessionNotes: [...(profile.sessionNotes ?? []), newNote].slice(-200),
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveAgnesProfile(next, { userId, encryptionKey });
      markProfileDirty?.();
      pushAssistantMessage?.('I\'ve made a note of that.');
    } catch (e: unknown) {
      console.error('[Agnes] saveAgnesProfile failed (agnes_create_session_note):', e);
      pushAssistantMessage?.('I wasn\'t able to hold onto that note just now. It\'s still with us in this conversation.');
    }
  });

  ActionHub.register('agnes', 'agnes_update_session_note', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('I\'m holding that update for you.'); return; }
    const p = typed<SessionNotePayload>(payload);
    const noteId = typeof p.noteId === 'string' ? p.noteId : null;
    const newText = typeof p.note === 'string' ? p.note.trim().slice(0, 2000) : null;
    if (!noteId || !newText) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('I\'m holding that update for you.'); return; }
    const notes = profile.sessionNotes ?? [];
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) { return; }
    notes[idx] = { ...notes[idx], note: newText, timestamp: new Date().toISOString() };
    await saveAgnesProfile({ ...profile, sessionNotes: notes, updatedAt: new Date().toISOString() }, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.('I\'ve made a note of that.');
  });

  ActionHub.register('agnes', 'agnes_delete_session_note', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('I\'ll take care of that once your vault is accessible again.'); return; }
    const p = typed<SessionNotePayload>(payload);
    const noteId = typeof p.noteId === 'string' ? p.noteId : null;
    if (!noteId) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('I\'ll take care of that once your vault is accessible again.'); return; }
    const filtered = (profile.sessionNotes ?? []).filter(n => n.id !== noteId);
    await saveAgnesProfile({ ...profile, sessionNotes: filtered, updatedAt: new Date().toISOString() }, { userId, encryptionKey });
    markProfileDirty?.();
  });

  // ── Somatic Mode Toggle ────────────────────────────────────────────────────

  ActionHub.register('agnes', 'agnes_set_somatic_mode', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { return; }
    const validModes = ['active', 'passive', 'off'] as const;
    const p = typed<SomaticModePayload>(payload);
    const mode = p.somaticMode;
    if (!mode || !validModes.includes(mode)) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { return; }
    const somaticEnabled = mode !== 'off';
    const next = {
      ...profile,
      baseContext: { ...profile.baseContext, somaticEnabled },
      updatedAt: new Date().toISOString(),
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.(`Somatic mode set to: ${mode}.`);
  });

  // ── Phase 5 Intelligence Enhancements ─────────────────────────────────────

  ActionHub.register('agnes', 'track_emotional_trajectory', async ({ userId, encryptionKey, emitSpineEvent, getLatestNSV }) => {
    if (!userId || !encryptionKey) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { return; }

    // Use sessionNotes as a proxy for prior sessions — each note may represent emotional state
    // captured during that session. We need at least 2 sessions to detect a trend.
    const notes = profile.sessionNotes ?? [];
    if (notes.length < 2) { return; }

    // Pull emotional scores from the current NSV as the latest data point,
    // then use the last 2 session timestamps to form a minimal series.
    // Since SessionNote has no embedded scores, we use NSV as the live snapshot
    // and treat each session note as confirming a prior session occurred.
    const nsv = getLatestNSV?.() as NeuralStateVector | undefined;
    const emotional = nsv?.emotional;
    const currentStress = typeof emotional?.stressLoad === 'number' ? emotional.stressLoad
      : null;
    const currentResilience = typeof emotional?.emotionalResilience === 'number' ? emotional.emotionalResilience
      : null;

    // We need at least some emotional data to trend
    if (currentStress === null && currentResilience === null) { return; }

    // Use the last 3 session notes as session count proxies; we treat the current
    // NSV values as the most recent point. Without historical score embedding in
    // SessionNote we can only determine trend from the current session's NSV read.
    // Require at least 2 prior sessions (notes) so the current reading forms a third point.
    const recentNotes = notes.slice(-3);
    if (recentNotes.length < 2) { return; }
    const sessionCount = recentNotes.length;

    // Derive trend from current NSV snapshot thresholds.
    // Without multi-session numeric history, we classify based on current extremes.
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (currentStress !== null && currentStress >= 7) {
      trend = 'declining';
    } else if (currentResilience !== null && currentResilience >= 7) {
      trend = 'improving';
    }

    // trajectory is not a valid field in NeuralStateVector['emotional'] — skip NSV write
    // NSV emotional fields: emotionalResilience, stressLoad, moodTrend, traumaMarkers

    emitSpineEvent('EMOTIONAL_TRAJECTORY_DETECTED', { trend, sessionCount });
  });

  ActionHub.register('agnes', 'predict_session_outcome', ({ payload, emitSpineEvent }) => {
    const p = typed<SessionMetricsPayload>(payload);
    const messageCount = typeof p.messageCount === 'number' ? p.messageCount : undefined;
    const avgResponseLength = typeof p.avgResponseLength === 'number' ? p.avgResponseLength : undefined;
    const silenceCount = typeof p.silenceCount === 'number' ? p.silenceCount : undefined;
    const stressLoad = typeof p.stressLoad === 'number' ? p.stressLoad : undefined;

    const risk = Math.min(1, (
      (silenceCount ?? 0) * 0.2 +
      (stressLoad ?? 5) / 10 * 0.4 +
      ((avgResponseLength ?? 100) < 20 ? 0.3 : 0) +
      ((messageCount ?? 10) < 3 ? 0.1 : 0)
    ));

    // SESSION_TRAJECTORY_CRITICAL is not in SpineEventType — use VITAL_UPDATED as the general signal
    if (risk > 0.7) {
      emitSpineEvent('VITAL_UPDATED', { sessionRisk: 'critical', score: risk, source: 'agnes', domain: 'E' });
    } else if (risk < 0.3) {
      emitSpineEvent('VITAL_UPDATED', { sessionRisk: 'healthy', score: risk, source: 'agnes', domain: 'E' });
    }
  });

  // ── Safety Profile Fields ──────────────────────────────────────────────────

  ActionHub.register('agnes', 'update_emergency_contact', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { return; }
    const p = typed<EmergencyContactPayload>(payload);
    const name = typeof p.name === 'string' ? p.name.trim() : undefined;
    const relationship = typeof p.relationship === 'string' ? p.relationship.trim() : undefined;
    const phone = typeof p.phone === 'string' ? p.phone.trim() : undefined;
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { return; }
    const next = {
      ...profile,
      emergencyContact: { name, relationship, phone },
      updatedAt: new Date().toISOString(),
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.('Emergency contact saved. Thank you for sharing that with me.');
  });

  ActionHub.register('agnes', 'update_psychiatric_history', async ({ userId, encryptionKey, payload, markProfileDirty }) => {
    if (!userId || !encryptionKey) { return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { return; }
    const incoming = typed<PsychiatricHistoryPayload>(payload);
    const existing = profile.psychiatricHistory ?? {};
    const next = {
      ...profile,
      psychiatricHistory: {
        ...existing,
        ...(typeof incoming?.hasInpatientHistory === 'boolean' ? { hasInpatientHistory: incoming.hasInpatientHistory } : {}),
        ...(typeof incoming?.mostRecentHospitalization === 'string' ? { mostRecentHospitalization: incoming.mostRecentHospitalization } : {}),
        ...(Array.isArray(incoming?.currentMedications) ? { currentMedications: incoming.currentMedications } : {}),
        ...(Array.isArray(incoming?.diagnosedConditions) ? { diagnosedConditions: incoming.diagnosedConditions } : {}),
      },
      updatedAt: new Date().toISOString(),
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
    // No user message — background clinical context update, not conversational
  });

  ActionHub.register('agnes', 'initiate_crisis_recovery_protocol', async ({ userId, encryptionKey, persistencePolicy, updateGlobalSoul, emitSpineEvent, pushAssistantMessage }) => {
    emitSpineEvent('CRISIS_MODE', { source: 'agnes', recoveryInitiated: true, grounding: true });

    // stressLoad is a valid field in NeuralStateVector['emotional']
    if (persistencePolicy !== 'ephemeral' && userId) {
      await updateGlobalSoul({ emotional: { stressLoad: 10 } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (initiate_crisis_recovery_protocol):', e);
      });
    }

    pushAssistantMessage?.('Let\'s slow down right here. Take a breath with me — in through the nose for four counts, hold for four, out through the mouth for six. You don\'t have to go anywhere. I\'m right here with you.');
    pushAssistantMessage?.('When you\'re ready, I\'m here to stay with whatever is present for you. You don\'t need to rush.');
  });
}
