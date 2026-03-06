import { ActionHub } from '@/lib/actions/action-hub';
import {
  InterestNode,
  PulseProfile,
  loadPulseProfile,
  savePulseProfile
} from './pulse-profile-service';
import { generateNewsBriefs } from './pulse-news-service';

let registered = false;

function parseScore(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

async function loadProfile(userId?: string | null) {
  return loadPulseProfile({ userId });
}

async function persistProfile(profile: PulseProfile, userId?: string | null) {
  profile.updatedAt = new Date().toISOString();
  await savePulseProfile(profile, { userId });
}

export function registerPulseActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('pulse', {
    update_interest_map: async ({ userId, payload }) => {
      const profile = await loadProfile(userId ?? null);
      if (!profile) return;

      const next: PulseProfile = { ...profile };

      if (Array.isArray(payload?.interests)) {
        const mapped: InterestNode[] = payload.interests.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `interest_${Date.now()}_${index}`,
          topic: typeof entry?.topic === 'string' ? entry.topic : `Topic ${index + 1}`,
          score: parseScore(entry?.score),
          trend: entry?.trend === 'rising' || entry?.trend === 'cooling' ? entry.trend : 'steady',
          lastSeenAt: new Date().toISOString()
        }));
        next.interests = mapped;
      }

      if (typeof payload?.summary === 'string') {
        next.summary = payload.summary;
      }

      await persistProfile(next, userId ?? null);
    },

    track_topic: async ({ userId, payload }) => {
      const profile = await loadProfile(userId ?? null);
      if (!profile) return;

      const node: InterestNode = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        topic: typeof payload?.topic === 'string' ? payload.topic : 'Topic',
        score: parseScore(payload?.score),
        trend: payload?.trend === 'rising' || payload?.trend === 'cooling' ? payload.trend : 'steady',
        lastSeenAt: new Date().toISOString()
      };

      const next: PulseProfile = {
        ...profile,
        interests: [node, ...profile.interests.filter((item) => item.topic !== node.topic)].slice(0, 120)
      };

      await persistProfile(next, userId ?? null);
    },

    synthesize_trends: async ({ userId, payload }) => {
      const profile = await loadProfile(userId ?? null);
      if (!profile) return;

      if (Array.isArray(payload?.briefs)) {
        const next: PulseProfile = {
          ...profile,
          trendBriefs: payload.briefs.filter((entry: Record<string, unknown>) => typeof entry === 'string').slice(0, 20)
        };
        await persistProfile(next, userId ?? null);
        return;
      }

      if (profile.interests.length === 0) return;
      const briefs = await generateNewsBriefs(profile.interests, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: PulseProfile = {
        ...profile,
        newsBriefs: briefs,
        newsUpdatedAt: now,
        updatedAt: now
      };
      await persistProfile(next, userId ?? null);
    }
  });
}
