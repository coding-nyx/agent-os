export type WebSearchResult = {
  title: string;
  url: string;
  content?: string;
  score?: number;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
  answer?: string;
};

function resolveFunctionsBaseUrl(): string {
  const explicit = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, '');
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  if (!projectId) return '';
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

export const WebSearchService = {
  async search(query: string, options?: { maxResults?: number }): Promise<WebSearchResponse> {
    const baseUrl = resolveFunctionsBaseUrl();
    if (!baseUrl) {
      throw new Error('No Scout search backend configured');
    }

    const response = await fetch(`${baseUrl}/scoutWebSearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        maxResults: options?.maxResults ?? 5
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Scout web search failed');
    }

    return response.json() as Promise<WebSearchResponse>;
  }
};
