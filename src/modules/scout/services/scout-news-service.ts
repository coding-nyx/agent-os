import { ScoutNewsBrief } from './scout-knowledge-service';
import { WebSearchService } from '@/lib/services/web-search-service';

/** Returns true when at least one search backend is resolvable. */
export function isSearchAvailable(): boolean {
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY as string | undefined;
  const proxyUrl = import.meta.env.VITE_SCOUT_PROXY_URL as string | undefined;
  const functionsUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  return Boolean(tavilyKey || proxyUrl || functionsUrl || projectId);
}

/**
 * Generates news briefs for the given topics using the configured search backend.
 * Falls back to honest placeholder entries when no backend is available.
 */
export async function generateNewsBriefs(
  topics: string[],
  options: { maxTopics?: number } = {}
): Promise<ScoutNewsBrief[]> {
  if (topics.length === 0) return [];

  const now = new Date().toISOString();
  const selectedTopics = topics.slice(0, options.maxTopics ?? 3);

  if (!isSearchAvailable()) {
    return selectedTopics.map((topic) => ({
      topic,
      summary: 'Search backend not configured — add VITE_TAVILY_API_KEY to enable live briefings.',
      source: undefined,
      updatedAt: now,
      isPlaceholder: true,
    }));
  }

  const results = await Promise.allSettled(
    selectedTopics.map(async (topic): Promise<ScoutNewsBrief> => {
      const response = await WebSearchService.search(`latest news ${topic}`, { maxResults: 2 });
      const top = response.results[0];
      if (!top) {
        return { topic, summary: `No recent results found for "${topic}".`, updatedAt: now, isPlaceholder: true };
      }
      const summary = response.answer
        ?? top.content?.slice(0, 280)
        ?? top.title;
      return {
        topic,
        summary: summary ?? top.title,
        source: top.url,
        updatedAt: now,
        isPlaceholder: false,
      };
    })
  );

  return results.map((result, i): ScoutNewsBrief => {
    if (result.status === 'fulfilled') return result.value;
    return {
      topic: selectedTopics[i],
      summary: 'Failed to retrieve brief. Will retry on next refresh.',
      updatedAt: now,
      isPlaceholder: true,
    };
  });
}
