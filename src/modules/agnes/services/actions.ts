import { ActionHub } from '@/lib/actions/action-hub';
import {
  normalizeBeliefGraph,
  loadBeliefGraph,
  saveBeliefGraph,
} from './belief-graph-service';
import { proposeBeliefGraphCandidate } from './belief-graph-workflow-service';
import { loadAgnesProfile, saveAgnesProfile } from './agnes-profile-service';
import type { SessionNote } from '@/lib/types';
import { Spine } from '@/lib/spine/spine-event-bus';

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

  ActionHub.register('agnes', 'update_belief_graph', async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    if (!userId || !encryptionKey) return;
    const graph = normalizeBeliefGraph(payload);
    if (graph.nodes.length === 0) return;

    // mode: 'apply' commits directly (for high autopilot levels or explicit user approval)
    // mode: 'propose' (default) routes through the proposal/review workflow
    if ((payload as any)?.mode === 'apply') {
      const existing = await loadBeliefGraph({ userId, encryptionKey });
      const merged = existing
        ? { ...existing, nodes: [...existing.nodes, ...graph.nodes], edges: [...(existing.edges ?? []), ...(graph.edges ?? [])], updatedAt: new Date().toISOString() }
        : { ...graph, updatedAt: new Date().toISOString() };
      await saveBeliefGraph(merged, { userId, encryptionKey });
      pushAssistantMessage?.('Belief graph updated.');
      return;
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
  });

  ActionHub.register('agnes', 'update_agnes_profile', async ({ userId, encryptionKey, payload, markProfileDirty }) => {
    if (!userId || !encryptionKey) return;
    const current = await loadAgnesProfile({ userId, encryptionKey });
    if (!current) return;
    const next = {
      ...current,
      baseContext: { ...current.baseContext, ...(payload as any) },
      updatedAt: new Date().toISOString()
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
  });

  ActionHub.register('agnes', 'crisis_flag', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    // Reflect crisis state in NSV so cross-module reads see it
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { stressLoad: 10 } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (crisis_flag):', e);
      });
    }
    emitSpineEvent('CRISIS_DETECTED', {
      trigger: (payload as any)?.trigger || 'unknown',
      severity: (payload as any)?.severity || 'high',
      timestamp: new Date().toISOString()
    });
    // Also publish directly so cascade rules fire immediately
    Spine.publish({
      type: 'CRISIS_DETECTED',
      source: 'agnes',
      domain: 'E',
      priority: 'critical',
      data: {
        trigger: (payload as any)?.trigger || 'unknown',
        severity: (payload as any)?.severity || 'high',
        timestamp: new Date().toISOString()
      }
    });
  });

  // Emotional NSV actions — skip NSV writes and spine events for ephemeral (impromptu) sessions
  ActionHub.register('agnes', 'update_emotional_resilience', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const score = typeof (payload as any)?.score === 'number' ? (payload as any).score : null;
    if (score === null) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { emotionalResilience: score } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_emotional_resilience):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_emotional_resilience)');
    }
    // Burnout warning if resilience critically low
    if (score <= 3) {
      emitSpineEvent('BURNOUT_WARNING', { cnsFatigue: score / 10, source: 'agnes', trigger: 'low_resilience' });
    }
  });

  ActionHub.register('agnes', 'update_stress_load', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const score = typeof (payload as any)?.score === 'number' ? (payload as any).score : null;
    if (score === null) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { stressLoad: score } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_stress_load):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_stress_load)');
    }
    if (score >= 8) {
      emitSpineEvent('COMPOUND_STRESS', { stressLoad: score, source: 'agnes' });
    } else if (score >= 6) {
      emitSpineEvent('VITAL_UPDATED', { stressLoad: score, source: 'agnes', domain: 'E' });
    }
  });

  ActionHub.register('agnes', 'update_mood_trend', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const trend = (payload as any)?.trend as string | undefined;
    if (!trend) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { moodTrend: trend as any } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_mood_trend):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_mood_trend)');
    }
    emitSpineEvent('VITAL_UPDATED', { moodTrend: trend, source: 'agnes', domain: 'E' });
  });

  ActionHub.register('agnes', 'update_trauma_markers', async ({ payload, persistencePolicy, updateGlobalSoul }) => {
    const markers = Array.isArray((payload as any)?.markers) ? (payload as any).markers : [];
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers } }).catch((e: unknown) => {
        console.error('[Agnes] NSV write failed (update_trauma_markers):', e);
      });
    } else {
      console.warn('[Agnes] NSV write skipped — ephemeral session (update_trauma_markers)');
    }
  });

  ActionHub.register('agnes', 'sync_vitals', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
    const emotional = (payload as any)?.emotional as Record<string, unknown> | undefined;
    if (!emotional) return;
    if (persistencePolicy !== 'ephemeral') {
      await updateGlobalSoul({ emotional: emotional as any }).catch((e: unknown) => {
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
    if (!userId || !encryptionKey) { pushAssistantMessage?.('Unable to save note: vault is locked.'); return; }
    const note = typeof (payload as any)?.note === 'string' ? (payload as any).note.trim().slice(0, 2000) : '';
    if (!note) { pushAssistantMessage?.('No note content provided.'); return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('Unable to save note: profile not found.'); return; }
    const newNote: SessionNote = {
      id: `snote_${crypto.randomUUID()}`,
      note,
      timestamp: new Date().toISOString(),
      sessionId: typeof (payload as any)?.sessionId === 'string' ? (payload as any).sessionId : undefined,
    };
    const next = {
      ...profile,
      sessionNotes: [...(profile.sessionNotes ?? []), newNote].slice(-200),
      updatedAt: new Date().toISOString(),
    };
    await saveAgnesProfile(next, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.('Session note saved.');
  });

  ActionHub.register('agnes', 'agnes_update_session_note', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('Unable to update note: vault is locked.'); return; }
    const noteId = typeof (payload as any)?.noteId === 'string' ? (payload as any).noteId : null;
    const newText = typeof (payload as any)?.note === 'string' ? (payload as any).note.trim().slice(0, 2000) : null;
    if (!noteId || !newText) { pushAssistantMessage?.('noteId and note are required.'); return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('Unable to update note: profile not found.'); return; }
    const notes = profile.sessionNotes ?? [];
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) { pushAssistantMessage?.(`Note "${noteId}" not found.`); return; }
    notes[idx] = { ...notes[idx], note: newText, timestamp: new Date().toISOString() };
    await saveAgnesProfile({ ...profile, sessionNotes: notes, updatedAt: new Date().toISOString() }, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.('Session note updated.');
  });

  ActionHub.register('agnes', 'agnes_delete_session_note', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('Unable to delete note: vault is locked.'); return; }
    const noteId = typeof (payload as any)?.noteId === 'string' ? (payload as any).noteId : null;
    if (!noteId) { pushAssistantMessage?.('noteId is required.'); return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('Unable to delete note: profile not found.'); return; }
    const filtered = (profile.sessionNotes ?? []).filter(n => n.id !== noteId);
    await saveAgnesProfile({ ...profile, sessionNotes: filtered, updatedAt: new Date().toISOString() }, { userId, encryptionKey });
    markProfileDirty?.();
    pushAssistantMessage?.('Session note deleted.');
  });

  // ── Somatic Mode Toggle ────────────────────────────────────────────────────

  ActionHub.register('agnes', 'agnes_set_somatic_mode', async ({ userId, encryptionKey, payload, pushAssistantMessage, markProfileDirty }) => {
    if (!userId || !encryptionKey) { pushAssistantMessage?.('Unable to update somatic mode: vault is locked.'); return; }
    const validModes = ['active', 'passive', 'off'] as const;
    const mode = (payload as any)?.somaticMode;
    if (!validModes.includes(mode)) { pushAssistantMessage?.('Invalid somaticMode. Use: active, passive, or off.'); return; }
    const profile = await loadAgnesProfile({ userId, encryptionKey });
    if (!profile) { pushAssistantMessage?.('Unable to update somatic mode: profile not found.'); return; }
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
}
