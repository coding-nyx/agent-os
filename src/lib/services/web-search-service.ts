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

// ---------------------------------------------------------------------------
// Backend resolution — determines which search backend to use.
//
// Priority order:
//   1. Cloud Function via VITE_FUNCTIONS_BASE_URL (explicit override)
//   2. Scout proxy via VITE_SCOUT_PROXY_URL (local dev proxy / Cloudflare Worker)
//   3. Direct Tavily API via VITE_TAVILY_API_KEY (dev-only fallback)
//   4. Cloud Function via VITE_FIREBASE_PROJECT_ID (convention — implicit)
// ---------------------------------------------------------------------------

type Backend =
  | { kind: 'cloud-function'; url: string }
  | { kind: 'proxy'; url: string }
  | { kind: 'tavily-direct'; apiKey: string };

function resolveBackend(): Backend | null {
  // 1. Explicit Cloud Function base URL (user deliberately configured this)
  const explicit = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  if (explicit) {
    return { kind: 'cloud-function', url: `${explicit.replace(/\/$/, '')}/scoutWebSearch` };
  }

  // 2. Scout proxy (e.g. local Cloudflare Worker at localhost:8787)
  //    Checked BEFORE derived Cloud Function — VITE_FIREBASE_PROJECT_ID is
  //    always set for Firebase to work, but that doesn't mean the Cloud Function
  //    is deployed. VITE_SCOUT_PROXY_URL is an explicit signal the user wants proxy.
  const proxyUrl = import.meta.env.VITE_SCOUT_PROXY_URL as string | undefined;
  if (proxyUrl) {
    return { kind: 'proxy', url: proxyUrl.replace(/\/$/, '') };
  }

  // 3. Direct Tavily (dev-only, exposes key in browser)
  const tavilyKey = import.meta.env.VITE_TAVILY_API_KEY as string | undefined;
  if (tavilyKey) {
    return { kind: 'tavily-direct', apiKey: tavilyKey };
  }

  // 4. Derive Cloud Function URL from project ID (implicit fallback)
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  if (projectId) {
    return {
      kind: 'cloud-function',
      url: `https://us-central1-${projectId}.cloudfunctions.net/scoutWebSearch`,
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
  timeoutMs = 15_000,
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
// Per-backend search implementations
// ---------------------------------------------------------------------------

/** Call the Firebase Cloud Function (or explicit URL override). */
async function searchViaCloudFunction(
  url: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Scout Cloud Function error (${response.status}): ${text || response.statusText}`,
    );
  }

  return response.json() as Promise<WebSearchResponse>;
}

/** Call the Scout proxy (same request shape as the Cloud Function). */
async function searchViaProxy(
  proxyBaseUrl: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  // The proxy exposes a /search endpoint that mirrors the Cloud Function contract.
  const url = `${proxyBaseUrl}/search`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Scout proxy error (${response.status}): ${text || response.statusText}`,
    );
  }

  return response.json() as Promise<WebSearchResponse>;
}

/** Call Tavily's public API directly — dev-only fallback. */
let _tavilyKeyWarned = false;

async function searchViaTavily(
  apiKey: string,
  query: string,
  maxResults: number,
): Promise<WebSearchResponse> {
  if (!_tavilyKeyWarned) {
    console.warn(
      '[WebSearchService] Using direct Tavily API call — the API key is visible in browser ' +
        'devtools. This is acceptable for local development but must NOT be used in production. ' +
        'Deploy the scoutWebSearch Cloud Function or configure VITE_SCOUT_PROXY_URL instead.',
    );
    _tavilyKeyWarned = true;
  }

  const response = await fetchWithTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: true,
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

  // Map Tavily's response shape → our canonical WebSearchResponse
  return {
    query,
    results: Array.isArray(data.results)
      ? data.results.map((r: { title?: string; url?: string; content?: string; score?: number }) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          content: r.content,
          score: r.score,
        }))
      : [],
    answer: data.answer ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public service — drop-in compatible, no signature changes
// ---------------------------------------------------------------------------

export const WebSearchService = {
  async search(
    query: string,
    options?: { maxResults?: number },
  ): Promise<WebSearchResponse> {
    const backend = resolveBackend();
    const maxResults = options?.maxResults ?? 5;

    if (!backend) {
      throw new Error(
        'No Scout search backend configured. Set one of the following environment variables:\n' +
          '  • VITE_FUNCTIONS_BASE_URL — explicit Cloud Function base URL\n' +
          '  • VITE_FIREBASE_PROJECT_ID — derives the Cloud Function URL by convention\n' +
          '  • VITE_SCOUT_PROXY_URL — URL of the Scout search proxy\n' +
          '  • VITE_TAVILY_API_KEY — call Tavily directly (dev only)',
      );
    }

    const attempt = async () => {
      switch (backend.kind) {
        case 'cloud-function':
          return searchViaCloudFunction(backend.url, query, maxResults);
        case 'proxy':
          return searchViaProxy(backend.url, query, maxResults);
        case 'tavily-direct':
          return searchViaTavily(backend.apiKey, query, maxResults);
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

    throw lastError ?? new Error('Search failed after retries.');
  },

  /**
   * Batch search — sends multiple queries in a single request to the Cloud Function.
   * Falls back to sequential individual calls when using proxy or direct Tavily.
   * Results are returned in the same order as the input queries.
   */
  async searchBatch(
    queries: string[],
    options?: { maxResults?: number; signal?: AbortSignal },
  ): Promise<WebSearchResponse[]> {
    if (queries.length === 0) return [];

    const backend = resolveBackend();
    const maxResults = options?.maxResults ?? 5;

    if (!backend) {
      throw new Error('No Scout search backend configured for batch search.');
    }

    // Cloud Function supports native batch endpoint
    if (backend.kind === 'cloud-function') {
      const response = await fetchWithTimeout(
        backend.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries, maxResults }),
          signal: options?.signal,
        },
        30_000,
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Scout Cloud Function batch error (${response.status}): ${text}`);
      }

      const data = await response.json();
      const batch = data?.batch as Array<{
        ok: boolean;
        query?: string;
        results?: WebSearchResult[];
        answer?: string;
        error?: string;
      }>;

      if (!Array.isArray(batch)) {
        throw new Error('Unexpected batch response format from Cloud Function.');
      }

      return batch.map((item, i) => {
        if (!item.ok) {
          // Return empty result for failed sub-queries rather than throwing
          console.warn(`[WebSearchService] Batch sub-query ${i} failed: ${item.error}`);
          return { query: queries[i], results: [] };
        }
        return { query: item.query ?? queries[i], results: item.results ?? [], answer: item.answer };
      });
    }

    // Proxy and direct Tavily: fall back to sequential calls
    // (these backends don't implement a batch endpoint)
    const results: WebSearchResponse[] = [];
    for (const query of queries) {
      if (options?.signal?.aborted) {
        throw new DOMException('Batch search aborted', 'AbortError');
      }
      results.push(await WebSearchService.search(query, { maxResults }));
    }
    return results;
  },
};
