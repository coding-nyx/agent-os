import { EmbeddingUtilsJs } from '@cortex-logic';

// Lazy-loaded to keep ~100 kB out of the initial bundle.
// The SDK is only needed when googleEmbedding() is actually called.
let _GoogleGenerativeAI: typeof import('@google/generative-ai').GoogleGenerativeAI | null = null;

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 256;

const _utils = new EmbeddingUtilsJs();

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Kept in TypeScript to preserve hash-function compatibility with embeddings stored in Firestore.
function lexicalFallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  tokens.forEach((token) => {
    const index = hashToken(token) % EMBEDDING_DIMENSION;
    vector[index] += 1;
  });

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function normalizeEmbeddingDimension(values: number[]): number[] {
  const sanitized = values.map((value) => (Number.isFinite(value) ? value : 0));
  if (sanitized.length >= EMBEDDING_DIMENSION) {
    return sanitized.slice(0, EMBEDDING_DIMENSION);
  }
  return sanitized.concat(new Array<number>(EMBEDDING_DIMENSION - sanitized.length).fill(0));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return _utils.cosineSimilarity(JSON.stringify(a), JSON.stringify(b)) as number;
}

export function computeKeywordScore(chunkText: string, queryText: string): number {
  return _utils.computeKeywordScore(chunkText, queryText) as number;
}

async function googleEmbedding(text: string): Promise<number[] | null> {
  const storedKey =
    typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function'
      ? localStorage.getItem('VITE_GOOGLE_API_KEY')
      : null;
  const key = storedKey || import.meta.env.VITE_GOOGLE_API_KEY;
  if (!key) return null;

  try {
    if (!_GoogleGenerativeAI) {
      const mod = await import('@google/generative-ai');
      _GoogleGenerativeAI = mod.GoogleGenerativeAI;
    }
    const genAI = new _GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    const values = result.embedding.values;
    if (!values || values.length === 0) return null;
    return normalizeEmbeddingDimension(values);
  } catch (error) {
    console.warn('[EmbeddingService] Falling back to lexical embedding:', error);
    return null;
  }
}

const embedCache = new Map<string, Promise<number[]>>();
const MAX_CACHE_SIZE = 500;

export const EmbeddingService = {
  embed(text: string): Promise<number[]> {
    const normalized = text.trim();
    if (!normalized) return Promise.resolve(lexicalFallbackEmbedding('empty'));

    // Return cached promise to deduplicate concurrent identical requests
    if (embedCache.has(normalized)) {
      return embedCache.get(normalized)!;
    }

    const EMBED_TIMEOUT_MS = 8_000;
    const promise = (async () => {
      const remote = await Promise.race([
        googleEmbedding(normalized),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('embed timeout')), EMBED_TIMEOUT_MS)
        ),
      ]).catch(() => null); // timeout or API error → fall back immediately
      if (remote && remote.length > 0) return remote;
      return normalizeEmbeddingDimension(lexicalFallbackEmbedding(normalized));
    })();

    // Remove failed/timed-out promises from cache to allow retrying
    promise.catch(() => embedCache.delete(normalized));

    embedCache.set(normalized, promise);

    // Prevent memory leaks in long sessions
    if (embedCache.size > MAX_CACHE_SIZE) {
      const firstKey = embedCache.keys().next().value;
      if (firstKey !== undefined) {
        embedCache.delete(firstKey);
      }
    }

    return promise;
  }
};
