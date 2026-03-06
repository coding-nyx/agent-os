import { WebSearchService } from '@/lib/services/web-search-service';
import { InterestNode, PulseNewsBrief } from './pulse-profile-service';

const DEFAULT_MAX_TOPICS = 5;

export async function generateNewsBriefs(interests: InterestNode[], options?: { maxTopics?: number }): Promise<PulseNewsBrief[]> {
  const now = new Date().toISOString();
  const topics = [...interests]
    .sort((a, b) => b.score - a.score)
    .slice(0, options?.maxTopics ?? DEFAULT_MAX_TOPICS);

  const briefs: PulseNewsBrief[] = [];

  for (const topic of topics) {
    const query = `${topic.topic} latest trends`;
    try {
      const result = await WebSearchService.search(query, { maxResults: 3 });
      const primary = result.results?.[0];
      const summary = result.answer || primary?.content || primary?.title || '';
      if (!summary) continue;

      briefs.push({
        topic: topic.topic,
        summary,
        source: primary?.url,
        updatedAt: now
      });
    } catch (error) {
      console.warn('Pulse news fetch failed for topic:', topic.topic, error);
    }
  }

  return briefs;
}
