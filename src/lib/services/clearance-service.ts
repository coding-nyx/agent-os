import type { SomaProfile, ClearanceRecord } from '@/lib/types';

const CONTRAINDICATED_PATTERNS: Record<string, string[]> = {
  'high_intensity': ['cardiac', 'heart', 'hypertension', 'seizure', 'fracture'],
  'heavy_lifting': ['hernia', 'spinal', 'disc', 'fracture', 'pregnancy'],
  'endurance': ['asthma', 'copd', 'cardiac', 'anemia'],
  'flexibility': ['hypermobility', 'joint instability'],
};

function hasContraindication(conditions: string[], medications: string[], activity: string): string | null {
  const normalizedActivity = activity.toLowerCase().replace(/[_-]/g, ' ');
  const allTerms = [...conditions, ...medications].map(t => t.toLowerCase());

  for (const [pattern, contraindications] of Object.entries(CONTRAINDICATED_PATTERNS)) {
    if (!normalizedActivity.includes(pattern.replace(/_/g, ' '))) continue;
    for (const contra of contraindications) {
      const match = allTerms.find(t => t.includes(contra));
      if (match) return `${match} may contraindicate ${pattern.replace(/_/g, ' ')}`;
    }
  }

  return null;
}

export class ClearanceService {
  static evaluate(profile: SomaProfile, activity: string): ClearanceRecord {
    const contraindication = hasContraindication(
      profile.knownConditions ?? [],
      profile.medications ?? [],
      activity
    );

    if (contraindication) {
      return {
        id: crypto.randomUUID(),
        activity,
        status: 'denied',
        reason: contraindication,
        issuedAt: new Date().toISOString(),
      };
    }

    // Check for recent denied clearances on same activity
    const recentDenied = (profile.clearances ?? []).find(
      c => c.activity.toLowerCase() === activity.toLowerCase() && c.status === 'denied'
    );
    if (recentDenied) {
      const deniedAge = Date.now() - new Date(recentDenied.issuedAt).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (deniedAge < sevenDays) {
        return {
          id: crypto.randomUUID(),
          activity,
          status: 'conditional',
          reason: `Previously denied (${recentDenied.reason}). Re-evaluation recommended.`,
          issuedAt: new Date().toISOString(),
        };
      }
    }

    return {
      id: crypto.randomUUID(),
      activity,
      status: 'granted',
      reason: 'No contraindications detected.',
      issuedAt: new Date().toISOString(),
    };
  }

  static getLatestClearance(profile: SomaProfile): ClearanceRecord | null {
    const clearances = profile.clearances ?? [];
    return clearances.length > 0 ? clearances[0] : null;
  }

  static isActivitySafe(profile: SomaProfile, activity: string): boolean {
    const result = ClearanceService.evaluate(profile, activity);
    return result.status === 'granted';
  }
}
