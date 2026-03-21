import React, { useCallback } from 'react';
import { saveSomaProfile, createEmptySomaProfile } from '../services/soma-profile-service';
import type { SomaProfile } from '../types';
import { UnifiedOnboardingShell } from '@/core/intake/UnifiedOnboardingShell';
import { SOMA_BASE_SPEC } from '@/core/intake/onboarding-configs';

interface SomaOnboardingProps {
  profile: SomaProfile | null;
  userId: string;
  encryptionKey: CryptoKey;
  onComplete: () => void;
}

function parseLines(text: string): string[] {
  return String(text || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

export function SomaOnboarding({ profile, userId, encryptionKey, onComplete }: SomaOnboardingProps) {
  const handleExpressComplete = useCallback(async (values: Record<string, unknown>) => {
    const base = profile ?? createEmptySomaProfile(userId);
    await saveSomaProfile(
      {
        ...base,
        userId,
        knownConditions: parseLines(String(values.conditions ?? '')),
        allergies: parseLines(String(values.allergies ?? '')),
        medications: parseLines(String(values.medications ?? '')),
        medicalOnboardingComplete: true,
        updatedAt: new Date().toISOString(),
      },
      { userId, encryptionKey }
    );
    onComplete();
  }, [profile, userId, encryptionKey, onComplete]);

  return (
    <UnifiedOnboardingShell
      spec={SOMA_BASE_SPEC}
      onExpressComplete={handleExpressComplete}
      defaultMode="express"
    />
  );
}
