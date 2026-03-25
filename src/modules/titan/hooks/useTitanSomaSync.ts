/**
 * useTitanSomaSync
 *
 * Subscribes to the Soma profile that Titan reads for clearance / biomarker
 * signals.  Also resolves the Soma E2EE key via the vault master key so that
 * the subscription can decrypt the profile.
 *
 * Responsibility: Soma data synchronisation only — no UI side-effects.
 */

import { useState, useEffect } from 'react';
import type { SomaProfile } from '@/lib/types';
import { subscribeSomaProfile } from '../../soma/services/soma-profile-service';

export function useTitanSomaSync(
  userId: string | undefined,
  getMasterKey: () => Promise<CryptoKey | null>,
): {
  somaProfile: SomaProfile | null;
  somaEncryptionKey: CryptoKey | null;
} {
  const [somaProfile, setSomaProfile] = useState<SomaProfile | null>(null);
  const [somaEncryptionKey, setSomaEncryptionKey] = useState<CryptoKey | null>(null);

  // Resolve the vault master key once on mount (or when getMasterKey changes).
  useEffect(() => {
    let cancelled = false;
    getMasterKey().then((key) => {
      if (!cancelled) setSomaEncryptionKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [getMasterKey]);

  // Subscribe to the Soma profile; re-subscribe whenever the key rotates.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeSomaProfile(
      { userId, encryptionKey: somaEncryptionKey },
      setSomaProfile,
    );
    return unsub;
  }, [userId, somaEncryptionKey]);

  return { somaProfile, somaEncryptionKey };
}
