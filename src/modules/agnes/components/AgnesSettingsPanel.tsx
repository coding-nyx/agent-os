import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SlidersHorizontal, Activity } from 'lucide-react';
import { NeuralToggle } from '@/core/components/NeuralToggle';
import type { TherapyIntakeProfile } from '@/lib/types';
import { AgnesEngagementModeControl } from './AgnesEngagementModeControl';
import {
  AgnesPersistentEngagementMode,
  DEFAULT_AGNES_ENGAGEMENT_MODE,
  resolvePersistentAgnesMode,
} from '../engagement-modes';

interface AgnesSettingsPanelProps {
  profile: TherapyIntakeProfile | null;
  onSave: (updated: TherapyIntakeProfile) => Promise<void>;
  isSaving?: boolean;
}

export function AgnesSettingsPanel({ profile, onSave }: AgnesSettingsPanelProps) {
  const [somaticEnabled, setSomaticEnabled] = useState<boolean>(
    profile?.baseContext?.somaticEnabled !== false
  );
  const [preferredMode, setPreferredMode] = useState<AgnesPersistentEngagementMode>(
    resolvePersistentAgnesMode(
      profile?.baseContext && 'preferredEngagementMode' in profile.baseContext
        ? (profile.baseContext as { preferredEngagementMode?: unknown }).preferredEngagementMode
        : DEFAULT_AGNES_ENGAGEMENT_MODE,
    )
  );

  // Guard: ignore the Firestore echo that comes back after we save
  const pendingSave = useRef(false);

  useEffect(() => {
    if (pendingSave.current) return; // skip the echo from our own save
    setSomaticEnabled(profile?.baseContext?.somaticEnabled !== false);
    setPreferredMode(resolvePersistentAgnesMode(
      profile?.baseContext && 'preferredEngagementMode' in profile.baseContext
        ? (profile.baseContext as { preferredEngagementMode?: unknown }).preferredEngagementMode
        : DEFAULT_AGNES_ENGAGEMENT_MODE,
    ));
  }, [profile?.baseContext]);

  const handleSomaticToggle = useCallback(async () => {
    if (!profile) return;
    const newValue = !somaticEnabled;
    setSomaticEnabled(newValue);
    pendingSave.current = true;
    try {
      await onSave({
        ...profile,
        baseContext: { ...profile.baseContext, somaticEnabled: newValue },
        updatedAt: new Date().toISOString(),
      });
    } finally {
      // allow future external changes after a tick
      setTimeout(() => { pendingSave.current = false; }, 500);
    }
  }, [profile, somaticEnabled, onSave]);

  const handlePreferredModeChange = useCallback(async (mode: AgnesPersistentEngagementMode) => {
    if (!profile) return;
    setPreferredMode(mode);
    pendingSave.current = true;
    try {
      await onSave({
        ...profile,
        baseContext: { ...profile.baseContext, preferredEngagementMode: mode } as TherapyIntakeProfile['baseContext'],
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setTimeout(() => { pendingSave.current = false; }, 500);
    }
  }, [profile, onSave]);

  if (!profile) return null;

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400/70" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
          Session Preferences
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <Activity className="w-4 h-4 text-indigo-400/60 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/80 leading-none mb-1">
              Somatic Awareness
            </p>
            <p className="text-[11px] text-white/35 leading-relaxed">
              Agnes asks about physical sensations and body-based feelings during sessions.
            </p>
          </div>
        </div>

        <NeuralToggle
          checked={somaticEnabled}
          onChange={handleSomaticToggle}
          color="indigo"
          label="Somatic Awareness"
        />
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-white/80 leading-none mb-1">
            Default Session Mode
          </p>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Persistent Agnes sessions open in this mode unless you choose Impromptu support.
          </p>
        </div>
        <AgnesEngagementModeControl
          value={preferredMode}
          onChange={(mode) => handlePreferredModeChange(mode as AgnesPersistentEngagementMode)}
          modes={['casual', 'deep', 'somatic']}
          label="Default Agnes mode"
        />
      </div>
    </div>
  );
}
