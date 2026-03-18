export type WebCrawlerResult = {
  title: string;
  url: string;
  content?: string;
  score?: number;
};

export type WebCrawlerResponse = {
  query: string;
  results: WebCrawlerResult[];
  images?: string[];
  answer?: string;
};

// ---------------------------------------------------------------------------
// Backend resolution — determines which search backend to use.
// ---------------------------------------------------------------------------

type Backend =
  | { kind: 'cloud-function'; url: string }
  | { kind: 'proxy'; url: string }
  | { kind: 'tavily-direct'; apiKey: string };

function resolveBackend(): Backend | null {
  const explicit = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  if (explicit) {
    return { kind: 'cloud-function', url: `${explicit.replace(/\/$/, '')}/webCrawler` };
  }

  const proxyUrl = import.meta.env.VITE_WEB_CRAWLER_PROXY_URL as string | undefined;
  if (proxyUrl) {
    return { kind: 'proxy', url: proxyUrl.replace(/\/$/, '') };
  }

  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY as string | undefined;
  if (tavilyKey) {
    return { kind: 'tavily-direct', apiKey: tavilyKey };
  }

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  if (projectId) {
    return {
      kind: 'cloud-function',
      url: `https://us-central1-${projectId}.cloudfunctions.net/webCrawler`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared fetch helper with timeout + abort
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Context Compaction — aggressively truncate content to protect LLM context
// ---------------------------------------------------------------------------

function compactResults(results: WebCrawlerResult[]): WebCrawlerResult[] {
  return results.map(r => ({
    ...r,
    content: r.content ? r.content.slice(0, 1000) : undefined // Truncate to 1000 chars
  }));
}

// ---------------------------------------------------------------------------
// Per-backend search implementations
// ---------------------------------------------------------------------------

async function searchViaCloudFunction(
  url: string,
  query: string,
  maxResults: number,
  includeImages: boolean
): Promise<WebCrawlerResponse> {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults, includeImages }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Web Crawler Cloud Function error (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = await response.json();
  return {
    ...data,
    results: compactResults(data.results || [])
  };
}

async function searchViaProxy(
  proxyBaseUrl: string,
  query: string,
  maxResults: number,
  includeImages: boolean
): Promise<WebCrawlerResponse> {
  const url = `${proxyBaseUrl}/search`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults, includeImages }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Web Crawler proxy error (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = await response.json();
  return {
    ...data,
    results: compactResults(data.results || [])
  };
}

async function searchViaTavily(
  apiKey: string,
  query: string,
  maxResults: number,
  includeImages: boolean
): Promise<WebCrawlerResponse> {
  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
      include_images: includeImages,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Tavily API error (${response.status}): ${text || response.statusText}`,
    );
  }

  const data = await response.json();

  return {
    query,
    results: compactResults(Array.isArray(data.results)
      ? data.results.map((r: any) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          content: r.content,
          score: r.score,
        }))
      : []),
    images: data.images,
    answer: data.answer ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

export const WebCrawlerService = {
  async search(
    query: string,
    options?: { maxResults?: number; includeImages?: boolean },
  ): Promise<WebCrawlerResponse> {
    const backend = resolveBackend();
    const maxResults = options?.maxResults ?? 5;
    const includeImages = options?.includeImages !== false;

    if (!backend) {
      throw new Error('No Web Crawler backend configured.');
    }

    const attempt = async () => {
      switch (backend.kind) {
        case 'cloud-function':
          return searchViaCloudFunction(backend.url, query, maxResults, includeImages);
        case 'proxy':
          return searchViaProxy(backend.url, query, maxResults, includeImages);
        case 'tavily-direct':
          return searchViaTavily(backend.apiKey, query, maxResults, includeImages);
      }
    };

    const maxRetries = 2;
    let lastError: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i === maxRetries) break;
        const delay = 400 * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error('Web Crawler search failed after retries.');
  },

  async searchBatch(
    queries: string[],
    options?: { maxResults?: number; includeImages?: boolean; signal?: AbortSignal },
  ): Promise<WebCrawlerResponse[]> {
    if (queries.length === 0) return [];

    const backend = resolveBackend();
    const maxResults = options?.maxResults ?? 5;
    const includeImages = options?.includeImages !== false;

    if (!backend) {
      throw new Error('No Web Crawler backend configured for batch search.');
    }

    if (backend.kind === 'cloud-function') {
      const response = await fetchWithTimeout(
        backend.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries, maxResults, includeImages }),
          signal: options?.signal,
        },
        60_000,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Web Crawler Cloud Function batch error (${response.status}): ${text}`);
      }

      const data = await response.json();
      const batch = data?.batch as Array<any>;

      if (!Array.isArray(batch)) {
        throw new Error('Unexpected batch response format from Web Crawler.');
      }

      return batch.map((item, i) => {
        if (!item.ok) {
          console.warn(`[WebCrawlerService] Batch sub-query ${i} failed: ${item.error}`);
          return { query: queries[i], results: [] };
        }
        return {
          query: item.query ?? queries[i],
          results: compactResults(item.results || []),
          images: item.images,
          answer: item.answer
        };
      });
    }

    const results: WebCrawlerResponse[] = [];
    for (const query of queries) {
      if (options?.signal?.aborted) {
        throw new DOMException('Batch search aborted', 'AbortError');
      }
      results.push(await WebCrawlerService.search(query, { maxResults, includeImages }));
    }
    return results;
  },
};
