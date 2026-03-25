import { Spine } from '@/lib/spine/spine-event-bus';
import { SpineEvent } from '@/lib/types';

/**
 * Atlas WeeklyReviewService
 * Aggregates 7 days of events into structured synthesis paragraphs.
 */

export class WeeklyReviewService {
  /**
   * Generates the Surgical Weekly Review.
   * Fetches events, groups them, and synthesizes into Work, Mental, Physical paragraphs.
   */
  public static async generateReview(events: SpineEvent[]) {
    const last7Days = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp > last7Days);

    const workEvents = recentEvents.filter(e => e.domain === 'C' || e.source.toLowerCase() === 'atlas');
    const mentalEvents = recentEvents.filter(e => e.domain === 'E' || e.source.toLowerCase() === 'agnes');
    const physicalEvents = recentEvents.filter(e => e.domain === 'B' || ['soma', 'titan'].includes(e.source.toLowerCase()));

    return {
      work: this.synthesizeDomain('Work', workEvents),
      mental: this.synthesizeDomain('Mental', mentalEvents),
      physical: this.synthesizeDomain('Physical', physicalEvents),
      goalProjection: this.runGoalProjection(workEvents)
    };
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
