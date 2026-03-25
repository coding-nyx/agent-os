import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';

/**
 * Atlas WeeklyReviewService
 * Aggregates 7 days of events into structured synthesis paragraphs.
 */

export class WeeklyReviewService {
  // ── In-memory cache ────────────────────────────────────────────────────
  private static _cache: {
    result: { work: string; mental: string; physical: string; goalProjection: { confidence: number; forecast: string } };
    lastAggregatedAt: number;
    eventCount: number;
  } | null = null;

  /**
   * Generates the Surgical Weekly Review.
   * Fetches events, groups them, and synthesizes into Work, Mental, Physical paragraphs.
   * Results are cached and only recomputed when new events are available.
   */
  public static async generateReview(events: SpineEvent[], forceRefresh = false) {
    const nowMs = Date.now();
    const last7Days = nowMs - (7 * 24 * 60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp > last7Days);

    // Return cached result if events haven't changed since last aggregation
    if (!forceRefresh && WeeklyReviewService._cache) {
      const newEventsCount = recentEvents.filter(
        e => e.timestamp > WeeklyReviewService._cache!.lastAggregatedAt
      ).length;
      if (newEventsCount === 0) {
        return WeeklyReviewService._cache.result;
      }
    }

    const workEvents = recentEvents.filter(e => e.domain === 'C' || e.source.toLowerCase() === 'atlas');
    const mentalEvents = recentEvents.filter(e => e.domain === 'E' || e.source.toLowerCase() === 'agnes');
    const physicalEvents = recentEvents.filter(e => e.domain === 'B' || ['soma', 'titan'].includes(e.source.toLowerCase()));

    const result = {
      work: this.synthesizeDomain('Work', workEvents),
      mental: this.synthesizeDomain('Mental', mentalEvents),
      physical: this.synthesizeDomain('Physical', physicalEvents),
      goalProjection: this.runGoalProjection(workEvents)
    };

    WeeklyReviewService._cache = { result, lastAggregatedAt: nowMs, eventCount: recentEvents.length };
    return result;
  }

  private static synthesizeDomain(label: string, events: SpineEvent[]): string {
    if (events.length === 0) return `No significant ${label} activity recorded this week.`;
    
    // In a real system, this sends to LLM. 
    // Here we return a deterministic summary of event counts and types.
    const mutationsCount = events.filter(e => (e.data as Record<string, unknown> | undefined)?.mutations).length;
    return `${label} Synthesis: Detected ${events.length} events over 7 days. Applied ${mutationsCount} vector adjustments. Status remains stable.`;
  }

  /**
   * Goal Projection Algorithm
   * Linear regression on task velocity vs. deadline.
   */
  private static runGoalProjection(workEvents: SpineEvent[]) {
    const taskCompletions = workEvents.filter(e =>
      e.type === 'TASK_COMPLETED' || e.type === 'ATLAS_TASK_COMPLETED'
    ).length;
    const velocity = taskCompletions / 7; // Tasks per day

    // Mock projection result
    return {
      confidence: velocity > 0.5 ? 0.85 : 0.4,
      forecast: velocity > 0.5 ? 'On track for Q1 milestones.' : 'High risk of deadline drift.'
    };
  }
}
