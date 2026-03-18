import { onRequest, type Request } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";

const tavilySecret = defineSecret("TAVILY_API_KEY");

/** Single Tavily query — reusable by both the single-query and batch paths. */
async function tavilySearch(
  tavilyKey: string,
  query: string,
  maxResults: number,
  includeImages: boolean = true
): Promise<{ query: string; results: unknown[]; images?: string[]; answer?: string }> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query,
      max_results: maxResults,
      include_answer: true,
      include_images: includeImages,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tavily error (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json();
  return {
    query,
    results: Array.isArray(data?.results) ? data.results : [],
    images: Array.isArray(data?.images) ? data.images : [],
    answer: data?.answer,
  };
}

export const webCrawler = onRequest({ cors: true, secrets: [tavilySecret] }, async (req: Request, res: Response) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const tavilyKey = tavilySecret.value();
  if (!tavilyKey) {
    res.status(500).json({ error: "Tavily API key not configured" });
    return;
  }

  const includeImages = req.body?.includeImages !== false;

  // ── Batch path: { queries: string[], maxResults?: number } ───────────────
  const queriesRaw = req.body?.queries;
  if (Array.isArray(queriesRaw)) {
    const maxResults = typeof req.body?.maxResults === "number" ? Math.max(1, Math.min(10, req.body.maxResults)) : 5;
    const queries: string[] = queriesRaw
      .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      .slice(0, 10); // cap at 10 sub-queries per batch

    if (queries.length === 0) {
      res.status(400).json({ error: "queries array is empty or contains no valid strings" });
      return;
    }

    try {
      const results = await Promise.allSettled(
        queries.map((q) => tavilySearch(tavilyKey, q, maxResults, includeImages)),
      );
      res.status(200).json({
        batch: results.map((r) =>
          r.status === "fulfilled"
            ? { ok: true, ...r.value }
            : { ok: false, error: r.reason?.message ?? "Search failed" },
        ),
      });
    } catch (error) {
      logger.error("Web crawler batch search failure", error);
      res.status(500).json({ error: "Batch search failed" });
    }
    return;
  }

  // ── Single query path: { query: string, maxResults?: number } ──
  const query = typeof req.body?.query === "string" ? req.body.query : "";
  const maxResults = typeof req.body?.maxResults === "number" ? Math.max(1, Math.min(10, req.body.maxResults)) : 5;

  if (!query.trim()) {
    res.status(400).json({ error: "Missing query or queries" });
    return;
  }

  try {
    const result = await tavilySearch(tavilyKey, query, maxResults, includeImages);
    res.status(200).json(result);
  } catch (error) {
    logger.error("Web crawler search failure", error);
    res.status(500).json({ error: "Search failed" });
  }
});
