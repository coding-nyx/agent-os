import { ScoutNewsBrief } from './scout-knowledge-service';

/**
 * Generates news briefs for the given topics.
 *
 * When a live search proxy is configured (VITE_SCOUT_SEARCH_API_KEY), future
 * implementations should call the search API here. For now we return honest
 * placeholder entries instead of fabricating fake summaries.
 */
export async function generateNewsBriefs(
  topics: string[],
  options: { maxTopics?: number } = {}
): Promise<ScoutNewsBrief[]> {
  if (topics.length === 0) return [];

  const now = new Date().toISOString();
  const selectedTopics = topics.slice(0, options.maxTopics ?? 3);

  const hasSearchKey = Boolean(import.meta.env.VITE_SCOUT_SEARCH_API_KEY);

  if (hasSearchKey) {
    // TODO: call live search API when VITE_SCOUT_SEARCH_API_KEY is present.
    // Fall through to placeholder for now.
  }

  return selectedTopics.map((topic) => ({
    topic,
    summary:
      'Search proxy not configured — add VITE_SCOUT_SEARCH_API_KEY to enable live briefings.',
    source: undefined,
    updatedAt: now,
    isPlaceholder: true,
  }));
}
